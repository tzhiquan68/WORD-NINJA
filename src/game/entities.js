/**
 * WORD NINJA — 游戏实体（单词牌 / 炸弹 / 切开的半片 / 粒子 / 飘字）
 * 纯数据对象 + 更新函数，不依赖 DOM，便于单测。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;

  // 统一色系：蓝 / 青 / 紫 / 粉（冷色调为主，正确与否不靠颜色区分）
  var COLORS = {
    primary: { key: 'primary', top: '#8fdcff', bottom: '#2f8fe8', edge: '#15508f', text: '#ffffff', glow: '#7ecdff' },
    junior: { key: 'junior', top: '#8ef0c6', bottom: '#22a273', edge: '#0d6647', text: '#ffffff', glow: '#6fe6b4' },
    senior: { key: 'senior', top: '#c6aaff', bottom: '#7250e0', edge: '#3f2599', text: '#ffffff', glow: '#a98cff' },
    cet4: { key: 'cet4', top: '#9fe6ff', bottom: '#2a7ddb', edge: '#124c93', text: '#ffffff', glow: '#7fd4ff' },
    cet6: { key: 'cet6', top: '#ffb0d8', bottom: '#e0447f', edge: '#931c4c', text: '#ffffff', glow: '#ff8fc4' },
    bomb: { key: 'bomb', top: '#5c6270', bottom: '#1b1f27', edge: '#080a0f', text: '#fff', glow: '#ff6a3d' },
    bonus: { key: 'bonus', top: '#fff2b0', bottom: '#ffc247', edge: '#b87400', text: '#3a2400', glow: '#ffd76a' }
  };

  var entities = {
    COLORS: COLORS,

    colorFor: function (level) {
      return COLORS[level] || COLORS.primary;
    },

    createTile: function (cfg) {
      return {
        kind: cfg.kind || 'word',
        text: cfg.text || '',
        entry: cfg.entry || null,
        correct: !!cfg.correct,
        x: cfg.x, y: cfg.y,
        vx: cfg.vx || 0, vy: cfg.vy || 0,
        angle: cfg.angle || 0,
        spin: cfg.spin || 0,
        w: cfg.w, h: cfg.h,
        fs: cfg.fs,
        color: cfg.color || COLORS.primary,
        delay: cfg.delay || 0,
        entered: false,
        sliced: false,
        exiting: false,
        exitT: 0,
        alpha: 1,
        bob: Math.random() * Math.PI * 2,
        dead: false
      };
    },

    /** 单词牌物理；g 为重力加速度（逻辑像素/秒²） */
    updateTile: function (t, dt, g, W, H) {
      if (t.delay > 0) {
        t.delay -= dt * 1000;
        return;
      }
      t.vy += g * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.angle += t.spin * dt;
      t.bob += dt * 3;
      if (t.y < H * 0.98) { t.entered = true; }
      if (t.exiting) {
        t.exitT += dt;
        t.alpha = Math.max(0, 1 - t.exitT * 2.6);
        if (t.alpha <= 0) { t.dead = true; }
      }
      // 只在真正进入画面后才判定"掉出屏幕"，避免出生点误判
      if (t.entered && t.y > H + t.h * 2.2) { t.dead = true; }
      if (t.x < -t.w * 2 || t.x > W + t.w * 2) { t.dead = true; }
    },

    /** 切中后把牌子分成两片，沿切割法线飞离 */
    splitTile: function (t, seg, outHalves) {
      var dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;      // 法线方向
      var ang = Math.atan2(dy, dx);
      var localSeg = entities._toLocal(seg, t);
      var push = 220;
      var base = {
        w: t.w, h: t.h, fs: t.fs, text: t.text, color: t.color,
        entry: t.entry, kind: t.kind,
        localSeg: localSeg,
        life: 0,
        alpha: 1
      };
      for (var s = -1; s <= 1; s += 2) {
        var half = {
          w: base.w, h: base.h, fs: base.fs, text: base.text, color: base.color,
          entry: base.entry, kind: base.kind, localSeg: base.localSeg,
          side: s, life: 0, alpha: 1,
          x: t.x, y: t.y, angle: t.angle,
          vx: t.vx + nx * push * s * 0.9 + dx / len * 60,
          vy: t.vy + ny * push * s * 0.9 - 40,
          spin: t.spin + (s > 0 ? 2.6 : -2.6),
          dead: false
        };
        outHalves.push(half);
      }
    },

    _toLocal: function (seg, t) {
      var c = Math.cos(t.angle), s = Math.sin(t.angle);
      function loc(x, y) {
        var dx = x - t.x, dy = y - t.y;
        return { x: dx * c + dy * s, y: -dx * s + dy * c };
      }
      var a = loc(seg.x1, seg.y1);
      var b = loc(seg.x2, seg.y2);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    },

    updateHalf: function (h, dt, g) {
      h.vy += g * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.angle += h.spin * dt;
      h.life += dt;
      if (h.life > 1.6) { h.alpha = Math.max(0, 1 - (h.life - 1.6) / 0.6); }
      if (h.alpha <= 0 || h.y > 4000) { h.dead = true; }
    },

    spawnBurst: function (out, x, y, color, count, speed, size) {
      for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2;
        var v = util.rand(speed * 0.25, speed);
        out.push({
          x: x, y: y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - speed * 0.15,
          size: util.rand(size * 0.5, size),
          color: color,
          life: util.rand(0.45, 1.05),
          maxLife: 1.05,
          kind: Math.random() < 0.22 ? 'spark' : 'drop',
          rot: Math.random() * Math.PI * 2,
          spin: util.rand(-6, 6)
        });
      }
    },

    /** 冲击波光环（不参与重力，纯视觉） */
    spawnRing: function (out, x, y, color, size) {
      out.push({
        x: x, y: y, vx: 0, vy: 0,
        size: size || 60,
        color: color || 'rgba(160, 230, 255, 0.8)',
        life: 0.32, maxLife: 0.32,
        kind: 'ring', rot: 0, spin: 0
      });
    },

    updateParticles: function (arr, dt, g) {
      for (var i = arr.length - 1; i >= 0; i--) {
        var p = arr[i];
        p.life -= dt;
        if (p.life <= 0) { arr.splice(i, 1); continue; }
        if (p.kind === 'ring') { continue; }
        p.vy += g * 0.55 * dt;
        p.vx *= (1 - 1.4 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
    },

    addFloat: function (out, x, y, text, color, size, vy) {
      out.push({
        x: x, y: y, text: text, color: color || '#ffffff',
        size: size || 46, life: 1.0, maxLife: 1.0, vy: vy || -120
      });
    },

    updateFloats: function (arr, dt) {
      for (var i = arr.length - 1; i >= 0; i--) {
        var f = arr[i];
        f.life -= dt;
        f.y += f.vy * dt;
        f.vy *= (1 - 1.2 * dt);
        if (f.life <= 0) { arr.splice(i, 1); }
      }
    }
  };

  WN.entities = entities;
})(typeof window !== 'undefined' ? window : globalThis);
