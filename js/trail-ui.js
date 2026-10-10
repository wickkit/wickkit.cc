// Fox Trail page. Needs trail.js and trail-data.js first.
(function () {
  "use strict";
  const T = window.KitTrail, DATA = window.KitTrailData;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  if (!T || !DATA || !$("board")) return;

  const SIZES = [5, 6, 7];
  const NAMES = { 5: "Small", 6: "Medium", 7: "Large" };
  const EPOCH = Date.UTC(2026, 9, 10); // puzzle #1 is Oct 10, 2026

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayNumber(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5);
  }
  const DAY = todayKey();
  const DAYNO = dayNumber(DAY);
  const pick = (n, k) => DATA[n][((k % DATA[n].length) + DATA[n].length) % DATA[n].length];

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("trail:" + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("trail:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  let state = null; // {n, p, code, daily, path, next, start, done, shown, adj, clueAt}
  let timerId = null;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function load(n, daily, code) {
    const p = T.decode(code);
    const clueAt = new Map(p.clues.map((c, k) => [c, k + 1]));
    state = { n, p, code, daily, path: [p.clues[0]], start: 0, done: false, shown: false,
              adj: T.adjacency(n, p.walls), clueAt };
    const saved = daily && store.get(`${DAY}:${n}`);
    if (saved && saved.path && T.check(p, saved.path).ok) {
      state.path = saved.path.slice();
      state.done = true;
      state.shown = !!saved.shown;
      state.secs = saved.secs;
    }
    clearInterval(timerId);
    $("timer").textContent = "0:00";
    $("share").textContent = "Share";
    draw();
    tabs();
    status();
  }

  function nextClue() {
    let k = 0;
    for (const c of state.path) if (state.clueAt.has(c)) k++;
    return k + 1;
  }

  // ---- drawing ----
  const U = 60; // one cell in SVG units
  let layers = null;

  function draw() {
    const { n, p } = state;
    const svg = $("board");
    svg.setAttribute("viewBox", `0 0 ${n * U} ${n * U}`);
    svg.textContent = "";
    layers = {
      cells: el("g", {}, svg),
      trail: el("g", {}, svg),
      walls: el("g", {}, svg),
      clues: el("g", {}, svg),
      fox: el("g", {}, svg),
    };
    for (let i = 0; i < n * n; i++) {
      const x = (i % n) * U, y = Math.floor(i / n) * U;
      el("rect", { x: x + 1.5, y: y + 1.5, width: U - 3, height: U - 3, rx: 7, class: "cell", "data-i": i }, layers.cells);
    }
    for (const w of p.walls) {
      const a = w >> 1, x = (a % n) * U, y = Math.floor(a / n) * U;
      if (w % 2 === 0) el("line", { x1: x + U, y1: y - 2, x2: x + U, y2: y + U + 2, class: "wall" }, layers.walls);
      else el("line", { x1: x - 2, y1: y + U, x2: x + U + 2, y2: y + U, class: "wall" }, layers.walls);
    }
    p.clues.forEach((c, k) => {
      const cx = (c % n) * U + U / 2, cy = Math.floor(c / n) * U + U / 2;
      const g = el("g", { class: "clue", "data-k": k + 1 }, layers.clues);
      el("circle", { cx, cy, r: U * 0.3 }, g);
      const t = el("text", { x: cx, y: cy, dy: "0.36em", "text-anchor": "middle" }, g);
      t.textContent = k + 1;
    });
    render();
  }

  const centre = (c) => [(c % state.n) * U + U / 2, Math.floor(c / state.n) * U + U / 2];

  function render() {
    const { path, n } = state;
    const on = new Set(path);
    for (const r of layers.cells.children) r.classList.toggle("on", on.has(+r.dataset.i));
    layers.trail.textContent = "";
    if (path.length > 1) {
      el("polyline", { points: path.map((c) => centre(c).join(",")).join(" "), class: "trail" + (state.done ? " won" : "") }, layers.trail);
    }
    const reached = nextClue() - 1;
    for (const g of layers.clues.children) g.classList.toggle("hit", +g.dataset.k <= reached);
    layers.fox.textContent = "";
    if (!state.done || state.shown) {
      const [x, y] = centre(path[path.length - 1]);
      const t = el("text", { x, y: y - U * 0.42, "text-anchor": "middle", class: "fox" }, layers.fox);
      t.textContent = "🦊";
    }
    $("count").textContent = `${path.length} / ${n * n} squares`;
  }

  function tabs() {
    const box = $("sizes");
    box.textContent = "";
    for (const n of SIZES) {
      const b = document.createElement("button");
      const s = store.get(`${DAY}:${n}`);
      b.textContent = `${n}×${n}` + (s ? (s.shown ? " ·" : " ✓") : "");
      b.title = `${NAMES[n]}, today's puzzle`;
      b.className = state.daily && state.n === n ? "sel" : "";
      b.onclick = () => load(n, true, pick(n, DAYNO));
      box.appendChild(b);
    }
  }

  function status(msg) {
    const st = $("status");
    if (state.done) {
      const secs = state.secs ?? 0;
      st.innerHTML = state.shown
        ? "That's the only way through. Try another?"
        : `<strong>Solved in ${fmtTime(secs)}.</strong> The fox made it home.`;
      $("share").hidden = state.shown;
      $("timer").textContent = state.shown ? "" : fmtTime(secs);
    } else {
      st.textContent = msg || (state.path.length === 1 ? "Drag from 1. Fill every square, hit the numbers in order." : "");
      $("share").hidden = true;
    }
    $("reveal").hidden = state.done;
    $("title-sub").textContent = state.daily ? `Puzzle #${DAYNO + 1} · ${DAY}` : "Practice puzzle";
  }

  // ---- timer ----
  function tick() {
    if (!state.start || state.done) return;
    $("timer").textContent = fmtTime(Math.floor((Date.now() - state.start) / 1000));
  }
  function startTimer() {
    if (state.start) return;
    state.start = Date.now();
    clearInterval(timerId);
    timerId = setInterval(tick, 500);
  }

  // ---- moves ----
  let flashTo = null;
  function flash(msg) {
    status(msg);
    clearTimeout(flashTo);
    flashTo = setTimeout(() => !state.done && status(), 1400);
  }

  function tryStep(c) {
    const { path, adj, clueAt } = state;
    const head = path[path.length - 1];
    if (path.length > 1 && c === path[path.length - 2]) { path.pop(); return true; }
    if (!adj[head].includes(c)) return false;
    if (path.includes(c)) return false;
    const k = clueAt.get(c);
    if (k && k !== nextClue()) { flash(`${k} comes later: get to ${nextClue()} first.`); buzz(); return false; }
    const last = state.p.clues.length;
    if (k === last && path.length + 1 !== state.n * state.n) { flash(`${last} is the finish. Fill the other squares first.`); buzz(); return false; }
    path.push(c);
    startTimer();
    return true;
  }

  // Walk toward the pointer one square at a time, so fast swipes don't skip squares.
  function moveToward(target) {
    let guard = 2 * state.n;
    while (guard-- > 0) {
      const head = state.path[state.path.length - 1];
      if (head === target) break;
      const n = state.n, hr = Math.floor(head / n), hc = head % n, tr = Math.floor(target / n), tc = target % n;
      const dr = tr - hr, dc = tc - hc;
      let step;
      if (Math.abs(dr) >= Math.abs(dc)) step = head + Math.sign(dr) * n;
      else step = head + Math.sign(dc);
      if (!tryStep(step)) {
        // try the other axis once before giving up
        const alt = Math.abs(dr) >= Math.abs(dc) ? (dc ? head + Math.sign(dc) : -1) : (dr ? head + Math.sign(dr) * n : -1);
        if (alt < 0 || !tryStep(alt)) break;
      }
    }
    render();
    if (!state.done && state.path.length === state.n * state.n) finish();
  }

  function cellAt(ev, strict) {
    const r = $("board").getBoundingClientRect();
    const fx = ((ev.clientX - r.left) / r.width) * state.n, fy = ((ev.clientY - r.top) / r.height) * state.n;
    if (fx < 0 || fy < 0 || fx >= state.n || fy >= state.n) return -1;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    // Ignore the outer rim of a square mid-drag so diagonal wobble doesn't jump rows.
    if (strict && (Math.abs(fx - cx - 0.5) > 0.4 || Math.abs(fy - cy - 0.5) > 0.4)) return -1;
    return cy * state.n + cx;
  }

  let dragging = false;
  function onDown(ev) {
    if (state.done) return;
    const c = cellAt(ev, false);
    if (c < 0) return;
    const i = state.path.indexOf(c);
    if (i >= 0) {
      state.path.length = i + 1; // grab the trail anywhere to cut it back to there
    } else {
      moveToward(c);
    }
    dragging = true;
    $("board").setPointerCapture?.(ev.pointerId);
    render();
    ev.preventDefault();
  }
  function onMove(ev) {
    if (!dragging || state.done) return;
    const c = cellAt(ev, true);
    if (c >= 0 && c !== state.path[state.path.length - 1]) moveToward(c);
    ev.preventDefault();
  }
  function onUp() { dragging = false; }

  function finish() {
    const res = T.check(state.p, state.path);
    if (!res.ok) { flash("Not quite: " + res.why + "."); return; }
    state.done = true;
    state.secs = Math.max(1, Math.round((Date.now() - (state.start || Date.now())) / 1000));
    clearInterval(timerId);
    if (state.daily) store.set(`${DAY}:${state.n}`, { secs: state.secs, path: state.path });
    render();
    status();
    tabs();
    celebrate();
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  }

  function buzz() { if (navigator.vibrate) navigator.vibrate(15); }

  // The fox runs the finished trail, squares lighting up behind it.
  function celebrate() {
    const { path } = state;
    const cells = layers.cells.children;
    const fox = el("text", { "text-anchor": "middle", class: "fox run" }, layers.fox);
    fox.textContent = "🦊";
    const t0 = performance.now(), per = Math.min(70, 2400 / path.length);
    function frame(now) {
      const f = (now - t0) / per;
      const i = Math.min(path.length - 1, Math.floor(f));
      const a = centre(path[i]), b = centre(path[Math.min(path.length - 1, i + 1)]);
      const u = Math.min(1, f - i);
      fox.setAttribute("x", a[0] + (b[0] - a[0]) * u);
      fox.setAttribute("y", a[1] + (b[1] - a[1]) * u - U * 0.1);
      for (let j = 0; j <= i; j++) cells[path[j]].classList.add("glow");
      if (f < path.length - 1) requestAnimationFrame(frame);
      else setTimeout(() => { fox.classList.add("home"); }, 100);
    }
    requestAnimationFrame(frame);
  }

  // ---- buttons ----
  $("undo").onclick = () => { if (!state.done && state.path.length > 1) { state.path.pop(); render(); status(); } };
  $("reset").onclick = () => {
    if (state.done && !state.shown && !confirm("Clear your solved trail and play it again?")) return;
    if (state.daily && state.done) store.set(`${DAY}:${state.n}`, null);
    load(state.n, state.daily, state.code);
  };
  $("another").onclick = () => {
    const n = state.n;
    const k = Math.floor(Math.random() * DATA[n].length);
    load(n, false, DATA[n][k]);
  };
  $("reveal").onclick = () => {
    if (state.done) return;
    if (!confirm("Show the answer? It won't count as solved.")) return;
    const r = T.solve(state.p, 1);
    if (!r.solution) return;
    state.path = r.solution;
    state.done = true;
    state.shown = true;
    clearInterval(timerId);
    if (state.daily) store.set(`${DAY}:${state.n}`, { shown: true, path: state.path });
    render(); status(); tabs();
  };
  $("share").onclick = async () => {
    const text = `🦊 Fox Trail #${DAYNO + 1} · ${state.n}×${state.n} · ${fmtTime(state.secs)}\nhttps://wickkit.cc/trail.html`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); $("share").textContent = "Copied"; }
    } catch (e) { /* cancelled */ }
  };

  const svg = $("board");
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);

  // Start on the first size not yet solved today.
  const first = SIZES.find((n) => !store.get(`${DAY}:${n}`)) ?? 5;
  load(first, true, pick(first, DAYNO));
})();
