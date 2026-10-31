// さいごの もんだい 30 問の 検証：node test/puzzle.test.js
'use strict';
require('../js/rules.js');
require('../js/ai.js');
require('../js/puzzle.js');
require('../js/puzzle-data.js');
const E = globalThis.Engine, PZ = globalThis.Puzzle, PROBS = globalThis.PUZZLES;
const assert = require('assert');

assert.strictEqual(PROBS.length, 30);
const seen = new Set();
PROBS.forEach((pr, i) => {
  const name = `第${i + 1}問`;
  const key = pr.rows.join('/');
  assert.ok(!seen.has(key), name + ' おなじ もんだいが ある');
  seen.add(key);
  const s = PZ.start(pr);
  const n = s.size;
  assert.strictEqual(s.turn, 0, name + ' くろの ばん');
  assert.strictEqual(s.winner, null);
  assert.strictEqual(n * n - s.counts[0] - s.counts[1], pr.empties, name + ' あきの かず');
  const S = new PZ.Solver(n);
  const legal = E.legalMoves(s);
  assert.ok(legal.length >= 3, name + ' おける 手が 3つ以上');
  const win = S.winning(s);
  assert.strictEqual(win.length, 1, name + ' かてる 手は 1つだけ');
  const ans = win[0];
  const flips = legal.map(p => E.flipsAt(s.board, n, p, 1).length);
  const fa = E.flipsAt(s.board, n, ans, 1).length;
  const has = t => pr.tags.includes(t);
  assert.strictEqual(has('corner'), E.geo(n).corners.includes(ans), name + ' corner');
  assert.strictEqual(has('pass'), E.apply(s, ans).skipped === 1, name + ' pass');
  assert.strictEqual(has('notgreedy'), fa < Math.max(...flips), name + ' notgreedy');
  assert.strictEqual(has('fewest'), fa === Math.min(...flips) && Math.min(...flips) < Math.max(...flips), name + ' fewest');
  assert.strictEqual(has('behind'), s.counts[0] < s.counts[1], name + ' behind');
  // 正解手順：とちゅうも くろの かてる 手は 1つだけ。さいごは くろの かち
  let t = s, blackMoves = 0;
  while (t.winner === null) {
    if (t.turn === 0) {
      const w = S.winning(t);
      assert.strictEqual(w.length, 1, name + ' とちゅうも こたえは 1つ');
      t = E.apply(t, w[0]); blackMoves++;
    } else t = E.apply(t, S.defense(t));
  }
  assert.strictEqual(t.winner, 0, name + ' くろの かち');
  const { line, end } = S.mainLine(s);
  assert.strictEqual(line[0].p, ans);
  assert.deepStrictEqual(end.counts, t.counts);
  // まちがえやすい 手は、ほんとうに かてない
  const traps = S.traps(s);
  assert.strictEqual(traps.length, legal.length - 1);
  for (const tr of traps) assert.ok(S.blackValue(E.apply(s, tr.p)) <= 0);
  console.log(`${name} ${pr.empties}あき ${E.pointName(n, ans)} くろ${blackMoves}手 ${end.counts.join('-')} ${pr.title}`);
});
console.log('all OK');
