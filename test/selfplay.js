// CPU 同士の自動対戦：node test/selfplay.js [くろの強さ] [しろの強さ] [局数] [盤の大きさ]
// 先手・後手の かたよりを なくすため、1局ごとに 色を 入れかえる
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;
const [A = 'normal', B = 'easy', games = '4', size = '8'] = process.argv.slice(2);
const tally = { [A]: 0, [B]: 0, draw: 0 };
for (let g = 0; g < +games; g++) {
  const lv = g % 2 ? [B, A] : [A, B];
  let s = E.newGame({ size: +size });
  let maxT = 0, totT = 0, n = 0;
  while (s.winner === null) {
    const t0 = Date.now();
    const m = AI.think({ size: s.size, board: s.board, turn: s.turn }, lv[s.turn]);
    const dt = Date.now() - t0;
    maxT = Math.max(maxT, dt); totT += dt; n++;
    if (!E.isLegal(s, m)) throw new Error('illegal move from AI');
    s = E.apply(s, m);
  }
  if (s.winner === -1) tally.draw++; else tally[lv[s.winner]]++;
  console.log(`game ${g + 1}: くろ=${lv[0]} しろ=${lv[1]} winner=${s.winner} ${s.counts.join('-')} avg=${(totT / n).toFixed(0)}ms max=${maxT}ms`);
}
console.log(`${A} ${tally[A]} - ${tally[B]} ${B}  引き分け ${tally.draw}`);
