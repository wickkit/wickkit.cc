// Speedup chart for the free-threading post: threads vs processes, 1-12 workers.
(function () {
  const root = document.getElementById('ft');
  if (!root) return;
  const data = JSON.parse(root.dataset.speedup);
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.viz-tip');
  const W = 640, H = 340, L = 44, R = 118, T = 14, B = 40;
  const x = n => L + (n - 1) * (W - L - R) / 11;
  const y = s => H - B - s * (H - T - B) / 7;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (let s = 0; s <= 7; s++) {
    el('line', { class: s ? 'viz-grid' : 'viz-base', x1: L, x2: W - R, y1: y(s), y2: y(s) });
    el('text', { class: 'viz-tick', x: L - 8, y: y(s) + 4, 'text-anchor': 'end' }, s + '×');
  }
  for (let n = 1; n <= 12; n++) el('text', { class: 'viz-tick', x: x(n), y: H - B + 18, 'text-anchor': 'middle' }, n);
  el('text', { class: 'viz-tick', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'workers (threads in one process, or single-thread processes)');
  // the fast cores end after worker 6
  el('line', { class: 'viz-cross', x1: (x(6) + x(7)) / 2, x2: (x(6) + x(7)) / 2, y1: T, y2: H - B });
  el('text', { class: 'viz-tick', x: (x(6) + x(7)) / 2 + 6, y: T + 10 }, 'efficiency cores join →');
  const series = [['procs', 's1', 'processes'], ['threads', 's2', 'threads']];
  for (const [key, cls, name] of series) {
    const pts = data[key].map((s, i) => [x(i + 1), y(s)]);
    el('path', { class: 'viz-line ' + cls, d: 'M' + pts.map(p => p.join(',')).join('L') });
    for (const [px, py] of pts) el('circle', { class: 'viz-dot ' + cls, cx: px, cy: py, r: 4 });
    const last = pts[pts.length - 1];
    el('text', { class: 'viz-label', x: last[0] + 10, y: last[1] + 4 }, name + ' ' + data[key][11].toFixed(1) + '×');
  }
  const cross = el('line', { class: 'viz-cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * W / r.width;
    const n = Math.max(1, Math.min(12, Math.round((px - L) / ((W - L - R) / 11)) + 1));
    cross.setAttribute('x1', x(n)); cross.setAttribute('x2', x(n)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<span class="m">${n} worker${n > 1 ? 's' : ''}</span><br>processes ${data.procs[n - 1].toFixed(2)}×<br>threads ${data.threads[n - 1].toFixed(2)}×`;
    tip.hidden = false;
    const left = x(n) * r.width / W;
    tip.style.left = (n > 8 ? left - tip.offsetWidth - 12 : left + 12) + 'px';
  }
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
})();
