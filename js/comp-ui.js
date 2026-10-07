// Interactive part of the compression post. Needs comp.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const K = window.KitComp;
  if (!K || !$("cz")) return;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, cls, anchor = "start") {
    const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent);
    t.textContent = s;
    return t;
  }
  const size = (n) => (n < 1024 ? String(n) : n < 1 << 20 ? `${n >> 10}k` : `${n >> 20}M`);

  const PRESETS = {
    coin: { label: "fair coin", make: () => K.fixed([1, 1]) },
    biased: { label: "90/10 coin", make: () => K.fixed([9, 1]) },
    zipf: { label: "26 letters, uneven", make: () => K.fixed(Array.from({ length: 26 }, (_, i) => 1 / (i + 1))) },
    m1: { label: "8 symbols, each depends on the last", make: (s) => K.source(8, 1, 0.3, s) },
    m3: { label: "4 symbols, each depends on the last 3", make: (s) => K.source(4, 3, 0.5, s) },
    m2: { label: "26 letters, each depends on the last 2", make: (s) => K.source(26, 2, 0.1, s) },
  };
  const canDeflate = typeof CompressionStream === "function";
  let preset = "m1", seed = 1, run = 0;

  async function deflateBits(bytes) {
    const cs = new CompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return buf.byteLength * 8;
  }

  async function update() {
    const my = ++run;
    const src = PRESETS[preset].make(seed);
    const n = 1 << +$("cz-len").value;
    $("cz-len-out").textContent = size(n) + " symbols";
    const cps = [];
    for (let m = 256; m <= n; m *= 2) cps.push(m);
    const sym = K.generate(src, n, seed * 7919 + 13);
    const kt = K.countingBits(sym, src.A, src.k, cps).map((b, i) => b / cps[i]);
    // the floor for this exact sample: what the true odds pay on it (close to H, but samples vary)
    const floor = K.trueBits(src, sym, cps).map((b, i) => b / cps[i]);
    const series = { H: src.H, cps, kt, floor, gz: null };
    draw(series);
    stats(series);
    if (!canDeflate) return;
    const bytes = sym.map((a) => 97 + a), gz = [];
    for (const m of cps) {
      gz.push((await deflateBits(bytes.subarray(0, m))) / m);
      if (my !== run) return;
    }
    series.gz = gz;
    draw(series);
    stats(series);
  }

  const pct = (v, H) => {
    const r = 100 * (v / H - 1);
    return `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(Math.abs(r) < 10 ? 1 : 0)}%`;
  };
  function stats(s) {
    const last = s.cps.length - 1;
    $("cz-h").textContent = s.H.toFixed(3);
    $("cz-kt").textContent = pct(s.kt[last], s.floor[last]);
    $("cz-gz").textContent = s.gz ? pct(s.gz[last], s.floor[last]) : canDeflate ? "…" : "n/a";
    const g = s.gz, j = Math.min(7, last);
    $("cz-flat").textContent = g && g.length > 4 ? pct(g[j], s.floor[j]) : "–";
  }

  function draw(s) {
    const svg = $("cz-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 260;
    const M = { t: 14, r: 16, b: 36, l: 42 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const ymax = Math.ceil(Math.max(s.H, ...s.kt, ...(s.gz || [])) * 2) / 2;
    const x0 = 8, x1 = Math.log2(s.cps[s.cps.length - 1]);
    const x = (lg) => M.l + ((lg - x0) / Math.max(1, x1 - x0)) * (W - M.l - M.r);
    const y = (v) => M.t + (1 - Math.min(v, ymax) / ymax) * (H - M.t - M.b);
    const step = ymax > 4 ? 1 : 0.5;
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(v) + 4, step < 1 ? v.toFixed(1) : String(v), "viz-tick", "end");
    }
    const every = W < 420 ? 4 : 2;
    for (let lg = x0; lg <= x1; lg++) {
      if ((lg - x0) % every) continue;
      text(svg, x(lg), H - M.b + 16, size(2 ** lg), "viz-tick", "middle");
    }
    text(svg, (M.l + W - M.r) / 2, H - 4, "symbols seen so far", "viz-tick", "middle");
    el("line", { x1: M.l, x2: W - M.r, y1: y(s.H), y2: y(s.H), class: "viz-ref cz-h" }, svg);
    const line = (vals, cls) => {
      el("polyline", { points: vals.map((v, i) => `${x(Math.log2(s.cps[i])).toFixed(1)},${y(v).toFixed(1)}`).join(" "), class: `viz-line ${cls}` }, svg);
      vals.forEach((v, i) => el("circle", { cx: x(Math.log2(s.cps[i])), cy: y(v), r: 3, class: `viz-dot ${cls}` }, svg));
    };
    line(s.kt, "s1");
    if (s.gz) line(s.gz, "s2");
  }

  document.querySelectorAll("#cz [data-p]").forEach((b) => b.addEventListener("click", () => {
    preset = b.dataset.p;
    document.querySelectorAll("#cz [data-p]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    update();
  }));
  $("cz-new").addEventListener("click", () => { seed = (Math.random() * 1e9) | 0; update(); });
  $("cz-len").addEventListener("change", update);
  $("cz-len").addEventListener("input", () => { $("cz-len-out").textContent = size(1 << +$("cz-len").value) + " symbols"; });
  if (!canDeflate) $("cz-nogz").hidden = false;
  let w = 0;
  new ResizeObserver(() => { const nw = $("cz-chart").parentNode.clientWidth; if (nw !== w) { w = nw; update(); } }).observe($("cz-chart").parentNode);
})();
