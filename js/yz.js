// Solitaire Yahtzee: dice tables, scoring, and the per-turn "widget" solver.
// State between turns: (mask of filled boxes, upper subtotal capped at 63,
// yahtzee-bonus flag = Yahtzee box holds 50). Index = (mask*64+u)*2+flag.
'use strict';

const NCAT = 13;
const CAT = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  '3K', '4K', 'FH', 'SS', 'LS', 'Yahtzee', 'Chance'];
const C3K = 6, C4K = 7, CFH = 8, CSS = 9, CLS = 10, CYZ = 11, CCH = 12;
const NSTATE = (1 << NCAT) * 64 * 2;
const sidx = (mask, u, f) => ((mask * 64) + u) * 2 + f;

// Multisets of 0..5 dice, as count vectors over faces 1..6.
const keeps = [];      // {cnt:[6], n}
const keyOf = c => c.join('');
const keepIndex = new Map();
(function gen(face, left, cnt) {
  if (face === 6) {
    const c = cnt.slice(); const n = c.reduce((a, b) => a + b, 0);
    keepIndex.set(keyOf(c), keeps.length); keeps.push({ cnt: c, n });
    return;
  }
  for (let k = 0; k <= left; k++) { cnt[face] = k; gen(face + 1, left - k, cnt); }
  cnt[face] = 0;
})(0, 5, [0, 0, 0, 0, 0, 0]);
const NK = keeps.length; // 462

const rolls = [];       // keep indices of 5-dice multisets
for (let i = 0; i < NK; i++) if (keeps[i].n === 5) rolls.push(i);
const NR = rolls.length; // 252
const rollOfKeep = new Int32Array(NK).fill(-1);
rolls.forEach((k, r) => { rollOfKeep[k] = r; });

// add[k*6+d] = keep index of k plus one die showing d+1 (or -1 if k has 5)
const add = new Int32Array(NK * 6).fill(-1);
for (let i = 0; i < NK; i++) {
  if (keeps[i].n === 5) continue;
  for (let d = 0; d < 6; d++) {
    const c = keeps[i].cnt.slice(); c[d]++;
    add[i * 6 + d] = keepIndex.get(keyOf(c));
  }
}
// keeps ordered so that we can process by descending n
const keepsByN = [[], [], [], [], [], []];
for (let i = 0; i < NK; i++) keepsByN[keeps[i].n].push(i);

// sub-keeps of each roll (distinct multisets)
const subOff = new Int32Array(NR + 1); const subList = [];
for (let r = 0; r < NR; r++) {
  subOff[r] = subList.length;
  const c = keeps[rolls[r]].cnt;
  (function g(face, cur) {
    if (face === 6) { subList.push(keepIndex.get(keyOf(cur))); return; }
    for (let k = 0; k <= c[face]; k++) { cur[face] = k; g(face + 1, cur); }
    cur[face] = 0;
  })(0, [0, 0, 0, 0, 0, 0]);
}
subOff[NR] = subList.length;
const sub = Int32Array.from(subList);

// probability of each roll from scratch (5 fresh dice)
const fact = [1, 1, 2, 6, 24, 120];
const pRoll = new Float64Array(NR);
for (let r = 0; r < NR; r++) {
  let m = 120; for (const x of keeps[rolls[r]].cnt) m /= fact[x];
  pRoll[r] = m / 7776;
}

// raw score table (no joker): base[r*13+c]
const base = new Int32Array(NR * NCAT);
const isYz = new Uint8Array(NR); const yzFace = new Int8Array(NR).fill(-1);
const rollSum = new Int32Array(NR);
for (let r = 0; r < NR; r++) {
  const c = keeps[rolls[r]].cnt;
  let sum = 0, mx = 0; for (let f = 0; f < 6; f++) { sum += c[f] * (f + 1); mx = Math.max(mx, c[f]); }
  rollSum[r] = sum;
  const has = f => c[f] > 0;
  const sorted = c.slice().sort();
  const s = base.subarray(r * NCAT, r * NCAT + NCAT);
  for (let f = 0; f < 6; f++) s[f] = c[f] * (f + 1);
  s[C3K] = mx >= 3 ? sum : 0;
  s[C4K] = mx >= 4 ? sum : 0;
  s[CFH] = (sorted[5] === 3 && sorted[4] === 2) ? 25 : 0;
  const ss = (has(0) && has(1) && has(2) && has(3)) || (has(1) && has(2) && has(3) && has(4)) ||
    (has(2) && has(3) && has(4) && has(5));
  s[CSS] = ss ? 30 : 0;
  s[CLS] = ((has(0) || has(5)) && has(1) && has(2) && has(3) && has(4)) ? 40 : 0;
  s[CYZ] = mx === 5 ? 50 : 0;
  s[CCH] = sum;
  if (mx === 5) { isYz[r] = 1; yzFace[r] = c.indexOf(5); }
}

// Rule options: {upperBonus:35, yzBonus:100, joker:'forced'|'free'|'none'}
const OFFICIAL = { upperBonus: 35, yzBonus: 100, joker: 'forced' };

// Legal (category, points, nextState, immediate) choices for roll r in state.
// Calls cb(c, pts, nextIndex) where pts includes bonuses earned now.
function choices(mask, u, f, r, rules, cb) {
  const s = r * NCAT;
  const yzFilled = (mask >> CYZ) & 1;
  let jok = false, bonus = 0;
  if (isYz[r] && yzFilled && rules.joker !== 'none') {
    jok = true; if (f) bonus = rules.yzBonus;
  } else if (isYz[r] && yzFilled && f) bonus = rules.yzBonus;
  const emit = (c, pts) => {
    let nu = u, add = 0;
    if (c < 6) {
      nu = Math.min(63, u + pts);
      if (u < 63 && u + pts >= 63) add = rules.upperBonus;
    }
    const nf = c === CYZ ? (pts === 50 ? 1 : 0) : f;
    cb(c, pts + add + bonus, sidx(mask | (1 << c), nu, nf));
  };
  if (jok) {
    const face = yzFace[r];
    if (rules.joker === 'verhoeff') { // no forcing; FH/SS/LS full only if v-box filled
      const full = (mask >> face) & 1;
      for (let c = 0; c < NCAT; c++) if (!((mask >> c) & 1)) {
        const pts = !full ? base[s + c] : c === CFH ? 25 : c === CSS ? 30 : c === CLS ? 40 : base[s + c];
        emit(c, pts);
      }
      return;
    }
    if (rules.joker === 'forced' && !((mask >> face) & 1)) { emit(face, base[s + face]); return; }
    let any = false;
    const lowerOpen = [C3K, C4K, CFH, CSS, CLS, CCH].filter(c => !((mask >> c) & 1));
    if (rules.joker === 'free') {
      for (let c = 0; c < 6; c++) if (!((mask >> c) & 1)) emit(c, base[s + c]);
      any = !!(~mask & 63);
    }
    for (const c of lowerOpen) {
      any = true;
      const pts = c === CFH ? 25 : c === CSS ? 30 : c === CLS ? 40 : base[s + c];
      emit(c, pts);
    }
    if (!any) for (let c = 0; c < 6; c++) if (!((mask >> c) & 1)) emit(c, 0);
    return;
  }
  for (let c = 0; c < NCAT; c++) if (!((mask >> c) & 1)) emit(c, base[s + c]);
}

// Turn widget: given V (future values), compute value of turn-start state and
// optionally return the intermediate tables (for advice / simulation).
// Scratch buffers allocated per caller.
function makeWidget() {
  const L3 = new Float64Array(NR), L2 = new Float64Array(NR), L1 = new Float64Array(NR);
  const K = new Float64Array(NK);
  function keepVals(L) { // K[k] = expected L after rolling the missing dice
    for (let r = 0; r < NR; r++) K[rolls[r]] = L[r];
    for (let n = 4; n >= 0; n--) for (const k of keepsByN[n]) {
      let a = 0; const o = k * 6;
      for (let d = 0; d < 6; d++) a += K[add[o + d]];
      K[k] = a / 6;
    }
  }
  function bestKeep(Lout) {
    for (let r = 0; r < NR; r++) {
      let m = -1; for (let j = subOff[r]; j < subOff[r + 1]; j++) { const v = K[sub[j]]; if (v > m) m = v; }
      Lout[r] = m;
    }
  }
  function solve(V, mask, u, f, rules) {
    for (let r = 0; r < NR; r++) {
      let m = -Infinity;
      choices(mask, u, f, r, rules, (c, pts, ni) => { const v = pts + V[ni]; if (v > m) m = v; });
      L3[r] = m;
    }
    keepVals(L3); bestKeep(L2);
    keepVals(L2); bestKeep(L1);
    let e = 0; for (let r = 0; r < NR; r++) e += pRoll[r] * L1[r];
    return e;
  }
  // full tables for a state: K after roll1 (K1) and after roll2 (K2)
  function tables(V, mask, u, f, rules) {
    for (let r = 0; r < NR; r++) {
      let m = -Infinity;
      choices(mask, u, f, r, rules, (c, pts, ni) => { const v = pts + V[ni]; if (v > m) m = v; });
      L3[r] = m;
    }
    keepVals(L3); const K2 = Float64Array.from(K); bestKeep(L2);
    keepVals(L2); const K1 = Float64Array.from(K); bestKeep(L1);
    return { K1, K2, L3: Float64Array.from(L3) };
  }
  return { solve, tables };
}

const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };

const API = { NCAT, CAT, NSTATE, sidx, keeps, keepIndex, NK, rolls, NR, rollOfKeep, add, sub, subOff,
  pRoll, base, isYz, rollSum, choices, keepsByN, makeWidget, popcount, OFFICIAL, CYZ };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else self.YZ = API;
