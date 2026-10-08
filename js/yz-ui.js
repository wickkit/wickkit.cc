// "Play against the solver": a solitaire Yahtzee game that grades every move
// against the exact optimal strategy (expected final score, official rules).
(function () {
  const root = document.getElementById('yz');
  if (!root) return;
  const Y = window.YZ, R = Y.OFFICIAL, W = Y.makeWidget();
  const $ = id => document.getElementById(id);
  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const NAMES = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', '3 of a kind', '4 of a kind',
    'Full house', 'Small straight', 'Large straight', 'Yahtzee', 'Chance'];
  let V = null, g = null;

  const cntOf = (dice, which) => { const c = [0, 0, 0, 0, 0, 0]; dice.forEach((d, i) => { if (!which || which[i]) c[d]++; }); return c; };
  const keepOf = c => Y.keepIndex.get(c.join(''));
  const rollIdx = dice => Y.rollOfKeep[keepOf(cntOf(dice))];
  const fmt = x => x.toFixed(2);
  const keepText = k => { const c = Y.keeps[k].cnt, s = []; c.forEach((n, f) => { for (let i = 0; i < n; i++) s.push(FACES[f]); }); return s.length ? s.join('') : 'nothing'; };

  function newGame() {
    g = { mask: 0, u: 0, f: 0, score: 0, upper: 0, bonus: 0, yzb: 0, turn: 0, roll: 0, dice: [0, 0, 0, 0, 0], held: [0, 0, 0, 0, 0],
      lost: 0, boxes: Array(13).fill(null), msg: '', T: null };
    startTurn(); render();
  }
  function startTurn() {
    g.roll = 0; g.held = [0, 0, 0, 0, 0];
    g.T = g.turn < 13 ? W.tables(V, g.mask, g.u, g.f, R) : null;
  }
  const si = () => Y.sidx(g.mask, g.u, g.f);
  function bestKeep(K, r) {
    let m = -Infinity, mk = -1;
    for (let j = Y.subOff[r]; j < Y.subOff[r + 1]; j++) if (K[Y.sub[j]] > m) { m = K[Y.sub[j]]; mk = Y.sub[j]; }
    return { v: m, k: mk };
  }
  function bestBox(r) {
    let m = -Infinity, bc = -1;
    Y.choices(g.mask, g.u, g.f, r, R, (c, pts, ni) => { if (pts + V[ni] > m) { m = pts + V[ni]; bc = c; } });
    return { v: m, c: bc };
  }
  // value of the best option right now (expected points still to come)
  function bestNow(r) { return g.roll === 3 ? bestBox(r).v : bestKeep(g.roll === 1 ? g.T.K1 : g.T.K2, r).v; }
  function grade(loss, what, best) {
    if (loss < 0.005) { g.msg = '<b>Perfect.</b> ' + what; return; }
    g.lost += loss;
    g.msg = '<b>Cost you ' + fmt(loss) + ' points</b> on average. ' + what + ' The solver would ' + best + '.';
  }
  function doRoll() {
    if (g.turn >= 13 || g.roll >= 3) return;
    if (g.roll > 0) {
      const r = rollIdx(g.dice), K = g.roll === 1 ? g.T.K1 : g.T.K2;
      const k = keepOf(cntOf(g.dice, g.held)), b = bestKeep(K, r);
      grade(b.v - K[k], 'You held ' + keepText(k) + '.', 'hold ' + keepText(b.k));
    } else g.msg = '';
    for (let i = 0; i < 5; i++) if (!g.held[i] || g.roll === 0) g.dice[i] = (Math.random() * 6) | 0;
    g.held = [0, 0, 0, 0, 0]; g.roll++;
    render();
  }
  function doScore(c) {
    if (g.roll === 0 || g.turn >= 13) return;
    const r = rollIdx(g.dice); let got = null;
    Y.choices(g.mask, g.u, g.f, r, R, (cc, pts, ni) => { if (cc === c) got = { pts, ni }; });
    if (!got) return;
    const best = bestNow(r), v = got.pts + V[got.ni];
    let bestTxt;
    if (g.roll === 3) bestTxt = 'score it as ' + NAMES[bestBox(r).c];
    else { const b = bestKeep(g.roll === 1 ? g.T.K1 : g.T.K2, r); bestTxt = b.k === keepOf(cntOf(g.dice)) ? 'score it as ' + NAMES[bestBox(r).c] : 'hold ' + keepText(b.k) + ' and roll'; }
    grade(best - v, 'You scored ' + NAMES[c] + '.', bestTxt);
    // bookkeeping for the card
    const raw = Y.base[r * 13 + c];
    const yzFilled = (g.mask >> Y.CYZ) & 1;
    if (Y.isYz[r] && yzFilled && g.f) g.yzb += R.yzBonus;
    if (c < 6 && g.u < 63 && g.u + raw >= 63) g.bonus = R.upperBonus;
    if (c < 6) g.upper += (got.pts - (Y.isYz[r] && yzFilled && g.f ? R.yzBonus : 0) - (g.u < 63 && g.u + raw >= 63 ? R.upperBonus : 0));
    g.boxes[c] = got.pts - (Y.isYz[r] && yzFilled && g.f ? R.yzBonus : 0) - (c < 6 && g.u < 63 && g.u + raw >= 63 ? R.upperBonus : 0);
    g.score += got.pts;
    const ni = got.ni; g.mask = ni >> 7; g.u = (ni >> 1) & 63; g.f = ni & 1;
    g.turn++; startTurn(); render();
  }
  function hint() {
    if (g.roll === 0) return 'Roll to start the turn.';
    const r = rollIdx(g.dice);
    if (g.roll === 3) { const b = bestBox(r); return 'Score it as ' + NAMES[b.c] + ' (expected final ' + fmt(g.score + b.v) + ').'; }
    const b = bestKeep(g.roll === 1 ? g.T.K1 : g.T.K2, r);
    if (b.k === keepOf(cntOf(g.dice))) return 'Keep everything: score it as ' + NAMES[bestBox(r).c] + '.';
    return 'Hold ' + keepText(b.k) + ' (expected final ' + fmt(g.score + b.v) + ').';
  }
  function render() {
    const done = g.turn >= 13;
    const r = g.roll ? rollIdx(g.dice) : -1;
    const legal = new Map();
    if (r >= 0 && !done) Y.choices(g.mask, g.u, g.f, r, R, (c, pts) => legal.set(c, pts));
    $('yz-dice').innerHTML = g.dice.map((d, i) =>
      '<button class="yz-die' + (g.held[i] ? ' held' : '') + '" data-i="' + i + '"' + (g.roll === 0 || g.roll === 3 || done ? ' disabled' : '') +
      ' aria-pressed="' + (g.held[i] ? 'true' : 'false') + '" aria-label="die ' + (d + 1) + '">' + (g.roll ? FACES[d] : '·') + '</button>').join('');
    $('yz-roll').disabled = done || g.roll >= 3;
    $('yz-roll').textContent = g.roll === 0 ? 'Roll' : g.roll >= 3 ? 'No rolls left' : 'Roll again (' + (3 - g.roll) + ' left)';
    let rows = '';
    for (let c = 0; c < 13; c++) {
      if (c === 6) rows += '<tr class="yz-sub"><td>Upper total (bonus at 63)</td><td>' + g.upper + (g.bonus ? ' +' + g.bonus : '') + '</td></tr>';
      const filled = g.boxes[c] !== null;
      const cell = filled ? String(g.boxes[c]) : legal.has(c) ? '<button data-c="' + c + '">' + (legal.get(c)) + '</button>' : '';
      rows += '<tr' + (filled ? ' class="filled"' : '') + '><td>' + NAMES[c] + '</td><td>' + cell + '</td></tr>';
    }
    if (g.yzb) rows += '<tr class="yz-sub"><td>Yahtzee bonus</td><td>' + g.yzb + '</td></tr>';
    rows += '<tr class="yz-sub"><td>Total</td><td>' + g.score + '</td></tr>';
    $('yz-card').innerHTML = rows;
    const exp = done ? g.score : g.score + (g.roll ? bestNow(r) : V[si()]);
    $('yz-stats').innerHTML = done
      ? '<b>Final score ' + g.score + '.</b> You gave away ' + fmt(g.lost) + ' points of expected score to imperfect choices. (Perfect play averages 254.59; luck decides the rest.)'
      : 'Turn ' + (g.turn + 1) + ' of 13 · perfect play from here ends at ' + fmt(exp) + ' on average · points given away so far: ' + fmt(g.lost);
    $('yz-msg').innerHTML = g.msg || (done ? '' : 'Click dice to hold them, then roll. Click a number on the card to score.');
    $('yz-hint').textContent = $('yz-hints').checked && !done ? 'Solver: ' + hint() : '';
  }
  root.addEventListener('click', e => {
    const d = e.target.closest('.yz-die'); if (d && !d.disabled) { g.held[+d.dataset.i] ^= 1; render(); return; }
    const b = e.target.closest('button[data-c]'); if (b) doScore(+b.dataset.c);
  });
  $('yz-roll').addEventListener('click', doRoll);
  $('yz-new').addEventListener('click', newGame);
  $('yz-hints').addEventListener('change', render);

  // load the optimal value table (expected remaining score per scorecard state, in hundredths)
  (async () => {
    try {
      const res = await fetch('/data/yz-v.u16.gz');
      const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const q = new Uint16Array(buf); V = new Float64Array(q.length);
      for (let i = 0; i < q.length; i++) V[i] = q[i] / 100;
      $('yz-load').hidden = true; $('yz-game').hidden = false; newGame();
    } catch (err) { $('yz-load').textContent = 'Could not load the solver table (' + err.message + ').'; }
  })();
})();
