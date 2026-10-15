// Langton's ant on an n×n grid, started on a k×k patch of random black cells.
// Works in the browser (window.KitAnt) and in node (module.exports).
// The highway check matches the post: the ant's turns repeat with period 104
// for 12 periods, and the ant then leaves the box of every cell it touched
// before that stretch (patch included). Onset is the stretch's first step.
(function (root) {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const PER = 104, W = PER * 12;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function create(n, k, p, seed) {
    const a = { n, k, p, grid: new Uint8Array(n * n), seen: new Uint8Array(n * n),
      hist: new Uint8Array(W), t: 0, d: 0, same: 0, cand: -1, onset: -1, out: false };
    const rnd = rng(seed), off = (n >> 1) - (k >> 1);
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++)
      if (rnd() < p) a.grid[(off + y) * n + off + x] = 1;
    a.x = a.y = n >> 1;
    a.off = off;
    if (k > 0) { a.x0 = off; a.x1 = off + k - 1; a.y0 = off; a.y1 = off + k - 1; }
    else { a.x0 = a.x1 = a.x; a.y0 = a.y1 = a.y; }
    // view box: everything touched so far, never frozen
    a.vx0 = a.x0; a.vx1 = a.x1; a.vy0 = a.y0; a.vy1 = a.y1;
    return a;
  }

  // Run up to `steps` steps; stops early at the grid edge. Returns steps run.
  function run(a, steps) {
    const n = a.n, g = a.grid, seen = a.seen, hist = a.hist;
    let { x, y, d, t, same, cand } = a, i = 0;
    for (; i < steps; i++) {
      if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) { a.out = true; break; }
      const j = y * n + x, c = g[j];
      d = (d + (c ? 3 : 1)) & 3;            // white: right, black: left
      g[j] = c ^ 1; seen[j] = 1;
      if (cand < 0) {
        if (x < a.x0) a.x0 = x; if (x > a.x1) a.x1 = x;
        if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y;
      }
      if (x < a.vx0) a.vx0 = x; if (x > a.vx1) a.vx1 = x;
      if (y < a.vy0) a.vy0 = y; if (y > a.vy1) a.vy1 = y;
      x += DX[d]; y += DY[d];
      const h = t % W;
      same = (t >= PER && hist[(h - PER + W) % W] === c) ? same + 1 : 0;
      hist[h] = c;
      if (cand < 0 && same >= W) {
        cand = t - same - PER + 1;
        a.bx0 = a.x0; a.bx1 = a.x1; a.by0 = a.y0; a.by1 = a.y1;
      } else if (cand >= 0 && same === 0) cand = -1;
      t++;
      if (a.onset < 0 && cand >= 0 &&
          (x < a.bx0 - 2 || x > a.bx1 + 2 || y < a.by0 - 2 || y > a.by1 + 2)) a.onset = cand;
    }
    a.x = x; a.y = y; a.d = d; a.t = t; a.same = same; a.cand = cand;
    return i;
  }

  const api = { create, run, rng };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitAnt = api;
})(typeof window !== "undefined" ? window : globalThis);
