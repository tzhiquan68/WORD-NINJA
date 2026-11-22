/**
 * 拼写挑战：看释义 / 听发音，把单词拼出来。
 * 与切词共享同一套阶段与关卡结构（每关 20 词，全对才过关）。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function T(key, vars) {
    return WN.i18n ? WN.i18n.t(key, vars) : key;
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  var LIVES = 5;
  var timerId = null;

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.ceil(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function paintTimer() {
    var st = spell.st;
    if (!st || !spell.root) { return; }
    var el = spell.root.querySelector('.spell-timer');
    if (!el) { return; }
    el.textContent = '⏱ ' + fmtTime(st.timeLeft);
    el.classList.toggle('danger', st.timeLeft <= 15);
  }

  function startTimer() {
    stopTimer();
    paintTimer();
    timerId = setInterval(function () {
      var st = spell.st;
      if (!st || st.finished) { stopTimer(); return; }
      st.timeLeft = Math.max(0, st.timeLeft - 0.25);
      paintTimer();
      if (st.timeLeft <= 0) {
        st.timedOut = true;
        stopTimer();
        finish(false);
      }
    }, 250);
  }

  var spell = {
    root: null,
    st: null,

    mount: function (el) {
      spell.root = el;
      spell.root.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) { return; }
        var a = btn.getAttribute('data-action');
        if (a === 'spell-hear') { if (spell.st && spell.st.entry) { WN.audio.playWord(spell.st.entry.word); } }
        else if (a === 'spell-hint') { spell.hint(); }
        else if (a === 'spell-submit') { spell.submit(); }
        else if (a === 'spell-quit') { spell.quit(); }
      });
      spell.root.addEventListener('input', function (e) {
        if (!e.target || !e.target.classList || !e.target.classList.contains('spell-input')) { return; }
        spell.onInput(e.target.value);
      });
      spell.root.addEventListener('keydown', function (e) {
        if (!e.target || !e.target.classList || !e.target.classList.contains('spell-input')) { return; }
        if (e.key === 'Enter') { e.preventDefault(); spell.submit(); }
      });
    },

    /**
     * @param {object} cfg {mode, worldName, levelNo, queue, total, lives, meaningLang,
     *                      timeLimit, boss, onCleared, onWrong, onEnd, onQuit, onNext}
     */
    start: function (cfg) {
      var queue = (cfg.queue || []).slice();
      if (!queue.length) { return false; }
      spell.st = {
        cfg: cfg,
        queue: queue,
        index: 0,
        entry: queue[0],
        typed: '',
        revealed: 0,
        lives: cfg.lives || LIVES,
        wrongOnWord: 0,
        hints: 0,
        score: 0,
        cleared: 0,
        mistakes: 0,
        wrongList: [],
        meaningShown: false,
        timeLimit: cfg.timeLimit || 0,
        timeLeft: cfg.timeLimit || 0,
        timedOut: false,
        finished: false,
        startedAt: Date.now()
      };
      renderQuestion();
      WN.audio.playWord(spell.st.entry.word);
      if (spell.st.timeLimit > 0) { startTimer(); }
      return true;
    },

    stop: function () {
      stopTimer();
      spell.st = null;
      if (spell.root) { spell.root.innerHTML = ''; }
      WN.audio.stopSpeak();
    },

    quit: function () {
      var cfg = spell.st && spell.st.cfg;
      spell.stop();
      if (cfg && cfg.onQuit) { cfg.onQuit(); }
    },

    onInput: function (raw) {
      var st = spell.st;
      if (!st || st.finished) { return; }
      var word = st.entry.word;
      var letters = norm(word);
      var v = norm(raw).slice(0, letters.length);
      st.typed = v;
      updateSlots();
      if (v.length === letters.length) {
        setTimeout(function () { if (spell.st === st) { spell.submit(); } }, 90);
      }
    },

    hint: function () {
      var st = spell.st;
      if (!st || st.finished) { return; }
      var letters = norm(st.entry.word);
      if (st.typed.length >= letters.length) { return; }
      st.typed = letters.slice(0, st.typed.length + 1);
      st.revealed = st.typed.length;
      st.hints += 1;
      st.score = Math.max(0, st.score - 5);
      var input = spell.root.querySelector('.spell-input');
      if (input) { input.value = st.typed; }
      updateSlots();
      if (st.typed.length === letters.length) { spell.submit(); }
    },

    submit: function () {
      var st = spell.st;
      if (!st || st.finished) { return; }
      var letters = norm(st.entry.word);
      var v = norm(st.typed);
      if (!v) { return; }
      if (v === letters) { correct(); } else { wrong(); }
    }
  };

  function slotHtml(st) {
    var word = st.entry.word;
    var letters = norm(word);
    var out = '';
    var li = 0;
    for (var i = 0; i < word.length; i++) {
      var ch = word[i];
      if (ch === ' ' || ch === '-') {
        out += '<span class="spell-slot gap"></span>';
        continue;
      }
      var typedCh = st.typed[li];
      var shown = typedCh || (li < st.revealed ? letters[li] : '');
      var cls = 'spell-slot';
      if (typedCh) { cls += ' filled'; if (typedCh !== letters[li]) { cls += ' wrong'; } }
      else if (li < st.revealed) { cls += ' hinted'; }
      if (li === st.typed.length) { cls += ' caret'; }
      out += '<span class="' + cls + '">' + esc(shown) + '</span>';
      li++;
    }
    return out;
  }

  function updateSlots() {
    var st = spell.st;
    var box = spell.root.querySelector('.spell-slots');
    if (!box || !st) { return; }
    box.innerHTML = slotHtml(st);
  }

  function renderQuestion() {
    var st = spell.st;
    if (!st || !spell.root) { return; }
    var e = st.entry;
    var lang = (st.cfg && st.cfg.meaningLang) || 'zh';
    var meaning = WN.lexicon ? WN.lexicon.meaningOf(e, lang) : (e.zh || '');
    var dictate = (st.cfg && st.cfg.mode) === 'dictate';
    var showMeaning = !dictate || !!st.meaningShown;
    var total = st.cfg.total || st.queue.length;
    var pct = Math.round((st.cleared / Math.max(1, total)) * 100);
    var hearts = '';
    for (var i = 0; i < (st.cfg.lives || LIVES); i++) {
      hearts += '<span class="' + (i < st.lives ? '' : 'dead') + '">❤</span>';
    }

    spell.root.innerHTML =
      '<div class="spell-wrap">' +
      '  <div class="spell-top">' +
      '    <button class="icon-btn" data-action="spell-quit" aria-label="' + esc(T('common.back')) + '">‹</button>' +
      '    <div class="spell-title">' + esc(st.cfg.boss
        ? T('boss.level')
        : (T('game.mode.' + (st.cfg.mode || 'spell')) + ' · ' + esc(st.cfg.worldName || '') +
           ' · ' + T('stage.level', { n: st.cfg.levelNo || 1 }))) + '</div>' +
      '    <div class="spell-lives">' + hearts + '</div>' +
      (st.timeLimit > 0 ? '    <div class="spell-timer">⏱ ' + fmtTime(st.timeLeft) + '</div>' : '') +
      '  </div>' +
      '  <div class="spell-progress"><i style="width:' + pct + '%"></i></div>' +
      '  <div class="spell-card">' +
      '    <div class="spell-pos">' + esc(dictate && !showMeaning ? '' : (e.pos || '')) + '</div>' +
      '    <div class="spell-meaning' + (showMeaning ? '' : ' muted') + '">' +
      esc(showMeaning ? meaning : T('spell.listenOnly')) + '</div>' +
      '    <button class="spell-hear" data-action="spell-hear">🔊 ' + esc(T('spell.hear')) + '</button>' +
      '    <div class="spell-slots">' + slotHtml(st) + '</div>' +
      '    <input class="spell-input" type="text" inputmode="latin" autocomplete="off" autocapitalize="none"' +
      '      autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="' + esc(T('spell.input')) + '">' +
      '  </div>' +
      '  <div class="spell-tip">' + esc(T(dictate ? 'spell.tipDictate' : 'spell.tip')) + '</div>' +
      '  <div class="spell-actions">' +
      '    <button class="btn ghost" data-action="spell-hint">' + esc(T('spell.hint')) + '</button>' +
      '    <button class="btn primary" data-action="spell-submit">' + esc(T('spell.submit')) + '</button>' +
      '  </div>' +
      '</div>';

    var input = spell.root.querySelector('.spell-input');
    if (input) {
      input.value = st.typed;
      try { input.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }
  }

  function correct() {
    var st = spell.st;
    var word = norm(st.entry.word);
    var gain = Math.max(20, 100 - st.hints * 20 - st.wrongOnWord * 25);
    st.score += gain;
    st.cleared += 1;
    WN.audio.play('correct');
    if (st.cfg.onCleared) { st.cfg.onCleared(st.entry); }
    var tip = spell.root.querySelector('.spell-tip');
    if (tip) {
      tip.className = 'spell-tip ok';
      tip.textContent = T('spell.correct', { word: st.entry.word, points: gain });
    }
    setTimeout(function () {
      if (spell.st !== st) { return; }
      st.index += 1;
      if (st.index >= st.queue.length) { finish(true); return; }
      st.entry = st.queue[st.index];
      st.typed = '';
      st.revealed = 0;
      st.wrongOnWord = 0;
      st.hints = 0;
      st.meaningShown = false;
      renderQuestion();
      WN.audio.playWord(st.entry.word);
    }, 620);
  }

  function wrong() {
    var st = spell.st;
    st.wrongOnWord += 1;
    st.mistakes += 1;
    if (st.wrongOnWord === 1) {
      st.wrongList.push({ word: st.entry.word, meaning: WN.lexicon ? WN.lexicon.meaningOf(st.entry, 'zh') : '', key: st.entry.key });
      if (st.cfg.onWrong) { st.cfg.onWrong(st.entry); }
    }
    st.lives -= 1;
    WN.audio.play('wrong');
    st.typed = '';
    var input = spell.root.querySelector('.spell-input');
    if (input) { input.value = ''; }
    updateSlots();
    var hearts = spell.root.querySelector('.spell-lives');
    if (hearts) {
      var hs = '';
      for (var i = 0; i < (st.cfg.lives || LIVES); i++) {
        hs += '<span class="' + (i < st.lives ? '' : 'dead') + '">❤</span>';
      }
      hearts.innerHTML = hs;
    }
    var tip = spell.root.querySelector('.spell-tip');
    if (tip) {
      tip.className = 'spell-tip bad';
      tip.textContent = st.lives > 0
        ? T('spell.wrongTip', { n: st.entry.word.length })
        : T('spell.noLives');
    }
    // 听写模式：拼错一次就把释义露出来，避免一直盲猜
    if (st.cfg.mode === 'dictate' && !st.meaningShown) {
      st.meaningShown = true;
      var mEl = spell.root.querySelector('.spell-meaning');
      if (mEl) {
        mEl.classList.remove('muted');
        mEl.textContent = WN.lexicon ? WN.lexicon.meaningOf(st.entry, st.cfg.meaningLang || 'zh') : (st.entry.zh || '');
      }
      var posEl = spell.root.querySelector('.spell-pos');
      if (posEl) { posEl.textContent = st.entry.pos || ''; }
    }
    if (st.lives <= 0) {
      setTimeout(function () { if (spell.st === st) { finish(false); } }, 700);
    }
  }

  function finish(win) {
    var st = spell.st;
    if (!st || st.finished) { return; }
    st.finished = true;
    stopTimer();
    var total = st.cfg.total || st.queue.length;
    var acc = Math.round((st.cleared / Math.max(1, total)) * 100);
    var stars = acc >= 100 ? 3 : (acc >= 80 ? 2 : (acc >= 50 ? 1 : 0));
    var used = Math.max(1, Math.round((Date.now() - st.startedAt) / 1000));
    var result = {
      win: win,
      score: st.score,
      cleared: st.cleared,
      total: total,
      mistakes: st.mistakes,
      accuracy: acc,
      stars: stars,
      seconds: used,
      wrongList: st.wrongList.slice(),
      levelNo: st.cfg.levelNo || 1,
      mode: st.cfg.mode || 'spell',
      boss: !!st.cfg.boss,
      timedOut: !!st.timedOut
    };
    if (st.cfg.onEnd) { st.cfg.onEnd(result); }
    renderResult(result);
  }

  function renderResult(r) {
    if (!spell.root) { return; }
    var wrong = r.wrongList.map(function (w) {
      return '<div><b>' + esc(w.word) + '</b>' + esc(w.meaning) + '</div>';
    }).join('');
    var head = r.boss
      ? T(r.win ? 'result.bossWin' : 'boss.lose')
      : T(r.win ? 'spell.result.win' : 'spell.result.lose');
    spell.root.innerHTML =
      '<div class="spell-wrap"><div class="spell-result">' +
      '  <h2>' + esc(head) + '</h2>' +
      (r.timedOut ? '  <p class="muted">' + esc(T('result.timeout')) + '</p>' : '') +
      (r.title ? '  <div class="title-badge">🏅 ' + esc(T('result.titleGot')) + '：<b>' + esc(r.title) + '</b></div>' : '') +
      '  <div class="stars">' + '★★★'.slice(0, r.stars) + '☆☆☆'.slice(0, 3 - r.stars) + '</div>' +
      '  <div class="stats">' +
      '    <div><b>' + r.score + '</b>' + esc(T('result.score')) + '</div>' +
      '    <div><b>' + r.cleared + '/' + r.total + '</b>' + esc(T('spell.cleared')) + '</div>' +
      '    <div><b>' + r.mistakes + '</b>' + esc(T('spell.mistakes')) + '</div>' +
      '    <div><b>' + r.seconds + 's</b>' + esc(T('result.time')) + '</div>' +
      '  </div>' +
      (wrong ? '<div class="spell-wrong">' + wrong + '</div>' : '') +
      '  <div class="spell-actions">' +
      '    <button class="btn ghost" data-action="spell-quit">' + esc(T('common.back')) + '</button>' +
      '    <button class="btn primary" data-action="spell-next">' + esc(r.win ? T('result.nextLevel') : T('spell.retry')) + '</button>' +
      '  </div>' +
      '</div></div>';

    var next = spell.root.querySelector('[data-action="spell-next"]');
    if (next) {
      next.addEventListener('click', function () {
        var cfg = spell.st && spell.st.cfg;
        if (cfg && cfg.onNext) { cfg.onNext(r); }
      });
    }
  }

  WN.spell = spell;
})(typeof window !== 'undefined' ? window : globalThis);
