/**
 * WORD NINJA — 界面层（DOM）
 * 首页 / 世界阶段地图 / 结算 / 错词本 / 报告 / 设置 / 暂停 / 提示
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;
  var lex = WN.lexicon;
  var srs = WN.srs;
  var store = WN.store;

  var T = function (k, v) { return WN.i18n.t(k, v); };

  var LANG_NAMES = { zh: '中文', en: 'English', es: 'Español', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt' };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stars(n, total) {
    var out = '';
    for (var i = 0; i < (total || 3); i++) {
      out += '<span class="star' + (i < n ? ' on' : '') + '" style="--i:' + i + '">★</span>';
    }
    return out;
  }

  /** 结算页动画：分数滚动 + 星星逐颗弹出 + 各区块依次入场 */
  function animateResult(host) {
    var inner = host.querySelector('.screen-inner.result');
    if (!inner) { return; }
    var num = inner.querySelector('.score-num[data-count]');
    var target = num ? Number(num.getAttribute('data-count')) || 0 : 0;
    // 先让各区块以入场动画出现（用 setTimeout 而不是 rAF：后台标签页 rAF 不跑，
    // 若依赖 rAF，切回来时结算页会一片空白）
    setTimeout(function () { inner.classList.add('res-in'); }, 20);
    setTimeout(function () { inner.classList.add('res-in'); }, 1200);   // 兜底
    if (!num) { return; }
    var t0 = 0;
    function step(now) {
      if (!t0) { t0 = now; }
      var t = Math.min(1, (now - t0) / 720);
      var eased = 1 - Math.pow(1 - t, 3);
      num.textContent = util.formatScore(Math.round(target * eased));
      if (t < 1) { requestAnimationFrame(step); }
      else { num.textContent = util.formatScore(target); }
    }
    num.textContent = '0';
    requestAnimationFrame(step);
  }

  /** 触屏说"滑动"，鼠标说"按住拖动" */
  function pointerHint() {
    var coarse = false;
    try { coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { /* ignore */ }
    return T(coarse ? 'hint.slice' : 'hint.sliceMouse');
  }

  function worldEntriesLen(w) { return lex.worldEntries(w).length; }

  /** 设置页的语音诊断：把"有没有声音"变成可读的状态 */
  function voiceDiag() {
    var info = WN.audio.info ? WN.audio.info() : { supported: false, voiceCount: 0, broken: false, hasVoice: false };
    var engine = info.supported ? T('settings.voiceEngineOk') : T('settings.voiceEngineNo');
    var state;
    if (!info.hasVoice) { state = T('settings.voiceStateNone'); }
    else if (info.broken) { state = T('settings.voiceStateFail'); }
    else { state = T('settings.voiceStateOk'); }
    var packOk = !!(WN.audio.hasAudioPack && WN.audio.hasAudioPack());
    var packLine = T('settings.voicePack') + '：' + T(packOk ? 'settings.voicePackOk' : 'settings.voicePackNo');
    if (packOk && info.packPlayed) { packLine += ' · ' + T('settings.packPlayed'); }
    if (info.packError) { packLine += ' · err ' + info.packError; }
    return '<div class="panel">' +
      '<h3>' + esc(T('settings.voiceDiag')) + '</h3>' +
      '<p class="muted small-text">' + esc(T('settings.voiceDiagLine', { engine: engine, n: info.voiceCount, state: state })) + '</p>' +
      '<p class="muted small-text">' + esc(packLine) + '</p>' +
      (info.voiceName ? '<p class="muted small-text">' + esc(info.voiceName) + '</p>' : '') +
      (info.hasVoice && !info.hasLocalVoice && !packOk ? '<p class="warn small-text">' + esc(T('settings.voiceCloudOnly')) + '</p>' : '') +
      '</div>';
  }

  function clearedAllModes(save) {
    var seen = {};
    var modes = ['classic', 'en2zh', 'audio', 'spell', 'dictate'];
    for (var i = 0; i < modes.length; i++) {
      var m = save.stages[modes[i]] || {};
      for (var wid in m) {
        var c = m[wid].cleared || {};
        for (var k in c) { if (c[k]) { seen[k] = true; } }
      }
    }
    return Object.keys(seen).length;
  }

  function bestScoreAll(save) {
    var best = 0;
    var modes = ['classic', 'en2zh', 'audio', 'spell', 'dictate'];
    for (var i = 0; i < modes.length; i++) {
      var m = save.stages[modes[i]] || {};
      for (var wid in m) { best = Math.max(best, m[wid].bestScore || 0); }
    }
    return best;
  }

  // 词表筛选状态（all / fresh / learning / mastered），与搜索叠加
  var wsFilter = 'all';

  function applyWordFilter(host) {
    var input = host.querySelector('.ws-search');
    var q = ((input && input.value) || '').trim().toLowerCase();
    var rows = host.querySelectorAll('.word-row');
    for (var i = 0; i < rows.length; i++) {
      var stateOk = wsFilter === 'all' || rows[i].getAttribute('data-state') === wsFilter;
      var textOk = !q || (rows[i].getAttribute('data-search') || '').indexOf(q) >= 0;
      rows[i].style.display = (stateOk && textOk) ? '' : 'none';
    }
    // 关卡分隔条：后面一个可见词都没有就隐藏
    var box = host.querySelector('.word-rows');
    if (!box) { return; }
    var kids = box.children;
    for (var j = 0; j < kids.length; j++) {
      if (!kids[j].classList || !kids[j].classList.contains('lv-divider')) { continue; }
      var any = false;
      for (var k = j + 1; k < kids.length; k++) {
        if (kids[k].classList.contains('lv-divider')) { break; }
        if (kids[k].style.display !== 'none') { any = true; break; }
      }
      kids[j].style.display = any ? '' : 'none';
    }
  }

  var Screens = {
    root: null,
    current: 'home',
    onAction: null,

    mount: function (rootEl) {
      Screens.root = rootEl;
      Screens.root.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) { return; }
        if (btn.disabled) { return; }
        WN.audio.play('click');
        if (Screens.onAction) { Screens.onAction(btn.getAttribute('data-action'), btn.dataset); }
      });
      Screens.root.addEventListener('input', function (e) {
        var inp = e.target;
        if (!inp || !inp.classList || !inp.classList.contains('ws-search')) { return; }
        var host = Screens.root.querySelector('[data-screen="stagewords"]');
        if (host) { applyWordFilter(host); }
      });
      Screens.root.addEventListener('change', function (e) {
        var input = e.target;
        if (input && input.dataset && input.dataset.setting) {
          if (Screens.onAction) {
            Screens.onAction('toggle-setting', { setting: input.dataset.setting, value: input.checked ? '1' : '0' });
          }
        }
      });
    },

    show: function (name) {
      Screens.current = name;
      var screens = Screens.root.querySelectorAll('.screen');
      for (var i = 0; i < screens.length; i++) {
        screens[i].classList.toggle('active', screens[i].getAttribute('data-screen') === name);
      }
    },

    render: function (name, data) {
      var fn = Screens['view_' + name];
      var host = Screens.root.querySelector('[data-screen="' + name + '"]');
      if (!host || !fn) { return; }
      host.innerHTML = fn(data || {});
      Screens.show(name);
      var scroller = host.querySelector('.scroll');
      if (scroller) { scroller.scrollTop = 0; }
      if (name === 'result') { animateResult(host); }
    },

    // ---------------- 首页 ----------------
    view_home: function (d) {
      var save = d.save;
      var p = save.profile;
      var total = lex.count();
      var cleared = clearedAllModes(save);
      var best = bestScoreAll(save);
      var dailyDone = save.daily && save.daily.date === util.todayKey() && save.daily.done;
      var due = srs.dueCount(save, lex.all());
      var today = 0;
      var learningNow = 0;
      Object.keys(save.words).forEach(function (k) {
        var rec = save.words[k];
        if (util.todayKey(new Date(rec.lastAt || 0)) === util.todayKey()) { today += 1; }
        if (rec.seen > 0 && (rec.mastery || 0) < 4) { learningNow += 1; }
      });
      var masteredNow = srs.countMastered(save, lex.all());
      var goal = (save.settings && save.settings.dailyGoal) || 20;
      var goalPct = Math.min(100, Math.round((today / goal) * 100));
      return '' +
        '<div class="screen-inner home">' +
        '  <div class="brand">' +
        '    <div class="brand-halo"></div>' +
        '    <div class="brand-slice"></div>' +
        '    <h1 class="brand-title">WORD<span>NINJA</span></h1>' +
        '    <p class="brand-sub">' + esc(T('app.tagline')) + '</p>' +
        '  </div>' +
        '  <div class="home-meta">' +
        '    <span class="pill">⚡ ' + esc(T('home.level', { n: p.level })) + '</span>' +
        '    <span class="pill">🏆 ' + esc(T('home.best')) + ' <b>' + util.formatScore(best) + '</b></span>' +
        '    <span class="pill">📚 ' + esc(T('home.cleared')) + ' ' + cleared + '/' + total + '</span>' +
        (p.streakDays > 1 ? '<span class="pill hot">🔥 ' + esc(T('home.streak', { n: p.streakDays })) + '</span>' : '') +
        '  </div>' +
        '  <div class="goal-strip' + (goalPct >= 100 ? ' done' : '') + '">' +
        '    <div class="goal-head"><span>' +
        (goalPct >= 100
          ? '🎯 ' + esc(T('home.goalAchieved', { n: today }))
          : '🎯 ' + esc(T('home.goal', { n: today, goal: goal }))) + '</span>' +
        (due > 0 ? '<b>' + esc(T('home.due', { n: due })) + '</b>' : '<b class="ok">✓ ' + esc(T('home.noDue')) + '</b>') + '</div>' +
        '    <div class="bar"><i style="width:' + goalPct + '%"></i></div>' +
        '  </div>' +
        '  <button class="btn btn-primary btn-hero" data-action="go-map">' +
        '    <span class="btn-shine"></span>' +
        '    <span class="btn-hero-main">' + esc(T('home.play')) + '</span>' +
        '    <small>' + esc(pointerHint()) + '</small>' +
        '  </button>' +
        '  <div class="tile-grid">' +
        '    <button class="tile-card" data-action="due-review" style="--tc:#5ee0a8"' + (due > 0 ? '' : ' disabled') + '>' +
        '      <span class="tile-icon">🔁</span>' +
        '      <b>' + esc(T('home.review')) + '</b>' +
        '      <small>' + (due > 0 ? due + ' ' + esc(T('report.dueShort')) : esc(T('home.noDue'))) + '</small>' +
        '    </button>' +
        '    <button class="tile-card" data-action="daily" style="--tc:#ffb35c">' +
        '      <span class="tile-icon">📅</span>' +
        '      <b>' + esc(T('home.daily')) + '</b>' +
        '      <small>' + (dailyDone ? '✓ ' + esc(T('home.dailyDone')) : esc(T('home.dailyDesc')) + ' · ' + esc(T('game.mode.classic'))) + '</small>' +
        '    </button>' +
        '    <button class="tile-card" data-action="endless" style="--tc:#7c8cff">' +
        '      <span class="tile-icon">♾️</span>' +
        '      <b>' + esc(T('home.endless')) + '</b>' +
        '      <small>' + ((save.endless && save.endless.best > 0)
          ? esc(T('home.endlessBest', { n: util.formatScore(save.endless.best) }))
          : esc(T('home.endlessDesc'))) + '</small>' +
        '    </button>' +
        '    <button class="tile-card" data-action="wordbook" style="--tc:#ff6b8a">' +
        '      <span class="tile-icon">📕</span>' +
        '      <b>' + esc(T('home.wordbook')) + '</b>' +
        '      <small>' + (save.wrongBook.length ? save.wrongBook.length + ' ' + esc(T('report.dueShort')) : '—') + '</small>' +
        '    </button>' +
        '    <button class="tile-card" data-action="report" style="--tc:#4fd1ff">' +
        '      <span class="tile-icon">📊</span>' +
        '      <b>' + esc(T('home.stats')) + '</b>' +
        '      <small>' + (masteredNow > 0
          ? esc(T('report.mastered')) + ' ' + masteredNow
          : (learningNow > 0 ? esc(T('home.learningShort', { n: learningNow })) : esc(T('report.mastered')) + ' 0')) + '</small>' +
        '    </button>' +
        '    <button class="tile-card" data-action="settings" style="--tc:#a08bff">' +
        '      <span class="tile-icon">⚙️</span>' +
        '      <b>' + esc(T('home.settings')) + '</b>' +
        '      <small>v' + (d.version || '0.3.0') + '</small>' +
        '    </button>' +
        '  </div>' +
        '  <p class="footnote">' + esc(T('app.title')) + ' · ' + total + ' words · v' + (d.version || '0.3.1') + ' · ' + esc(T('report.note')) + '</p>' +
        '</div>';
    },

    // ---------------- 世界地图（一世界 = 一阶段 = 一整套词） ----------------
    view_map: function (d) {
      var save = d.save;
      var worlds = lex.worlds();
      var mode = d.mode || 'classic';
      var html = '' +
        '<div class="screen-inner map">' +
        '  <div class="topbar">' +
        '    <button class="icon-btn" data-action="home">‹</button>' +
        '    <h2>' + esc(T('map.title')) + '</h2>' +
        '    <span class="spacer"></span>' +
        '  </div>' +
        '  <div class="mode-row">';
      lex.MODES.forEach(function (m) {
        html += '<button class="chip' + (m === mode ? ' on' : '') + '" data-action="set-mode" data-mode="' + m + '">'
          + esc(T('game.mode.' + m)) + '</button>';
      });
      html += '  </div>' +
        '  <p class="hint" style="margin-top:-4px">' + esc(T('map.nodesc')) + '</p>' +
        '  <div class="worlds">';

      worlds.forEach(function (w, idx) {
        var entries = lex.worldEntries(w);
        var total = entries.length;
        var chunks = lex.levelChunks(w);
        var states = store.levelStates(save, mode, w.id, chunks);
        var prog = store.stageProgress(save, mode, w.id, total);
        var unlocked = store.stageUnlocked(save, mode, w.id, worlds);
        var prevWorld = idx > 0 ? worlds[idx - 1] : null;
        var allDone = states.length > 0 && states.every(function (s) { return s.done; });
        var nextLevel = null;
        for (var s = 0; s < states.length; s++) {
          if (states[s].unlocked && !states[s].done) { nextLevel = states[s]; break; }
        }
        var primaryIndex = nextLevel ? nextLevel.index : 1;
        var label;
        if (allDone) { label = T('stage.reviewLevel', { n: primaryIndex }); }
        else if (nextLevel && nextLevel.cleared > 0) { label = T('stage.continueLevel', { n: primaryIndex }); }
        else if (primaryIndex > 1) { label = T('stage.startLevel', { n: primaryIndex }); }
        else { label = T('stage.start'); }

        var chips = states.map(function (st) {
          var cls = 'level-chip' + (st.done ? ' done' : '') + (st.unlocked ? '' : ' locked') +
            (nextLevel && st.index === nextLevel.index ? ' current' : '') +
            (st.cleared > 0 && !st.done && !st.boss ? ' partial' : '') + (st.boss ? ' boss' : '');
          var tip = st.boss ? T('boss.level') : T('stage.levelProgress', { i: st.index, n: chunks.length, c: st.cleared, t: st.total });
          return '<button class="' + cls + '"' + (st.unlocked ? ' data-action="start-stage" data-world="' + w.id + '" data-level="' + st.index + '"' : ' disabled') +
            ' title="' + esc(tip) + '">' +
            '<span>' + (st.boss ? '👑' : st.index) + '</span>' +
            (st.done ? '<i>✓</i>' : '') +
            '</button>';
        }).join('');

        html += '' +
          '<section class="world' + (unlocked ? '' : ' disabled') + (allDone ? ' done' : '') + '" style="--wc:' + w.color + '">' +
          '  <div class="world-head">' +
          '    <div class="world-title">' +
          '      <span class="world-badge" aria-hidden="true">' + w.icon + '</span>' +
          '      <div>' +
          '        <h3>' + esc(T(w.nameKey)) + '</h3>' +
          '        <p>' + esc(T(w.descKey)) + ' · ' + esc(T('stage.levels', { n: chunks.length + 1 })) + '</p>' +
          '      </div>' +
          '    </div>' +
          '    <div class="stage-badge">' +
          (store.titleOf(save, w.id) ? '<span class="title-tag">🏅 ' + esc(T(store.titleOf(save, w.id).key)) + '</span>' : '') +
          (allDone ? '<span class="done-tag">✓ ' + esc(T('stage.done')) + '</span>' : '') +
          '      <span class="stars-line">' + stars(prog.stars) + '</span>' +
          '    </div>' +
          '  </div>' +
          (unlocked
            ? '  <div class="stage-progress">' +
              '    <div class="bar"><i style="width:' + prog.percent + '%"></i></div>' +
              '    <span class="stage-count">' + prog.cleared + ' / ' + total + '</span>' +
              '  </div>' +
              '  <div class="level-track">' + chips + '</div>' +
              '  <div class="stage-actions">' +
              '    <button class="btn ' + (allDone ? 'ghost' : 'btn-primary') + ' stage-btn" data-action="start-stage" data-world="' + w.id + '" data-level="' + primaryIndex + '">'
              + esc(label) + (allDone ? '' : ' →') + '</button>' +
              '    <button class="btn ghost stage-btn2" data-action="stage-words" data-world="' + w.id + '">' + esc(T('stage.words')) + '</button>' +
              '  </div>'
            : '  <div class="stage-actions">' +
              '    <p class="locked-note">🔒 ' + esc(T('stage.locked', { name: prevWorld ? T(prevWorld.nameKey) : '' })) + '</p>' +
              '    <button class="btn ghost stage-btn2" data-action="stage-words" data-world="' + w.id + '">' + esc(T('stage.words')) + '</button>' +
              '  </div>') +
          '</section>';
      });

      html += '</div></div>';
      return html;
    },

    // ---------------- 阶段词表（该阶段全部单词） ----------------
    view_stagewords: function (d) {
      var world = lex.world(d.worldId) || lex.worlds()[0];
      var mode = d.mode || 'classic';
      var lang = d.meaningLang || 'zh';
      var entries = lex.worldEntries(world);
      var prog = store.stageProgress(d.save, mode, world.id, entries.length);
      var rows = entries.map(function (e, i) {
        var rec = d.save.words[e.key];
        var mastery = rec ? rec.mastery : 0;
        var done = !!(prog.rec.cleared && prog.rec.cleared[e.key]);
        var state = !rec || !rec.seen ? 'fresh' : (mastery >= 4 ? 'mastered' : 'learning');
        var divider = (i % lex.LEVEL_SIZE === 0)
          ? '<div class="lv-divider">' + esc(T('stage.level', { n: Math.floor(i / lex.LEVEL_SIZE) + 1 }))
            + '<span>' + Math.min(lex.LEVEL_SIZE, entries.length - i) + '</span></div>'
          : '';
        return divider + '<button class="word-row' + (done ? ' done' : '') + '" data-action="speak-word" data-word="' + esc(e.word) + '"' +
          ' data-state="' + state + '"' +
          ' data-search="' + esc((e.word + ' ' + lex.meaningOf(e, lang)).toLowerCase()) + '">' +
          '<span class="wr-idx">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' +
          '<span class="wr-main">' +
          '  <b>' + esc(e.word) + '</b>' +
          '  <i>' + esc(e.pos) + '</i>' +
          '  <em>' + esc(lex.meaningOf(e, lang)) + '</em>' +
          '</span>' +
          '<span class="wr-state">' + (done ? '✓' : (mastery > 0 ? '●'.repeat(Math.min(mastery, 3)) : '○')) + '</span>' +
          '</button>';
      }).join('');

      var filters = [
        { k: 'all', label: T('wordbook.filterAll') },
        { k: 'fresh', label: T('report.fresh') },
        { k: 'learning', label: T('report.learning') },
        { k: 'mastered', label: T('report.mastered') }
      ];

      return '' +
        '<div class="screen-inner">' +
        '  <div class="topbar">' +
        '    <button class="icon-btn" data-action="go-map">‹</button>' +
        '    <div class="topbar-title">' +
        '      <h2>' + esc(T(world.nameKey)) + '</h2>' +
        '      <span class="count">' + prog.cleared + ' / ' + entries.length + '</span>' +
        '    </div>' +
        '    <span class="spacer"></span>' +
        '  </div>' +
        '  <p class="hint" style="margin-top:-2px">' + esc(T('stage.hearHint')) + '</p>' +
        '  <input class="ws-search" type="search" placeholder="' + esc(T('stage.search')) + '" aria-label="' + esc(T('stage.search')) + '">' +
        '  <div class="mode-row ws-filters">' + filters.map(function (f) {
          return '<button class="chip' + (wsFilter === f.k ? ' on' : '') + '" data-action="ws-filter" data-filter="' + f.k + '">' + esc(f.label) + '</button>';
        }).join('') + '</div>' +
        '  <div class="scroll"><div class="word-rows">' + rows + '</div></div>' +
        '</div>';
    },

    /** 词表筛选：与搜索关键字叠加生效 */
    setWordFilter: function (f) {
      wsFilter = f || 'all';
      var host = Screens.root.querySelector('[data-screen="stagewords"]');
      if (!host) { return; }
      var chips = host.querySelectorAll('[data-action="ws-filter"]');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('on', chips[i].getAttribute('data-filter') === wsFilter);
      }
      applyWordFilter(host);
    },

    // ---------------- 结算 ----------------
    view_result: function (d) {
      var r = d.result;
      var world = r.stageId ? lex.world(r.stageId) : null;
      var chunks = world ? lex.levelChunks(world) : [];
      var levelNo = r.levelNo || 1;
      var totalLevels = chunks.length + (chunks.length ? 1 : 0);   // 含 Boss 关
      var hasNextLevel = levelNo < totalLevels;
      var nextWorld = (r.win && !hasNextLevel && r.stageId) ? lex.nextWorld(r.stageId) : null;
      var kind = r.kind || (r.stageId ? 'stage' : '');
      var isStage = kind === 'stage' && !!r.stageId;
      // 只有关卡模式才能"继续本阶段"；无尽/每日/复习没有关卡，改成"再来一局"
      var canResume = !r.win && !r.boss && isStage && r.cleared < r.totalWords;
      var replayAction = kind === 'endless' ? 'endless' : (kind === 'daily' ? 'daily' : (kind === 'review' ? 'review' : ''));
      var canReplay = !!replayAction && !r.boss;
      var wrongHtml = '';
      if (r.wrongEntries && r.wrongEntries.length) {
        wrongHtml = '<div class="wrong-list">' + r.wrongEntries.map(function (e) {
          return '<div class="wrong-item"><b>' + esc(e.word) + '</b><span>' + esc(lex.meaningOf(e, d.meaningLang)) + '</span></div>';
        }).join('') + '</div>';
      } else {
        wrongHtml = '<p class="muted">' + esc(T('result.emptyWrong')) + '</p>';
      }
      return '' +
        '<div class="screen-inner result ' + (r.win ? 'win' : 'lose') + '">' +
        '  <h2 class="result-title">' + esc(T(r.boss ? (r.win ? 'result.bossWin' : 'boss.lose') : (r.win ? 'result.win' : 'result.lose'))) + '</h2>' +
        (r.stageId ? '  <p class="result-sub">' + esc(T(r.boss ? 'boss.level' : 'stage.level', { n: levelNo })) + ' · ' + r.cleared + '/' + r.totalWords +
          (r.timedOut ? ' · ' + esc(T('result.timeout')) : '') + '</p>' : '') +
        (r.title ? '  <div class="title-badge">🏅 ' + esc(T('result.titleGot')) + '：<b>' + esc(r.title) + '</b></div>' : '') +
        (r.dailyBonus ? '  <div class="title-badge">🔥 ' + esc(T('daily.streak', { n: r.dailyBonus.streak })) +
          ' · ' + esc(T('daily.bonus', { xp: r.dailyBonus.xp })) + '</div>' : '') +
        (r.goalBonus ? '  <div class="title-badge">🎯 ' + esc(T('result.goalBonus', { xp: r.goalBonus.xp })) + '</div>' : '') +
        (r.win ? '<div class="big-stars">' + stars(r.stars) + '</div>' : '') +
        '  <div class="score-block">' +
        '    <span class="score-num" data-count="' + Math.round(r.score) + '">' + util.formatScore(r.score) + '</span>' +
        '    <span class="score-label">' + esc(T('result.score')) + '</span>' +
        (r.newRecord ? '<span class="record">' + esc(T('result.newRecord')) + '</span>' : '') +
        '  </div>' +
        '  <div class="stat-grid">' +
        (isStage
          ? '    <div><b>' + r.cleared + '/' + r.totalWords + '</b><span>' + esc(T('result.cleared')) + '</span></div>'
          : '    <div><b>' + r.cleared + '</b><span>' + esc(T('result.sliced')) + '</span></div>') +
        '    <div><b>' + Math.round(r.accuracy * 100) + '%</b><span>' + esc(T('result.accuracy')) + '</span></div>' +
        '    <div><b>' + r.maxCombo + '</b><span>' + esc(T('result.maxCombo')) + '</span></div>' +
        '    <div><b>' + util.formatScore(r.best) + '</b><span>' + esc(T('result.best')) + '</span></div>' +
        '  </div>' +
        '  <h3 class="section-title">' + esc(T('result.wrong')) + '</h3>' +
        wrongHtml +
        '  <div class="btn-col">' +
        (r.win && hasNextLevel
          ? '    <button class="btn btn-primary" data-action="start-stage" data-world="' + r.stageId + '" data-level="' + (levelNo + 1) + '">'
            + esc(T('stage.nextLevel')) + ' →</button>' : '') +
        (r.win && !hasNextLevel && nextWorld
          ? '    <button class="btn btn-primary" data-action="start-stage" data-world="' + nextWorld.id + '" data-level="1">'
            + esc(T('result.nextStage')) + ' →</button>' : '') +
        (canResume
          ? '    <button class="btn' + (r.win ? '' : ' btn-primary') + '" data-action="start-stage" data-world="' + (r.stageId || '') + '" data-level="' + levelNo + '">'
            + esc(T('result.resume')) + '</button>' : '') +
        (canReplay
          ? '    <button class="btn' + ((!r.win && !canResume) ? ' btn-primary' : '') + '" data-action="' + replayAction + '">' + esc(T('result.replay')) + '</button>' : '') +
        (r.win && !hasNextLevel && !nextWorld
          ? '    <button class="btn btn-primary" data-action="go-map">' + esc(T('result.back')) + '</button>' : '') +
        '    <button class="btn' + ((!r.win && !canResume && !canReplay) ? ' btn-primary' : '') + '" data-action="go-map">' + esc(T('result.back')) + '</button>' +
        '    <button class="btn ghost" data-action="home">' + esc(T('result.home')) + '</button>' +
        '  </div>' +
        '</div>';
    },

    // ---------------- 错词本 ----------------
    view_wordbook: function (d) {
      var save = d.save;
      var items = [];
      save.wrongBook.forEach(function (w) {
        var e = lex.entry(w.key);
        if (e) { items.push({ e: e, rec: w }); }
      });
      // 错的次数多的排前面；同样次数时，掌握度低的优先
      items.sort(function (a, b) {
        if ((b.rec.wrongCount || 0) !== (a.rec.wrongCount || 0)) {
          return (b.rec.wrongCount || 0) - (a.rec.wrongCount || 0);
        }
        var ma = (srs.get(save, a.rec.key) || {}).mastery || 0;
        var mb = (srs.get(save, b.rec.key) || {}).mastery || 0;
        if (ma !== mb) { return ma - mb; }
        return (b.rec.lastAt || 0) - (a.rec.lastAt || 0);
      });
      var highFreq = items.filter(function (it) { return (it.rec.wrongCount || 0) >= 3; }).length;
      var topCount = Math.min(20, items.length);
      var body;
      if (!items.length) {
        body = '<div class="empty"><span class="empty-icon">🎉</span><p>' + esc(T('wordbook.empty')) + '</p></div>';
      } else {
        body = '<div class="word-list">' + items.map(function (it) {
          var st = srs.get(save, it.rec.key);
          var m = st ? st.mastery : 0;
          var hot = (it.rec.wrongCount || 0) >= 3;
          return '<div class="word-card' + (hot ? ' hot' : '') + '">' +
            '<div class="wc-head"><b>' + esc(it.e.word) + '</b>' +
            '<span class="wc-pos">' + esc(it.e.pos) + '</span>' +
            (hot ? '<span class="wc-hot">' + esc(T('wordbook.highFreq')) + '</span>' : '') +
            '<span class="wc-wrong">' + esc(T('wordbook.wrongTimes', { n: it.rec.wrongCount })) + '</span></div>' +
            '<div class="wc-zh">' + esc(lex.meaningOf(it.e, d.meaningLang)) + '</div>' +
            '<div class="wc-ex">' + esc(it.e.example) + '</div>' +
            '<div class="wc-ex-zh">' + esc(it.e.example_zh) + '</div>' +
            '<div class="dots">' + [0, 1, 2, 3, 4].map(function (i) {
              return '<i class="' + (i < m ? 'on' : '') + '"></i>';
            }).join('') + '</div>' +
            '</div>';
        }).join('') + '</div>';
      }
      return '' +
        '<div class="screen-inner">' +
        '  <div class="topbar">' +
        '    <button class="icon-btn" data-action="home">‹</button>' +
        '    <h2>' + esc(T('wordbook.title')) + '</h2>' +
        '    <span class="count">' + esc(T('wordbook.count', { n: items.length })) + '</span>' +
        '  </div>' +
        (items.length ? '  <p class="hint">' + esc(T('wordbook.summary', { n: items.length, h: highFreq })) + '</p>' : '') +
        '  <div class="scroll">' + body + '</div>' +
        (items.length ?
          '  <div class="btn-col sticky">' +
          '    <button class="btn btn-primary" data-action="review-top">' + esc(T('wordbook.top', { n: topCount })) + '</button>' +
          '    <button class="btn ghost" data-action="review">' + esc(T('wordbook.review')) + '</button>' +
          '    <button class="btn ghost small" data-action="export-wrong">' + esc(T('wordbook.export')) + '</button>' +
          '    <button class="btn ghost small" data-action="clear-wrong">' + esc(T('wordbook.clear')) + '</button>' +
          '  </div>' : '') +
        '</div>';
    },

    // ---------------- 学习报告 ----------------
    view_report: function (d) {
      var save = d.save;
      var st = save.stats;
      var seen = Object.keys(save.words).length;
      var mastered = srs.countMastered(save, lex.all());
      var acc = (st.totalCorrect + st.totalWrong) > 0
        ? Math.round(st.totalCorrect / (st.totalCorrect + st.totalWrong) * 100) : 0;
      var mins = Math.round((st.playSeconds || 0) / 60);
      var todayWords = 0;
      Object.keys(save.words).forEach(function (k) {
        if (util.todayKey(new Date(save.words[k].lastAt || 0)) === util.todayKey()) { todayWords += 1; }
      });
      var bands = ['primary', 'junior', 'senior', 'cet4', 'cet6'];
      var bars = bands.map(function (b) {
        var list = lex.bandEntries(b);
        if (!list.length) { return ''; }
        var bk = srs.buckets(save, list);
        var fp = Math.round((bk.fresh / bk.total) * 100);
        var lp = Math.round((bk.learning / bk.total) * 100);
        var mp = Math.max(0, 100 - fp - lp);
        return '<div class="band-row"><span class="band-name">' + esc(b.toUpperCase()) + '</span>' +
          '<span class="stack">' +
          '<i class="fresh" style="width:' + fp + '%"></i>' +
          '<i class="learning" style="width:' + lp + '%"></i>' +
          '<i class="mastered" style="width:' + mp + '%"></i>' +
          '</span>' +
          '<span class="band-pct">' + mp + '%</span></div>';
      }).join('');
      var legend = '<p class="legend"><span><i class="fresh"></i>' + esc(T('report.fresh')) + '</span>' +
        '<span><i class="learning"></i>' + esc(T('report.learning')) + '</span>' +
        '<span><i class="mastered"></i>' + esc(T('report.mastered')) + '</span></p>';

      return '' +
        '<div class="screen-inner">' +
        '  <div class="topbar">' +
        '    <button class="icon-btn" data-action="home">‹</button>' +
        '    <h2>' + esc(T('report.title')) + '</h2><span class="spacer"></span>' +
        '  </div>' +
        '  <div class="scroll">' +
        '    <div class="report-hero">' +
        '      <div><b>' + seen + '</b><span>' + esc(T('report.words')) + '</span></div>' +
        '      <div><b>' + mastered + '</b><span>' + esc(T('report.mastered')) + '</span></div>' +
        '      <div><b>' + acc + '%</b><span>' + esc(T('report.accuracy')) + '</span></div>' +
        '    </div>' +
        '    <div class="stat-grid small">' +
        '      <div><b>' + (st.sessions || 0) + '</b><span>' + esc(T('report.sessions')) + '</span></div>' +
        '      <div><b>' + mins + ' ' + esc(T('unit.min')) + '</b><span>' + esc(T('report.time')) + '</span></div>' +
        '      <div><b>×' + (st.maxCombo || 0) + '</b><span>' + esc(T('report.maxCombo')) + '</span></div>' +
        '      <div><b>' + srs.dueCount(save, lex.all()) + '</b><span>' + esc(T('report.dueShort')) + '</span></div>' +
        '    </div>' +
        '    <div class="panel">' +
        '      <h3>' + esc(T('report.daily')) + '</h3>' +
        '      <p class="line">' + esc(T('report.todayWords', { n: todayWords })) + '</p>' +
        '      <p class="line muted">' + esc(T('report.due', { n: srs.dueCount(save, lex.all()) })) + '</p>' +
        '    </div>' +
        '    <div class="panel">' +
        '      <h3>' + esc(T('report.trend')) + '</h3>' +
        (function () {
          var days = [];
          for (var i = 6; i >= 0; i--) {
            var dt = new Date();
            dt.setDate(dt.getDate() - i);
            var k = util.todayKey(dt);
            var rec = (save.dailyStats || {})[k] || { a: 0, c: 0 };
            days.push({ label: dt.getDate(), a: rec.a || 0, c: rec.c || 0 });
          }
          var max = 0;
          days.forEach(function (x) { if (x.a > max) { max = x.a; } });
          if (max === 0) {
            return '<p class="muted">' + esc(T('report.trendEmpty')) + '</p>';
          }
          return '<div class="trend">' + days.map(function (x) {
            var h = Math.round((x.a / max) * 100);
            var cw = x.a ? Math.round((x.c / x.a) * 100) : 0;
            if (!x.a) {
              return '<div class="trend-col"><div class="trend-bar"><i class="zero" style="height:2px"></i></div>' +
                '<span>' + x.label + '</span></div>';
            }
            return '<div class="trend-col"><div class="trend-bar"><i style="height:' + h + '%">' +
              '<b style="height:' + cw + '%"></b></i></div>' +
              '<span>' + x.label + '</span></div>';
          }).join('') + '</div>';
        })() +
        '      <p class="muted small-text">' + esc(T('report.trendHint')) + '</p>' +
        '    </div>' +
        '    <div class="panel">' +
        '      <h3>' + esc(T('report.byLevel')) + '</h3>' + bars + legend +
        '    </div>' +
        '    <p class="footnote">' + esc(T('report.note')) + '</p>' +
        '  </div>' +
        '</div>';
    },

    // ---------------- 设置 ----------------
    view_settings: function (d) {
      var s = d.save.settings;
      var goalNow = s.dailyGoal || 20;
      var noVoice = !WN.audio.hasVoice() && !(WN.audio.hasAudioPack && WN.audio.hasAudioPack());

      function langRow(field, current, hint) {
        var html = '<div class="panel">' +
          '<h3>' + esc(T(field === 'lang' ? 'settings.lang' : 'settings.meaningLang')) + '</h3>' +
          '<div class="mode-row">';
        // 界面语言支持全部语言；释义语言只有真正有词库的几种
        var langs = field === 'lang' ? WN.i18n.LANGS : lex.MEANING_LANGS;
        langs.forEach(function (l) {
          var ok = WN.i18n.available(l);
          html += '<button class="chip' + (current === l ? ' on' : '') + (ok ? '' : ' off') + '"'
            + (ok ? ' data-action="' + (field === 'lang' ? 'set-lang' : 'set-meaning-lang') + '" data-lang="' + l + '"' : ' disabled')
            + '>' + esc(LANG_NAMES[l]) + '</button>';
        });
        html += '</div>';
        if (hint) { html += '<p class="muted small-text">' + esc(hint) + '</p>'; }
        return html + '</div>';
      }

      return '' +
        '<div class="screen-inner">' +
        '  <div class="topbar">' +
        '    <button class="icon-btn" data-action="home">‹</button>' +
        '    <h2>' + esc(T('settings.title')) + '</h2><span class="spacer"></span>' +
        '  </div>' +
        '  <div class="scroll">' +
        '    <div class="panel rows">' +
        '      <label class="row"><span>' + esc(T('settings.sound')) + '</span>' +
        '        <input type="checkbox" data-setting="sound" ' + (s.sound ? 'checked' : '') + '></label>' +
        '      <label class="row"><span>' + esc(T('settings.voice')) + (noVoice ? ' ⚠️' : '') + '</span>' +
        '        <input type="checkbox" data-setting="voice" ' + (s.voice ? 'checked' : '') + '></label>' +
        '      <label class="row"><span>' + esc(T('settings.haptics')) + '</span>' +
        '        <input type="checkbox" data-setting="haptics" ' + (s.haptics ? 'checked' : '') + '></label>' +
        '    </div>' +
        (noVoice ? '<p class="warn">' + esc(T('settings.noVoice')) + '</p>' : '') +
        '    <div class="panel">' +
        '      <h3>' + esc(T('settings.dailyGoal')) + '</h3>' +
        '      <div class="mode-row">' +
        [10, 20, 30, 50].map(function (g) {
          return '<button class="chip' + (goalNow === g ? ' on' : '') + '" data-action="set-goal" data-goal="' + g + '">' + g + '</button>';
        }).join('') +
        '      </div>' +
        '      <p class="muted small-text">' + esc(T('settings.goalHint')) + '</p>' +
        '    </div>' +
        '    <div class="panel rows">' +
        '      <button class="row btn-row" data-action="test-voice">' + esc(T('settings.testVoice')) + '</button>' +
        '    </div>' +
        voiceDiag() +
        langRow('lang', s.lang) +
        langRow('meaning', s.meaningLang, T('settings.meaningHint')) +
        '    <div class="panel">' +
        '      <h3>' + esc(T('settings.speed')) + '</h3>' +
        '      <div class="seg">' +
        ['slow', 'normal', 'fast'].map(function (k) {
          return '<button class="seg-btn' + (s.speed === k ? ' on' : '') + '" data-action="set-speed" data-speed="' + k + '">'
            + esc(T('speed.' + k)) + '</button>';
        }).join('') +
        '      </div>' +
        '      <p class="muted small-text">' + esc(T('settings.speedHint')) + '</p>' +
        '    </div>' +
        '    <div class="panel rows">' +
        '      <button class="row btn-row" data-action="install-help">' + esc(T('settings.install')) + '</button>' +
        '      <button class="row btn-row" data-action="install-diag">安装诊断</button>' +
        '      <button class="row btn-row" data-action="onboard">' + esc(T('settings.onboard')) + '</button>' +
        '      <button class="row btn-row" data-action="export">' + esc(T('settings.export')) + '</button>' +
        '      <button class="row btn-row" data-action="import">' + esc(T('settings.import')) + '</button>' +
        '      <button class="row btn-row danger" data-action="reset">' + esc(T('settings.reset')) + '</button>' +
        '    </div>' +
        '    <div class="panel">' +
        '      <h3>' + esc(T('settings.about')) + '</h3>' +
        '      <p class="muted small-text">' + esc(T('settings.aboutText', { version: d.version || '0.3.0' })) + '</p>' +
        '    </div>' +
        '    <input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '  </div>' +
        '</div>';
    },

    // ---------------- 暂停 ----------------
    showPause: function (speed) {
      var host = Screens.root.querySelector('[data-screen="pause"]');
      if (!host) { return; }
      var cur = speed || 'normal';
      host.innerHTML = '' +
        '<div class="modal">' +
        '  <h3>' + esc(T('game.paused')) + '</h3>' +
        '  <div class="pause-speed">' +
        '    <span class="seg-label">' + esc(T('settings.speed')) + '</span>' +
        '    <div class="seg">' +
        ['slow', 'normal', 'fast'].map(function (k) {
          return '<button class="seg-btn' + (cur === k ? ' on' : '') + '" data-action="set-speed" data-speed="' + k + '">'
            + esc(T('speed.' + k)) + '</button>';
        }).join('') +
        '    </div>' +
        '  </div>' +
        '  <div class="btn-col">' +
        '    <button class="btn btn-primary" data-action="resume">' + esc(T('game.resume')) + '</button>' +
        '    <button class="btn ghost" data-action="quit">' + esc(T('game.quit')) + '</button>' +
        '  </div>' +
        '</div>';
      host.classList.add('active');
    },

    hidePause: function () {
      var host = Screens.root.querySelector('[data-screen="pause"]');
      if (host) { host.classList.remove('active'); host.innerHTML = ''; }
    },

    toast: function (msg) {
      var host = Screens.root.querySelector('[data-screen="toast"]');
      if (!host) { return; }
      host.textContent = msg;
      host.classList.add('show');
      clearTimeout(Screens._toastTimer);
      Screens._toastTimer = setTimeout(function () { host.classList.remove('show'); }, 2400);
    }
  };

  WN.screens = Screens;
})(typeof window !== 'undefined' ? window : globalThis);
