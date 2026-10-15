// Random walkers on the d-dimensional grid, run in slices so a page stays responsive.
// Records the step at which each walker first comes back to the origin.
(function (root) {
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      const t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = c << 21 | c >>> 11;
      c = c + t | 0;
      return t >>> 0;
    };
  }

  // Pólya's return probabilities (1 in 1D and 2D; Watson and later numerics above).
  const TRUE = { 1: 1, 2: 1, 3: 0.340537, 4: 0.193206, 5: 0.135178 };

  function create(d, cap, seed) {
    const rand = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0);
    for (let i = 0; i < 12; i++) rand();
    return { d, cap, rand, first: new Float64Array(cap + 1), walkers: 0, pos: new Int32Array(d), t: 0, nz: 0 };
  }

  // Take up to `budget` steps; returns how many were taken.
  function run(w, budget) {
    const { d, cap, rand, first, pos } = w;
    const k = 2 * d, scale = k / 4294967296;
    let t = w.t, nz = w.nz, done = 0;
    while (done < budget) {
      const r = (rand() * scale) | 0;
      const a = r >> 1, old = pos[a], nw = r & 1 ? old + 1 : old - 1;
      pos[a] = nw;
      if (old === 0) nz++; else if (nw === 0) nz--;
      t++; done++;
      if (nz === 0 || t === cap) {
        if (nz === 0) first[t]++;
        w.walkers++;
        pos.fill(0); t = 0; nz = 0;
      }
    }
    w.t = t; w.nz = nz;
    return done;
  }

  // P(back by n) for every n, from finished walkers only.
  function cumulative(w) {
    const out = new Float64Array(w.cap + 1);
    let s = 0;
    for (let n = 1; n <= w.cap; n++) { s += w.first[n]; out[n] = w.walkers ? s / w.walkers : 0; }
    return out;
  }

  const api = { create, run, cumulative, TRUE };
  if (typeof module !== "undefined") module.exports = api; else root.KitPolya = api;
})(this);
