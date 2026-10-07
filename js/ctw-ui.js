// Interactive part of the context tree weighting post. Needs ctw.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const K = window.KitCTW;
  if (!K || !$("ct")) return;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, cls, anchor = "start") {
    const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent);
    t.textContent = s;
    return t;
  }
  const size = (n) => (n < 1024 ? String(n) : n < 1 << 20 ? `${Math.round(n / 1024)}k` : `${(n / (1 << 20)).toFixed(1).replace(/\.0$/, "")}M`);

  const PRESETS = {
    m1: () => K.treeSource(4, 1, 1, 0.3, 4),
    m3: () => K.treeSource(4, 3, 1, 0.5, 5),
    var: () => K.treeSource(4, 6, 0.4, 0.3, 9),
  };
  const A = 4, NMAX = 1 << 22, FIXED = 9, SLICE = 1 << 17;
  const CPS = [];
  for (let j = 0; 256 * 2 ** (j / 2) <= NMAX; j++) CPS.push(Math.round(256 * 2 ** (j / 2)));

  let src, st, m, orc, fx, floorBits, i, hist, timer = null, playing = true, gen = 0;

  function reset(newSrc) {
    if (newSrc) src = newSrc;
    clearTimeout(timer);
    gen++;
    const D = +$("ct-d").value;
    st = K.stream(src, 7919);
    m = K.ctw(A, D);
    orc = K.oracle(src);
    fx = Array.from({ length: FIXED }, (_, k) => K.counting(A, k));
    floorBits = 0; i = 0; hist = [];
    draw();
    if (playing) step(gen);
  }

  // run up to the next checkpoint in slices so the page stays responsive
  function step(g) {
    if (g !== gen) return;
    const target = CPS[hist.length];
    if (target === undefined) { setPlaying(false); return; }
    const stop = Math.min(target, i + SLICE);
    for (; i < stop; i++) {
      const ctx = st.ctx, s = st.next();
      floorBits -= Math.log2(src.T[ctx * A + s]);
      m.update(s); orc.update(s, ctx);
      for (let k = 0; k < FIXED; k++) fx[k].update(s);
    }
    if (i === target) {
      let best = 0;
      for (let k = 1; k < FIXED; k++) if (fx[k].bits < fx[best].bits) best = k;
      const pct = (b) => (100 * (b - floorBits)) / floorBits;
      hist.push({ n: i, ctw: pct(m.bits), fixed: pct(fx[best].bits), best, orc: pct(orc.bits), toll: m.bits - orc.bits });
      draw();
      timer = setTimeout(() => step(g), 140);
    } else timer = setTimeout(() => step(g), 0);
  }

  function setPlaying(p) {
    playing = p;
    $("ct-play").textContent = p ? "pause" : hist.length === CPS.length ? "run again" : "play";
  }

  const fmt = (v) => (v < 0.01 ? v.toFixed(4) : v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)) + "%";
  function draw() {
    const h = hist[hist.length - 1];
    const D = m.D, tb = K.treeBits(src, D);
    $("ct-n").textContent = h ? size(h.n) : "0";
    $("ct-ctw").textContent = h ? fmt(Math.max(0, h.ctw)) : "–";
    $("ct-fixed").textContent = h ? fmt(Math.max(0, h.fixed)) : "–";
    $("ct-best").textContent = h ? `best fixed memory (${h.best}), above the floor` : "best fixed memory, above the floor";
    $("ct-toll").textContent = h ? `${Math.round(h.toll)} bits` : "–";
    $("ct-toll-l").textContent = tb === null
      ? `CTW's total extra cost over knowing the tree (the tree is deeper than ${D}, so this keeps growing)`
      : `CTW's total extra cost over knowing the tree; describing the tree takes ${tb} bits`;
    $("ct-d-out").textContent = String(D);
    drawChart();
    drawTree();
  }

  function drawChart() {
    const svg = $("ct-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 240;
    const M = { t: 12, r: 14, b: 34, l: 50 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const lo = -3, hi = 2; // 0.001% .. 100%
    const x0 = 8, x1 = 22;
    const x = (n) => M.l + ((Math.log2(n) - x0) / (x1 - x0)) * (W - M.l - M.r);
    const y = (v) => M.t + (1 - (Math.min(hi, Math.max(lo, Math.log10(Math.max(v, 1e-9)))) - lo) / (hi - lo)) * (H - M.t - M.b);
    for (let e = lo; e <= hi; e++) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(10 ** e), y2: y(10 ** e), class: e === lo ? "viz-base" : "viz-grid" }, svg);
      text(svg, M.l - 6, y(10 ** e) + 4, `${10 ** e >= 1 ? 10 ** e : (10 ** e).toFixed(-e)}%`, "viz-tick", "end");
    }
    const every = W < 420 ? 4 : 2;
    for (let lg = x0; lg <= x1; lg += every) text(svg, x(2 ** lg), H - M.b + 16, size(2 ** lg), "viz-tick", "middle");
    text(svg, (M.l + W - M.r) / 2, H - 4, "symbols seen so far", "viz-tick", "middle");
    const line = (key, cls) => {
      if (!hist.length) return;
      el("polyline", { points: hist.map((h) => `${x(h.n).toFixed(1)},${y(h[key]).toFixed(1)}`).join(" "), class: `viz-line ${cls}` }, svg);
      const h = hist[hist.length - 1];
      el("circle", { cx: x(h.n), cy: y(h[key]), r: 3.5, class: `viz-dot ${cls}` }, svg);
    };
    line("orc", "ct-orc");
    line("fixed", "s2");
    line("ctw", "s1");
  }

  // Icicle chart of the union of the true tree and the one CTW currently prefers.
  // Leaves get equal width; each row is one more symbol of memory.
  function drawTree() {
    const svg = $("ct-tree");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth));
    const key = (s) => s.join(",");
    const trueLeaf = new Set(src.leaves.map(key)), trueInner = new Set();
    for (const l of src.leaves) for (let d = 0; d < l.length; d++) trueInner.add(key(l.slice(0, d)));
    // build union
    const nodes = [];
    let leafCount = 0, depth = 0;
    (function walk(suf, inCtw, belowTrueLeaf) {
      const k = key(suf), tIn = trueInner.has(k), cSplit = inCtw && m.splits(suf);
      const node = { suf, inCtw, cSplit, tIn, tLeaf: trueLeaf.has(k), belowTrueLeaf, kids: [] };
      nodes.push(node);
      depth = Math.max(depth, suf.length);
      if (cSplit || tIn) for (let a = 0; a < A; a++) node.kids.push(walk(suf.concat(a), cSplit, belowTrueLeaf || node.tLeaf));
      else { node.x0 = leafCount++; }
      if (node.kids.length) node.x0 = node.kids[0].x0;
      node.x1 = node.kids.length ? node.kids[A - 1].x1 : node.x0 + 1;
      return node;
    })([], true, false);
    const rowH = 20, M = { t: 4, l: 22, r: 4, b: 4 };
    const H = M.t + M.b + (depth + 1) * rowH;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const ux = (W - M.l - M.r) / leafCount;
    for (let d = 0; d <= depth; d++) text(svg, M.l - 6, M.t + d * rowH + 14, String(d), "viz-tick", "end");
    let right = 0, short = 0, long = 0;
    for (const n of nodes) {
      const d = n.suf.length;
      let cls;
      if (!n.inCtw) cls = "ct-missing";
      else if (n.cSplit) cls = "ct-inner";
      else if (n.tLeaf) { cls = "ct-right"; right++; }
      else if (n.tIn) { cls = "ct-short"; short++; }
      else { cls = "ct-long"; long++; }
      el("rect", { x: M.l + n.x0 * ux + 0.5, y: M.t + d * rowH + 1, width: Math.max(0.5, (n.x1 - n.x0) * ux - 1), height: rowH - 2, rx: 2, class: `ct-cell ${cls}` }, svg);
    }
    $("ct-tree-sum").textContent = `${src.leaves.length} true contexts; CTW matches ${right}, stops too early at ${short}${long ? `, looks too far back at ${long}` : ""}.`;
  }

  document.querySelectorAll("#ct [data-p]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#ct [data-p]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    setPlaying(true);
    reset(PRESETS[b.dataset.p]());
  }));
  $("ct-new").addEventListener("click", () => {
    document.querySelectorAll("#ct [data-p]").forEach((x) => x.setAttribute("aria-pressed", "false"));
    let s;
    do s = K.treeSource(4, 6, 0.4, 0.3, (Math.random() * 1e9) | 0); while (s.leaves.length < 20 || s.leaves.length > 120);
    setPlaying(true);
    reset(s);
  });
  $("ct-d").addEventListener("input", () => { $("ct-d-out").textContent = $("ct-d").value; });
  $("ct-d").addEventListener("change", () => { setPlaying(true); reset(); });
  $("ct-play").addEventListener("click", () => {
    if (playing) { setPlaying(false); clearTimeout(timer); gen++; return; }
    if (hist.length === CPS.length) { setPlaying(true); reset(); return; }
    setPlaying(true);
    step(++gen);
  });
  src = PRESETS.var();
  reset();
  let w = 0;
  new ResizeObserver(() => { const nw = $("ct-chart").parentNode.clientWidth; if (nw !== w) { w = nw; draw(); } }).observe($("ct-chart").parentNode);
})();
