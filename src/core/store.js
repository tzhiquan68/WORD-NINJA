/**
 * WORD NINJA — 存档与本地持久化
 * v2：进度按「玩法模式 × 世界阶段」分开记录，支持 60 词阶段断点续切。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var KEY = 'wordninja.save.v1';   // 沿用同一个键，靠 version 迁移
  var VERSION = 2;

  function nowMs() { return Date.now(); }

  function emptyStages() {
    return { classic: {}, en2zh: {}, audio: {}, spell: {}, dictate: {} };
  }

  function emptySave() {
    return {
      version: VERSION,
      profile: { xp: 0, level: 1, createdAt: nowMs(), lastPlayedAt: 0, streakDays: 0, lastPlayDate: '' },
      words: {},
      wrongBook: [],
      stages: emptyStages(),
      titles: {},
      daily: { date: '', score: 0, done: false, attempts: 0, streak: 0 },
      dailyStats: {},
      goalReward: { date: '', xp: 0 },
      endless: { best: 0, runs: 0, bestAt: 0, bestCleared: 0 },
      stats: { sessions: 0, playSeconds: 0, totalSlices: 0, totalCorrect: 0, totalWrong: 0, maxCombo: 0 },
      settings: { sound: true, voice: true, haptics: true, lang: 'zh', meaningLang: 'zh', speed: 'normal', dailyGoal: 20 },
      events: []
    };
  }

  /** v1 的 levels（每世界 3 关 × 20 词）迁移到 v2 的 stages（每世界 1 阶段 × 60 词） */
  function migrateLevelsToStages(s, base) {
    var stages = emptyStages();
    var old = s.levels || {};
    var lex = root.WN && root.WN.lexicon;
    if (!lex || typeof lex.worlds !== 'function') { return stages; }

    var worlds = lex.worlds();
    var legacy = [
      { world: 'fruit', ids: ['fruit-1', 'fruit-2', 'fruit-3'], band: 'primary', offset: 0 },
      { world: 'forest', ids: ['forest-1', 'forest-2', 'forest-3'], band: 'junior', offset: 0 },
      { world: 'castle', ids: ['castle-1', 'castle-2', 'castle-3'], band: 'senior', offset: 0 },
      { world: 'space', ids: ['space-1', 'space-2', 'space-3'], band: 'cet4', offset: 0 },
      { world: 'ultimate', ids: ['space-4', 'space-5', 'space-6'], band: 'cet6', offset: 0 }
    ];

    for (var i = 0; i < legacy.length; i++) {
      var L = legacy[i];
      var city = lex.world && lex.world(L.world);
      if (!city) { continue; }
      var band = lex.bandEntries(L.band);
      if (!band.length) { continue; }
      var cleared = {};
      var count = 0, best = 0, stars = 0;
      for (var n = 0; n < L.ids.length; n++) {
        var rec = old[L.ids[n]];
        if (!rec) { continue; }
        best = Math.max(best, rec.bestScore || 0);
        stars = Math.max(stars, rec.stars || 0);
        if (rec.cleared) {
          var chunk = band.slice((L.offset + n) * 20, (L.offset + n) * 20 + 20);
          for (var k = 0; k < chunk.length; k++) {
            var key = chunk[k].level + ':' + chunk[k].word;
            if (!cleared[key]) { cleared[key] = true; count += 1; }
          }
        }
      }
      if (count > 0 || best > 0) {
        stages.classic[L.world] = {
          cleared: cleared,
          clearedCount: count,
          total: band.length,
          done: count >= band.length,
          bestScore: best,
          stars: stars,
          updatedAt: nowMs()
        };
      }
    }
    void base;
    return stages;
  }

  var store = {
    VERSION: VERSION,
    KEY: KEY,
    empty: emptySave,
    emptyStages: emptyStages,

    /** 迁移：v1 → v2；未知高版本先丢弃（备份由浏览器缓存兜底）。 */
    migrate: function (raw) {
      var s = raw;
      if (!s || typeof s !== 'object') { return emptySave(); }
      if (typeof s.version !== 'number') { s.version = 1; }
      if (s.version > VERSION) { return emptySave(); }

      var base = emptySave();
      ['profile', 'words', 'wrongBook', 'stages', 'daily', 'stats', 'settings', 'events', 'levels',
        'titles', 'dailyStats', 'goalReward', 'endless'].forEach(function (k) {
        if (s[k] === undefined || s[k] === null) { s[k] = base[k]; }
      });

      // 嵌套补默认值
      ['profile', 'daily', 'stats', 'settings'].forEach(function (k) {
        var merged = {};
        var dk;
        for (dk in base[k]) { merged[dk] = base[k][dk]; }
        for (dk in s[k]) { if (s[k][dk] !== undefined) { merged[dk] = s[k][dk]; } }
        s[k] = merged;
      });

      if (s.version < 2) {
        s.stages = migrateLevelsToStages(s, base);
        delete s.levels;
      }
      // stages 结构兜底
      if (!s.stages || typeof s.stages !== 'object') { s.stages = emptyStages(); }
      ['classic', 'en2zh', 'audio'].forEach(function (m) {
        if (!s.stages[m] || typeof s.stages[m] !== 'object') { s.stages[m] = {}; }
      });

      if (['zh', 'en', 'es', 'ja', 'ko'].indexOf(s.settings.lang) < 0) { s.settings.lang = 'zh'; }
      if (['zh', 'en', 'es', 'ja', 'ko'].indexOf(s.settings.meaningLang) < 0) { s.settings.meaningLang = s.settings.lang || 'zh'; }
      if (['slow', 'normal', 'fast'].indexOf(s.settings.speed) < 0) { s.settings.speed = 'normal'; }
      if (s.profile.level === undefined) { s.profile.level = 1; }

      // v3：SRS 间隔调整（1 级从 10 分钟改成 1 天）。老存档里已写的 dueAt 按新间隔重算一次，
      // 否则一通关就会看到几百个"待复习"砸下来。
      if (!s.migrated || s.migrated.srs !== 3) {
        var iv = (root.WN && root.WN.srs && root.WN.srs.INTERVALS) || [300000, 86400000, 259200000, 604800000, 1209600000, 2592000000];
        Object.keys(s.words || {}).forEach(function (k) {
          var w = s.words[k];
          if (!w || !w.lastAt) { return; }
          var m = Math.max(0, Math.min(5, w.mastery || 0));
          w.dueAt = w.lastAt + iv[m];
        });
        s.migrated = s.migrated || {};
        s.migrated.srs = 3;
      }

      s.version = VERSION;
      return s;
    },

    load: function () {
      var raw = null;
      try {
        raw = root.localStorage ? root.localStorage.getItem(KEY) : null;
      } catch (e) { raw = null; }
      if (!raw) { return emptySave(); }
      try {
        return store.migrate(JSON.parse(raw));
      } catch (e) {
        return emptySave();
      }
    },

    save: function (s) {
      try {
        if (root.localStorage) { root.localStorage.setItem(KEY, JSON.stringify(s)); }
        return true;
      } catch (e) {
        return false;
      }
    },

    reset: function () {
      try {
        if (root.localStorage) { root.localStorage.removeItem(KEY); }
      } catch (e) { /* ignore */ }
      return emptySave();
    },

    exportText: function (s) { return JSON.stringify(s, null, 2); },

    importText: function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { return { ok: false, reason: 'json' }; }
      if (!data || typeof data !== 'object') { return { ok: false, reason: 'shape' }; }
      if (!data.profile || !data.words || !data.stats) { return { ok: false, reason: 'shape' }; }
      var merged = store.migrate(data);
      store.save(merged);
      return { ok: true, save: merged };
    },

    // ---------------- 阶段进度 ----------------

    /** 取（或创建）某模式某世界的阶段记录 */
    stageOf: function (s, mode, worldId) {
      var m = s.stages[mode] || (s.stages[mode] = {});
      if (!m[worldId]) {
        m[worldId] = { cleared: {}, clearedCount: 0, total: 0, done: false, bestScore: 0, stars: 0, updatedAt: 0 };
      }
      return m[worldId];
    },

    stageProgress: function (s, mode, worldId, total) {
      var rec = store.stageOf(s, mode, worldId);
      var n = 0;
      for (var k in rec.cleared) { if (rec.cleared[k]) { n += 1; } }
      if (typeof rec.clearedCount !== 'number' || rec.clearedCount !== n) { rec.clearedCount = n; }
      rec.total = total || rec.total || 0;
      var pct = rec.total ? Math.round((n / rec.total) * 100) : 0;
      // 60 个词全切完即使没走到结算页，也算通关
      var done = !!(rec.done || (rec.total > 0 && n >= rec.total));
      return { cleared: n, total: rec.total, percent: pct, done: done, stars: rec.stars || 0, bestScore: rec.bestScore || 0, rec: rec };
    },

    markCleared: function (s, mode, worldId, key) {
      var rec = store.stageOf(s, mode, worldId);
      if (!rec.cleared[key]) {
        rec.cleared[key] = true;
        rec.clearedCount = (rec.clearedCount || 0) + 1;
      }
      rec.updatedAt = nowMs();
      return rec.clearedCount;
    },

    /** Boss 关通关：授予阶段称号 */
    markBossCleared: function (s, mode, worldId, titleKey, stars) {
      var rec = store.stageOf(s, mode, worldId);
      rec.bossCleared = true;
      rec.bossStars = Math.max(rec.bossStars || 0, stars || 0);
      rec.updatedAt = nowMs();
      if (!s.titles) { s.titles = {}; }
      if (!s.titles[worldId]) {
        s.titles[worldId] = { key: titleKey, stars: stars || 0, at: nowMs() };
      } else {
        s.titles[worldId].stars = Math.max(s.titles[worldId].stars || 0, stars || 0);
      }
      return rec;
    },

    titleOf: function (s, worldId) {
      return (s && s.titles && s.titles[worldId]) || null;
    },

    /**
     * 下一个世界是否解锁：上一阶段**切完第 1 关**即可，不要求刷完整个词库。
     * 词库现在有 600+ 词，要求全清才解锁下一阶段会把考试内容挡在门外。
     */
    stageUnlocked: function (s, mode, worldId, worlds) {
      var list = worlds || (root.WN.lexicon ? root.WN.lexicon.worlds() : []);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== worldId) { continue; }
        if (i === 0) { return true; }
        var prev = store.stageProgress(s, mode, list[i - 1].id, 0);
        var need = Math.min(20, prev.total || 20);
        return prev.cleared >= need;
      }
      return false;
    },

    /**
     * 阶段内的关卡状态。
     * 词级进度是唯一真源：上一关的词全切完，下一关才解锁。
     * @param {Array<Array>} chunks 每关的词条数组（由 lexicon.levelChunks 提供）
     */
    levelStates: function (s, mode, worldId, chunks) {
      var rec = store.stageOf(s, mode, worldId);
      var out = [];
      var prevDone = true;
      for (var i = 0; i < chunks.length; i++) {
        var keys = chunks[i];
        var cleared = 0;
        for (var k = 0; k < keys.length; k++) {
          if (rec.cleared[keys[k].key]) { cleared += 1; }
        }
        var total = keys.length;
        var done = total > 0 && cleared >= total;
        out.push({
          index: i + 1,
          cleared: cleared,
          total: total,
          done: done,
          unlocked: prevDone,
          percent: total ? Math.round((cleared / total) * 100) : 0
        });
        prevDone = prevDone && done;
      }
      // Boss 关：本阶段最后一关，限时挑战。它不能按"词是否切过"推导
      // （Boss 词都来自本阶段，早就切过了），所以用单独的 bossCleared 标记。
      if (chunks.length) {
        var bossDone = !!rec.bossCleared;
        out.push({
          index: chunks.length + 1,
          cleared: bossDone ? 1 : 0,
          total: 1,
          done: bossDone,
          unlocked: prevDone,
          percent: bossDone ? 100 : 0,
          boss: true
        });
      }
      return out;
    },

    /** 整个阶段是否已全部切完 */
    stageDone: function (s, mode, worldId, chunks) {
      var states = store.levelStates(s, mode, worldId, chunks);
      if (!states.length) { return false; }
      for (var i = 0; i < states.length; i++) { if (!states[i].done) { return false; } }
      return true;
    },

    // ---------------- 其他 ----------------

    logEvent: function (s, type, payload) {
      if (!s.events) { s.events = []; }
      s.events.push({ t: nowMs(), type: type, p: payload || null });
      if (s.events.length > 500) { s.events.splice(0, s.events.length - 500); }
    },

    touchStreak: function (s) {
      var util = WN.util;
      var today = util.todayKey();
      var p = s.profile;
      if (p.lastPlayDate === today) { return p.streakDays; }
      var y = new Date();
      y.setDate(y.getDate() - 1);
      var yesterday = util.todayKey(y);
      p.streakDays = (p.lastPlayDate === yesterday) ? (p.streakDays || 0) + 1 : 1;
      p.lastPlayDate = today;
      return p.streakDays;
    },

    addWrong: function (s, key) {
      var found = null;
      for (var i = 0; i < s.wrongBook.length; i++) {
        if (s.wrongBook[i].key === key) { found = s.wrongBook[i]; break; }
      }
      if (found) {
        found.wrongCount = (found.wrongCount || 0) + 1;
        found.lastAt = nowMs();
      } else {
        s.wrongBook.push({ key: key, wrongCount: 1, lastAt: nowMs() });
      }
    },

    removeWrong: function (s, key) {
      for (var i = s.wrongBook.length - 1; i >= 0; i--) {
        if (s.wrongBook[i].key === key) { s.wrongBook.splice(i, 1); }
      }
    },

    addXp: function (s, amount) {
      var p = s.profile;
      p.xp += amount;
      p.level = 1 + Math.floor(Math.sqrt(p.xp / 60));
      return p.level;
    }
  };

  WN.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
