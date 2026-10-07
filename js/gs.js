// Gray-Scott reaction-diffusion on a wrapping grid. Works in the browser
// (window.KitGS) and in node (module.exports).
//   du/dt = Du*lap(u) - u*v^2 + F*(1-u)
//   dv/dt = Dv*lap(v) + u*v^2 - (F+k)*v
(function (root) {
  const DU = 1.0, DV = 0.5, DT = 1.0;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function create(n, F, k) {
    return { n, F, k, u: new Float32Array(n * n).fill(1), v: new Float32Array(n * n),
      u2: new Float32Array(n * n), v2: new Float32Array(n * n), t: 0 };
  }

  // drop a square of v (and depleted u) centred at (cx, cy), radius r
  function blot(g, cx, cy, r) {
    const n = g.n;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const i = ((cy + dy + n) % n) * n + ((cx + dx + n) % n);
        g.u[i] = 0.5; g.v[i] = 0.25;
      }
  }

  // the standard start: a few blots plus a little noise
  function seed(g, s, blots = 6) {
    const r = rng(s), n = g.n;
    g.u.fill(1); g.v.fill(0); g.t = 0;
    for (let b = 0; b < blots; b++)
      blot(g, Math.floor(r() * n), Math.floor(r() * n), Math.max(2, Math.round(n / 24)));
    for (let i = 0; i < n * n; i++) {
      g.u[i] = Math.min(1, Math.max(0, g.u[i] + (r() - 0.5) * 0.02));
      g.v[i] = Math.min(1, Math.max(0, g.v[i] + (r() - 0.5) * 0.02));
    }
  }

  // one explicit Euler step; 9-point Laplacian (sides .2, corners .05)
  function step(g, steps = 1) {
    const n = g.n, F = g.F, kk = g.F + g.k;
    for (let s = 0; s < steps; s++) {
      const u = g.u, v = g.v, U = g.u2, V = g.v2;
      for (let y = 0; y < n; y++) {
        const ym = ((y - 1 + n) % n) * n, y0 = y * n, yp = ((y + 1) % n) * n;
        for (let x = 0; x < n; x++) {
          const xm = x === 0 ? n - 1 : x - 1, xp = x === n - 1 ? 0 : x + 1, i = y0 + x;
          const uc = u[i], vc = v[i];
          const lu = 0.2 * (u[ym + x] + u[yp + x] + u[y0 + xm] + u[y0 + xp])
            + 0.05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) - uc;
          const lv = 0.2 * (v[ym + x] + v[yp + x] + v[y0 + xm] + v[y0 + xp])
            + 0.05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) - vc;
          const r = uc * vc * vc;
          U[i] = uc + DT * (DU * lu - r + F * (1 - uc));
          V[i] = vc + DT * (DV * lv + r - kk * vc);
        }
      }
      g.u = U; g.v = V; g.u2 = u; g.v2 = v; g.t++;
    }
  }

  const api = { create, seed, blot, step, rng, DU, DV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitGS = api;
})(typeof window !== "undefined" ? window : globalThis);
