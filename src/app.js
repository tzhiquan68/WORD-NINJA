/**
 * WORD NINJA — 应用外壳：路由、画布、输入、阶段生命周期
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;
  var lex = WN.lexicon;
  var store = WN.store;
  var render = WN.render;
  var hud = WN.hud;
  var screens = WN.screens;
  var srs = WN.srs;
  var T = function (k, v) { return WN.i18n.t(k, v); };

  var VERSION = '2.7.0';
  var VW = 1080;
  var SPEED_MUL = { slow: 0.78, normal: 1, fast: 1.3 };
  var STAGE_LIVES = 5;

  var App = {
    version: VERSION,
    save: null,
    scene: null,
    canvas: null,
    ctx: null,
    ui: null,
    route: 'home',
    mode: 'classic',
    W: VW,
    H: 1920,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cssW: 0,
    cssH: 0,
    dpr: 1,
    lastConfig: null,
    _raf: null,
    _last: 0,
    _running: false
  };

  // ---------------- 启动 ----------------

  App.boot = function () {
    App.canvas = document.getElementById('game');
    App.ctx = App.canvas.getContext('2d');
    App.ui = document.getElementById('ui');

    App.save = store.load();
    WN.i18n.setLang(App.save.settings.lang || 'zh');
    WN.audio.setEnabled(!!App.save.settings.sound);
    WN.audio.setVoiceEnabled(!!App.save.settings.voice);

    var ok = lex.init();
    // 预热卡片贴图（逐像素烘焙一次，之后都是贴图合成）
    if (WN.sprite && WN.entities) { WN.sprite.warm(WN.entities.COLORS); }
    screens.mount(App.ui);
    screens.onAction = App.handleAction;
    if (WN.spell) { WN.spell.mount(document.getElementById('spell-root')); }

    App.scene = new WN.Scene();
    App.bindInput();
    App.resize();

    if (!ok) {
      screens.render('home', { save: App.save, version: VERSION });
      screens.toast(T('toast.noWords'));
    } else {
      App.go('home');
      setTimeout(function () { App.showOnboard(false); }, 400);
    }

    WN.audio.initVoices();
    WN.audio.probePack();
    document.addEventListener('wn:voices', function () {
      if (App.route === 'settings') { App.go('settings'); }
    });

    // PWA：可以安装时在页面底部出现一个"安装到桌面"按钮
    var installEvent = null;
    var installChip = null;
    function removeInstallChip() {
      if (installChip && installChip.parentNode) { installChip.parentNode.removeChild(installChip); }
      installChip = null;
    }
    root.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      root.__bip = true;
      installEvent = e;
      if (installChip) { return; }
      installChip = document.createElement('button');
      installChip.className = 'install-chip';
      installChip.textContent = T('home.install');
      installChip.addEventListener('click', function () {
        if (!installEvent) { return; }
        installEvent.prompt();
        installEvent = null;
        removeInstallChip();
      });
      document.body.appendChild(installChip);
    });
    root.addEventListener('appinstalled', function () {
      installEvent = null;
      removeInstallChip();
      screens.toast(T('home.installed'));
    });

    // iOS 没有 beforeinstallprompt：给一张"添加到主屏幕"的引导卡片
    function isIos() {
      return /iphone|ipad|ipod/i.test(root.navigator.userAgent || '');
    }
    function isStandalone() {
      try {
        if (root.navigator.standalone) { return true; }
        return !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
      } catch (e) { return false; }
    }
    App.showInstallHelp = function (force) {
      if (!force && (isStandalone() || (App.save.settings && App.save.settings.installHintDone))) { return; }
      var old = document.querySelector('.install-card');
      if (old && old.parentNode) { old.parentNode.removeChild(old); }
      var el = document.createElement('div');
      el.className = 'install-card';
      el.innerHTML =
        '<div class="install-inner">' +
        '  <div class="install-ico">📲</div>' +
        '  <div class="install-txt">' +
        '    <b>' + T('install.title') + '</b>' +
        '    <span>' + (isIos() ? T('install.ios') : T('install.android')) + '</span>' +
        '  </div>' +
        '  <button class="install-x" aria-label="' + T('install.gotIt') + '">✕</button>' +
        '</div>';
      el.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.install-x')) { return; }
        App.save.settings.installHintDone = true;
        store.save(App.save);
        if (el.parentNode) { el.parentNode.removeChild(el); }
      });
      document.body.appendChild(el);
      setTimeout(function () { el.classList.add('in'); }, 20);
    };
    setTimeout(function () { App.showInstallHelp(false); }, 1800);

    /** PWA 安装诊断：把"为什么装不上"变成可读的清单 */
    App.showPwaDiag = function () {
      var old = document.querySelector('.pwa-diag');
      if (old && old.parentNode) { old.parentNode.removeChild(old); }
      var el = document.createElement('div');
      el.className = 'pwa-diag';
      el.innerHTML = '<div class="pwa-diag-box"><h3>安装诊断</h3><div class="pwa-lines">检测中…</div>' +
        '<button class="btn ghost" data-diag-close>关闭</button></div>';
      document.body.appendChild(el);
      el.addEventListener('click', function (e) {
        if (e.target.hasAttribute && e.target.hasAttribute('data-diag-close')) {
          el.parentNode.removeChild(el);
        }
      });

      var lines = [];
      function ok(b) { return b ? '✅' : '❌'; }
      lines.push(ok(location.protocol === 'https:') + ' 协议：' + location.protocol + '（安装需要 https）');
      lines.push(ok(!!root.isSecureContext) + ' 安全上下文：' + (root.isSecureContext ? '是' : '否'));
      lines.push(ok(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) +
        ' 已是独立窗口（standalone）');

      var link = document.querySelector('link[rel="manifest"]');
      lines.push(ok(!!link) + ' manifest 已注入：' + (link ? link.href : '无'));

      var linesEl = el.querySelector('.pwa-lines');
      linesEl.textContent = lines.join('\n');

      function addLine(s) { linesEl.textContent += '\n' + s; }

      if (link) {
        fetch(link.href).then(function (r) {
          return r.json().then(function (j) {
            addLine(ok(r.ok) + ' manifest 可读取：' + r.status + ' · display=' + j.display +
              ' · 图标 ' + (j.icons || []).length + ' 个');
          });
        }).catch(function (e) {
          addLine('❌ manifest 读取失败：' + e.message);
        });
      }

      if (!('serviceWorker' in navigator)) {
        addLine('❌ 不支持 Service Worker');
      } else {
        addLine('… Service Worker 检测中');
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          addLine(ok(rs.length > 0) + ' Service Worker 已注册：' + rs.length + ' 个' +
            (rs[0] ? ' · scope=' + rs[0].scope.replace(location.origin, '') : ''));
          addLine(ok(!!navigator.serviceWorker.controller) + ' 当前页面已被 SW 接管');
          if (!rs.length) { addLine('提示：SW 未注册通常是证书不被信任（页面不是安全上下文）'); }
        }).catch(function (e) { addLine('❌ SW 查询失败：' + e.message); });
      }

      addLine((root.__bip ? '✅' : '❌') + ' 已触发 beforeinstallprompt（触发后才会有「安装应用」菜单）');
      addLine('浏览器：' + (navigator.userAgent || '').replace(/\s+/g, ' ').slice(0, 120));
      addLine('⚠️ 安卓 Chrome 要求证书由系统信任；自签 CA 装入后若仍是"不安全"，安装入口不会出现。');
    };
    root.addEventListener('resize', function () { App.resize(); });
    root.addEventListener('orientationchange', function () { setTimeout(App.resize, 180); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && App.route === 'game' && !App.scene.paused) { App.pauseGame(); }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && App.route === 'game') {
        if (App.scene.paused) { App.resumeGame(); } else { App.pauseGame(); }
      }
    });

    App._last = util.now();
    App._running = true;
    App._raf = requestAnimationFrame(App.frame);
    App.startFromQuery();
  };

  // ---------------- 尺寸 ----------------

  App.resize = function () {
    var cssW = root.innerWidth || 1080;
    var cssH = root.innerHeight || 1920;
    App.cssW = cssW;
    App.cssH = cssH;
    App.dpr = Math.min(2, root.devicePixelRatio || 1);

    App.canvas.width = Math.round(cssW * App.dpr);
    App.canvas.height = Math.round(cssH * App.dpr);
    App.canvas.style.width = cssW + 'px';
    App.canvas.style.height = cssH + 'px';

    App.H = util.clamp(VW * (cssH / cssW), 1400, 2400);
    App.scale = Math.min(cssW / VW, cssH / App.H);
    App.offsetX = (cssW - VW * App.scale) / 2;
    App.offsetY = (cssH - App.H * App.scale) / 2;

    if (App.scene) { App.scene.setSize(VW, App.H); }
    render.invalidateBackground();
  };

  App.toLogical = function (clientX, clientY) {
    return {
      x: (clientX - App.offsetX) / App.scale,
      y: (clientY - App.offsetY) / App.scale
    };
  };

  App.measure = function (text, fs) {
    App.ctx.save();
    App.ctx.font = render.font(fs);
    var w = App.ctx.measureText(text).width;
    App.ctx.restore();
    return w;
  };

  // ---------------- 输入 ----------------

  App.bindInput = function () {
    var cv = App.canvas;
    var pressed = {};

    function pt(e) {
      var r = cv.getBoundingClientRect();
      return App.toLogical(e.clientX - r.left, e.clientY - r.top);
    }

    cv.addEventListener('pointerdown', function (e) {
      if (App.route !== 'game' || App.scene.paused) { return; }
      if (e.pointerType === 'mouse' && e.button !== 0) { return; }
      var p = pt(e);
      var hit = hud.hitTest(App.scene, p.x, p.y);
      if (hit === 'pause') { App.pauseGame(); return; }
      if (hit === 'speaker') { App.scene.replayPrompt(); return; }
      WN.audio.unlock();
      pressed[e.pointerId] = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      App.scene.blade.start(e.pointerId, p.x, p.y, util.now());
      e.preventDefault();
    }, { passive: false });

    cv.addEventListener('pointermove', function (e) {
      if (App.route !== 'game' || App.scene.paused) { return; }
      if (!pressed[e.pointerId]) { return; }
      var p = pt(e);
      var seg = App.scene.blade.move(e.pointerId, p.x, p.y, util.now());
      if (seg) { App.scene.sliceSegment(seg); }
      e.preventDefault();
    }, { passive: false });

    function endHandler(e) {
      delete pressed[e.pointerId];
      if (!App.scene) { return; }
      App.scene.blade.end(e.pointerId);
    }
    cv.addEventListener('pointerup', endHandler);
    cv.addEventListener('pointercancel', endHandler);
    cv.addEventListener('pointerleave', endHandler);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  // ---------------- 帧循环 ----------------

  App.frame = function (now) {
    if (!App._running) { return; }
    var dt = Math.max(0, Math.min(0.05, (now - App._last) / 1000));
    App._last = now;

    if (App.route === 'game') { App.scene.update(dt, now); }
    App.draw(now);
    App._raf = requestAnimationFrame(App.frame);
  };

  App.draw = function (now) {
    var ctx = App.ctx;
    if (root.innerWidth && (root.innerWidth !== App.cssW || root.innerHeight !== App.cssH)) {
      App.resize();
    }
    var cssW = App.cssW, cssH = App.cssH;
    ctx.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    ctx.translate(App.offsetX, App.offsetY);
    ctx.scale(App.scale, App.scale);

    var W = VW, H = App.H;
    var t = now / 1000;
    render.drawBackground(ctx, W, H, t);

    if (App.route === 'game') {
      App.drawGame(ctx, W, H, now);
    } else {
      DrawIdle(ctx, W, H, now, t);
    }

    ctx.restore();
  };

  App.drawGame = function (ctx, W, H, now) {
    var s = App.scene;
    ctx.save();
    if (s.shake > 0) {
      var amp = s.shake * s.shake * 26;
      ctx.translate(util.rand(-amp, amp), util.rand(-amp, amp));
    }
    for (var i = 0; i < s.tiles.length; i++) { render.drawTile(ctx, s.tiles[i], now); }
    for (i = 0; i < s.halves.length; i++) { render.drawHalf(ctx, s.halves[i]); }
    render.drawParticles(ctx, s.particles);
    s.blade.draw(ctx, now);
    render.drawFloats(ctx, s.floats);
    ctx.restore();

    hud.draw(ctx, s, now);
    render.drawFlash(ctx, W, H, s.flash);
  };

  function DrawIdle(ctx, W, H, now, t) {
    var words = ['SLICE', 'WORDS', 'MASTER', 'ENGLISH', 'NINJA', 'VOCAB'];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < words.length; i++) {
      var seed = i * 1.7;
      var x = W * (0.14 + ((i * 0.17) % 0.74)) + Math.sin(t * 0.5 + seed) * 24;
      var y = H * (0.18 + ((i * 0.23) % 0.55)) + Math.cos(t * 0.42 + seed) * 30;
      var fs = H * (0.026 + (i % 3) * 0.006);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * 0.35 + seed) * 0.14);
      ctx.globalAlpha = 0.10 + (i % 3) * 0.03;
      ctx.font = render.font(fs);
      ctx.fillStyle = '#bfe6ff';
      ctx.fillText(words[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------- 路由 ----------------

  /** 新手引导：首次进入自动出现；设置页可以重看 */
  App.showOnboard = function (force) {
    if (!force && App.save.settings.onboarded) { return; }
    // 自动化测试页（?qa=...）不自动弹引导，避免挡住截图；需要时用 force 调
    if (!force && /[?&]qa=/.test(root.location ? root.location.search : '')) { return; }
    var steps = [
      { icon: '🔪', title: T('onboard.s1t'), text: T('onboard.s1') },
      { icon: '🎮', title: T('onboard.s2t'), text: T('onboard.s2') },
      { icon: '🔊', title: T('onboard.s3t'), text: T('onboard.s3') }
    ];
    var i = 0;
    // 防止重复弹出：先清掉可能已存在的引导层
    var old = document.querySelector('.onboard');
    if (old && old.parentNode) { old.parentNode.removeChild(old); }
    var el = document.createElement('div');
    el.className = 'onboard';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');

    function close() {
      App.save.settings.onboarded = true;
      store.save(App.save);
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }

    function render() {
      var s = steps[i];
      var last = i === steps.length - 1;
      el.innerHTML =
        '<div class="onboard-card">' +
        '  <div class="onboard-icon">' + s.icon + '</div>' +
        '  <h2>' + s.title + '</h2>' +
        '  <p>' + s.text + '</p>' +
        '  <div class="onboard-dots">' + steps.map(function (_, n) {
          return '<i class="' + (n === i ? 'on' : '') + '"></i>';
        }).join('') + '</div>' +
        '  <div class="onboard-actions">' +
        '    <button class="btn ghost" data-onb="skip">' + T('onboard.skip') + '</button>' +
        '    <button class="btn primary" data-onb="next">' + (last ? T('onboard.start') : T('onboard.next')) + '</button>' +
        '  </div>' +
        '</div>';
    }

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-onb]');
      if (!btn) { return; }
      WN.audio.play('click');
      if (btn.getAttribute('data-onb') === 'skip') { close(); return; }
      if (i >= steps.length - 1) { close(); return; }
      i += 1;
      render();
    });

    render();
    document.body.appendChild(el);
  };

  App.go = function (name) {
    App.route = name;
    if (name === 'home') {
      screens.render('home', { save: App.save, version: VERSION });
    } else if (name === 'map') {
      screens.render('map', { save: App.save, mode: App.mode });
    } else if (name === 'wordbook') {
      screens.render('wordbook', { save: App.save, meaningLang: App.save.settings.meaningLang });
    } else if (name === 'report') {
      screens.render('report', { save: App.save });
    } else if (name === 'settings') {
      screens.render('settings', { save: App.save, version: VERSION });
    }
  };

  /** 查看某个阶段的完整词表（60 词） */
  App.showStageWords = function (worldId) {
    App.route = 'stagewords';
    screens.render('stagewords', {
      save: App.save,
      worldId: worldId,
      mode: App.mode,
      meaningLang: App.save.settings.meaningLang
    });
  };

  // ---------------- 开局 ----------------

  App.beginGame = function (cfg) {
    if (!cfg.queue || !cfg.queue.length) {
      screens.toast(T('toast.noWords'));
      return;
    }
    var mode = cfg.mode || 'classic';
    var lang = App.save.settings.meaningLang || 'zh';
    var save = App.save;

    var sceneCfg = {
      queue: cfg.queue,
      totalWords: cfg.totalWords,
      startCleared: cfg.startCleared || 0,
      kind: cfg.kind || 'stage',
      stageId: cfg.stageId || null,
      levelNo: cfg.levelNo || 0,
      mode: mode,
      save: save,
      lives: cfg.lives || STAGE_LIVES,
      bombRatio: cfg.bombRatio,
      speed: cfg.speed,
      speedMul: App.speedValue(),
      timeLimit: cfg.timeLimit || 0,
      startCombo: cfg.startCombo || 0,
      boss: !!cfg.boss,
      measure: App.measure,
      buildQuestion: function (entry) { return lex.buildQuestion(entry, mode, lang, 3); },
      onEnd: App.onGameEnd
    };

    if (cfg.kind === 'stage' && cfg.stageId) {
      sceneCfg.onWordCleared = function (entry) {
        store.markCleared(save, mode, cfg.stageId, entry.key);
        store.save(save);
      };
    }

    App.lastConfig = cfg;
    App.route = 'game';
    screens.show('game');
    WN.audio.stopSpeak();     // 掐掉上一局残留的发音，避免"听到的单词对不上"
    App.scene.setSize(VW, App.H);
    App.scene.start(sceneCfg);
    store.save(save);
    WN.audio.unlock();
  };

  /** 启动某世界的某一关：只出本关没切过的词；本关已全切完则进入复习 */
  App.startStage = function (worldId, levelNo) {
    var world = lex.world(worldId);
    if (!world) { return; }
    var mode = App.mode;
    var worlds = lex.worlds();

    if (!store.stageUnlocked(App.save, mode, worldId, worlds)) {
      screens.toast(T('stage.locked', { name: '' }));
      return;
    }

    var runMode = mode;
    if (runMode === 'audio') {
      // 听力模式必须有声音：用户把发音关掉时自动打开，而不是静默地"没声音"
      if (!App.save.settings.voice) {
        App.save.settings.voice = true;
        WN.audio.setVoiceEnabled(true);
        store.save(App.save);
        screens.toast(T('toast.voiceOn'));
      }
      // 发音包时代：不再因为"探测不到系统语音"就把玩法换掉，
      // 用户选了什么模式就是什么模式；真放不出声时题目会自动显示单词。
      if (!WN.audio.hasVoice() && !(WN.audio.hasAudioPack && WN.audio.hasAudioPack())) {
        screens.toast(T('toast.audioFallbackMode'));
      }
    }

    var chunks = lex.levelChunks(world);
    if (!chunks.length) { screens.toast(T('toast.noWords')); return; }
    var states = store.levelStates(App.save, runMode, worldId, chunks);
    var level = util.clamp(Number(levelNo) || 1, 1, states.length);
    var st = states[level - 1];
    if (!st || !st.unlocked) {
      screens.toast(T('stage.needPrev'));
      return;
    }

    var rec = store.stageOf(App.save, runMode, worldId);
    var isBoss = !!st.boss;
    var chunk = isBoss ? lex.bossEntries(world) : chunks[level - 1];
    var queue = [];
    if (isBoss) {
      queue = chunk.slice();          // Boss 关每次从头打，不续
    } else {
      for (var i = 0; i < chunk.length; i++) {
        if (!rec.cleared[chunk[i].key]) { queue.push(chunk[i]); }
      }
    }
    var review = !isBoss && queue.length === 0;
    if (review) { queue = chunk.slice(); }

    var idx = 0;
    for (var j = 0; j < worlds.length; j++) { if (worlds[j].id === worldId) { idx = j; } }

    App.beginGame({
      kind: 'stage',
      stageId: worldId,
      levelNo: level,
      mode: runMode,
      queue: isBoss ? queue : util.shuffle(queue),
      totalWords: chunk.length,
      startCleared: (review || isBoss) ? 0 : st.cleared,
      lives: isBoss ? 3 : STAGE_LIVES,
      bombRatio: isBoss ? 0.10 : (0.06 + 0.012 * idx),
      speed: isBoss ? (1.22 + 0.03 * idx) : (1 + 0.04 * idx + 0.01 * (level - 1)),
      timeLimit: isBoss ? 90 : 0,
      boss: isBoss
    });
  };

  /**
   * 拼写 / 听写挑战：与切词共用阶段与关卡结构（每关 20 词，全对才过）。
   * spell：看释义拼单词；dictate：只听发音写单词（拼错后才给释义提示）。
   */
  App.startSpellMode = function (worldId, levelNo, modeOverride) {
    var world = lex.world(worldId);
    if (!world) { return; }
    var mode = modeOverride === 'dictate' ? 'dictate' : 'spell';
    var worlds = lex.worlds();
    if (!store.stageUnlocked(App.save, mode, worldId, worlds)) {
      screens.toast(T('stage.locked', { name: '' }));
      return;
    }
    var chunks = lex.levelChunks(world);
    if (!chunks.length) { screens.toast(T('toast.noWords')); return; }
    var states = store.levelStates(App.save, mode, worldId, chunks);   // 末尾含 Boss 关
    var level = util.clamp(Number(levelNo) || 1, 1, states.length);
    var st = states[level - 1];
    if (!st || !st.unlocked) { screens.toast(T('stage.needPrev')); return; }

    var isBoss = !!st.boss;
    var rec = store.stageOf(App.save, mode, worldId);
    var chunk = isBoss ? lex.bossEntries(world) : chunks[level - 1];
    var queue;
    if (isBoss) {
      queue = chunk.slice();          // Boss 关每次从头来
    } else {
      queue = [];
      for (var i = 0; i < chunk.length; i++) {
        if (!rec.cleared[chunk[i].key]) { queue.push(chunk[i]); }
      }
      if (!queue.length) { queue = chunk.slice(); }   // 全对过了就是复习
    }

    App.route = 'spell';
    screens.show('spell');
    WN.spell.start({
      mode: mode,
      boss: isBoss,
      timeLimit: isBoss ? 90 : 0,
      worldName: T(world.nameKey),
      levelNo: level,
      queue: isBoss ? queue : util.shuffle(queue),
      total: chunk.length,
      lives: isBoss ? 3 : STAGE_LIVES,
      meaningLang: App.save.settings.meaningLang,
      onCleared: function (entry) {
        store.markCleared(App.save, mode, worldId, entry.key);
        store.save(App.save);
      },
      onWrong: function (entry) {
        store.addWrong(App.save, entry.key);
        store.save(App.save);
      },
      onQuit: function () { WN.spell.stop(); App.go('map'); },
      onEnd: function (r) {
        var rec2 = store.stageOf(App.save, mode, worldId);
        rec2.bestScore = Math.max(rec2.bestScore || 0, r.score);
        rec2.stars = Math.max(rec2.stars || 0, r.stars);
        rec2.updatedAt = Date.now();
        if (isBoss && r.win) {
          var titleKey = 'title.' + world.id;
          store.markBossCleared(App.save, mode, worldId, titleKey, r.stars);
          r.title = T(titleKey);
        }
        if (r.win) {
          rec2.done = store.stageDone(App.save, mode, worldId, chunks);
        }
        store.save(App.save);
      },
      onNext: function (r) {
        WN.spell.stop();
        if (r.win && !isBoss && level < chunks.length) { App.startSpellMode(worldId, level + 1, mode); }
        else { App.go('map'); }
      }
    });
  };

  /** 今日复习：只出"学过但还没掌握、且已到期"的词 */
  App.startDueReview = function () {
    var list = srs.dueList(App.save, lex.all(), 20);
    if (!list.length) {
      screens.toast(T('toast.needReview'));
      return;
    }
    App.beginGame({
      kind: 'review',
      stageId: null,
      mode: 'classic',
      queue: util.shuffle(list),
      totalWords: list.length,
      startCleared: 0,
      lives: 3,
      bombRatio: 0.05,
      speed: 1
    });
  };

  /** 无尽模式：不绑关卡，按 SRS 权重出 60 题、3 条命，冲最高分 */
  App.startEndless = function () {
    var queue = lex.pickWeighted(lex.all(), App.save, 60);
    if (!queue.length) { screens.toast(T('toast.noWords')); return; }
    App.beginGame({
      kind: 'endless',
      stageId: null,
      // 拼写/听写是另一套界面，无尽模式回落到切词玩法
      mode: (App.mode === 'spell' || App.mode === 'dictate') ? 'classic' : App.mode,
      queue: queue,
      totalWords: queue.length,
      startCleared: 0,
      lives: 3,
      bombRatio: 0.07,
      speed: 1
    });
  };

  App.startDaily = function () {
    var all = lex.all();
    var touched = all.filter(function (e) { return !!App.save.words[e.key]; });
    var pool = touched.length >= 30 ? touched : lex.bandEntries('primary').concat(lex.bandEntries('junior'));
    var qs = lex.buildQuestions({
      entries: pool, mode: 'classic', count: 15, save: App.save, options: 3,
      lang: App.save.settings.meaningLang
    });
    // 连续登录天数 → 每日挑战开局连击加成（最多 +4）
    var streak = Math.max(1, App.save.profile.streakDays || 1);
    var comboBonus = Math.min(streak - 1, 4);
    if (comboBonus > 0) { screens.toast(T('daily.combo', { n: comboBonus })); }
    App.beginGame({
      kind: 'daily',
      stageId: null,
      mode: 'classic',
      startCombo: comboBonus,
      queue: qs.map(function (q) { return q.entry; }),
      totalWords: qs.length,
      startCleared: 0,
      lives: 3,
      bombRatio: 0.10,
      speed: 1.02
    });
  };

  /** 专项练习：只练错得最多的 N 个词（默认 20），掌握后会自动移出错词本 */
  App.startReviewTop = function (limit) {
    var n = limit || 20;
    var book = App.save.wrongBook.slice().sort(function (a, b) {
      return (b.wrongCount || 0) - (a.wrongCount || 0);
    });
    var list = [];
    for (var i = 0; i < book.length && list.length < n; i++) {
      var e = lex.entry(book[i].key);
      if (e) { list.push(e); }
    }
    if (!list.length) { screens.toast(T('toast.needReview')); return; }
    App.beginGame({
      kind: 'review',
      stageId: null,
      // 复习是切词玩法；spell/dictate 模式下也要退回经典出题
      mode: (App.mode === 'spell' || App.mode === 'dictate') ? 'classic' : App.mode,
      queue: util.shuffle(list),
      totalWords: list.length,
      startCleared: 0,
      lives: 3,
      bombRatio: 0.05,
      speed: 0.95
    });
  };

  App.startReview = function () {
    var list = [];
    App.save.wrongBook.forEach(function (w) {
      var e = lex.entry(w.key);
      if (e) { list.push(e); }
    });
    if (!list.length) { screens.toast(T('toast.needReview')); return; }
    App.beginGame({
      kind: 'review',
      stageId: null,
      mode: (App.mode === 'spell' || App.mode === 'dictate') ? 'classic' : App.mode,
      queue: util.shuffle(list),
      totalWords: list.length,
      startCleared: 0,
      lives: 3,
      bombRatio: 0.06,
      speed: 0.95
    });
  };

  App.onGameEnd = function (result) {
    WN.audio.stopSpeak();
    // Boss 关通关：授予阶段称号
    if (result.boss && result.win && result.stageId) {
      var world = lex.world(result.stageId);
      var titleKey = world ? 'title.' + world.id : 'title.default';
      store.markBossCleared(App.save, result.mode, result.stageId, titleKey, result.stars);
      result.title = T(titleKey);
      result.newTitle = true;
    }
    // "阶段已完成"只在最后一关（Boss）也通过时才算
    if (result.win && result.stageId) {
      var w2 = lex.world(result.stageId);
      var chunks2 = w2 ? lex.levelChunks(w2) : [];
      var rec2 = store.stageOf(App.save, result.mode, result.stageId);
      rec2.done = store.stageDone(App.save, result.mode, result.stageId, chunks2);
    }

    // 无尽模式：更新最高分
    if (result.kind === 'endless') {
      var en = App.save.endless || (App.save.endless = { best: 0, runs: 0, bestAt: 0, bestCleared: 0 });
      en.runs = (en.runs || 0) + 1;
      if ((result.score || 0) > (en.best || 0)) {
        en.best = result.score;
        en.bestCleared = result.cleared;
        en.bestAt = Date.now();
        result.newBest = true;
      }
      result.endlessBest = en.best;
    }

    // 每日目标达成：当天第一次达标给经验
    var today = util.todayKey();
    var goal = App.save.settings.dailyGoal || 20;
    var learnedToday = 0;
    Object.keys(App.save.words).forEach(function (k) {
      if (util.todayKey(new Date(App.save.words[k].lastAt || 0)) === today) { learnedToday += 1; }
    });
    if (learnedToday >= goal && (!App.save.goalReward || App.save.goalReward.date !== today)) {
      App.save.goalReward = { date: today, xp: 50 };
      store.addXp(App.save, 50);
      result.goalBonus = { xp: 50, learned: learnedToday, goal: goal };
    }
    App.route = 'result';
    store.save(App.save);
    screens.render('result', { result: result, meaningLang: App.save.settings.meaningLang });
  };

  App.pauseGame = function () {
    if (App.route !== 'game') { return; }
    App.scene.paused = true;
    WN.audio.stopSpeak();
    screens.showPause(App.save.settings.speed);
  };

  App.resumeGame = function () {
    if (App.route !== 'game') { return; }
    App.scene.paused = false;
    screens.hidePause();
    App._last = util.now();
  };

  // ---------------- 事件 ----------------

  App.handleAction = function (action, ds) {
    switch (action) {
      case 'go-map': App.go('map'); break;
      case 'home': App.go('home'); break;
      case 'wordbook': App.go('wordbook'); break;
      case 'report': App.go('report'); break;
      case 'settings': App.go('settings'); break;
      case 'ws-filter': screens.setWordFilter(ds.filter); break;
      case 'onboard': App.showOnboard(true); break;
      case 'install-help': App.showInstallHelp(true); break;
      case 'install-diag': App.showPwaDiag(); break;
      case 'export-wrong': App.exportWrongBook(); break;
      case 'daily': App.startDaily(); break;
      case 'endless': App.startEndless(); break;
      case 'due-review': App.startDueReview(); break;
      case 'set-goal':
        App.save.settings.dailyGoal = util.clamp(Number(ds.goal) || 20, 5, 100);
        store.save(App.save);
        screens.render('settings', { save: App.save, version: VERSION });
        screens.toast(T('settings.goalSet', { n: App.save.settings.dailyGoal }));
        break;
      case 'set-mode':
        App.mode = ds.mode;
        screens.render('map', { save: App.save, mode: App.mode });
        break;
      case 'start-stage':
        if (App.mode === 'spell' || App.mode === 'dictate') { App.startSpellMode(ds.world, ds.level, App.mode); }
        else { App.startStage(ds.world, ds.level); }
        break;
      case 'spell-quit':
        WN.spell.stop();
        App.go('map');
        break;
      case 'spell-hear': case 'spell-hint': case 'spell-submit': case 'spell-next':
        break;
      case 'stage-words': App.showStageWords(ds.world); break;
      case 'speak-word':
        WN.audio.unlock();
        WN.audio.playWord(ds.word);
        break;
      case 'test-voice':
        screens.toast(T('settings.voiceTesting'));
        WN.audio.testVoice(function (ok) {
          screens.toast(T(ok ? 'settings.voiceOk' : 'settings.voiceFail'));
        });
        break;
      case 'review': App.startReview(); break;
      case 'review-top': App.startReviewTop(20); break;
      case 'retry':
        if (App.lastConfig) { App.beginGame(App.lastConfig); }
        break;
      case 'resume': App.resumeGame(); break;
      case 'quit':
        screens.hidePause();
        App.scene.paused = false;
        App.scene.quit();
        App.go('map');
        break;
      case 'toggle-setting':
        App.save.settings[ds.setting] = ds.value === '1';
        App.applySettings();
        store.save(App.save);
        break;
      case 'set-speed':
        App.setSpeed(ds.speed);
        break;
      case 'set-lang':
        // 换界面语言时，释义语言跟着切（用户仍可单独改回）；越南语暂无释义，退回英文
        App.save.settings.lang = ds.lang;
        App.save.settings.meaningLang = lex.MEANING_LANGS.indexOf(ds.lang) >= 0
          ? ds.lang : (lex.MEANING_LANGS.indexOf(App.save.settings.meaningLang) >= 0 ? App.save.settings.meaningLang : 'en');
        WN.i18n.setLang(ds.lang);
        store.save(App.save);
        screens.render('settings', { save: App.save, version: VERSION });
        break;
      case 'set-meaning-lang':
        App.save.settings.meaningLang = ds.lang;
        store.save(App.save);
        screens.render('settings', { save: App.save, version: VERSION });
        break;
      case 'export': App.exportSave(); break;
      case 'import': App.pickImport(); break;
      case 'reset': App.resetSave(); break;
      case 'clear-wrong':
        if (root.confirm(T('wordbook.clearConfirm'))) {
          App.save.wrongBook = [];
          store.save(App.save);
          screens.render('wordbook', { save: App.save, meaningLang: App.save.settings.meaningLang });
        }
        break;
      default: break;
    }
  };

  /** 导出错词本为 CSV（Excel 可直接打开，用于打印/线下背） */
  App.exportWrongBook = function () {
    var book = App.save.wrongBook.slice().sort(function (a, b) {
      return (b.wrongCount || 0) - (a.wrongCount || 0);
    });
    if (!book.length) { screens.toast(T('toast.needReview')); return; }
    var lang = App.save.settings.meaningLang || 'zh';
    function cell(v) {
      var s = String(v === null || v === undefined ? '' : v);
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var lines = [['单词', '词性', '释义', '例句', '例句翻译', '错题次数', '熟练度'].map(cell).join(',')];
    book.forEach(function (w) {
      var e = lex.entry(w.key);
      if (!e) { return; }
      var st = srs.get(App.save, w.key);
      lines.push([
        e.word, e.pos, lex.meaningOf(e, lang), e.example, e.example_zh,
        w.wrongCount || 0, (st && st.mastery) || 0
      ].map(cell).join(','));
    });
    var ok = false;
    try {
      var blob = new root.Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var url = root.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wordninja-wrongbook.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) { a.parentNode.removeChild(a); }
        root.URL.revokeObjectURL(url);
      }, 300);
      ok = true;
    } catch (err) { ok = false; }
    screens.toast(ok ? T('wordbook.exported', { n: book.length }) : T('wordbook.exportFail'));
  };

  App.applySettings = function () {
    WN.audio.setEnabled(!!App.save.settings.sound);
    WN.audio.setVoiceEnabled(!!App.save.settings.voice);
  };

  App.speedValue = function () {
    return SPEED_MUL[App.save.settings.speed] || 1;
  };

  App.setSpeed = function (speed) {
    if (!SPEED_MUL[speed]) { return; }
    App.save.settings.speed = speed;
    store.save(App.save);
    if (App.route === 'game' && App.scene) {
      App.scene.speedMul = SPEED_MUL[speed];
      App.scene.motion = (App.scene.cfg && App.scene.cfg.speed ? App.scene.cfg.speed : 1) * App.scene.speedMul;
      App.scene.gravityScale = App.scene.motion * App.scene.motion;
    }
    if (App.route === 'game' && App.scene.paused) {
      screens.showPause(speed);
    } else if (screens.current === 'settings') {
      screens.render('settings', { save: App.save, version: VERSION });
    }
  };

  App.exportSave = function () {
    var text = store.exportText(App.save);
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'word-ninja-save-' + util.todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 600);
    screens.toast(T('toast.saved'));
  };

  App.pickImport = function () {
    var input = document.getElementById('import-file');
    if (input) { input.click(); }
  };

  App.handleImportFile = function (file) {
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      var res = store.importText(String(reader.result || ''));
      if (!res.ok) { screens.toast(T('toast.importFail')); return; }
      App.save = res.save;
      WN.i18n.setLang(App.save.settings.lang || 'zh');
      App.applySettings();
      screens.toast(T('toast.imported'));
      App.go('home');
    };
    reader.onerror = function () { screens.toast(T('toast.importFail')); };
    reader.readAsText(file);
  };

  App.resetSave = function () {
    if (!root.confirm(T('settings.resetConfirm'))) { return; }
    App.save = store.reset();
    WN.i18n.setLang(App.save.settings.lang || 'zh');
    App.applySettings();
    screens.toast(T('toast.reset'));
    App.go('home');
  };

  /** 自动化烟测入口：?qa=map / ?qa=game（正式用户不会带这个参数） */
  App.startFromQuery = function () {
    var m = /[?&]qa=([a-z0-9-]+)/i.exec(root.location ? root.location.search : '');
    if (!m) { return; }
    var what = m[1];
    setTimeout(function () {
      var info = {
        cssW: App.cssW, cssH: App.cssH, H: Math.round(App.H), scale: +App.scale.toFixed(4),
        dpr: App.dpr, ox: Math.round(App.offsetX), oy: Math.round(App.offsetY), route: App.route,
        sW: App.scene.W, sH: App.scene.H
      };
      document.body.setAttribute('data-debug', JSON.stringify(info));
    }, 120);

    if (what === 'map') { App.go('map'); }
    else if (what === 'wordbook') { App.go('wordbook'); }
    else if (what === 'words') {
      var wm = /[?&]w=([a-z]+)/i.exec(root.location ? root.location.search : '');
      App.showStageWords(wm ? wm[1] : 'fruit');
    }
    else if (what === 'report') { App.go('report'); }
    else if (what === 'settings') { App.go('settings'); }
    else if (what === 'result') {
      App.route = 'result';
      screens.render('result', {
        result: {
          kind: 'stage', stageId: 'fruit', mode: 'classic', win: true, score: 2400, best: 2400,
          newRecord: true, correct: 52, wrong: 3, total: 55, accuracy: 0.945, maxCombo: 9,
          stars: 3, xpGained: 520, cleared: 60, totalWords: 60,
          wrongEntries: lex.bandEntries('primary').slice(0, 2),
          learned: []
        },
        meaningLang: App.save.settings.meaningLang
      });
    } else if (what === 'game') {
      App.startStage('fruit');
    } else if (what === 'quick') {
      // 烟测专用：只跑 3 题的阶段，验证完整流程而不必等 60 题
      App.startStage('fruit');
      if (App.scene && App.scene.queue) {
        App.scene.queue = App.scene.queue.slice(0, 2);
        App.scene.clearedCount = 0;
        App.scene.totalWords = 3;
      }
    }
  };

  WN.app = App;
})(typeof window !== 'undefined' ? window : globalThis);
