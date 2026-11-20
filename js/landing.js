/*
 * Landing hero: the opening choreography, the three-object carousel and its WebGL compositing.
 *
 * One playhead drives the whole opening. Every value it writes is a pure function of time,
 * so any user input can stop it and blend from wherever things are to where they belong.
 * After the opening, the carousel is a small physics model (position + velocity) that each
 * new input retargets without a jump.
 *
 * Dev aid: add ?t=<seconds> to the URL to freeze the opening at that moment.
 */
(function () {
  'use strict';

  // Opening timeline in seconds. Everything about pacing lives here.
  const TIMELINE = {
    fadeIn: .5,          // ghosted headline appears
    wordsStart: .55,     // first word pops
    wordStagger: .17,
    wordDuration: .9,
    dockStart: 2.95,     // headline glides from center screen to its place
    dockDuration: 1.45,
    spinStart: 3.85,     // objects arrive spinning
    spinDuration: 2.7,
    spinTurns: 2,        // full trips around the carousel
    spinPower: 3.3,      // deceleration curve: higher lands softer
    sublineStart: 6.75,
    sublineDuration: 1.1,
    dotsDelay: .55,
    dotStagger: .16,
    end: 8.3
  };
  TIMELINE.land = TIMELINE.spinStart + TIMELINE.spinDuration;

  const GHOST_OPACITY = .14;     // words that have not popped yet are faint, never invisible
  const GHOST_SCALE = .86;
  const DRIFT_BACK_AFTER = 6;    // idle seconds before the carousel returns to the key fob
  const DRIFT_DURATION = 1.7;
  const NAMES = ['Key fob', 'Phone', 'Contactless card'];
  const BASE_PITCH = [.16, -.09, .11];
  const BASE_YAW = [-.42, .38, -.24];
  const BASE_ROLL = [-.31, -.19, .14];
  const SHADOW = [[.46, .55], [.5, .57], [.74, .4]];   // [width, drop] as fractions of pose size
  const TAU = Math.PI * 2;

  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), headline = $('headline'), subline = $('subline');
  const copyBox = document.querySelector('.copy');
  const announcer = $('focus-name');
  const words = [...headline.querySelectorAll('.word')];
  const dots = [...subline.querySelectorAll('.dots span')];
  const shadows = [...document.querySelectorAll('.shadows i')];
  const light = document.querySelector('.stage-light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stacked = matchMedia('(max-aspect-ratio: 1/1), (max-width: 760px)');
  const params = new URLSearchParams(location.search);
  const frozenAt = params.has('t') ? Math.max(0, parseFloat(params.get('t')) || 0) : null;

  // ---------- Math ----------
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap3 = n => ((n % 3) + 3) % 3;
  // The visible viewport (innerWidth can grow past it on phones).
  const viewW = () => root.clientWidth || innerWidth;
  const viewH = () => root.clientHeight || innerHeight;
  const smoothstep = p => p * p * (3 - 2 * p);
  const easeOutCubic = p => 1 - (1 - p) ** 3;
  const easeOutQuint = p => 1 - (1 - p) ** 5;

  // CSS-equivalent cubic-bezier easing.
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const x = t => ((ax * t + bx) * t + cx) * t;
    const y = t => ((ay * t + by) * t + cy) * t;
    return p => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let lo = 0, hi = 1, t = p;
      for (let i = 0; i < 24; i++) {
        if (x(t) < p) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return y(t);
    };
  }
  const dockEase = bezier(.72, 0, .14, 1);   // a slow lift-off, then a long glide in

  // An underdamped spring from 0 to 1: a gentle overshoot that settles by p = 1.
  function pop(p) {
    if (p >= 1) return 1;
    const zeta = .45, omega = 9.5, wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * p) * (Math.cos(wd * p) + zeta * omega / wd * Math.sin(wd * p));
  }

  // ---------- State ----------
  let calm = reduced.matches;
  let intro = null;               // opening playhead (seconds) while it runs
  let started = false;
  let docked = false;             // headline back in normal flow
  let landedInIntro = false;
  let clock = 0;                  // drives model micro-animations
  let elapsed = 0;                // drives the idle float
  let phase = -3 * TIMELINE.spinTurns, velocity = 0, twist = 0;
  let flight = null, drag = null;
  let entrance = 0, entranceFlight = null;
  let landedAt = -10;
  let idle = 0;
  let focus = 0;
  let leanX = 0, leanY = 0, aimX = 0, aimY = 0;
  let layout = null;
  let slot = null, dock = null;   // placeholder that holds the headline's docked place
  let gl = null;
  let lastNow = null, frameId = 0;
  let skipPointer = null, skipEvent = null;
  const poses = [0, 1, 2].map(() => ({ x: 0, y: 0, baseY: 0, size: 0, depth: 0, side: 0, roll: 0, leanX: 0, leanY: 0 }));

  // ---------- Layout ----------
  // The stage covers the whole page; the objects live in the region the words leave free.
  function measure() {
    const rect = stage.getBoundingClientRect(), copy = copyBox.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const narrow = stacked.matches;
    const region = narrow
      ? { x: 0, y: copy.bottom - rect.top + h * .02, w, h: 0 }
      : { x: 0, y: 0, w: Math.max(1, copy.left - rect.left), h };
    if (narrow) region.h = Math.max(1, h - region.y);
    // The front object is large and the other two tuck in close behind it.
    const r = narrow
      ? { cx: .5, cy: .5, ax: .3, ay: .2, dz: .02, size: Math.min(region.w * .75, region.h * .6) }
      : { cx: .5, cy: .48, ax: .29, ay: .27, dz: .02, size: Math.min(region.w * .7, region.h * .62) };
    layout = {
      w, h, size: r.size,
      cx: (region.x + region.w * r.cx) / w, cy: (region.y + region.h * r.cy) / h,
      ax: r.ax * region.w / w, ay: r.ay * region.h / h, dz: r.dz * region.h / h
    };
    stage.style.setProperty('--region-x', region.x + 'px');
    stage.style.setProperty('--region-y', region.y + 'px');
    stage.style.setProperty('--region-w', region.w + 'px');
    stage.style.setProperty('--region-h', region.h + 'px');
    // Dragging follows the diagonal from the back-left slot (bottom-left) to the back-right one (top-right).
    const reach = Math.sin(TAU / 3);
    const dx = 2 * w * layout.ax * reach, dy = -2 * h * layout.ay * reach, span = Math.hypot(dx, dy) || 1;
    layout.dirX = dx / span; layout.dirY = dy / span; layout.slotSpan = span / 2;
    measureHeadline();
    gl?.resize(w, h);
  }

  function measureHeadline() {
    if (docked || !slot) return;
    const r = slot.getBoundingClientRect();
    const dockFont = parseFloat(getComputedStyle(slot).fontSize) || 64;
    const fit = Math.min((viewW() - 40) * .9 / r.width, viewH() * .6 / r.height, 2.4);
    const k = Math.max(1, fit);
    headline.style.fontSize = dockFont * k + 'px';
    // Type scales linearly, so the large layout is exactly k times the docked one.
    dock = { left: r.left, top: r.top, width: r.width, height: r.height, k, bigW: r.width * k, bigH: r.height * k };
  }

  // ---------- Carousel ----------
  function computePoses() {
    const L = layout;
    for (let i = 0; i < 3; i++) {
      const a = (i - phase) * TAU / 3, side = Math.sin(a), depth = (1 - Math.cos(a)) / 2;
      const p = poses[i], float = calm ? 0 : Math.sin(elapsed * .42 + i * 1.9);
      const settle = i === 0 ? landingPulse() : 0;
      const near = 1 - depth;
      p.x = L.w * (L.cx - L.ax * side) + leanX * near * 14;
      p.baseY = L.h * (L.cy + L.ay * side + L.dz * depth);
      p.y = p.baseY + float * L.size * .016 + leanY * near * 10;
      p.size = L.size * (1 - .56 * depth) * (.84 + .16 * entrance) * (1 + settle);
      p.depth = depth; p.side = side; p.float = float;
      p.roll = BASE_ROLL[i] + side * .2 + float * .027 + Math.tanh(velocity * .28) * .13;
      p.leanX = leanX * near; p.leanY = leanY * near;
    }
  }

  function landingPulse() {
    const q = (clock - landedAt) / .9;
    return q > 0 && q < 1 && !calm ? .034 * Math.sin(Math.PI * q) * (1 - q) : 0;
  }

  // Hermite flight from the current position and velocity to a target phase.
  function travel(target, duration, link = false) {
    idle = 0;
    if (calm) {
      flight = null; phase = target; velocity = 0; twist = 0;
      blink(); arrive(wrap3(Math.round(target)));
      return;
    }
    const distance = target - phase;
    if (Math.abs(distance) < 1e-4 && Math.abs(velocity) < 1e-3) {
      flight = null; phase = target; velocity = 0;
      arrive(wrap3(Math.round(target)));
      return;
    }
    const dir = Math.sign(distance) || 1;
    const tangent = dir * Math.min(Math.max(0, velocity * duration * dir), 2.6 * Math.abs(distance));
    flight = { start: phase, end: target, tangent, duration, age: 0, link };
  }

  function bringToFront(i, duration = .95) {
    const target = phase + (wrap3(i - phase + 1.5) - 1.5);
    travel(Math.round(target), duration);
  }

  function stepCarousel(direction) {
    const base = flight ? flight.end : Math.round(phase);
    travel(base + direction, .9);
  }

  function advanceFlight(dt) {
    const m = flight;
    m.age += dt;
    const p = clamp01(m.age / m.duration), delta = m.end - m.start;
    phase = m.start + delta * smoothstep(p) + m.tangent * p * (1 - p) ** 2;
    velocity = (6 * delta * p * (1 - p) + m.tangent * (1 - p) * (1 - 3 * p)) / m.duration;
    if (m.link) twist = phase - m.end;
    if (p >= 1) {
      flight = null; velocity = 0; twist = m.link ? 0 : twist;
      phase = m.end - 3 * Math.floor(m.end / 3);   // keep the number small; poses repeat every 3
      arrive(wrap3(Math.round(phase)));
    }
  }

  // An object settled at the front.
  function arrive(i) {
    if (i === 0) landedAt = clock;
    gl?.arrive(i, clock + .12);
  }

  function updateFocus() {
    const next = wrap3(Math.round(phase));
    if (next === focus) return;
    gl?.present(focus);
    focus = next;
    if (intro === null) announcer.textContent = NAMES[focus];
  }

  // Reduced motion: objects swap places with a quick fade instead of orbiting.
  function blink() {
    gl?.canvas.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }

  // ---------- Opening ----------
  function placeHeadline(e) {
    if (!dock) return;
    const s = Math.exp(Math.log(1 / dock.k) * e);   // zoom in log space so it feels even
    const cx = lerp(viewW() / 2, dock.left + dock.width / 2, e);
    const cy = lerp(viewH() / 2, dock.top + dock.height / 2, e);
    headline.style.transform = `translate(${cx - dock.bigW * s / 2}px, ${cy - dock.bigH * s / 2}px) scale(${s})`;
  }

  function dockHeadline() {
    if (docked) return;
    docked = true;
    headline.setAttribute('data-docked', '');
    headline.style.removeProperty('font-size');
    headline.style.removeProperty('transform');
    headline.style.removeProperty('opacity');
    for (const word of words) word.removeAttribute('style');
    slot?.remove();
    slot = dock = null;
  }

  function applyIntro(t) {
    const TL = TIMELINE;
    if (!docked) {
      headline.style.opacity = easeOutCubic(clamp01(t / TL.fadeIn));
      words.forEach((word, i) => {
        const p = clamp01((t - TL.wordsStart - i * TL.wordStagger) / TL.wordDuration);
        const shown = easeOutCubic(clamp01(p * 1.4));
        word.style.opacity = GHOST_OPACITY + (1 - GHOST_OPACITY) * shown;
        word.style.transform = `scale(${GHOST_SCALE + (1 - GHOST_SCALE) * pop(p)})`;
        word.style.filter = shown < 1 ? `blur(${((1 - shown) * 3).toFixed(2)}px)` : 'none';
      });
      placeHeadline(dockEase(clamp01((t - TL.dockStart) / TL.dockDuration)));
      if (t >= TL.dockStart + TL.dockDuration) dockHeadline();
    }

    const into = t - TL.spinStart;
    entrance = easeOutCubic(clamp01(into / .75));
    const distance = 3 * TL.spinTurns, n = TL.spinPower;
    if (into <= 0) {
      phase = -distance; velocity = 0; twist = phase;
    } else {
      const p = clamp01(into / TL.spinDuration);
      phase = -distance * (1 - p) ** n;
      velocity = n * distance * (1 - p) ** (n - 1) / TL.spinDuration;
      twist = phase;
      if (p >= 1 && !landedInIntro) { landedInIntro = true; phase = 0; velocity = 0; twist = 0; arrive(0); }
    }

    const q =easeOutQuint(clamp01((t - TL.sublineStart) / TL.sublineDuration));
    subline.style.opacity = q;
    subline.style.transform = `translateY(${((1 - q) * .6).toFixed(3)}em)`;
    subline.style.filter = q < 1 ? `blur(${((1 - q) * 8).toFixed(2)}px)` : 'none';
    dots.forEach((dot, k) => {
      dot.style.opacity = easeOutCubic(clamp01((t - TL.sublineStart - TL.dotsDelay - k * TL.dotStagger) / .4));
    });
  }

  function capture(el, props) {
    const style = getComputedStyle(el), frame = {};
    for (const prop of props) frame[prop] = style[prop];
    return frame;
  }

  // End the opening. With soft = true every layer blends from where it is now.
  function finishIntro(soft) {
    if (intro === null) return;
    const t = intro, TL = TIMELINE;
    intro = null;
    soft = soft && !calm;
    const ease = 'cubic-bezier(.16, 1, .3, 1)';
    const beforeLanding = t < TL.land;

    if (!docked) {
      if (soft) {
        const before = headline.getBoundingClientRect();
        const opacity = getComputedStyle(headline).opacity;
        const wordFrames = words.map(word => capture(word, ['opacity', 'transform', 'filter']));
        dockHeadline();
        const after = headline.getBoundingClientRect();
        // Start the blend at the speed the headline already has, so the handoff has no kick.
        const duration = .95, u = (t - TL.dockStart) / TL.dockDuration;
        const e = dockEase(clamp01(u)), rate = (dockEase(clamp01(u + .01)) - dockEase(clamp01(u - .01))) / (.02 * TL.dockDuration);
        const slope = e < .999 ? rate * duration / (1 - e) : 0;
        const x1 = slope > 0 ? Math.min(.42, 1 / slope) : .42, y1 = x1 * slope;
        headline.animate([
          { transformOrigin: '0 0', opacity,
            transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width})` },
          { transformOrigin: '0 0', opacity: 1, transform: 'none' }
        ], { duration: duration * 1000, easing: `cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, .2, 1)` });
        words.forEach((word, i) => word.animate([wordFrames[i], { opacity: 1, transform: 'none', filter: 'none' }],
          { duration: 700, easing: ease }));
      } else dockHeadline();
    }

    // The subline still arrives after the objects settle.
    const subFrame = capture(subline, ['opacity', 'transform', 'filter']);
    const dotFrames = dots.map(dot => capture(dot, ['opacity']));
    subline.removeAttribute('style');
    dots.forEach(dot => dot.removeAttribute('style'));
    root.removeAttribute('data-intro');
    if (soft) {
      const wait = beforeLanding ? 900 : 0;
      subline.animate([subFrame, { opacity: 1, transform: 'none', filter: 'none' }],
        { duration: 1000, delay: wait, easing: ease, fill: 'backwards' });
      dots.forEach((dot, k) => dot.animate([dotFrames[k], { opacity: 1 }],
        { duration: 400, delay: wait + 380 + k * 120, easing: 'ease-out', fill: 'backwards' }));
    }

    // The carousel hands its current motion to a flight that lands on the key fob.
    if (!landedInIntro) {
      if (calm || !soft) {
        phase = 0; velocity = 0; twist = 0; entrance = 1; arrive(0);
      } else {
        if (t < TL.spinStart) { phase = -1.6; velocity = 3; twist = phase; }
        entranceFlight = { from: entrance, age: 0, duration: .8 };
        const distance = -phase, speed = Math.max(velocity, .01);
        const duration = clamp(2.2 * distance / speed, .75, 1.6);
        travel(0, duration, true);
      }
    } else {
      entrance = 1;
    }
    announcer.textContent = '';
  }

  // ---------- Frame loop ----------
  function step(dt) {
    clock += dt;
    if (!calm) elapsed += dt;
    const follow = 1 - Math.exp(-2.2 * dt);
    leanX += ((calm ? 0 : aimX) - leanX) * follow;
    leanY += ((calm ? 0 : aimY) - leanY) * follow;

    if (intro !== null) {
      intro = frozenAt !== null ? frozenAt : intro + dt;
      applyIntro(intro);
      if (intro >= TIMELINE.end) finishIntro(false);
    } else {
      if (entranceFlight) {
        const e = entranceFlight;
        e.age += dt;
        const p = clamp01(e.age / e.duration);
        entrance = lerp(e.from, 1, easeOutCubic(p));
        if (p >= 1) entranceFlight = null;
      }
      if (!flight?.link) twist *= Math.exp(-5 * dt);
      if (flight && !drag) advanceFlight(dt);
      else if (!flight && !drag) {
        idle += dt;
        if (focus !== 0 && idle > DRIFT_BACK_AFTER) bringToFront(0, DRIFT_DURATION);
      }
    }
    updateFocus();
  }

  function render(dt) {
    computePoses();
    const fade = entrance;
    light.style.opacity = fade;
    // Shadows wait for the models, which stream in as GLB files.
    const shown = fade * (gl?.shown ?? 0);
    shadows.forEach((el, i) => {
      const p = poses[i], [sw, drop] = SHADOW[i];
      const lift = 1 - (p.float || 0) * .05;
      const width = p.size * sw * lift, height = p.size * .075 * lift;
      const y = p.baseY + p.size * drop;
      el.style.transform = `translate(${(p.x - 50).toFixed(1)}px, ${(y - 50).toFixed(1)}px) scale(${(width / 100).toFixed(3)}, ${(height / 100).toFixed(3)})`;
      el.style.opacity = (shown * (1 - p.depth) ** 2 * .85).toFixed(3);
    });
    gl?.draw(dt, fade);
  }

  function frame(now) {
    frameId = 0;
    if (document.hidden) { lastNow = null; return; }
    // Clamp the step so a hitch slows the motion down instead of skipping it.
    const dt = lastNow === null ? 0 : Math.min(.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    step(dt);
    render(dt);
    frameId = requestAnimationFrame(frame);
  }

  function wake() {
    if (!frameId && started && !document.hidden) frameId = requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  function skipFrom(e) {
    if (intro === null || !started || frozenAt !== null) return;
    if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    skipEvent = e;
    if (e.type === 'pointerdown') skipPointer = e.pointerId;
    finishIntro(true);
  }
  for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart'])
    addEventListener(type, skipFrom, { capture: true, passive: true });
  stage.addEventListener('focus', e => skipFrom(e));

  function hitTest(clientX, clientY) {
    const r = stage.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
    let best = -1, bestScore = Infinity;
    poses.forEach((p, i) => {
      const score = Math.hypot(x - p.x, y - p.y) / (p.size * .5) + p.depth * .35;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return bestScore < 1 ? best : -1;
  }

  stage.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || !started || intro !== null || e.pointerId === skipPointer) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: phase, moved: false, time: performance.now(), v: 0 };
    flight = null;   // catch the carousel where it is
    velocity = 0; idle = 0;
  });

  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; stage.classList.add('is-dragging'); }
    const next = drag.from + (dx * layout.dirX + dy * layout.dirY) / layout.slotSpan;
    const now = performance.now(), dt = Math.max(1, now - drag.time) / 1000;
    drag.v = lerp(drag.v, (next - phase) / dt, .4);
    drag.time = now;
    phase = next;
    velocity = calm ? 0 : drag.v;
    idle = 0;
  });

  function release(e) {
    if (e.pointerId === skipPointer) { skipPointer = null; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag;
    drag = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (was.moved || e.type !== 'pointerup') {
      const stale = performance.now() - was.time > 90;
      velocity = stale ? 0 : was.v;
      const thrown = phase + clamp(velocity * .22, -1.2, 1.2);
      travel(Math.round(thrown), .95);
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    if (hit === -1) travel(Math.round(phase), .7);
    else if (hit !== focus) bringToFront(hit);
    else if (flight || Math.abs(phase - Math.round(phase)) > .02) travel(Math.round(phase), .5);
    else gl?.activate(hit, clock);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, release);
  addEventListener('pointerup', e => { if (e.pointerId === skipPointer) skipPointer = null; });

  addEventListener('keydown', e => {
    if (e === skipEvent || intro !== null || !started || e.altKey || e.ctrlKey || e.metaKey) return;
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (direction) { e.preventDefault(); stepCarousel(direction); return; }
    if (e.target === stage && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      gl?.activate(focus, clock);
    }
  });

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    aimX = clamp(e.clientX / viewW() * 2 - 1, -1, 1);
    aimY = clamp(e.clientY / viewH() * 2 - 1, -1, 1);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { aimX = aimY = 0; });

  document.addEventListener('visibilitychange', () => { lastNow = null; wake(); });
  reduced.addEventListener('change', () => {
    calm = reduced.matches;
    if (calm) { finishIntro(false); flight = null; phase = Math.round(phase); velocity = twist = 0; }
  });
  addEventListener('resize', measure);
  const resized = new ResizeObserver(() => measure());
  resized.observe(stage);
  resized.observe(copyBox);

  // ---------- 3D ----------
  async function loadScene() {
    try {
      const [T, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/environments/RoomEnvironment.js')
      ]);
      const objects = await window.RFIDModels.load(T, GLTFLoader, reduced);
      gl = createScene(T, objects, RoomEnvironment);
      if (layout) gl.resize(layout.w, layout.h);
      if (intro === null && focus === 0 && !flight) arrive(0);
    } catch (error) {
      gl = null;
      console.warn('The 3D models could not load; showing the words only.', error);
    }
  }

  function createScene(T, objects, RoomEnvironment) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = '0';
    const coarse = matchMedia('(pointer: coarse)').matches;
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new T.Scene();
    const eye = new T.OrthographicCamera(0, 1, 1, 0, 1, 2000);
    eye.position.z = 1000;
    // A soft studio for the models' PBR materials to reflect, plus a key and fill light.
    const studio = new T.PMREMGenerator(renderer);
    scene.environment = studio.fromScene(new RoomEnvironment(), .04).texture;
    scene.environmentIntensity = .9;
    studio.dispose();
    scene.add(new T.HemisphereLight(0xfffcf6, 0x928f86, .9));
    for (const [x, y, z, power] of [[-4, 6, 5, 1.8], [4, 3, -3, 1.4], [2, -3, 4, .4]]) {
      const lamp = new T.DirectionalLight(0xfffaf0, power);
      lamp.position.set(x, y, z);
      scene.add(lamp);
    }
    const stands = objects.map(o => { const g = new T.Group(); g.add(o.model); scene.add(g); return g; });

    const floatColor = renderer.extensions.has('EXT_color_buffer_float');
    const target = new T.WebGLRenderTarget(1, 1, {
      type: floatColor ? T.HalfFloatType : T.UnsignedByteType,
      depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
      samples: Math.min(coarse ? 2 : 4, renderer.capabilities.maxSamples)
    });
    const history = [0, 1].map(() => new T.WebGLRenderTarget(1, 1, { depthBuffer: false }));
    let current = 0, trailing = false;

    // Composite: depth of field, tone mapping and sRGB by hand, then receding objects
    // lose colour into the paper. Output is premultiplied and written raw.
    const composite = new T.ShaderMaterial({
      depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false,
      uniforms: {
        picture: { value: target.texture }, depthMap: { value: target.depthTexture },
        previous: { value: history[1].texture }, trail: { value: 0 },
        pixel: { value: new T.Vector2() }, paper: { value: new T.Vector3(245 / 255, 242 / 255, 236 / 255) }
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D picture, depthMap, previous;
        uniform vec2 pixel;
        uniform vec3 paper;
        uniform float trail;
        // Only objects that have receded blur; the front one stays sharp through its whole depth.
        float blurAt(vec2 uv) { return smoothstep(.535, .64, texture2D(depthMap, uv).x); }
        vec3 fit(vec3 v) {
          vec3 a = v * (v + .0245786) - .000090537;
          vec3 b = v * (.983729 * v + .4329510) + .238081;
          return a / b;
        }
        vec3 aces(vec3 color) {
          const mat3 inMat = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
          const mat3 outMat = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
          return clamp(outMat * fit(inMat * (color / .6)), 0., 1.);
        }
        vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
        void main() {
          float blur = blurAt(vUv);
          vec4 center = texture2D(picture, vUv), color = center;
          vec4 result = vec4(0.);
          bool empty = false;
          if (center.a < .002) {
            // Skip empty paper quickly, but look as far as the blur reaches.
            float around = 0.;
            for (int i = 0; i < 8; i++) {
              float a = float(i) * .78539816;
              around += texture2D(picture, vUv + vec2(cos(a), sin(a)) * pixel * 3.).a;
            }
            empty = around < .002;
          }
          if (!empty) {
            if (blur > .012) {
              // Three rings of eight taps, each ring turned a little to fill the gaps.
              color = center * 4.;
              float total = 4.;
              for (int ring = 1; ring <= 3; ring++) {
                float r = float(ring), weight = 1.9 - .4 * r;
                for (int i = 0; i < 8; i++) {
                  float a = float(i) * .78539816 + r * .26;
                  vec2 uv = vUv + vec2(cos(a), sin(a)) * pixel * blur * r;
                  vec4 tap = texture2D(picture, uv);
                  // A sharp foreground edge must not spread into clear background pixels.
                  if (center.a < .01) tap *= smoothstep(.015, .2, blurAt(uv));
                  color += weight * tap;
                  total += weight;
                }
              }
              color /= total;
            }
            if (color.a >= .002) {
              vec3 rgb = srgb(aces(color.rgb / color.a));
              float luma = dot(rgb, vec3(.2126, .7152, .0722));
              rgb = mix(rgb, vec3(luma), .8 * blur);
              rgb = mix(rgb, paper, .2 * blur);
              result = vec4(rgb * color.a, color.a);
            }
          }
          if (trail > 0.) result += texture2D(previous, vUv) * trail * (1. - result.a);
          gl_FragColor = result;
        }`
    });
    const copy = new T.ShaderMaterial({
      depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false,
      uniforms: { map: { value: null } },
      vertexShader: composite.vertexShader,
      fragmentShader: `varying vec2 vUv; uniform sampler2D map;
        void main() { gl_FragColor = texture2D(map, vUv); }`
    });
    const screen = new T.Scene(), flat = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), composite);
    screen.add(quad);

    let wide = 0, high = 0, shown = 0;   // shown fades the models in once they have loaded
    function resize(w, h) {
      if (!w || !h || (w === wide && h === high)) return;
      wide = w; high = h;
      eye.right = w; eye.top = h; eye.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      const ratio = renderer.getPixelRatio(), pw = Math.round(w * ratio), ph = Math.round(h * ratio);
      target.setSize(pw, ph);
      for (const h2 of history) h2.setSize(pw, ph);
      composite.uniforms.pixel.value.set(3.4 / w, 3.4 / h);   // blur radius per ring, in CSS pixels
      trailing = false;
    }

    function draw(dt, fade) {
      if (!wide || !high) return;
      objects.forEach((o, i) => {
        const p = poses[i], g = stands[i], sway = calm ? 0 : Math.sin(elapsed * .27 + i * 1.3);
        g.position.set(p.x, high - p.y, -325 * p.depth);
        g.scale.setScalar(p.size / o.span);
        g.rotation.set(BASE_PITCH[i] + sway * .044 + p.leanY * .1,
          BASE_YAW[i] + p.side * .49 + twist * TAU / 3 + sway * .115 + p.leanX * .15, p.roll, 'YXZ');
        o.action.update(clock, dt, o.model);
      });
      shown = Math.min(1, shown + dt / .6);
      canvas.style.opacity = fade * easeOutCubic(shown);
      renderer.setRenderTarget(target);
      renderer.render(scene, eye);

      // A soft motion trail, only while the objects spin in.
      const spinning = intro !== null || flight?.link;
      const amount = spinning && !calm ? clamp((Math.abs(velocity) - 1) * .075, 0, .5) : 0;
      quad.material = composite;
      if (amount > .01) {
        if (!trailing) {
          for (const h2 of history) { renderer.setRenderTarget(h2); renderer.clear(); }
          trailing = true;
        }
        composite.uniforms.previous.value = history[1 - current].texture;
        composite.uniforms.trail.value = amount;
        renderer.setRenderTarget(history[current]);
        renderer.render(screen, flat);
        quad.material = copy;
        copy.uniforms.map.value = history[current].texture;
        renderer.setRenderTarget(null);
        renderer.render(screen, flat);
        current = 1 - current;
      } else {
        trailing = false;
        composite.uniforms.trail.value = 0;
        renderer.setRenderTarget(null);
        renderer.render(screen, flat);
      }
    }

    // Model actions start a little later than asked, so a press lands after the motion.
    const pending = [];
    const queue = (i, at, kind) => pending.push({ i, at, kind });
    const actionClock = () => {
      for (let k = pending.length - 1; k >= 0; k--) {
        const { i, at, kind } = pending[k];
        if (clock >= at) { objects[i].action[kind]?.(clock); pending.splice(k, 1); }
      }
    };
    const baseDraw = draw;

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      gl = null; canvas.remove();
    });
    stage.insertBefore(canvas, announcer);

    return {
      canvas,
      get shown() { return shown; },
      resize,
      draw(dt, fade) { actionClock(); baseDraw(dt, fade); },
      arrive(i, at) { queue(i, at, 'arrive'); },
      activate(i, at) { queue(i, at, 'activate'); },
      present(i) { objects[i].action.present?.(); }
    };
  }

  // ---------- Start ----------
  function fontsReady() {
    if (!document.fonts?.load) return Promise.resolve();
    const load = Promise.all([document.fonts.load('800 1em "Inter Tight"'), document.fonts.load('400 1em "Inter Tight"')]);
    // Text stays invisible while the font loads (display=block, up to 3 s), so the opening waits for it.
    return Promise.race([load, new Promise(resolve => setTimeout(resolve, 3000))]).catch(() => {});
  }

  async function begin() {
    window.__heroStarted = true;
    const scene = loadScene();
    await fontsReady();
    const playing = root.hasAttribute('data-intro') && !calm;
    if (playing) {
      slot = document.createElement('div');
      slot.className = 'headline-slot';
      slot.setAttribute('aria-hidden', 'true');
      slot.innerHTML = headline.innerHTML;
      headline.before(slot);
      new ResizeObserver(() => measureHeadline()).observe(slot);
      intro = frozenAt !== null ? frozenAt : 0;
    } else {
      root.removeAttribute('data-intro');
      dockHeadline();
      phase = 0; twist = 0;
      entranceFlight = { from: 0, age: 0, duration: .6 };
    }
    measure();
    document.fonts?.addEventListener?.('loadingdone', measure);
    started = true;
    wake();
    await scene;
  }

  begin();

  if (params.has('debug')) {
    window.__hero = {
      get state() { return { intro, phase, velocity, twist, focus, entrance, docked, flight: !!flight, gl: !!gl, shown: gl?.shown ?? 0 }; },
      skip: () => finishIntro(true),
      bring: i => bringToFront(i, .4)
    };
  }
})();
