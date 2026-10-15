// Interactive part of the Pólya post. Needs polya.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const P = window.KitPolya;
  if (!P || !$("pw")) return;

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
  const fmt = (n) => n.toLocaleString("en-US");
  const pow2 = (k) => (k < 10 ? String(2 ** k) : `${2 ** (k - 10)}k`);
  // 3D only: the chance still missing after n steps is about 0.287/√n (see the post)
  const TAIL3 = 0.287;
  const BUDGET = 12;

  let d = 3, capLog = 12, w, paused = false, running = false, visible = true, last = 0;

  function reset() {
    w = P.create(d, 2 ** capLog, (Math.random() * 2 ** 32) >>> 0);
    $("pw-tail-key").hidden = d !== 3;
    draw();
    start();
  }

  function draw() {
    const cap = 2 ** capLog, c = P.cumulative(w), truth = P.TRUE[d], n = w.walkers;
    const p = c[cap], se = n ? Math.sqrt(Math.max(p * (1 - p), 1e-12) / n) : 0;
    $("pw-n").textContent = fmt(n);
    $("pw-p").textContent = n ? `${p.toFixed(4)} ± ${se.toFixed(4)}` : "–";
    $("pw-true").textContent = truth === 1 ? "1 (always)" : truth.toFixed(4);
    $("pw-gap").textContent = n >= 100 ? `${((truth - p) / se).toFixed(1)}` : "–";
    $("pw-fix").textContent = d === 3 && n >= 100 ? `${(p + TAIL3 / Math.sqrt(cap)).toFixed(4)}` : "–";

    const svg = $("pw-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 260;
    const M = { t: 12, r: 16, b: 34, l: 46 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const ymax = truth === 1 ? 1 : Math.ceil((truth * 1.25) / 0.05) * 0.05;
    const x = (k) => M.l + (k / capLog) * (W - M.l - M.r);
    const y = (v) => H - M.b - (v / ymax) * (H - M.t - M.b);
    const step = capLog > 12 ? 2 : 1;
    for (let k = 0; k <= capLog; k += step) {
      el("line", { x1: x(k), x2: x(k), y1: M.t, y2: H - M.b, class: "viz-grid" }, svg);
      text(svg, x(k), H - M.b + 16, pow2(k), "viz-tick", "middle");
    }
    const ys = ymax > 0.5 ? 0.2 : ymax > 0.2 ? 0.1 : 0.05;
    for (let v = 0; v <= ymax + 1e-9; v += ys) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(v) + 4, v.toFixed(ys < 0.1 ? 2 : 1), "viz-tick", "end");
    }
    text(svg, (M.l + W - M.r) / 2, H - 4, "steps allowed (log scale)", "viz-tick", "middle");
    el("line", { x1: M.l, x2: W - M.r, y1: y(truth), y2: y(truth), class: "viz-ref" }, svg);
    if (!n) return;

    // points every 1/8 octave, with a ±2 error-bar band
    const ks = [], hi = [], lo = [], mid = [], fix = [];
    for (let j = 0; j <= 8 * capLog; j++) {
      const k = j / 8, m = Math.round(2 ** k);
      if (j && m === Math.round(2 ** ((j - 1) / 8))) continue;
      const q = c[m], s = Math.sqrt(q * (1 - q) / n);
      ks.push(k); mid.push(q); hi.push(Math.min(1, q + 2 * s)); lo.push(Math.max(0, q - 2 * s));
      if (d === 3 && m >= 16) fix.push([k, q + TAIL3 / Math.sqrt(m)]);
    }
    const pts = (xs, vs) => xs.map((k, i) => `${x(k).toFixed(1)},${y(vs[i]).toFixed(1)}`);
    el("polygon", { points: pts(ks, hi).concat(pts(ks, lo).reverse()).join(" "), class: "viz-band s1" }, svg);
    el("polyline", { points: pts(ks, mid).join(" "), class: "viz-line s1" }, svg);
    if (fix.length > 1)
      el("polyline", { points: fix.map(([k, v]) => `${x(k).toFixed(1)},${y(Math.min(v, ymax)).toFixed(1)}`).join(" "), class: "viz-line s2" }, svg);
  }

  function frame(now) {
    running = false;
    if (!visible || paused) return;
    const t0 = performance.now();
    // the chunk cap keeps a frozen clock (background tab, headless) from spinning forever
    let chunks = 0;
    do P.run(w, 100000); while (performance.now() - t0 < BUDGET && ++chunks < 40);
    if (now - last > 150) { draw(); last = now; }
    start();
  }
  function start() {
    if (!running && visible && !paused) { running = true; requestAnimationFrame(frame); }
  }

  document.querySelectorAll("#pw [data-d]").forEach((b) => b.addEventListener("click", () => {
    d = +b.dataset.d;
    document.querySelectorAll("#pw [data-d]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    reset();
  }));
  $("pw-cap").addEventListener("input", (e) => {
    capLog = +e.target.value;
    $("pw-cap-out").textContent = fmt(2 ** capLog);
    reset();
  });
  $("pw-reset").addEventListener("click", reset);
  $("pw-pause").addEventListener("click", (e) => {
    paused = !paused;
    e.target.setAttribute("aria-pressed", String(paused));
    e.target.textContent = paused ? "resume" : "pause";
    if (!paused) start(); else draw();
  });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe($("pw"));
  addEventListener("resize", draw);
  reset();
})();
