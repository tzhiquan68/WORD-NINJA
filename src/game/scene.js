/**
 * WORD NINJA — 游戏场景逻辑
 * 队列制：每个阶段把该等级全部单词排队，切中一个出队，切错/漏答的重新排队，
 * 直到队列清空（通关）或生命耗尽（失败，已切进度保留）。
 * 不触碰 DOM；渲染交给 render/hud，输入由 app 转发。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;
  var E = WN.entities;
  var srs = WN.srs;
  var store = WN.store;

  var SLICE_MIN_SPEED = 0.55;   // 逻辑像素 / 毫秒

  function Scene() {
    this.W = 1080;
    this.H = 1920;
    this.blade = WN.createBlade();
    this.reset();
  }

  Scene.prototype.reset = function () {
    this.cfg = null;
    this.save = null;
    this.phase = 'idle';        // idle | wave | resolve | over
    this.queue = [];
    this.currentEntry = null;
    this.currentQ = null;
    this.tiles = [];
    this.halves = [];
    this.particles = [];
    this.floats = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = 5;
    this.shake = 0;
    this.flash = { color: '#ff3b3b', alpha: 0 };
    this.paused = false;
    this.elapsed = 0;
    this.resolveTimer = 0;
    this.answered = 0;
    this.correctCount = 0;
    this.wrongEntries = [];
    this.learnedMap = {};
    this.xpGained = 0;
    this.bestAtStart = 0;
    this.newRecord = false;
    this.promptVisible = false;
    this.audioPrompt = false;
    this.lastResult = null;
    this.speakerPulse = 0;
    this.audioFailed = false;
    this.speedMul = 1;
    this.motion = 1;
    this.gravityScale = 1;
    this.clearedCount = 0;
    this.totalWords = 0;
    this.sessionCleared = {};
    this.isStage = false;
    this._pendingAudio = null;
    this.audioPromptDelay = 0;
    this.maxLives = 5;
    this.waveResolved = false;
  };

  Scene.prototype.setSize = function (W, H) {
    this.W = W;
    this.H = H;
  };

  /**
   * @param {object} cfg
   *   queue: 待切词条数组  totalWords  startCleared  buildQuestion(entry)
   *   mode  lang  save  kind('stage'|'daily'|'review')  stageId  lives
   *   bombRatio  speed  speedMul  measure  onEnd  onWordCleared
   */
  Scene.prototype.start = function (cfg) {
    this.reset();
    this.cfg = cfg;
    this.save = cfg.save;
    this.queue = (cfg.queue || []).slice();
    this.totalWords = cfg.totalWords || this.queue.length;
    this.clearedCount = cfg.startCleared || 0;
    this.isStage = cfg.kind === 'stage';
    this.lives = cfg.lives || 5;
    this.maxLives = this.lives;
    this.timeLimit = cfg.timeLimit || 0;
    this.timeLeft = this.timeLimit;
    this.combo = cfg.startCombo || 0;
    this.measure = cfg.measure || function (text, fs) { return text.length * fs * 0.58; };
    this.bestAtStart = this._bestFor(cfg);
    this.motion = (cfg.speed || 1) * (cfg.speedMul || 1);
    this.gravityScale = this.motion * this.motion;
    this.phase = 'wave';
    store.touchStreak(this.save);
    store.logEvent(this.save, 'stage_start', {
      stage: cfg.stageId, mode: cfg.mode, kind: cfg.kind, queue: this.queue.length
    });
    this._beginQuestion();
  };

  Scene.prototype._bestFor = function (cfg) {
    if (!cfg) { return 0; }
    if (cfg.kind === 'endless') { return (this.save.endless && this.save.endless.best) || 0; }
    if (!cfg.stageId) { return 0; }
    var rec = store.stageOf(this.save, cfg.mode, cfg.stageId);
    return rec.bestScore || 0;
  };

  // ---------------- 出题 ----------------

  Scene.prototype._beginQuestion = function () {
    if (!this.queue.length) { return this._endGame(true); }
    var entry = this.queue.shift();
    this.currentEntry = entry;
    this.currentQ = this.cfg.buildQuestion(entry);
    this.promptVisible = true;
    this.audioPrompt = this.currentQ.mode === 'audio';
    // 没有可用的离线语音（或云端语音没通过自检）时，直接从第一题就显示单词，不让人对着空白猜
    this.audioFailed = this.audioPrompt && !(WN.audio && WN.audio.canSpeak && WN.audio.canSpeak());
    this.phase = 'wave';
    this.waveResolved = false;
    this.spawnWave(this.currentQ);
    if (this.audioPrompt) {
      this.audioPromptDelay = 0.32;
      this._pendingAudio = function () { WN.audio.playWord(entry.word); };
    } else {
      this._pendingAudio = null;
    }
  };

  Scene.prototype.spawnWave = function (q) {
    var W = this.W, H = this.H;
    var cfg = this.cfg;
    var m = this.motion || 1;
    var baseG = H * 0.62;
    var n = q.options.length;
    var opts = q.options.slice();
    var i;

    var slots = [];
    for (i = 0; i < n; i++) {
      // 收窄横向范围：长释义（中日文/西语定义）本身很宽，横向铺开会互相压住
      slots.push(W * (0.30 + 0.40 * (n === 1 ? 0.5 : i / (n - 1))));
    }
    var jittered = util.shuffle(slots);

    for (i = 0; i < n; i++) {
      var o = opts[i];
      var fs = this.H * 0.041;
      var pad = fs * 0.55;
      var maxW = W * 0.62;
      var textW = this.measure(o.text, fs);
      if (textW + pad * 2 > maxW) {
        fs = Math.max(this.H * 0.026, fs * (maxW - pad * 2) / textW);
        pad = fs * 0.55;
        textW = this.measure(o.text, fs);
      }
      var w = Math.min(maxW, textW + pad * 2);
      var h = fs * 2.05;
      var x = util.clamp(jittered[i] + util.rand(-W * 0.04, W * 0.04), w / 2 + 14, W - w / 2 - 14);
      var vy = -Math.sqrt(2 * baseG * (0.56 * H)) * util.rand(0.97, 1.05) * m;
      this.tiles.push(E.createTile({
        kind: 'word',
        text: o.text,
        entry: o.entry,
        correct: !!o.correct,
        x: x,
        y: H + h * 0.9 + i * h * 1.35,
        vx: (W * 0.5 - x) * util.rand(0.16, 0.30),
        vy: vy,
        angle: util.rand(-0.18, 0.18),
        spin: util.rand(-0.55, 0.55) * (util.chance(0.5) ? 1 : -1),
        w: w, h: h, fs: fs,
        color: E.colorFor(o.entry.level),
        delay: i * 300
      }));
    }

    var bombRatio = (cfg.bombRatio === undefined ? 0.08 : cfg.bombRatio) * (this.lives <= 1 ? 0.4 : 1);
    if (util.chance(bombRatio)) {
      var bfs = this.H * 0.052;
      var bw = bfs * 1.9, bh = bfs * 1.9;
      var bx = util.rand(W * 0.24, W * 0.76);
      this.tiles.push(E.createTile({
        kind: 'bomb',
        text: '',
        correct: false,
        x: bx,
        y: H + bh,
        vx: (W * 0.5 - bx) * 0.2,
        vy: -Math.sqrt(2 * baseG * (0.5 * H)) * util.rand(0.9, 1.0) * m,
        angle: 0,
        spin: util.rand(-2.2, 2.2),
        w: bw, h: bh, fs: bfs,
        color: E.COLORS.bomb,
        delay: 320
      }));
    }

    // 金色奖励牌：切中加分，不影响对错判定、不推进题目
    if (util.chance(0.16)) {
      var gs = this.H * 0.056;
      var gw = gs * 1.75, gh = gs * 1.75;
      var gx = util.rand(W * 0.2, W * 0.8);
      this.tiles.push(E.createTile({
        kind: 'bonus',
        text: '',
        correct: false,
        x: gx,
        y: H + gh,
        vx: (W * 0.5 - gx) * 0.18,
        vy: -Math.sqrt(2 * baseG * (0.52 * H)) * util.rand(0.92, 1.02) * m,
        angle: 0,
        spin: util.rand(-1.6, 1.6),
        w: gw, h: gh, fs: gs,
        color: E.COLORS.bonus,
        delay: 260
      }));
    }
  };

  // ---------------- 推进 ----------------

  Scene.prototype.update = function (dt, now) {
    if (this.phase === 'idle' || this.phase === 'over' || this.paused) { return; }
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    if (this.timeLimit > 0 && this.phase === 'wave') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.timedOut = true;
        return this._endGame(false);
      }
    }
    var g = this.H * 0.62 * (this.gravityScale || 1);
    var i, t;

    if (this.audioPromptDelay > 0 && this._pendingAudio) {
      this.audioPromptDelay -= dt;
      if (this.audioPromptDelay <= 0) {
        this._pendingAudio();
        this._pendingAudio = null;
      }
    }
    if (this.speakerPulse > 0) { this.speakerPulse = Math.max(0, this.speakerPulse - dt * 2.2); }

    // 听力模式：发音链路不可用后，改成"显示单词"的降级玩法，而不是让人对着没声音的题猜
    if (this.audioPrompt && !this.audioFailed && WN.audio && WN.audio.canSpeak && !WN.audio.canSpeak()) {
      this.audioFailed = true;
      this.flash = { color: '#ffb066', alpha: 0.12 };
    }

    for (i = this.tiles.length - 1; i >= 0; i--) {
      t = this.tiles[i];
      E.updateTile(t, dt, g, this.W, this.H);
      if (t.dead) {
        var missed = (this.phase === 'wave' && !this.waveResolved &&
          t.correct && !t.sliced && t.entered);
        this.tiles.splice(i, 1);
        if (missed) { this._onMiss(this.currentEntry); }
      }
    }
    for (i = this.halves.length - 1; i >= 0; i--) {
      E.updateHalf(this.halves[i], dt, g);
      if (this.halves[i].dead) { this.halves.splice(i, 1); }
    }
    E.updateParticles(this.particles, dt, g);
    E.updateFloats(this.floats, dt);
    this.blade.prune(now);

    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.4); }
    if (this.flash.alpha > 0) { this.flash.alpha = Math.max(0, this.flash.alpha - dt * 2.0); }

    if (this.phase === 'resolve') {
      this.resolveTimer -= dt;
      if (this.resolveTimer <= 0) {
        if (this.lives <= 0) { return this._endGame(false); }
        if (!this.queue.length) { return this._endGame(true); }
        this._beginQuestion();
      }
    }
  };

  // ---------------- 切割 ----------------

  Scene.prototype.sliceSegment = function (seg) {
    if (this.phase !== 'wave' && this.phase !== 'resolve') { return; }
    if (this.paused) { return; }
    if (seg.speed < SLICE_MIN_SPEED) { return; }

    var hits = [];
    for (var i = 0; i < this.tiles.length; i++) {
      var t = this.tiles[i];
      if (t.sliced || t.delay > 0) { continue; }
      if (util.segRectHit(seg.x1, seg.y1, seg.x2, seg.y2, t.x, t.y, t.w / 2, t.h / 2, t.angle)) {
        hits.push(t);
      }
    }
    if (!hits.length) { return; }

    var correct = null, bomb = null, other = null, bonus = null;
    for (i = 0; i < hits.length; i++) {
      if (hits[i].kind === 'bonus') { bonus = bonus || hits[i]; }
      else if (hits[i].correct) { correct = hits[i]; }
      else if (hits[i].kind === 'bomb') { bomb = bomb || hits[i]; }
      else { other = other || hits[i]; }
    }

    // 奖励牌独立结算：加分，但不影响本题对错
    if (bonus) {
      this._sliceTile(bonus, seg);
      this._onBonus(bonus);
    }

    if (correct) {
      this._sliceTile(correct, seg);
      this._onCorrect(this.currentEntry, correct);
    } else if (bomb) {
      this._sliceTile(bomb, seg);
      this._onBomb(bomb);
    } else if (other) {
      this._sliceTile(other, seg);
      this._onWrong(this.currentEntry, other);
    }
  };

  Scene.prototype._sliceTile = function (t, seg) {
    if (t.sliced) { return; }
    t.sliced = true;
    t.dead = true;
    var isBonus = t.kind === 'bonus';
    if (!isBonus) { E.splitTile(t, seg, this.halves); }   // 奖励星不切两半，直接炸开
    E.spawnBurst(this.particles, t.x, t.y,
      t.kind === 'bomb' ? '#ffb066' : (isBonus ? '#ffd76a' : t.color.bottom),
      t.kind === 'bomb' ? 26 : (isBonus ? 18 : 16), this.H * 0.42, t.h * 0.075);
    E.spawnRing(this.particles, t.x, t.y,
      t.kind === 'bomb' ? 'rgba(255, 150, 90, 0.85)'
        : (isBonus ? 'rgba(255, 210, 110, 0.9)' : 'rgba(170, 240, 255, 0.75)'),
      t.h * (t.kind === 'bomb' ? 1.6 : 1.1));
    WN.audio.play('slice', { pitch: t.kind === 'bomb' ? -0.6 : (this.combo > 4 ? 0.5 : 0) });
    this._vibrate(12);
  };

  Scene.prototype._onBonus = function (tile) {
    var gain = 50;
    this.score += gain;
    this.xpGained += 2;
    this.bonusCount = (this.bonusCount || 0) + 1;
    E.addFloat(this.floats, tile.x, tile.y - tile.h * 0.6, '+' + gain, '#ffe07a', this.H * 0.040, -this.H * 0.12);
    E.spawnBurst(this.particles, tile.x, tile.y, '#ffd76a', 18, this.H * 0.5, tile.h * 0.08);
    E.spawnRing(this.particles, tile.x, tile.y, 'rgba(255, 214, 120, 0.9)', tile.h * 0.7);
    WN.audio.play('bonus');
    this._vibrate(14);
    store.logEvent(this.save, 'bonus', { score: this.score });
  };

  Scene.prototype._fadeTile = function (t) {
    if (t.delay > 0) { t.dead = true; return; }
    if (!t.exiting) { t.exiting = true; t.exitT = 0; }
  };

  Scene.prototype._fadeOthers = function (except) {
    for (var i = 0; i < this.tiles.length; i++) {
      var t = this.tiles[i];
      // 奖励星不跟着淡出，让它自然飞过
      if (t !== except && !t.sliced && t.kind !== 'bonus') { this._fadeTile(t); }
    }
  };

  Scene.prototype._requeue = function (entry) {
    if (!entry) { return; }
    this.queue.push(entry);
  };

  // ---------------- 判定 ----------------

  Scene.prototype._multiplier = function () {
    return Math.min(5, 1 + Math.floor(this.combo / 3));
  };

  Scene.prototype._onCorrect = function (entry, tile) {
    if (this.waveResolved) { return; }
    this.waveResolved = true;
    this.answered += 1;
    this.correctCount += 1;
    var mult = this._multiplier();
    var gain = 100 * mult;
    this.score += gain;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.xpGained += 10;
    this.learnedMap[entry.key] = entry;
    this.clearedCount += 1;
    this.sessionCleared[entry.key] = true;

    srs.record(this.save, entry.key, true);
    var w = srs.get(this.save, entry.key);
    if (w && w.mastery >= 2) { store.removeWrong(this.save, entry.key); }
    if (this.cfg.onWordCleared) { this.cfg.onWordCleared(entry); }
    store.logEvent(this.save, 'answer', { k: entry.key, ok: true, mult: mult });

    E.addFloat(this.floats, tile.x, tile.y - tile.h * 0.5, '+' + gain, '#c9ffe0', this.H * 0.046, -this.H * 0.14);
    if (mult > 1) {
      E.addFloat(this.floats, this.W * 0.5, this.H * 0.44, 'COMBO ×' + mult, '#ffd76a', this.H * 0.046, -this.H * 0.05);
      WN.audio.play('combo');
    }
    WN.audio.play('correct');
    this._vibrate(18);
    this.flash = { color: '#7dffa8', alpha: 0.12 };
    this._fadeOthers(tile);
    this._afterAnswer(0.5);
  };

  Scene.prototype._onWrong = function (target, tile) {
    if (this.waveResolved) { return; }
    this.waveResolved = true;
    this.answered += 1;
    this.lives -= 1;
    this.combo = 0;
    srs.record(this.save, target.key, false);
    store.addWrong(this.save, target.key);
    store.logEvent(this.save, 'answer', { k: target.key, ok: false, confusedWith: tile.entry && tile.entry.key });
    if (this.wrongEntries.indexOf(target) < 0) { this.wrongEntries.push(target); }
    this._requeue(target);

    E.addFloat(this.floats, tile.x, tile.y - tile.h * 0.4, '✗', '#ff8d8d', this.H * 0.06, -this.H * 0.1);
    E.spawnRing(this.particles, tile.x, tile.y, 'rgba(255, 120, 120, 0.7)', tile.h * 0.9);
    this.flash = { color: '#ff3b3b', alpha: 0.35 };
    this.shake = 0.9;
    WN.audio.play('wrong');
    this._vibrate(60);
    this._fadeOthers(tile);
    this._afterAnswer(0.85);
  };

  Scene.prototype._onMiss = function (entry) {
    if (this.waveResolved) { return; }
    this.waveResolved = true;
    this.answered += 1;
    this.lives -= 1;
    this.combo = 0;
    srs.record(this.save, entry.key, false);
    store.addWrong(this.save, entry.key);
    store.logEvent(this.save, 'answer', { k: entry.key, ok: false, miss: true });
    if (this.wrongEntries.indexOf(entry) < 0) { this.wrongEntries.push(entry); }
    this._requeue(entry);

    E.addFloat(this.floats, this.W * 0.5, this.H * 0.62, 'MISS', '#ff9a9a', this.H * 0.05, -this.H * 0.08);
    this.flash = { color: '#ff3b3b', alpha: 0.28 };
    this.shake = 0.7;
    WN.audio.play('wrong');
    this._vibrate(50);
    this._fadeOthers(null);
    this._afterAnswer(0.8);
  };

  Scene.prototype._onBomb = function (tile) {
    if (this.waveResolved) { return; }
    this.lives -= 1;
    this.combo = 0;
    this.flash = { color: '#ffa040', alpha: 0.5 };
    this.shake = 1.4;
    E.spawnBurst(this.particles, tile.x, tile.y, '#ffcc66', 40, this.H * 0.72, tile.h * 0.09);
    E.spawnBurst(this.particles, tile.x, tile.y, '#ff7a3d', 26, this.H * 0.5, tile.h * 0.12);
    E.addFloat(this.floats, tile.x, tile.y - tile.h * 0.5, '-1', '#ffb08a', this.H * 0.05, -this.H * 0.1);
    WN.audio.play('bomb');
    this._vibrate([30, 40, 60]);
    store.logEvent(this.save, 'bomb', { lives: this.lives });
    if (this.lives <= 0) {
      this.waveResolved = true;
      this._afterAnswer(0.9);
    }
  };

  Scene.prototype._afterAnswer = function (delay) {
    // 本题结束就掐掉还没播完的发音，避免下一题听到上一题的词
    this._pendingAudio = null;
    this.audioPromptDelay = 0;
    if (this.audioPrompt) { WN.audio.stopSpeak(); }
    this.phase = 'resolve';
    this.resolveTimer = delay;
    this.promptVisible = false;
  };

  // ---------------- 结束 ----------------

  Scene.prototype._endGame = function (win) {
    if (this.phase === 'over') { return; }
    this.phase = 'over';
    var cfg = this.cfg;
    var save = this.save;
    var answered = Math.max(1, this.answered);
    var accuracy = this.correctCount / answered;
    var stars = 0;
    if (win) { stars = accuracy >= 0.9 ? 3 : (accuracy >= 0.7 ? 2 : 1); }

    save.stats.sessions += 1;
    save.stats.playSeconds += Math.round(this.elapsed);
    save.stats.totalCorrect += this.correctCount;
    save.stats.totalWrong += (this.answered - this.correctCount);
    save.stats.maxCombo = Math.max(save.stats.maxCombo || 0, this.maxCombo);
    store.addXp(save, this.xpGained);

    this.newRecord = this.score > this.bestAtStart;

    if (cfg.kind === 'stage' && cfg.stageId) {
      var rec = store.stageOf(save, cfg.mode, cfg.stageId);
      rec.total = this.totalWords;
      rec.bestScore = Math.max(rec.bestScore || 0, this.score);
      rec.stars = Math.max(rec.stars || 0, stars);
      rec.updatedAt = Date.now();
      rec.clearedCount = this.clearedCount;
    }
    if (cfg.kind === 'daily') {
      var today = util.todayKey();
      if (save.daily.date !== today) {
        save.daily = { date: today, score: 0, done: false, attempts: 0, streak: save.daily.streak || 0 };
      }
      save.daily.attempts = (save.daily.attempts || 0) + 1;
      if (win) { save.daily.done = true; }
      save.daily.score = Math.max(save.daily.score || 0, this.score);
      // 连续完成奖励：连续天数越多，额外经验越多（每天只发一次）
      if (win && !save.daily.rewarded) {
        var streak = Math.max(1, save.profile.streakDays || 1);
        var bonusXp = 20 + 10 * Math.min(streak, 5);
        store.addXp(save, bonusXp);
        save.daily.rewarded = true;
        save.daily.streak = streak;
        this.dailyBonus = { streak: streak, xp: bonusXp };
      }
    }

    store.logEvent(save, 'stage_end', {
      stage: cfg.stageId, mode: cfg.mode, win: win, cleared: this.clearedCount,
      total: this.totalWords, score: this.score, accuracy: Math.round(accuracy * 100)
    });
    store.save(save);

    this.lastResult = {
      kind: cfg.kind,
      stageId: cfg.stageId,
      levelNo: cfg.levelNo || 0,
      mode: cfg.mode,
      win: win,
      score: this.score,
      best: Math.max(this.bestAtStart, this.score),
      newRecord: this.newRecord,
      correct: this.correctCount,
      wrong: this.answered - this.correctCount,
      total: this.answered,
      accuracy: accuracy,
      maxCombo: this.maxCombo,
      stars: stars,
      xpGained: this.xpGained,
      cleared: this.clearedCount,
      totalWords: this.totalWords,
      timedOut: !!this.timedOut,
      timeLimit: this.timeLimit,
      boss: !!cfg.boss,
      dailyBonus: this.dailyBonus || null,
      wrongEntries: this.wrongEntries.slice(),
      learned: Object.keys(this.learnedMap).map(function (k) { return this.learnedMap[k]; }, this)
    };
    WN.audio.play(win ? 'win' : 'lose');
    if (cfg.onEnd) { cfg.onEnd(this.lastResult); }
  };

  Scene.prototype.quit = function () {
    this.phase = 'over';
    WN.audio.stopSpeak();
  };

  Scene.prototype._vibrate = function (pattern) {
    if (!this.save || !this.save.settings.haptics) { return; }
    try {
      if (root.navigator && root.navigator.vibrate) { root.navigator.vibrate(pattern); }
    } catch (e) { /* ignore */ }
  };

  Scene.prototype.progress = function () {
    return { cleared: Math.min(this.clearedCount, this.totalWords), total: this.totalWords };
  };

  Scene.prototype.replayPrompt = function () {
    if (!this.currentEntry) { return; }
    WN.audio.playWord(this.currentEntry.word);
    this.speakerPulse = 1;
  };

  WN.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
