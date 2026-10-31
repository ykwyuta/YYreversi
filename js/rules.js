/*
 * ひっくりかえるのがみえるリバーシ — ルールエンジン
 * 盤面状態は純粋なデータとして扱い、apply は常に新しい状態を返す。
 *
 * 座標：x は左から 0〜size-1、y は上から 0〜size-1。マス p = y * size + x。
 * 石：0 = なし、1 = くろ、2 = しろ。手番 turn は 0 = くろ、1 = しろ（石の色 = turn + 1）。
 * 指し手：マスの番号。
 * パス：おける ところが ない ときは、apply の中で自動でパスにする（turn がそのまま、skipped にパスした側）。
 * おわり：ふたりとも おけなくなったら（盤が うまったときも）おわり。石の かずが おおい ほうの かち。
 */
(function (global) {
  'use strict';

  const PASS = -1;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const SIZES = [6, 8, 10];
  const FILES = 'abcdefghij';

  const SIDES = [
    { name: 'くろ', kanji: '黒', mark: '●' },
    { name: 'しろ', kanji: '白', mark: '○' },
  ];

  // ---------- 盤の形（大きさごとに作っておく） ----------

  const geoCache = {};
  function geo(size) {
    if (geoCache[size]) return geoCache[size];
    const n = size * size;
    const D = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    // rays[p][d] = p から d の向きに並ぶマス（盤の はしまで）
    const rays = [];
    for (let p = 0; p < n; p++) {
      const x0 = p % size, y0 = (p / size) | 0, r = [];
      for (const [dx, dy] of D) {
        const a = [];
        for (let x = x0 + dx, y = y0 + dy; x >= 0 && y >= 0 && x < size && y < size; x += dx, y += dy) a.push(y * size + x);
        r.push(a);
      }
      rays.push(r);
    }
    const P = (x, y) => y * size + x;
    const m = size / 2;
    const corners = [P(0, 0), P(size - 1, 0), P(0, size - 1), P(size - 1, size - 1)];
    // かどの となり（C：へりで となり、X：ななめ となり）。かどが あいているうちは あぶない
    const nearCorner = new Map();
    for (const [cx, cy] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
      const sx = cx === 0 ? 1 : -1, sy = cy === 0 ? 1 : -1, c = P(cx, cy);
      nearCorner.set(P(cx + sx, cy), { corner: c, kind: 'C' });
      nearCorner.set(P(cx, cy + sy), { corner: c, kind: 'C' });
      nearCorner.set(P(cx + sx, cy + sy), { corner: c, kind: 'X' });
    }
    // 盤の目印（8路なら b2・f2・b6・f6 の かどの点）
    const e = size >= 10 ? 3 : 2;
    const dots = [[e, e], [size - e, e], [e, size - e], [size - e, size - e]];
    const g = {
      size, n, rays, corners, nearCorner, dots,
      start: { [P(m - 1, m - 1)]: WHITE, [P(m, m)]: WHITE, [P(m, m - 1)]: BLACK, [P(m - 1, m)]: BLACK },
    };
    geoCache[size] = g;
    return g;
  }

  // ハンデ：くろが さきに もらう かど（おく順）
  function handicapPoints(size, k) {
    const g = geo(size);
    return [g.corners[0], g.corners[3], g.corners[1], g.corners[2]].slice(0, k);
  }
  const MAX_HANDICAP = 4;

  // ---------- はさんで ひっくりかえす ----------

  // p に col を おいたとき ひっくりかえる 石（おけないなら 空の配列）
  function flipsAt(board, size, p, col) {
    if (board[p] !== EMPTY) return [];
    const opp = 3 - col, out = [];
    for (const ray of geo(size).rays[p]) {
      let i = 0;
      while (i < ray.length && board[ray[i]] === opp) i++;
      if (i > 0 && i < ray.length && board[ray[i]] === col) for (let j = 0; j < i; j++) out.push(ray[j]);
    }
    return out;
  }
  // 向きごとに分けた ひっくりかえる 石（説明用）
  function flipLines(board, size, p, col) {
    if (board[p] !== EMPTY) return [];
    const opp = 3 - col, out = [];
    for (const ray of geo(size).rays[p]) {
      let i = 0;
      while (i < ray.length && board[ray[i]] === opp) i++;
      if (i > 0 && i < ray.length && board[ray[i]] === col) out.push({ flips: ray.slice(0, i), anchor: ray[i] });
    }
    return out;
  }
  function canFlip(board, size, p, col) {
    if (board[p] !== EMPTY) return false;
    const opp = 3 - col;
    for (const ray of geo(size).rays[p]) {
      let i = 0;
      while (i < ray.length && board[ray[i]] === opp) i++;
      if (i > 0 && i < ray.length && board[ray[i]] === col) return true;
    }
    return false;
  }
  function movesFor(board, size, col) {
    const a = [];
    for (let p = 0; p < size * size; p++) if (canFlip(board, size, p, col)) a.push(p);
    return a;
  }
  function hasMove(board, size, col) {
    for (let p = 0; p < size * size; p++) if (canFlip(board, size, p, col)) return true;
    return false;
  }
  function count(board) {
    const c = [0, 0];
    for (let p = 0; p < board.length; p++) if (board[p]) c[board[p] - 1]++;
    return c;
  }

  // もう ひっくりかえらない 石（かくてい石）。
  // 4つの線（よこ・たて・ななめ2つ）の それぞれで、線が うまっているか、
  // どちらかの となりが 盤の そと か おなじ色の かくてい石 なら かくてい。
  function stable(board, size) {
    const n = size * size, st = new Uint8Array(n);
    const axes = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const inb = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
    const full = new Uint8Array(n * 4);
    for (let p = 0; p < n; p++) {
      if (!board[p]) continue;
      const x0 = p % size, y0 = (p / size) | 0;
      axes.forEach(([dx, dy], a) => {
        let ok = true;
        for (const s of [1, -1]) for (let x = x0 + dx * s, y = y0 + dy * s; inb(x, y); x += dx * s, y += dy * s) if (!board[y * size + x]) ok = false;
        full[p * 4 + a] = ok ? 1 : 0;
      });
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let p = 0; p < n; p++) {
        if (!board[p] || st[p]) continue;
        const x0 = p % size, y0 = (p / size) | 0, c = board[p];
        let ok = true;
        for (let a = 0; a < 4 && ok; a++) {
          if (full[p * 4 + a]) continue;
          const [dx, dy] = axes[a];
          const side = s => { const x = x0 + dx * s, y = y0 + dy * s; return !inb(x, y) || (board[y * size + x] === c && st[y * size + x]); };
          if (!side(1) && !side(-1)) ok = false;
        }
        if (ok) { st[p] = 1; changed = true; }
      }
    }
    return st;
  }

  // ---------- ゲームの状態 ----------

  function newGame(opts) {
    opts = opts || {};
    const size = SIZES.includes(opts.size) ? opts.size : 8;
    const g = geo(size);
    const board = new Int8Array(size * size);
    for (const k of Object.keys(g.start)) board[+k] = g.start[k];
    const handicap = Math.max(0, Math.min(MAX_HANDICAP, opts.handicap | 0));
    for (const p of handicapPoints(size, handicap)) board[p] = BLACK;
    return {
      size, board, turn: 0, ply: 0, handicap,
      last: null,          // { p, side, flipped: [] }
      skipped: null,       // いまの手のあと、おけなくて パスに なった側（なければ null）
      kifu: [], counts: count(board),
      winner: null,        // null = つづく / 0 くろ / 1 しろ / -1 ひきわけ
      result: null,        // 'count' | 'resign'
    };
  }

  function clone(s) {
    return Object.assign({}, s, { board: Int8Array.from(s.board), kifu: s.kifu.slice(), counts: s.counts.slice() });
  }

  function pointName(size, p) {
    return FILES[p % size] + (((p / size) | 0) + 1);
  }
  function moveText(s, p, side) {
    return SIDES[side].mark + pointName(s.size, p);
  }

  function illegalReason(s, p) {
    if (s.board[p] !== EMPTY) return 'occupied';
    if (!canFlip(s.board, s.size, p, s.turn + 1)) return 'noflip';
    return null;
  }
  function isLegal(s, p) { return s.winner === null && p >= 0 && p < s.size * s.size && illegalReason(s, p) === null; }
  function legalMoves(s) { return s.winner === null ? movesFor(s.board, s.size, s.turn + 1) : []; }
  function canApply(s, p) { return isLegal(s, p); }

  function apply(s, p) {
    if (!isLegal(s, p)) throw new Error('illegal move ' + p);
    const n = clone(s);
    const col = s.turn + 1;
    const flipped = flipsAt(s.board, s.size, p, col);
    n.board[p] = col;
    for (const q of flipped) n.board[q] = col;
    n.ply = s.ply + 1;
    n.last = { p, side: s.turn, flipped };
    n.kifu.push(moveText(s, p, s.turn));
    n.counts = count(n.board);
    n.skipped = null;
    const opp = 1 - s.turn;
    if (hasMove(n.board, n.size, opp + 1)) n.turn = opp;
    else if (hasMove(n.board, n.size, col)) {
      n.turn = s.turn;
      n.skipped = opp;
      n.kifu.push(SIDES[opp].mark + 'パス');
    } else {
      n.turn = opp;
      n.winner = n.counts[0] > n.counts[1] ? 0 : n.counts[1] > n.counts[0] ? 1 : -1;
      n.result = 'count';
    }
    return n;
  }

  function resign(s) {
    const n = clone(s);
    n.winner = 1 - s.turn;
    n.result = 'resign';
    return n;
  }

  // 終局時の かず（あいた マスは かった ほうに たす、という数え方もあるが、ここでは そのまま）
  function replay(opts, moves) {
    let s = newGame(opts);
    for (const m of moves) s = apply(s, m);
    return s;
  }

  // 文字で 盤を つくる（X = くろ、O = しろ、. = なし）
  function parse(rows) {
    const size = rows.length;
    const board = new Int8Array(size * size);
    rows.forEach((r, y) => [...r].forEach((c, x) => { board[y * size + x] = c === 'X' ? BLACK : c === 'O' ? WHITE : EMPTY; }));
    return { size, board };
  }
  function fromBoard(size, board, turn) {
    const s = newGame({ size });
    s.board = Int8Array.from(board);
    s.turn = turn || 0;
    s.counts = count(s.board);
    if (!hasMove(s.board, size, s.turn + 1)) {
      if (hasMove(s.board, size, 2 - s.turn)) { s.turn = 1 - s.turn; s.skipped = 1 - s.turn; }
      else { s.winner = s.counts[0] > s.counts[1] ? 0 : s.counts[1] > s.counts[0] ? 1 : -1; s.result = 'count'; }
    }
    return s;
  }

  global.Engine = {
    PASS, EMPTY, BLACK, WHITE, SIZES, SIDES, FILES, MAX_HANDICAP,
    geo, handicapPoints, flipsAt, flipLines, canFlip, movesFor, hasMove, count, stable,
    newGame, clone, pointName, moveText, illegalReason, isLegal, legalMoves, canApply, apply, resign, replay,
    parse, fromBoard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
