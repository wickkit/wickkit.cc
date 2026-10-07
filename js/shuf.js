// Shuffle models and randomness tests for the "Shuffle it yourself" widget.
// Models match the ones in the overhand and neat-riffle posts.
(function (root) {
  const N = 52;

  function binom(m) { let k = 0; for (let i = 0; i < m; i++) if (Math.random() < 0.5) k++; return k; }

  // Gilbert-Shannon-Reeds: binomial cut, cards drop in proportion to pile sizes.
  function riffle(d, tmp) {
    const cut = binom(N); let i = 0, j = cut, o = 0;
    while (o < N) {
      const L = cut - i, R = N - j;
      tmp[o++] = Math.random() * (L + R) < L ? d[i++] : d[j++];
    }
    d.set(tmp);
  }

  // Neat riffle: cut near the middle, switch sides with probability q after each card.
  function neat(d, tmp, q) {
    const M = 8; let cut = Math.round(N / 2 + binom(2 * M) - M); cut = Math.max(1, Math.min(N - 1, cut));
    let i = 0, j = cut, o = 0, side = Math.random() < 0.5 ? 0 : 1;
    while (o < N) {
      if (i >= cut) side = 1; else if (j >= N) side = 0;
      tmp[o++] = side === 0 ? d[i++] : d[j++];
      if (Math.random() < q) side ^= 1;
    }
    d.set(tmp);
  }

  // Overhand (Pemantle): each gap is a cut with probability p; packets land in reverse order.
  function overhand(d, tmp, p) {
    let o = N, start = 0;
    for (let k = 1; k <= N; k++) {
      if (k === N || Math.random() < p) {
        const len = k - start; o -= len;
        for (let t = 0; t < len; t++) tmp[o + t] = d[start + t];
        start = k;
      }
    }
    d.set(tmp);
  }

  function uniform(d) {
    for (let i = N - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = d[i]; d[i] = d[j]; d[j] = t; }
  }

  // d[k] = original position of the card now at position k (0 = top).
  // Rising sequences: 1 + number of cards c whose successor c+1 sits above it.
  // Neighbours: original pairs (c, c+1) still touching, either order.
  // Inversions: pairs out of their original order.
  function stats(d, pos) {
    for (let k = 0; k < N; k++) pos[d[k]] = k;
    let rise = 1, nb = 0, inv = 0;
    for (let c = 0; c < N - 1; c++) {
      if (pos[c + 1] < pos[c]) rise++;
      if (Math.abs(pos[c + 1] - pos[c]) === 1) nb++;
    }
    for (let a = 0; a < N; a++) { const x = d[a]; for (let b = a + 1; b < N; b++) if (d[b] < x) inv++; }
    return [rise, nb, inv];
  }

  // Acceptance range per test: the narrowest-tailed interval holding >= 95% of random decks,
  // trimming from whichever tail is lighter. Built from a sample of uniformly shuffled decks.
  function calibrate(samples) {
    const d = new Int16Array(N), pos = new Int16Array(N);
    const cols = [[], [], []];
    for (let s = 0; s < samples; s++) {
      for (let k = 0; k < N; k++) d[k] = k;
      uniform(d);
      const st = stats(d, pos);
      for (let t = 0; t < 3; t++) cols[t].push(st[t]);
    }
    const ranges = cols.map(c => {
      c.sort((a, b) => a - b);
      let lo = 0, hi = c.length - 1, cut = 0;
      const budget = Math.floor(0.05 * c.length);
      for (;;) { // drop whole values (ties) from the lighter tail while within budget
        let nl = 0; while (lo + nl <= hi && c[lo + nl] === c[lo]) nl++;
        let nh = 0; while (hi - nh >= lo && c[hi - nh] === c[hi]) nh++;
        const take = nl <= nh ? nl : nh;
        if (cut + take > budget) break;
        cut += take; if (nl <= nh) lo += nl; else hi -= nh;
      }
      return [c[lo], c[hi]];
    });
    // Pass rates of random decks (fresh sample, so the numbers aren't fit to themselves).
    let pass = [0, 0, 0], all = 0;
    for (let s = 0; s < samples; s++) {
      for (let k = 0; k < N; k++) d[k] = k;
      uniform(d);
      const st = stats(d, pos); let ok = true;
      for (let t = 0; t < 3; t++) { const p = st[t] >= ranges[t][0] && st[t] <= ranges[t][1]; if (p) pass[t]++; else ok = false; }
      if (ok) all++;
    }
    return { ranges, pass: pass.map(x => x / samples), all: all / samples };
  }

  // A batch of decks shuffled with the same model, for pass rates.
  function Batch(size) {
    this.size = size;
    this.decks = new Int16Array(size * N);
    this.tmp = new Int16Array(N);
    this.pos = new Int16Array(N);
    this.reset();
  }
  Batch.prototype.reset = function () {
    for (let s = 0; s < this.size; s++) for (let k = 0; k < N; k++) this.decks[s * N + k] = k;
  };
  Batch.prototype.step = function (fn, param) {
    for (let s = 0; s < this.size; s++) fn(this.decks.subarray(s * N, s * N + N), this.tmp, param);
  };
  Batch.prototype.passRates = function (ranges) {
    const pass = [0, 0, 0]; let all = 0;
    for (let s = 0; s < this.size; s++) {
      const st = stats(this.decks.subarray(s * N, s * N + N), this.pos); let ok = true;
      for (let t = 0; t < 3; t++) { if (st[t] >= ranges[t][0] && st[t] <= ranges[t][1]) pass[t]++; else ok = false; }
      if (ok) all++;
    }
    return { pass: pass.map(x => x / this.size), all: all / this.size };
  };

  const Shuf = { N, riffle, neat, overhand, uniform, stats, calibrate, Batch };
  if (typeof module !== 'undefined') module.exports = Shuf; else root.Shuf = Shuf;
})(this);
