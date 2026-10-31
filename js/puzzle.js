/*
 * ひっくりかえるのがみえるリバーシ — さいごの もんだい（終盤の 読み切り）
 * くろの ばん。さいごまで うって、くろが かつ 手を みつける もんだい。
 * しろは いちばん くろが こまる 手（くろの 石が いちばん すくなくなる 手）を うってくる。
 * 正解の 判定・しろの 応手・ヒント・まちがえやすい手 は、ぜんぶ さいごまで 読み切って 決める。
 */
(function (global) {
  'use strict';
  const E = global.Engine;
  const AI = global.AI;

  function start(pr) {
    const { size, board } = E.parse(pr.rows);
    return E.fromBoard(size, board, 0);
  }

  function Solver(size) {
    this.X = new AI.Exact(size);
    this.size = size;
  }
  // s の 手番の側から 見た、それぞれの 手の 結果（さいごの 石の かずの 差）
  Solver.prototype.values = function (s) {
    return this.X.moveValues(s.board, s.turn);
  };
  // くろから 見た いまの 局面の 結果
  Solver.prototype.blackValue = function (s) {
    if (s.winner !== null) return AI.finalDiff(s.board, E.BLACK);
    const v = this.X.value(s.board, s.turn);
    return s.turn === 0 ? v : -v;
  };
  // くろが かてる 手（いちばん 大きく かつ 順）
  Solver.prototype.winning = function (s) {
    if (s.winner !== null || s.turn !== 0) return [];
    return this.values(s).filter(m => m.v > 0).sort((a, b) => b.v - a.v).map(m => m.p);
  };
  // しろの 応手：くろの 石の かずの 差が いちばん 小さく なる 手（同じなら 番号の 小さい 手）
  Solver.prototype.defense = function (s) {
    let best = null;
    for (const m of this.values(s)) if (!best || m.v > best.v) best = m;
    return best ? best.p : E.PASS;
  };
  // 正解の 手順（くろは いちばん 大きく かつ 手、しろは いちばん ねばる 手）
  Solver.prototype.mainLine = function (s) {
    const line = [];
    while (s.winner === null) {
      let p;
      if (s.turn === 0) {
        const vs = this.values(s).sort((a, b) => b.v - a.v);
        p = vs[0].p;
      } else p = this.defense(s);
      line.push({ p, side: s.turn });
      s = E.apply(s, p);
    }
    return { line, end: s };
  };
  // まちがえやすい 手：かてない くろの 手と、そのあとの しろの 応手
  Solver.prototype.traps = function (s) {
    const out = [];
    for (const m of this.values(s)) {
      if (m.v > 0) continue;
      const n = E.apply(s, m.p);
      const reply = n.winner !== null ? null : n.turn === 1 ? this.defense(n) : E.PASS;
      out.push({ p: m.p, reply, v: m.v });
    }
    return out.sort((a, b) => a.v - b.v);
  };

  global.Puzzle = { start, Solver };
})(typeof window !== 'undefined' ? window : globalThis);
