// Abelian sandpile (Bak-Tang-Wiesenfeld) and the stochastic Manna pile on an
// n×n grid whose edges dump grains off the table. Works in the browser
// (window.KitSand) and in node (module.exports).
//   BTW:   a site with 4+ grains topples, sending one grain to each neighbour.
//   Manna: a site with 2+ grains topples, sending two grains to neighbours
//          picked at random.
(function (root) {
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function create(n, model, seed) {
    const g = { n, model: model || "btw", z: new Uint8Array(n * n),
      mark: new Int32Array(n * n), stack: new Int32Array(n * n * 4 + 16),
      id: 0, rand: rng(seed || 1), grains: 0 };
    // all-3 is already a recurrent (steady-state) BTW pile; Manna has to be
    // filled up by dropping grains, so start it half full
    g.z.fill(g.model === "btw" ? 3 : 1);
    return g;
  }

  const TH = { btw: 4, manna: 2 };

  // Drop one grain at site i and relax. Returns the avalanche:
  // s = topplings, a = distinct sites that toppled, out = grains lost off the edge,
  // w = times the drop site itself toppled (BTW: the number of waves).
  // If onTopple is given it's called with each site as it topples (for drawing).
  function drop(g, i, onTopple) {
    const n = g.n, z = g.z, mark = g.mark, st = g.stack, th = TH[g.model];
    const id = ++g.id, manna = g.model === "manna", rand = g.rand;
    let s = 0, a = 0, out = 0, w = 0, sp = 0;
    z[i]++;
    if (z[i] >= th) st[sp++] = i;
    while (sp > 0) {
      const j = st[--sp];
      if (z[j] < th) continue;
      z[j] -= th; s++;
      if (j === i) w++;
      if (mark[j] !== id) { mark[j] = id; a++; }
      if (onTopple) onTopple(j);
      if (z[j] >= th) st[sp++] = j;
      const x = j % n, y = (j - x) / n;
      if (manna) {
        const r = (rand() * 16) | 0;
        for (let k = 0; k < 2; k++) {
          const d = k ? r >> 2 : r & 3;
          let t = -1;
          if (d === 0) { if (x > 0) t = j - 1; }
          else if (d === 1) { if (x < n - 1) t = j + 1; }
          else if (d === 2) { if (y > 0) t = j - n; }
          else if (y < n - 1) t = j + n;
          if (t < 0) { out++; continue; }
          if (++z[t] === th) st[sp++] = t;
        }
      } else {
        if (x > 0) { if (++z[j - 1] === th) st[sp++] = j - 1; } else out++;
        if (x < n - 1) { if (++z[j + 1] === th) st[sp++] = j + 1; } else out++;
        if (y > 0) { if (++z[j - n] === th) st[sp++] = j - n; } else out++;
        if (y < n - 1) { if (++z[j + n] === th) st[sp++] = j + n; } else out++;
      }
    }
    g.grains++;
    return { s, a, out, w };
  }

  function dropRandom(g, onTopple) {
    return drop(g, (g.rand() * g.n * g.n) | 0, onTopple);
  }

  function density(g) {
    let t = 0;
    for (let i = 0; i < g.z.length; i++) t += g.z[i];
    return t / g.z.length;
  }

  const api = { create, drop, dropRandom, density, rng };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitSand = api;
})(typeof window !== "undefined" ? window : globalThis);
