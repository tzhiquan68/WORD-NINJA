/**
 * WORD NINJA — SRS（间隔重复与熟练度）
 * 纯逻辑，可在 Node 中单测。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  // mastery 0..5 对应的复习间隔
  // 0 是"答错的词"，5 分钟后再来；1 是"刚学对一次"，隔天再见。
  // 早期版本 1 级只隔 10 分钟，导致通关一关后立刻全部到期（待复习暴涨），已修正。
  var INTERVALS = [5 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var MAX_MASTERY = 5;

  function keyOf(entry) {
    return entry.level + ':' + entry.word;
  }

  function get(save, key) {
    return save.words[key] || null;
  }

  function ensure(save, key) {
    if (!save.words[key]) {
      save.words[key] = {
        seen: 0, correct: 0, wrong: 0, streak: 0,
        mastery: 0, dueAt: 0, lastAt: 0
      };
    }
    return save.words[key];
  }

  var srs = {
    INTERVALS: INTERVALS,
    MAX_MASTERY: MAX_MASTERY,
    DAY: DAY,
    keyOf: keyOf,
    get: get,
    ensure: ensure,

    /**
     * 记录一次作答。
     * @returns {{mastery:number, delta:number, dueAt:number, leveledUp:boolean}}
     */
    record: function (save, key, correct, now) {
      var t = now || Date.now();
      var w = ensure(save, key);
      var before = w.mastery;
      w.seen += 1;
      w.lastAt = t;
      if (correct) {
        w.correct += 1;
        w.streak += 1;
        w.mastery = Math.min(MAX_MASTERY, w.mastery + 1);
      } else {
        w.wrong += 1;
        w.streak = 0;
        w.mastery = 0;
      }
      w.dueAt = t + INTERVALS[w.mastery];

      // 按天累计作答量，供"7 天趋势"使用
      try {
        var today = WN.util.todayKey(new Date(t));
        var ds = save.dailyStats || (save.dailyStats = {});
        var day = ds[today] || (ds[today] = { a: 0, c: 0 });
        day.a += 1;
        if (correct) { day.c += 1; }
      } catch (e) { /* 统计失败不影响主流程 */ }

      return {
        mastery: w.mastery,
        delta: w.mastery - before,
        dueAt: w.dueAt,
        leveledUp: w.mastery > before
      };
    },

    /** 是否已到复习时间（未学过的词视为到期） */
    isDue: function (save, key, now) {
      var w = get(save, key);
      if (!w) { return true; }
      return (now || Date.now()) >= (w.dueAt || 0);
    },

    /** 掌握百分比：mastery / 5 的平均值 */
    masteryPercent: function (save, entries) {
      if (!entries || !entries.length) { return 0; }
      var sum = 0;
      for (var i = 0; i < entries.length; i++) {
        var w = get(save, keyOf(entries[i]));
        sum += w ? Math.min(w.mastery, MAX_MASTERY) : 0;
      }
      return Math.round((sum / (entries.length * MAX_MASTERY)) * 100);
    },

    /** 已掌握词数（mastery >= 4） */
    countMastered: function (save, entries) {
      var n = 0;
      for (var i = 0; i < entries.length; i++) {
        var w = get(save, keyOf(entries[i]));
        if (w && w.mastery >= 4) { n += 1; }
      }
      return n;
    },

    /**
     * 今天该复习的词：学过但没到 mastery 4、且已到期，按到期时间排序。
     * 没学过的词不算"到期"——它们属于新词，走正常关卡。
     */
    dueList: function (save, entries, limit, now) {
      var t = now || Date.now();
      var out = [];
      for (var i = 0; i < entries.length; i++) {
        var k = keyOf(entries[i]);
        var w = get(save, k);
        if (!w || w.seen <= 0 || w.mastery >= 4) { continue; }
        if ((w.dueAt || 0) <= t) { out.push({ entry: entries[i], dueAt: w.dueAt || 0 }); }
      }
      out.sort(function (a, b) { return a.dueAt - b.dueAt; });
      var list = out.map(function (x) { return x.entry; });
      return limit ? list.slice(0, limit) : list;
    },

    /** 掌握度分布：未学 / 学习中 / 已掌握 */
    buckets: function (save, entries) {
      var b = { total: entries.length, fresh: 0, learning: 0, mastered: 0 };
      for (var i = 0; i < entries.length; i++) {
        var w = get(save, keyOf(entries[i]));
        if (!w || !w.seen) { b.fresh += 1; }
        else if (w.mastery >= 4) { b.mastered += 1; }
        else { b.learning += 1; }
      }
      return b;
    },

    /**
     * 出题权重：没见过 4；到期 3；曾错 2.5；已掌握 0.6（降频）。
     * 让"不会的、该复习的"优先出现，符合授权书第八章。
     */
    weightFor: function (save, key, now) {
      var w = get(save, key);
      var t = now || Date.now();
      if (!w || w.seen === 0) { return 4; }
      if (w.mastery >= 4) { return 0.6; }
      if (w.wrong > 0 && w.mastery < 2) { return 3.5; }
      if (t >= (w.dueAt || 0)) { return 3; }
      return 1.2;
    },

    weightForEntry: function (save, entry, now) {
      return srs.weightFor(save, keyOf(entry), now);
    },

    /** 复习间隔表（供存档迁移复用，避免两处写死） */
    INTERVALS: INTERVALS,
    MAX_MASTERY: MAX_MASTERY,

    /** 待复习数量（到期、学过、且没到 mastery 4） */
    dueCount: function (save, entries, now) {
      var t = now || Date.now();
      var n = 0;
      for (var i = 0; i < entries.length; i++) {
        var w = get(save, keyOf(entries[i]));
        if (w && w.seen > 0 && (w.mastery || 0) < 4 && t >= (w.dueAt || 0)) { n += 1; }
      }
      return n;
    }
  };

  WN.srs = srs;
})(typeof window !== 'undefined' ? window : globalThis);
