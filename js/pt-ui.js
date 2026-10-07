// Interactive part of the path tracing post. Needs pt.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const P = window.KitPT;
  const root = $("pt");
  if (!root || !P) return;

  const RES = 112, MAX_SPP = 4096, BUDGET = 12, GAIN = 4;
  const MODES = [P.BRUTE, P.NEE, P.MIS];
  const canvases = MODES.map((m) => $("pt-c" + m));
  const ctxs = canvases.map((c) => c.getContext("2d"));
  const imgs = ctxs.map((c) => c.createImageData(RES, RES));
  const labels = MODES.map((m) => $("pt-v" + m));
  const slider = $("pt-light"), sizeOut = $("pt-light-out"), sppOut = $("pt-spp");

  let gloss = 100, sc, films, rands, ids, cover, row = 0, visible = true, running = false;

  // slider 0..100 maps to light half-width 0.03..0.99 on a log scale
  const lightSize = () => 0.03 * Math.pow(0.99 / 0.03, slider.value / 100);

  // fraction of each pixel covered by the light, so it can be painted in
  // (the estimators themselves never see the light directly)
  function coverage() {
    const cv = new Float32Array(RES * RES), c = sc.cam;
    for (let y = 0; y < RES; y++)
      for (let x = 0; x < RES; x++) {
        let hit = 0;
        for (let k = 0; k < 16; k++) {
          const u = ((x + ((k & 3) + 0.5) / 4) / RES * 2 - 1) * sc.fov;
          const v = (1 - (y + ((k >> 2) + 0.5) / 4) / RES * 2) * sc.fov;
          const n = Math.hypot(u, v, 1);
          if (P.intersect(sc, c[0], c[1], c[2], u / n, v / n, -1 / n, Infinity) === P.LIGHT) hit++;
        }
        cv[y * RES + x] = hit / 16;
      }
    return cv;
  }

  function reset() {
    const s = lightSize();
    sizeOut.textContent = Math.round(s * 100) + "% of the ceiling width";
    sc = P.scene({ light: s, gloss, showLight: false });
    films = MODES.map(() => P.film(RES, RES));
    rands = MODES.map((m) => P.rng(1000 + m));
    ids = P.idMap(sc, RES, RES);
    cover = coverage();
    row = 0;
    draw();
    start();
  }

  const tone = (v) => 255 * Math.pow((v * GAIN) / (1 + v * GAIN), 1 / 2.2);

  function draw() {
    for (let m = 0; m < 3; m++) {
      const fm = films[m], d = imgs[m].data;
      for (let i = 0; i < RES * RES; i++) {
        const c = cover[i], n = Math.max(1, fm.n + (i < row * RES ? 1 : 0));
        for (let k = 0; k < 3; k++) d[4 * i + k] = (1 - c) * tone(fm.rgb[3 * i + k] / n) + c * 255;
        d[4 * i + 3] = 255;
      }
      ctxs[m].putImageData(imgs[m], 0, 0);
    }
    const n = films[2].n;
    sppOut.textContent = n.toLocaleString("en-US");
    if (n < 2) { labels.forEach((l) => (l.textContent = "…")); return; }
    const pick = (id) => id >= 0;
    const vs = films.map((fm) => P.variance(fm, ids, pick).v);
    for (let m = 0; m < 3; m++) {
      const r = vs[m] / vs[2];
      labels[m].textContent = m === 2 ? "1× (reference)"
        : (r >= 10 ? Math.round(r).toLocaleString("en-US") : r.toFixed(2)) + "× the noise";
    }
  }

  function frame() {
    running = false;
    if (!visible || films[2].n >= MAX_SPP) return;
    const t0 = performance.now();
    do {
      for (let m = 0; m < 3; m++) P.pass(sc, MODES[m], films[m], rands[m], row, row + 1);
      row = (row + 1) % RES;
    } while (performance.now() - t0 < BUDGET);
    draw();
    start();
  }
  function start() {
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  root.querySelectorAll("[data-gloss]").forEach((b) => {
    b.addEventListener("click", () => {
      gloss = +b.dataset.gloss;
      root.querySelectorAll("[data-gloss]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      reset();
    });
  });
  slider.addEventListener("input", reset);
  $("pt-restart").addEventListener("click", reset);

  // only burn CPU while the widget is on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }).observe(root);
  }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) start(); });

  canvases.forEach((c) => { c.width = RES; c.height = RES; });
  reset();
})();
