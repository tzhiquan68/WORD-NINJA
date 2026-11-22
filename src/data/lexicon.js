/**
 * WORD NINJA — 词库索引、多语言释义与出题
 * 词条数据来自 data/words.js（tools/build_words.py 生成）
 * 多语言释义来自 data/meanings.js（同脚本生成）
 * 本文件不硬编码任何词义。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;

  // 每个世界 = 一个学习阶段 = 该等级全部 60 词
  var WORLDS = [
    { id: 'fruit', band: 'primary', nameKey: 'world.fruit', descKey: 'world.fruit.desc', color: '#ff7a59', icon: '🍎', unlock: null },
    { id: 'forest', band: 'junior', nameKey: 'world.forest', descKey: 'world.forest.desc', color: '#4fbf7a', icon: '🌲', unlock: 'fruit' },
    { id: 'castle', band: 'senior', nameKey: 'world.castle', descKey: 'world.castle.desc', color: '#8b6cf0', icon: '🏰', unlock: 'forest' },
    { id: 'space', band: 'cet4', nameKey: 'world.space', descKey: 'world.space.desc', color: '#3fa9f5', icon: '🚀', unlock: 'castle' },
    { id: 'ultimate', band: 'cet6', nameKey: 'world.ultimate', descKey: 'world.ultimate.desc', color: '#e8477f', icon: '🔥', unlock: 'space' }
  ];

  var MODES = ['classic', 'en2zh', 'audio', 'spell', 'dictate'];
  var MEANING_LANGS = ['zh', 'en', 'es', 'ja', 'ko', 'vi'];
  var LEVEL_SIZE = 20;   // 每关 20 个词

  var index = {};
  var byBand = {};
  var all = [];
  var inited = false;

  function init() {
    if (inited) { return true; }
    var data = WN.WORDS;
    if (!data || !data.length) { return false; }
    for (var i = 0; i < data.length; i++) {
      var e = data[i];
      var key = e.level + ':' + e.word;
      if (index[key]) { continue; }
      e.key = key;
      index[key] = e;
      if (!byBand[e.level]) { byBand[e.level] = []; }
      byBand[e.level].push(e);
      all.push(e);
    }
    inited = true;
    return true;
  }

  function bandEntries(band) {
    init();
    return byBand[band] || [];
  }

  function worldEntries(world) {
    return bandEntries(world.band);
  }

  /** 把阶段词库按 20 词切成关卡 */
  function levelChunks(world) {
    var list = worldEntries(world);
    var out = [];
    for (var i = 0; i < list.length; i += LEVEL_SIZE) {
      out.push(list.slice(i, i + LEVEL_SIZE));
    }
    return out;
  }

  function levelCount(world) {
    return Math.ceil(worldEntries(world).length / LEVEL_SIZE);
  }

  /**
   * Boss 关的词：从整个阶段均匀抽样 20 个，覆盖全书而不是只考最后几个。
   * 同一个阶段每次打开 Boss 关顺序固定（用阶段 id 播随机种子），重试时题型一致。
   */
  function bossEntries(world) {
    var list = worldEntries(world);
    if (!list.length) { return []; }
    var want = Math.min(LEVEL_SIZE, list.length);
    var step = list.length / want;
    var out = [];
    for (var i = 0; i < want; i++) {
      out.push(list[Math.min(list.length - 1, Math.floor(i * step))]);
    }
    return out;
  }

  /** 释义：优先取所选语言的释义表，缺失时回退中文，绝不留空 */
  function meaningOf(entry, lang) {
    if (!entry) { return ''; }
    if (!lang || lang === 'zh') { return entry.zh; }
    var table = WN.MEANINGS && WN.MEANINGS[lang];
    var m = table && table[entry.word];
    return (m && String(m).trim()) ? m : entry.zh;
  }

  function textOf(entry, mode, lang) {
    return mode === 'en2zh' ? meaningOf(entry, lang) : entry.word;
  }

  function poolFor(entry) {
    return bandEntries(entry.level);
  }

  /** 干扰项：同等级、文本不重复、优先长度接近 */
  function makeOptions(entry, pool, mode, lang, count, extraPool) {
    var correctText = textOf(entry, mode, lang);
    var cands = [];
    var seen = {};
    seen[correctText] = true;

    function absorb(list) {
      if (!list) { return; }
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.key === entry.key) { continue; }
        var t = textOf(c, mode, lang);
        if (!t || seen[t]) { continue; }
        seen[t] = true;
        cands.push({ text: t, entry: c, correct: false, lenDiff: Math.abs(t.length - correctText.length) });
      }
    }

    absorb(pool);
    if (cands.length < count - 1 && extraPool) { absorb(extraPool); }
    if (cands.length < count - 1) { absorb(all); }

    cands.sort(function (a, b) {
      return (a.lenDiff + Math.random() * 3) - (b.lenDiff + Math.random() * 3);
    });
    var picked = cands.slice(0, count - 1);
    return util.shuffle(picked.concat([{ text: correctText, entry: entry, correct: true }]));
  }

  /** 组装单题（供场景按队列动态出题） */
  function buildQuestion(entry, mode, lang, optCount) {
    var m = mode || 'classic';
    return {
      entry: entry,
      mode: m,
      lang: lang || 'zh',
      prompt: m === 'en2zh' ? entry.word : (m === 'audio' ? '' : meaningOf(entry, lang)),
      correctText: textOf(entry, m, lang),
      options: makeOptions(entry, poolFor(entry), m, lang, optCount || 3, all)
    };
  }

  /** 按 SRS 权重抽 n 个词（只出词条，不建选项；供无尽模式这类大队列使用） */
  function pickWeighted(entries, save, count) {
    var pool = entries || [];
    var used = {};
    var out = [];
    for (var i = 0; i < count; i++) {
      var e = weightedPick(pool, save, used);
      if (!e) { used = {}; e = weightedPick(pool, save, used); }
      if (!e) { break; }
      used[e.key] = true;
      out.push(e);
    }
    return out;
  }

  function weightedPick(pool, save, used) {
    var total = 0, i, w, list = [];
    for (i = 0; i < pool.length; i++) {
      if (used[pool[i].key]) { continue; }
      w = WN.srs.weightForEntry(save, pool[i]);
      list.push({ e: pool[i], w: w });
      total += w;
    }
    if (!list.length) { return null; }
    var r = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      r -= list[i].w;
      if (r <= 0) { return list[i].e; }
    }
    return list[list.length - 1].e;
  }

  /**
   * 固定题量的出题（每日挑战 / 错词复习）
   * @param {{entries:Array, mode:string, count:number, save:object, options:number, lang:string}} cfg
   */
  function buildQuestions(cfg) {
    var entries = cfg.entries || [];
    var save = cfg.save;
    var mode = cfg.mode || 'classic';
    var lang = cfg.lang || 'zh';
    var count = Math.min(cfg.count || 20, Math.max(entries.length, 1) * 3);
    var optCount = cfg.options || 3;
    var used = {};
    var out = [];
    for (var i = 0; i < count; i++) {
      var entry = weightedPick(entries, save, used);
      if (!entry) { used = {}; entry = weightedPick(entries, save, used); }
      if (!entry) { break; }
      used[entry.key] = true;
      out.push(buildQuestion(entry, mode, lang, optCount));
    }
    return out;
  }

  var lexicon = {
    WORLDS: WORLDS,
    MODES: MODES,
    MEANING_LANGS: MEANING_LANGS,
    init: init,
    worlds: function () { return WORLDS.slice(); },
    world: function (id) {
      for (var i = 0; i < WORLDS.length; i++) { if (WORLDS[i].id === id) { return WORLDS[i]; } }
      return null;
    },
    nextWorld: function (id) {
      for (var i = 0; i < WORLDS.length - 1; i++) { if (WORLDS[i].id === id) { return WORLDS[i + 1]; } }
      return null;
    },
    all: function () { init(); return all; },
    bandEntries: bandEntries,
    worldEntries: worldEntries,
    levelChunks: levelChunks,
    levelCount: levelCount,
    bossEntries: bossEntries,
    LEVEL_SIZE: LEVEL_SIZE,
    entry: function (key) { init(); return index[key] || null; },
    meaningOf: meaningOf,
    textOf: textOf,
    buildQuestion: buildQuestion,
    buildQuestions: buildQuestions,
    pickWeighted: pickWeighted,
    hasMeaning: function (lang) {
      if (lang === 'zh') { return true; }
      return !!(WN.MEANINGS && WN.MEANINGS[lang]);
    },
    count: function () { init(); return all.length; }
  };

  WN.lexicon = lexicon;
})(typeof window !== 'undefined' ? window : globalThis);
