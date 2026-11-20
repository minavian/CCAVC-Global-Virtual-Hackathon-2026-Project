/*
 * The phone's screen: an always-on display that wakes into a lock screen.
 *
 * Asleep (always-on display): a dim clock on black.
 * Awake: a soft blue-grey wallpaper, a tall live clock, the date, four widget tiles
 * and two shortcut buttons, which arrive in a short staggered animation.
 *
 * window.RFIDLockScreen.create(THREE, reduceMotion, size) returns
 *   { mesh, wake(t), sleep(), replay(t), update(t, dt) }
 * where size = { width, height, radius } of the display glass in model units.
 */
(function () {
  'use strict';

  const W = 720, H = 1540;                 // canvas pixels, the display's 1 : 2.14 aspect
  const WAKE = 1.25, SLEEP = .6;           // seconds
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = p => 1 - (1 - p) ** 3;
  const easeOutBack = p => { const c = 1.4; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function create(T, reduceMotion, size) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;

    const outline = new T.Shape(), w = size.width / 2, h = size.height / 2, r = size.radius;
    outline.moveTo(-w + r, -h);
    outline.lineTo(w - r, -h); outline.quadraticCurveTo(w, -h, w, -h + r);
    outline.lineTo(w, h - r); outline.quadraticCurveTo(w, h, w - r, h);
    outline.lineTo(-w + r, h); outline.quadraticCurveTo(-w, h, -w, h - r);
    outline.lineTo(-w, -h + r); outline.quadraticCurveTo(-w, -h, -w + r, -h);
    const geometry = new T.ShapeGeometry(outline, 12);
    const { position, uv } = geometry.attributes;
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / size.width + .5, position.getY(i) / size.height + .5);
    // A touch brighter than white, so the screen reads as lit after the scene's tone mapping.
    const material = new T.MeshBasicMaterial({ map: texture, toneMapped: false });
    material.color.setScalar(1.3);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'lock-screen';

    const wallpaper = paintWallpaper();
    let level = 0, target = 0, wokeAt = -10, minute = -1, dirty = true;
    if (document.fonts?.load) {
      Promise.all([document.fonts.load('700 120px Antonio'), document.fonts.load('500 40px "Inter Tight"')])
        .then(() => { dirty = true; }, () => {});
    }

    function update(t, dt) {
      const goal = target;
      if (reduceMotion.matches) level = goal;
      else if (level < goal) level = Math.min(goal, level + dt / WAKE);
      else if (level > goal) level = Math.max(goal, level - dt / SLEEP);
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
      const moving = level > 0 && level < 1;
      if (moving || dirty || m !== minute || goal !== level) {
        minute = m; dirty = false;
        draw(now);
        texture.needsUpdate = true;
      }
    }

    // ---------- Drawing ----------
    function draw(now) {
      const p = level;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = easeOut(clamp01(p / .55));
      ctx.drawImage(wallpaper, 0, 0);
      ctx.globalAlpha = 1;

      const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
      // The clock grows from its dim always-on size into the full lock-screen clock.
      const grow = p > 0 ? easeOutBack(clamp01((p - .04) / .62)) : 0;
      const scale = .78 + .22 * grow, alpha = .5 + .5 * clamp01(p / .45);
      ctx.save();
      ctx.translate(44, 176);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      drawDigits(hh, 0, 0, 300, 548);
      drawDigits(mm, 0, 576, 300, 548);
      ctx.restore();

      // The date is the one other thing the always-on display keeps.
      const dateIn = clamp01((p - .26) / .4);
      ctx.globalAlpha = .55 + .45 * dateIn;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '500 40px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
      const slide = (1 - easeOut(dateIn)) * 18;
      ctx.fillText(`${MONTHS[now.getMonth()]} ${now.getDate()}`, 670 + slide, 206);
      ctx.fillText(DAYS[now.getDay()], 670 + slide, 256);

      // Everything below arrives only when the phone wakes.
      ctx.textAlign = 'left';
      const statusIn = clamp01((p - .2) / .3);
      if (statusIn > 0) { ctx.globalAlpha = statusIn; drawStatus(); }
      const lockIn = clamp01((p - .3) / .3);
      if (lockIn > 0) { ctx.globalAlpha = lockIn; drawLock(360, 112 - (1 - easeOut(lockIn)) * 10); }

      const tiles = [[396, 312, drawLaptop], [556, 312, drawWeather], [396, 472, drawNote], [556, 472, drawCalculator]];
      tiles.forEach(([x, y, icon], i) => {
        const q = clamp01((p - .38 - i * .07) / .36);
        if (q <= 0) return;
        const s = .82 + .18 * easeOutBack(q);
        ctx.save();
        ctx.globalAlpha = easeOut(q);
        ctx.translate(x + 58, y + 58);
        ctx.scale(s, s);
        ctx.translate(-58, -58);
        tile(0, 0, 116, 116, 34, 'rgba(255, 255, 255, .15)');
        icon(58, 58);
        ctx.restore();
      });

      const buttonsIn = clamp01((p - .58) / .32);
      if (buttonsIn > 0) {
        const lift = (1 - easeOut(buttonsIn)) * 24;
        ctx.globalAlpha = buttonsIn;
        circle(99, 1418 + lift, 46, 'rgba(46, 54, 66, .55)');
        drawTorch(99, 1418 + lift);
        circle(621, 1418 + lift, 46, 'rgba(255, 255, 255, .16)');
        drawWave(621, 1418 + lift);
      }
      ctx.globalAlpha = 1;
      // Punch-hole camera.
      circle(360, 46, 13, '#020304');
    }

    // Two digits stretched to fill a tall box, like the condensed lock-screen clock.
    function drawDigits(text, x, y, boxW, boxH) {
      ctx.save();
      ctx.font = '700 200px Antonio, "Arial Narrow", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const m = ctx.measureText(text);
      const width = m.actualBoundingBoxRight + m.actualBoundingBoxLeft || m.width;
      const height = m.actualBoundingBoxAscent + (m.actualBoundingBoxDescent || 0) || 150;
      ctx.translate(x, y);
      ctx.scale(boxW / width, boxH / height);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, m.actualBoundingBoxLeft || 0, m.actualBoundingBoxAscent || 150);
      ctx.restore();
    }

    function tile(x, y, w2, h2, r2, fill) {
      ctx.beginPath(); ctx.roundRect(x, y, w2, h2, r2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .1)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    function circle(x, y, radius, fill) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    }
    function pen(width = 5) {
      ctx.strokeStyle = '#f4f6f8'; ctx.fillStyle = '#f4f6f8';
      ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }

    // ---------- Icons ----------
    function drawStatus() {
      pen(4);
      for (let i = 0; i < 4; i++) ctx.fillRect(552 + i * 9, 50 - i * 5, 6, 8 + i * 5);
      ctx.font = '600 15px "Inter Tight", Arial, sans-serif'; ctx.fillText('5G', 540, 34);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(612, 56, 6 + i * 7, -2.4, -.74); ctx.stroke(); }
      ctx.beginPath(); ctx.roundRect(640, 34, 40, 22, 6); ctx.stroke();
      ctx.fillRect(644, 38, 18, 14); ctx.fillRect(682, 40, 3, 10);
    }
    function drawLock(x, y) {
      pen(5);
      ctx.beginPath(); ctx.roundRect(x - 20, y - 6, 34, 26, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 6, y - 14); ctx.arc(x + 17, y - 14, 11, Math.PI, 0); ctx.lineTo(x + 28, y - 6); ctx.stroke();
    }
    function drawLaptop(x, y) {
      pen(5);
      ctx.beginPath(); ctx.roundRect(x - 26, y - 22, 52, 34, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 36, y + 20); ctx.lineTo(x + 36, y + 20); ctx.stroke();
    }
    function drawWeather(x, y) {
      pen(5);
      ctx.beginPath();
      ctx.arc(x - 9, y - 22, 11, Math.PI * .9, Math.PI * 1.75);
      ctx.arc(x + 6, y - 26, 14, Math.PI * 1.15, Math.PI * 1.95);
      ctx.arc(x + 16, y - 16, 9, Math.PI * 1.5, Math.PI * .5);
      ctx.lineTo(x - 12, y - 7); ctx.arc(x - 12, y - 16, 9, Math.PI * .5, Math.PI * 1.4);
      ctx.fill();
      ctx.lineWidth = 3;
      for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(x + dx + 2, y - 1); ctx.lineTo(x + dx, y + 5); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.font = '500 32px "Inter Tight", Arial, sans-serif';
      ctx.fillText('25°', x + 2, y + 40); ctx.textAlign = 'left';
    }
    function drawNote(x, y) {
      pen(5);
      ctx.beginPath(); ctx.roundRect(x - 26, y - 26, 52, 52, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x + 12, y - 6); ctx.moveTo(x - 14, y + 6); ctx.lineTo(x + 2, y + 6); ctx.stroke();
      circle(x + 22, y + 22, 13, '#f4f6f8');
      ctx.strokeStyle = '#6b7783'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(x + 22, y + 15); ctx.lineTo(x + 22, y + 29); ctx.moveTo(x + 15, y + 22); ctx.lineTo(x + 29, y + 22); ctx.stroke();
    }
    function drawCalculator(x, y) {
      pen(6);
      ctx.beginPath();
      ctx.moveTo(x - 28, y - 14); ctx.lineTo(x - 6, y - 14); ctx.moveTo(x - 17, y - 25); ctx.lineTo(x - 17, y - 3);
      ctx.moveTo(x + 6, y - 14); ctx.lineTo(x + 28, y - 14);
      ctx.moveTo(x - 26, y + 6); ctx.lineTo(x - 8, y + 24); ctx.moveTo(x - 8, y + 6); ctx.lineTo(x - 26, y + 24);
      ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 28, y + 10); ctx.moveTo(x + 6, y + 20); ctx.lineTo(x + 28, y + 20);
      ctx.stroke();
    }
    function drawTorch(x, y) {
      pen(4);
      ctx.beginPath(); ctx.moveTo(x - 10, y - 22); ctx.lineTo(x + 10, y - 22); ctx.lineTo(x + 8, y - 8); ctx.lineTo(x + 6, y + 22);
      ctx.lineTo(x - 6, y + 22); ctx.lineTo(x - 8, y - 8); ctx.closePath(); ctx.stroke();
      ctx.fillRect(x - 2, y - 2, 4, 8);
    }
    function drawWave(x, y) {
      pen(4);
      [8, 16, 26, 14, 30, 12, 18, 8].forEach((height, i) => {
        const bx = x - 21 + i * 6; ctx.beginPath(); ctx.moveTo(bx, y - height / 2); ctx.lineTo(bx, y + height / 2); ctx.stroke();
      });
    }

    // A blue-grey wallpaper of soft, overlapping curves, painted once.
    function paintWallpaper() {
      const paper = document.createElement('canvas');
      paper.width = W; paper.height = H;
      const c = paper.getContext('2d');
      const base = c.createLinearGradient(0, 0, W * .6, H);
      base.addColorStop(0, '#a3abb1'); base.addColorStop(.45, '#7d8893'); base.addColorStop(1, '#5d6a75');
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      const soft = 'filter' in c;
      const shape = (blur, fill, draw) => {
        c.save(); if (soft) c.filter = `blur(${blur}px)`;
        c.beginPath(); draw(); c.fillStyle = fill; c.fill(); c.restore();
      };
      // A dark sweep from the upper left to the bottom.
      const sweep = c.createLinearGradient(0, H * .2, W * .7, H);
      sweep.addColorStop(0, '#46525f'); sweep.addColorStop(.5, '#2f3a47'); sweep.addColorStop(1, '#4f5d6b');
      shape(10, sweep, () => {
        c.moveTo(-60, H * .2);
        c.bezierCurveTo(W * .45, H * .18, W * .78, H * .48, W * .72, H * 1.05);
        c.lineTo(-60, H * 1.05);
      });
      // Its lit edge.
      const rim = c.createLinearGradient(W * .3, H * .25, W * .9, H * .8);
      rim.addColorStop(0, 'rgba(214, 220, 226, 0)'); rim.addColorStop(.5, 'rgba(214, 220, 226, .55)'); rim.addColorStop(1, 'rgba(214, 220, 226, 0)');
      c.save(); if (soft) c.filter = 'blur(14px)';
      c.beginPath(); c.moveTo(-60, H * .2); c.bezierCurveTo(W * .45, H * .18, W * .78, H * .48, W * .72, H * 1.05);
      c.lineWidth = 46; c.strokeStyle = rim; c.stroke(); c.restore();
      // A second, lower fold.
      const fold = c.createLinearGradient(0, H * .45, W * .5, H);
      fold.addColorStop(0, '#5f6d7d'); fold.addColorStop(1, '#3a4654');
      shape(12, fold, () => {
        c.moveTo(-60, H * .42);
        c.bezierCurveTo(W * .32, H * .5, W * .55, H * .72, W * .5, H * 1.05);
        c.lineTo(-60, H * 1.05);
      });
      // Light on the right and a little depth at the corners.
      const glow = c.createRadialGradient(W * .92, H * .55, 0, W * .92, H * .55, W * .7);
      glow.addColorStop(0, 'rgba(178, 186, 194, .5)'); glow.addColorStop(1, 'rgba(178, 186, 194, 0)');
      c.fillStyle = glow; c.fillRect(0, 0, W, H);
      const shade = c.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, 'rgba(20, 26, 34, .18)'); shade.addColorStop(.25, 'rgba(20, 26, 34, 0)'); shade.addColorStop(1, 'rgba(20, 26, 34, .2)');
      c.fillStyle = shade; c.fillRect(0, 0, W, H);
      return paper;
    }

    return {
      mesh,
      get awake() { return target === 1; },
      wake(t) { if (target !== 1) { target = 1; wokeAt = t; } },
      sleep() { target = 0; },
      // Play the wake animation again, unless it has only just played.
      replay(t) {
        if (t - wokeAt < 1.5) return;
        wokeAt = t; target = 1; level = reduceMotion.matches ? 1 : 0;
      },
      update
    };
  }

  window.RFIDLockScreen = { create };
})();
