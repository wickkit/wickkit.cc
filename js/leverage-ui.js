// Interactive part of "The Break-Even Line for 3x". Needs leverage-sim.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  // Chart width follows the container so text stays readable on phones.
  let W = 600;
  const H = 280, M = { t: 16, r: 56, b: 34, l: 52 };
  const PATHS = 2000;

  const PRESETS = {
    actual: { mu: 20.5, sigma: 22.5, r: 3.1, fee: 0.9, L: 3, years: 10 },
    plain: { mu: 10, sigma: 22, r: 4, fee: 0.9, L: 3, years: 10 },
    zero: { mu: 10, sigma: 22, r: 0, fee: 0.9, L: 3, years: 10 },
  };
  const FIELDS = ["mu", "sigma", "r", "fee", "L", "years"];

  const pct = (x, d = 1) => (x * 100).toFixed(d).replace("-", "−") + "%";
  const signed = (x) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
  const mult = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + "×";
  // Log growth to a compounded yearly rate, which is what people quote.
  const cagr = (g) => Math.exp(g) - 1;
  const lev = (L) => (Number.isInteger(L) ? L.toFixed(0) : L.toFixed(2).replace(/0$/, "")) + "x";

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

  function params() {
    const v = {};
    for (const f of FIELDS) v[f] = parseFloat($("in-" + f).value);
    return {
      p: { mu: v.mu / 100, sigma: v.sigma / 100, r: v.r / 100, fee: v.fee / 100 },
      L: v.L,
      years: v.years,
    };
  }

  function showValues() {
    for (const f of FIELDS) {
      const v = parseFloat($("in-" + f).value);
      $("out-" + f).textContent = f === "L" ? lev(v) : f === "years" ? v + (v === 1 ? " year" : " years") : v + "%";
    }
  }

  // Hover layer: a crosshair plus a tooltip, driven by the nearest x on the pointer.
  function hover(svg, box, xs, toX, render) {
    const tip = box.querySelector(".viz-tip");
    const line = el("line", { class: "viz-cross", y1: M.t, y2: H - M.b, visibility: "hidden" }, svg);
    const dots = el("g", {}, svg);
    const hit = el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: "transparent" }, svg);
    function move(ev) {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * W;
      let best = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(toX(xs[i]) - x) < Math.abs(toX(xs[best]) - x)) best = i;
      const px = toX(xs[best]);
      line.setAttribute("x1", px);
      line.setAttribute("x2", px);
      line.setAttribute("visibility", "visible");
      dots.replaceChildren();
      const { html, points } = render(best);
      for (const [y, cls] of points) el("circle", { cx: px, cy: y, r: 4.5, class: "viz-dot " + cls }, dots);
      tip.innerHTML = html;
      tip.hidden = false;
      tip.style.top = r.top - box.getBoundingClientRect().top + 4 + "px";
      const left = (px / W) * r.width;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(left + 12, 0), r.width - tw) + "px";
      if (left + 12 + tw > r.width) tip.style.left = Math.max(left - tw - 12, 0) + "px";
    }
    function leave() {
      line.setAttribute("visibility", "hidden");
      dots.replaceChildren();
      tip.hidden = true;
    }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    // A finger lifting also "leaves"; keep the readout up until the next touch.
    hit.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") leave(); });
  }

  function drawCurve(p, L) {
    const box = $("viz-curve"), svg = box.querySelector("svg");
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const Ls = [];
    for (let x = 0; x <= 4.0001; x += 0.05) Ls.push(Math.round(x * 100) / 100);
    const g = Ls.map((x) => cagr(growth(x, p)));
    const g1 = cagr(indexGrowth(p));
    let lo = Math.min(-0.05, g1, ...g), hi = Math.max(0.05, g1, ...g);
    lo = Math.max(lo, Math.min(g1, 0) - 0.3);
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const X = (x) => M.l + (x / 4) * (W - M.l - M.r);
    const Y = (y) => M.t + ((hi - y) / (hi - lo)) * (H - M.t - M.b);
    const clip = el("clipPath", { id: "clip-curve" }, el("defs", {}, svg));
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, clip);

    const step = niceStep((hi - lo) / 5);
    for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) {
      el("line", { x1: M.l, x2: W - M.r, y1: Y(y), y2: Y(y), class: Math.abs(y) < 1e-9 ? "viz-base" : "viz-grid" }, svg);
      text(svg, M.l - 8, Y(y) + 4, pct(y, step < 0.01 ? 1 : 0), "viz-tick", "end");
    }
    for (let x = 0; x <= 4; x++) text(svg, X(x), H - M.b + 18, x + "x", "viz-tick", "middle");
    text(svg, (M.l + W - M.r) / 2, H - 2, "leverage", "viz-tick", "middle");

    el("line", { x1: M.l, x2: W - M.r, y1: Y(g1), y2: Y(g1), class: "viz-ref" }, svg);
    text(svg, W - M.r + 6, Y(g1) + 4, "1x", "viz-label");

    const d = Ls.map((x, i) => (i ? "L" : "M") + X(x).toFixed(1) + " " + Y(g[i]).toFixed(1)).join("");
    el("path", { d, class: "viz-line s2", "clip-path": "url(#clip-curve)" }, svg);

    const Lstar = (p.mu - p.r) / (p.sigma * p.sigma);
    if (Lstar > 0 && Lstar <= 4) {
      const gy = Y(cagr(growth(Lstar, p)));
      el("circle", { cx: X(Lstar), cy: gy, r: 4, class: "viz-mark" }, svg);
      text(svg, X(Lstar), Math.abs(gy - Y(g1)) < 18 && gy > Y(g1) ? gy + 20 : gy - 10, "peak " + Lstar.toFixed(1) + "x", "viz-label", "middle");
    }
    el("circle", { cx: X(L), cy: Y(cagr(growth(L, p))), r: 5, class: "viz-dot s2" }, svg);

    hover(svg, box, Ls, X, (i) => ({
      html: `<b>${lev(Ls[i])}</b>: ${signed(g[i])} a year<br><span class="m">1x: ${signed(g1)} a year</span>`,
      points: [[Y(g[i]), "s2"]],
    }));
  }

  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }

  function drawFan(sim, L) {
    const box = $("viz-fan"), svg = box.querySelector("svg");
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const B = sim.bands, years = B[B.length - 1].year;
    const FLOOR = 0.01;
    const clamp = (v) => Math.max(v, FLOOR);
    let lo = Infinity, hi = 1;
    for (const b of B) {
      lo = Math.min(lo, clamp(b.one[0]), clamp(b.lev[0]));
      hi = Math.max(hi, b.one[2], b.lev[2]);
    }
    lo = Math.min(lo, 0.5);
    const ll = Math.log10(lo), lh = Math.log10(hi) + 0.05;
    const X = (t) => M.l + (t / years) * (W - M.l - M.r);
    const Y = (v) => M.t + ((lh - Math.log10(clamp(v))) / (lh - ll)) * (H - M.t - M.b);

    const ticks = [];
    for (let e = Math.floor(ll); e <= Math.ceil(lh); e++)
      for (const m of [1, 3]) {
        const v = m * Math.pow(10, e);
        if (v >= lo && v <= Math.pow(10, lh)) ticks.push(v);
      }
    const thin = ticks.length > 7 ? ticks.filter((v) => Math.abs(Math.log10(v) % 1) < 1e-9) : ticks;
    for (const v of thin) {
      el("line", { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: v === 1 ? "viz-base" : "viz-grid" }, svg);
      text(svg, M.l - 8, Y(v) + 4, (v < 1 ? String(+v.toPrecision(1)).replace(/^0/, "") : v.toLocaleString("en-US")) + "×", "viz-tick", "end");
    }
    const ystep = years > 12 ? 5 : years > 5 ? 2 : 1;
    for (let t = 0; t <= years + 1e-9; t += ystep) text(svg, X(t), H - M.b + 18, t ? "yr " + t : "start", "viz-tick", "middle");

    for (const [key, cls] of [["one", "s1"], ["lev", "s2"]]) {
      const top = B.map((b, i) => (i ? "L" : "M") + X(b.year).toFixed(1) + " " + Y(b[key][2]).toFixed(1)).join("");
      const bot = B.slice().reverse().map((b) => "L" + X(b.year).toFixed(1) + " " + Y(b[key][0]).toFixed(1)).join("");
      el("path", { d: top + bot + "Z", class: "viz-band " + cls }, svg);
    }
    const ends = [];
    for (const [key, cls, name] of [["one", "s1", "1x"], ["lev", "s2", lev(L)]]) {
      const d = B.map((b, i) => (i ? "L" : "M") + X(b.year).toFixed(1) + " " + Y(b[key][1]).toFixed(1)).join("");
      el("path", { d, class: "viz-line " + cls }, svg);
      ends.push({ y: Y(B[B.length - 1][key][1]), name });
    }
    // Direct labels at the right end; nudge apart if the medians land close together.
    if (Math.abs(ends[0].y - ends[1].y) < 14) {
      const mid = (ends[0].y + ends[1].y) / 2, up = ends[0].y <= ends[1].y ? 0 : 1;
      ends[up].y = mid - 7; ends[1 - up].y = mid + 7;
    }
    for (const e of ends) text(svg, W - M.r + 6, e.y + 4, e.name, "viz-label");

    $("fan-lev-name").textContent = lev(L);
    hover(svg, box, B.map((b) => b.year), X, (i) => {
      const b = B[i];
      const row = (name, q) => `${name}: <b>${mult(q[1])}</b> <span class="m">(${mult(q[0])}–${mult(q[2])})</span>`;
      return {
        html: `<span class="m">after ${b.year.toFixed(1)} years</span><br>${row("1x", b.one)}<br>${row(lev(L), b.lev)}`,
        points: [[Y(b.one[1]), "s1"], [Y(b.lev[1]), "s2"]],
      };
    });

    const rows = [];
    for (const b of B) {
      const y = Math.round(b.year * 1000) / 1000;
      if (Math.abs(y - Math.round(y)) > 1e-6 || y === 0) continue;
      rows.push(`<tr><td>${Math.round(y)}</td><td>${mult(b.one[0])}</td><td>${mult(b.one[1])}</td><td>${mult(b.one[2])}</td>` +
        `<td>${mult(b.lev[0])}</td><td>${mult(b.lev[1])}</td><td>${mult(b.lev[2])}</td></tr>`);
    }
    $("fan-table").innerHTML = rows.join("");
    $("fan-table-lev").textContent = lev(L);
  }

  function update() {
    showValues();
    W = Math.round(Math.min(600, Math.max(300, $("viz-curve").clientWidth)));
    const { p, L, years } = params();
    const g1 = cagr(indexGrowth(p)), gL = cagr(growth(L, p));
    const Lstar = (p.mu - p.r) / (p.sigma * p.sigma);
    $("stat-growth").textContent = signed(gL);
    $("stat-growth-label").textContent = `typical yearly growth at ${lev(L)} (1x: ${signed(g1)})`;
    $("stat-peak").textContent = Lstar <= 0 ? "none" : Lstar > 10 ? ">10x" : Lstar.toFixed(1) + "x";
    drawCurve(p, L);
    const sim = simulate(p, L, years, PATHS);
    $("stat-behind").textContent = pct(sim.behind, 0);
    $("stat-behind-label").textContent = `of paths where ${lev(L)} ends behind 1x`;
    $("stat-crushed").textContent = pct(sim.crushed, 0);
    $("stat-crushed-label").textContent = `of paths where ${lev(L)} falls 80% from a high`;
    drawFan(sim, L);
  }

  let pending = 0;
  function schedule() {
    showValues();
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(update);
  }

  function preset(name) {
    const v = PRESETS[name];
    for (const f of FIELDS) $("in-" + f).value = v[f];
    for (const b of document.querySelectorAll(".viz-presets button")) b.setAttribute("aria-pressed", b.dataset.preset === name);
    schedule();
  }

  for (const f of FIELDS)
    $("in-" + f).addEventListener("input", () => {
      for (const b of document.querySelectorAll(".viz-presets button")) b.setAttribute("aria-pressed", "false");
      schedule();
    });
  for (const b of document.querySelectorAll(".viz-presets button")) b.addEventListener("click", () => preset(b.dataset.preset));
  let lastWidth = 0;
  window.addEventListener("resize", () => {
    const w = $("viz-curve").clientWidth;
    if (w !== lastWidth) { lastWidth = w; schedule(); }
  });
  preset("actual");
})();
