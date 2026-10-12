// Load/store-queue chart: ns per iteration vs filler count N, Super cores, store and dependent-load fillers.
(function () {
  const root = document.getElementById('lsq');
  if (!root) return;
  // [N, ns per iteration]; median per N over runs whose fingerprint matched the Super tier, N with at least 2 runs, N <= 1000
  const data = {"st":[[0,90.8],[8,90.3],[16,90.7],[24,90.6],[32,91.1],[40,90.6],[48,91.5],[56,90.8],[64,92.0],[72,96.0],[80,97.9],[88,100.6],[96,102.4],[104,103.4],[112,105.5],[120,107.8],[122,106.8],[124,107.9],[126,109.6],[128,109.3],[130,110.7],[132,110.2],[134,111.3],[136,111.6],[138,189.7],[140,188.8],[142,190.9],[144,189.7],[146,194.5],[148,194.6],[150,196.4],[152,191.8],[154,194.7],[156,192.6],[158,194.2],[160,193.7],[168,196.2],[176,197.2],[184,198.6],[192,199.8],[200,203.0],[208,204.5],[216,206.1],[224,208.2],[232,210.4],[240,212.1],[248,213.7],[256,215.6],[264,217.5],[272,218.8],[280,221.3],[288,222.2],[296,224.3],[304,225.6],[312,227.3],[320,229.6],[328,231.8],[336,233.3],[344,234.9],[352,237.0],[360,239.0],[368,240.7],[376,243.0],[384,243.4],[392,244.1],[400,247.3]],"stnop":[[0,90.9],[8,91.3],[16,89.8],[24,91.7],[32,90.2],[40,91.5],[48,91.0],[56,91.2],[64,91.3],[72,90.9],[80,92.9],[88,91.1],[96,91.6],[104,92.6],[112,91.4],[120,91.3],[128,91.7],[136,92.8],[144,96.7],[152,97.7],[160,99.2],[168,100.4],[176,101.2],[184,101.8],[192,103.0],[200,102.9],[208,107.2],[216,106.8],[224,107.4],[232,107.9],[240,107.7],[248,109.2],[256,110.4],[258,109.3],[260,109.6],[262,109.5],[264,110.6],[266,110.2],[268,111.9],[270,111.7],[272,111.2],[274,111.8],[276,197.6],[278,195.3],[280,191.6],[282,195.1],[284,198.0],[286,200.9],[288,192.1],[290,191.7],[292,192.5],[294,196.5],[296,191.1],[298,192.4],[300,202.5],[302,191.7],[304,200.0],[312,193.4],[320,193.9],[328,194.2],[336,197.0],[344,198.6],[352,201.0],[360,203.8],[368,199.1],[376,200.0],[384,206.5],[392,202.7],[400,203.0],[408,204.1],[416,204.7],[424,204.8],[432,206.5],[440,208.1],[448,209.4],[456,209.1],[464,210.8],[472,210.9],[480,211.5]],"ldd":[[0,90.5],[16,90.1],[32,90.2],[48,90.7],[64,90.4],[80,90.4],[96,91.0],[112,90.9],[128,91.0],[144,91.8],[160,92.6],[176,92.1],[192,92.1],[208,92.4],[224,93.2],[240,93.8],[256,99.5],[272,103.5],[288,107.3],[304,110.9],[320,115.0],[336,119.5],[352,121.7],[368,126.0],[384,130.2],[400,133.8],[416,139.3],[432,141.4],[448,144.3],[456,148.4],[460,150.6],[464,151.5],[468,153.7],[472,154.0],[476,156.4],[480,155.8],[484,161.2],[488,182.0],[492,189.2],[496,190.4],[500,191.7],[504,193.8],[508,192.6],[512,194.2],[516,198.7],[520,198.6],[528,198.1],[544,202.7],[560,205.2],[576,208.2],[592,212.8],[608,218.4],[624,221.9],[640,224.4],[656,227.7],[672,231.1],[688,235.4],[704,240.7],[720,243.7],[736,248.1],[752,252.0],[768,256.1],[784,259.7],[800,265.3]],"lddnop":[[0,90.8],[16,89.8],[32,89.9],[48,90.0],[64,89.6],[80,90.0],[96,89.7],[112,90.1],[128,90.1],[144,90.1],[160,90.2],[176,90.3],[192,90.3],[208,90.5],[224,90.7],[240,90.8],[256,90.8],[272,91.2],[288,92.5],[304,92.0],[320,93.9],[336,92.2],[352,92.7],[368,92.2],[384,92.1],[400,92.6],[416,92.5],[432,92.7],[448,93.3],[464,94.2],[480,97.8],[496,99.9],[512,104.8],[528,105.1],[544,108.6],[560,111.6],[576,113.1],[592,116.9],[608,119.2],[624,124.3],[640,128.1],[656,129.2],[672,131.9],[688,133.8],[704,136.1],[720,138.8],[736,141.8],[752,145.8],[768,149.0],[784,154.4],[800,155.2],[816,158.4],[832,159.9],[848,164.3],[864,165.4],[880,168.7],[896,174.5],[912,175.1],[928,177.9],[944,181.0],[960,185.0],[976,189.5],[992,191.5]]};
  const names = { st: 'store', stnop: 'store + nop', ldd: 'load', lddnop: 'load + nop' };
  const style = { st: 'viz-line s1', stnop: 'viz-line s1', ldd: 'viz-line s2', lddnop: 'viz-line s2' };
  const color = { st: 'var(--s1)', stnop: 'var(--s1)', ldd: 'var(--s2)', lddnop: 'var(--s2)' };
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.viz-tip');
  const W = 640, H = 340, L = 44, R = 60, T = 14, B = 44;
  const X1 = 1000, Y0 = 80, Y1 = 280;
  const x = n => L + n * (W - L - R) / X1;
  const y = v => H - B - (v - Y0) * (H - T - B) / (Y1 - Y0);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (const v of [80, 120, 160, 200, 240, 280]) {
    el('line', { class: v === Y0 ? 'viz-base' : 'viz-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) });
    el('text', { class: 'viz-tick', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, v);
  }
  for (const n of [0, 200, 400, 600, 800, 1000]) {
    el('line', { class: 'viz-grid', x1: x(n), x2: x(n), y1: T, y2: H - B });
    el('text', { class: 'viz-tick', x: x(n), y: H - B + 16, 'text-anchor': 'middle' }, n);
  }
  el('text', { class: 'viz-tick', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'fillers after each load (N)');
  el('text', { class: 'viz-tick', x: 4, y: T + 8 }, 'ns per iteration');
  const order = ['stnop', 'lddnop', 'st', 'ldd'];
  for (const k of order) {
    const p = el('path', { class: style[k], d: 'M' + data[k].map(([n, v]) => x(n).toFixed(1) + ',' + y(v).toFixed(1)).join('L') });
    if (k.endsWith('nop')) p.setAttribute('style', 'stroke-dasharray: 5 4');
  }
  const dots = {};
  const lab = { st: 4, stnop: 4, ldd: 4, lddnop: 4 };
  for (const k of order) {
    dots[k] = el('circle', { class: 'viz-dot', r: 4, cx: 0, cy: 0, visibility: 'hidden', style: 'fill:' + color[k] });
    const last = data[k][data[k].length - 1];
    el('text', { class: 'viz-label', x: x(last[0]) + 8, y: y(last[1]) + lab[k] }, names[k]);
  }
  const cross = el('line', { class: 'viz-cross', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
  function nearest(k, n) {
    let best = null, bd = Infinity;
    for (const q of data[k]) {
      const d = Math.abs(q[0] - n);
      if (d < bd) { bd = d; best = q; }
    }
    return bd <= 30 ? best : null;
  }
  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * W / r.width;
    const f = Math.max(0, Math.min(1, (px - L) / (W - L - R)));
    const n = f * X1;
    cross.setAttribute('x1', x(n)); cross.setAttribute('x2', x(n)); cross.setAttribute('visibility', 'visible');
    let html = `<span class="m">N about ${Math.round(n)}</span>`;
    for (const k of ['st', 'stnop', 'ldd', 'lddnop']) {
      const q = nearest(k, n);
      if (q) {
        html += `<br>${names[k]} ${q[1].toFixed(1)} ns (N=${q[0]})`;
        dots[k].setAttribute('cx', x(q[0])); dots[k].setAttribute('cy', y(q[1])); dots[k].setAttribute('visibility', 'visible');
      } else {
        html += `<br>${names[k]} no data`;
        dots[k].setAttribute('visibility', 'hidden');
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const left = x(n) * r.width / W;
    const want = f > 0.5 ? left - tip.offsetWidth - 12 : left + 12;
    tip.style.left = Math.max(0, Math.min(want, r.width - tip.offsetWidth)) + 'px';
    tip.style.top = svg.offsetTop + 'px';
  }
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden');
    for (const k in dots) dots[k].setAttribute('visibility', 'hidden');
  });
})();
