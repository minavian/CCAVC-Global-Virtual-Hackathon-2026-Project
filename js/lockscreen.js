/*
 * The phone's screen: an always-on display that wakes into a lock screen.
 *
 * Asleep (always-on display): a dim clock on black.
 * Awake: a soft blue-grey wallpaper, a tall live clock, the date, four widget tiles
 * and two shortcut buttons, which arrive in a short staggered animation.
 *
 * Built for speed: every element is its own layer with a texture painted once, and the
 * animation only changes opacity, position and scale. The clock texture is repainted
 * once a minute and the date once a day; nothing is uploaded while the screen animates.
 *
 * window.RFIDLockScreen.create(THREE, reduceMotion, size) returns
 *   { mesh, wake(t), sleep(), replay(t), update(t, dt, facing) }
 * where size = { width, height, radius } of the display glass in model units.
 */
(function () {
  'use strict';

  const W = 720, H = 1540;                 // design units: the display's 1 : 2.14 aspect
  const WAKE = 1.25, SLEEP = .6;           // seconds
  const BRIGHT = 1.3;                      // a touch brighter than white reads as a lit screen
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = p => 1 - (1 - p) ** 3;
  const easeOutBack = p => { const c = 1.4; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Where each element sits on the screen, in design units.
  const CLOCK = { x: 44, y: 176, w: 300, h: 1124, row: 548, gap: 28 };
  const DATE = { x: 424, y: 164, w: 256, h: 112 };
  const TILES = [[396, 312], [556, 312], [396, 472], [556, 472]];
  const BUTTONS = [[99, 1418], [621, 1418]];
  // Regions of the shared icon atlas (512 × 256), in atlas pixels.
  const ATLAS = {
    tiles: [[4, 4], [132, 4], [260, 4], [388, 4]],      // 116 × 116 each
    buttons: [[4, 128], [104, 128]],                     // 92 × 92 each
    lock: [204, 128, 60, 56],
    status: [272, 128, 160, 46]
  };

  function create(T, reduceMotion, size) {
    const ux = size.width / W, uy = size.height / H;
    const toX = x => (x / W - .5) * size.width, toY = y => (.5 - y / H) * size.height;
    const group = new T.Group();
    group.name = 'lock-screen';

    // ---------- Textures, painted once ----------
    const texture = (canvas, mipmaps = true) => {
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      if (!mipmaps) { map.generateMipmaps = false; map.minFilter = T.LinearFilter; }
      return map;
    };
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    const wallpaperMap = texture(paintWallpaper());
    const atlasCanvas = canvas(512, 256);
    const atlasMap = texture(atlasCanvas);
    const clockCanvas = canvas(240, 900);                // the clock at 0.8× design size
    const clockMap = texture(clockCanvas, false);        // repainted each minute, so no mipmaps
    const dateCanvas = canvas(256, 112);
    const dateMap = texture(dateCanvas, false);

    // ---------- Layers ----------
    const layer = (map, opaque = false) => {
      const material = new T.MeshBasicMaterial({ map, toneMapped: false, transparent: !opaque, depthWrite: opaque });
      material.color.setScalar(map ? BRIGHT : 1);
      if (!map) material.color.setHex(0x000000);
      return material;
    };
    function rounded(material, z) {
      const outline = new T.Shape(), w = size.width / 2, h = size.height / 2, r = size.radius;
      outline.moveTo(-w + r, -h);
      outline.lineTo(w - r, -h); outline.quadraticCurveTo(w, -h, w, -h + r);
      outline.lineTo(w, h - r); outline.quadraticCurveTo(w, h, w - r, h);
      outline.lineTo(-w + r, h); outline.quadraticCurveTo(-w, h, -w, h - r);
      outline.lineTo(-w, -h + r); outline.quadraticCurveTo(-w, -h, -w + r, -h);
      const geometry = new T.ShapeGeometry(outline, 10);
      const { position, uv } = geometry.attributes;
      for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / size.width + .5, position.getY(i) / size.height + .5);
      const mesh = new T.Mesh(geometry, material);
      mesh.position.z = z;
      group.add(mesh);
      return mesh;
    }
    // A rectangle of design size w × h showing atlas region [ax, ay, aw, ah] of a texture.
    function quad(material, w, h, region, mapSize, z, anchorTopLeft = false) {
      const geometry = new T.PlaneGeometry(w * ux, h * uy);
      if (anchorTopLeft) geometry.translate(w * ux / 2, -h * uy / 2, 0);
      if (region) {
        const [ax, ay, aw, ah] = region, [mw, mh] = mapSize;
        const u0 = ax / mw, u1 = (ax + aw) / mw, v0 = 1 - (ay + ah) / mh, v1 = 1 - ay / mh;
        geometry.attributes.uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0]);
      }
      const mesh = new T.Mesh(geometry, material);
      mesh.position.z = z;
      group.add(mesh);
      return mesh;
    }

    // Layers stack a hair apart, so they never fight over depth.
    const Z = k => k * .00002;
    rounded(layer(null, true), 0);                                          // the black panel
    const wallpaper = rounded(layer(wallpaperMap), Z(1));
    const clock = quad(layer(clockMap), CLOCK.w, CLOCK.h, null, null, Z(2), true);
    clock.position.set(toX(CLOCK.x), toY(CLOCK.y), Z(2));
    const date = quad(layer(dateMap), DATE.w, DATE.h, null, null, Z(2));
    const dateX = toX(DATE.x + DATE.w / 2);
    date.position.set(dateX, toY(DATE.y + DATE.h / 2), Z(2));
    const tiles = TILES.map(([x, y], i) => {
      const mesh = quad(layer(atlasMap), 116, 116, [...ATLAS.tiles[i], 116, 116], [512, 256], Z(3));
      mesh.position.set(toX(x + 58), toY(y + 58), Z(3));
      return mesh;
    });
    const buttons = BUTTONS.map(([x, y], i) => {
      const mesh = quad(layer(atlasMap), 92, 92, [...ATLAS.buttons[i], 92, 92], [512, 256], Z(3));
      mesh.userData.y = toY(y);
      mesh.position.set(toX(x), toY(y), Z(3));
      return mesh;
    });
    const lock = quad(layer(atlasMap), 60, 56, ATLAS.lock, [512, 256], Z(3));
    const lockY = toY(80 + 28);
    lock.position.set(toX(334 + 30), lockY, Z(3));
    const status = quad(layer(atlasMap), 160, 46, ATLAS.status, [512, 256], Z(3));
    status.position.set(toX(530 + 80), toY(18 + 23), Z(3));
    const hole = new T.Mesh(new T.CircleGeometry(13 * ux, 24), layer(null, true));
    hole.position.set(toX(360), toY(46), Z(4));
    group.add(hole);
    const fading = [wallpaper, clock, date, ...tiles, ...buttons, lock, status];
    // Draw the see-through layers strictly back to front. Sorting by position would let the
    // wallpaper cover the clock whenever the phone tilts the clock's corner away.
    wallpaper.renderOrder = 1;
    clock.renderOrder = date.renderOrder = 2;
    for (const mesh of [...tiles, ...buttons, lock, status]) mesh.renderOrder = 3;

    // ---------- Painting ----------
    paintAtlas(atlasCanvas.getContext('2d'));
    let minute = -1, day = -1;
    function paintClock(now) {
      const c = clockCanvas.getContext('2d'), s = clockCanvas.width / CLOCK.w;
      c.setTransform(s, 0, 0, s, 0, 0);
      c.clearRect(0, 0, CLOCK.w, CLOCK.h);
      const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
      digits(c, hh, 0, 0, CLOCK.w, CLOCK.row);
      digits(c, mm, 0, CLOCK.row + CLOCK.gap, CLOCK.w, CLOCK.row);
      clockMap.needsUpdate = true;
    }
    function paintDate(now) {
      const c = dateCanvas.getContext('2d');
      c.clearRect(0, 0, DATE.w, DATE.h);
      c.fillStyle = '#fff'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.font = '500 40px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
      c.fillText(`${MONTHS[now.getMonth()]} ${now.getDate()}`, DATE.w - 10, 42);
      c.fillText(DAYS[now.getDay()], DATE.w - 10, 92);
      dateMap.needsUpdate = true;
    }
    function refresh(force) {
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), d = now.getDate();
      if (force || m !== minute) { minute = m; paintClock(now); }
      if (force || d !== day) { day = d; paintDate(now); }
    }
    refresh(true);
    if (document.fonts?.load) {
      Promise.all([document.fonts.load('700 120px Antonio'), document.fonts.load('500 40px "Inter Tight"')])
        .then(() => { refresh(true); paintAtlas(atlasCanvas.getContext('2d')); atlasMap.needsUpdate = true; }, () => {});
    }

    // ---------- Animation ----------
    let level = 0, target = 0, wokeAt = -10, shown = -1;
    function update(t, dt, facing = true) {
      if (reduceMotion.matches) level = target;
      else if (level < target) level = Math.min(target, level + dt / WAKE);
      else if (level > target) level = Math.max(target, level - dt / SLEEP);
      refresh(false);
      // Skip all screen work while the phone shows its back.
      group.visible = facing;
      if (!facing || level === shown) return;
      shown = level;
      const p = level;
      const set = (mesh, alpha) => { mesh.material.opacity = alpha; mesh.visible = alpha > .003; };

      set(wallpaper, easeOut(clamp01(p / .55)));
      // The clock grows from its dim always-on size into the full lock-screen clock.
      const grow = p > 0 ? easeOutBack(clamp01((p - .04) / .62)) : 0;
      clock.scale.setScalar(.78 + .22 * grow);
      set(clock, .5 + .5 * clamp01(p / .45));
      // The date is the one other thing the always-on display keeps.
      const dateIn = clamp01((p - .26) / .4);
      set(date, .55 + .45 * dateIn);
      date.position.x = dateX + (1 - easeOut(dateIn)) * 18 * ux;

      set(status, clamp01((p - .2) / .3));
      const lockIn = clamp01((p - .3) / .3);
      set(lock, lockIn);
      lock.position.y = lockY + (1 - easeOut(lockIn)) * 10 * uy;
      tiles.forEach((tile, i) => {
        const q = clamp01((p - .38 - i * .07) / .36);
        set(tile, easeOut(q));
        tile.scale.setScalar(.82 + .18 * easeOutBack(q));
      });
      const buttonsIn = clamp01((p - .58) / .32);
      buttons.forEach(button => {
        set(button, buttonsIn);
        button.position.y = button.userData.y - (1 - easeOut(buttonsIn)) * 24 * uy;
      });
    }

    return {
      mesh: group,
      layers: fading.length + 2,
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

  // ---------- Painting helpers ----------

  // Two digits stretched to fill a tall box, like the condensed lock-screen clock.
  function digits(ctx, text, x, y, boxW, boxH) {
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

  // Tiles, buttons, the lock and the status bar, each drawn into its own atlas region.
  function paintAtlas(ctx) {
    ctx.clearRect(0, 0, 512, 256);
    const pen = (width = 5) => {
      ctx.strokeStyle = '#f4f6f8'; ctx.fillStyle = '#f4f6f8';
      ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    };
    const circle = (x, y, radius, fill) => { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
    const tile = (x, y) => {
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, 114, 114, 34);
      ctx.fillStyle = 'rgba(255, 255, 255, .15)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .1)'; ctx.lineWidth = 1.5; ctx.stroke();
    };

    const icons = [
      (x, y) => { // laptop
        pen(5);
        ctx.beginPath(); ctx.roundRect(x - 26, y - 22, 52, 34, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 36, y + 20); ctx.lineTo(x + 36, y + 20); ctx.stroke();
      },
      (x, y) => { // weather
        pen(5);
        ctx.beginPath();
        ctx.arc(x - 9, y - 22, 11, Math.PI * .9, Math.PI * 1.75);
        ctx.arc(x + 6, y - 26, 14, Math.PI * 1.15, Math.PI * 1.95);
        ctx.arc(x + 16, y - 16, 9, Math.PI * 1.5, Math.PI * .5);
        ctx.lineTo(x - 12, y - 7); ctx.arc(x - 12, y - 16, 9, Math.PI * .5, Math.PI * 1.4);
        ctx.fill();
        ctx.lineWidth = 3;
        for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(x + dx + 2, y - 1); ctx.lineTo(x + dx, y + 5); ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '500 32px "Inter Tight", Arial, sans-serif';
        ctx.fillText('25°', x + 2, y + 40); ctx.textAlign = 'left';
      },
      (x, y) => { // note
        pen(5);
        ctx.beginPath(); ctx.roundRect(x - 26, y - 26, 52, 52, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x + 12, y - 6); ctx.moveTo(x - 14, y + 6); ctx.lineTo(x + 2, y + 6); ctx.stroke();
        circle(x + 22, y + 22, 13, '#f4f6f8');
        ctx.strokeStyle = '#6b7783'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(x + 22, y + 15); ctx.lineTo(x + 22, y + 29); ctx.moveTo(x + 15, y + 22); ctx.lineTo(x + 29, y + 22); ctx.stroke();
      },
      (x, y) => { // calculator
        pen(6);
        ctx.beginPath();
        ctx.moveTo(x - 28, y - 14); ctx.lineTo(x - 6, y - 14); ctx.moveTo(x - 17, y - 25); ctx.lineTo(x - 17, y - 3);
        ctx.moveTo(x + 6, y - 14); ctx.lineTo(x + 28, y - 14);
        ctx.moveTo(x - 26, y + 6); ctx.lineTo(x - 8, y + 24); ctx.moveTo(x - 8, y + 6); ctx.lineTo(x - 26, y + 24);
        ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 28, y + 10); ctx.moveTo(x + 6, y + 20); ctx.lineTo(x + 28, y + 20);
        ctx.stroke();
      }
    ];
    ATLAS.tiles.forEach(([x, y], i) => { tile(x, y); icons[i](x + 58, y + 58); });

    const [[b0x, b0y], [b1x, b1y]] = ATLAS.buttons;
    circle(b0x + 46, b0y + 46, 45, 'rgba(46, 54, 66, .55)');
    pen(4); // torch
    let x = b0x + 46, y = b0y + 46;
    ctx.beginPath(); ctx.moveTo(x - 10, y - 22); ctx.lineTo(x + 10, y - 22); ctx.lineTo(x + 8, y - 8); ctx.lineTo(x + 6, y + 22);
    ctx.lineTo(x - 6, y + 22); ctx.lineTo(x - 8, y - 8); ctx.closePath(); ctx.stroke();
    ctx.fillRect(x - 2, y - 2, 4, 8);
    circle(b1x + 46, b1y + 46, 45, 'rgba(255, 255, 255, .16)');
    pen(4); // voice
    x = b1x + 46; y = b1y + 46;
    [8, 16, 26, 14, 30, 12, 18, 8].forEach((height, i) => {
      const bx = x - 21 + i * 6; ctx.beginPath(); ctx.moveTo(bx, y - height / 2); ctx.lineTo(bx, y + height / 2); ctx.stroke();
    });

    const [lx, ly] = ATLAS.lock;
    pen(5); // open padlock
    x = lx + 26; y = ly + 32;
    ctx.beginPath(); ctx.roundRect(x - 20, y - 6, 34, 26, 5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 6, y - 14); ctx.arc(x + 17, y - 14, 11, Math.PI, 0); ctx.lineTo(x + 28, y - 6); ctx.stroke();

    const [sx, sy] = ATLAS.status;
    pen(4); // 5G, signal, wifi, battery
    ctx.font = '600 15px "Inter Tight", Arial, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText('5G', sx + 10, sy + 16);
    for (let i = 0; i < 4; i++) ctx.fillRect(sx + 22 + i * 9, sy + 32 - i * 5, 6, 8 + i * 5);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(sx + 82, sy + 38, 6 + i * 7, -2.4, -.74); ctx.stroke(); }
    ctx.beginPath(); ctx.roundRect(sx + 110, sy + 16, 40, 22, 6); ctx.stroke();
    ctx.fillRect(sx + 114, sy + 20, 18, 14); ctx.fillRect(sx + 152, sy + 22, 3, 10);
  }

  // A blue-grey wallpaper of soft, overlapping curves, painted once at 0.75× design size.
  function paintWallpaper() {
    const s = .75, paper = document.createElement('canvas');
    paper.width = Math.round(W * s); paper.height = Math.round(H * s);
    const c = paper.getContext('2d');
    c.scale(s, s);
    const base = c.createLinearGradient(0, 0, W * .6, H);
    base.addColorStop(0, '#a3abb1'); base.addColorStop(.45, '#7d8893'); base.addColorStop(1, '#5d6a75');
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    const soft = 'filter' in c;
    const shape = (blur, fill, draw) => {
      c.save(); if (soft) c.filter = `blur(${blur * s}px)`;
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
    c.save(); if (soft) c.filter = `blur(${14 * s}px)`;
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

  window.RFIDLockScreen = { create };
})();
