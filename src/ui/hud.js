/**
 * WORD NINJA — 游戏内 HUD（画在 Canvas 上，与游戏同坐标系）
 *
 * 视觉规范（v2.0）：
 *  - 生命：立体光泽爱心，失去时缩放反馈
 *  - 分数：得分瞬间弹跳 + 柔光
 *  - 进度：胶囊进度条 + 高光进度头
 *  - 连击：金色 ×N，命中时放大
 *  - 暂停：玻璃拟态圆钮
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;
  var render = WN.render;
  var T = function (k, v) { return WN.i18n.t(k, v); };

  function layout(scene) {
    var W = scene.W, H = scene.H;
    return {
      heartY: H * 0.052,
      heartX: W * 0.068,
      heartSize: H * 0.031,
      heartGap: H * 0.054,
      pause: { x: W * 0.915, y: H * 0.052, r: H * 0.026 },
      card: { x: W * 0.055, y: H * 0.108, w: W * 0.89, h: H * 0.132 },
      speaker: { x: W * 0.055 + W * 0.89 - H * 0.055, y: H * 0.108 + H * 0.066, r: H * 0.030 },
      rowY: H * 0.288,
      bar: { x: W * 0.066, y: H * 0.288 + H * 0.052, w: W * 0.868, h: H * 0.0115 }
    };
  }

  // 动画状态（只影响表现，不影响逻辑）
  var anim = {
    score: -1, scoreAt: 0,
    lives: -1, lifeAt: 0,
    combo: 0, comboAt: 0,
    hearts: 3
  };

  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.38);
    ctx.bezierCurveTo(-s * 0.12, s * 0.05, -s * 0.56, -s * 0.13, -s * 0.5, -s * 0.43);
    ctx.bezierCurveTo(-s * 0.45, -s * 0.73, -s * 0.05, -s * 0.73, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.05, -s * 0.73, s * 0.45, -s * 0.73, s * 0.5, -s * 0.43);
    ctx.bezierCurveTo(s * 0.56, -s * 0.13, s * 0.12, s * 0.05, 0, s * 0.38);
    ctx.closePath();
  }

  function drawHeart(ctx, x, y, s, filled, scale) {
    ctx.save();
    ctx.translate(x, y);
    if (scale && scale !== 1) { ctx.scale(scale, scale); }

    if (filled) {
      ctx.shadowColor = 'rgba(255, 60, 90, 0.45)';
      ctx.shadowBlur = s * 0.85;
      var g = ctx.createLinearGradient(0, -s * 0.7, 0, s * 0.4);
      g.addColorStop(0, '#ff9fae');
      g.addColorStop(0.45, '#f6455f');
      g.addColorStop(1, '#c31a35');
      ctx.fillStyle = g;
      heartPath(ctx, s);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // 高光
      ctx.save();
      heartPath(ctx, s);
      ctx.clip();
      var hl = ctx.createRadialGradient(-s * 0.22, -s * 0.42, 0, -s * 0.22, -s * 0.42, s * 0.6);
      hl.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
      hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hl;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      heartPath(ctx, s);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      heartPath(ctx, s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      heartPath(ctx, s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 玻璃拟态圆钮 */
  function drawPause(ctx, x, y, r) {
    ctx.save();
    // 外发光
    var halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 1.9);
    halo.addColorStop(0, 'rgba(120, 200, 255, 0.18)');
    halo.addColorStop(1, 'rgba(120, 200, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();

    // 玻璃底
    var g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(210, 235, 255, 0.42)';
    ctx.lineWidth = Math.max(1.6, r * 0.07);
    ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, Math.PI * 2); ctx.stroke();

    // 顶部高光弧
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = Math.max(1.4, r * 0.06);
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();

    // 双竖条
    ctx.fillStyle = 'rgba(240, 250, 255, 0.95)';
    var bw = r * 0.17, bh = r * 0.68;
    util.roundRect(ctx, x - r * 0.34, y - bh / 2, bw, bh, bw * 0.45);
    ctx.fill();
    util.roundRect(ctx, x + r * 0.17, y - bh / 2, bw, bh, bw * 0.45);
    ctx.fill();
    ctx.restore();
  }

  function drawSpeaker(ctx, x, y, r, pulse) {
    ctx.save();
    var halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
    halo.addColorStop(0, 'rgba(140, 220, 255, ' + (0.18 + pulse * 0.25) + ')');
    halo.addColorStop(1, 'rgba(140, 220, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();

    var g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
    g.addColorStop(1, 'rgba(140, 210, 255, 0.14)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * (1 + pulse * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170, 230, 255, ' + (0.55 + pulse * 0.4) + ')';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.stroke();

    ctx.fillStyle = '#eaf8ff';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y - r * 0.19);
    ctx.lineTo(x - r * 0.13, y - r * 0.19);
    ctx.lineTo(x + r * 0.14, y - r * 0.44);
    ctx.lineTo(x + r * 0.14, y + r * 0.44);
    ctx.lineTo(x - r * 0.13, y + r * 0.19);
    ctx.lineTo(x - r * 0.42, y + r * 0.19);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eaf8ff';
    ctx.lineWidth = Math.max(1.6, r * 0.075);
    ctx.beginPath(); ctx.arc(x + r * 0.2, y, r * 0.36, -0.7, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r * 0.2, y, r * 0.58, -0.62, 0.62); ctx.stroke();
    ctx.restore();
  }

  var hud = {
    layout: layout,

    draw: function (ctx, scene, now) {
      var L = layout(scene);
      var W = scene.W, H = scene.H;
      ctx.save();

      // 顶部压暗，保证 HUD 在亮背景上也可读
      var scrim = ctx.createLinearGradient(0, 0, 0, H * 0.30);
      scrim.addColorStop(0, 'rgba(4, 8, 20, 0.42)');
      scrim.addColorStop(1, 'rgba(4, 8, 20, 0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H * 0.30);

      // Boss 关：时间越少，屏幕边缘红色脉冲越强
      if (scene.timeLimit > 0) {
        var leftSec = Math.max(0, scene.timeLeft);
        var urgent = leftSec <= 15 ? 1 : Math.max(0, 0.45 - leftSec / 200);
        if (urgent > 0.01) {
          var beat = 0.5 + 0.5 * Math.sin(now * (leftSec <= 15 ? 0.016 : 0.007));
          var pg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.26, W / 2, H * 0.5, H * 0.80);
          pg.addColorStop(0, 'rgba(255, 60, 40, 0)');
          pg.addColorStop(1, 'rgba(255, 52, 36, ' + (urgent * (0.16 + beat * 0.26)).toFixed(3) + ')');
          ctx.fillStyle = pg;
          ctx.fillRect(0, 0, W, H);
        }
      }

      // ---------- 生命 ----------
      if (anim.lives !== scene.lives) {
        if (scene.lives < anim.lives && anim.lives >= 0) { anim.lifeAt = now; }
        anim.lives = scene.lives;
      }
      var hearts = Math.max(3, Math.min(6, scene.maxLives || 3));
      anim.hearts = hearts;
      for (var i = 0; i < hearts; i++) {
        var filled = i < scene.lives;
        var scale = 1;
        if (!filled) {
          var t = Math.max(0, 1 - (now - anim.lifeAt) / 420);
          scale = 1 + 0.42 * t * t;
        }
        drawHeart(ctx, L.heartX + i * L.heartGap, L.heartY, L.heartSize, filled, scale);
      }

      // ---------- 暂停 ----------
      drawPause(ctx, L.pause.x, L.pause.y, L.pause.r);

      // ---------- 题目卡 ----------
      if (scene.currentQ && scene.promptVisible) {
        var card = L.card;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = H * 0.035;
        ctx.shadowOffsetY = H * 0.008;
        var cardGrad = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.h);
        cardGrad.addColorStop(0, 'rgba(16, 27, 51, 0.97)');
        cardGrad.addColorStop(1, 'rgba(8, 15, 32, 0.97)');
        ctx.fillStyle = cardGrad;
        util.roundRect(ctx, card.x, card.y, card.w, card.h, card.h * 0.30);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(140, 205, 255, 0.30)';
        ctx.lineWidth = Math.max(2, H * 0.0022);
        util.roundRect(ctx, card.x, card.y, card.w, card.h, card.h * 0.30);
        ctx.stroke();
        // 内侧高光
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = Math.max(1, H * 0.0012);
        util.roundRect(ctx, card.x + 3, card.y + 3, card.w - 6, card.h - 6, card.h * 0.28);
        ctx.stroke();
        ctx.restore();

        var q = scene.currentQ;
        var cx = card.x + card.w / 2;
        var label = q.mode === 'classic' ? T('game.mode.classic')
          : (q.mode === 'en2zh' ? T('game.mode.en2zh') : T('game.mode.audio'));
        if (scene.cfg && scene.cfg.boss) { label = T('boss.level'); }
        if (scene.cfg && scene.cfg.kind === 'endless') { label = T('home.endless'); }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = render.font(H * 0.019, '600');
        ctx.fillStyle = 'rgba(150, 205, 255, 0.8)';
        ctx.fillText(label.toUpperCase(), card.x + H * 0.032, card.y + H * 0.032);

        if (q.mode === 'audio' && scene.audioFailed) {
          var word = q.entry.word;
          var fsz = H * 0.052;
          ctx.font = render.font(fsz);
          var ww = ctx.measureText(word).width;
          if (ww > card.w * 0.84) {
            fsz = fsz * (card.w * 0.84) / ww;
            ctx.font = render.font(fsz);
          }
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillText(word, cx, card.y + card.h * 0.62 + 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(word, cx, card.y + card.h * 0.62);
          ctx.font = render.font(H * 0.019, '600');
          ctx.fillStyle = 'rgba(255, 191, 120, 0.95)';
          ctx.fillText(T('game.audioFallback'), cx, card.y + card.h * 0.87);
        } else if (q.mode === 'audio') {
          var playing = WN.audio && WN.audio.speaking;
          drawSpeaker(ctx, cx, card.y + card.h * 0.54, H * 0.042,
            Math.max(scene.speakerPulse, playing ? 0.55 + Math.sin(now * 0.012) * 0.25 : 0));
          ctx.textAlign = 'center';
          ctx.font = render.font(H * 0.022, '600');
          ctx.fillStyle = 'rgba(220, 240, 255, 0.8)';
          ctx.fillText(playing ? T('game.playing') : T('game.tapToHear'), cx, card.y + card.h * 0.87);
        } else {
          var text = q.prompt || (q.mode === 'en2zh' ? q.entry.word : q.entry.zh);
          var fs = H * 0.056;
          ctx.font = render.font(fs);
          var tw = ctx.measureText(text).width;
          var maxW = card.w * 0.84;
          if (tw > maxW) {
            fs = fs * maxW / tw;
            ctx.font = render.font(fs);
          }
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillText(text, cx, card.y + card.h * 0.66 + 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, cx, card.y + card.h * 0.66);
        }
      }

      // ---------- 分数 ----------
      if (anim.score !== scene.score) {
        if (scene.score > anim.score && anim.score >= 0) { anim.scoreAt = now; }
        anim.score = scene.score;
      }
      var sdt = now - anim.scoreAt;
      var pop = sdt < 280 ? 1 + 0.16 * Math.sin((sdt / 280) * Math.PI) : 1;

      var rowY = L.rowY;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = render.font(H * 0.017, '700');
      ctx.fillStyle = 'rgba(160, 200, 240, 0.7)';
      ctx.fillText(T('game.score').toUpperCase(), W * 0.066, rowY - H * 0.024);

      ctx.save();
      ctx.translate(W * 0.066, rowY + H * 0.012);
      ctx.scale(pop, pop);
      ctx.textAlign = 'left';
      ctx.font = render.font(H * 0.044, '800');
      if (sdt < 320) {
        ctx.shadowColor = 'rgba(150, 220, 255, 0.75)';
        ctx.shadowBlur = H * 0.02 * (1 - sdt / 320);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(util.formatScore(scene.score), 0, 0);
      ctx.restore();

      // ---------- 连击 ----------
      if (scene.combo > 0) {
        if (anim.combo !== scene.combo) { anim.comboAt = now; anim.combo = scene.combo; }
        var cdt = now - anim.comboAt;
        var cpop = cdt < 260 ? 1 + 0.3 * Math.sin((cdt / 260) * Math.PI) : 1;
        var mult = scene._multiplier();
        ctx.textAlign = 'right';
        ctx.font = render.font(H * 0.017, '700');
        ctx.fillStyle = 'rgba(255, 214, 130, 0.85)';
        ctx.fillText('COMBO', W * 0.934, rowY - H * 0.024);
        ctx.save();
        ctx.translate(W * 0.934, rowY + H * 0.012);
        ctx.scale(cpop, cpop);
        ctx.textAlign = 'right';
        ctx.font = render.font(H * 0.046, '800');
        ctx.shadowColor = 'rgba(255, 190, 90, 0.6)';
        ctx.shadowBlur = H * 0.014;
        ctx.fillStyle = '#ffd76a';
        ctx.fillText('×' + mult, 0, 0);
        ctx.restore();
        // 连击小段进度
        var frac = (scene.combo % 3) / 3;
        var bw2 = W * 0.13, bh2 = H * 0.006;
        var bx2 = W * 0.934 - bw2, by2 = rowY + H * 0.046;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        util.roundRect(ctx, bx2, by2, bw2, bh2, bh2 / 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 214, 130, 0.95)';
        util.roundRect(ctx, bx2 + bw2 - Math.max(bh2, bw2 * frac), by2, Math.max(bh2, bw2 * frac), bh2, bh2 / 2);
        ctx.fill();
      } else {
        anim.combo = 0;
      }

      // ---------- 进度条 ----------
      var p = scene.progress();
      var isEndless = scene.cfg && scene.cfg.kind === 'endless';
      var fracP = isEndless ? Math.min(1, p.cleared / 60) : (p.total ? p.cleared / p.total : 0);
      var bar = L.bar;

      ctx.textAlign = 'center';
      ctx.font = render.font(H * 0.022, '700');
      ctx.fillStyle = 'rgba(215, 235, 255, 0.85)';
      ctx.fillText(isEndless ? (p.cleared + ' ' + T('game.wordsUnit')) : (p.cleared + ' / ' + p.total),
        W * 0.5, rowY + H * 0.030);

      ctx.fillStyle = 'rgba(8, 16, 32, 0.55)';
      util.roundRect(ctx, bar.x, bar.y, bar.w, bar.h, bar.h / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.20)';
      ctx.lineWidth = Math.max(1, H * 0.0015);
      util.roundRect(ctx, bar.x, bar.y, bar.w, bar.h, bar.h / 2);
      ctx.stroke();

      if (fracP > 0) {
        var fillW = Math.max(bar.h, bar.w * Math.min(1, fracP));
        var fg = ctx.createLinearGradient(bar.x, 0, bar.x + fillW, 0);
        fg.addColorStop(0, '#4fd1ff');
        fg.addColorStop(0.55, '#6f8bff');
        fg.addColorStop(1, '#b07bff');
        ctx.save();
        ctx.shadowColor = 'rgba(90, 190, 255, 0.65)';
        ctx.shadowBlur = H * 0.012;
        ctx.fillStyle = fg;
        util.roundRect(ctx, bar.x, bar.y, fillW, bar.h, bar.h / 2);
        ctx.fill();
        ctx.restore();
        // 进度头高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(bar.x + fillW - bar.h * 0.5, bar.y + bar.h / 2, bar.h * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      // Boss 倒计时
      if (scene.timeLimit > 0) {
        var left = Math.max(0, Math.ceil(scene.timeLeft));
        var mm = Math.floor(left / 60);
        var ss = left % 60;
        // 最后 15 秒：数字随心跳放大 + 红色辉光
        var beatScale = left <= 15
          ? 1 + 0.10 * (0.5 + 0.5 * Math.sin(now * 0.016))
          : 1;
        ctx.save();
        ctx.translate(W * 0.5, bar.y + H * 0.042);
        ctx.scale(beatScale, beatScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = render.font(H * 0.030, '800');
        ctx.fillStyle = left <= 15 ? '#ff9a88' : 'rgba(255, 226, 122, 0.95)';
        if (left <= 15) {
          ctx.shadowColor = 'rgba(255, 80, 60, 0.85)';
          ctx.shadowBlur = H * 0.022;
        }
        ctx.fillText('⏱ ' + mm + ':' + (ss < 10 ? '0' : '') + ss, 0, 0);
        ctx.restore();
      }

      ctx.restore();
    },

    hitTest: function (scene, x, y) {
      var L = layout(scene);
      var dx = x - L.pause.x, dy = y - L.pause.y;
      if (dx * dx + dy * dy <= (L.pause.r * 2.0) * (L.pause.r * 2.0)) { return 'pause'; }
      if (scene.currentQ && scene.currentQ.mode === 'audio') {
        var s = L.speaker;
        var ddx = x - s.x, ddy = y - s.y;
        if (ddx * ddx + ddy * ddy <= (s.r * 2.2) * (s.r * 2.2)) { return 'speaker'; }
        var card = L.card;
        if (x > card.x && x < card.x + card.w && y > card.y && y < card.y + card.h) { return 'speaker'; }
      }
      return null;
    }
  };

  WN.hud = hud;
})(typeof window !== 'undefined' ? window : globalThis);
