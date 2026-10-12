// Memory-level-parallelism chart: independent pointer chains K vs misses in flight (or ns per load), 1 GB random.
(function () {
  const root = document.getElementById('mlp');
  if (!root) return;
  // [K, misses in flight = latency at K=1 / ns per load, ns per load]; median per K over runs whose fingerprint matched the tier
  const data = {"super":[[1,1.0,95.28],[2,2.1,46.25],[3,3.2,30.15],[4,4.2,22.79],[5,5.2,18.5],[6,6.2,15.34],[7,7.2,13.21],[8,8.0,11.88],[10,10.0,9.51],[12,11.8,8.05],[14,13.6,7.01],[16,15.4,6.19],[20,18.3,5.21],[24,18.6,5.13],[28,19.2,4.97],[32,19.2,4.96],[40,19.3,4.93],[48,19.4,4.9],[64,19.8,4.81]],"perf":[[1,1.0,103.22],[2,2.0,50.35],[3,3.1,33.4],[4,4.1,25.11],[5,5.0,20.77],[6,6.1,16.89],[7,7.1,14.6],[8,8.0,12.89],[10,9.9,10.38],[12,11.4,9.04],[14,13.5,7.65],[16,15.3,6.75],[20,17.4,5.94],[24,20.5,5.04],[28,22.3,4.63],[32,23.3,4.42],[40,24.0,4.3],[48,23.6,4.37],[64,24.6,4.19]],"eff":[[1,1.0,112.09],[2,2.0,55.22],[3,3.1,36.39],[4,4.2,26.56],[5,4.8,23.16],[6,5.9,19.1],[7,7.0,16.1],[8,7.2,15.63],[10,9.3,12.03],[12,11.1,10.1],[14,12.9,8.66],[16,14.3,7.83],[20,16.7,6.72],[24,18.3,6.12],[28,19.5,5.75],[32,20.2,5.56],[40,18.8,5.96],[48,18.7,5.99],[64,18.4,6.09]],"win":[[1,1.0,29.54],[2,2.1,14.07],[3,1.7,17.08],[4,2.9,10.26],[5,2.2,13.49],[6,2.7,10.94],[7,2.4,12.11],[8,4.2,7.08],[10,3.1,9.41],[12,4.1,7.2],[14,4.2,7.02],[16,4.8,6.14],[20,5.4,5.44],[24,6.1,4.82],[28,6.2,4.78],[32,6.1,4.85],[40,6.4,4.63],[48,6.4,4.61],[64,6.5,4.53]]};
  const names = { super: 'Super', perf: 'Performance', eff: 'Efficiency (2.9 GHz)', win: 'Super, TLB-friendly window' };
  const style = { super: 'viz-line s1', perf: 'viz-line s2', eff: 'viz-line s3', win: 'viz-line s1' };
  const color = { super: 'var(--s1)', perf: 'var(--s2)', eff: 'var(--s3)', win: 'var(--s1)' };
  const order = ['win', 'eff', 'perf', 'super'];
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.viz-tip');
  const W = 640, H = 340, L = 44, R = 16, T = 14, B = 44;
  const X1 = 64;
  const modes = {
    flight: { i: 1, ticks: [0, 5, 10, 15, 20, 25], lo: 0, hi: 27, ylab: 'misses in flight', f: v => v.toFixed(1), log: false },
    ns: { i: 2, ticks: [3, 10, 30, 100], lo: 3, hi: 150, ylab: 'ns per load (log scale)', f: v => v.toFixed(1) + ' ns', log: true }
  };
  let m = modes.flight;
  const x = k => L + k * (W - L - R) / X1;
  const yy = v => m.log ? Math.log(v / m.lo) / Math.log(m.hi / m.lo) : (v - m.lo) / (m.hi - m.lo);
  const y = v => H - B - yy(v) * (H - T - B);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (parent, tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const stat = el(svg, 'g', {}), dyn = el(svg, 'g', {}), over = el(svg, 'g', {});
  for (const k of [0, 8, 16, 24, 32, 40, 48, 56, 64]) {
    el(stat, 'line', { class: 'viz-grid', x1: x(k), x2: x(k), y1: T, y2: H - B });
    el(stat, 'text', { class: 'viz-tick', x: x(k), y: H - B + 16, 'text-anchor': 'middle' }, k);
  }
  el(stat, 'text', { class: 'viz-tick', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'independent chains (K)');
  const dots = {};
  for (const k of order) dots[k] = el(over, 'circle', { class: 'viz-dot', r: 4, cx: 0, cy: 0, visibility: 'hidden', style: 'fill:' + color[k] });
  const cross = el(over, 'line', { class: 'viz-cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
  function draw() {
    while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
    for (const v of m.ticks) {
      el(dyn, 'line', { class: v === m.lo ? 'viz-base' : 'viz-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) });
      el(dyn, 'text', { class: 'viz-tick', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, v);
    }
    el(dyn, 'line', { class: 'viz-base', x1: L, x2: W - R, y1: H - B, y2: H - B });
    el(dyn, 'text', { class: 'viz-tick', x: 4, y: T + 8 }, m.ylab);
    for (const k of order) {
      const p = el(dyn, 'path', { class: style[k], d: 'M' + data[k].map(q => x(q[0]).toFixed(1) + ',' + y(q[m.i]).toFixed(1)).join('L') });
      if (k === 'win') p.setAttribute('style', 'stroke-dasharray: 5 4');
    }
  }
  function nearest(k, kk) {
    let best = null, bd = Infinity;
    for (const q of data[k]) {
      const d = Math.abs(q[0] - kk);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function hide() {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden');
    for (const k in dots) dots[k].setAttribute('visibility', 'hidden');
  }
  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * W / r.width;
    const f = Math.max(0, Math.min(1, (px - L) / (W - L - R)));
    const kk = f * X1;
    const ref = nearest('super', kk)[0];
    cross.setAttribute('x1', x(ref)); cross.setAttribute('x2', x(ref)); cross.setAttribute('visibility', 'visible');
    let html = `<span class="m">K = ${ref}</span>`;
    for (const k of ['super', 'perf', 'eff', 'win']) {
      const q = nearest(k, ref);
      html += `<br>${names[k]} ${m.f(q[m.i])}` + (m.log ? '' : ` (${q[2].toFixed(1)} ns/load)`);
      dots[k].setAttribute('cx', x(q[0])); dots[k].setAttribute('cy', y(q[m.i])); dots[k].setAttribute('visibility', 'visible');
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const left = x(ref) * r.width / W;
    const want = f > 0.5 ? left - tip.offsetWidth - 12 : left + 12;
    tip.style.left = Math.max(0, Math.min(want, r.width - tip.offsetWidth)) + 'px';
    tip.style.top = svg.offsetTop + 'px';
  }
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', hide);
  const btns = root.querySelectorAll('.viz-presets button');
  btns.forEach(b => b.addEventListener('click', () => {
    m = modes[b.dataset.mode];
    btns.forEach(o => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
    hide(); draw();
  }));
  draw();
})();
