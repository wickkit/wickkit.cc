// A small Raft (leader election + log replication) inside a deterministic
// simulator: seeded RNG, one event queue, a network that delays, drops,
// duplicates, reorders and partitions, and nodes that crash and restart.
// Safety invariants are checked after every event.
// `bugs` is a set of named deliberate mistakes, for mutation testing.
// Runs in the browser (window.KitRaft) and under node (module.exports).
(function (root) {
  "use strict";

  function rng(seed) {
    // mulberry32
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = (xs) => xs[Math.floor(next() * xs.length)];
    return next;
  }

  const ELECTION_MIN = 150, ELECTION_MAX = 300, HEARTBEAT = 50;

  const DEFAULT_FAULTS = {
    delayMin: 2, delayMax: 30, // per-message latency; spread = reordering
    drop: 0.05, dup: 0.03,
    slow: 0, slowMax: 1000, // chance a message gets stuck for up to slowMax ms
    crashEvery: 400, // mean ms between crash/partition events (0 = never)
    downMin: 50, downMax: 600,
    partitionChance: 0.4, // share of fault events that partition instead of crash
    leaderBias: 0, // chance a crash targets the current leader
    clientEvery: 40, // mean ms between client commands
    pause: 0, pauseLen: 600, // chance after each command that clients go quiet for ~pauseLen ms
  };

  class Violation extends Error {}

  function createSim(opts = {}) {
    const n = opts.n || 5;
    const R = rng(opts.seed == null ? 1 : opts.seed);
    const bugs = new Set(opts.bugs || []);
    const F = Object.assign({}, DEFAULT_FAULTS, opts.faults || {});
    const majority = Math.floor(n / 2) + 1;

    let now = 0, seq = 0, cmdSeq = 0;
    const queue = []; // binary heap of {t, seq, fn}
    const trace = [];
    const log = (msg) => { trace.push(`${now.toFixed(0).padStart(6)} ${msg}`); if (trace.length > 400) trace.shift(); };

    function schedule(dt, fn) {
      const ev = { t: now + dt, seq: seq++, fn };
      queue.push(ev);
      let i = queue.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (less(queue[p], queue[i])) break;
        [queue[p], queue[i]] = [queue[i], queue[p]];
        i = p;
      }
      return ev;
    }
    function less(a, b) { return a.t < b.t || (a.t === b.t && a.seq < b.seq); }
    function pop() {
      const top = queue[0], last = queue.pop();
      if (queue.length) {
        queue[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < queue.length && less(queue[l], queue[m])) m = l;
          if (r < queue.length && less(queue[r], queue[m])) m = r;
          if (m === i) break;
          [queue[m], queue[i]] = [queue[i], queue[m]];
          i = m;
        }
      }
      return top;
    }

    // ---------- network ----------
    const cut = new Set(); // "a>b" pairs that can't talk
    const watch = !!opts.watch, inflight = new Set(); // in-flight messages, for drawing
    const stats = { sent: 0, dropped: 0, delivered: 0, elections: 0, crashes: 0, partitions: 0, committed: 0, submitted: 0, oldTermCommits: 0, oldTermClashes: 0 };

    function send(from, to, msg) {
      stats.sent++;
      if (R() < F.drop) { stats.dropped++; return; }
      const copies = R() < F.dup ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        const m = JSON.parse(JSON.stringify(msg)); // no shared references
        const delay = R() < F.slow ? R.int(F.delayMax, F.slowMax) : R.int(F.delayMin, F.delayMax);
        const fly = watch ? { from, to, type: msg.type, t0: now, t1: now + delay, ok: msg.granted !== false && msg.success !== false } : null;
        if (fly) inflight.add(fly);
        schedule(delay, () => {
          if (fly) inflight.delete(fly);
          // checked at delivery so a partition also catches in-flight messages
          if (cut.has(`${from}>${to}`) || !nodes[to].up) { stats.dropped++; return; }
          stats.delivered++;
          nodes[to].receive(from, m);
        });
      }
    }

    // ---------- the global record the checker uses ----------
    const leaders = new Map(); // term -> node id
    const committed = []; // index -> {term, cmd}, as declared by leaders
    const applied = []; // index -> cmd, first node to apply it wins
    let violation = null;

    function fail(kind, detail) {
      violation = { kind, detail, time: now };
      log(`VIOLATION ${kind}: ${detail}`);
      throw new Violation(`${kind}: ${detail}`);
    }

    // Stricter oracle: right after entries commit, no node that could still win an
    // election may be missing them. Catches the danger before it does damage.
    const strict = !!opts.strict;
    function checkElectable(from, to) {
      const key = (x) => [x.lastTerm(), x.lastIndex()];
      const atLeast = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
      for (const m of nodes) {
        const mk = key(m);
        const voters = nodes.filter((o) => atLeast(mk, key(o))).length; // includes m itself
        if (voters < majority) continue;
        for (let i = from; i <= to; i++) {
          const e = m.log[i];
          if (!e || e.term !== committed[i].term || e.cmd !== committed[i].cmd)
            fail("electable node lacks committed entry", `n${m.id} could still win an election but lacks committed entry ${i} (${committed[i].cmd})`);
        }
      }
    }

    // ---------- node ----------
    class Node {
      constructor(id) {
        this.id = id;
        // persistent
        this.term = 0;
        this.votedFor = null;
        this.log = [{ term: 0, cmd: null }]; // log[0] is a sentinel
        this.up = true;
        this.boot();
      }
      boot() {
        // volatile state, reset on every (re)start
        this.state = "follower";
        this.commitIndex = 0;
        this.lastApplied = 0;
        this.votes = new Set();
        this.nextIndex = [];
        this.matchIndex = [];
        this.timer = null;
        this.hbTimer = null;
        this.resetElectionTimer();
      }
      lastIndex() { return this.log.length - 1; }
      lastTerm() { return this.log[this.lastIndex()].term; }

      resetElectionTimer() {
        if (this.timer) this.timer.dead = true;
        const ev = schedule(R.int(ELECTION_MIN, ELECTION_MAX), () => { if (!ev.dead && this.up) this.startElection(); });
        this.timer = ev;
      }

      becomeFollower(term) {
        if (term > this.term) { this.term = term; this.votedFor = null; }
        if (this.state !== "follower") log(`n${this.id} steps down (term ${this.term})`);
        const wasLeader = this.state === "leader";
        this.state = "follower";
        if (this.hbTimer) this.hbTimer.dead = true;
        if (wasLeader) this.resetElectionTimer();
      }

      startElection() {
        this.state = "candidate";
        this.term++;
        this.votedFor = this.id;
        this.votes = new Set([this.id]);
        stats.elections++;
        log(`n${this.id} starts election for term ${this.term}`);
        this.resetElectionTimer();
        for (let p = 0; p < n; p++) if (p !== this.id) {
          send(this.id, p, { type: "vote", term: this.term, cand: this.id, lastIndex: this.lastIndex(), lastTerm: this.lastTerm() });
        }
        this.maybeWin();
      }

      maybeWin() {
        if (this.state === "candidate" && this.votes.size >= majority) this.becomeLeader();
      }

      becomeLeader() {
        this.state = "leader";
        log(`n${this.id} becomes leader for term ${this.term}`);
        const prev = leaders.get(this.term);
        if (prev !== undefined && prev !== this.id) fail("election safety", `n${prev} and n${this.id} both lead term ${this.term}`);
        leaders.set(this.term, this.id);
        for (let i = 1; i < committed.length; i++) {
          const e = this.log[i];
          if (!e || e.term !== committed[i].term || e.cmd !== committed[i].cmd)
            fail("leader completeness", `new leader n${this.id} (term ${this.term}) lacks committed entry ${i} (${committed[i].cmd})`);
        }
        this.nextIndex = Array(n).fill(this.lastIndex() + 1);
        this.matchIndex = Array(n).fill(0);
        this.matchIndex[this.id] = this.lastIndex();
        if (this.timer) this.timer.dead = true;
        this.heartbeat();
      }

      heartbeat() {
        if (this.state !== "leader" || !this.up) return;
        for (let p = 0; p < n; p++) if (p !== this.id) this.replicate(p);
        const ev = schedule(HEARTBEAT, () => { if (!ev.dead) this.heartbeat(); });
        this.hbTimer = ev;
      }

      replicate(p) {
        const prev = this.nextIndex[p] - 1;
        send(this.id, p, {
          type: "append", term: this.term, leader: this.id,
          prevIndex: prev, prevTerm: this.log[prev].term,
          entries: this.log.slice(prev + 1, prev + 1 + 64),
          leaderCommit: this.commitIndex,
        });
      }

      submit(cmd) {
        if (this.state !== "leader") return false;
        this.log.push({ term: this.term, cmd });
        this.matchIndex[this.id] = this.lastIndex();
        this.advanceCommit();
        return true;
      }

      receive(from, m) {
        if (m.term > this.term) {
          if (!(bugs.has("ignore-higher-term-reply") && (m.type === "voteReply" || m.type === "appendReply")))
            this.becomeFollower(m.term);
        }
        this[m.type](from, m);
        this.checkLocal();
      }

      vote(from, m) {
        const upToDate = m.lastTerm > this.lastTerm() || (m.lastTerm === this.lastTerm() && m.lastIndex >= this.lastIndex());
        let grant = m.term === this.term && (upToDate || bugs.has("no-up-to-date-check"));
        if (!bugs.has("vote-twice") && this.votedFor !== null && this.votedFor !== m.cand) grant = false;
        if (grant) {
          this.votedFor = m.cand;
          this.resetElectionTimer();
        }
        send(this.id, from, { type: "voteReply", term: this.term, granted: grant });
      }

      voteReply(from, m) {
        if (this.state !== "candidate") return;
        if (m.term !== this.term && !bugs.has("count-stale-votes")) return;
        if (m.granted) { this.votes.add(from); this.maybeWin(); }
      }

      append(from, m) {
        if (m.term < this.term) {
          send(this.id, from, { type: "appendReply", term: this.term, success: false, match: 0, sentNext: m.prevIndex + 1 });
          return;
        }
        if (this.state !== "follower") this.becomeFollower(m.term);
        this.resetElectionTimer();
        const prevOk = m.prevIndex <= this.lastIndex() && (bugs.has("skip-prev-term-check") || this.log[m.prevIndex].term === m.prevTerm);
        if (!prevOk) {
          // hint: skip the whole conflicting term in one round trip, not one entry at a time
          let hint = this.lastIndex() + 1;
          if (m.prevIndex <= this.lastIndex()) {
            const t = this.log[m.prevIndex].term;
            hint = m.prevIndex;
            while (hint > 1 && this.log[hint - 1].term === t) hint--;
          }
          send(this.id, from, { type: "appendReply", term: this.term, success: false, match: 0, sentNext: m.prevIndex + 1, hint });
          return;
        }
        let idx = m.prevIndex;
        if (bugs.has("truncate-always")) {
          // classic mistake: replace everything after prevIndex, even entries that already match.
          // A stale, reordered AppendEntries then deletes newer entries.
          this.log.length = m.prevIndex + 1;
          for (const e of m.entries) this.log.push(e);
          idx = this.lastIndex();
        } else {
          for (const e of m.entries) {
            idx++;
            if (idx <= this.lastIndex() && this.log[idx].term !== e.term) this.log.length = idx; // conflict: cut the tail
            if (idx > this.lastIndex()) this.log.push(e);
          }
        }
        const lastNew = m.prevIndex + m.entries.length;
        if (m.leaderCommit > this.commitIndex) {
          this.commitIndex = bugs.has("commit-past-new-entries") ? Math.min(m.leaderCommit, this.lastIndex()) : Math.min(m.leaderCommit, lastNew);
          this.apply();
        }
        send(this.id, from, { type: "appendReply", term: this.term, success: true, match: lastNew, sentNext: m.prevIndex + 1 });
      }

      appendReply(from, m) {
        if (this.state !== "leader" || m.term !== this.term) return;
        if (m.success) {
          if (bugs.has("match-from-next")) {
            // trusts the leader's current view rather than what the reply acknowledges
            this.matchIndex[from] = this.lastIndex();
            this.nextIndex[from] = this.lastIndex() + 1;
          } else if (m.match > this.matchIndex[from]) {
            this.matchIndex[from] = m.match;
            this.nextIndex[from] = m.match + 1;
            if (this.nextIndex[from] <= this.lastIndex()) this.replicate(from); // still behind: keep streaming
          }
          this.advanceCommit();
        } else if (m.sentNext === this.nextIndex[from]) {
          // only back off in response to the probe we're currently on; ignore stale/duplicate failures
          this.nextIndex[from] = Math.max(1, m.hint !== undefined ? m.hint : this.nextIndex[from] - 1);
          this.replicate(from);
        }
      }

      advanceCommit() {
        for (let N = this.lastIndex(); N > this.commitIndex; N--) {
          if (this.log[N].term !== this.term && !bugs.has("commit-old-terms")) break;
          const count = this.matchIndex.filter((x, i) => i === this.id ? this.lastIndex() >= N : x >= N).length;
          if (count >= majority) {
            if (this.log[N].term !== this.term) {
              // only reachable with commit-old-terms. Count how often it fires, and how often
              // some other node holds a different entry in that range: the dangerous case.
              stats.oldTermCommits++;
              const clash = nodes.some((o) => { for (let i = this.commitIndex + 1; i <= N; i++) if (o.log[i] && o.log[i].term !== this.log[i].term) return true; return false; });
              if (clash) stats.oldTermClashes++;
            }
            for (let i = this.commitIndex + 1; i <= N; i++) {
              const e = this.log[i];
              if (committed[i]) {
                if (committed[i].term !== e.term || committed[i].cmd !== e.cmd)
                  fail("state machine safety", `index ${i} committed as ${committed[i].cmd} and later as ${e.cmd}`);
              } else { committed[i] = { term: e.term, cmd: e.cmd }; stats.committed++; }
            }
            if (strict) checkElectable(this.commitIndex + 1, N);
            this.commitIndex = N;
            this.apply();
            break;
          }
        }
      }

      apply() {
        while (this.lastApplied < this.commitIndex) {
          const i = ++this.lastApplied;
          const cmd = this.log[i].cmd;
          if (i < applied.length && applied[i] !== undefined) {
            if (applied[i] !== cmd) fail("state machine safety", `n${this.id} applies ${cmd} at index ${i}, another node applied ${applied[i]}`);
          } else applied[i] = cmd;
        }
      }

      checkLocal() {
        // log matching: same index and term => identical prefix (spot check against every other node)
        for (const o of nodes) {
          if (o === this) continue;
          const top = Math.min(this.lastIndex(), o.lastIndex());
          for (let i = top; i >= 1; i--) {
            if (this.log[i].term === o.log[i].term) {
              for (let j = i; j >= 1; j--) {
                if (this.log[j].term !== o.log[j].term || this.log[j].cmd !== o.log[j].cmd)
                  fail("log matching", `n${this.id} and n${o.id} agree at ${i} (term ${this.log[i].term}) but differ at ${j}`);
              }
              break;
            }
          }
        }
      }

      crash() {
        this.up = false;
        if (this.timer) this.timer.dead = true;
        if (this.hbTimer) this.hbTimer.dead = true;
        if (bugs.has("forget-vote")) this.votedFor = null; // votedFor not persisted
        log(`n${this.id} crashes`);
      }
      restart() {
        this.up = true;
        log(`n${this.id} restarts (term ${this.term}, log ${this.lastIndex()})`);
        this.boot();
      }
    }

    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push(new Node(i));

    // ---------- chaos ----------
    let chaosOn = F.crashEvery > 0;
    function exp(mean) { return -Math.log(1 - R()) * mean; }

    function chaos() {
      if (!chaosOn) return;
      if (R() < F.partitionChance) {
        // split into two random groups (or isolate one node) for a while
        const side = nodes.map(() => R() < 0.5);
        const pairs = [];
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (side[a] !== side[b]) pairs.push(`${a}>${b}`);
        pairs.forEach((p) => cut.add(p));
        stats.partitions++;
        log(`partition {${nodes.filter((_, i) => side[i]).map((x) => "n" + x.id)}} | {${nodes.filter((_, i) => !side[i]).map((x) => "n" + x.id)}}`);
        schedule(R.int(F.downMin, F.downMax), () => { pairs.forEach((p) => cut.delete(p)); log("partition heals"); });
      } else {
        const lead = nodes.find((x) => x.up && x.state === "leader");
        const victim = lead && R() < F.leaderBias ? lead : R.pick(nodes);
        if (victim.up) {
          victim.crash();
          stats.crashes++;
          schedule(R.int(F.downMin, F.downMax), () => victim.restart());
        }
      }
      schedule(exp(F.crashEvery), chaos);
    }
    if (chaosOn) schedule(exp(F.crashEvery), chaos);

    function client() {
      const cmd = `c${++cmdSeq}`;
      const leader = nodes.find((x) => x.up && x.state === "leader");
      if (leader && leader.submit(cmd)) stats.submitted++;
      schedule(R() < F.pause ? exp(F.pauseLen) : exp(F.clientEvery), client);
    }
    if (F.clientEvery > 0) schedule(exp(F.clientEvery), client);

    function step() {
      if (!queue.length) return false;
      const ev = pop();
      now = ev.t;
      if (!ev.dead) ev.fn();
      return true;
    }

    function run(until) {
      try {
        while (queue.length && queue[0].t <= until) step();
        now = until;
      } catch (e) {
        if (!(e instanceof Violation)) throw e;
      }
      return violation;
    }

    // stop injecting faults, heal everything, and see whether the cluster commits again
    function calm() {
      chaosOn = false;
      F.slow = 0;
      cut.clear();
      for (const x of nodes) if (!x.up) x.restart();
    }

    return {
      nodes, stats, trace, run, step, calm, inflight,
      get now() { return now; },
      get violation() { return violation; },
      get committed() { return Math.max(0, committed.length - 1); },
      get leader() { return nodes.find((x) => x.up && x.state === "leader") || null; },
      isCut: (a, b) => cut.has(`${a}>${b}`),
      partition(groups) { // groups: array of arrays of node ids
        const g = new Map();
        groups.forEach((ids, k) => ids.forEach((id) => g.set(id, k)));
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (g.get(a) !== g.get(b)) cut.add(`${a}>${b}`);
      },
      heal() { cut.clear(); },
      hasCommitted: (cmd) => committed.some((e) => e && e.cmd === cmd),
      submit(cmd) { const l = this.leader; return l ? l.submit(cmd || `c${++cmdSeq}`) : false; },
    };
  }

  const BUGS = {
    "vote-twice": "A node can grant its vote to two candidates in the same term.",
    "no-up-to-date-check": "Votes go to candidates whose log is behind the voter's.",
    "commit-old-terms": "A leader counts replicas for entries from earlier terms (the Figure 8 mistake).",
    "forget-vote": "votedFor isn't saved, so a restarted node can vote again in the same term.",
    "truncate-always": "Followers drop everything after prevIndex on each AppendEntries, even matching entries.",
    "commit-past-new-entries": "Followers set commitIndex = min(leaderCommit, last log index), not last new entry.",
    "skip-prev-term-check": "Followers check that prevIndex exists but not that its term matches.",
    "match-from-next": "Leader sets matchIndex from its own log length on success, not from what the reply acknowledges.",
    "ignore-higher-term-reply": "Leaders/candidates don't step down when a reply carries a higher term.",
    "count-stale-votes": "Candidates count vote replies from older terms.",
  };

  // The Raft paper's Figure 8 as a script, for a 5-node sim with quiet faults.
  // Each step: what happens, an action, then how long to let the sim run.
  const FIGURE8_FAULTS = { crashEvery: 0, clientEvery: 0, drop: 0, dup: 0, delayMin: 8, delayMax: 16 };
  function figure8(sim) {
    const N = sim.nodes;
    const win = (x) => {
      for (let k = 0; k < 20 && x.state !== "leader"; k++) { x.startElection(); sim.run(sim.now + 60); }
      if (x.state !== "leader") throw new Error(`n${x.id} never won`);
    };
    return [
      { say: 'n0 wins term 1 and copies "a" to every node.',
        act: () => { win(N[0]); sim.submit("a"); }, wait: 150 },
      { say: 'The network splits {n0, n1} | {n2, n3, n4}. n0 appends "b", and only n1 gets it.',
        act: () => { sim.partition([[0, 1], [2, 3, 4]]); sim.submit("b"); }, wait: 120 },
      { say: 'n0 crashes. n4 wins term 2 with votes from n2 and n3, appends "c", and crashes before sending it.',
        act: () => { N[0].crash(); win(N[4]); sim.submit("c"); N[4].crash(); }, wait: 80 },
      { say: 'The network heals. n0 restarts, wins term 3, and copies "b" to n2 and n3. "b" is now on a majority. Is it committed?',
        act: () => { sim.heal(); N[0].restart(); win(N[0]); }, wait: 200 },
      { say: 'n0 crashes. n4 restarts and wins term 4: its last entry is from term 2, newer than "b" (term 1), so the others vote for it. It overwrites index 2 with "c".',
        act: () => { N[0].crash(); N[4].restart(); win(N[4]); }, wait: 250 },
    ];
  }

  const api = { createSim, rng, BUGS, DEFAULT_FAULTS, figure8, FIGURE8_FAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitRaft = api;
})(this);
