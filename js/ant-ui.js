// Interactive Langton's ant for the noise post. Needs ant.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const A = window.KitAnt;
  if (!A || !$("la")) return;

  const N = 2048, PX = 512, EMPTY = 9977, AFTER = 5000;
  const SPEED = { slow: 40, fast: 1500, fastest: 60000 };
  const cv = $("la-sim"), ctx = cv.getContext("2d");
  cv.width = PX; cv.height = PX;
  const img = ctx.createImageData(PX, PX), px = new Uint32Array(img.data.buffer);
  const rgba = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  const BG = rgba(18, 18, 32), SEEN = rgba(34, 36, 58), PATCH = rgba(78, 92, 130),
    BLACK = rgba(170, 200, 240), ANT = rgba(255, 140, 60);
  const fmt = (n) => n.toLocaleString("en-US");

  let k = 8, p = 0.3, speed = "fast", a, paused = false, running = false, visible = true, done = false;

  function reset() {
    a = A.create(N, k, p, (Math.random() * 1e9) | 0);
    done = false;
    draw(); stats(); start();
  }

  function draw() {
    const g = a.grid, seen = a.seen;
    // square view around everything touched, at least 48 cells across
    let w = Math.max(a.vx1 - a.vx0, a.vy1 - a.vy0, 48) + 8;
    const cx = (a.vx0 + a.vx1) / 2, cy = (a.vy0 + a.vy1) / 2;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - w / 2), s = w / PX;
    for (let py = 0; py < PX; py++) {
      const y = Math.min(N - 1, Math.max(0, y0 + Math.floor(py * s)));
      for (let qx = 0; qx < PX; qx++) {
        const x = Math.min(N - 1, Math.max(0, x0 + Math.floor(qx * s))), j = y * N + x;
        px[py * PX + qx] = g[j] ? (seen[j] ? BLACK : PATCH) : (seen[j] ? SEEN : BG);
      }
    }
    // the ant, at least 3 px wide
    const ax = Math.floor((a.x - x0) / s), ay = Math.floor((a.y - y0) / s), r = Math.max(1, Math.ceil(0.5 / s));
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const qx = ax + dx, qy = ay + dy;
      if (qx >= 0 && qy >= 0 && qx < PX && qy < PX) px[qy * PX + qx] = ANT;
    }
    ctx.putImageData(img, 0, 0);
  }

  function stats() {
    $("la-t").textContent = fmt(a.t);
    if (a.onset >= 0) {
      $("la-on").textContent = fmt(a.onset);
      const r = EMPTY / a.onset;
      $("la-vs").textContent = r >= 1 ? `${r.toFixed(1)}× sooner` : `${(1 / r).toFixed(1)}× later`;
    } else {
      $("la-on").textContent = a.out ? "hit the edge" : "not yet";
      $("la-vs").textContent = "–";
    }
    $("la-st").textContent = done ? "done" : paused ? "paused" : a.onset >= 0 ? "on the highway" : a.cand >= 0 ? "highway forming" : "wandering";
  }

  function frame() {
    running = false;
    if (!visible || paused || done) return;
    A.run(a, SPEED[speed]);
    if (a.out || (a.onset >= 0 && a.t > a.onset + AFTER + 12 * 104)) done = true;
    draw(); stats();
    start();
  }
  function start() {
    if (!running && visible && !paused && !done) { running = true; requestAnimationFrame(frame); }
  }

  function press(group, btn) {
    for (const b of document.querySelectorAll(`#la [data-${group}]`)) b.setAttribute("aria-pressed", b === btn);
  }
  for (const b of document.querySelectorAll("#la [data-k]"))
    b.addEventListener("click", () => { k = +b.dataset.k; press("k", b); reset(); });
  for (const b of document.querySelectorAll("#la [data-speed]"))
    b.addEventListener("click", () => { speed = b.dataset.speed; press("speed", b); start(); });
  const dens = $("la-p");
  dens.addEventListener("input", () => { p = dens.value / 100; $("la-pv").textContent = `${dens.value}%`; });
  dens.addEventListener("change", reset);
  $("la-reset").addEventListener("click", reset);
  $("la-pause").addEventListener("click", (e) => {
    paused = !paused; e.target.setAttribute("aria-pressed", paused);
    e.target.textContent = paused ? "resume" : "pause";
    stats(); start();
  });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe(cv);
  reset();
})();
