// Variable-memory random sources, and context tree weighting (CTW) to compress them.
// Works in the browser (window.KitCTW) and under node (module.exports).
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gamma(alpha, r) {
    if (alpha < 1) return gamma(alpha + 1, r) * Math.pow(r(), 1 / alpha);
    const d = alpha - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do {
        const u1 = r(), u2 = r();
        x = Math.sqrt(-2 * Math.log(u1 || 1e-300)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = r();
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  }

  // A source whose memory is a context tree. Starting from "no memory", each node
  // looks one symbol further back with probability p (always at the root, never past
  // depth K). Each leaf gets its own next-symbol odds from a Dirichlet(alpha).
  // p = 1 gives an ordinary order-K Markov source. A context is a number whose
  // lowest digit (base A) is the most recent symbol.
  function treeSource(A, K, p, alpha, seed) {
    const r = rng(seed), leaves = [];
    (function grow(suf) {
      if (suf.length < K && (suf.length === 0 || r() < p)) for (let a = 0; a < A; a++) grow(suf.concat(a));
      else leaves.push(suf);
    })([]);
    const odds = leaves.map(() => {
      const w = Array.from({ length: A }, () => gamma(alpha, r) + 1e-12), s = w.reduce((x, y) => x + y, 0);
      return w.map((x) => x / s);
    });
    const key = (suf) => suf.join(",");
    const leafIdx = new Map(leaves.map((s, i) => [key(s), i]));
    const C = A ** K, T = new Float64Array(C * A), leafOf = new Int32Array(C);
    for (let c = 0; c < C; c++) {
      const digs = [];
      for (let j = 0, x = c; j < K; j++, x = Math.floor(x / A)) digs.push(x % A);
      for (let d = 0; d <= K; d++) {
        const i = leafIdx.get(key(digs.slice(0, d)));
        if (i !== undefined) { leafOf[c] = i; break; }
      }
      for (let a = 0; a < A; a++) T[c * A + a] = odds[leafOf[c]][a];
    }
    return { A, k: K, C, T, leaves, leafOf, H: entropyRate(A, C, T) };
  }

  function entropyRate(A, C, T) {
    let pi = new Float64Array(C).fill(1 / C), nx = new Float64Array(C);
    for (let it = 0; it < 5000; it++) {
      nx.fill(0);
      for (let c = 0; c < C; c++) {
        const q = pi[c];
        if (!q) continue;
        for (let a = 0; a < A; a++) nx[(c * A + a) % C] += q * T[c * A + a];
      }
      let d = 0;
      for (let c = 0; c < C; c++) d += Math.abs(nx[c] - pi[c]);
      [pi, nx] = [nx, pi];
      if (d < 1e-13) break;
    }
    let H = 0;
    for (let c = 0; c < C; c++) {
      let h = 0;
      for (let a = 0; a < A; a++) { const q = T[c * A + a]; if (q > 0) h -= q * Math.log2(q); }
      H += pi[c] * h;
    }
    return H;
  }

  // Streams symbols one at a time; ctx is the order-K context of the next symbol.
  function stream(src, seed) {
    const r = rng(seed), { A, C, T } = src;
    let c = 0;
    return {
      get ctx() { return c; },
      next() {
        let u = r(), a = 0;
        const base = c * A;
        while (a < A - 1 && (u -= T[base + a]) >= 0) a++;
        c = (c * A + a) % C;
        return a;
      },
    };
  }

  // log2(2^a/2 + 2^b/2)
  function mix(a, b) {
    const m = a > b ? a : b, s = a > b ? b : a;
    return m + Math.log2(1 + 2 ** (s - m)) - 1;
  }

  // CTW with max depth D. Every node (a context of length d <= D) keeps a
  // Krichevsky-Trofimov counting estimate Pe. Its weighted probability is
  // Pw = Pe/2 + (product of its children's Pw)/2, and Pw at depth D is just Pe.
  // The root's Pw is the probability of everything seen so far.
  function ctw(A, D) {
    const off = [0];
    for (let d = 0; d <= D; d++) off.push(off[d] + A ** d);
    const M = off[D + 1];
    const cnt = new Uint32Array(M * A), tot = new Uint32Array(M);
    const le = new Float64Array(M), lw = new Float64Array(M), lc = new Float64Array(M); // log2 Pe, Pw, children
    const hist = new Int32Array(Math.max(D, 1)), path = new Int32Array(D + 1);
    let bits = 0;
    function update(s) {
      for (let d = 0, c = 0, m = 1; d <= D; d++) {
        path[d] = off[d] + c;
        if (d < D) { c += hist[d] * m; m *= A; }
      }
      let oldW = 0, newW = 0;
      for (let d = D; d >= 0; d--) {
        const k = path[d];
        le[k] += Math.log2((cnt[k * A + s] + 0.5) / (tot[k] + A / 2));
        cnt[k * A + s]++; tot[k]++;
        const prev = lw[k];
        if (d === D) lw[k] = le[k];
        else { lc[k] += newW - oldW; lw[k] = mix(le[k], lc[k]); }
        oldW = prev; newW = lw[k];
      }
      for (let j = D - 1; j > 0; j--) hist[j] = hist[j - 1];
      if (D > 0) hist[0] = s;
      bits = -lw[0];
    }
    // node for a context given most-recent-first; does the model prefer looking further back here?
    const index = (suf) => off[suf.length] + suf.reduce((c, a, j) => c + a * A ** j, 0);
    const splits = (suf) => suf.length < D && lc[index(suf)] > le[index(suf)];
    const seen = (suf) => tot[index(suf)];
    return { update, splits, seen, get bits() { return bits; }, D, A };
  }

  // Counting model with fixed memory k, and one that knows the true tree.
  function counting(A, k) {
    const C = A ** k, cnt = new Uint32Array(C * A), tot = new Uint32Array(C);
    let c = 0, bits = 0;
    return {
      update(s) {
        bits -= Math.log2((cnt[c * A + s] + 0.5) / (tot[c] + A / 2));
        cnt[c * A + s]++; tot[c]++;
        c = (c * A + s) % C;
      },
      get bits() { return bits; },
    };
  }
  function oracle(src) {
    const { A, leafOf } = src, L = src.leaves.length, cnt = new Uint32Array(L * A), tot = new Uint32Array(L);
    let bits = 0;
    return {
      update(s, ctx) {
        const l = leafOf[ctx];
        bits -= Math.log2((cnt[l * A + s] + 0.5) / (tot[l] + A / 2));
        cnt[l * A + s]++; tot[l]++;
      },
      get bits() { return bits; },
    };
  }

  // What CTW's prior charges for a tree when the max depth is D: one bit for every
  // node shallower than D (split or stop), nothing for nodes at depth D.
  function treeBits(src, D) {
    const depths = src.leaves.map((s) => s.length);
    if (Math.max(...depths) > D) return null;
    return (src.leaves.length - 1) / (src.A - 1) + depths.filter((d) => d < D).length;
  }

  const api = { rng, treeSource, entropyRate, stream, ctw, counting, oracle, treeBits };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitCTW = api;
})(typeof window !== "undefined" ? window : globalThis);
