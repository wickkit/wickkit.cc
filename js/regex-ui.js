// Interactive part of "Two Regex Engines and a Fuzzer". Needs regex.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const R = window.KitRegex;
  let W = 600;
  const H = 260, M = { t: 14, r: 16, b: 34, l: 52 };
  const LIMIT = 3e6; // backtracker step budget per run, so the page never hangs

  const PRESETS = {
    nested: { pat: "(a+)+b", str: "a".repeat(28) },
    alt: { pat: "(a|aa)*c", str: "a".repeat(28) },
    words: { pat: "([a-z]+ ?)+!", str: "the quick brown fox jumps over" },
    empty: { pat: "b(a*|b)?", str: "bb" },
  };

  const fmt = (n) => n.toLocaleString("en-US");
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

  function showMatch(str, span) {
    const out = $("rx-match");
    out.textContent = "";
    if (!span) { out.textContent = "no match"; return; }
    const [a, b] = span;
    out.append(str.slice(0, a));
    const mk = document.createElement("mark");
    mk.textContent = str.slice(a, b) || "∅";
    if (a === b) mk.className = "empty";
    out.append(mk, str.slice(b));
  }

  // Steps for every prefix of the subject, both engines. Once the backtracker
  // blows its budget it stops being run: longer prefixes only get worse.
  function series(pat, str) {
    const bt = [], vm = [];
    let blown = false;
    for (let n = 0; n <= str.length; n++) {
      const s = str.slice(0, n);
      vm.push(R.nfaSearch(pat, s).steps);
      if (blown) { bt.push(null); continue; }
      const r = R.backtrackSearch(pat, s, LIMIT);
      blown = r.gaveUp;
      bt.push(r.gaveUp ? LIMIT : r.steps);
    }
    return { bt, vm };
  }

  function chart(sr) {
    const svg = $("rx-chart");
    W = Math.max(300, Math.round(svg.parentNode.clientWidth));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const n = sr.vm.length - 1;
    const x = (i) => M.l + (n ? (i / n) : 0) * (W - M.l - M.r);
    const top = Math.max(2, Math.ceil(Math.log10(Math.max(LIMIT, ...sr.vm))));
    const y = (v) => H - M.b - (Math.log10(Math.max(1, v)) / top) * (H - M.t - M.b);
    for (let d = 0; d <= top; d++) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(10 ** d), y2: y(10 ** d), class: d ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(10 ** d) + 4, d < 3 ? fmt(10 ** d) : d < 6 ? `${10 ** (d - 3)}k` : `${10 ** (d - 6)}M`, "viz-tick", "end");
    }
    el("line", { x1: M.l, x2: W - M.r, y1: y(LIMIT), y2: y(LIMIT), class: "viz-cross" }, svg);
    text(svg, W - M.r, y(LIMIT) - 5, "budget: gave up", "viz-tick", "end");
    const step = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i <= n; i += step) text(svg, x(i), H - M.b + 16, String(i), "viz-tick", "middle");
    text(svg, (M.l + W - M.r) / 2, H - 4, "characters of subject", "viz-tick", "middle");
    const line = (vals, cls) => {
      const pts = vals.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      if (pts.length > 1) el("polyline", { points: pts.join(" "), class: "viz-line " + cls }, svg);
      const last = vals.reduce((a, v, i) => (v == null ? a : i), 0);
      el("circle", { cx: x(last), cy: y(vals[last]), r: 4, class: "viz-dot " + cls }, svg);
    };
    line(sr.bt, "s2");
    line(sr.vm, "s1");
  }

  function run() {
    const pat = $("rx-pat").value, str = $("rx-str").value;
    $("rx-err").textContent = "";
    let b, v;
    try {
      R.parse(pat);
      b = R.backtrackSearch(pat, str, LIMIT);
      v = R.nfaSearch(pat, str);
    } catch (e) {
      $("rx-err").textContent = e.message;
      return;
    }
    // Only ask V8 when the backtracker finished: V8 backtracks too, and a
    // pattern that blew my budget can freeze the tab for seconds in V8.
    let js = null;
    if (!b.gaveUp) try {
      const m = new RegExp(pat).exec(str);
      js = m ? [m.index, m.index + m[0].length] : null;
    } catch (e) { js = undefined; }
    showMatch(str, v.span);
    $("rx-bt").textContent = b.gaveUp ? `>${fmt(LIMIT)}` : fmt(b.steps);
    $("rx-vm").textContent = fmt(v.steps);
    $("rx-states").textContent = fmt(v.states);
    const same = (p, q) => String(p) === String(q);
    $("rx-agree").textContent =
      b.gaveUp ? "backtracker gave up" :
      !same(b.span, v.span) ? "engines disagree (tell me!)" :
      js === undefined ? "JS can't parse it" :
      same(js, v.span) ? "both match JS" : "differs from JS (tell me!)";
    chart(series(pat, str));
  }

  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
  function setPreset(name) {
    $("rx-pat").value = PRESETS[name].pat;
    $("rx-str").value = PRESETS[name].str;
    document.querySelectorAll("#rx [data-preset]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.preset === name));
    run();
  }
  document.querySelectorAll("#rx [data-preset]").forEach((b) => b.addEventListener("click", () => setPreset(b.dataset.preset)));
  ["rx-pat", "rx-str"].forEach((id) => $(id).addEventListener("input", () => {
    document.querySelectorAll("#rx [data-preset]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    later();
  }));
  let lastW = 0;
  window.addEventListener("resize", () => {
    const w = $("rx-chart").parentNode.clientWidth;
    if (Math.abs(w - lastW) > 8) { lastW = w; later(); }
  });
  setPreset("nested");
})();
