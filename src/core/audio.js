/**
 * WORD NINJA — 音频
 * 音效全部由 Web Audio 实时合成（零音频文件、零版权风险）；
 * 发音使用 Web Speech API（本地 TTS，零费用）。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var enabled = true;
  var voiceEnabled = true;
  var voices = [];
  var voiceReady = false;
  var preferred = null;

  function ensureCtx() {
    if (ctx) { return ctx; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { return null; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function getNoise() {
    if (noiseBuf || !ctx) { return noiseBuf; }
    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }

  function env(gain, t0, attack, hold, release, peak) {
    var g = gain.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.setValueAtTime(Math.max(peak, 0.0002), t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone(type, freq, t0, dur, peak, freqEnd) {
    if (!ctx) { return; }
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) { osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur); }
    env(g, t0, 0.008, Math.max(dur * 0.25, 0.01), dur * 0.75, peak);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, peak, filterType, f0, f1, q) {
    if (!ctx || !getNoise()) { return; }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(f0, t0);
    if (f1) { f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); }
    f.Q.value = q || 1.2;
    var g = ctx.createGain();
    env(g, t0, 0.005, dur * 0.15, dur * 0.85, peak);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  var audio = {
    get available() { return !!ensureCtx(); },

    unlock: function () {
      ensureCtx();
      if (ctx && ctx.state === 'suspended') { ctx.resume(); }
    },

    setEnabled: function (on) { enabled = !!on; },
    setVoiceEnabled: function (on) { voiceEnabled = !!on; },

    play: function (name, opt) {
      if (!enabled) { return; }
      if (!ensureCtx()) { return; }
      if (ctx.state === 'suspended') { ctx.resume(); }
      var t = ctx.currentTime + 0.001;
      var o = opt || {};
      switch (name) {
        case 'slice':
          noise(t, 0.16, 0.5, 'bandpass', 1800 + (o.pitch || 0) * 400, 6500 + (o.pitch || 0) * 900, 1.1);
          tone('triangle', 1400 + (o.pitch || 0) * 120, t, 0.08, 0.10, 700);
          break;
        case 'correct':
          tone('sine', 880, t, 0.14, 0.22);
          tone('sine', 1320, t + 0.07, 0.20, 0.20);
          break;
        case 'wrong':
          tone('sawtooth', 180, t, 0.26, 0.24, 80);
          noise(t, 0.12, 0.16, 'lowpass', 900, 300, 0.7);
          break;
        case 'bomb':
          noise(t, 0.55, 0.85, 'lowpass', 1200, 120, 0.8);
          tone('sine', 70, t, 0.42, 0.5, 38);
          break;
        case 'combo':
          tone('triangle', 660, t, 0.10, 0.18);
          tone('triangle', 990, t + 0.06, 0.12, 0.18);
          tone('triangle', 1320, t + 0.12, 0.16, 0.16);
          break;
        case 'bonus':
          // 奖励星：明亮的琶音
          tone('sine', 1046.5, t, 0.10, 0.20);
          tone('sine', 1318.5, t + 0.055, 0.11, 0.19);
          tone('sine', 1568.0, t + 0.11, 0.13, 0.18);
          tone('triangle', 2093.0, t + 0.17, 0.22, 0.14);
          break;
        case 'click':
          tone('square', 520, t, 0.05, 0.08, 380);
          break;
        case 'win':
          [523, 659, 784, 1046].forEach(function (f, i) {
            tone('triangle', f, t + i * 0.11, 0.22, 0.20);
          });
          break;
        case 'lose':
          [392, 330, 262].forEach(function (f, i) {
            tone('sine', f, t + i * 0.14, 0.30, 0.20);
          });
          break;
        default:
          break;
      }
    },

    // ---------- 发音 ----------
    initVoices: function () {
      var synth = root.speechSynthesis;
      if (!synth) { return; }
      var tries = 0;
      function refresh() {
        voices = synth.getVoices() || [];
        var en = voices.filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
        // 本地语音优先：Edge 的 "Online (Natural)" 是云端合成，断网/受限时完全不出声
        var local = en.filter(function (v) { return v.localService !== false; });
        var before = voiceReady;
        preferred = local.filter(function (v) { return /^en-US$/i.test(v.lang); })[0]
          || local.filter(function (v) { return /^en-GB$/i.test(v.lang); })[0]
          || local[0]
          || en.filter(function (v) { return /^en-US$/i.test(v.lang); })[0]
          || en.filter(function (v) { return /^en-GB$/i.test(v.lang); })[0]
          || en[0] || null;
        voiceLocal = local.length > 0;
        voiceReady = !!preferred;
        // 语音列表加载完成时通知界面刷新（设置页的诊断信息需要它）
        if (!before && voiceReady && root.document) {
          try { root.document.dispatchEvent(new CustomEvent('wn:voices')); } catch (e) { /* ignore */ }
        }
      }
      refresh();
      // 部分浏览器（尤其移动端）首帧拿不到语音列表，需要轮询等它加载
      var poll = setInterval(function () {
        tries += 1;
        refresh();
        if (voiceReady || tries >= 12) { clearInterval(poll); }
      }, 250);
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', refresh);
      } else {
        synth.onvoiceschanged = refresh;
      }
    },

    hasVoice: function () { return voiceReady; },

    /** 是否有"离线/本地"英语语音（云端语音断网就哑，不能算数） */
    hasLocalVoice: function () { return voiceLocal; },

    /** 这次游戏能不能真的出声：本地发音包、本地语音，或已通过自检的云端语音 */
    canSpeak: function () { return wordAudio.ok || (voiceReady && (voiceLocal || cloudOk)); },

    /** 离线发音包是否可用（data/audio/<word>.mp3） */
    hasAudioPack: function () { return wordAudio.ok; },

    /**
     * 播一个词的发音：优先用离线发音包，失败再退回系统 TTS。
     * 没有英语语音的机器靠这条链路也能出声。
     */
    playWord: function (word, opt) {
      var w = String(word || '');
      if (!w) { return; }
      if (!wordAudio.ok || wordAudio.missing[w]) {
        audio.speak(w, opt);
        return;
      }
      var el = wordAudio.el;
      if (!el) {
        el = new Audio();
        el.preload = 'auto';
        el.addEventListener('playing', function () {
          speaking = true;
          wordAudio.failStreak = 0;
          wordAudio.played = true;
        });
        el.addEventListener('ended', function () { speaking = false; });
        el.addEventListener('pause', function () { speaking = false; });
        el.addEventListener('error', function () {
          speaking = false;
          var failedWord = wordAudio.pending;
          wordAudio.failStreak += 1;
          wordAudio.lastError = (el.error && el.error.code) || 'error';
          if (failedWord) {
            wordAudio.missing[failedWord] = true;
            audio.speak(failedWord, wordAudio.opt);
          }
          // 只有连续很多次都失败才认为整包不可用；偶发一次（加载被打断、切后台）不算
          if (wordAudio.failStreak >= 6) { wordAudio.ok = false; }
        });
        wordAudio.el = el;
      }
      wordAudio.pending = w;
      wordAudio.opt = opt || {};
      try { if (root.speechSynthesis) { root.speechSynthesis.cancel(); } } catch (e) { /* ignore */ }
      try {
        el.pause();
        el.src = 'data/audio/' + encodeURIComponent(w) + '.mp3';
        var p = el.play();
        if (p && typeof p.catch === 'function') { p.catch(function () { /* error 事件统一兜底 */ }); }
      } catch (e) {
        audio.speak(w, opt);
      }
    },

    /** 启动时探测发音包是否存在（只做预热，失败也不判死，交给真实播放去决定） */
    probePack: function () {
      try {
        var a = new Audio();
        a.preload = 'auto';
        a.addEventListener('loadeddata', function () {
          wordAudio.ok = true;
          wordAudio.probed = true;
        }, { once: true });
        a.addEventListener('error', function () {
          // 手机浏览器可能因为"还没用户手势"就先报错，这里只记录，不把整包判死
          wordAudio.probeError = true;
        }, { once: true });
        a.src = 'data/audio/apple.mp3';
        a.load();
      } catch (e) { /* ignore */ }
    },

    /** 给设置页用的诊断信息：让"没声音"这件事可被看见、可被报告 */
    info: function () {
      var synth = root.speechSynthesis;
      var en = [];
      try {
        en = (synth && synth.getVoices ? synth.getVoices() : []).filter(function (v) {
          return /^en([-_]|$)/i.test(v.lang);
        });
      } catch (e) { en = []; }
      return {
        supported: !!synth,
        hasVoice: voiceReady,
        hasLocalVoice: voiceLocal,
        cloudOk: cloudOk,
        voiceName: preferred ? preferred.name : '',
        voiceCount: en.length,
        broken: ttsBroken,
        speaking: speaking,
        pack: wordAudio.ok,
        packPlayed: wordAudio.played,
        packError: wordAudio.lastError || '',
        packProbeError: !!wordAudio.probeError
      };
    },

    get speaking() { return speaking; },

    /** TTS 是否已被判定为不可用（超时/报错达到上限） */
    get broken() { return ttsBroken; },

    /**
     * 读一个单词。
     * Chrome/Edge 的已知行为：cancel 之后立刻 speak 会被吞，且 paused 状态下
     * 不 resume 就永远不出声。所以这里固定做 cancel → resume → 150ms → speak，
     * 并在 850ms 内没有 onstart 时带着 resume 再重试两次。
     */
    speak: function (text, opt) {
      if (!text) { return; }
      if (!voiceEnabled) { return; }
      var synth = root.speechSynthesis;
      if (!synth) { ttsBroken = true; return; }
      clearTimeout(speakTimer);
      seq += 1;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      try { synth.resume(); } catch (e) { /* ignore */ }
      lastText = String(text);
      lastOpt = opt || {};
      speakTimer = setTimeout(function () { doSpeak(lastText, lastOpt, 0); }, 150);
    },

    /**
     * 设置页自检：有离线发音包就先测它，否则测系统 TTS。
     * @param {function(boolean, string)} cb
     */
    testVoice: function (cb) {
      var done = false;
      function finish(ok, reason) {
        if (done) { return; }
        done = true;
        if (cb) { cb(ok, reason); }
      }
      if (wordAudio.ok) {
        var a;
        try { a = new Audio('data/audio/apple.mp3'); } catch (e) { a = null; }
        if (a) {
          a.addEventListener('playing', function () { finish(true, 'pack'); }, { once: true });
          a.addEventListener('error', function () {
            wordAudio.ok = false;
            audio.testVoice(function (ok2, r2) { finish(ok2, r2); });
          }, { once: true });
          try { a.play(); } catch (e) { /* ignore */ }
          setTimeout(function () { finish(false, 'pack-silent'); }, 2500);
          return;
        }
      }
      if (!root.speechSynthesis) { finish(false, 'unsupported'); return; }
      if (!voiceEnabled) { voiceEnabled = true; }
      var before = lastStartAt;
      audio.speak('hello', { rate: 0.9 });
      setTimeout(function () {
        var ok = lastStartAt > before;
        if (!ok) { ttsBroken = true; } else { cloudOk = true; }
        finish(ok, ok ? 'ok' : (voiceReady ? 'silent' : 'novoice'));
      }, 1600);
    },

    stopSpeak: function () {
      clearTimeout(speakTimer);
      seq += 1;
      speaking = false;
      try { if (wordAudio.el) { wordAudio.el.pause(); } } catch (e) { /* ignore */ }
      try { if (root.speechSynthesis) { root.speechSynthesis.cancel(); } } catch (e) { /* ignore */ }
    }
  };

  var speaking = false;
  var ttsBroken = false;
  var voiceLocal = false;
  var cloudOk = false;
  var wordAudio = { el: null, ok: true, missing: {}, pending: '', opt: null, failStreak: 0, played: false };
  var speakTimer = null;
  var seq = 0;
  var lastStartAt = 0;
  var lastText = '';
  var lastOpt = {};

  function doSpeak(text, opt, attempt) {
    var synth = root.speechSynthesis;
    if (!synth || !voiceEnabled) { return; }
    var mySeq = seq;
    try { if (synth.paused) { synth.resume(); } } catch (e) { /* ignore */ }

    var started = false;
    try {
      var u = new SpeechSynthesisUtterance(String(text));
      if (preferred) { u.voice = preferred; }
      u.lang = (preferred && preferred.lang) || 'en-US';
      u.rate = opt.rate || 0.82;
      u.pitch = 1;
      u.volume = 1;
      u.onstart = function () {
        started = true;
        speaking = true;
        lastStartAt = Date.now();
        ttsBroken = false;
      };
      u.onend = function () { speaking = false; };
      u.onerror = function () { speaking = false; };
      synth.speak(u);
    } catch (e) { /* ignore */ }

    // 云端语音（Edge 的 Online Natural）联网合成要 2–4 秒，等太短会把它自己掐死
    var cloud = !!(preferred && preferred.localService === false);
    var wait = cloud ? 3800 : 900;
    var maxAttempt = cloud ? 1 : 2;

    setTimeout(function () {
      if (mySeq !== seq) { return; }   // 已被更新的一次 speak 取代
      if (started) { return; }
      if (attempt < maxAttempt) {
        try { synth.cancel(); synth.resume(); } catch (e) { /* ignore */ }
        doSpeak(text, opt, attempt + 1);
      } else {
        ttsBroken = true;
        if (audio.onFail) { audio.onFail('timeout'); }
      }
    }, wait);
  }

  WN.audio = audio;
})(typeof window !== 'undefined' ? window : globalThis);
