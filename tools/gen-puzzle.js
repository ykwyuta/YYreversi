// さいごの もんだい の 候補を つくる：node tools/gen-puzzle.js [あき] [こすう] [seed] [盤の大きさ]
// 条件：くろの ばん・くろの おける 手が 3つ以上・かてる 手が ちょうど 1つ。
// しるし：corner（こたえが かど）pass（こたえの あと しろが パス）fewest（いちばん すこししか かえさない 手が こたえ）
//         notgreedy（いちばん たくさん かえす 手は まちがい）behind（いまは しろの ほうが おおい）unique（とちゅうも ずっと こたえが 1つ）
'use strict';
require('../js/rules.js');
require('../js/ai.js');
require('../js/puzzle.js');
const E = globalThis.Engine, AI = globalThis.AI, PZ = globalThis.Puzzle;
const [K = '4', count = '10', seed = '1', size = '6'] = process.argv.slice(2).map(Number);
let rnd = seed;
const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const W = AI.weightTable(size);
const S = new PZ.Solver(size);
const out = [], seen = new Set();
let tries = 0;
while (out.length < count && tries < 200000) {
  tries++;
  let s = E.newGame({ size });
  while (s.winner === null && size * size - s.counts[0] - s.counts[1] > K) {
    const l = E.legalMoves(s);
    // かどや へりを すこし このむ ランダム
    const ws = l.map(p => Math.exp(W[p] / 25));
    let r = R() * ws.reduce((a, b) => a + b, 0), i = 0;
    while (r > ws[i]) r -= ws[i++];
    s = E.apply(s, l[Math.min(i, l.length - 1)]);
  }
  if (s.winner !== null || s.turn !== 0 || size * size - s.counts[0] - s.counts[1] !== K) continue;
  const legal = E.legalMoves(s);
  if (legal.length < 3) continue;
  const vals = S.values(s);
  const win = vals.filter(v => v.v > 0);
  if (win.length !== 1) continue;
  const ans = win[0].p;
  const rows = [];
  for (let y = 0; y < size; y++) { let r2 = ''; for (let x = 0; x < size; x++) r2 += '.XO'[s.board[y * size + x]]; rows.push(r2); }
  const key = rows.join('/');
  if (seen.has(key)) continue;
  seen.add(key);
  const flips = Object.fromEntries(legal.map(p => [p, E.flipsAt(s.board, size, p, 1).length]));
  const maxF = Math.max(...Object.values(flips)), minF = Math.min(...Object.values(flips));
  const tags = [];
  if (E.geo(size).corners.includes(ans)) tags.push('corner');
  const after = E.apply(s, ans);
  if (after.skipped === 1) tags.push('pass');
  if (flips[ans] === minF && minF < maxF) tags.push('fewest');
  if (legal.filter(p => flips[p] === maxF).every(p => p !== ans)) tags.push('notgreedy');
  if (s.counts[0] < s.counts[1]) tags.push('behind');
  // とちゅうの くろの 手も、かてる 手が 1つだけか
  let uniq = true, t = after;
  while (t.winner === null) {
    if (t.turn === 0) { const w = S.winning(t); if (w.length !== 1) uniq = false; t = E.apply(t, w[0]); }
    else t = E.apply(t, S.defense(t));
  }
  if (uniq) tags.push('unique');
  const { end } = S.mainLine(s);
  out.push({ rows, empties: K, answer: E.pointName(size, ans), moves: legal.length, tags, final: end.counts });
}
console.log(JSON.stringify(out, null, 1));
console.error(`tries=${tries} found=${out.length}`);
