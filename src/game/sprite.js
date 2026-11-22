/**
 * WORD NINJA — 卡片贴图烘焙（sprite.js）
 *
 * 为什么不是纯渐变：纯渐变是"画出来的假高光"。这里对每张卡片跑一遍
 * 逐像素的简化光照模型：
 *   1) 用圆角矩形的有向距离场（SDF）求法线 → 边缘自然形成倒角
 *   2) 同时叠一个球面鼓包，让卡面有弧度
 *   3) Lambert 漫反射 + Blinn-Phong 镜面高光 + 边缘 Fresnel 逆光 + 倒角 AO
 *   4) 底部单独绘制挤出厚度面
 * 结果是一张"烘焙好的高分辨率贴图"，运行时只做 drawImage（快，且文字另画保持锐利）。
 *
 * 每种配色只烘焙一次，缓存复用；初始化时预热，避免进游戏卡一下。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  var BW = 480;            // 贴图里卡片主体宽
  var BH = 176;            // 贴图里卡片主体高
  var PAD_X = 26;
  var PAD_TOP = 20;
  var PAD_BOTTOM = 74;     // 厚度 + 柔和投影的空间
  var DEPTH = 34;          // 厚度
  var RADIUS = 46;

  var cache = {};

  function hexToRgb(h) {
    var s = String(h || '#ffffff').replace('#', '');
    if (s.length === 3) { s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; }
    var n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mix(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function smoothstep(e0, e1, x) {
    var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
    return t * t * (3 - 2 * t);
  }

  /** 圆角矩形 SDF（负数在内部） */
  function sdRoundBox(px, py, hw, hh, r) {
    var qx = Math.abs(px) - (hw - r);
    var qy = Math.abs(py) - (hh - r);
    var ax = Math.max(qx, 0), ay = Math.max(qy, 0);
    return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
  }

  function bake(c) {
    var cv = root.document.createElement('canvas');
    cv.width = BW + PAD_X * 2;
    cv.height = BH + PAD_TOP + PAD_BOTTOM;
    var g = cv.getContext('2d');

    var top = hexToRgb(c.top), bottom = hexToRgb(c.bottom), edge = hexToRgb(c.edge);
    var glow = hexToRgb(c.glow || c.bottom);

    var cx = PAD_X + BW / 2;
    var cy = PAD_TOP + BH / 2;
    var hw = BW / 2, hh = BH / 2;

    // ---- 1. 柔和投影（烘焙进贴图，运行时不用再设 shadowBlur）----
    g.save();
    g.filter = 'blur(14px)';
    g.globalAlpha = 0.55;
    g.fillStyle = 'rgba(2, 6, 16, 1)';
    g.beginPath();
    g.ellipse(cx, cy + DEPTH + 26, hw * 0.94, hh * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // ---- 2. 挤出厚度面 ----
    var sideTop = mix(edge, { r: 0, g: 0, b: 0 }, 0.15);
    var sideBottom = mix(edge, { r: 0, g: 0, b: 0 }, 0.62);
    var grad = g.createLinearGradient(0, cy - hh + DEPTH, 0, cy + hh + DEPTH);
    grad.addColorStop(0, 'rgb(' + (sideTop.r | 0) + ',' + (sideTop.g | 0) + ',' + (sideTop.b | 0) + ')');
    grad.addColorStop(1, 'rgb(' + (sideBottom.r | 0) + ',' + (sideBottom.g | 0) + ',' + (sideBottom.b | 0) + ')');
    g.fillStyle = grad;
    roundedPath(g, cx - hw, cy - hh + DEPTH, BW, BH, RADIUS);
    g.fill();

    // ---- 3. 卡面：逐像素光照 ----
    var img = g.createImageData(BW, BH);
    var data = img.data;

    // 光照方向（左上偏前）与半程向量
    var Lx = -0.42, Ly = -0.62, Lz = 0.66;
    var LLen = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);
    Lx /= LLen; Ly /= LLen; Lz /= LLen;
    var Hx = Lx, Hy = Ly, Hz = Lz + 1;
    var HLen = Math.sqrt(Hx * Hx + Hy * Hy + Hz * Hz);
    Hx /= HLen; Hy /= HLen; Hz /= HLen;

    for (var y = 0; y < BH; y++) {
      var py = y - hh;
      var ty = y / (BH - 1);
      // 主体保持饱和明亮，最深只到 bottom（edge 只用于厚度面）
      var baseCol = mix(top, bottom, smoothstep(0, 0.72, ty));

      for (var x = 0; x < BW; x++) {
        var px = x - hw;
        var d = sdRoundBox(px, py, hw, hh, RADIUS);
        if (d > 0.6) { continue; }

        // 法线：SDF 梯度 + 球面鼓包
        var e = 1.2;
        var dx = (sdRoundBox(px + e, py, hw, hh, RADIUS) - sdRoundBox(px - e, py, hw, hh, RADIUS)) / (2 * e);
        var dy = (sdRoundBox(px, py + e, hw, hh, RADIUS) - sdRoundBox(px, py - e, hw, hh, RADIUS)) / (2 * e);
        var bulge = 0.30 * Math.cos(px / hw * 1.2) * Math.cos(py / hh * 1.1);
        var nx = dx, ny = dy, nz = Math.max(0.08, 0.94 + bulge);
        var nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;
        if (nz < 0) { nz = -nz; }

        var lambert = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        var specDot = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
        var spec = Math.pow(specDot, 64) * 0.80;
        var fres = Math.pow(1 - nz, 3) * 0.26;

        // 倒角处的环境光遮蔽（轻微，避免整体发暗）
        var ao = 0.80 + 0.20 * smoothstep(0, RADIUS * 1.15, -d);

        // 顶部玻璃带（窄而亮）
        var band = smoothstep(0.02, 0.14, ty) * (1 - smoothstep(0.14, 0.38, ty)) * 0.12;

        var mult = (0.72 + 0.52 * lambert) * ao + band;
        var r = baseCol.r * mult + spec * 255 + fres * glow.r * 0.9;
        var gg = baseCol.g * mult + spec * 255 + fres * glow.g * 0.9;
        var b = baseCol.b * mult + spec * 255 + fres * glow.b * 0.9;

        var idx = (y * BW + x) * 4;
        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, gg);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = d < -0.5 ? 255 : Math.max(0, Math.min(255, (0.5 - d) * 255));
      }
    }
    g.putImageData(img, PAD_X, PAD_TOP);

    // ---- 4. 外描边（1px 级冷白，强化"切面"感）----
    g.strokeStyle = 'rgba(230, 246, 255, 0.42)';
    g.lineWidth = 2;
    roundedPath(g, cx - hw, cy - hh, BW, BH, RADIUS);
    g.stroke();

    return cv;
  }

  function roundedPath(g, x, y, w, h, r) {
    if (g.beginPath) { g.beginPath(); }
    if (WN.util && WN.util.roundRect) { WN.util.roundRect(g, x, y, w, h, r); return; }
    g.rect(x, y, w, h);
  }

  var sprite = {
    BW: BW, BH: BH, PAD_X: PAD_X, PAD_TOP: PAD_TOP,
    canvasW: BW + PAD_X * 2,
    canvasH: BH + PAD_TOP + PAD_BOTTOM,

    /** 拿到某套配色的卡片贴图（首次调用时烘焙，之后命中缓存） */
    get: function (key, color) {
      if (!cache[key]) {
        try { cache[key] = bake(color); } catch (e) { cache[key] = null; }
      }
      return cache[key];
    },

    /** 预热所有配色，避免进游戏第一次出现时卡顿 */
    warm: function (colors) {
      if (!root.document || !colors) { return; }
      var keys = Object.keys(colors);
      var i = 0;
      function step() {
        if (i >= keys.length) { return; }
        var k = keys[i++];
        sprite.get(k, colors[k]);
        setTimeout(step, 24);
      }
      setTimeout(step, 120);
    },

    clear: function () { cache = {}; }
  };

  WN.sprite = sprite;
})(typeof window !== 'undefined' ? window : globalThis);
