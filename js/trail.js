// Fox Trail: draw one path through every square, passing the numbers in order.
// Shared by the page and the offline generator. No dependencies.
(function (root) {
  "use strict";

  // Edges: cell i has right edge 2i and down edge 2i+1.
  function edgeId(n, a, b) {
    if (a > b) [a, b] = [b, a];
    return b - a === 1 ? 2 * a : 2 * a + 1;
  }

  function adjacency(n, walls) {
    const ws = new Set(walls || []);
    const adj = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, out = [];
      if (r > 0) out.push(i - n);
      if (c < n - 1) out.push(i + 1);
      if (r < n - 1) out.push(i + n);
      if (c > 0) out.push(i - 1);
      adj.push(out.filter((j) => !ws.has(edgeId(n, i, j))));
    }
    return adj;
  }

  // Count solutions up to `limit`. Returns {count, solution, nodes}.
  // A solution starts on clue 1, enters clue k only after clue k-1, covers every
  // cell once and ends on the last clue.
  function solve(p, limit = 2, maxNodes = 5e6) {
    const n = p.n, N = n * n, K = p.clues.length;
    const adj = adjacency(n, p.walls);
    const clueAt = new Int16Array(N);
    p.clues.forEach((cell, k) => (clueAt[cell] = k + 1));
    const start = p.clues[0], end = p.clues[K - 1];
    const seen = new Uint8Array(N);
    const stack = new Int16Array(N);
    const path = [start];
    let count = 0, nodes = 0, solution = null, aborted = false;
    seen[start] = 1;

    function alive(head, left) {
      // Every unvisited cell needs two free sides (in and out), the end needs one.
      for (let u = 0; u < N; u++) {
        if (seen[u]) continue;
        let free = 0;
        for (const v of adj[u]) if (!seen[v] || v === head) free++;
        if (free < (u === end ? 1 : 2)) return false;
      }
      // And the unvisited cells must all still be reachable from the head.
      let top = 0, reached = 0;
      const mark = new Uint8Array(N);
      for (const v of adj[head]) if (!seen[v]) { mark[v] = 1; stack[top++] = v; }
      while (top) {
        const u = stack[--top]; reached++;
        for (const v of adj[u]) if (!seen[v] && !mark[v]) { mark[v] = 1; stack[top++] = v; }
      }
      return reached === left;
    }

    function dfs(cur, depth, next) {
      if (++nodes > maxNodes) { aborted = true; return; }
      if (depth === N) {
        if (cur === end) { count++; if (!solution) solution = path.slice(); }
        return;
      }
      if (cur === end) return;
      for (const nb of adj[cur]) {
        if (seen[nb]) continue;
        const c = clueAt[nb];
        if (c && c !== next) continue;
        if (nb === end && depth + 1 !== N) continue;
        seen[nb] = 1; path.push(nb);
        if (alive(nb, N - depth - 1)) dfs(nb, depth + 1, c ? next + 1 : next);
        path.pop(); seen[nb] = 0;
        if (count >= limit || aborted) return;
      }
    }
    if (K >= 1 && (N === 1 || alive(start, N - 1))) dfs(start, 1, 2);
    return { count, solution, nodes, aborted };
  }

  // Is `path` (list of cell indices) a finished, legal trail for puzzle p?
  function check(p, path) {
    const n = p.n, N = n * n;
    if (path.length !== N) return { ok: false, why: "cover every square" };
    const adj = adjacency(n, p.walls);
    const clueAt = new Map(p.clues.map((c, k) => [c, k + 1]));
    const seen = new Set();
    let next = 1;
    for (let t = 0; t < N; t++) {
      const c = path[t];
      if (!(c >= 0 && c < N) || seen.has(c)) return { ok: false, why: "a square twice" };
      if (t > 0 && !adj[path[t - 1]].includes(c)) return { ok: false, why: "not a neighbour" };
      seen.add(c);
      if (clueAt.has(c)) {
        if (clueAt.get(c) !== next) return { ok: false, why: "numbers out of order" };
        next++;
      }
    }
    if (path[0] !== p.clues[0]) return { ok: false, why: "start on 1" };
    if (path[N - 1] !== p.clues[p.clues.length - 1]) return { ok: false, why: "end on the last number" };
    return { ok: true };
  }

  // Compact text form: "n.c1,c2,...;w1,w2,..." in base 36.
  function encode(p) {
    const b = (x) => x.toString(36);
    return `${p.n}.${p.clues.map(b).join(",")};${(p.walls || []).map(b).join(",")}`;
  }
  function decode(s) {
    const [n, rest] = s.split(".");
    const [cl, wl] = rest.split(";");
    const nums = (t) => (t ? t.split(",").map((x) => parseInt(x, 36)) : []);
    return { n: +n, clues: nums(cl), walls: nums(wl) };
  }

  // Small seeded PRNG (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = { edgeId, adjacency, solve, check, encode, decode, rng };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KitTrail = api;
})(this);
