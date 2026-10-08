// UI for the "merge it yourself" widget: two offline editors, merged by six list CRDTs.
(function () {
  const C = window.CRDT;
  const root = document.getElementById('cr');
  if (!root || !C) return;
  const $ = id => document.getElementById(id);
  const ALGOS = ['fugue', 'yata', 'rga', 'logoot-b+', 'lseq', 'logoot'];
  const NAMES = { rga: 'RGA', yata: 'YATA (Yjs)', fugue: 'Fugue', logoot: 'Logoot, random gaps', 'logoot-b+': 'Logoot, boundary+', lseq: 'LSEQ' };
  const BASE = 'Lunch at noon.';
  const BASE_ID = 9; // replica ids: Ana 0, Ben 1, original text 9
  const eds = { a: $('cr-a'), b: $('cr-b') };
  let st, prev;

  function reset() {
    st = {};
    for (const a of ALGOS) {
      const base = C.ALGOS[a](BASE_ID, { rng: C.sfc32(99) });
      const baseOps = [];
      for (let i = 0; i < BASE.length; i++) baseOps.push(base.insert(i, BASE[i]));
      const reps = { a: C.ALGOS[a](0, { rng: C.sfc32(1) }), b: C.ALGOS[a](1, { rng: C.sfc32(2) }) };
      for (const r of Object.values(reps)) for (const op of baseOps) r.apply(op);
      st[a] = { baseOps, reps, log: { a: [], b: [] } };
    }
    eds.a.value = eds.b.value = BASE;
    prev = { a: BASE, b: BASE };
    render();
  }

  // Apply one edit (delete `del` chars at p, then insert `text` at p) to every algorithm's replica.
  function edit(who, p, del, text) {
    for (const a of ALGOS) {
      const s = st[a], r = s.reps[who];
      for (let k = 0; k < del; k++) s.log[who].push(r.del(p));
      for (let j = 0; j < text.length; j++) s.log[who].push(r.insert(p + j, text[j]));
    }
  }

  function onInput(who) {
    const o = prev[who], v = eds[who].value;
    let p = 0; while (p < o.length && p < v.length && o[p] === v[p]) p++;
    let s = 0; while (s < o.length - p && s < v.length - p && o[o.length - 1 - s] === v[v.length - 1 - s]) s++;
    edit(who, p, o.length - p - s, v.slice(p, v.length - s));
    prev[who] = v;
    render();
  }

  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function render() {
    let html = '';
    for (const a of ALGOS) {
      const s = st[a];
      const m = C.ALGOS[a](2, { rng: C.sfc32(3) });
      for (const op of s.baseOps) m.apply(op);
      for (const op of s.log.a) m.apply(op);
      for (const op of s.log.b) m.apply(op);
      const segs = [];
      for (const e of m.order()) {
        if (e.deleted) continue;
        const who = e.id.r === 0 ? 'a' : e.id.r === 1 ? 'b' : '';
        if (segs.length && segs[segs.length - 1][0] === who) segs[segs.length - 1][1] += e.ch;
        else segs.push([who, e.ch]);
      }
      const pieces = { a: 0, b: 0 };
      let text = '';
      for (const [who, t] of segs) { if (who) pieces[who]++; text += who ? `<span class="cr-${who}">${esc(t)}</span>` : esc(t); }
      const pc = n => n === 1 ? '1 piece' : n + ' pieces';
      const note = pieces.a > 1 || pieces.b > 1 ? `<span class="cr-bad">Ana's text in ${pc(pieces.a)}, Ben's in ${pc(pieces.b)}</span>` : '';
      html += `<tr><th>${NAMES[a]}</th><td><div class="cr-text">${text}</div>${note}</td></tr>`;
    }
    $('cr-rows').innerHTML = html;
  }

  // Demo: both type a phrase just before the full stop, concurrently. Backward = each letter typed in front of the last.
  function demo(backward) {
    reset();
    const words = { a: ' with Ana', b: ' and Ben' };
    const p = BASE.length - 1;
    for (const who of ['a', 'b']) {
      const w = words[who];
      for (let j = 0; j < w.length; j++) {
        const ch = backward ? w[w.length - 1 - j] : w[j];
        const at = backward ? p : p + j;
        edit(who, at, 0, ch);
        prev[who] = prev[who].slice(0, at) + ch + prev[who].slice(at);
      }
      eds[who].value = prev[who];
    }
    render();
  }

  eds.a.addEventListener('input', () => onInput('a'));
  eds.b.addEventListener('input', () => onInput('b'));
  $('cr-fwd').addEventListener('click', () => demo(false));
  $('cr-bwd').addEventListener('click', () => demo(true));
  $('cr-reset').addEventListener('click', reset);
  reset();
})();
