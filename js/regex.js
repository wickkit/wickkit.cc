// Two tiny regex engines over one parser: a backtracker and a Thompson NFA.
// Syntax: literals, ., [a-z] / [^...], \ escapes, * + ?, |, ( ).
// Both do full-string matching and count "steps" so they can be compared.
// Runs in the browser (window.KitRegex) and under node (module.exports).
(function (root) {
  "use strict";

  // ---------- parser: pattern -> AST ----------
  // AST nodes: {t:"chr", test:fn, src}, {t:"cat", a, b}, {t:"alt", a, b},
  //            {t:"star"|"plus"|"opt", a}, {t:"empty"}
  function parse(pat) {
    let i = 0;
    const peek = () => pat[i];
    const eat = (c) => {
      if (pat[i] !== c) throw new SyntaxError(`expected '${c}' at ${i}`);
      i++;
    };

    function alt() {
      let left = cat();
      while (peek() === "|") { i++; left = { t: "alt", a: left, b: cat() }; }
      return left;
    }
    function cat() {
      let node = null;
      while (i < pat.length && peek() !== "|" && peek() !== ")") {
        const r = rep();
        node = node ? { t: "cat", a: node, b: r } : r;
      }
      return node || { t: "empty" };
    }
    function rep() {
      let a = atom();
      while ("*+?".includes(peek()) && i < pat.length) {
        const c = pat[i++];
        a = { t: c === "*" ? "star" : c === "+" ? "plus" : "opt", a };
      }
      return a;
    }
    function atom() {
      const c = pat[i];
      if (c === "(") { i++; const a = alt(); eat(")"); return a; }
      if (c === "*" || c === "+" || c === "?") throw new SyntaxError(`nothing to repeat at ${i}`);
      if (c === ".") { i++; return { t: "chr", test: () => true, src: "." }; }
      if (c === "[") return cls();
      if (c === "\\") {
        i++;
        if (i >= pat.length) throw new SyntaxError("trailing \\");
        const e = pat[i++];
        return lit(e);
      }
      i++;
      return lit(c);
    }
    function lit(c) { return { t: "chr", test: (x) => x === c, src: c }; }
    function cls() {
      const start = i;
      eat("[");
      let neg = false;
      if (peek() === "^") { neg = true; i++; }
      const ranges = [];
      let first = true;
      while (i < pat.length && (peek() !== "]" || first)) {
        first = false;
        let lo = pat[i++];
        if (lo === "\\") lo = pat[i++];
        let hi = lo;
        if (peek() === "-" && pat[i + 1] !== undefined && pat[i + 1] !== "]") {
          i++;
          hi = pat[i++];
          if (hi === "\\") hi = pat[i++];
          if (hi < lo) throw new SyntaxError(`bad range ${lo}-${hi}`);
        }
        ranges.push([lo, hi]);
      }
      eat("]");
      const inSet = (x) => ranges.some(([lo, hi]) => x >= lo && x <= hi);
      return { t: "chr", test: neg ? (x) => !inSet(x) : inSet, src: pat.slice(start, i) };
    }

    const ast = alt();
    if (i !== pat.length) throw new SyntaxError(`unexpected '${pat[i]}' at ${i}`);
    return ast;
  }

  // ---------- engine 1: backtracking ----------
  // Continuation-passing: m(node, pos, k) tries to match node at pos, then k.
  // Each call counts as a step; past `limit` steps it throws STOP.
  // Like JS, a pass through ?, * or a repeat of + that consumes nothing
  // counts as a failure (the q > p guards), so the engine tries something else.
  const STOP = {};
  function matcher(ast, str, limit) {
    const st = { steps: 0 };
    function m(n, p, k) {
      if (++st.steps > limit) throw STOP;
      switch (n.t) {
        case "empty": return k(p);
        case "chr": return p < str.length && n.test(str[p]) && k(p + 1);
        case "cat": return m(n.a, p, (q) => m(n.b, q, k));
        case "alt": return m(n.a, p, k) || m(n.b, p, k);
        case "opt": return m(n.a, p, (q) => q > p && k(q)) || k(p);
        case "plus": return m(n.a, p, (q) => star(n.a, q, k));
        case "star": return star(n.a, p, k);
      }
    }
    function star(a, p, k) {
      return m(a, p, (q) => q > p && star(a, q, k)) || k(p);
    }
    st.m = m;
    return st;
  }

  function backtrack(pat, str, limit = 1e7) {
    const ast = parse(pat);
    const st = matcher(ast, str, limit);
    try {
      const ok = st.m(ast, 0, (p) => p === str.length);
      return { match: !!ok, steps: st.steps, gaveUp: false };
    } catch (e) {
      if (e === STOP) return { match: null, steps: st.steps, gaveUp: true };
      throw e;
    }
  }

  // ---------- engine 2: Thompson NFA ----------
  // Compile AST to states: {chr test, out} | {split out, out1} | {match}.
  function compile(ast) {
    const states = [];
    let nextLoop = 0;
    const mk = (s) => (states.push(s), s);
    // Returns a fragment {start, outs: [setter...]}; patch(outs, s) wires dangling arrows.
    const patch = (outs, s) => outs.forEach((f) => f(s));
    function frag(n) {
      switch (n.t) {
        case "empty": {
          const s = mk({ k: "split", out: null, out1: null });
          // single epsilon arrow; out1 stays null
          return { start: s, outs: [(x) => (s.out = x)] };
        }
        case "chr": {
          const s = mk({ k: "chr", test: n.test, out: null });
          return { start: s, outs: [(x) => (s.out = x)] };
        }
        case "cat": {
          const a = frag(n.a), b = frag(n.b);
          patch(a.outs, b.start);
          return { start: a.start, outs: b.outs };
        }
        case "alt": {
          const a = frag(n.a), b = frag(n.b);
          const s = mk({ k: "split", out: a.start, out1: b.start });
          return { start: s, outs: a.outs.concat(b.outs) };
        }
        // Loops get an id, and each pass through the body ends at an "end"
        // state. nfaSearch uses them to reject passes that consumed nothing.
        case "opt": {
          const a = frag(n.a), lid = nextLoop++;
          const s = mk({ k: "split", lid, out: a.start, out1: null });
          const e = mk({ k: "end", lid, out: null });
          patch(a.outs, e);
          return { start: s, outs: [(x) => (e.out = x), (x) => (s.out1 = x)] };
        }
        case "star":
        case "plus": {
          const a = frag(n.a), lid = nextLoop++;
          const s = mk({ k: "split", lid, out: a.start, out1: null });
          const e = mk({ k: "end", lid, out: s });
          patch(a.outs, e);
          return { start: n.t === "star" ? s : a.start, outs: [(x) => (s.out1 = x)] };
        }
      }
    }
    const f = frag(ast);
    const match = mk({ k: "match" });
    patch(f.outs, match);
    states.forEach((s, i) => (s.id = i));
    return { start: f.start, states };
  }

  // Simulate all paths at once: one set of live states per input position.
  // A step is one state added to a set, so work is at most states x length.
  function nfa(pat, str) {
    const prog = compile(parse(pat));
    let steps = 0;
    let gen = 0;
    const mark = new Array(prog.states.length).fill(-1);
    function add(list, s) {
      if (!s || mark[s.id] === gen) return;
      mark[s.id] = gen;
      steps++;
      if (s.k === "split") { add(list, s.out); add(list, s.out1); }
      else if (s.k === "end") add(list, s.out);
      else list.push(s);
    }
    let cur = [];
    add(cur, prog.start);
    for (let p = 0; p < str.length; p++) {
      gen++;
      const next = [];
      for (const s of cur) if (s.k === "chr" && s.test(str[p])) add(next, s.out);
      cur = next;
      if (!cur.length) break;
    }
    return { match: cur.some((s) => s.k === "match"), steps, states: prog.states.length };
  }

  // ---------- search: leftmost-first span, like JS's exec ----------
  // Backtracker: try each start in turn; the first success is the answer.
  function backtrackSearch(pat, str, limit = 1e7) {
    const ast = parse(pat);
    const st = matcher(ast, str, limit);
    try {
      for (let s = 0; s <= str.length; s++) {
        let end = -1;
        if (st.m(ast, s, (p) => ((end = p), true))) return { span: [s, end], steps: st.steps, gaveUp: false };
      }
      return { span: null, steps: st.steps, gaveUp: false };
    } catch (e) {
      if (e === STOP) return { span: undefined, steps: st.steps, gaveUp: true };
      throw e;
    }
  }

  // Pike VM: the NFA simulation, but threads are kept in priority order
  // (the order a backtracker would try them) and each remembers its start.
  // When a thread matches, every lower-priority thread is dropped.
  // `open` lists loops entered since the last character was consumed; reaching
  // a loop's end while it's still open means the pass was empty, so drop it.
  function nfaSearch(pat, str) {
    const prog = compile(parse(pat));
    let steps = 0, best = null, seen;
    function add(list, s, start, open) {
      if (!s) return;
      const key = s.id + "|" + open;
      if (seen.has(key)) return;
      seen.add(key);
      steps++;
      if (s.k === "split") {
        add(list, s.out, start, s.lid === undefined ? open : open.concat(s.lid));
        add(list, s.out1, start, open);
      } else if (s.k === "end") {
        if (!open.includes(s.lid)) add(list, s.out, start, open);
      } else list.push({ s, start });
    }
    let cur = [];
    seen = new Set();
    for (let p = 0; ; p++) {
      if (!best) add(cur, prog.start, p, []); // a new attempt starts here, lowest priority
      seen = new Set();
      const next = [];
      for (const th of cur) {
        if (th.s.k === "match") { best = [th.start, p]; break; } // cut lower priority
        if (p < str.length && th.s.test(str[p])) add(next, th.s.out, th.start, []);
      }
      if (p >= str.length || (best && !next.length)) break;
      cur = next;
    }
    return { span: best, steps, states: prog.states.length };
  }

  const api = { parse, backtrack, nfa, compile, backtrackSearch, nfaSearch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitRegex = api;
})(this);
