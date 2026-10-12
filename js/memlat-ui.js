// Latency-ladder chart for the memory-latency post: cycles per dependent load vs working-set size, one line per core tier (random access).
(function () {
  const root = document.getElementById('memlat');
  if (!root) return;
  // [size in KB, cycles]; median per size over runs whose fingerprint matched the tier
  const data = {
    super: [[16,3.0],[19,3.0],[23,3.0],[27,3.0],[32,3.0],[38,3.0],[45,3.0],[54,3.0],[64,3.0],[70,3.0],[76,3.0],[83,3.0],[90,3.0],[99,3.0],[108,3.0],[117,3.0],[128,3.2],[140,6.3],[152,8.7],[166,9.6],[181,10.3],[197,11.0],[215,11.0],[235,11.2],[256,11.3],[279,11.3],[304,11.4],[332,11.5],[362,11.6],[395,11.6],[430,11.7],[470,11.7],[512,11.8],[558,11.9],[609,11.9],[664,12.0],[724,11.9],[790,12.0],[861,12.0],[939,11.9],[1024,12.0],[1117,12.0],[1218,12.0],[1328,12.1],[1448,12.2],[1579,17.6],[1722,26.9],[1878,27.1],[2048,27.1],[2233,27.0],[2435,27.2],[2656,27.4],[2896,27.8],[3158,28.3],[3444,28.7],[3756,29.0],[4096,29.4],[4467,29.8],[4871,30.0],[5312,30.5],[5792,30.5],[6317,30.9],[6888,31.0],[7512,31.3],[8192,31.3],[8933,31.7],[9742,31.7],[10624,31.9],[11585,31.9],[12634,32.2],[13777,32.3],[15024,32.5],[16384,32.5],[17867,33.0],[19484,47.0],[21247,69.0],[23170,105.6],[27554,120.3],[30048,150.1],[32768,181.3],[38968,222.7],[46341,251.7],[55109,300.3],[65536,327.0],[77936,400.8],[92682,403.9],[110218,404.1],[131072,405.6],[155872,406.4],[185364,402.6],[220436,406.1],[262144,411.3],[311744,410.1],[370728,409.7],[440872,407.7],[524288,411.4],[623487,414.6],[741455,415.2],[881744,415.9],[1048576,417.5]],
    perf: [[16,3.0],[27,3.0],[32,3.0],[64,3.1],[70,12.3],[76,17.0],[83,21.8],[99,23.2],[108,23.9],[128,24.6],[140,25.9],[166,26.5],[181,26.6],[197,26.9],[215,27.0],[235,27.3],[256,26.9],[279,27.0],[304,25.8],[332,26.8],[362,27.0],[395,27.0],[430,26.9],[470,27.0],[512,26.9],[558,26.9],[609,27.0],[664,27.0],[724,26.9],[790,26.9],[861,26.8],[939,26.8],[1024,26.9],[1117,26.8],[1218,26.6],[1328,26.9],[1448,26.7],[1579,26.7],[1722,28.2],[1878,28.2],[2048,26.7],[2233,27.6],[2435,27.8],[2656,28.6],[2896,29.1],[3158,29.9],[3444,32.1],[3756,31.9],[4096,30.3],[4467,30.3],[4871,30.6],[5312,30.8],[5792,31.2],[6317,31.2],[6888,31.4],[7512,31.8],[8192,31.8],[8933,33.7],[9742,33.2],[10624,42.4],[11585,32.8],[12634,33.0],[13777,33.3],[15024,33.3],[16384,34.0],[17867,40.8],[25268,101.5],[27554,105.1],[30048,131.0],[46341,280.3],[77936,381.8],[131072,393.7],[155872,395.7],[185364,395.8],[440872,403.8],[623487,402.9],[741455,405.2],[881744,406.1]],
    eff: [[16,3.0],[19,3.0],[23,3.0],[27,3.0],[32,3.0],[38,3.3],[76,3.0],[90,3.0],[108,14.2],[128,19.7],[152,19.4],[181,20.0],[215,19.9],[256,19.9],[304,16.0],[362,15.3],[430,16.0],[512,16.1],[609,15.9],[724,16.0],[861,20.1],[1024,16.5],[2048,16.0],[2435,16.0],[2896,16.1],[3444,17.0],[4096,17.6],[4871,18.4],[5792,19.7],[8192,49.6],[9742,62.7],[11585,65.6],[13777,71.5],[16384,109.0],[19484,140.5],[23170,199.3],[27554,214.4],[32768,263.0],[38968,267.2],[46341,201.3],[55109,272.1],[65536,275.1],[77936,246.8],[92682,278.7],[110218,279.7],[131072,283.2],[155872,281.0],[185364,282.1],[220436,267.8],[262144,273.8],[311744,256.8],[370728,276.5],[440872,258.5],[524288,264.2],[623487,239.3],[741455,271.7],[881744,265.5],[1048576,274.9]]
  };
  const names = { super: 'Super', perf: 'Performance', eff: 'Efficiency' };
  const cls = { super: 's1', perf: 's2', eff: 's3' };
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.viz-tip');
  const W = 640, H = 360, L = 48, R = 112, T = 14, B = 44;
  const X0 = Math.log2(16), X1 = Math.log2(1048576);
  const Y0 = Math.log2(2), Y1 = Math.log2(512);
  const x = kb => L + (Math.log2(kb) - X0) * (W - L - R) / (X1 - X0);
  const y = c => H - B - (Math.log2(c) - Y0) * (H - T - B) / (Y1 - Y0);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  const size = kb => kb >= 1024 ? (kb / 1024 >= 100 ? Math.round(kb / 1024) : +(kb / 1024).toFixed(1)) + ' MB' : Math.round(kb) + ' KB';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (const c of [2, 4, 8, 16, 32, 64, 128, 256, 512]) {
    el('line', { class: c === 2 ? 'viz-base' : 'viz-grid', x1: L, x2: W - R, y1: y(c), y2: y(c) });
    el('text', { class: 'viz-tick', x: L - 8, y: y(c) + 4, 'text-anchor': 'end' }, c);
  }
  const ticks = [[16, '16 KB'], [64, '64 KB'], [256, '256 KB'], [1024, '1 MB'], [4096, '4 MB'], [16384, '16 MB'], [65536, '64 MB'], [262144, '256 MB'], [1048576, '1 GB']];
  for (const [kb, t] of ticks) {
    el('line', { class: 'viz-grid', x1: x(kb), x2: x(kb), y1: T, y2: H - B });
    el('text', { class: 'viz-tick', x: x(kb), y: H - B + 16, 'text-anchor': 'middle' }, t);
  }
  el('text', { class: 'viz-tick', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'working set (random access)');
  el('text', { class: 'viz-tick', x: 4, y: T + 8 }, 'cycles');
  const order = ['eff', 'perf', 'super'];
  const pts = {};
  for (const k of order) {
    pts[k] = data[k].map(([kb, c]) => [x(kb), y(c)]);
    el('path', { class: 'viz-line ' + cls[k], d: 'M' + pts[k].map(p => p.map(v => v.toFixed(1)).join(',')).join('L') });
  }
  const dots = {};
  for (const k of order) {
    dots[k] = el('circle', { class: 'viz-dot ' + cls[k], r: 4, cx: 0, cy: 0, visibility: 'hidden' });
    const last = data[k][data[k].length - 1];
    const dy = k === 'super' ? -7 : k === 'perf' ? 12 : 4;
    el('text', { class: 'viz-label', x: x(last[0]) + 8, y: y(last[1]) + dy }, names[k] + ' ' + Math.round(last[1]));
  }
  const cross = el('line', { class: 'viz-cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
  function nearest(k, kb) {
    let best = null, bd = Infinity;
    for (const p of data[k]) {
      const d = Math.abs(Math.log2(p[0] / kb));
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 0.3 ? best : null;
  }
  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * W / r.width;
    const f = Math.max(0, Math.min(1, (px - L) / (W - L - R)));
    const kb = Math.pow(2, X0 + f * (X1 - X0));
    cross.setAttribute('x1', x(kb)); cross.setAttribute('x2', x(kb)); cross.setAttribute('visibility', 'visible');
    let html = `<span class="m">${size(kb)}</span>`;
    for (const k of ['super', 'perf', 'eff']) {
      const p = nearest(k, kb);
      if (p) {
        html += `<br>${names[k]} ${p[1].toFixed(1)} cycles`;
        dots[k].setAttribute('cx', x(p[0])); dots[k].setAttribute('cy', y(p[1])); dots[k].setAttribute('visibility', 'visible');
      } else {
        html += `<br>${names[k]} no data`;
        dots[k].setAttribute('visibility', 'hidden');
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const left = x(kb) * r.width / W;
    const want = f > 0.5 ? left - tip.offsetWidth - 12 : left + 12;
    tip.style.left = Math.max(0, Math.min(want, r.width - tip.offsetWidth)) + 'px';
    // lines run along the top on the right and the bottom on the left; keep the tip in the empty corner
    tip.style.top = (f > 0.4 ? svg.offsetTop + r.height * 0.58 : svg.offsetTop) + 'px';
  }
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden');
    for (const k in dots) dots[k].setAttribute('visibility', 'hidden');
  });
})();
