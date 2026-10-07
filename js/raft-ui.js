// Interactive part of the Raft post. Needs raft.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const K = window.KitRaft;
  const root = $("rf");
  if (!root || !K) return;

  // narrow screens get a smaller viewBox, so the same ring draws bigger
  const narrow = root.clientWidth < 480;
  const N = 5, W = narrow ? 340 : 600, H = narrow ? 270 : 290, CX = W / 2, CY = H / 2 - 4;
  const RING = narrow ? 100 : 108, STRETCH = narrow ? 1.35 : 1.45, NODE_R = 26;
  const pos = [];
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    pos.push([CX + RING * STRETCH * Math.cos(a), CY + RING * Math.sin(a)]);
  }
  const LOG_SHOW = 24;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // stable colour per term, cycling through a few hues
  const termHue = (t) => (t * 67) % 360;
  const termFill = (t) => `hsl(${termHue(t)} 55% 52%)`;

  let sim, seed = 1, playing = false, last = 0, speed = 0.05, chaos = true, ffw = false;
  let script = null; // Figure 8 replay: {steps, i, until}
  let replayed = false; // the current sim is a Figure 8 replay (Play/Fast-forward start fresh)

  const svg = $("rf-ring");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const gLinks = el("g", {}, svg), gMsgs = el("g", {}, svg), gNodes = el("g", {}, svg);
  const links = [], nodesUI = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    links.push({ a, b, line: el("line", { x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], class: "rf-link" }, gLinks) });
  }
  for (let i = 0; i < N; i++) {
    const g = el("g", { class: "rf-node", tabindex: 0, role: "button", "aria-label": `node ${i}: click to crash or restart` }, gNodes);
    const c = el("circle", { cx: pos[i][0], cy: pos[i][1], r: NODE_R }, g);
    const t = el("text", { x: pos[i][0], y: pos[i][1] - 3, "text-anchor": "middle", class: "rf-id" }, g);
    const s = el("text", { x: pos[i][0], y: pos[i][1] + 12, "text-anchor": "middle", class: "rf-term" }, g);
    const timer = el("circle", { cx: pos[i][0], cy: pos[i][1], r: NODE_R + 5, class: "rf-timer", pathLength: 100 }, g);
    t.textContent = `n${i}`;
    const toggle = () => { const x = sim.nodes[i]; x.up ? x.crash() : x.restart(); draw(); };
    g.addEventListener("click", toggle);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    nodesUI.push({ g, c, s, timer });
  }

  // logs: one row per node
  const logs = $("rf-logs");
  const rows = [];
  for (let i = 0; i < N; i++) {
    const row = document.createElement("div");
    row.className = "rf-row";
    const lab = document.createElement("span");
    lab.className = "rf-row-id";
    lab.textContent = `n${i}`;
    const cells = document.createElement("span");
    cells.className = "rf-cells";
    row.append(lab, cells);
    logs.appendChild(row);
    rows.push(cells);
  }

  const bugs = () => ($("rf-bug").value ? [$("rf-bug").value] : []);
  const strict = () => $("rf-strict").checked;
  function reset() {
    script = null;
    replayed = false;
    sim = K.createSim({
      n: N, seed, watch: true, bugs: bugs(), strict: strict(),
      faults: chaos ? {} : { crashEvery: 0 },
    });
    describe();
    $("rf-seed").textContent = `seed ${seed}`;
    $("rf-alert").textContent = "";
    root.classList.remove("rf-broken");
    draw();
  }

  function draw() {
    const now = sim.now;
    for (const l of links) l.line.classList.toggle("cut", sim.isCut(l.a, l.b));
    for (let i = 0; i < N; i++) {
      const x = sim.nodes[i], u = nodesUI[i];
      u.g.setAttribute("class", `rf-node ${x.up ? x.state : "down"}`);
      u.s.textContent = x.up ? `term ${x.term}` : "down";
      // election timer ring: how close a follower/candidate is to starting an election
      const tm = x.timer;
      let frac = 0;
      if (x.up && x.state !== "leader" && tm && !tm.dead) frac = Math.max(0, Math.min(1, (tm.t - now) / 300));
      u.timer.setAttribute("stroke-dasharray", `${(frac * 100).toFixed(1)} 100`);
    }
    gMsgs.textContent = "";
    for (const m of sim.inflight) {
      const f = Math.max(0, Math.min(1, (now - m.t0) / (m.t1 - m.t0 || 1)));
      const [x1, y1] = pos[m.from], [x2, y2] = pos[m.to];
      const kind = m.type === "vote" || m.type === "voteReply" ? "v" : "a";
      const reply = m.type.endsWith("Reply");
      el("circle", {
        cx: x1 + (x2 - x1) * f, cy: y1 + (y2 - y1) * f, r: reply ? 3 : 4.5,
        class: `rf-msg ${kind}${reply ? " reply" : ""}${m.ok ? "" : " no"}`,
      }, gMsgs);
    }
    // logs, aligned on the same window of indexes for every row
    const top = Math.max(...sim.nodes.map((x) => x.lastIndex()));
    const from = Math.max(1, top - LOG_SHOW + 1);
    for (let i = 0; i < N; i++) {
      const x = sim.nodes[i], cells = rows[i];
      let html = "";
      for (let k = from; k < from + LOG_SHOW; k++) {
        const e = x.log[k];
        if (!e) { html += `<i class="empty"></i>`; continue; }
        const done = k <= x.commitIndex ? " c" : "";
        html += `<i class="${done}" style="--h:${termHue(e.term)}" title="index ${k}, term ${e.term}, ${e.cmd}">${replayed ? e.cmd + e.term : e.term}</i>`;
      }
      cells.innerHTML = html;
      cells.parentNode.classList.toggle("down", !x.up);
    }
    $("rf-idx").textContent = `indexes ${from}–${from + LOG_SHOW - 1}`;
    $("rf-time").textContent = (now / 1000).toFixed(2) + " s";
    $("rf-committed").textContent = sim.committed.toLocaleString("en-US");
    $("rf-elections").textContent = sim.stats.elections;
    const lead = sim.leader;
    $("rf-leader").textContent = lead ? `n${lead.id}` : "none";
    const v = sim.violation;
    if (v) {
      root.classList.add("rf-broken");
      $("rf-alert").textContent = `Broken at ${(v.time / 1000).toFixed(2)} s (${v.kind}): ${v.detail}.`;
    }
  }

  function frame(t) {
    if (!playing) return;
    const dt = Math.min(100, t - last);
    last = t;
    if (ffw) {
      // fast-forward: as much simulated time as fits in ~12 ms of real time
      const stop = performance.now() + 12;
      while (performance.now() < stop && !sim.violation && sim.now < 300000) sim.run(sim.now + 50);
      if (sim.violation || sim.now >= 300000) setPlaying(false);
    } else {
      sim.run(Math.min(sim.now + dt * speed, script ? script.until : Infinity));
      if (script && sim.now >= script.until && !sim.violation) nextStep();
      if (sim.violation) setPlaying(false);
    }
    draw();
    if (playing) requestAnimationFrame(frame);
  }

  function setPlaying(on, fast) {
    playing = on;
    ffw = on && !!fast;
    $("rf-play").textContent = on && !fast ? "Pause" : "Play";
    $("rf-ffw").textContent = on && fast ? "Stop" : "Fast-forward";
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }

  // Figure 8: act, then let the sim play out for the step's wait, then the next step
  function nextStep() {
    if (!script) return;
    if (script.i >= script.steps.length) {
      $("rf-desc-step").textContent = sim.violation ? "" : (bugs()[0] === "commit-old-terms"
        ? "" : "Done. n0 never treated \u201cb\u201d as committed, so overwriting it broke nothing. Now pick commit-old-terms and replay.");
      script = null; setPlaying(false); return;
    }
    const st = script.steps[script.i++];
    $("rf-desc-step").textContent = `Step ${script.i} of ${script.steps.length}: ${st.say}`;
    try { st.act(); } catch (e) { if (!sim.violation) throw e; }
    script.until = sim.now + st.wait;
  }
  $("rf-fig8").addEventListener("click", () => {
    setPlaying(false);
    sim = K.createSim({ n: N, seed: 8, watch: true, bugs: bugs(), strict: strict(), faults: K.FIGURE8_FAULTS });
    $("rf-alert").textContent = "";
    root.classList.remove("rf-broken");
    script = { steps: K.figure8(sim), i: 0, until: 0 };
    replayed = true;
    $("rf-seed").textContent = "Figure 8";
    nextStep();
    draw();
    setPlaying(true);
  });

  $("rf-play").addEventListener("click", () => {
    if (sim.violation || (replayed && !script)) reset();
    setPlaying(!(playing && !ffw));
  });
  $("rf-ffw").addEventListener("click", () => {
    if (sim.violation || replayed) reset();
    setPlaying(!(playing && ffw), true);
  });
  $("rf-new").addEventListener("click", () => { seed++; reset(); });
  $("rf-bug").addEventListener("change", reset);
  $("rf-strict").addEventListener("change", reset);
  $("rf-chaos").addEventListener("change", (e) => { chaos = e.target.checked; reset(); });
  $("rf-split").addEventListener("click", () => {
    if (links.some((l) => sim.isCut(l.a, l.b))) sim.heal();
    else {
      const lead = sim.leader ? sim.leader.id : 0;
      sim.partition([[lead, (lead + 1) % N], [(lead + 2) % N, (lead + 3) % N, (lead + 4) % N]]);
    }
    draw();
  });
  const sp = $("rf-speed");
  const showSpeed = () => { speed = Math.pow(10, +sp.value); $("rf-speed-out").textContent = speed < 0.1 ? `1/${Math.round(1 / speed)}×` : `${speed.toFixed(1)}×`; };
  sp.addEventListener("input", showSpeed);
  showSpeed();

  const opt = (v, label) => { const o = document.createElement("option"); o.value = v; o.textContent = label; $("rf-bug").appendChild(o); };
  opt("", "none: correct Raft");
  for (const b in K.BUGS) opt(b, b);
  function describe() {
    $("rf-bug-desc").textContent = K.BUGS[$("rf-bug").value] || "No planted bug: the real thing, as far as many thousands of random runs can tell.";
    $("rf-desc-step").textContent = "";
  }

  reset();
  sim.run(400); // start with a leader already elected
  draw();
})();
