// ルールエンジンと CPU のテスト：node test/rules.test.js
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;
const assert = require('assert');

const P = (size, name) => E.FILES.indexOf(name[0]) + (+name.slice(1) - 1) * size;

// はじめの ならび と、おける ところ
{
  const s = E.newGame({ size: 8 });
  assert.deepStrictEqual(s.counts, [2, 2]);
  assert.strictEqual(s.board[P(8, 'd4')], E.WHITE);
  assert.strictEqual(s.board[P(8, 'e4')], E.BLACK);
  assert.strictEqual(s.board[P(8, 'd5')], E.BLACK);
  assert.strictEqual(s.board[P(8, 'e5')], E.WHITE);
  const m = E.legalMoves(s).map(p => E.pointName(8, p)).sort();
  assert.deepStrictEqual(m, ['c4', 'd3', 'e6', 'f5']);
  assert.strictEqual(E.illegalReason(s, P(8, 'a1')), 'noflip');
  assert.strictEqual(E.illegalReason(s, P(8, 'd4')), 'occupied');
  const n = E.apply(s, P(8, 'f5'));
  assert.deepStrictEqual(n.counts, [4, 1]);
  assert.deepStrictEqual(n.last.flipped, [P(8, 'e5')]);
  assert.strictEqual(n.turn, 1);
  assert.deepStrictEqual(n.kifu, ['●f5']);
  assert.notStrictEqual(n.board, s.board, 'apply は あたらしい 盤を つくる');
  assert.strictEqual(s.board[P(8, 'f5')], 0);
  console.log('start OK');
}

// いっぺんに いくつもの 向きを ひっくりかえす
{
  const { size, board } = E.parse([
    'O.O.O.',
    '.XXX..',
    'OX.XO.',
    '.XXX..',
    'O.O.O.',
    '......',
  ]);
  const f = E.flipsAt(board, size, 2 * 6 + 2, E.WHITE);
  assert.strictEqual(f.length, 8, '8つの 向き ぜんぶ');
  assert.strictEqual(E.flipLines(board, size, 2 * 6 + 2, E.WHITE).length, 8);
  assert.strictEqual(E.flipsAt(board, size, 2 * 6 + 2, E.BLACK).length, 0);
  console.log('multi OK');
}

// パス：おけない ほうは とばされる。ふたりとも おけなければ おわり
{
  const { board } = E.parse([
    'X.....',
    'XO....',
    '......',
    '......',
    '......',
    '......',
  ]);
  const s = E.fromBoard(6, board, 0);
  const n = E.apply(s, 2 * 6 + 2); // c3 で b2 を はさむ
  assert.strictEqual(n.winner, 0, 'しろが ぜんめつ → おわり');
  assert.strictEqual(n.result, 'count');
  const { board: b2 } = E.parse([
    'XO....',
    '......',
    '......',
    '......',
    '......',
    '.....O',
  ]);
  const t = E.fromBoard(6, b2, 1);
  assert.strictEqual(t.turn, 0, 'しろは おけないので くろの ばん');
  const u = E.apply(t, 2);
  assert.strictEqual(u.winner, 0);
  assert.deepStrictEqual(u.counts, [3, 1]);
  console.log('end OK');
}
{
  // ランダムな 対局で：パスに なった側は 本当に おけない
  let rnd = 99, skips = 0;
  const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  for (let g = 0; g < 300; g++) {
    let s = E.newGame({ size: 6 });
    while (s.winner === null) {
      const l = E.legalMoves(s);
      assert.ok(l.length > 0, '手番の側は かならず おける');
      const n = E.apply(s, l[(R() * l.length) | 0]);
      if (n.skipped !== null) {
        skips++;
        assert.strictEqual(n.turn, s.turn);
        assert.ok(!E.hasMove(n.board, 6, n.skipped + 1));
        assert.strictEqual(n.kifu[n.kifu.length - 1], E.SIDES[n.skipped].mark + 'パス');
      }
      if (n.winner !== null) assert.ok(!E.hasMove(n.board, 6, 1) && !E.hasMove(n.board, 6, 2));
      s = n;
    }
  }
  assert.ok(skips > 0);
  console.log('auto pass OK', skips);
}

// ハンデ
{
  const s = E.newGame({ size: 8, handicap: 2 });
  assert.strictEqual(s.board[0], E.BLACK);
  assert.strictEqual(s.board[63], E.BLACK);
  assert.deepStrictEqual(s.counts, [4, 2]);
  console.log('handicap OK');
}

// かくてい石
{
  const { size, board } = E.parse([
    'XXO...',
    'X.....',
    '......',
    '......',
    '......',
    '......',
  ]);
  const st = E.stable(board, size);
  assert.strictEqual(st[0], 1);
  assert.strictEqual(st[1], 1);
  assert.strictEqual(st[6], 1);
  assert.strictEqual(st[2], 0);
  console.log('stable OK');
}

// 高速盤：play/undo で もとに もどる・おける ところが ルールエンジンと 同じ
{
  let rnd = 12345;
  const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  for (const size of E.SIZES) {
    for (let g = 0; g < 20; g++) {
      let s = E.newGame({ size });
      while (s.winner === null) {
        const fb = new AI.FastBoard(size);
        fb.load(s.board);
        const before = Int8Array.from(fb.c);
        const legal = E.legalMoves(s);
        const fm = new Int16Array(size * size);
        const k = fb.moves(s.turn + 1, fm);
        assert.deepStrictEqual(Array.from(fm.slice(0, k)).map(q => fb.toEngine(q)).sort((a, b) => a - b), legal.slice().sort((a, b) => a - b));
        const m = legal[(R() * legal.length) | 0];
        const nf = fb.play(fb.fromEngine(m), s.turn + 1);
        const n = E.apply(s, m);
        assert.strictEqual(nf, n.last.flipped.length);
        for (let i = 0; i < size * size; i++) assert.strictEqual(fb.c[fb.fromEngine(i)], n.board[i]);
        fb.undo();
        assert.deepStrictEqual(fb.c, before);
        s = n;
      }
    }
  }
  console.log('fastboard OK');
}

// CPU：いつも おける 手を かえす。かどは とる
{
  const s = E.newGame({ size: 8 });
  for (const lv of Object.keys(AI.LEVELS)) {
    const m = AI.think({ size: 8, board: s.board, turn: 0 }, lv);
    assert.ok(E.isLegal(s, m), lv);
  }
  const { board } = E.parse([
    '.OOOOX..',
    '........',
    '........',
    '...OX...',
    '...XO...',
    '........',
    '........',
    '........',
  ]);
  const t = E.fromBoard(8, board, 0);
  for (const lv of ['normal', 'hard']) assert.strictEqual(AI.think({ size: 8, board: t.board, turn: 0 }, lv), 0, 'かど a1 を とる ' + lv);
  console.log('cpu OK');
}

// 読み切り：ちいさな 局面で、ぜんぶ ためした 結果と 同じ
{
  function brute(s, col) {
    if (s.winner !== null) return AI.finalDiff(s.board, col);
    let best = -999;
    for (const m of E.legalMoves(s)) {
      const n = E.apply(s, m);
      const v = brute(n, col === s.turn + 1 ? col : col);
      // v は col から見た値。手番が col なら 最大、ちがえば 最小
      if (s.turn + 1 === col) best = Math.max(best, v); else best = best === -999 ? v : Math.min(best, v);
    }
    return best;
  }
  let rnd = 7;
  const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const X = new AI.Exact(6);
  let tested = 0;
  for (let g = 0; g < 30; g++) {
    let s = E.newGame({ size: 6 });
    while (s.winner === null && s.counts[0] + s.counts[1] < 36 - 7) {
      const l = E.legalMoves(s);
      s = E.apply(s, l[(R() * l.length) | 0]);
    }
    if (s.winner !== null) continue;
    assert.strictEqual(X.value(s.board, s.turn), brute(s, s.turn + 1));
    tested++;
  }
  assert.ok(tested > 10);
  console.log('exact OK', tested);
}

console.log('all OK');
