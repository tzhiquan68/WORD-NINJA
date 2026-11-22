/**
 * WORD NINJA — 世界渲染（Canvas 2D）
 * 只读场景状态，不修改逻辑；所有绘制都在 1080×H 的逻辑坐标系里。
 *
 * 视觉规范（v2.0）：
 *  - 背景：梦幻夜森林，三层山脊 + 松林 + 前景灌木 + 萤火虫/浮尘
 *  - 单词牌：圆角 3D 卡片（厚度 + 高光 + 内阴影 + 柔和投影），文字始终完整
 *  - 炸弹：金属球 + 危险脉冲环 + 引线火花
 *  - 碎片：与卡片同材质，切面带高光
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};
  var util = WN.util;

  var FONT_STACK = '"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

  var bgCache = { canvas: null, W: 0, H: 0 };

  function font(size, weight) {
    return (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT_STACK;
  }

  function glow(ctx, x, y, r, inner, outer) {
    if (r <= 0) { return; }
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer || 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------- 背景

  function ridge(g, W, H, baseY, amp, seed, topColor, bottomColor) {
    var grad = g.createLinearGradient(0, baseY - amp, 0, H);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, H);
    for (var x = 0; x <= W; x += 10) {
      var y = baseY
        - (Math.sin(x * 0.0038 + seed) * 0.5 + 0.5) * amp
        - Math.sin(x * 0.0125 + seed * 2.3) * amp * 0.2;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    return function (x) {
      return baseY
        - (Math.sin(x * 0.0038 + seed) * 0.5 + 0.5) * amp
        - Math.sin(x * 0.0125 + seed * 2.3) * amp * 0.2;
    };
  }

  function pine(g, x, baseY, h, alpha) {
    var w = h * 0.40;
    g.fillStyle = 'rgba(9, 15, 32, ' + alpha + ')';
    // 三层塔形树冠，底部直接落在山脊线上（不画树干，避免"细腿"）
    for (var i = 0; i < 3; i++) {
      var top = baseY - h * (1 - i * 0.2);
      var half = w * (0.55 + i * 0.24);
      var bottom = baseY - h * (0.24 - i * 0.07);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + half, bottom);
      g.lineTo(x - half, bottom);
      g.closePath();
      g.fill();
    }
  }

  function buildBackground(W, H) {
    if (!root.document) { return null; }
    var c = root.document.createElement('canvas');
    c.width = Math.round(W);
    c.height = Math.round(H);
    var g = c.getContext('2d');

    // 夜空：深蓝 → 靛蓝 → 紫
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#050b1e');
    sky.addColorStop(0.28, '#0b1739');
    sky.addColorStop(0.52, '#16234f');
    sky.addColorStop(0.72, '#241f4c');
    sky.addColorStop(0.88, '#171a38');
    sky.addColorStop(1, '#080c1c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // 地平线暖光
    glow(g, W * 0.52, H * 0.74, H * 0.46, 'rgba(96, 130, 255, 0.10)', 'rgba(96, 130, 255, 0)');
    glow(g, W * 0.52, H * 0.78, H * 0.24, 'rgba(150, 180, 255, 0.06)', 'rgba(150, 180, 255, 0)');

    // 星空
    for (var i = 0; i < 150; i++) {
      var sx = Math.random() * W;
      var sy = Math.random() * H * 0.62;
      var sr = Math.random() * 2.0 + 0.4;
      var sa = Math.random() * 0.55 + 0.12;
      g.fillStyle = 'rgba(206, 228, 255, ' + sa + ')';
      g.beginPath();
      g.arc(sx, sy, sr, 0, Math.PI * 2);
      g.fill();
    }
    // 少量十字星芒
    for (var k = 0; k < 12; k++) {
      var kx = Math.random() * W;
      var ky = Math.random() * H * 0.5;
      var kr = Math.random() * 3 + 2;
      g.strokeStyle = 'rgba(220, 240, 255, 0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(kx - kr, ky); g.lineTo(kx + kr, ky);
      g.moveTo(kx, ky - kr); g.lineTo(kx, ky + kr);
      g.stroke();
    }

    // 月亮（贴近远山的夜空，避开 HUD 与进度条）
    var mx = W * 0.805, my = H * 0.492, mr = H * 0.044;
    glow(g, mx, my, mr * 4.6, 'rgba(255, 246, 214, 0.16)', 'rgba(255, 240, 190, 0)');
    glow(g, mx, my, mr * 2.2, 'rgba(255, 248, 220, 0.20)', 'rgba(255, 240, 190, 0)');
    var disc = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.35, mr * 0.1, mx, my, mr);
    disc.addColorStop(0, '#fffdf2');
    disc.addColorStop(0.6, '#fdf1cd');
    disc.addColorStop(1, '#e8d3a4');
    g.fillStyle = disc;
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(214, 196, 158, 0.30)';
    g.beginPath(); g.arc(mx - mr * 0.28, my - mr * 0.18, mr * 0.20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(mx + mr * 0.30, my + mr * 0.22, mr * 0.13, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(mx + mr * 0.06, my - mr * 0.42, mr * 0.09, 0, Math.PI * 2); g.fill();

    // 三层山脊（远景偏紫、中景偏蓝、近景压深）
    ridge(g, W, H, H * 0.56, H * 0.13, 0.8, 'rgba(78, 100, 184, 0.50)', 'rgba(46, 58, 128, 0.72)');
    var nearLine = ridge(g, W, H, H * 0.655, H * 0.105, 2.4, 'rgba(38, 52, 108, 0.92)', 'rgba(18, 26, 60, 0.98)');
    ridge(g, W, H, H * 0.745, H * 0.085, 4.1, 'rgba(20, 28, 62, 1)', 'rgba(8, 12, 28, 1)');

    // 松林（沿中景山脊，尺寸有变化才有层次）
    for (var x = -20; x < W + 40; x += 22) {
      var baseY = nearLine(x) + 3;
      var hgt = H * (0.026 + ((Math.sin(x * 0.073) + 1) * 0.5) * 0.034);
      pine(g, x + Math.sin(x * 0.31) * 5, baseY, hgt, 0.94);
    }

    // 地平线雾带（增加纵深）
    var fog = g.createLinearGradient(0, H * 0.60, 0, H * 0.80);
    fog.addColorStop(0, 'rgba(120, 150, 235, 0)');
    fog.addColorStop(0.45, 'rgba(110, 140, 230, 0.10)');
    fog.addColorStop(1, 'rgba(120, 150, 235, 0)');
    g.fillStyle = fog;
    g.fillRect(0, H * 0.60, W, H * 0.20);

    // 前景灌木剪影
    var ground = g.createLinearGradient(0, H * 0.86, 0, H);
    ground.addColorStop(0, 'rgba(6, 10, 24, 0)');
    ground.addColorStop(1, 'rgba(4, 7, 18, 0.98)');
    g.fillStyle = ground;
    g.fillRect(0, H * 0.86, W, H * 0.14);

    // 生物荧光：底部草丛里的青绿/洋红光点（参考图的发光植物）
    var spores = [
      [0.08, 0.905, 'rgba(90, 255, 210, 0.30)', 0.052],
      [0.22, 0.935, 'rgba(120, 220, 255, 0.26)', 0.044],
      [0.37, 0.895, 'rgba(150, 255, 200, 0.24)', 0.038],
      [0.54, 0.925, 'rgba(120, 200, 255, 0.22)', 0.046],
      [0.69, 0.900, 'rgba(190, 150, 255, 0.26)', 0.042],
      [0.83, 0.930, 'rgba(110, 240, 220, 0.28)', 0.050],
      [0.94, 0.905, 'rgba(255, 150, 220, 0.20)', 0.036]
    ];
    for (var sp2 = 0; sp2 < spores.length; sp2++) {
      var sxp = W * spores[sp2][0], syp = H * spores[sp2][1];
      var srad = H * spores[sp2][3];
      glow(g, sxp, syp, srad * 3.2, spores[sp2][2], 'rgba(0,0,0,0)');
      glow(g, sxp, syp, srad * 1.1, 'rgba(220, 255, 246, 0.30)', 'rgba(180, 255, 240, 0)');
      g.fillStyle = 'rgba(240, 255, 250, 0.36)';
      g.beginPath();
      g.arc(sxp, syp, Math.max(1.2, srad * 0.07), 0, Math.PI * 2);
      g.fill();
    }

    // 地面反光（让底部有"水面/湿地"的通透感）
    var wet = g.createLinearGradient(0, H * 0.88, 0, H);
    wet.addColorStop(0, 'rgba(70, 190, 210, 0)');
    wet.addColorStop(0.55, 'rgba(70, 190, 210, 0.08)');
    wet.addColorStop(1, 'rgba(40, 120, 160, 0.16)');
    g.fillStyle = wet;
    g.fillRect(0, H * 0.88, W, H * 0.12);

    g.fillStyle = '#050915';
    for (var b = 0; b < 7; b++) {
      var bx = (b / 6) * W + (b % 2 ? 24 : -18);
      var bw = W * (0.14 + (b % 3) * 0.03);
      var bh = H * (0.045 + (b % 4) * 0.012);
      g.beginPath();
      g.ellipse(bx, H + bh * 0.25, bw * 0.5, bh, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 草丛
    g.strokeStyle = 'rgba(20, 40, 48, 0.85)';
    g.lineWidth = Math.max(2, H * 0.003);
    g.lineCap = 'round';
    for (var gr = 0; gr < 26; gr++) {
      var gx = (gr / 25) * W + Math.sin(gr * 2.7) * 14;
      var gh = H * (0.02 + ((gr % 5) * 0.006));
      g.beginPath();
      g.moveTo(gx, H);
      g.quadraticCurveTo(gx + Math.sin(gr) * 10, H - gh * 0.6, gx + Math.sin(gr * 1.7) * 18, H - gh);
      g.stroke();
    }

    // 暗角
    var vig = g.createRadialGradient(W / 2, H * 0.46, H * 0.26, W / 2, H * 0.46, H * 0.82);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(2, 4, 12, 0.62)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    return c;
  }

  /** 萤火虫：暖色小光点，缓慢漂移 + 呼吸明暗（保持克制，不抢单词的视觉） */
  function drawFireflies(ctx, W, H, t) {
    for (var i = 0; i < 12; i++) {
      var seed = i * 2.399;
      var x = W * (0.08 + ((i * 0.163) % 0.84)) + Math.sin(t * 0.32 + seed) * W * 0.026;
      var y = H * (0.56 + ((i * 0.071) % 0.30)) + Math.cos(t * 0.46 + seed * 1.7) * H * 0.022;
      var blink = 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(t * 0.8 + seed)), 2);
      var r = H * 0.009 * (0.6 + blink * 0.7);
      glow(ctx, x, y, r * 2.2, 'rgba(178, 255, 196, ' + (0.14 * blink) + ')', 'rgba(120, 255, 170, 0)');
      ctx.fillStyle = 'rgba(232, 255, 226, ' + (0.55 * blink) + ')';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, H * 0.0026 * blink), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 浮尘：细小光点缓慢上升，营造空气感 */
  function drawMotes(ctx, W, H, t) {
    ctx.save();
    for (var i = 0; i < 22; i++) {
      var seed = i * 1.913;
      var x = (W * ((i * 0.173) % 1)) + Math.sin(t * 0.28 + seed) * 30;
      var y = H - ((t * (10 + (i % 4) * 5) + i * 97) % (H * 0.92));
      var a = 0.05 + ((i % 5) * 0.02);
      ctx.fillStyle = 'rgba(200, 226, 255, ' + a + ')';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, H * 0.0016 + (i % 3) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 缓慢移动的薄雾 */
  function drawMist(ctx, W, H, t) {
    ctx.save();
    for (var i = 0; i < 2; i++) {
      var x = ((t * (6 + i * 3) + i * W * 0.5) % (W * 1.6)) - W * 0.3;
      var y = H * (0.66 + i * 0.05);
      var g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.42);
      g.addColorStop(0, 'rgba(150, 185, 255, 0.045)');
      g.addColorStop(1, 'rgba(150, 185, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, W * 0.42, H * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 单词牌

  function cardShadow(ctx, w, h, r) {
    ctx.save();
    ctx.shadowColor = 'rgba(3, 8, 20, 0.55)';
    ctx.shadowBlur = h * 0.36;
    ctx.shadowOffsetY = h * 0.14;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  function cardBody(ctx, w, h, r, c) {
    // 宝石质感：外发光（用卡片主色的亮色）
    if (c.glow) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = h * 0.42;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.001)';
      util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.restore();
    }

    // 厚度：底部一层深色
    var depth = h * 0.085;
    var edge = ctx.createLinearGradient(0, -h / 2, 0, h / 2 + depth);
    edge.addColorStop(0, c.edge);
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = edge;
    util.roundRect(ctx, -w / 2, -h / 2 + depth, w, h, r);
    ctx.fill();

    // 卡面
    var body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, c.top);
    body.addColorStop(0.48, c.bottom);
    body.addColorStop(1, c.edge);
    ctx.fillStyle = body;
    util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();

    ctx.save();
    util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.clip();

    // 左上柔光
    var sheenG = ctx.createRadialGradient(-w * 0.22, -h * 0.42, 0, -w * 0.22, -h * 0.42, w * 0.8);
    sheenG.addColorStop(0, 'rgba(255, 255, 255, 0.30)');
    sheenG.addColorStop(0.55, 'rgba(255, 255, 255, 0.06)');
    sheenG.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenG;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // 顶部玻璃高光（更亮的窄带，像宝石切面）
    var gloss = ctx.createLinearGradient(0, -h / 2, 0, -h * 0.05);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
    gloss.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.50);

    // 镜面高光点（左上角小椭圆，克制一些，避免糊住文字）
    var specR = Math.min(w * 0.13, h * 0.30);
    var spec = ctx.createRadialGradient(-w * 0.24, -h * 0.30, 0, -w * 0.24, -h * 0.30, specR * 1.6);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(-w * 0.24, -h * 0.30, specR, specR * 0.72, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 底部内阴影 + 色彩回弹
    var bottom = ctx.createLinearGradient(0, h * 0.40, 0, h / 2);
    bottom.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottom.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = bottom;
    ctx.fillRect(-w / 2, h * 0.40, w, h * 0.10);
    ctx.restore();

    // 描边：顶部亮、整体淡
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = Math.max(2, h * 0.028);
    util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.stroke();
  }

  function cardText(ctx, text, w, fs, color) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(fs);
    var tw = ctx.measureText(text).width;
    var maxW = w * 0.86;
    if (tw > maxW) {                       // 长单词兜底：缩字号，绝不裁切
      fs = fs * maxW / tw;
      ctx.font = font(fs);
    }
    ctx.fillStyle = 'rgba(2, 8, 20, 0.55)';
    ctx.fillText(text, 0, fs * 0.14);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, 0, 0);
  }

  // ---------------------------------------------------------------- 粒子

  var render = {
    FONT_STACK: FONT_STACK,
    font: font,

    invalidateBackground: function () { bgCache.W = 0; bgCache.H = 0; },

    drawBackground: function (ctx, W, H, t) {
      if (!bgCache.canvas || bgCache.W !== Math.round(W) || bgCache.H !== Math.round(H)) {
        bgCache.canvas = buildBackground(W, H);
        bgCache.W = Math.round(W);
        bgCache.H = Math.round(H);
      }
      if (bgCache.canvas) {
        ctx.drawImage(bgCache.canvas, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#0b1329';
        ctx.fillRect(0, 0, W, H);
      }
      drawMist(ctx, W, H, t);
      drawMotes(ctx, W, H, t);
      drawFireflies(ctx, W, H, t);
    },

    drawTile: function (ctx, tile, now) {
      if (tile.delay > 0) { return; }
      ctx.save();
      ctx.globalAlpha = tile.alpha;
      ctx.translate(tile.x, tile.y);
      // 飞行时轻微弹性倾角（视觉用，不改物理）
      var wobble = Math.sin(tile.bob * 0.9) * 0.02;
      ctx.rotate(tile.angle + wobble);
      if (tile.kind === 'bomb') {
        render._drawBombTile(ctx, tile, now);
      } else if (tile.kind === 'bonus') {
        render._drawBonusTile(ctx, tile, now);
      } else {
        render._drawWordTile(ctx, tile);
      }
      ctx.restore();
    },

    /** 金色奖励星：切中 +50，纯加分不判定对错 */
    _drawBonusTile: function (ctx, tile, now) {
      var r = Math.min(isFinite(tile.w) ? tile.w : tile.h, tile.h) * 0.46;
      if (!isFinite(r) || r <= 0) { return; }
      var pulse = 0.5 + Math.sin(now * 0.005) * 0.5;

      // 光晕
      glow(ctx, 0, 0, r * 3.6, 'rgba(255, 210, 110, ' + (0.28 + pulse * 0.20) + ')', 'rgba(255, 190, 80, 0)');

      // 星形
      ctx.save();
      ctx.rotate(Math.sin(now * 0.0012) * 0.25);
      var pts = 5, outer = r, inner = r * 0.46;
      ctx.beginPath();
      for (var i = 0; i < pts * 2; i++) {
        var rad = i % 2 === 0 ? outer : inner;
        var a = (Math.PI / pts) * i - Math.PI / 2;
        var px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
      }
      ctx.closePath();
      var g = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, '#ffd76a');
      g.addColorStop(1, '#e89b12');
      ctx.shadowColor = 'rgba(255, 190, 70, 0.85)';
      ctx.shadowBlur = r * 0.9;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 250, 220, 0.85)';
      ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.stroke();

      // 内部高光
      ctx.beginPath();
      ctx.arc(-r * 0.22, -r * 0.26, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fill();
      ctx.restore();

      // 环绕光点
      for (var k = 0; k < 3; k++) {
        var ang = now * 0.0016 + k * 2.1;
        var ox = Math.cos(ang) * r * 1.5;
        var oy = Math.sin(ang) * r * 1.1;
        ctx.fillStyle = 'rgba(255, 240, 180, ' + (0.5 + 0.4 * Math.sin(ang)) + ')';
        ctx.beginPath();
        ctx.arc(ox, oy, Math.max(1.2, r * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    },

    _drawWordTile: function (ctx, tile) {
      var w = tile.w, h = tile.h;
      var c = tile.color || WN.entities.COLORS.primary;
      var r = Math.min(h * 0.34, w * 0.22);

      // 优先使用烘焙贴图（逐像素 SDF 光照），退化时才用渐变绘制
      var S = WN.sprite;
      var sp = (S && c && c.key) ? S.get(c.key, c) : null;
      if (sp) {
        var sx = w / S.BW, sy = h / S.BH;
        ctx.drawImage(sp, -w / 2 - S.PAD_X * sx, -h / 2 - S.PAD_TOP * sy,
          S.canvasW * sx, S.canvasH * sy);
        cardText(ctx, tile.text, w, tile.fs, c.text);
        return;
      }

      cardShadow(ctx, w, h, r);
      cardBody(ctx, w, h, r, c);
      cardText(ctx, tile.text, w, tile.fs, c.text);
    },

    _drawBombTile: function (ctx, tile, now) {
      var w = isFinite(tile.w) ? tile.w : tile.h;
      var r = Math.min(w, tile.h) * 0.42;
      if (!isFinite(r) || r <= 0) { return; }
      var pulse = 0.5 + Math.sin(now * 0.006) * 0.5;

      // 地面投影
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, r * 1.02, r * 0.92, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 危险光晕
      glow(ctx, 0, 0, r * 2.4, 'rgba(255, 96, 60, ' + (0.10 + pulse * 0.14) + ')', 'rgba(255, 96, 60, 0)');

      // 球体
      var g = ctx.createRadialGradient(-r * 0.34, -r * 0.38, r * 0.06, 0, 0, r * 1.05);
      g.addColorStop(0, '#9aa3b5');
      g.addColorStop(0.35, '#4a5160');
      g.addColorStop(0.75, '#22262f');
      g.addColorStop(1, '#080a0f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

      // 红色危险环
      ctx.strokeStyle = 'rgba(255, 92, 60, ' + (0.35 + pulse * 0.45) + ')';
      ctx.lineWidth = r * 0.10;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.03, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 190, 120, ' + (0.18 + pulse * 0.25) + ')';
      ctx.lineWidth = r * 0.045;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, Math.PI * 2); ctx.stroke();

      // 引线座
      ctx.fillStyle = '#6b5a44';
      util.roundRect(ctx, r * 0.30, -r * 0.94, r * 0.26, r * 0.24, r * 0.08);
      ctx.fill();
      // 引线
      ctx.strokeStyle = '#a8834f';
      ctx.lineWidth = Math.max(3, r * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.42, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.98, -r * 1.28, r * 0.82, -r * 1.58);
      ctx.stroke();

      // 火花
      var sp = 0.6 + Math.sin(now * 0.024) * 0.4;
      glow(ctx, r * 0.82, -r * 1.6, r * 0.5 * sp, 'rgba(255, 208, 120, 0.9)', 'rgba(255, 140, 60, 0)');
      ctx.fillStyle = 'rgba(255, 236, 190, ' + (0.85 * sp) + ')';
      ctx.beginPath(); ctx.arc(r * 0.82, -r * 1.6, r * 0.10 * sp + 1.5, 0, Math.PI * 2); ctx.fill();

      // 高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.22, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
    },

    drawHalf: function (ctx, half) {
      var w = half.w, h = half.h, c = half.color;
      var ls = half.localSeg;
      ctx.save();
      ctx.globalAlpha = half.alpha;
      ctx.translate(half.x, half.y);
      ctx.rotate(half.angle);

      // 半平面裁剪
      var dx = ls.x2 - ls.x1, dy = ls.y2 - ls.y1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var nx = -uy, ny = ux;
      var BIG = (w + h) * 2;
      var s = half.side;
      ctx.beginPath();
      ctx.moveTo(ls.x1 - ux * BIG, ls.y1 - uy * BIG);
      ctx.lineTo(ls.x1 + ux * BIG, ls.y1 + uy * BIG);
      ctx.lineTo(ls.x1 + ux * BIG + nx * BIG * s, ls.y1 + uy * BIG + ny * BIG * s);
      ctx.lineTo(ls.x1 - ux * BIG + nx * BIG * s, ls.y1 - uy * BIG + ny * BIG * s);
      ctx.closePath();
      ctx.clip();

      var r = Math.min(h * 0.34, w * 0.22);
      // 碎片同样用烘焙贴图（被裁剪后仍保留光照）
      var S = WN.sprite;
      var sp = (S && c && c.key) ? S.get(c.key, c) : null;
      if (sp) {
        var sx2 = w / S.BW, sy2 = h / S.BH;
        ctx.drawImage(sp, -w / 2 - S.PAD_X * sx2, -h / 2 - S.PAD_TOP * sy2,
          S.canvasW * sx2, S.canvasH * sy2);
      } else {
        ctx.shadowColor = 'rgba(3, 8, 20, 0.5)';
        ctx.shadowBlur = h * 0.3;
        ctx.shadowOffsetY = h * 0.1;
        cardBody(ctx, w, h, r, c);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      if (half.kind !== 'bomb') {
        cardText(ctx, half.text, w, half.fs, c.text);
      }

      // 切面：高光 + 柔光（必须裁到卡片形状内，否则会拉出贯穿屏幕的直线）
      ctx.save();
      util.roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(190, 240, 255, 0.55)';
      ctx.lineWidth = Math.max(3, h * 0.03);
      ctx.beginPath();
      ctx.moveTo(ls.x1 - ux * BIG, ls.y1 - uy * BIG);
      ctx.lineTo(ls.x1 + ux * BIG, ls.y1 + uy * BIG);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    },

    drawParticles: function (ctx, arr) {
      for (var i = 0; i < arr.length; i++) {
        var p = arr[i];
        var a = Math.max(0, p.life / p.maxLife);
        if (p.kind === 'ring') {
          var grow = 1 - a;
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = a * 0.55;
          ctx.lineWidth = Math.max(1.5, p.size * 0.10 * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + grow * 0.9), 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        ctx.globalAlpha = a;
        if (p.kind === 'spark') {
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size * 0.16, -p.size * 1.5, p.size * 0.32, p.size * 3);
          ctx.restore();
        } else if (p.kind === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          util.roundRect(ctx, -p.size * 0.5, -p.size * 0.5, p.size, p.size, p.size * 0.24);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },

    drawFloats: function (ctx, arr) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < arr.length; i++) {
        var f = arr[i];
        var a = Math.max(0, Math.min(1, f.life / f.maxLife));
        // 出现时快速放大，随后缓慢回落
        var pop = 0.7 + Math.min(1, (1 - a) * 3) * 0.45 + Math.sin((1 - a) * Math.PI) * 0.15;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(f.x, f.y);
        ctx.scale(pop, pop);
        ctx.font = font(f.size);
        ctx.lineWidth = Math.max(4, f.size * 0.18);
        ctx.strokeStyle = 'rgba(3, 8, 20, 0.55)';
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFlash: function (ctx, W, H, flash) {
      if (!flash || flash.alpha <= 0) { return; }
      ctx.save();
      ctx.globalAlpha = Math.min(0.42, flash.alpha);
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },

    drawVignette: function (ctx, W, H) {
      var vig = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.85);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }
  };

  WN.render = render;
})(typeof window !== 'undefined' ? window : globalThis);
