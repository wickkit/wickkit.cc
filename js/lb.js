// Load balancing with stale information: the simulator behind the post.
// Supermarket model with stale load info.
// n servers, Poisson arrivals at rate lam*n, exp(1) service, FIFO.
// Uniformized: each step is an arrival w.p. lam/(1+lam), else a potential
// departure at a uniformly random server. Time-average of N over steps is
// the time average, so E[T] = E[N]/(lam*n) by Little.
// Dispatcher sees a board refreshed every T time units (T=0: live loads).
// d choices sampled with replacement? No: without replacement (d distinct).
// d >= n means "all servers" (join the least loaded on the board).
// k dispatchers (arrivals split randomly among them). own: each dispatcher
// adds its own sends since the last refresh to the board values.
// d = 'rr': each dispatcher round-robins on its own, no load info at all.
'use strict';

function sfc32(seed) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed | 0;
  const r = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 20; i++) r();
  return r;
}

function make(opts) {
  const n = opts.n, lam = opts.lam, d = opts.d === 'rr' ? 1 : Math.min(opts.d, n), T = opts.T || 0;
  // k dispatchers; own=true: each adds its own sends since the refresh.
  const k = opts.k || 1, own = !!opts.own, rr = opts.d === 'rr';
  const rnd = sfc32(opts.seed || 1);
  const q = new Int32Array(n);
  const board = new Int32Array(n);
  const sent = own && T > 0 ? new Int32Array(k * n) : null;
  const ptr = Int32Array.from({ length: k }, () => Math.floor(rnd() * n));
  const pA = lam / (1 + lam);
  const stepsPerTime = n * (1 + lam);
  const refreshEvery = T > 0 ? Math.max(1, Math.round(T * stepsPerTime)) : 0;
  let phase = refreshEvery ? Math.floor(rnd() * refreshEvery) : 0;
  let total = 0;
  const pick = new Int32Array(d);
  const view = (i, off) => (T > 0 ? board[i] : q[i]) + (sent ? sent[off + i] : 0);

  function arrive() {
    const who = k > 1 ? Math.floor(rnd() * k) : 0, off = who * n;
    let best = -1, bv = 0, ties = 0;
    if (rr) {
      best = ptr[who]; ptr[who] = (best + 1) % n;
    } else if (d === n) {
      for (let i = 0; i < n; i++) {
        const v = view(i, off);
        if (best < 0 || v < bv) { best = i; bv = v; ties = 1; }
        else if (v === bv && rnd() * ++ties < 1) best = i;
      }
    } else if (d === 1) {
      best = Math.floor(rnd() * n);
    } else {
      // d distinct by rejection (d << n)
      for (let j = 0; j < d; j++) {
        let s;
        do { s = Math.floor(rnd() * n); } while (pick.subarray(0, j).includes(s));
        pick[j] = s;
        const v = view(s, off);
        if (best < 0 || v < bv) { best = s; bv = v; ties = 1; }
        else if (v === bv && rnd() * ++ties < 1) best = s;
      }
    }
    q[best]++; total++;
    if (sent) sent[off + best]++;
  }

  function step() {
    if (refreshEvery && ++phase >= refreshEvery) {
      phase = 0; board.set(q); if (sent) sent.fill(0);
    }
    if (rnd() < pA) arrive();
    else { const i = Math.floor(rnd() * n); if (q[i] > 0) { q[i]--; total--; } }
  }

  return {
    q, board, step,
    get live() { return T === 0; },
    get total() { return total; },
    run(time) { // returns time-average of total jobs
      const steps = Math.round(time * stepsPerTime);
      let acc = 0;
      for (let s = 0; s < steps; s++) { step(); acc += total; }
      return acc / steps;
    },
    stepsPerTime,
  };
}

// mean response time with batch-means SE
function measure(opts, warm, time, batches = 20) {
  const m = make(opts);
  m.run(warm);
  const xs = [];
  for (let b = 0; b < batches; b++) xs.push(m.run(time / batches) / (opts.lam * opts.n));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return { mean, se: Math.sqrt(v / xs.length) };
}

// Supermarket-model limit (n -> inf, fresh info): E[T] = sum_{i>=1} lam^{(d^i - d)/(d-1)}
function supermarket(lam, d) {
  if (d === 1) return 1 / (1 - lam);
  let s = 0;
  for (let i = 1; i < 200; i++) { const t = lam ** ((d ** i - d) / (d - 1)); s += t; if (t < 1e-15) break; }
  return s;
}

if (typeof module !== 'undefined') module.exports = { make, measure, supermarket, sfc32 };
else window.KitLB = { make, measure, supermarket };
