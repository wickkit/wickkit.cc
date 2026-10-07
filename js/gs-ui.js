// Interactive part of the reaction-diffusion post. Needs gs.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const G = window.KitGS;
  const root = $("gs");
  if (!root || !G) return;

  const N = 128, BUDGET = 10, MAXSPF = 40;
  // the sweep grid behind the map image: F = 0.002..0.090 step .002, k = 0.030..0.070 step .001
  const F0 = 0.002, FS = 0.002, FN = 45, K0 = 0.03, KS = 0.001, KN = 41;

  const cv = $("gs-sim"), ctx = cv.getContext("2d"), img = ctx.createImageData(N, N);
  const map = $("gs-map"), mark = $("gs-mark");
  const fOut = $("gs-f"), kOut = $("gs-k"), tOut = $("gs-t"), what = $("gs-what");
  const pauseBtn = $("gs-pause");
  const names = JSON.parse(root.dataset.classes || "{}");
  const cls = (root.dataset.map || "").split("|");  // one row of chars per F, one char per k
  const mot = (root.dataset.motion || "").split("|");  // same grid, one start followed to 200k steps
  const moves = { s: "it settles and stops", g: "at 200,000 steps the whole thing is still sliding",
    c: "at 200,000 steps it's still rearranging" };

  let g, visible = true, running = false, paused = false, spf = 8;

  function setParams(F, k, reseed) {
    if (!g || reseed) { g = G.create(N, F, k); G.seed(g, (Math.random() * 1e9) | 0); }
    g.F = F; g.k = k;
    fOut.textContent = F.toFixed(4);
    kOut.textContent = k.toFixed(4);
    const a = Math.round((F - F0) / FS), b = Math.round((k - K0) / KS);
    const c = cls[a] && cls[a][b], m = mot[a] && mot[a][b];
    what.textContent = c && names[c] ? "The sweep found: " + names[c] + (moves[m] ? "; " + moves[m] : "") + "." : "";
    // marker position as a fraction of the map: k runs left to right, F bottom to top
    mark.style.left = ((k - K0) / (KS * KN) + 0.5 / KN) * 100 + "%";
    mark.style.top = (1 - (F - F0) / (FS * FN) - 0.5 / FN) * 100 + "%";
    root.querySelectorAll("[data-f]").forEach((x) =>
      x.setAttribute("aria-pressed", +x.dataset.f === F && +x.dataset.k === k));
    start();
  }

  function draw() {
    const d = img.data, v = g.v;
    for (let i = 0; i < N * N; i++) {
      const t = Math.min(1, Math.max(0, v[i] / 0.4));
      // dark blue-black through the site accent to near white
      d[4 * i] = 18 + t * 237;
      d[4 * i + 1] = 18 + t * t * 200;
      d[4 * i + 2] = 32 + t * 90 * (1 - t) + t * t * 140;
      d[4 * i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tOut.textContent = g.t.toLocaleString("en-US");
  }

  function frame() {
    running = false;
    if (!visible || paused) return;
    const t0 = performance.now();
    G.step(g, spf);
    const dt = performance.now() - t0;
    // keep each frame near the budget so slow phones stay responsive
    if (dt < BUDGET * 0.7 && spf < MAXSPF) spf++;
    else if (dt > BUDGET * 1.3 && spf > 1) spf--;
    draw();
    start();
  }
  function start() {
    if (!running && !paused) { running = true; requestAnimationFrame(frame); }
  }

  // painting on the simulation drops new blots of v
  let painting = false;
  function paint(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * N), y = Math.floor(((e.clientY - r.top) / r.height) * N);
    if (x >= 0 && y >= 0 && x < N && y < N) { G.blot(g, x, y, 3); draw(); }
  }
  cv.addEventListener("pointerdown", (e) => { painting = true; cv.setPointerCapture(e.pointerId); paint(e); });
  cv.addEventListener("pointermove", (e) => { if (painting) paint(e); });
  cv.addEventListener("pointerup", () => (painting = false));
  cv.addEventListener("pointercancel", () => (painting = false));

  // clicking the map picks (F, k) from the grid cell under the pointer
  map.addEventListener("click", (e) => {
    const r = map.getBoundingClientRect();
    const b = Math.min(KN - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * KN)));
    const a = Math.min(FN - 1, Math.max(0, Math.floor((1 - (e.clientY - r.top) / r.height) * FN)));
    setParams(+(F0 + a * FS).toFixed(4), +(K0 + b * KS).toFixed(4), false);
  });

  root.querySelectorAll("[data-f]").forEach((b) =>
    b.addEventListener("click", () => setParams(+b.dataset.f, +b.dataset.k, true)));
  $("gs-reset").addEventListener("click", () => setParams(g.F, g.k, true));
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "play" : "pause";
    pauseBtn.setAttribute("aria-pressed", paused);
    start();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }).observe(root);
  }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) start(); });

  cv.width = N; cv.height = N;
  const first = root.querySelector("[data-f][aria-pressed='true']") || root.querySelector("[data-f]");
  setParams(+first.dataset.f, +first.dataset.k, true);
})();
