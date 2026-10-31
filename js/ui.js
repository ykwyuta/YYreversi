/*
 * ひっくりかえるのがみえるリバーシ — 画面表示と操作
 */
(function () {
  'use strict';
  const E = window.Engine;
  const AI = window.AI;
  const PZ = window.Puzzle;
  const PROBS = window.PUZZLES || [];
  const $ = id => document.getElementById(id);
  const STORE = 'yyreversi.v1';

  const app = {
    G: null,
    states: [],         // states[k] = k 手目のあとの局面（まった用）
    moves: [],
    mode: 'cpu',        // 'cpu' | 'two' | 'puzzle'
    human: [true, false],
    level: 'beginner',
    size: 6,
    handicap: 0,
    preview: null,      // おく前に たしかめている マス
    look: null,         // タッチした石
    hint: null,
    nope: null,         // おけない マスを タッチしたとき
    busy: false,
    token: 0,           // 新しいゲームやまったで、古い CPU の思考結果を捨てるため
    anim: null,
    settings: { moves: true, counts: true, danger: true, stable: false, confirm: true, sound: true },
    puzzle: null,       // さいごの もんだい中：{ idx, solver, failed, demo }
    puzzleDone: {},
  };

  let cells = [];

  // ---------- 保存 ----------

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        settings: app.settings,
        puzzleDone: app.puzzleDone,
        game: {
          mode: app.mode, human: app.human, level: app.level, size: app.size, handicap: app.handicap,
          moves: app.moves, puzzle: app.puzzle ? app.puzzle.idx : null,
        },
      }));
    } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }

  // ---------- 小さな図（ルールの説明用） ----------

  // rows：X くろ / O しろ / x うすい くろ（これから おく） / F しろ（ひっくりかえる） / + おける ところ /
  //       * おけない（×） / C かど（てんせん） / ! あぶない
  function miniSVG(rows) {
    const h = rows.length, w = rows[0].length, u = 18;
    const W = w * u, H = h * u;
    let s = `<rect class="mb" x="0" y="0" width="${W}" height="${H}"/>`;
    for (let x = 1; x < w; x++) s += `<line class="ml" x1="${x * u}" y1="0" x2="${x * u}" y2="${H}"/>`;
    for (let y = 1; y < h; y++) s += `<line class="ml" x1="0" y1="${y * u}" x2="${W}" y2="${y * u}"/>`;
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      const cx = x * u + u / 2, cy = y * u + u / 2;
      if (c === 'X' || c === 'x') s += `<circle class="s1${c === 'x' ? ' gh' : ''}" cx="${cx}" cy="${cy}" r="7.4"/>`;
      if (c === 'O' || c === 'F') s += `<circle class="s2" cx="${cx}" cy="${cy}" r="7.4"/>`;
      if (c === 'F') s += `<circle class="fl" cx="${cx}" cy="${cy}" r="8"/>`;
      if (c === '+') s += `<circle class="dot" cx="${cx}" cy="${cy}" r="2.6"/>`;
      if (c === '*') s += `<path class="x" d="M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}"/>`;
      if (c === 'C') s += `<circle class="cn" cx="${cx}" cy="${cy}" r="6.5"/>`;
      if (c === '!') s += `<circle class="wn" cx="${cx}" cy="${cy}" r="5.5"/><text class="tx" x="${cx}" y="${cy + 0.5}">!</text>`;
    }));
    return `<svg class="mini" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
  }

  const GUIDE = [
    ['はじめの ならび', 'まんなかに くろ 2こ・しろ 2こ を ななめに ならべて はじめるよ。くろが さきに うつよ。',
      ['......', '......', '..OX..', '..XO..', '......', '......']],
    ['はさむ と ひっくりかえる', 'じぶんの 石で あいての 石を はさむと、はさんだ 石が ぜんぶ じぶんの 色に ひっくりかえるよ。',
      ['......', '......', '.xFFX.', '......', '......', '......']],
    ['たて・よこ・ななめ', 'たて・よこ・ななめ の 8つの 向き ぜんぶで はさめるよ。いっぺんに たくさん かえせる ことも あるよ。',
      ['X.X.X', '.FFF.', 'XFxFX', '.FFF.', 'X.X.X']],
    ['おける ところ', '1こも ひっくりかえせない ところには おけないよ。おける ところには ・ が でるよ。',
      ['......', '..+...', '.+OX..', '..XO+.', '...+..', '......']],
    ['パス', 'おける ところが 1つも ない ときは パス。あいてが つづけて うつよ。パスは じどうで するよ。',
      ['XXXX+', 'XXXX.', 'XXXXO', 'XXXXX', 'XXXXX']],
    ['おわり と かち', 'ふたりとも おけなく なったら おわり。盤の 石を かぞえて、おおい ほうの かち！',
      ['XXXOO', 'XXOOO', 'XXXOO', 'XXXXO', 'XXXOO']],
    ['かど は つよい', 'かどの 石は もう ぜったいに ひっくりかえされないよ。かどを とれると とても とく。',
      ['X+...', '+....', '.....', '.....', '.....']],
    ['かどの となり は ちゅうい', 'かどが あいている ときに、かどの となりに おくと、あいてに かどを とられやすいよ。',
      ['C!...', '!!...', '.....', '.....', '.....']],
    ['かくてい石', 'かどから つながった へりの 石なども、もう ひっくりかえらない「かくてい石」。おおい ほど さいごに つよいよ。',
      ['XXXX.', 'XXX..', 'XX...', 'X....', '.....']],
    ['ハンデ', 'つよい 人と あそぶ ときは、くろが さいしょから かどを もらって はじめられるよ。',
      ['X....', '.....', '..OX.', '..XO.', '....X']],
  ];

  function fillGuide() {
    $('guide-list').innerHTML = GUIDE.map(([t, d, rows]) =>
      `<div class="g-item">${miniSVG(rows)}<div class="g-body"><b>${t}</b><p>${d}</p></div></div>`).join('');
  }

  // ---------- 初期化 ----------

  function init() {
    const board = $('board');
    board.addEventListener('click', e => {
      const c = e.target.closest('.pt');
      if (c) onPoint(+c.dataset.p);
    });

    $('btn-menu').addEventListener('click', () => {
      $('btn-resign').disabled = !canResign();
      $('dlg-menu').showModal();
    });
    $('btn-guide').addEventListener('click', () => $('dlg-guide').showModal());
    $('btn-hint').addEventListener('click', onHint);
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-puzzle').addEventListener('click', openPuzzleList);
    $('btn-pz-retry').addEventListener('click', () => { if (app.puzzle) startPuzzle(app.puzzle.idx, []); });
    $('btn-pz-answer').addEventListener('click', () => { if (app.puzzle && !app.puzzle.demo) puzzleResult('answer'); });
    $('dlg-puzzle').addEventListener('close', () => {
      const v = $('dlg-puzzle').returnValue;
      if (/^\d+$/.test(v)) startPuzzle(+v, []);
    });
    $('dlg-puzzle-result').addEventListener('close', () => onPuzzleResult($('dlg-puzzle-result').returnValue));

    $('dlg-menu').addEventListener('close', () => {
      const v = $('dlg-menu').returnValue;
      if (v === 'new') openNew(false);
      else if (v === 'howto') $('dlg-howto').showModal();
      else if (v === 'puzzle') openPuzzleList();
      else if (v === 'guide') $('dlg-guide').showModal();
      else if (v === 'settings') openSettings();
      else if (v === 'resign') onResign();
    });
    const fNew = $('dlg-new').querySelector('form');
    fNew.addEventListener('change', syncNewForm);
    $('dlg-new').addEventListener('close', () => {
      if ($('dlg-new').returnValue !== 'ok') return;
      const hc = +fNew.handicap.value;
      let order = fNew.order.value === 'random' ? (Math.random() < 0.5 ? 'first' : 'second') : fNew.order.value;
      if (hc) order = 'first'; // ハンデは あなた（くろ）が もらう
      startGame({ mode: fNew.mode.value, level: fNew.level.value, order, size: +fNew.size.value, handicap: hc });
    });
    $('dlg-settings').addEventListener('close', () => {
      const f = $('dlg-settings').querySelector('form');
      for (const k of Object.keys(app.settings)) app.settings[k] = f[k].checked;
      app.preview = null;
      save();
      render();
    });
    $('dlg-result').addEventListener('close', () => {
      const v = $('dlg-result').returnValue;
      if (v === 'new') openNew(false);
      else if (v === 'undo') onUndo();
    });

    fillGuide();
    new ResizeObserver(() => {
      const w = $('board').clientWidth / app.size;
      document.body.classList.toggle('small-cells', w < 30);
    }).observe($('board'));

    const saved = load();
    if (saved && saved.settings) Object.assign(app.settings, saved.settings);
    if (saved && saved.puzzleDone) app.puzzleDone = saved.puzzleDone;
    const g = saved && saved.game;
    if (g && g.mode === 'puzzle' && PROBS[g.puzzle]) {
      startPuzzle(g.puzzle, g.moves || []);
    } else if (g && Array.isArray(g.moves)) {
      app.mode = g.mode === 'two' ? 'two' : 'cpu';
      app.human = g.human || [true, false];
      app.level = AI.LEVELS[g.level] ? g.level : 'beginner';
      app.size = E.SIZES.includes(g.size) ? g.size : 6;
      app.handicap = g.handicap | 0;
      rebuild(g.moves);
      setupBoard();
      render();
      if (app.G.winner === null) proceed();
    } else {
      startGame({ mode: 'cpu', level: 'beginner', order: 'first', size: 6, handicap: 0 }, true);
      openNew(true);
    }
  }

  function openSettings() {
    const f = $('dlg-settings').querySelector('form');
    for (const k of Object.keys(app.settings)) f[k].checked = app.settings[k];
    $('dlg-settings').showModal();
  }

  function openNew(first) {
    const f = $('dlg-new').querySelector('form');
    if (app.mode !== 'puzzle') {
      f.mode.value = app.mode;
      f.level.value = app.level;
      f.size.value = String(app.size);
      f.handicap.value = String(app.handicap);
    } else f.handicap.value = '0';
    $('welcome').hidden = !first;
    $('btn-new-cancel').hidden = !!first;
    syncNewForm();
    $('dlg-new').showModal();
  }
  function syncNewForm() {
    const f = $('dlg-new').querySelector('form');
    const cpu = f.mode.value === 'cpu';
    f.querySelectorAll('.cpu-only').forEach(el => { el.hidden = !cpu; });
    $('hc-legend').textContent = cpu ? 'ハンデ（あなたが さきに かどを もらう）' : 'ハンデ（くろが さきに かどを もらう）';
    $('fs-order').querySelectorAll('input').forEach(i => { i.disabled = f.handicap.value !== '0'; });
  }

  function startGame(o, silent) {
    app.token++;
    app.busy = false;
    app.puzzle = null;
    document.body.classList.remove('puzzle-mode');
    app.mode = o.mode;
    app.level = o.level || 'beginner';
    app.size = E.SIZES.includes(o.size) ? o.size : 6;
    app.handicap = o.handicap | 0;
    app.human = o.mode === 'cpu' ? (o.order === 'second' ? [false, true] : [true, false]) : [true, true];
    rebuild([]);
    $('kifu').innerHTML = '';
    setupBoard();
    save();
    render();
    if (!silent) proceed();
  }

  function rebuild(moves) {
    let s = app.mode === 'puzzle' ? PZ.start(PROBS[app.puzzle.idx]) : E.newGame({ size: app.size, handicap: app.handicap });
    app.states = [s];
    app.moves = [];
    for (const m of moves) {
      if (!E.canApply(s, m)) break;
      s = E.apply(s, m);
      app.states.push(s);
      app.moves.push(m);
    }
    app.G = s;
    app.preview = null;
    app.look = null;
    app.hint = null;
  }

  // 盤の線と マスを 作り直す
  function setupBoard() {
    const n = app.size;
    document.documentElement.style.setProperty('--n', n);
    const board = $('board');
    let svg = `<svg class="grid" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none" aria-hidden="true">`;
    for (let i = 1; i < n; i++) {
      svg += `<line class="ln" x1="0" y1="${i}" x2="${n}" y2="${i}"/>`;
      svg += `<line class="ln" x1="${i}" y1="0" x2="${i}" y2="${n}"/>`;
    }
    for (const [x, y] of E.geo(n).dots) svg += `<circle class="dot" cx="${x}" cy="${y}" r="${0.07}"/>`;
    svg += '</svg>';
    board.innerHTML = svg;
    cells = [];
    for (let p = 0; p < n * n; p++) {
      const c = document.createElement('div');
      c.className = 'pt';
      c.dataset.p = p;
      board.appendChild(c);
      cells.push(c);
    }
    let f = '', rk = '';
    for (let i = 0; i < n; i++) { f += `<span>${E.FILES[i]}</span>`; rk += `<span>${i + 1}</span>`; }
    $('files').innerHTML = f;
    $('ranks').innerHTML = rk;
    document.body.classList.toggle('small-cells', board.clientWidth / n < 30);
  }

  // ---------- 状態の問い合わせ ----------

  function humanTurn() { return app.G.winner === null && app.human[app.G.turn] && !app.busy; }
  function canResign() { return app.mode !== 'puzzle' && app.G.winner === null && humanTurn() && app.G.ply > 0; }
  const color = side => side + 1;

  function playerName(side) {
    if (app.mode === 'two') return E.SIDES[side].name;
    if (app.mode === 'puzzle') return side === 0 ? 'あなた' : 'しろ';
    return app.human[side] ? 'あなた' : 'CPU';
  }

  // おいたあと、あいてが かどに おけるように なるか
  function givesCorner(G, p) {
    const n = G.size, col = color(G.turn), opp = 3 - col;
    const b = Int8Array.from(G.board);
    b[p] = col;
    for (const q of E.flipsAt(G.board, n, p, col)) b[q] = col;
    for (const c of E.geo(n).corners) {
      if (b[c] || E.canFlip(G.board, n, c, opp)) continue; // もともと とれる かどは べつ
      if (E.canFlip(b, n, c, opp)) return true;
    }
    return false;
  }

  // おいたら どうなるか
  function previewInfo(G, p) {
    const n = G.size, col = color(G.turn), opp = 3 - col;
    const lines = E.flipLines(G.board, n, p, col);
    const flips = [].concat(...lines.map(l => l.flips));
    const b = Int8Array.from(G.board);
    b[p] = col;
    for (const q of flips) b[q] = col;
    const oppMoves = E.movesFor(b, n, opp);
    const corner = E.geo(n).corners.includes(p);
    const near = E.geo(n).nearCorner.get(p);
    return {
      lines, flips, anchors: lines.map(l => l.anchor), oppMoves: oppMoves.length,
      corner, nearCorner: near && !G.board[near.corner] ? near : null,
      danger: givesCorner(G, p),
      after: E.count(b),
    };
  }

  // ---------- 描画 ----------

  function render() {
    renderBoard();
    renderPlayers();
    renderStatus();
    renderInfo();
    renderKifu();
    const pzDemo = app.puzzle && app.puzzle.demo;
    $('btn-hint').disabled = !humanTurn() || pzDemo;
    $('btn-undo').disabled = !canUndo() || pzDemo;
  }

  function renderBoard() {
    const G = app.G, n = G.size, b = G.board;
    const ht = humanTurn();
    const col = color(G.turn);
    const pv = app.preview !== null && ht ? previewInfo(G, app.preview) : null;
    const flipSet = new Set(pv ? pv.flips : []);
    const anchorSet = new Set(pv ? pv.anchors : []);
    const legal = ht ? new Set(E.legalMoves(G)) : new Set();
    const corners = E.geo(n).corners;
    const stable = app.settings.stable || app.look !== null ? E.stable(b, n) : null;
    const last = G.last ? G.last.p : -1;
    for (let p = 0; p < n * n; p++) {
      const c = cells[p];
      const cls = ['pt'];
      let h = '';
      const st = b[p];
      if (st) {
        const sc = ['stone'];
        if (p === last) sc.push('last');
        if (stable && stable[p] && app.settings.stable) sc.push('stable');
        h += `<div class="${sc.join(' ')}"><i class="face f${st}"></i><i class="face back f${3 - st}"></i></div>`;
        if (flipSet.has(p)) cls.push('willflip');
        if (anchorSet.has(p)) cls.push('anchor');
        if (app.look === p) cls.push('sel');
      } else {
        if (pv && p === app.preview) {
          cls.push('preview');
          h += `<div class="stone ghost"><i class="face f${col}"></i></div>`;
        }
        if (legal.has(p)) {
          if (app.settings.moves) {
            cls.push('can', 'me' + G.turn);
            if (app.settings.counts && p !== app.preview) {
              cls.push('cnt-on');
              h += `<span class="cnt">${E.flipsAt(b, n, p, col).length}</span>`;
            }
          }
          if (corners.includes(p) && app.settings.moves && p !== app.preview) cls.push('corner-ok');
          if (app.settings.danger && app.mode !== 'puzzle' && givesCorner(G, p)) h += '<span class="badge warn">!</span>';
        }
        if (app.nope === p) cls.push('nope');
      }
      if (app.hint === p) cls.push('hint-to');
      c.className = cls.join(' ');
      c.innerHTML = h;
    }
  }

  function renderPlayers() {
    const G = app.G;
    const bs = app.mode === 'cpu' && app.human[1] && !app.human[0] ? 1 : 0;
    const total = G.size * G.size;
    for (const [elId, side] of [['player-bottom', bs], ['player-top', 1 - bs]]) {
      const el = $(elId);
      const active = G.turn === side && G.winner === null;
      el.className = `player s${side}${active ? ' active' : ''}`;
      let h = `<div class="pname"><b><i class="pstone s${side}"></i>${playerName(side)}</b><small>${app.mode === 'two' ? (side === 0 ? 'さきに うつ' : 'あとに うつ') : E.SIDES[side].name}${G.handicap && side === 0 && app.mode !== 'puzzle' ? `（かど ${G.handicap}）` : ''}</small></div>`;
      const k = G.counts[side];
      const pct = Math.round((k / total) * 100);
      h += `<div class="caps"><span class="lbl">石</span><span class="num">${k}</span><span class="ratio"><i class="pstone s${side}" style="width:${pct}%"></i></span></div>`;
      if (app.mode === 'puzzle' && side === 0) {
        h += `<div class="pextra">のこり<br><b>${total - G.counts[0] - G.counts[1]}</b>マス</div>`;
      }
      el.innerHTML = h;
    }
  }

  function lastLine(G) {
    if (!G.last) return '';
    const who = playerName(G.last.side);
    return `<span class="lastmv">${who}：${E.SIDES[G.last.side].mark}${E.pointName(G.size, G.last.p)}（${G.last.flipped.length}こ ひっくりかえした）</span>`;
  }

  function renderStatus() {
    const G = app.G;
    const el = $('status');
    let cls = 's' + G.turn, text;
    const who = playerName(G.turn);
    const pz = app.puzzle;
    const ht = humanTurn();
    if (pz) {
      const pr = PROBS[pz.idx];
      const left = G.size * G.size - G.counts[0] - G.counts[1];
      if (pz.demo) { cls += ' hint'; text = 'こたえを ならべているよ…'; }
      else if (G.winner === 0) { cls = 'end'; text = `<b>せいかい！</b> ${G.counts[0]} たい ${G.counts[1]} で かったよ`; }
      else if (pz.failed && (G.turn === 0 || G.winner !== null)) { cls += ' check'; text = '<b>ざんねん！</b> この手だと かてないよ。「まった」で もどって もういちど！'; }
      else if (!app.human[G.turn]) { cls += ' think'; text = 'しろが かんがえているよ<span class="dots"><i></i><i></i><i></i></span>'; }
      else if (app.hint !== null) { cls += ' hint'; text = `ヒント：<b>${E.pointName(G.size, app.hint)}</b> ひかっている ところに おいてね`; }
      else if (app.preview !== null && ht) { text = 'ここで いい？ もういちど タッチすると おくよ'; }
      else if (G.skipped === 1) { text = '<b>しろは おける ところが ないので パス！</b> もういちど あなたの ばん'; }
      else { text = `<b>第${pz.idx + 1}問</b> のこり ${left}マス。さいごに くろが おおければ かち！`; }
      el.className = 'status ' + cls;
      el.innerHTML = `<span class="msg">${text}</span>${G.last ? lastLine(G) : `<span class="lastmv">「${pr.title}」</span>`}`;
      return;
    }
    if (G.winner !== null) {
      cls = 'end';
      text = G.winner === -1 ? `ひきわけ（${G.counts[0]} たい ${G.counts[1]}）` : `${playerName(G.winner)}の かち！（${G.counts[0]} たい ${G.counts[1]}）`;
      if (G.result === 'resign') text = `${playerName(G.winner)}の かち！（こうさん）`;
      text += '<small>「メニュー」から あたらしく はじめられるよ</small>';
    } else if (!app.human[G.turn]) {
      cls += ' think';
      text = 'CPU が かんがえ中<span class="dots"><i></i><i></i><i></i></span>';
    } else if (app.hint !== null) {
      cls += ' hint';
      text = `ヒント：<b>${E.pointName(G.size, app.hint)}</b> が おすすめ！ ひかっている ところに おいてね`;
    } else if (app.preview !== null && ht) {
      text = 'ここで いい？ <b>もういちど タッチ</b>すると おくよ';
    } else if (G.skipped !== null) {
      cls += ' hint';
      text = `<b>${playerName(G.skipped)}は おける ところが ないので パス！</b> もういちど ${app.mode === 'two' ? who + 'の' : 'あなたの'} ばん`;
    } else {
      text = app.mode === 'two' ? `<b>${who}</b>の ばんだよ。おける ところを タッチしてね` : `<b>あなたの ばん</b>（${E.SIDES[G.turn].name}）だよ。おける ところを タッチしてね`;
    }
    el.className = 'status ' + cls;
    el.innerHTML = `<span class="msg">${text}</span>${lastLine(G)}`;
  }

  const REASON = {
    noflip: 'ここに おいても、あいての 石を 1こも はさめないから おけないよ。<span class="lg lg-dot"></span> が でている ところに おこう。',
    occupied: 'もう 石が あるよ。',
  };

  function renderInfo() {
    const G = app.G;
    const info = $('info');
    const ht = humanTurn();
    if (app.preview !== null && ht) {
      const pv = previewInfo(G, app.preview);
      const me = E.SIDES[G.turn].name, op = E.SIDES[1 - G.turn].name;
      const lines = [];
      lines.push(`<b class="good">${op}の 石が ${pv.flips.length}こ ひっくりかえる！</b>`);
      if (pv.lines.length > 1) lines.push(`${pv.lines.length}つの 向きで はさめるよ`);
      if (pv.corner) lines.push('<b class="good">かど だよ！ もう ぜったいに ひっくりかえされない</b>');
      else if (pv.danger) lines.push('<b class="bad">あぶない！ あいてに かどを とられちゃう</b>');
      else if (pv.nearCorner) lines.push('かどの となり だよ。あとで かどを とられないか ちゅうい');
      if (pv.oppMoves === 0) lines.push(`<b class="good">${op}は おける ところが なくなる！</b>（もういちど うてる）`);
      else lines.push(`${op}が つぎに おける ところは <b>${pv.oppMoves}か所</b>`);
      lines.push(`おいたあとの かず：${me} ${pv.after[G.turn]} ・ ${op} ${pv.after[1 - G.turn]}`);
      info.innerHTML = `<div class="card"><div class="card-body"><div class="card-head"><i class="pstone s${G.turn}"></i><b>${E.pointName(G.size, app.preview)}</b><span class="owner s${G.turn}">${me}</span></div>` +
        `<p class="desc">${lines.join('<br>')}</p><p class="note">もういちど タッチすると おくよ。ほかの ところを タッチすると えらびなおせるよ。</p></div></div>`;
      return;
    }
    if (app.look !== null && G.board[app.look]) {
      const side = G.board[app.look] - 1;
      const st = E.stable(G.board, G.size)[app.look];
      const corner = E.geo(G.size).corners.includes(app.look);
      const owner = app.mode === 'two' ? `${E.SIDES[side].name}の 石` : (app.human[side] ? 'あなたの 石' : (app.mode === 'puzzle' ? 'しろの 石' : 'CPU の 石'));
      let d;
      if (corner) d = '<b class="good">かどの 石。</b>もう ぜったいに ひっくりかえらないよ。';
      else if (st) d = '<b class="good">かくてい石！</b>まわりが うまっていて、もう ひっくりかえらないよ。（<span class="lg lg-stable"></span>）';
      else d = 'この石は まだ ひっくりかえる かも しれないよ。';
      info.innerHTML = `<div class="card"><div class="card-body"><div class="card-head"><i class="pstone s${side}"></i><b>${E.SIDES[side].name}</b>` +
        `<span class="owner s${side}">${owner}</span><span class="where">${E.pointName(G.size, app.look)}</span></div><p class="desc">${d}</p></div></div>`;
      return;
    }
    if (app.lastIllegal) {
      info.innerHTML = `<div class="tips"><p class="tip-main">そこには おけないよ</p><p class="desc">${REASON[app.lastIllegal] || ''}</p></div>`;
      return;
    }
    if (app.puzzle) {
      const pr = PROBS[app.puzzle.idx];
      info.innerHTML = `<div class="tips"><p class="tip-main">第${app.puzzle.idx + 1}問「${pr.title}」</p>` +
        `<p class="desc">さいごまで うって、くろの 石を しろより おおく しよう。${puzzleHint(pr)}</p></div>`;
      return;
    }
    info.innerHTML =
      '<div class="tips"><p class="tip-main">おける ところを タッチすると、ひっくりかえる 石が みえるよ。</p>' +
      '<ul class="legend">' +
      '<li><span class="lg lg-dot"></span> おける ところ（数字は かえる かず）</li>' +
      '<li><span class="lg lg-flip"></span> ひっくりかえる 石</li>' +
      '<li><span class="lg lg-corner"></span> かど（とても つよい）</li>' +
      '<li><span class="lg lg-warn">!</span> かどを とられちゃうかも</li>' +
      '</ul></div>';
  }

  const HINTS = {
    corner: 'かどに おいた 石は もう ひっくりかえされないよ。',
    pass: 'しろが おける ところを なくすと、くろが つづけて うてるよ。',
    fewest: 'たくさん かえせば いい とは かぎらないよ。',
    notgreedy: 'いちばん たくさん ひっくりかえる 手は わな かも？',
    behind: 'いまは しろの ほうが おおいけど、さいごに おおければ かち！',
  };
  function puzzleHint(pr) {
    for (const t of ['corner', 'pass', 'fewest', 'notgreedy', 'behind']) if (pr.tags.includes(t)) return '<br>' + HINTS[t];
    return '<br>さいごまで うったら どうなるか、じゅんばんに かんがえよう。';
  }

  function scoreTable(G) {
    const em = G.size * G.size - G.counts[0] - G.counts[1];
    return '<table class="score-table"><tr><th></th><th><i class="pstone s0"></i>くろ</th><th><i class="pstone s1"></i>しろ</th></tr>' +
      `<tr class="total"><td>石の かず</td><td>${G.counts[0]}</td><td>${G.counts[1]}</td></tr></table>` +
      (em ? `<p class="note">あいている マス：${em}</p>` : '');
  }

  function renderKifu() {
    const ol = $('kifu');
    const k = app.G.kifu;
    if (ol.children.length > k.length || (ol.children.length && ol.children[ol.children.length - 1].textContent !== k[ol.children.length - 1])) ol.innerHTML = '';
    for (let i = ol.children.length; i < k.length; i++) {
      const li = document.createElement('li');
      li.textContent = k[i];
      ol.appendChild(li);
    }
  }

  // ---------- 演出 ----------

  function animateMove() {
    const a = app.anim;
    app.anim = null;
    if (!a) return;
    const n = app.size;
    const st = cells[a.p] && cells[a.p].querySelector('.stone');
    if (st) st.classList.add('drop');
    const x0 = a.p % n, y0 = (a.p / n) | 0;
    for (const q of a.flipped) {
      const s = cells[q] && cells[q].querySelector('.stone');
      if (!s) continue;
      const d = Math.max(Math.abs((q % n) - x0), Math.abs(((q / n) | 0) - y0));
      s.style.animationDelay = (d - 1) * 0.09 + 0.08 + 's';
      s.classList.add('flip');
    }
  }

  let toastTimer = 0;
  function toast(html, cls) {
    const el = $('toast');
    el.innerHTML = html;
    el.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
  }

  let actx = null;
  function tone(freq, start, dur, type, vol) {
    const t0 = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return o;
  }
  function sound(kind, k) {
    if (!app.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (kind === 'move') {
        const o = tone(1100, 0, 0.07, 'triangle', 0.3);
        o.frequency.exponentialRampToValueAtTime(240, actx.currentTime + 0.06);
        // ひっくりかえる 数だけ 小さな 音
        for (let i = 0; i < Math.min(k || 0, 10); i++) tone(700 + i * 60, 0.1 + i * 0.07, 0.07, 'triangle', 0.1);
      } else if (kind === 'corner') {
        [880, 1175].forEach((f, i) => tone(f, 0.1 + i * 0.08, 0.14, 'triangle', 0.16));
      } else if (kind === 'pass') {
        tone(520, 0.05, 0.15, 'square', 0.06); tone(390, 0.2, 0.2, 'square', 0.06);
      } else if (kind === 'win') {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, 'triangle', 0.22));
      } else if (kind === 'lose') {
        [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, 'sine', 0.2));
      }
    } catch (e) { /* 音が出せない環境では鳴らさない */ }
  }

  function confetti() {
    const box = $('confetti');
    box.innerHTML = '';
    const colors = ['#111', '#f5f5f4', '#f59e0b', '#16a34a', '#2563eb'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%';
      s.style.background = colors[i % colors.length];
      s.style.borderRadius = '50%';
      s.style.width = s.style.height = '12px';
      s.style.animationDelay = Math.random() * 0.6 + 's';
      s.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 3600);
  }

  // ---------- 操作 ----------

  function onPoint(p) {
    const G = app.G;
    app.lastIllegal = null;
    app.nope = null;
    if (G.board[p]) {
      app.preview = null;
      app.look = app.look === p ? null : p;
      return render();
    }
    app.look = null;
    if (!humanTurn()) { app.preview = null; return render(); }
    const why = E.illegalReason(G, p);
    if (why) {
      app.preview = null;
      app.lastIllegal = why;
      app.nope = p;
      toast('そこには おけないよ');
      return render();
    }
    if (app.settings.confirm && app.preview !== p && app.hint !== p) {
      app.preview = p;
      return render();
    }
    commit(p);
  }

  function commit(p) {
    const prev = app.G;
    const G = E.apply(prev, p);
    app.states.push(G);
    app.moves.push(p);
    app.G = G;
    app.preview = null;
    app.look = null;
    app.hint = null;
    app.anim = { p, flipped: G.last.flipped };
    let solved = false;
    if (app.puzzle && !app.puzzle.demo) {
      if (prev.turn === 0 && !app.puzzle.failed) app.puzzle.failed = app.puzzle.solver.blackValue(G) <= 0;
      if (G.winner === 0 && !app.puzzle.failed) solved = true;
    }
    save();
    render();
    animateMove();
    sound('move', G.last.flipped.length);
    const corner = E.geo(G.size).corners.includes(p);
    if (corner) setTimeout(() => sound('corner'), 200);
    if (G.skipped !== null && G.winner === null) {
      setTimeout(() => sound('pass'), 350);
      toast(`${playerName(G.skipped)}は おけないので <b>パス</b>`);
    } else if (G.last.flipped.length >= 5) {
      const name = app.mode === 'cpu' && app.human[prev.turn] ? '' : `${playerName(prev.turn)}が `;
      toast(`${name}<b>${G.last.flipped.length}こ</b> ひっくりかえした！`, 'cap');
    } else if (corner) {
      const name = app.mode === 'cpu' && app.human[prev.turn] ? '' : `${playerName(prev.turn)}が `;
      toast(`${name}<b>かど</b>を とった！`, 'promo');
    }
    if (app.puzzle && !app.puzzle.demo && app.puzzle.failed && (G.winner !== null || G.turn === 0)) {
      const tk = app.token;
      render();
      setTimeout(() => { if (tk === app.token) puzzleResult('fail'); }, 900);
      return;
    }
    if (G.winner !== null) return finish(solved);
    proceed();
  }

  function stateForAI(G) {
    return { size: G.size, board: Array.from(G.board), turn: G.turn };
  }

  function onHint() {
    if (!humanTurn()) return;
    const G = app.G;
    app.preview = null;
    if (app.puzzle) {
      const w = app.puzzle.failed ? [] : app.puzzle.solver.winning(G);
      if (!w.length) { toast('「まった」で もどってみよう'); return; }
      app.hint = w[0];
      return render();
    }
    const btn = $('btn-hint');
    btn.disabled = true;
    btn.classList.add('busy');
    const tk = app.token;
    ask(G, 'hint').then(m => {
      btn.classList.remove('busy');
      if (tk !== app.token || app.G !== G || m === null || m < 0) { render(); return; }
      app.hint = m;
      render();
    });
  }

  function canUndo() {
    if (app.G.result === 'resign') return true;
    if (!app.moves.length) return false;
    if (app.mode === 'two') return true;
    return undoTarget() >= 0;
  }
  // まったで戻る先（人が打つ番の局面のうち、いまより前で一番新しいもの）
  function undoTarget() {
    for (let k = app.moves.length - 1; k >= 0; k--) if (app.human[app.states[k].turn]) return k;
    return -1;
  }

  function onUndo() {
    const top = app.states[app.states.length - 1];
    if (app.G.result === 'resign' && app.G !== top) {
      // こうさんを取り消して、その局面にもどる
      app.G = top;
      save();
      render();
      return proceed();
    }
    if (!canUndo()) return;
    let k = app.mode === 'two' ? app.moves.length - 1 : undoTarget();
    if (k < 0) k = 0;
    app.token++;
    app.busy = false;
    app.moves.length = k;
    app.states.length = k + 1;
    app.G = app.states[k];
    if (app.puzzle) app.puzzle.failed = app.puzzle.solver.blackValue(app.G) <= 0;
    app.preview = null;
    app.look = null;
    app.hint = null;
    save();
    render();
    toast('1手 もどしたよ');
    proceed();
  }

  function onResign() {
    if (!canResign()) return;
    if (!confirm('こうさん しますか？')) return;
    app.G = E.resign(app.G); // states には積まない（まったで こうさん前に戻れる）
    save();
    render();
    finish();
  }

  // ---------- CPU ----------

  let worker = null, workerOK = typeof Worker !== 'undefined', reqId = 0;
  const pending = new Map();
  function runLocal(job) {
    setTimeout(() => {
      const st = job.st;
      st.board = Int8Array.from(st.board);
      job.resolve(AI.think(st, job.level));
    }, 30);
  }
  function getWorker() {
    if (!workerOK) return null;
    if (!worker) {
      try {
        worker = new Worker('js/worker.js');
        worker.onmessage = e => {
          const job = pending.get(e.data.id);
          pending.delete(e.data.id);
          if (job) job.resolve(e.data.result);
        };
        worker.onerror = () => {
          // file:// などで Worker が使えないときは画面側で考える
          workerOK = false;
          worker = null;
          for (const job of pending.values()) runLocal(job);
          pending.clear();
        };
      } catch (e) {
        workerOK = false;
        worker = null;
      }
    }
    return worker;
  }
  function ask(G, level) {
    return new Promise(resolve => {
      const job = { st: stateForAI(G), level, resolve };
      const w = getWorker();
      if (!w) return runLocal(job);
      const id = ++reqId;
      pending.set(id, job);
      w.postMessage({ id, st: job.st, level });
    });
  }

  function proceed() {
    const G = app.G;
    if (G.winner !== null || app.human[G.turn]) return;
    app.busy = true;
    render();
    const tk = app.token;
    const t0 = Date.now();
    // パスの あとは すこし 長めに まつ（なにが おきたか わかるように）
    const wait = G.skipped !== null ? 1200 : 650;
    if (app.puzzle) {
      setTimeout(() => {
        if (tk !== app.token || app.G !== G) return;
        app.busy = false;
        commit(app.puzzle.solver.defense(G));
      }, app.puzzle.demo ? 800 : wait);
      return;
    }
    ask(G, app.level).then(m => {
      if (tk !== app.token || app.G !== G) return;
      setTimeout(() => {
        if (tk !== app.token || app.G !== G) return;
        app.busy = false;
        if (m === null || !E.canApply(G, m)) m = E.legalMoves(G)[0];
        commit(m);
      }, Math.max(0, wait - (Date.now() - t0)));
    });
  }

  function finish(solved) {
    const G = app.G;
    app.busy = false;
    render();
    if (app.puzzle) {
      if (app.puzzle.demo) return puzzleDemoEnd();
      return puzzleResult(solved ? 'solved' : 'fail');
    }
    let title, text = '', cls = '';
    const solo = app.mode === 'cpu';
    const margin = Math.abs(G.counts[0] - G.counts[1]);
    if (G.winner === -1) {
      title = 'ひきわけ';
      text = `どちらも ${G.counts[0]}こ。おなじ かず だったよ。`;
    } else {
      const wn = playerName(G.winner), ln = playerName(1 - G.winner);
      const won = solo ? app.human[G.winner] : true;
      title = solo ? (won ? 'かったよ！ おめでとう！' : 'まけちゃった…') : `${wn}（${E.SIDES[G.winner].name}）の かち！`;
      cls = won ? 'win' : 'lose';
      if (G.result === 'resign') text = solo && !won ? 'こうさん したよ。また ちょうせん してね！' : `${ln}が こうさん したよ。`;
      else if (G.counts[1 - G.winner] === 0) text = `${E.SIDES[1 - G.winner].name}の 石が ぜんぶ なくなったよ！ ぜんめつ！`;
      else text = `${margin}こ の さで ${solo ? (won ? 'あなた' : 'CPU') : wn}の かち！${solo && !won ? '「まった」で もどって やりなおせるよ！' : ''}`;
      if (won) { sound('win'); confetti(); } else sound('lose');
    }
    $('result-title').textContent = title;
    $('result-title').className = cls;
    $('result-text').textContent = text;
    $('result-score').innerHTML = G.result === 'count' ? scoreTable(G) : '';
    $('btn-result-undo').hidden = !canUndo();
    setTimeout(() => { if (!document.querySelector('dialog[open]')) $('dlg-result').showModal(); }, 900);
  }

  // ---------- さいごの もんだい ----------

  function startPuzzle(idx, moves) {
    app.token++;
    app.busy = false;
    app.mode = 'puzzle';
    app.human = [true, false];
    const s0 = PZ.start(PROBS[idx]);
    app.size = s0.size;
    app.puzzle = { idx, solver: new PZ.Solver(s0.size), failed: false, demo: false };
    document.body.classList.add('puzzle-mode');
    rebuild([]);
    for (const m of moves || []) {
      if (app.G.winner !== null || !E.canApply(app.G, m)) break;
      app.G = E.apply(app.G, m);
      app.states.push(app.G);
      app.moves.push(m);
    }
    // くろの番で、まだ おわっていない局面までもどす
    while (app.moves.length && (app.G.turn === 1 || app.G.winner !== null)) {
      app.moves.pop(); app.states.pop(); app.G = app.states[app.states.length - 1];
    }
    if (app.moves.length) app.puzzle.failed = app.puzzle.solver.blackValue(app.G) <= 0;
    $('kifu').innerHTML = '';
    setupBoard();
    save();
    render();
  }

  function openPuzzleList() {
    const done = Object.keys(app.puzzleDone).length;
    let h = `<p class="pz-count">クリア <b>${done}</b> / ${PROBS.length}もん</p>`;
    const LABEL = { 4: 'あと 4マス（まずは ここから）', 6: 'あと 6マス（すこし むずかしい）', 8: 'あと 8マス・8×8（チャレンジ）' };
    for (const k of [4, 6, 8]) {
      h += `<h3>${LABEL[k]}</h3><div class="pz-grid">`;
      PROBS.forEach((p, i) => {
        if (p.empties !== k) return;
        const ok = app.puzzleDone[i];
        h += `<button type="submit" value="${i}" class="pz-btn${ok ? ' done' : ''}${app.puzzle && app.puzzle.idx === i ? ' cur' : ''}">` +
          `<b>${i + 1}</b><small>${p.title}</small>${ok ? '<i>★</i>' : ''}</button>`;
      });
      h += '</div>';
    }
    $('puzzle-list').innerHTML = h;
    $('dlg-puzzle').showModal();
  }

  function answerLine(idx) {
    const s = PZ.start(PROBS[idx]);
    return new PZ.Solver(s.size).mainLine(s);
  }
  function lineHTML(size, line) {
    return line.map(m => `<span class="s${m.side}">${E.SIDES[m.side].mark}${E.pointName(size, m.p)}</span>`).join(' ');
  }

  // kind: 'solved' | 'fail' | 'answer'
  function puzzleResult(kind) {
    const idx = app.puzzle.idx, pr = PROBS[idx];
    if (kind === 'solved') {
      app.puzzleDone[idx] = true;
      save();
      sound('win');
      confetti();
    } else if (kind === 'fail') {
      sound('lose');
    }
    const title = { solved: 'せいかい！ おみごと！', fail: 'ざんねん…', answer: `第${idx + 1}問の こたえ` }[kind];
    let h = `<h2 class="${kind === 'solved' ? 'win' : kind === 'fail' ? 'lose' : ''}">${title}</h2>`;
    h += `<p class="pz-sub">第${idx + 1}問「${pr.title}」（のこり ${pr.empties}マス）</p>`;
    if (kind === 'fail') {
      h += '<p>この手だと、しろが うまく うって くろが かてなく なっちゃう。「まった」で もどるか、もういちど はじめから やってみよう。どうしても わからない ときは「こたえを みる」を おしてね。</p>';
    } else {
      const { line, end } = answerLine(idx);
      const s0 = PZ.start(pr);
      h += `<div class="pz-answer">こたえ：${lineHTML(s0.size, line)}</div>`;
      h += `<p class="pz-text">さいごは くろ ${end.counts[0]} たい しろ ${end.counts[1]} で くろの かち。${puzzleHint(pr).replace('<br>', '')}</p>`;
      const traps = new PZ.Solver(s0.size).traps(s0);
      if (traps.length) {
        const nm = p => (p === E.PASS ? 'パス' : E.pointName(s0.size, p));
        h += '<div class="pz-traps"><b>まちがえやすい 手</b><ul>' +
          traps.map(t => `<li><span class="s0">●${nm(t.p)}</span>${t.reply === null ? ' で おわって' : t.reply === E.PASS ? ' → しろは パス。でも さいごは' : ` → <span class="s1">○${nm(t.reply)}</span> で`} ${t.v === 0 ? 'ひきわけ' : 'まけ'}</li>`).join('') + '</ul></div>';
      }
    }
    const btn = (v, label, cls) => `<button type="submit" value="${v}"${cls ? ` class="${cls}"` : ''}>${label}</button>`;
    let b = '';
    if (kind === 'solved') b = btn('list', 'もんだい いちらん') + (idx + 1 < PROBS.length ? btn('next', 'つぎの もんだい', 'primary') : '');
    else if (kind === 'fail') b = btn('undo', 'まった') + btn('answer', 'こたえを みる') + btn('retry', 'もういちど', 'primary');
    else b = btn('close', 'とじる') + btn('demo', 'こたえを ならべる', 'primary');
    $('puzzle-result').innerHTML = h + `<div class="dlg-buttons">${b}</div>`;
    setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      $('dlg-puzzle-result').showModal();
    }, kind === 'solved' ? 900 : 100);
  }

  function onPuzzleResult(v) {
    if (!app.puzzle) return;
    const idx = app.puzzle.idx;
    if (v === 'next') startPuzzle(idx + 1, []);
    else if (v === 'list') openPuzzleList();
    else if (v === 'retry') startPuzzle(idx, []);
    else if (v === 'undo') onUndo();
    else if (v === 'answer') puzzleResult('answer');
    else if (v === 'demo') puzzleDemo();
  }

  // こたえを盤に ならべる
  function puzzleDemo() {
    const idx = app.puzzle.idx;
    startPuzzle(idx, []);
    const { line } = answerLine(idx);
    app.puzzle.demo = true;
    app.busy = true;
    app.human = [true, true]; // 両方とも ここで打つ
    render();
    const tk = app.token;
    const step = k => {
      if (tk !== app.token || k >= line.length) return;
      app.busy = false;
      commit(line[k].p);
      app.busy = app.G.winner === null;
      render();
      setTimeout(() => step(k + 1), 1100);
    };
    setTimeout(() => step(0), 600);
  }
  function puzzleDemoEnd() {
    app.puzzle.demo = false;
    app.human = [true, false];
    render();
    toast('これで くろの かち！');
  }

  window.ReversiApp = app; // デバッグ用
  document.addEventListener('DOMContentLoaded', init);
})();
