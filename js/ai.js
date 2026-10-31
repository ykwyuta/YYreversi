/*
 * ひっくりかえるのがみえるリバーシ — CPU 思考ルーチン
 * アルファベータ探索（ネガマックス）を 1手ずつ深くしていく（反復深化）。制限時間で打ち切るので、スマホでも固まらない。
 * 評価：マスの重み（かどは とても大事、かどの となりは あぶない）＋ おける ところの 多さ ＋ かくていしそうな へり。
 * のこりの あきマスが 少なくなったら、さいごまで 読み切って 石の かずで 決める。
 * 高速化のため、探索では 周りに 枠を つけた 盤（FastBoard）で、ひっくりかえした 石を スタックに 積んで もどす。
 */
(function (global) {
  'use strict';
  const E = global.Engine;
  const PASS = E.PASS;
  const WALL = 3;

  // ---------- マスの重み ----------

  function weightTable(size) {
    const w = [];
    const last = size - 1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const ex = Math.min(x, last - x), ey = Math.min(y, last - y);
      const a = Math.min(ex, ey), b = Math.max(ex, ey);
      let v;
      if (a === 0 && b === 0) v = 100;          // かど
      else if (a === 0 && b === 1) v = -25;     // C（かどの よこ）
      else if (a === 1 && b === 1) v = -50;     // X（かどの ななめ）
      else if (a === 0 && b === 2) v = 12;      // へり（かどから 2つめ）
      else if (a === 0) v = 6;                  // へり
      else if (a === 1) v = -4;                 // へりの ひとつ うち
      else if (a === 2 && b === 2) v = 2;
      else v = -1;
      w.push(v);
    }
    return w;
  }

  // ---------- 高速な盤 ----------

  function FastBoard(size) {
    const W = size + 2, N = W * W;
    this.size = size; this.W = W; this.N = N;
    this.c = new Int8Array(N);
    this.dirs = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
    this.cells = [];
    this.w = new Int32Array(N);
    const wt = weightTable(size);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === W - 1) this.c[p] = WALL;
      else { this.cells.push(p); this.w[p] = wt[(y - 1) * size + x - 1]; }
    }
    // かどと、その となり（かどが うまったら となりは あぶなくない）
    const P = (x, y) => (y + 1) * W + x + 1, l = size - 1;
    this.corners = [];
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [l, 0, -1, 1], [0, l, 1, -1], [l, l, -1, -1]]) {
      this.corners.push({ c: P(cx, cy), near: [P(cx + sx, cy), P(cx, cy + sy), P(cx + sx, cy + sy)] });
    }
    this.stack = new Int16Array(N * 64);
    this.sp = 0;
    this.empties = 0;
  }
  FastBoard.prototype.load = function (board) {
    const s = this.size;
    this.empties = 0;
    for (let i = 0; i < s * s; i++) {
      const p = this.fromEngine(i);
      this.c[p] = board[i];
      if (!board[i]) this.empties++;
    }
  };
  FastBoard.prototype.fromEngine = function (i) { return ((i / this.size) | 0) * this.W + this.W + 1 + (i % this.size); };
  FastBoard.prototype.toEngine = function (p) {
    if (p < 0) return PASS;
    return (((p / this.W) | 0) - 1) * this.size + (p % this.W) - 1;
  };
  FastBoard.prototype.canPlay = function (p, col) {
    const c = this.c;
    if (c[p] !== 0) return false;
    const opp = 3 - col, d = this.dirs;
    for (let k = 0; k < 8; k++) {
      let q = p + d[k];
      if (c[q] !== opp) continue;
      q += d[k];
      while (c[q] === opp) q += d[k];
      if (c[q] === col) return true;
    }
    return false;
  };
  FastBoard.prototype.moves = function (col, out) {
    let n = 0;
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) if (this.canPlay(cells[i], col)) out[n++] = cells[i];
    return n;
  };
  FastBoard.prototype.mobility = function (col) {
    let n = 0;
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) if (this.canPlay(cells[i], col)) n++;
    return n;
  };
  // 石を おいて ひっくりかえす。もどすための 印を スタックに 積み、ひっくりかえした 数を返す
  FastBoard.prototype.play = function (p, col) {
    const c = this.c, d = this.dirs, opp = 3 - col, st = this.stack;
    const base = this.sp;
    let sp = base;
    for (let k = 0; k < 8; k++) {
      let q = p + d[k];
      if (c[q] !== opp) continue;
      while (c[q] === opp) q += d[k];
      if (c[q] !== col) continue;
      for (let r = p + d[k]; r !== q; r += d[k]) { c[r] = col; st[sp++] = r; }
    }
    const flips = sp - base;
    c[p] = col;
    st[sp++] = p;
    st[sp++] = flips + 1; // ひっくりかえした数＋1（おいた石）
    this.sp = sp;
    this.empties--;
    return flips;
  };
  FastBoard.prototype.undo = function () {
    const st = this.stack, c = this.c;
    let sp = this.sp - 1;
    const k = st[sp];
    sp--;
    const p = st[sp];
    c[p] = 0;
    for (let i = 1; i < k; i++) { const r = st[sp - i]; c[r] = 3 - c[r]; }
    this.sp = sp - (k - 1);
    this.empties++;
  };
  FastBoard.prototype.discDiff = function (col) {
    let d = 0;
    const cells = this.cells, c = this.c;
    for (let i = 0; i < cells.length; i++) { const v = c[cells[i]]; if (v === col) d++; else if (v) d--; }
    return d;
  };

  // ---------- 評価 ----------

  // col から 見た 点数
  function evaluate(fb, col) {
    const c = fb.c, w = fb.w, cells = fb.cells, opp = 3 - col;
    let pos = 0;
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i], v = c[p];
      if (v === col) pos += w[p]; else if (v === opp) pos -= w[p];
    }
    // かどが うまっていたら、となりの マイナスを とりけす
    for (const k of fb.corners) {
      if (!c[k.c]) continue;
      for (const q of k.near) {
        const v = c[q];
        if (v === col) pos -= w[q] - 4; else if (v === opp) pos += w[q] - 4;
      }
    }
    const mm = fb.mobility(col), mo = fb.mobility(opp);
    const mob = mm + mo ? (100 * (mm - mo)) / (mm + mo + 2) : 0;
    const tot = fb.cells.length;
    // 終盤ほど 石の かずも 少し 見る
    const late = fb.empties < tot * 0.25 ? fb.discDiff(col) * 2 : 0;
    return pos * 2 + mob * 1.6 + late;
  }

  // ---------- 探索 ----------

  const ABORT = { abort: true };
  const WIN = 100000;

  function Searcher(size, deadline) {
    this.fb = new FastBoard(size);
    this.deadline = deadline;
    this.nodes = 0;
    this.buf = [];
    for (let i = 0; i < 70; i++) this.buf.push(new Int16Array(size * size + 1));
  }
  Searcher.prototype.finalScore = function (col) {
    const fb = this.fb;
    let me = 0, op = 0;
    for (const p of fb.cells) { const v = fb.c[p]; if (v === col) me++; else if (v) op++; }
    let d = me - op;
    // あいている マスは かった ほうに たす（読み切りで 大きく かつ 手を えらぶため）
    const em = fb.cells.length - me - op;
    if (d > 0) d += em; else if (d < 0) d -= em;
    return d;
  };
  // ネガマックス。exact = さいごまで 読む ときは、評価ではなく 石の かずの 差 を返す
  Searcher.prototype.negamax = function (col, depth, alpha, beta, passed, ply) {
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) throw ABORT;
    const fb = this.fb;
    if (fb.empties === 0) return this.finalScore(col) * WIN / 1000;
    if (depth <= 0) return evaluate(fb, col);
    const mv = this.buf[ply];
    const n = fb.moves(col, mv);
    if (n === 0) {
      if (passed) return this.finalScore(col) * WIN / 1000;
      return -this.negamax(3 - col, depth, -beta, -alpha, true, ply + 1);
    }
    // 並べかえ：マスの重みの 大きい 順
    const w = fb.w;
    for (let i = 1; i < n; i++) {
      const m = mv[i], k = w[m];
      let j = i - 1;
      while (j >= 0 && w[mv[j]] < k) { mv[j + 1] = mv[j]; j--; }
      mv[j + 1] = m;
    }
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      fb.play(mv[i], col);
      const v = -this.negamax(3 - col, depth - 1, -beta, -alpha, false, ply + 1);
      fb.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };
  // 根：すべての手の 点数（first を さきに 読む）
  Searcher.prototype.root = function (col, depth, order) {
    const fb = this.fb, out = [];
    let alpha = -Infinity;
    for (const m of order) {
      fb.play(m, col);
      const v = -this.negamax(3 - col, depth - 1, -Infinity, -alpha, false, 1);
      fb.undo();
      out.push({ m, v });
      if (v > alpha) alpha = v;
    }
    return out;
  };

  const LEVELS = {
    beginner: { name: 'はじめて', random: 0.55, depth: 1, time: 60, exact: 0 },
    easy: { name: 'よわい', depth: 2, time: 150, noise: 40, exact: 4 },
    normal: { name: 'ふつう', depth: 4, time: 500, exact: 10 },
    hard: { name: 'つよい', depth: 30, time: 1400, exact: 16 },
    hint: { name: 'ヒント', depth: 30, time: 700, exact: 12 },
  };

  // st：{ size, board, turn }。返り値はルールエンジンのマス番号（おけなければ PASS）
  function think(st, level, rnd) {
    const L = LEVELS[level] || LEVELS.normal;
    rnd = rnd || Math.random;
    const size = st.size, col = st.turn + 1;
    const legal = E.movesFor(st.board, size, col);
    if (!legal.length) return PASS;
    if (legal.length === 1) return legal[0];
    if (L.random) {
      // はじめて：半分くらいは てきとう。のこりは いちばん たくさん ひっくりかえる 手（かどは 見のがさない）
      const corner = legal.filter(p => E.geo(size).corners.includes(p));
      if (corner.length && rnd() < 0.7) return corner[(rnd() * corner.length) | 0];
      if (rnd() < L.random) return legal[(rnd() * legal.length) | 0];
      let best = legal[0], bn = -1;
      for (const p of legal) { const k = E.flipsAt(st.board, size, p, col).length + rnd() * 0.5; if (k > bn) { bn = k; best = p; } }
      return best;
    }
    const scores = scoreMoves(st, L);
    if (L.noise) for (const s of scores) s.v += (rnd() - 0.5) * 2 * L.noise;
    scores.sort((a, b) => b.v - a.v);
    return scores[0].m;
  }

  // すべての手に 点数を つける（反復深化。時間ぎれなら ひとつ前の 深さの 結果）
  function scoreMoves(st, L) {
    const size = st.size, col = st.turn + 1;
    const S = new Searcher(size, Date.now() + L.time);
    S.fb.load(st.board);
    const fb = S.fb;
    let order = [];
    for (const p of E.movesFor(st.board, size, col)) order.push(fb.fromEngine(p));
    order.sort((a, b) => fb.w[b] - fb.w[a]);
    let res = order.map(m => ({ m, v: 0 }));
    const maxD = fb.empties <= L.exact ? fb.empties : L.depth;
    for (let d = 1; d <= Math.max(1, maxD); d++) {
      try {
        res = S.root(col, d, order);
      } catch (e) {
        if (e !== ABORT) throw e;
        // 打ち切った 探索の とちゅうの 盤は こわれているので 読みなおす
        fb.sp = 0;
        fb.load(st.board);
        if (d === 1) res = S.rootNoLimit(col, order);
        break;
      }
      res.sort((a, b) => b.v - a.v);
      order = res.map(r => r.m);
      if (d >= fb.empties) break;
    }
    return res.map(r => ({ m: fb.toEngine(r.m), v: r.v }));
  }
  Searcher.prototype.rootNoLimit = function (col, order) {
    this.deadline = Infinity;
    return this.root(col, 1, order);
  };

  // ---------- 読み切り（もんだい用） ----------

  // さいごまで 読んで、col の 石の かずの 差（あいた マスは かった ほうへ）を返す
  function Exact(size) {
    this.S = new Searcher(size, Infinity);
  }
  Exact.prototype.value = function (board, turn) {
    const S = this.S;
    S.fb.load(board);
    return this.solve(turn + 1, -999, 999, false, 0);
  };
  Exact.prototype.solve = function (col, alpha, beta, passed, ply) {
    const S = this.S, fb = S.fb;
    if (fb.empties === 0) return S.finalScore(col);
    const mv = S.buf[ply];
    const n = fb.moves(col, mv);
    if (n === 0) {
      if (passed) return S.finalScore(col);
      return -this.solve(3 - col, -beta, -alpha, true, ply + 1);
    }
    let best = -999;
    for (let i = 0; i < n; i++) {
      fb.play(mv[i], col);
      const v = -this.solve(3 - col, -beta, -alpha, false, ply + 1);
      fb.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };
  // それぞれの手を うったあとの、くろ（turn の側）から見た 結果
  // 返り値：[{ p, v }]（v は turn の側から見た さいごの 石の かずの 差）
  Exact.prototype.moveValues = function (board, turn) {
    const size = this.S.fb.size;
    const s = E.fromBoard(size, board, turn);
    if (s.winner !== null || s.turn !== turn) return [];
    return E.legalMoves(s).map(p => {
      const n = E.apply(s, p);
      let v;
      if (n.winner !== null) v = finalDiff(n.board, turn + 1);
      else v = n.turn === turn ? this.value(n.board, n.turn) : -this.value(n.board, n.turn);
      return { p, v };
    });
  };
  function finalDiff(board, col) {
    let me = 0, op = 0, em = 0;
    for (let i = 0; i < board.length; i++) { if (board[i] === col) me++; else if (board[i]) op++; else em++; }
    let d = me - op;
    if (d > 0) d += em; else if (d < 0) d -= em;
    return d;
  }

  global.AI = { LEVELS, think, scoreMoves, weightTable, FastBoard, Exact, finalDiff, evaluate };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
