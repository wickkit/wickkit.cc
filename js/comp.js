// Random text with a known entropy rate, and an adaptive counting model to compress it.
// Works in the browser (window.KitComp) and under node (module.exports).
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

  // gamma(alpha) sample for alpha <= 1 or > 1 (Marsaglia-Tsang, with the boost for alpha < 1)
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

  // An order-k Markov source over A symbols. Each context gets its own
  // next-symbol distribution, drawn from a Dirichlet(alpha): small alpha = predictable.
  function source(A, k, alpha, seed) {
    const r = rng(seed), C = A ** k, T = new Float64Array(C * A);
    for (let c = 0; c < C; c++) {
      let s = 0;
      for (let a = 0; a < A; a++) s += T[c * A + a] = gamma(alpha, r) + 1e-12;
      for (let a = 0; a < A; a++) T[c * A + a] /= s;
    }
    return { A, k, C, T, H: entropyRate(A, C, T) };
  }

  // a memoryless source with the given symbol probabilities
  function fixed(probs) {
    const A = probs.length, sum = probs.reduce((x, y) => x + y, 0);
    const T = Float64Array.from(probs, (p) => p / sum);
    return { A, k: 0, C: 1, T, H: entropyRate(A, 1, T) };
  }

  // entropy rate in bits/symbol: stationary context distribution times per-context entropy
  function entropyRate(A, C, T) {
    let pi = new Float64Array(C).fill(1 / C), nx = new Float64Array(C);
    for (let it = 0; it < 2000; it++) {
      nx.fill(0);
      for (let c = 0; c < C; c++) {
        const p = pi[c];
        if (!p) continue;
        for (let a = 0; a < A; a++) nx[(c * A + a) % C] += p * T[c * A + a];
      }
      let d = 0;
      for (let c = 0; c < C; c++) { d += Math.abs(nx[c] - pi[c]); }
      [pi, nx] = [nx, pi];
      if (d < 1e-13) break;
    }
    let H = 0;
    for (let c = 0; c < C; c++) {
      let h = 0;
      for (let a = 0; a < A; a++) { const p = T[c * A + a]; if (p > 0) h -= p * Math.log2(p); }
      H += pi[c] * h;
    }
    return H;
  }

  function generate(src, n, seed) {
    const r = rng(seed), { A, C, T } = src, out = new Uint8Array(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      let u = r(), a = 0, base = c * A;
      while (a < A - 1 && (u -= T[base + a]) >= 0) a++;
      out[i] = a;
      c = (c * A + a) % C;
    }
    return out;
  }

  // Adaptive counting model (Krichevsky-Trofimov): P(next = a | context) =
  // (count(context, a) + 1/2) / (count(context) + A/2). Returns the ideal code
  // length in bits after each checkpoint (an arithmetic coder gets within 2 bits of it).
  function countingBits(sym, A, k, checkpoints) {
    const C = A ** k, cnt = new Uint32Array(C * A), tot = new Uint32Array(C), out = [];
    let c = 0, bits = 0, j = 0;
    for (let i = 0; i < sym.length && j < checkpoints.length; i++) {
      const a = sym[i];
      bits -= Math.log2((cnt[c * A + a] + 0.5) / (tot[c] + A / 2));
      cnt[c * A + a]++; tot[c]++;
      c = (c * A + a) % C;
      if (i + 1 === checkpoints[j]) { out.push(bits); j++; }
    }
    return out;
  }

  // what the true model itself pays (sanity check: should hover at H)
  function trueBits(src, sym, checkpoints) {
    const { A, C, T } = src, out = [];
    let c = 0, bits = 0, j = 0;
    for (let i = 0; i < sym.length && j < checkpoints.length; i++) {
      bits -= Math.log2(T[c * A + sym[i]]);
      c = (c * A + sym[i]) % C;
      if (i + 1 === checkpoints[j]) { out.push(bits); j++; }
    }
    return out;
  }

  const api = { rng, source, fixed, generate, countingBits, trueBits, entropyRate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitComp = api;
})(typeof window !== "undefined" ? window : globalThis);
