// Pattern-length chart for the branch-predictor post: mispredict rate vs repeat length P, one line per core tier (1 branch site, plain build).
(function () {
  const root = document.getElementById('bpred');
  if (!root) return;
  // [P, mispredict %]; negative measurement noise clamped to 0
  const data = {
    super: [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[10,0],[11,0],[13,0],[16,0],[19,0],[23,0.1],[27,0],[32,0],[38,0],[45,0],[54,0],[64,0],[76,0],[91,0.1],[108,0.1],[128,0.1],[152,0.3],[181,0.3],[215,0.5],[256,1.0],[304,1.2],[362,1.5],[431,2.1],[512,2.9],[609,2.7],[724,3.0],[861,2.7],[1024,3.3],[1218,3.9],[1448,3.8],[1722,4.3],[2048,4.4],[2435,4.7],[2896,4.8],[3444,5.1],[4096,5.2],[4871,5.0],[5793,5.3],[6889,5.3],[8192,5.3],[9742,5.6],[11585,5.5],[13777,5.7],[16384,5.7],[19484,5.8],[23170,5.9],[27554,6.0],[32768,6.1],[38968,6.6],[46341,6.2],[55109,6.4],[65536,6.9],[77936,6.8],[92682,9.8],[110218,14.5],[131072,28.5],[155872,27.2],[185364,33.8],[220436,36.8],[262144,39.7],[311744,39.6],[370728,43.7],[440872,44.6],[524288,45.3],[623487,46.6],[741455,47.7],[881744,47.1],[1048576,48.3]],
    perf: [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[10,0],[11,0],[13,0],[16,0],[19,0],[23,0],[27,0],[32,0],[38,0],[45,0],[54,0],[64,0],[76,0],[91,0],[108,0],[128,0],[152,0.3],[181,0],[215,0.1],[256,0.9],[304,0.9],[362,1.0],[431,1.5],[512,2.1],[609,1.7],[724,1.9],[861,2.5],[1024,2.6],[1218,3.5],[1448,3.1],[1722,3.6],[2048,4.1],[2435,4.0],[2896,4.5],[3444,4.5],[4096,4.3],[4871,4.9],[5793,5.1],[6889,4.9],[8192,4.9],[9742,5.1],[11585,5.4],[13777,5.4],[16384,5.5],[19484,5.5],[23170,5.6],[27554,5.7],[32768,6.0],[38968,7.0],[46341,12.0],[55109,21.1],[65536,28.2],[77936,25.7],[92682,31.4],[110218,36.7],[131072,38.3],[155872,43.0],[185364,43.6],[220436,43.4],[262144,45.6],[311744,44.5],[370728,45.9],[440872,46.0],[524288,46.9],[623487,46.4],[741455,47.2],[881744,47.8],[1048576,48.0]],
    eff: [[1,0],[2,0],[3,0.2],[4,0.3],[5,0],[6,0.9],[7,0.6],[8,0],[10,1.3],[11,1.1],[13,0.7],[16,0.1],[19,2.8],[23,3.2],[27,2.9],[32,2.7],[38,3.7],[45,0.9],[54,3.3],[64,2.3],[76,3.9],[91,4.3],[108,3.2],[128,3.9],[152,3.7],[181,6.1],[215,3.7],[256,5.5],[304,4.2],[362,4.8],[431,5.0],[512,4.5],[609,5.1],[724,4.7],[861,5.5],[1024,6.3],[1218,5.9],[1448,5.2],[1722,6.1],[2048,6.1],[2435,5.3],[2896,7.1],[3444,6.4],[4096,7.2],[4871,7.1],[5793,6.8],[6889,7.2],[8192,7.5],[9742,7.2],[11585,8.4],[13777,7.9],[16384,8.1],[19484,9.0],[23170,8.6],[27554,10.2],[32768,17.2],[38968,21.4],[46341,18.6],[55109,21.6],[65536,30.1],[77936,33.8],[92682,35.8],[110218,38.6],[131072,40.9],[155872,43.0],[185364,43.2],[220436,43.4],[262144,46.6],[311744,47.8],[370728,47.6],[440872,48.1],[524288,48.5],[623487,48.7],[741455,48.3],[881744,47.7],[1048576,49.2]]
  };
  const names = { super: 'Super', perf: 'Performance', eff: 'Efficiency' };
  const cls = { super: 's1', perf: 's2', eff: 's3' };
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.viz-tip');
  const W = 640, H = 340, L = 44, R = 112, T = 14, B = 44;
  const X0 = 0, X1 = Math.log10(1048576);
  const Y1 = 50;
  const x = p => L + (Math.log10(p) - X0) * (W - L - R) / (X1 - X0);
  const y = v => H - B - v * (H - T - B) / Y1;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  const plen = p => p >= 1e6 ? '1M' : p >= 1000 ? +(p / 1000).toFixed(p >= 100000 ? 0 : 1) + 'k' : Math.round(p);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (const v of [0, 10, 20, 30, 40, 50]) {
    el('line', { class: v === 0 ? 'viz-base' : 'viz-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) });
    el('text', { class: 'viz-tick', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, v + '%');
  }
  for (const [p, t] of [[1, '1'], [10, '10'], [100, '100'], [1000, '1k'], [10000, '10k'], [100000, '100k'], [1000000, '1M']]) {
    el('line', { class: 'viz-grid', x1: x(p), x2: x(p), y1: T, y2: H - B });
    el('text', { class: 'viz-tick', x: x(p), y: H - B + 16, 'text-anchor': 'middle' }, t);
  }
  el('text', { class: 'viz-tick', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'pattern length P (branches before it repeats)');
  el('text', { class: 'viz-tick', x: 4, y: T + 8 }, 'mispredicts');
  const order = ['eff', 'perf', 'super'];
  for (const k of order) {
    el('path', { class: 'viz-line ' + cls[k], d: 'M' + data[k].map(([p, v]) => x(p).toFixed(1) + ',' + y(v).toFixed(1)).join('L') });
  }
  const dots = {};
  const lab = { super: 5, perf: 19, eff: -9 };
  for (const k of order) {
    dots[k] = el('circle', { class: 'viz-dot ' + cls[k], r: 4, cx: 0, cy: 0, visibility: 'hidden' });
    const last = data[k][data[k].length - 1];
    el('text', { class: 'viz-label', x: x(last[0]) + 8, y: y(last[1]) + lab[k] }, names[k]);
  }
  const cross = el('line', { class: 'viz-cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
  function nearest(k, p) {
    let best = null, bd = Infinity;
    for (const q of data[k]) {
      const d = Math.abs(Math.log10(q[0] / p));
      if (d < bd) { bd = d; best = q; }
    }
    return bd < 0.1 ? best : null;
  }
  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * W / r.width;
    const f = Math.max(0, Math.min(1, (px - L) / (W - L - R)));
    const p = Math.pow(10, X0 + f * (X1 - X0));
    cross.setAttribute('x1', x(p)); cross.setAttribute('x2', x(p)); cross.setAttribute('visibility', 'visible');
    let html = `<span class="m">P about ${plen(p)}</span>`;
    for (const k of ['super', 'perf', 'eff']) {
      const q = nearest(k, p);
      if (q) {
        html += `<br>${names[k]} ${q[1].toFixed(1)}% (P=${q[0]})`;
        dots[k].setAttribute('cx', x(q[0])); dots[k].setAttribute('cy', y(q[1])); dots[k].setAttribute('visibility', 'visible');
      } else {
        html += `<br>${names[k]} no data`;
        dots[k].setAttribute('visibility', 'hidden');
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const left = x(p) * r.width / W;
    const want = f > 0.5 ? left - tip.offsetWidth - 12 : left + 12;
    tip.style.left = Math.max(0, Math.min(want, r.width - tip.offsetWidth)) + 'px';
    // lines run along the bottom on the left and the top on the right; keep the tip in the empty corner
    tip.style.top = (f > 0.6 ? svg.offsetTop + r.height * 0.6 : svg.offsetTop) + 'px';
  }
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden');
    for (const k in dots) dots[k].setAttribute('visibility', 'hidden');
  });
})();
