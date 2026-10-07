// Interactive parts of the sandpile post. Needs sand.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const S = window.KitSand;
  if (!S || !$("sp")) return;

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
  const pow10 = (d) => (d < 3 ? fmt(10 ** d) : d < 6 ? `${10 ** (d - 3)}k` : `${10 ** (d - 6)}M`);

  // ---- the live pile ----
  const N = 96, BUDGET = 8;
  const cv = $("sp-sim"), ctx = cv.getContext("2d");
  cv.width = N; cv.height = N;
  const img = ctx.createImageData(N, N);
  const heat = new Float32Array(N * N);
  // grain counts 0..3, dark to light; toppled sites glow orange and fade
  const SHADE = [[18, 18, 32], [52, 66, 110], [86, 128, 196], [170, 200, 240]];
  let g, model = "btw", fast = false, paused = false, running = false, visible = true;
  let hist, count, zero, biggest, last;

  function reset() {
    g = S.create(N, model, (Math.random() * 1e9) | 0);
    if (model === "manna") for (let i = 0; i < N * N; i++) g.z[i] = g.rand() < 0.7 ? 1 : 0;
    // settle into the steady state before showing anything
    for (let i = 0; i < 2 * N * N; i++) S.dropRandom(g);
    hist = new Float64Array(40); count = 0; zero = 0; biggest = 0; last = null;
    heat.fill(0);
    draw(); chart(); stats();
    start();
  }

  const glow = (j) => { heat[j] = 1; };
  function record(r) {
    count++;
    last = r.s;
    if (r.s === 0) { zero++; return; }
    if (r.s > biggest) biggest = r.s;
    hist[Math.floor(Math.log2(r.s))]++;
  }
  function dropAt(i) { record(S.drop(g, i, glow)); }

  function draw() {
    const d = img.data, z = g.z, sh = model === "btw" ? SHADE : [SHADE[0], SHADE[3], SHADE[3], SHADE[3]];
    for (let i = 0; i < N * N; i++) {
      const c = sh[Math.min(3, z[i])], h = heat[i];
      d[4 * i] = c[0] + (217 - c[0]) * h;
      d[4 * i + 1] = c[1] + (89 - c[1]) * h;
      d[4 * i + 2] = c[2] + (38 - c[2]) * h;
      d[4 * i + 3] = 255;
      heat[i] = h * 0.82;
    }
    ctx.putImageData(img, 0, 0);
  }

  function stats() {
    $("sp-n").textContent = fmt(count);
    $("sp-big").textContent = fmt(biggest);
    $("sp-zero").textContent = count ? Math.round((100 * zero) / count) + "%" : "–";
  }

  // log-log histogram of avalanche sizes so far: share of avalanches per unit size, by powers-of-two bins
  function chart() {
    const svg = $("sp-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 240;
    const M = { t: 12, r: 20, b: 34, l: 46 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const tot = count - zero;
    const pts = [];
    for (let k = 0; k < hist.length; k++)
      if (hist[k] > 0) pts.push([(k + 0.5) * Math.log10(2), Math.log10(hist[k] / (2 ** k * tot))]);
    const xmax = Math.max(3, Math.ceil(Math.log10(N * N * 4)));
    const ymin = -Math.max(4, Math.ceil(-Math.min(-4, ...pts.map((p) => p[1]))));
    const x = (v) => M.l + (v / xmax) * (W - M.l - M.r);
    const y = (v) => M.t + (v / ymin) * (H - M.t - M.b);
    for (let d = 0; d <= xmax; d++) {
      el("line", { x1: x(d), x2: x(d), y1: M.t, y2: H - M.b, class: "viz-grid" }, svg);
      text(svg, x(d), H - M.b + 16, pow10(d), "viz-tick", "middle");
    }
    for (let d = 0; d >= ymin; d -= 2) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(d), y2: y(d), class: d ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(d) + 4, d === 0 ? "1" : `10⁻${String(-d).replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c])}`, "viz-tick", "end");
    }
    text(svg, (M.l + W - M.r) / 2, H - 4, "avalanche size (topplings)", "viz-tick", "middle");
    if (pts.length > 1)
      el("polyline", { points: pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" "), class: "viz-line s1" }, svg);
    for (const p of pts) el("circle", { cx: x(p[0]), cy: y(p[1]), r: 4, class: "viz-dot s1" }, svg);
    // straight-line slope through the middle of the range, ignoring the tiny and the edge-limited
    const mid = pts.filter((p) => p[0] >= 0.5 && p[0] <= Math.log10(N * N / 30));
    let slope = null;
    if (mid.length >= 3 && tot > 2000) {
      const mx = mid.reduce((a, p) => a + p[0], 0) / mid.length, my = mid.reduce((a, p) => a + p[1], 0) / mid.length;
      slope = mid.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / mid.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
      const x0 = mid[0][0], x1 = mid[mid.length - 1][0];
      el("line", { x1: x(x0), x2: x(x1), y1: y(my + slope * (x0 - mx)), y2: y(my + slope * (x1 - mx)), class: "viz-ref" }, svg);
    }
    $("sp-slope").textContent = slope == null ? "–" : (-slope).toFixed(2);
  }

  function frame() {
    running = false;
    if (!visible || paused) return;
    const t0 = performance.now();
    if (fast) { do { record(S.dropRandom(g)); } while (performance.now() - t0 < BUDGET); }
    else record(S.dropRandom(g, glow));
    draw();
    if (fast || count % 4 === 0) { chart(); stats(); } else stats();
    start();
  }
  function start() {
    if (!running && visible && !paused) { running = true; requestAnimationFrame(frame); }
  }

  const press = (sel, on) => document.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", on(b)));
  document.querySelectorAll("#sp [data-model]").forEach((b) => b.addEventListener("click", () => {
    model = b.dataset.model;
    press("#sp [data-model]", (x) => x.dataset.model === model);
    reset();
  }));
  document.querySelectorAll("#sp [data-speed]").forEach((b) => b.addEventListener("click", () => {
    fast = b.dataset.speed === "fast";
    press("#sp [data-speed]", (x) => (x.dataset.speed === "fast") === fast);
  }));
  $("sp-reset").addEventListener("click", reset);
  $("sp-pause").addEventListener("click", () => {
    paused = !paused;
    $("sp-pause").setAttribute("aria-pressed", paused);
    $("sp-pause").textContent = paused ? "play" : "pause";
    start();
  });
  cv.addEventListener("pointerdown", (e) => {
    const r = cv.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * N), cy = Math.floor(((e.clientY - r.top) / r.height) * N);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
    dropAt(cy * N + cx);
    draw(); chart(); stats();
  });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe(cv);

  // ---- the collapse explorer ----
  const F = $("sp-fit");
  const data = F ? JSON.parse(F.dataset.curves) : null;
  let fitModel = "btw-s";
  // one hue, dim (small grid) to bright (big grid)
  const RAMP = ["#2a62b0", "#3d84de", "#6ea6ee", "#a3c8f6", "#dbe9fb"];

  function spread(curves, tau, D) {
    // rms vertical gap between the rescaled curves where they overlap, sizes >= 10 only
    const tc = Object.keys(curves).map((L) => curves[L].filter((p) => p[0] >= 1).map((p) => [p[0] - D * Math.log10(+L), p[1] + tau * p[0]]));
    const lo = Math.min(...tc.map((c) => c[0][0])), hi = Math.max(...tc.map((c) => c[c.length - 1][0]));
    let tot = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      const xv = lo + ((hi - lo) * i) / 199, ys = [];
      for (const c of tc) {
        if (xv < c[0][0] || xv > c[c.length - 1][0]) continue;
        let k = 1;
        while (c[k][0] < xv) k++;
        const [x0, y0] = c[k - 1], [x1, y1] = c[k];
        ys.push(y0 + ((y1 - y0) * (xv - x0)) / (x1 - x0 || 1));
      }
      if (ys.length < 2) continue;
      const m = ys.reduce((a, b) => a + b, 0) / ys.length;
      tot += ys.reduce((a, b) => a + (b - m) ** 2, 0); n += ys.length;
    }
    return Math.sqrt(tot / n);
  }

  function fitChart() {
    const set = data[fitModel], curves = set.curves;
    const tau = +$("sp-tau").value, D = +$("sp-d").value;
    $("sp-tau-out").textContent = tau.toFixed(2);
    $("sp-d-out").textContent = D.toFixed(2);
    const sp = spread(curves, tau, D);
    $("sp-spread").textContent = sp.toFixed(3);
    $("sp-best").textContent = set.spread.toFixed(3);
    const svg = $("sp-fit-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 280;
    const M = { t: 12, r: 14, b: 36, l: 46 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const Ls = Object.keys(curves).map(Number).sort((a, b) => a - b);
    const tc = Ls.map((L) => curves[L].filter((p) => p[0] >= 1).map((p) => [p[0] - D * Math.log10(L), p[1] + tau * p[0]]));
    const all = tc.flat();
    const x0 = Math.floor(Math.min(...all.map((p) => p[0])) * 2) / 2, x1 = Math.ceil(Math.max(...all.map((p) => p[0])) * 2) / 2;
    const ys = all.map((p) => p[1]);
    const y1 = Math.ceil(Math.max(...ys) * 2) / 2, y0 = Math.max(y1 - 3, Math.floor(Math.min(...ys) * 2) / 2);
    const x = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
    const y = (v) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
    for (let d = Math.ceil(x0); d <= x1; d++) {
      el("line", { x1: x(d), x2: x(d), y1: M.t, y2: H - M.b, class: "viz-grid" }, svg);
      text(svg, x(d), H - M.b + 16, String(d), "viz-tick", "middle");
    }
    for (let d = Math.ceil(y0 * 2) / 2; d <= y1; d += 0.5) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(d), y2: y(d), class: "viz-grid" }, svg);
      text(svg, M.l - 6, y(d) + 4, d.toFixed(1), "viz-tick", "end");
    }
    text(svg, (M.l + W - M.r) / 2, H - 4, "log₁₀ (size ÷ grid^D)", "viz-tick", "middle");
    const clip = el("clipPath", { id: "sp-clip" }, el("defs", {}, svg));
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, clip);
    tc.forEach((c, i) => el("polyline", { "clip-path": "url(#sp-clip)", points: c.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" "),
      class: "viz-line", stroke: RAMP[i] }, svg));
    $("sp-legend").innerHTML = Ls.map((L, i) => `<span style="--c:${RAMP[i]}">${L}×${L}</span>`).join("");
  }

  function setFit(m, best) {
    fitModel = m;
    press("#sp-fit [data-fit]", (b) => b.dataset.fit === m);
    if (best) { $("sp-tau").value = data[m].best[0].toFixed(2); $("sp-d").value = data[m].best[1].toFixed(2); }
    fitChart();
  }
  if (F) {
    document.querySelectorAll("#sp-fit [data-fit]").forEach((b) => b.addEventListener("click", () => setFit(b.dataset.fit, true)));
    ["sp-tau", "sp-d"].forEach((id) => $(id).addEventListener("input", fitChart));
    $("sp-reset-fit").addEventListener("click", () => { $("sp-tau").value = "1.00"; $("sp-d").value = "2.00"; fitChart(); });
    $("sp-to-best").addEventListener("click", () => setFit(fitModel, true));
  }

  let lastW = 0;
  window.addEventListener("resize", () => {
    const w = $("sp-chart").parentNode.clientWidth;
    if (Math.abs(w - lastW) > 8) { lastW = w; chart(); if (F) fitChart(); }
  });
  reset();
  if (F) setFit("btw-s", false);
})();
