/**
 * WORD NINJA — 刀轨与切割判定
 * 轨迹点带时间戳，相邻采样点构成刀锋线段；场景层用线段与单词牌做相交检测。
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  var TRAIL_MS = 150;   // 刀光存活时间（更短，避免遮挡文字）
  var MAX_POINTS = 26;

  function Blade() {
    this.trails = {};
  }

  Blade.prototype.start = function (id, x, y, t) {
    this.trails[id] = { pts: [{ x: x, y: y, t: t }], active: true };
  };

  /**
   * 增加一个采样点。
   * @returns {{x1:number,y1:number,x2:number,y2:number,dt:number,speed:number}|null}
   */
  Blade.prototype.move = function (id, x, y, t) {
    var tr = this.trails[id];
    // 没有按下就没有刀：鼠标悬停移动不得切割（否则桌面端会一路误切）
    if (!tr || !tr.active) { return null; }
    // 轨迹点可能全部过期被 prune 掉；此时用当前点重新起头，避免读到 undefined
    if (!tr.pts.length) {
      tr.pts.push({ x: x, y: y, t: t });
      return null;
    }
    var last = tr.pts[tr.pts.length - 1];
    var dx = x - last.x, dy = y - last.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dt = Math.max(1, t - last.t);
    tr.pts.push({ x: x, y: y, t: t });
    while (tr.pts.length > MAX_POINTS) { tr.pts.shift(); }
    if (dist < 1.5) { return null; }
    return { x1: last.x, y1: last.y, x2: x, y2: y, dt: dt, speed: dist / dt, dist: dist };
  };

  Blade.prototype.end = function (id) {
    var tr = this.trails[id];
    if (!tr) { return; }
    tr.active = false;
  };

  Blade.prototype.prune = function (now) {
    var ids = Object.keys(this.trails);
    for (var i = 0; i < ids.length; i++) {
      var tr = this.trails[ids[i]];
      while (tr.pts.length && now - tr.pts[0].t > TRAIL_MS) { tr.pts.shift(); }
      if (!tr.active && tr.pts.length === 0) { delete this.trails[ids[i]]; }
    }
  };

  Blade.prototype.clear = function () { this.trails = {}; };

  Blade.prototype.isEmpty = function () {
    for (var k in this.trails) { if (this.trails[k].pts.length > 1) { return false; } }
    return true;
  };

  /** 刀光：渐变锥形光带（外层辉光 / 中层青光 / 白色核心）+ 余光点 */
  var W_MAX = 46;         // 光带最大宽度（逻辑像素）

  function ribbonPath(ctx, pts, widths, scale) {
    var left = [], right = [];
    for (var i = 0; i < pts.length; i++) {
      var prev = pts[i - 1] || pts[i];
      var next = pts[i + 1] || pts[i];
      var dx = next.x - prev.x, dy = next.y - prev.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var w = Math.max(0.6, widths[i] * scale * 0.5);
      left.push([pts[i].x + nx * w, pts[i].y + ny * w]);
      right.push([pts[i].x - nx * w, pts[i].y - ny * w]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (var a = 1; a < left.length; a++) { ctx.lineTo(left[a][0], left[a][1]); }
    for (var b = right.length - 1; b >= 0; b--) { ctx.lineTo(right[b][0], right[b][1]); }
    ctx.closePath();
  }

  Blade.prototype.draw = function (ctx, now) {
    var ids = Object.keys(this.trails);
    if (!ids.length) { return; }
    ctx.save();
    for (var i = 0; i < ids.length; i++) {
      var all = this.trails[ids[i]].pts;
      var pts = [], widths = [];
      var n = all.length;
      for (var p = 0; p < n; p++) {
        var age = (now - all[p].t) / TRAIL_MS;
        if (age >= 1) { continue; }
        var fade = 1 - age;
        var along = n > 1 ? p / (n - 1) : 1;
        pts.push(all[p]);
        // 头部宽、尾部收窄，并随存在时间整体变细
        widths.push(W_MAX * fade * (0.15 + 0.85 * along) * (0.55 + 0.45 * fade));
      }
      if (pts.length < 2) { continue; }

      // 外层辉光
      ctx.globalCompositeOperation = 'lighter';
      ribbonPath(ctx, pts, widths, 2.4);
      ctx.fillStyle = 'rgba(110, 200, 255, 0.16)';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // 中层
      ribbonPath(ctx, pts, widths, 1.3);
      ctx.fillStyle = 'rgba(185, 235, 255, 0.60)';
      ctx.fill();

      // 白色核心
      ribbonPath(ctx, pts, widths, 0.52);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fill();

      // 刀尖余光
      var head = pts[pts.length - 1];
      var hw = widths[widths.length - 1];
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, hw * 2.8);
      g.addColorStop(0, 'rgba(230, 252, 255, 0.85)');
      g.addColorStop(0.4, 'rgba(160, 225, 255, 0.35)');
      g.addColorStop(1, 'rgba(120, 200, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(head.x, head.y, hw * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // 新月闪光：垂直于滑动方向的弧形光刃（参考图里的"弯月"）
      var prevP = pts[Math.max(0, pts.length - 2)];
      var dirX = head.x - prevP.x, dirY = head.y - prevP.y;
      var dLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dLen > 0.5) {
        var ang = Math.atan2(dirY, dirX);
        var arcR = hw * 1.5;
        var fade2 = widths[widths.length - 1] / W_MAX;
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(ang);
        var cg = ctx.createLinearGradient(-arcR, 0, arcR, 0);
        cg.addColorStop(0, 'rgba(150, 225, 255, 0)');
        cg.addColorStop(0.45, 'rgba(255, 255, 255, ' + (0.85 * fade2).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(150, 225, 255, 0)');
        ctx.strokeStyle = cg;
        ctx.lineWidth = Math.max(2, arcR * 0.30);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(-arcR * 0.35, 0, arcR, -1.25, 1.25);
        ctx.stroke();
        // 金色描边（高连击时更暖）
        if (fade2 > 0.45) {
          var gg = ctx.createLinearGradient(-arcR, 0, arcR, 0);
          gg.addColorStop(0, 'rgba(255, 214, 140, 0)');
          gg.addColorStop(0.5, 'rgba(255, 226, 170, ' + (0.55 * fade2).toFixed(3) + ')');
          gg.addColorStop(1, 'rgba(255, 200, 120, 0)');
          ctx.strokeStyle = gg;
          ctx.lineWidth = Math.max(1, arcR * 0.10);
          ctx.beginPath();
          ctx.arc(-arcR * 0.35, 0, arcR * 0.86, -1.1, 1.1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 沿途碎星：按点位置固定分布，避免逐帧闪烁
      var sparkCount = Math.min(pts.length, 10);
      for (var s = 1; s <= sparkCount; s++) {
        var idx = pts.length - s;
        if (idx < 0) { break; }
        var sp = pts[idx];
        var sAge = (now - sp.t) / TRAIL_MS;
        if (sAge >= 1) { continue; }
        var sAlpha = (1 - sAge) * 0.55;
        var sR = Math.max(1.2, widths[idx] * 0.09 * (1 - sAge));
        var wob = Math.sin(idx * 2.3 + now * 0.004) * widths[idx] * 0.55;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + sAlpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(sp.x + wob * 0.4, sp.y - wob * 0.3, sR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };

  WN.Blade = Blade;
  WN.createBlade = function () { return new Blade(); };
})(typeof window !== 'undefined' ? window : globalThis);
