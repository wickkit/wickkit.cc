// Interactive part of the load-balancing post. Needs lb.js first.
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const L = window.KitLB;
  if (!L || !$("lb")) return;

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

  const N = 100, HIST = 300;
  // refresh-interval slider: position 0 = live, then 0.1 … 1000 service times on a log scale
  const TS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const POLICY = { random: 1, rr: "rr", two: 2, all: N };
  let policy = "all", sim, simT, acc, accT, hist, paused = false, running = false, visible = true;

  function opts() {
    return {
      n: N,
      lam: +$("lb-load").value / 100,
      d: POLICY[policy],
      T: TS[+$("lb-T").value],
      k: +$("lb-k").value,
      own: $("lb-own").checked,
      seed: (Math.random() * 1e9) | 0,
    };
  }

  function reset() {
    const o = opts();
    $("lb-load-out").textContent = Math.round(o.lam * 100) + "%";
    $("lb-T-out").textContent = o.T === 0 ? "live" : `every ${o.T} service time${o.T === 1 ? "" : "s"}`;
    $("lb-k-out").textContent = o.k;
    // knowledge controls only matter for policies that look at the board
    const looks = policy === "two" || policy === "all";
    $("lb-T").disabled = !looks;
    $("lb-own").disabled = !looks || o.T === 0;
    $("lb-k").disabled = policy === "random";
    sim = L.make(o);
    sim.o = o;
    // settle into steady state before showing or measuring anything
    sim.run(Math.max(200, 5 * o.T));
    simT = 0; acc = 0; accT = 0;
    hist = [];
    $("lb-rand").textContent = (1 / (1 - o.lam)).toFixed(1);
    draw();
    start();
  }

  function advance(dt) {
    const steps = Math.round(dt * sim.stepsPerTime);
    let sum = 0;
    for (let s = 0; s < steps; s++) { sim.step(); sum += sim.total; }
    simT += dt;
    const avg = sum / steps;
    acc += avg * dt; accT += dt;
    hist.push(avg / N);
    if (hist.length > HIST) hist.shift();
  }

  function bars() {
    const svg = $("lb-bars");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 170;
    const M = { t: 8, r: 8, b: 22, l: 34 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const q = sim.q, b = sim.board;
    let top = 4;
    for (let i = 0; i < N; i++) top = Math.max(top, q[i], sim.live ? 0 : b[i]);
    top = Math.ceil(top / 4) * 4;
    const y = (v) => H - M.b - (v / top) * (H - M.t - M.b);
    const bw = (W - M.l - M.r) / N;
    for (const v of [0, top / 2, top]) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(v) + 4, String(v), "viz-tick", "end");
    }
    for (let i = 0; i < N; i++) {
      if (q[i] > 0) {
        const h = y(0) - y(q[i]);
        el("rect", { x: M.l + i * bw + Math.min(1, bw * 0.15), y: y(q[i]), width: Math.max(1, bw - Math.min(2, bw * 0.3)), height: h, class: "lb-q" }, svg);
      }
      if (!sim.live && policy !== "random" && policy !== "rr")
        el("line", { x1: M.l + i * bw, x2: M.l + (i + 1) * bw, y1: y(b[i]), y2: y(b[i]), class: "lb-b" }, svg);
    }
    text(svg, (M.l + W - M.r) / 2, H - 4, "the 100 servers", "viz-tick", "middle");
  }

  function chart() {
    const svg = $("lb-chart");
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth)), H = 150;
    const M = { t: 10, r: 8, b: 22, l: 34 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const lam = sim.o.lam, ref = lam / (1 - lam); // random's average jobs per server
    let top = Math.max(ref * 1.3, ...hist);
    const step = top > 40 ? 20 : top > 20 ? 10 : top > 8 ? 5 : top > 4 ? 2 : 1;
    top = Math.ceil(top / step) * step;
    const x = (i) => M.l + (i / (HIST - 1)) * (W - M.l - M.r);
    const y = (v) => H - M.b - (v / top) * (H - M.t - M.b);
    for (let v = 0; v <= top; v += step) {
      el("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v ? "viz-grid" : "viz-base" }, svg);
      text(svg, M.l - 6, y(v) + 4, String(v), "viz-tick", "end");
    }
    el("line", { x1: M.l, x2: W - M.r, y1: y(ref), y2: y(ref), class: "lb-ref" }, svg);
    text(svg, W - M.r, y(ref) - 5, "random, on average", "viz-tick", "end");
    if (hist.length > 1)
      el("polyline", { points: hist.map((v, i) => `${x(i + HIST - hist.length).toFixed(1)},${y(v).toFixed(1)}`).join(" "), class: "viz-line s1" }, svg);
    const span = speed() * HIST;
    text(svg, (M.l + W - M.r) / 2, H - 4, `jobs per server, last ${span < 10 ? span.toFixed(1) : Math.round(span)} service times`, "viz-tick", "middle");
  }

  function stats() {
    $("lb-t").textContent = Math.round(simT).toLocaleString("en-US");
    $("lb-mean").textContent = accT > 0 ? (acc / accT / (sim.o.lam * N)).toFixed(1) : "warming up";
    $("lb-now").textContent = sim.total.toLocaleString("en-US");
  }

  function draw() { bars(); chart(); stats(); }

  // faster sim when the board is very stale, so the slow swings are visible
  const speed = () => Math.min(40, Math.max(1, sim.o.T / 8));

  function frame() {
    running = false;
    if (!visible || paused) return;
    advance(speed());
    draw();
    start();
  }
  function start() {
    if (!running && visible && !paused) { running = true; requestAnimationFrame(frame); }
  }

  for (const b of document.querySelectorAll("#lb [data-p]"))
    b.addEventListener("click", () => {
      policy = b.dataset.p;
      for (const o of document.querySelectorAll("#lb [data-p]")) o.setAttribute("aria-pressed", String(o === b));
      reset();
    });
  for (const id of ["lb-load", "lb-T", "lb-k", "lb-own"]) $(id).addEventListener("input", reset);
  $("lb-play").addEventListener("click", () => {
    paused = !paused;
    $("lb-play").textContent = paused ? "play" : "pause";
    start();
  });
  if ("IntersectionObserver" in window)
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe($("lb"));
  window.addEventListener("resize", () => sim && draw());
  reset();
})();
