'use strict';
// Six list CRDTs behind one interface (used by the merge widget):
//   new X(replica, opts) ; x.insert(i, ch) -> op ; x.del(i) -> op ; x.apply(op) ; x.text()
// Replica ids are small ints. Every algorithm keeps tombstones.

const key = (id) => id === null ? 'root' : id.c + '@' + id.r;
const eqId = (a, b) => a === b || (a !== null && b !== null && a.c === b.c && a.r === b.r);
// Lamport order: counter, then replica.
const cmpLamport = (a, b) => a.c !== b.c ? a.c - b.c : a.r - b.r;
// Replica-first order (Fugue siblings).
const cmpRC = (a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c;

class ListBase {
  constructor(r, opts = {}) { this.r = r; this.clock = 0; this.list = []; this.byKey = new Map(); this.opts = opts; }
  order() { return this.list; }
  visIndex(i) { // list index of the i-th visible element
    const L = this.order(); let v = -1;
    for (let k = 0; k < L.length; k++) if (!L[k].deleted && ++v === i) return k;
    return -1;
  }
  text() { let s = ''; for (const e of this.order()) if (!e.deleted) s += e.ch; return s; }
  del(i) { const e = this.order()[this.visIndex(i)]; const op = { t: 'del', id: e.id }; this.apply(op); return op; }
  applyDel(op) { this.byKey.get(key(op.id)).deleted = true; }
  nextId() { return { c: ++this.clock, r: this.r }; }
  seen(id) { if (id.c > this.clock) this.clock = id.c; }
}

// RGA (Roh et al. 2011): insert after a reference element; skip right past elements with larger Lamport ids.
class RGA extends ListBase {
  insert(i, ch) {
    const L = this.list; const k = i === 0 ? -1 : this.visIndex(i - 1);
    const op = { t: 'ins', id: this.nextId(), ch, ref: k < 0 ? null : L[k].id };
    this.apply(op); return op;
  }
  apply(op) {
    if (op.t === 'del') return this.applyDel(op);
    this.seen(op.id);
    const L = this.list;
    let p = op.ref === null ? 0 : L.indexOf(this.byKey.get(key(op.ref))) + 1;
    while (p < L.length && cmpLamport(L[p].id, op.id) > 0) p++;
    const e = { id: op.id, ch: op.ch, deleted: false };
    L.splice(p, 0, e); this.byKey.set(key(op.id), e);
  }
}

// YATA as implemented in Yjs (Item.integrate): left origin + right origin, conflict scan.
class YATA extends ListBase {
  insert(i, ch) {
    const L = this.list; const k = i === 0 ? -1 : this.visIndex(i - 1);
    const right = k + 1 < L.length ? L[k + 1] : null;
    const op = { t: 'ins', id: this.nextId(), ch, origin: k < 0 ? null : L[k].id, rightOrigin: right ? right.id : null };
    this.apply(op); return op;
  }
  apply(op) {
    if (op.t === 'del') return this.applyDel(op);
    this.seen(op.id);
    const L = this.list;
    const li = op.origin === null ? -1 : L.indexOf(this.byKey.get(key(op.origin)));
    const ri = op.rightOrigin === null ? L.length : L.indexOf(this.byKey.get(key(op.rightOrigin)));
    let dest = li + 1;
    const conflicting = new Set(), before = new Set();
    for (let o = li + 1; o < ri; o++) {
      const x = L[o]; const xk = key(x.id);
      before.add(xk); conflicting.add(xk);
      if (eqId(x.origin, op.origin)) {
        const less = x.id.r < op.id.r;
        if (less) { dest = o + 1; conflicting.clear(); }
        else if (eqId(x.rightOrigin, op.rightOrigin)) break;
      } else if (x.origin !== null && before.has(key(x.origin))) {
        if (!conflicting.has(key(x.origin))) { dest = o + 1; conflicting.clear(); }
      } else break;
    }
    const e = { id: op.id, ch: op.ch, deleted: false, origin: op.origin, rightOrigin: op.rightOrigin };
    L.splice(dest, 0, e); this.byKey.set(key(op.id), e);
  }
}

// Fugue (Weidner & Kleppmann 2023), tree form. Left children, node, right children; siblings by (replica, counter).
class Fugue extends ListBase {
  constructor(r, opts) { super(r, opts); this.root = { id: null, L: [], R: [], deleted: true }; this.byKey.set('root', this.root); this.dirty = false; }
  order() {
    if (!this.dirty) return this.list;
    const out = []; const st = [[this.root, 0]];
    while (st.length) { // iterative in-order: phase 0 = left kids, 1 = self + right kids
      const top = st[st.length - 1]; const [n, ph] = top;
      if (ph === 0) { top[1] = 1; for (let j = n.L.length - 1; j >= 0; j--) st.push([n.L[j], 0]); }
      else { st.pop(); if (n !== this.root) out.push(n); for (let j = n.R.length - 1; j >= 0; j--) st.push([n.R[j], 0]); }
    }
    this.list = out; this.dirty = false; return out;
  }
  insert(i, ch) {
    const L = this.order(); const k = i === 0 ? -1 : this.visIndex(i - 1);
    const a = k < 0 ? this.root : L[k];
    let op;
    if (a.R.length === 0) op = { t: 'ins', id: this.nextId(), ch, parent: a.id, side: 'R' };
    else op = { t: 'ins', id: this.nextId(), ch, parent: L[k + 1].id, side: 'L' }; // L[k+1]: leftmost node of a's right subtree
    this.apply(op); return op;
  }
  apply(op) {
    if (op.t === 'del') return this.applyDel(op);
    this.seen(op.id);
    const p = this.byKey.get(key(op.parent));
    const n = { id: op.id, ch: op.ch, deleted: false, L: [], R: [] };
    const sib = op.side === 'L' ? p.L : p.R;
    let j = 0; while (j < sib.length && cmpRC(sib[j].id, op.id) < 0) j++;
    sib.splice(j, 0, n); this.byKey.set(key(op.id), n); this.dirty = true;
  }
}

// Logoot-family dense identifiers. A position is a list of levels {n, r, c}, compared lexicographically
// (n, then r, then c; a prefix sorts first). Allocation walks levels between neighbours p < q.
//   strategy 'rand': uniform in the gap (original Logoot), base 2^16
//   strategy 'b+'  : boundary+ (step <= 10 right of p), base 2^16
//   strategy 'lseq': base 2^(5+depth), boundary+/boundary- chosen per depth by hash (LSEQ, Nedelec et al. 2013)
const cmpLevel = (a, b) => a.n !== b.n ? a.n - b.n : a.r !== b.r ? a.r - b.r : a.c - b.c;
function cmpPos(a, b) {
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) { const d = cmpLevel(a[i], b[i]); if (d) return d; }
  return a.length - b.length;
}
class Logoot extends ListBase {
  constructor(r, opts) { super(r, opts); this.strategy = opts.strategy || 'b+'; this.rng = opts.rng; }
  base(d) { return this.strategy === 'lseq' ? 2 ** Math.min(5 + d, 40) : 2 ** 16; }
  plusAt(d) { if (this.strategy !== 'lseq') return true; return ((d * 2654435761) >>> 16) % 2 === 0; }
  pick(lo, hi, d) { // integer in (lo, hi) exclusive; caller guarantees hi - lo >= 2
    const gap = hi - lo - 1;
    if (this.strategy === 'rand') return lo + 1 + Math.floor(this.rng() * gap);
    const step = Math.min(10, gap);
    const s = 1 + Math.floor(this.rng() * step);
    return this.plusAt(d) ? lo + s : hi - s;
  }
  alloc(p, q) { // p, q: positions or null (document ends)
    const out = []; const c = this.clock + 1;
    let boundP = p !== null, boundQ = q !== null;
    for (let d = 0; ; d++) {
      const B = this.base(d);
      const lo = boundP && d < p.length ? p[d] : null; // null: p has ended -> unbounded below at this level
      const hi = boundQ ? q[d] : null;                    // q cannot end while still bound (p < q)
      const loN = lo ? lo.n : 0, hiN = hi ? hi.n : B;
      if (hiN - loN >= 2) { out.push({ n: this.pick(loN, hiN, d), r: this.r, c }); return out; }
      // No room at this level: copy one bound and descend.
      const cp = lo || { n: 0, r: -1, c: 0 };
      out.push(cp);
      if (boundP && !lo) boundP = false;
      if (boundQ && cmpLevel(cp, hi) !== 0) boundQ = false;
      if (boundP && lo === null) boundP = false;
    }
  }
  insert(i, ch) {
    const L = this.list; const k = i === 0 ? -1 : this.visIndex(i - 1);
    const pos = this.alloc(k < 0 ? null : L[k].pos, k + 1 < L.length ? L[k + 1].pos : null);
    const op = { t: 'ins', id: this.nextId(), ch, pos };
    this.apply(op); return op;
  }
  apply(op) {
    if (op.t === 'del') return this.applyDel(op);
    this.seen(op.id);
    const L = this.list; let a = 0, b = L.length;
    const cmp = cmpPos;
    while (a < b) { const m = (a + b) >> 1; if (cmp(L[m].pos, op.pos) < 0) a = m + 1; else b = m; }
    const e = { id: op.id, ch: op.ch, deleted: false, pos: op.pos };
    L.splice(a, 0, e); this.byKey.set(key(op.id), e);
  }
}

const ALGOS = {
  rga: (r, o) => new RGA(r, o),
  yata: (r, o) => new YATA(r, o),
  fugue: (r, o) => new Fugue(r, o),
  logoot: (r, o) => new Logoot(r, { ...o, strategy: 'rand' }),
  'logoot-b+': (r, o) => new Logoot(r, { ...o, strategy: 'b+' }),
  lseq: (r, o) => new Logoot(r, { ...o, strategy: 'lseq' }),
};

// sfc32 PRNG
function sfc32(seed) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const f = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; };
  for (let i = 0; i < 15; i++) f();
  return f;
}

const CRDT = { ALGOS, sfc32, cmpPos, key };
if (typeof module === 'object' && module.exports) module.exports = CRDT; else self.CRDT = CRDT;
