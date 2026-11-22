/**
 * WORD NINJA — core utilities
 * 纯函数工具层：不依赖 DOM（供浏览器与 Node 单测共用）。
 * 通过 IIFE 挂载到全局命名空间 WN，避免构建步骤。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  var util = {};

  util.clamp = function (v, min, max) {
    return v < min ? min : (v > max ? max : v);
  };

  util.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /** 平滑插值：t 从 0→1 时结果从 a→b，且两端速度为 0 */
  util.smooth = function (a, b, t) {
    var x = util.clamp(t, 0, 1);
    return util.lerp(a, b, x * x * (3 - 2 * x));
  };

  util.rand = function (min, max) {
    return min + Math.random() * (max - min);
  };

  util.randInt = function (min, max) {
    return Math.floor(util.rand(min, max + 1));
  };

  util.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  util.chance = function (p) {
    return Math.random() < p;
  };

  util.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /** 可复现随机数（每日挑战需要同一天同题目） */
  util.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  util.hashString = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  /** 点到线段最短距离的平方 */
  util.segPointDist2 = function (x1, y1, x2, y2, px, py) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      var ax = px - x1, ay = py - y1;
      return ax * ax + ay * ay;
    }
    var t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var qx = x1 + t * dx, qy = y1 + t * dy;
    var ex = px - qx, ey = py - qy;
    return ex * ex + ey * ey;
  };

  /** 线段与圆是否相交（备用判定） */
  util.segCircleHit = function (x1, y1, x2, y2, cx, cy, r) {
    return util.segPointDist2(x1, y1, x2, y2, cx, cy) <= r * r;
  };

  /** 线段与轴对齐矩形是否相交（Liang–Barsky 裁剪） */
  util.segAabb = function (x1, y1, x2, y2, minX, minY, maxX, maxY) {
    var dx = x2 - x1, dy = y2 - y1;
    var t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) { return false; }
      } else {
        var t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) { return false; }
          if (t > t0) { t0 = t; }
        } else {
          if (t < t0) { return false; }
          if (t < t1) { t1 = t; }
        }
      }
    }
    return true;
  };

  /**
   * 线段与带旋转的矩形是否相交 —— 单词牌的切割判定。
   * 先把线段变换到牌子的局部坐标，再做线段-AABB 检测。
   */
  util.segRectHit = function (x1, y1, x2, y2, cx, cy, hw, hh, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var dx1 = x1 - cx, dy1 = y1 - cy;
    var dx2 = x2 - cx, dy2 = y2 - cy;
    var lx1 = dx1 * c + dy1 * s;
    var ly1 = -dx1 * s + dy1 * c;
    var lx2 = dx2 * c + dy2 * s;
    var ly2 = -dx2 * s + dy2 * c;
    return util.segAabb(lx1, ly1, lx2, ly2, -hw, -hh, hw, hh);
  };

  util.easeOutCubic = function (t) {
    var x = 1 - util.clamp(t, 0, 1);
    return 1 - x * x * x;
  };

  util.easeOutBack = function (t) {
    var x = util.clamp(t, 0, 1);
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  util.easeInQuad = function (t) {
    var x = util.clamp(t, 0, 1);
    return x * x;
  };

  util.roundRect = function (ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  };

  util.formatScore = function (n) {
    return String(Math.max(0, Math.round(n)));
  };

  util.pad2 = function (n) {
    return n < 10 ? '0' + n : String(n);
  };

  util.todayKey = function (date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + util.pad2(d.getMonth() + 1) + '-' + util.pad2(d.getDate());
  };

  util.now = function () {
    return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
  };

  util.textWidth = function (ctx, text, font) {
    var prev = ctx.font;
    ctx.font = font;
    var w = ctx.measureText(text).width;
    ctx.font = prev;
    return w;
  };

  WN.util = util;
})(typeof window !== 'undefined' ? window : globalThis);
