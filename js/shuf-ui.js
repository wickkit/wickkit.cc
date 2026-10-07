// UI for the "Shuffle it yourself" widget.
(function () {
  const S = window.Shuf, N = S.N;
  const root = document.getElementById('sh');
  if (!root) return;
  const $ = id => document.getElementById(id);

  // Acceptance ranges from 50,000 uniformly shuffled decks (Shuf.calibrate(50000)):
  // each holds about 95% of random decks; all three at once pass 87% of the time.
  const RANGES = [[23, 31], [0, 4], [540, 786]];
  const RANDOM_ALL = 0.87;
  const BATCH = 2000;

  // Shuffles needed to get within 0.25 of random (total variation), from the earlier posts.
  const NEAT_Q = [0.3, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99];
  const NEAT_NEED = [14, 9, 8, 7, 6, 6, 7, 9, 13, 17, 29];
  const OVER_K = [2, 4, 6, 10, 20];
  const OVER_NEED = [[301, 400], [51, 60], [21, 25], [31, 40], [81, 100]];

  const MODES = {
    riffle: { fn: S.riffle, slider: null, param: () => 0, need: () => [8, 8], needText: () => '8 (exact)' },
    neat: {
      fn: S.neat, slider: { label: 'Chance of switching sides after each card', n: NEAT_Q.length, def: 10, fmt: i => NEAT_Q[i].toFixed(2) },
      param: i => NEAT_Q[i], need: i => [NEAT_NEED[i], NEAT_NEED[i]], needText: i => 'at least ' + NEAT_NEED[i] + ' (proved)'
    },
    overhand: {
      fn: S.overhand, slider: { label: 'Average packet size (cards)', n: OVER_K.length, def: 1, fmt: i => String(OVER_K[i]) },
      param: i => 1 / OVER_K[i], need: i => OVER_NEED[i], needText: i => OVER_NEED[i][0] + '–' + OVER_NEED[i][1] + ' (simulated)'
    }
  };

  let mode = 'neat', idx = MODES.neat.slider.def;
  const deck = new Int16Array(N), tmp = new Int16Array(N), pos = new Int16Array(N);
  const batch = new S.Batch(BATCH);
  let history = [], rates = [], busy = 0;

  function reset() {
    for (let k = 0; k < N; k++) deck[k] = k;
    batch.reset();
    history = [deck.slice()];
    rates = [{ k: 0, all: 0 }];
    busy++; // cancels any run in progress
    draw();
  }

  function stepOnce() {
    const m = MODES[mode], p = m.param(idx);
    m.fn(deck, tmp, p);
    batch.step(m.fn, p);
    history.push(deck.slice());
    rates.push({ k: history.length - 1, all: batch.passRates(RANGES).all });
  }

  function run(n) {
    const token = ++busy;
    let left = n;
    (function chunk() {
      if (token !== busy) return;
      const t0 = performance.now();
      while (left > 0 && performance.now() - t0 < 30) { stepOnce(); left--; }
      draw();
      if (left > 0) requestAnimationFrame(chunk);
    })();
  }

  // ---- controls
  const presetBtns = root.querySelectorAll('[data-mode]');
  const slider = $('sh-p'), sliderOut = $('sh-p-out'), sliderLab = $('sh-p-lab'), sliderWrap = $('sh-p-wrap');
  function setMode(m) {
    mode = m;
    presetBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    const sl = MODES[m].slider;
    sliderWrap.hidden = !sl;
    if (sl) { slider.max = sl.n - 1; idx = sl.def; slider.value = idx; sliderLab.textContent = sl.label; sliderOut.textContent = sl.fmt(idx); }
    reset();
  }
  presetBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  slider.addEventListener('input', () => { idx = +slider.value; sliderOut.textContent = MODES[mode].slider.fmt(idx); reset(); });
  $('sh-1').addEventListener('click', () => run(1));
  $('sh-10').addEventListener('click', () => run(10));
  $('sh-100').addEventListener('click', () => run(100));
  $('sh-reset').addEventListener('click', reset);

  // ---- stats
  const TESTS = [
    { el: 'sh-rise', name: 'rising sequences' },
    { el: 'sh-nb', name: 'original neighbours still touching' },
    { el: 'sh-inv', name: 'pairs out of order' }
  ];
  function drawStats() {
    $('sh-k').textContent = history.length - 1;
    const st = S.stats(deck, pos);
    TESTS.forEach((t, i) => {
      const [lo, hi] = RANGES[i], v = st[i];
      const verdict = v < lo ? '✗ too few' : v > hi ? '✗ too many' : '✓ looks random';
      $(t.el).textContent = v;
      $(t.el + '-l').textContent = t.name + ' · ' + verdict + ' (random: ' + lo + '–' + hi + ')';
    });
    $('sh-need').textContent = MODES[mode].needText(idx);
  }

  // ---- deck history (canvas): one row per shuffle, newest at the bottom
  const cv = $('sh-deck'), ctx = cv.getContext('2d');
  const MAXROWS = 60;
  function colour(c) { return 'hsl(212, 70%, ' + (88 - 66 * c / (N - 1)).toFixed(1) + '%)'; }
  function drawDeck() {
    const rows = history.slice(-MAXROWS), first = history.length - rows.length;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600;
    const lab = 34, rowH = rows.length > 30 ? 6 : rows.length > 15 ? 10 : 14, gap = rowH > 6 ? 2 : 1;
    const H = Math.max(rows.length * rowH, 40);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cw = (W - lab) / N;
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#8a8aa0'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    rows.forEach((r, j) => {
      for (let k = 0; k < N; k++) { ctx.fillStyle = colour(r[k]); ctx.fillRect(lab + k * cw, j * rowH, Math.max(cw - (cw > 6 ? 1 : 0), 1), rowH - gap); }
      const n = first + j;
      if (j === rows.length - 1 || n % (rowH >= 10 ? 5 : 10) === 0) { ctx.fillStyle = '#8a8aa0'; ctx.fillText(String(n), lab - 6, j * rowH + (rowH - gap) / 2); }
    });
    cv._geom = { lab, cw, rowH, first, rows };
  }
  const tip = $('sh-tip');
  cv.addEventListener('pointermove', e => {
    const g = cv._geom; if (!g) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const k = Math.floor((x - g.lab) / g.cw), j = Math.floor(y / g.rowH);
    if (k < 0 || k >= N || j < 0 || j >= g.rows.length) { tip.hidden = true; return; }
    tip.innerHTML = 'after ' + (g.first + j) + ' shuffle' + (g.first + j === 1 ? '' : 's') + ', position ' + (k + 1) +
      '<br><span class="m">card that started at position ' + (g.rows[j][k] + 1) + '</span>';
    tip.hidden = false;
    tip.style.left = Math.min(x + 12, r.width - 190) + 'px'; tip.style.top = (y + cv.offsetTop + 12) + 'px';
  });
  cv.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') tip.hidden = true; });

  // ---- pass-rate chart (SVG)
  const svg = $('sh-chart'), NS = 'http://www.w3.org/2000/svg';
  // viewBox follows the rendered width so text stays readable on phones
  let W = 600;
  const H = 230, m = { l: 40, r: 14, t: 12, b: 30 };
  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); for (const a in attrs) e.setAttribute(a, attrs[a]); (parent || svg).appendChild(e); return e; }
  function niceMax(v) { const c = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600]; for (const x of c) if (v <= x) return x; return Math.ceil(v / 100) * 100; }
  let sx, sy;
  function drawChart() {
    svg.textContent = '';
    W = Math.max(300, Math.round(svg.clientWidth || 600));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const need = MODES[mode].need(idx), K = rates.length - 1;
    const xmax = niceMax(Math.max(10, K, Math.ceil(need[1] * 1.15)));
    sx = k => m.l + (W - m.l - m.r) * k / xmax;
    sy = v => m.t + (H - m.t - m.b) * (1 - v);
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      el('line', { class: v === 0 ? 'viz-base' : 'viz-grid', x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v) });
      el('text', { class: 'viz-tick', x: m.l - 6, y: sy(v) + 4, 'text-anchor': 'end' }).textContent = Math.round(v * 100) + '%';
    });
    let step = xmax <= 20 ? 2 : xmax <= 60 ? 10 : xmax <= 150 ? 25 : 100;
    if (W < 450 && xmax / step > 6) step *= 2;
    for (let k = 0; k <= xmax; k += step) el('text', { class: 'viz-tick', x: sx(k), y: H - m.b + 16, 'text-anchor': 'middle' }).textContent = k;
    el('text', { class: 'viz-tick', x: W - m.r, y: H - 2, 'text-anchor': 'end' }).textContent = 'shuffles';
    // needed (band if a range)
    if (need[1] > need[0]) el('rect', { class: 'sh-need-band', x: sx(need[0]), y: m.t, width: sx(need[1]) - sx(need[0]), height: H - m.t - m.b });
    el('line', { class: 'sh-need', x1: sx(need[0]), x2: sx(need[0]), y1: m.t, y2: H - m.b });
    el('text', { class: 'viz-tick', x: sx(need[1]) + 5, y: H - m.b - 8 }).textContent = 'random enough';
    // random-deck reference
    el('line', { class: 'sh-ref', x1: m.l, x2: W - m.r, y1: sy(RANDOM_ALL), y2: sy(RANDOM_ALL) });
    el('text', { class: 'viz-tick', x: m.l + 6, y: sy(RANDOM_ALL) - 6 }).textContent = 'a truly random deck: 87%';
    if (rates.length > 1) {
      el('path', { class: 'viz-line s2', d: rates.map((r, i) => (i ? 'L' : 'M') + sx(r.k).toFixed(1) + ',' + sy(r.all).toFixed(1)).join('') });
      const last = rates[rates.length - 1];
      el('circle', { class: 'viz-dot s2', r: 4, cx: sx(last.k), cy: sy(last.all) });
    }
    cross = el('line', { class: 'viz-cross', y1: m.t, y2: H - m.b, visibility: 'hidden' });
    hot = el('circle', { class: 'viz-dot s2', r: 4, visibility: 'hidden' });
  }
  let cross, hot;
  const ctip = $('sh-ctip');
  svg.addEventListener('pointermove', e => {
    if (rates.length < 2) return;
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width;
    let best = rates[0]; for (const p of rates) if (Math.abs(sx(p.k) - x) < Math.abs(sx(best.k) - x)) best = p;
    cross.setAttribute('x1', sx(best.k)); cross.setAttribute('x2', sx(best.k)); cross.setAttribute('visibility', 'visible');
    hot.setAttribute('cx', sx(best.k)); hot.setAttribute('cy', sy(best.all)); hot.setAttribute('visibility', 'visible');
    ctip.innerHTML = 'after ' + best.k + ' shuffle' + (best.k === 1 ? '' : 's') + '<br><b>' + Math.round(best.all * 100) + '%</b> <span class="m">of decks pass all three</span>';
    ctip.hidden = false;
    const px = sx(best.k) * r.width / W;
    ctip.style.left = Math.min(px + 12, r.width - 180) + 'px'; ctip.style.top = (svg.offsetTop + 10) + 'px';
  });
  svg.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch') return;
    ctip.hidden = true; if (cross) { cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); }
  });

  function draw() { drawStats(); drawDeck(); drawChart(); }
  window.addEventListener('resize', () => { drawDeck(); drawChart(); });
  setMode('neat');
})();
