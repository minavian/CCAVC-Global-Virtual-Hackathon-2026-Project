/*
 * Part 2, "Take it apart": scenes 6 to 17. Each scene is one question with one thing to try,
 * and every picture is computed from the simulation in js/rfid as the visitor changes it.
 *
 *   The power      6 distance and coil size   7 a still magnet makes nothing
 *                  8 the tuning capacitor      9 metal                10 riding through pauses
 *   The answer     11 load modulation          12 the subcarrier      13 Manchester coding
 *                  14 check bits and CRC       15 the whole conversation
 *                  16 two cards at once        17 why a phone can't read a car key
 *
 * Plates draw only while they are on screen. Static ones redraw when an input changes;
 * moving ones (7, 15) draw every frame while visible.
 */
(function () {
  'use strict';

  const { physics, iso, tag: tags, air, reader, channel } = window.RFID;
  const INK = '#0d0d0c', MUTED = '#57534c', COPPER = '#b8652a', GREEN = '#1f7a4a', RED = '#b3261e';
  const GRID = 'rgba(13, 13, 12, .1)', FAINT = 'rgba(13, 13, 12, .35)';
  const MONO = '"JetBrains Mono", ui-monospace, monospace', SANS = '"Inter Tight", system-ui, sans-serif';
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const stage = (start, end, t) => clamp((t - start) / (end - start), 0, 1);
  const hex = b => b.toString(16).toUpperCase().padStart(2, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Volts, amperes and hertz with a sensible prefix.
  function si(value, unit, digits = 2) {
    const a = Math.abs(value);
    const [k, p] = a >= 1e6 ? [1e-6, 'M'] : a >= 1e3 ? [1e-3, 'k'] : a >= 1 || a === 0 ? [1, ''] : a >= 1e-3 ? [1e3, 'm'] : a >= 1e-6 ? [1e6, 'µ'] : [1e9, 'n'];
    return (value * k).toPrecision(digits).replace(/\.?0+$/, m => m.includes('.') ? '' : m) + ' ' + p + unit;
  }
  const cm = m => (m * 100).toFixed(1) + ' cm';

  // ---------- A plate: its canvas, its inputs, its words ----------
  function plate(id, draw, { animate = false } = {}) {
    const el = document.getElementById(id);
    if (!el) return null;
    const canvas = el.querySelector('canvas.plate-canvas'), ctx = canvas.getContext('2d');
    const readout = el.querySelector('.plate-readout');
    const p = { el, canvas, ctx, animate, visible: false, dirty: true, w: 0, h: 0, time: 0,
      input: name => el.querySelector('#' + id + '-' + name),
      radio: name => el.querySelector(`input[name="${id}-${name}"]:checked`)?.value,
      out(name, text) { const o = el.querySelector(`output[data-for="${id}-${name}"]`); if (o) o.textContent = text; },
      say(text) { if (readout.textContent !== text) readout.textContent = text; },
      draw };
    el.addEventListener('input', () => { p.dirty = true; });
    el.addEventListener('change', () => { p.dirty = true; });
    plates.push(p);
    return p;
  }
  const plates = [];

  function fit(p) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = p.canvas.clientWidth, h = p.canvas.clientHeight;
    if (p.canvas.width !== Math.round(w * dpr) || p.canvas.height !== Math.round(h * dpr)) {
      p.canvas.width = Math.round(w * dpr); p.canvas.height = Math.round(h * dpr); p.dirty = true;
    }
    p.w = w; p.h = h;
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.ctx.clearRect(0, 0, w, h);
    return p.ctx;
  }

  // A chart box with axes. `x` and `y` are { from, to, log?, ticks: [[value, label]], label }.
  function chart(ctx, box, x, y, progress = 1) {
    const map = (r, v, a, b) => {
      const t = r.log ? (Math.log(v) - Math.log(r.from)) / (Math.log(r.to) - Math.log(r.from)) : (v - r.from) / (r.to - r.from);
      return a + (b - a) * t;
    };
    const X = v => map(x, v, box.x, box.x + box.w), Y = v => map(y, v, box.y + box.h, box.y);
    ctx.save();
    const alpha = ctx.globalAlpha;
    const rule = i => stage(.30 + .047 * i, .62 + .047 * i, progress);
    ctx.font = `500 11px ${SANS}`; ctx.fillStyle = MUTED; ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    for (const [i, [v, label]] of (x.ticks || []).entries()) {
      const sweep = rule(i);
      ctx.beginPath(); ctx.moveTo(X(v), box.y); ctx.lineTo(X(v), box.y + box.h * sweep); ctx.stroke();
      ctx.globalAlpha = alpha * sweep;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(label, X(v), box.y + box.h + (x.stagger && i % 2 ? 20 : 6));
      ctx.globalAlpha = alpha;
    }
    for (const [i, [v, label]] of (y.ticks || []).entries()) {
      const sweep = rule(i);
      ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + box.w * sweep, Y(v)); ctx.stroke();
      ctx.globalAlpha = alpha * sweep;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, box.x - 6, Y(v));
      ctx.globalAlpha = alpha;
    }
    ctx.strokeStyle = FAINT;
    const upright = stage(0, .50, progress), baseline = stage(.50, .90, progress);
    ctx.beginPath(); ctx.moveTo(box.x, box.y); ctx.lineTo(box.x, box.y + box.h * upright);
    if (baseline) ctx.lineTo(box.x + box.w * baseline, box.y + box.h);
    ctx.stroke();
    ctx.globalAlpha = alpha * stage(.22, .79, progress);
    ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`;
    if (x.label) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(x.label, box.x + box.w, box.y + box.h + (x.stagger ? 35 : 22)); }
    if (y.label) { ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(y.label, box.x, box.y - 6); }
    ctx.restore();
    return { X, Y };
  }

  function curve(ctx, points, X, Y, color, width = 2, dash = []) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(([a, b], i) => { const x = X(a), y = Y(b); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.restore();
  }

  function hline(ctx, y, x0, x1, color, label, dash = [4, 4]) {
    ctx.save(); ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    if (label) { ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(label, x1, y - 3); }
    ctx.restore();
  }

  function vline(ctx, x, y0, y1, color, label, dash = [4, 4]) {
    ctx.save(); ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    if (label) { ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, x + 5, y0); }
    ctx.restore();
  }

  function dot(ctx, x, y, color, r = 4.5) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  const box = (p, top = 26, bottom = 40, left = 54, right = 18) => ({ x: left, y: top, w: p.w - left - right, h: p.h - top - bottom });

  // ---------- 6. Closer is stronger ----------
  function setupCardDistance(scene) {
    const card = scene.input('distance'), travel = card.parentElement;
    const diagram = travel.parentElement, demo = diagram.parentElement;
    const label = demo.querySelector('.s6-distance-value');
    const min = Number(card.getAttribute('aria-valuemin')), max = Number(card.getAttribute('aria-valuemax'));
    const span = max - min;
    let pointer;

    function setDistance(mm) {
      const value = clamp(Math.round(mm), min, max);
      if (value === scene.distanceMm) return;
      scene.distanceMm = value;
      const text = cm(value / 1000);
      card.setAttribute('aria-valuenow', value);
      card.setAttribute('aria-valuetext', text);
      label.textContent = text;
      demo.style.setProperty('--card-distance', (value - min) / span);
      scene.dirty = true;
    }

    setDistance(Number(card.getAttribute('aria-valuenow')));
    const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10, Home: -span, End: span };
    card.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !Object.hasOwn(steps, event.key)) return;
      event.preventDefault();
      setDistance(scene.distanceMm + steps[event.key]);
    });
    card.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      card.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, x: event.clientX, value: scene.distanceMm };
      card.classList.add('is-grabbed');
    });
    card.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer?.id || !travel.offsetWidth) return;
      setDistance(pointer.value + (event.clientX - pointer.x) * span / travel.offsetWidth);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      card.addEventListener(type, event => {
        if (event.pointerId !== pointer?.id) return;
        pointer = undefined;
        card.classList.remove('is-grabbed');
      });
    }
    diagram.addEventListener('click', event => {
      if (card.contains(event.target)) return;
      const track = travel.getBoundingClientRect();
      if (!track.width) return;
      const x = event.clientX - track.left - card.offsetWidth / 2;
      setDistance(min + x * span / track.width);
    });
  }

  const closer = plate('s6', p => {
    const coil = p.input('radius');
    const d = p.distanceMm / 1000, r = coil.valueAsNumber / 1000;
    const distanceText = cm(d), coilText = (2 * r * 100).toFixed(1) + ' cm across';
    p.out('radius', coilText);
    coil.setAttribute('aria-valuetext', coilText);
    const ctx = fit(p), opts = { tag: 'card', reader: 'phone', radius: r };
    const half = (p.h - 30) / 2;
    const top = { x: 54, y: 24, w: p.w - 72, h: half - 46 }, bottom = { x: 54, y: half + 30, w: p.w - 72, h: half - 46 };
    const xr = { from: 0, to: .08, ticks: [0, .02, .04, .06, .08].map(v => [v, (v * 100) + ' cm']) };
    const field = [], volts = [];
    for (let i = 0; i <= 120; i++) {
      const x = .0015 + i / 120 * .0785, s = physics.solve({ ...opts, distance: x });
      field.push([x, s.field]); volts.push([x, s.rawVolts]);
    }
    const progress = p.reveal ?? 1;
    function trace(points, axes, plot, color, sweep) {
      if (!sweep) return;
      if (sweep === 1) return curve(ctx, points, axes.X, axes.Y, color);
      // Advance in data order without changing the samples used by the live chart.
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, plot.x + plot.w * sweep, p.h); ctx.clip();
      curve(ctx, points, axes.X, axes.Y, color);
      ctx.restore();
    }
    const a = chart(ctx, top, xr, { from: 0, to: 11, ticks: [[0, '0'], [5, '5'], [10, '10']], label: 'Field at the card (A/m)' }, stage(0, .30, progress));
    const fieldLimit = stage(.52, .80, progress);
    if (fieldLimit) hline(ctx, a.Y(physics.H_MIN), top.x, top.x + top.w * fieldLimit, RED, fieldLimit === 1 ? 'The standard’s minimum, 1.5 A/m' : '');
    const fieldTrace = stage(.22, .71, progress);
    trace(field, a, top, INK, fieldTrace);
    const s = physics.solve({ ...opts, distance: d });
    p.el.style.setProperty('--coil-scale', coil.valueAsNumber / Number(coil.max));
    p.el.style.setProperty('--field-strength', clamp(s.field / physics.H_MAX, .16, 1));
    if (fieldTrace >= d / xr.to) dot(ctx, a.X(d), a.Y(s.field), INK);
    const b = chart(ctx, bottom, { ...xr, label: 'Distance from the phone' }, { from: 0, to: 6, ticks: [[0, '0 V'], [2, '2 V'], [4, '4 V'], [6, '6 V']], label: 'Volts the coil can give the chip' }, stage(.12, .42, progress));
    const wakeLimit = stage(.62, .94, progress);
    if (wakeLimit) hline(ctx, b.Y(s.wake), bottom.x, bottom.x + bottom.w * wakeLimit, COPPER, wakeLimit === 1 ? 'Wake-up, ' + s.wake + ' V' : '');
    const cappedVolts = volts.map(([x, v]) => [x, Math.min(v, 6)]);
    const voltsTrace = stage(.36, .88, progress);
    trace(cappedVolts, b, bottom, COPPER, voltsTrace);
    // Share the drawn curves in their own plot coordinates for the Scene 7 handoff.
    p.canvas.handoffPlots = [
      { box: top, points: field.map(([x, y]) => [x / xr.to, 1 - y / 11]) },
      { box: bottom, points: cappedVolts.map(([x, y]) => [x / xr.to, 1 - y / 6]) },
    ];
    if (voltsTrace >= d / xr.to) dot(ctx, b.X(d), b.Y(Math.min(s.rawVolts, 6)), s.awake ? GREEN : RED);
    const range = physics.range(opts);
    const rangeLine = stage(.76, 1, progress);
    if (rangeLine) vline(ctx, b.X(range), top.y, top.y + (bottom.y + bottom.h - top.y) * rangeLine, MUTED, rangeLine === 1 ? 'Range ' + cm(range) : '');
    p.say(`At ${distanceText}: a field of ${s.field.toFixed(2)} A/m, enough for ${s.rawVolts.toFixed(1)} V at the chip. ${s.awake ? 'Awake.' : 'Asleep.'} This coil reaches ${cm(range)}.`);
  });
  if (closer) {
    setupCardDistance(closer);
    closer.canvas.setReveal = progress => {
      if (closer.reveal === progress) return;
      closer.reveal = progress;
      closer.dirty = true;
    };
  }

  // ---------- 7. It has to keep flipping ----------
  plate('s7', p => {
    const speed = p.input('speed'), v = speed.valueAsNumber;
    const f = v === 0 ? 0 : 10 * (13.56e6 / 10) ** (v / 100);
    const speedText = f === 0 ? 'not at all (a still magnet)' : si(f, 'Hz', 3) + (v === 100 ? ' (real)' : '');
    if (speed.getAttribute('aria-valuetext') !== speedText) {
      p.out('speed', speedText);
      speed.setAttribute('aria-valuetext', speedText);
    }
    const s = f > 0 ? physics.solve({ tag: 'card', reader: 'phone', distance: .02, frequency: f }) : { emf: 0 };
    const ctx = fit(p);
    // The waves are slowed for the eye: their speed on screen follows the log of the real speed.
    const shown = f === 0 ? 0 : .25 + Math.log10(f) / Math.log10(13.56e6) * 1.6;
    if (!reduced.matches) p.phase = (p.phase || 0) + shown * p.dt * Math.PI * 2;
    const ph = p.phase || 0;
    const B = { x: 54, y: 30, w: p.w - 72, h: (p.h - 90) / 2 }, V = { x: 54, y: B.y + B.h + 40, w: p.w - 72, h: B.h };
    const emfMax = physics.solve({ tag: 'card', reader: 'phone', distance: .02 }).emf;
    const vAmp = f === 0 ? 0 : clamp(Math.log10(1 + s.emf / emfMax * 1e4) / 4, 0, 1);
    const { drawHandoff, drawOutgoingHandoff } = p.canvas;
    const entrance = p.canvas.flippingEntrance;
    const traceAlpha = entrance?.traces ?? 1, guides = entrance?.guides ?? 1;
    const handoffPlots = drawHandoff || drawOutgoingHandoff ? [] : null;
    if (guides) {
      const divider = (B.y + B.h + V.y) / 2;
      hline(ctx, divider, B.x, B.x + B.w * guides, GRID, '', []);
    }
    for (const [bx, label, fn, color] of [
      [B, 'The field through the coil', t => f === 0 ? .7 : Math.sin(t), INK],
      [V, 'The voltage it makes', t => f === 0 ? 0 : vAmp * Math.cos(t), COPPER]]) {
      const yAt = u => .5 - fn(ph - u * Math.PI * 4) * .45;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(bx.x, bx.y + bx.h / 2); ctx.lineTo(bx.x + bx.w * guides, bx.y + bx.h / 2); ctx.stroke();
      ctx.globalAlpha = entrance?.labels ?? 1;
      ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(label, bx.x, bx.y - 6);
      ctx.globalAlpha = traceAlpha;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200, x = bx.x + u * bx.w, y = bx.y + yAt(u) * bx.h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      handoffPlots?.push({ box: bx, yAt, color });
    }
    ctx.globalAlpha = 1;
    drawHandoff?.(handoffPlots);
    drawOutgoingHandoff?.(handoffPlots);
    ctx.globalAlpha = guides;
    ctx.fillStyle = MUTED; ctx.font = `500 11px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('Slowed down. Voltage height uses a log scale.', p.w - 18, p.h - 18);
    ctx.globalAlpha = 1;
    p.say(f === 0 ? 'A still magnet: the field is there, but nothing changes, so the coil makes 0 V.'
      : `Flipping ${si(f, 'Hz', 3)}: the coil makes ${si(s.emf, 'V', 2)}. ${s.emf >= 3 ? 'Plenty for the chip.' : 'The chip needs about 2 V.'}`);
  }, { animate: true });

  // ---------- 8. The tuning trick ----------
  function blendTuningPlot(from, to, t) {
    const mix = (a, b) => a + (b - a) * t;
    const frequency = from.frequency === to.frequency ? to.frequency : Math.exp(mix(Math.log(from.frequency), Math.log(to.frequency)));
    const top = mix(from.top, to.top);
    const volts = (a, b) => mix(a / from.top, b / to.top) * top;
    const blendSamples = (old, next) => next.map(([f, v], i) => [
      f * frequency / to.frequency, volts(old[i][1], v),
    ]);
    return {
      frequency, top, points: blendSamples(from.points, to.points), tuned: blendSamples(from.tuned, to.tuned),
      wake: volts(from.wake, to.wake), marker: volts(from.marker, to.marker), awake: mix(from.awake, to.awake),
    };
  }

  const tuningScene = plate('s8', p => {
    const which = p.radio('tag') || 'card', T = physics.TAGS[which];
    const cap = p.input('cap'), removed = p.input('cap-toggle').hasAttribute('data-removed');
    const setting = cap.valueAsNumber / Number(cap.max);
    const C = removed ? 0 : T.capacitance * (setting * 2);
    const fmt = v => si(v, 'Hz', 3);
    const now = performance.now();
    const target = p.tuningTarget;

    if (!target || target.which !== which || target.removed !== removed || target.C !== C) {
      const capText = removed ? 'taken out' : si(C, 'F', 3);
      cap.disabled = removed;
      cap.setAttribute('aria-valuetext', capText);
      p.out('cap', capText);
      p.el.style.setProperty('--s8-cap-size', .62 + setting * .48);
      const opts = { tag: which, reader: which === 'key' ? 'key' : 'pad', distance: which === 'key' ? .025 : .03, capacitance: C };
      const frequency = T.frequency;
      const points = physics.sweep(opts, frequency / 4, frequency * 4, 220);
      const tuned = physics.sweep({ ...opts, capacitance: T.capacitance }, frequency / 4, frequency * 4, 220);
      const top = Math.max(...tuned.map(([, v]) => v)) * 1.12;
      const s = physics.solve(opts);
      const r = physics.range(opts), r0 = physics.range({ ...opts, capacitance: T.capacitance });
      const tuning = removed ? 'Without its capacitor' : C === 0 ? 'At 0 F' : 'Tuned to ' + fmt(s.resonance);
      p.say(`${tuning}, the ${which === 'key' ? 'key' : 'card'} works up to ${cm(r)} away${Math.abs(r - r0) < .0005 ? '.' : ` (${cm(r0)} when tuned right).`}`);

      // Retarget from the frame on screen so fast toggles never jump back to an older curve.
      const animate = target && (target.which !== which || target.removed !== removed || p.tuningFrom);
      p.tuningFrom = animate ? p.tuningShown : null;
      p.tuningStarted = now;
      p.tuningTarget = { which, removed, C, frequency, top, points, tuned, wake: s.wake, marker: Math.min(s.rawVolts, top), awake: Number(s.awake) };
    }

    const t = p.tuningFrom && !reduced.matches ? stage(0, 360, now - p.tuningStarted) : 1;
    if (t < 1) {
      p.tuningShown = t === 0 ? p.tuningFrom : blendTuningPlot(p.tuningFrom, p.tuningTarget, t * t * (3 - 2 * t));
      p.dirty = true;
    } else {
      p.tuningFrom = null;
      p.tuningShown = p.tuningTarget;
    }

    const { frequency: f0, top, points, tuned, wake, marker, awake } = p.tuningShown;
    const ctx = fit(p), bx = box(p, 26, 44, 54, 28);
    const a = chart(ctx, bx, { from: f0 / 4, to: f0 * 4, log: true, ticks: [f0 / 4, f0 / 2, f0, f0 * 2, f0 * 4].map(v => [v, fmt(v)]), label: 'If the reader’s field flipped at…' },
      { from: 0, to: top, ticks: [0, top / 2, top].map(v => [v, v.toFixed(1) + ' V']), label: 'Volts at the chip' });
    curve(ctx, tuned, a.X, a.Y, FAINT, 1.5, [5, 5]);
    curve(ctx, points, a.X, a.Y, COPPER, 2.2);
    p.canvas.resonanceCurve = { box: bx, points, X: a.X, Y: a.Y, color: COPPER };
    vline(ctx, a.X(f0), bx.y, bx.y + bx.h, INK, 'The reader: ' + fmt(f0));
    hline(ctx, a.Y(wake), bx.x, bx.x + bx.w, GREEN, 'Wake-up');
    const markerColor = awake === 1 ? GREEN : awake === 0 ? RED : `color-mix(in srgb, ${GREEN} ${awake * 100}%, ${RED})`;
    dot(ctx, a.X(f0), a.Y(marker), markerColor);
  });
  if (tuningScene) {
    const button = tuningScene.input('cap-toggle');
    const action = button.querySelector('.s8-cap-action');
    button.addEventListener('click', () => {
      const removed = button.toggleAttribute('data-removed');
      action.textContent = removed ? 'Reinsert' : 'Remove';
      button.setAttribute('aria-label', removed ? 'Reinsert the capacitor' : 'Remove the capacitor');
      tuningScene.dirty = true;
    });
    reduced.addEventListener('change', () => { tuningScene.dirty = true; });
  }

  // ---------- 9. Why metal fights back ----------
  function traceField(coils, seeds, ceiling) {
    const field = (rho, z) => {
      let hr = 0, hz = 0;
      for (const [a, current, z0] of coils) { const [r1, z1] = physics.loopField(a, current, z0, rho, z); hr += r1; hz += z1; }
      return [hr, hz];
    };
    return seeds.map(start => {
      const pts = [start];
      let [rho, z] = start, crossed = 0;
      for (let n = 0; n < 700; n++) {
        const [hr, hz] = field(rho, z), m = Math.hypot(hr, hz) || 1, st = .0014;
        const [hr2, hz2] = field(rho + hr / m * st / 2, z + hz / m * st / 2), m2 = Math.hypot(hr2, hz2) || 1;
        const nr = rho + hr2 / m2 * st, nz = z + hz2 / m2 * st;
        if (nz >= ceiling) {
          const fraction = (ceiling - z) / (nz - z);
          pts.push([rho + (nr - rho) * fraction, ceiling]);
          break;
        }
        if (z > 0 && nz <= 0 || z < 0 && nz >= 0) crossed++;
        rho = nr; z = nz;
        pts.push([rho, z]);
        if (crossed >= 2 || Math.abs(rho) >= .09 || z <= -.03) break;
      }
      return pts;
    });
  }
  function setupMetal(figure) {
    const metal = document.getElementById('s9-metal'), action = document.getElementById('s9-metal-action');
    const distance = document.getElementById('s9-distance'), chip = document.getElementById('s9-chip');
    const strength = document.getElementById('s9-strength'), tuning = document.getElementById('s9-tuning');
    const park = Number(metal.getAttribute('aria-valuemax')), restY = 68, d = .02, a = physics.READERS.pad.radius;
    const card = physics.TAGS.card.radius;
    let gapMm = park, value = park, model, scale, coilY, metalY = restY, pointer = null, grabOffset, travel;
    const heightAt = mm => coilY - (d + mm / 1000) * scale;

    function positionMetal(y = gapMm === park ? restY : heightAt(gapMm)) {
      metalY = y;
      metal.style.setProperty('--s9-metal-y', `${y}px`);
    }

    function setGap(mm) {
      gapMm = mm;
      scene.dirty = true;
      const displayed = Math.round(mm);
      if (displayed === value) return;
      value = displayed;
      const label = value === park ? 'No metal' : `Metal ${value} mm behind the card`;
      metal.setAttribute('aria-valuenow', value);
      metal.setAttribute('aria-valuetext', label);
      distance.textContent = label;
      action.textContent = value === park ? 'Bring metal closer' : 'Move metal away';
      figure.classList.toggle('has-metal', value !== park);
    }

    function followPlate(y) {
      const mm = y <= restY + .5 ? park : clamp(((coilY - y) / scale - d) * 1000, 1, park - 1);
      setGap(mm);
      positionMetal(y);
    }

    function stopTravel() {
      travel = null;
      figure.classList.remove('is-moving');
    }

    const scene = plate('s9', p => {
      const ctx = fit(p), k = Math.min(p.w / .2, p.h / .15);
      coilY = p.h - 34;
      // Put the farthest active gap at the parking edge so the field reacts when the plate moves.
      scale = (coilY - restY) / (d + (park - 1) / 1000);
      if (travel) {
        const progress = reduced.matches ? 1 : stage(0, 600, performance.now() - travel.started);
        const end = travel.to === park ? restY : heightAt(travel.to);
        if (progress === 1) {
          setGap(travel.to);
          stopTravel();
        } else {
          const t = progress * progress * (3 - 2 * progress);
          followPlate(travel.from + (end - travel.from) * t);
        }
      }
      if (model?.gapMm !== gapMm) {
        const gap = gapMm === park ? null : gapMm / 1000;
        const coils = [[a, 1, 0]];
        if (gap !== null) coils.push([a, -1, 2 * (d + gap)]);
        const ceiling = gap === null ? .1 : Math.min(.1, d + gap);
        const paths = traceField(coils, [.3, .5, .68, .82, .93].map(f => [f * a, 0]), ceiling);
        const lines = paths.map(points => {
          const through = points.some(([rho, z], i) => i > 0 && (points[i - 1][1] - d) * (z - d) <= 0 && Math.abs(rho) < card);
          return { points, color: through ? COPPER : FAINT };
        });
        model = { gapMm, lines };
        const s = physics.solve({ tag: 'card', reader: 'pad', distance: d, metal: gap });
        strength.textContent = `${s.field.toFixed(2)} A/m`;
        tuning.textContent = si(s.resonance, 'Hz', 4);
        const state = s.awake ? 'Chip awake' : 'Chip asleep';
        if (chip.textContent !== state) chip.textContent = state;
        chip.dataset.awake = s.awake;
      }

      const X = rho => p.w / 2 + rho * k, Y = z => coilY - z * scale;
      const { lines } = model;
      p.canvas.metalField = { lines, X, Y };
      ctx.save();
      if (value !== park) {
        // Hide any integration step that would draw a line through the conductive sheet.
        const edge = pointer !== null || travel ? metalY : heightAt(gapMm);
        ctx.beginPath();
        ctx.rect(0, edge - 2, p.w, p.h);
        ctx.clip();
      }
      for (const { points, color } of lines) {
        for (const side of [-1, 1]) curve(ctx, points, rho => X(side * rho), Y, color, 1.4);
      }
      ctx.restore();
      for (const side of [-1, 1]) dot(ctx, X(side * a), Y(0), INK, 4);
      ctx.fillStyle = 'rgba(184, 101, 42, .25)'; ctx.fillRect(X(-card), Y(d) - 3, X(card) - X(-card), 6);
      ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Card', X(card) + 6, Y(d) + 6);
      ctx.fillText('Reader’s coil', X(a) + 8, Y(0) + 4);
      metal.style.setProperty('--s9-metal-width', `${.16 * k}px`);
      if (pointer === null && !travel) positionMetal();
    });

    action.addEventListener('click', () => {
      const to = (travel?.to ?? value) === park ? 1 : park;
      if (reduced.matches || !scale) {
        stopTravel();
        setGap(to);
      } else {
        travel = { from: metalY, to, started: performance.now() };
        figure.classList.add('is-moving');
        scene.dirty = true;
      }
    });
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10, Home: 1 - park, End: park - 1 };
    metal.addEventListener('keydown', event => {
      if (!Object.hasOwn(steps, event.key)) return;
      event.preventDefault();
      stopTravel();
      setGap(clamp(value + steps[event.key], 1, park));
    });
    metal.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || !scale) return;
      stopTravel();
      metal.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      grabOffset = event.clientY - figure.getBoundingClientRect().top - metalY;
      figure.classList.add('is-dragging');
    });
    metal.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const y = clamp(event.clientY - figure.getBoundingClientRect().top - grabOffset, restY, heightAt(1));
      followPlate(y);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      metal.addEventListener(type, event => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        figure.classList.remove('is-dragging');
        positionMetal();
      });
    }
  }
  const metalFigure = document.getElementById('s9-field');
  if (metalFigure) setupMetal(metalFigure);

  // ---------- 10. Getting through the pauses ----------
  const pauseHandoff = { sweep: 1, dip: 1, limit: 1 };
  const pauseScene = plate('s10', p => {
    const cap = p.input('cap'), v = cap.valueAsNumber, Cs = v / 20 * 1e-9;
    const capText = v === 0 ? 'taken out' : si(Cs, 'F', 2);
    p.out('cap', capText);
    cap.setAttribute('aria-valuetext', capText);
    const bits = iso.shortFrame(iso.REQA), { pauses, length } = iso.millerPauses(bits);
    const lead = 24, n = lead + length + 24, at = pauses.map(q => q + lead);
    const field = air.fieldAtTag(n, at, iso.PAUSE);
    // The chip's supply: charged by the field, drained by the chip (200 µA) during a pause.
    const C = Cs + 20e-12, I = 200e-6, dt = 1 / iso.SAMPLE_RATE, VMAX = 3, RESET = 1.8;
    const V = new Float32Array(n);
    let volts = VMAX, reset = -1;
    for (let i = 0; i < n; i++) {
      if (field[i] > .5) volts += (VMAX - volts) * .5; else volts = Math.max(0, volts - I * dt / C);
      if (volts < RESET && reset < 0) reset = i;
      V[i] = volts;
    }
    const lowest = Math.min(...V);
    p.say(reset >= 0 ? `The chip resets in the first pause and forgets what it heard. It can’t answer.`
      : `The chip rides through all ${pauses.length} pauses, dipping to ${lowest.toFixed(2)} V, and hears “Anyone there?”.`);

    const ctx = fit(p), F = { x: 54, y: 28, w: p.w - 72, h: (p.h - 100) * .4 }, Q = { x: 54, y: F.y + F.h + 44, w: p.w - 72, h: (p.h - 100) * .6 };
    const X = i => F.x + i / n * F.w;
    const { sweep, dip, limit } = pauseHandoff;
    if (!sweep) return;
    function trace(samples, flat, Y, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      if (sweep < 1) {
        ctx.moveTo(X(0), Y(flat));
        ctx.lineTo(X((n - 1) * sweep), Y(flat));
      } else {
        for (let i = 0; i < n; i++) {
          const y = Y(dip === 1 ? samples[i] : flat + (samples[i] - flat) * dip);
          if (i === 0) ctx.moveTo(X(i), y);
          else ctx.lineTo(X(i), y);
        }
      }
      ctx.stroke();
    }

    ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('The phone’s field: “Anyone there?” as pauses', F.x, F.y - 6);
    trace(field, 1, field => F.y + F.h - field * F.h, INK, 1.6);
    ctx.fillText('The chip’s stored volts', Q.x, Q.y - 6);
    const Y = v2 => Q.y + Q.h - v2 / 3.4 * Q.h;
    trace(V, VMAX, Y, reset >= 0 ? RED : COPPER, 2);
    ctx.fillStyle = MUTED; ctx.font = `500 11px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('About 70 µs in all', p.w - 18, p.h - 18);
    if (limit) hline(ctx, Y(RESET), Q.x, Q.x + Q.w * limit, RED, limit === 1 ? 'Below this, the chip resets' : '');
  });
  if (pauseScene) pauseScene.canvas.setPauseHandoff = (sweep, dip, limit) => {
    if (sweep === pauseHandoff.sweep && dip === pauseHandoff.dip && limit === pauseHandoff.limit) return;
    Object.assign(pauseHandoff, { sweep, dip, limit });
    pauseScene.dirty = true;
  };

  // ---------- 11. Soaking up more, then less ----------
  const answerMotion = { axes: 1, reveal: 1, blend: undefined, from: 0, to: 0, sweep: 1 };
  const uidPrefixes = [0, 4, 8, 12, 16, 20, 24];
  const captureNames = ['Presence reply',
    ...uidPrefixes.map(known => known ? `ID after ${known} known bits` : 'Start of card ID'), 'Selection confirmed'];
  const captureLabel = document.getElementById('s11-capture-name');
  let answerRecording;
  function answerSamples(depth) {
    const chip = tags.cardChip(), link = channel.cardChannel([{ chip, depth, awake: true }], { noise: .001, seed: 3 });
    const uid = iso.dataBits(chip.uid);
    link.send(iso.shortFrame(iso.REQA));
    for (const known of uidPrefixes) link.send(iso.anticollisionBits(uid.slice(0, known)));
    const selection = iso.withCrc([iso.SEL1, iso.NVB_SELECT, ...chip.uid, iso.bcc(chip.uid)]);
    link.send(iso.standardFrame(selection));
    return link.recording.map(({ begin, samples }) => samples.subarray(begin - iso.HALF, begin + 10 * iso.BIT));
  }
  const answerScene = plate('s11', p => {
    if (!answerRecording) {
      const { dip } = physics.solve({ tag: 'card', reader: 'pad', distance: .04 });
      answerRecording = { dip, off: answerSamples(0), on: answerSamples(dip) };
    }
    const { dip, off, on } = answerRecording;
    const checked = p.input('switch').checked, slider = p.input('zoom'), zoom = slider.valueAsNumber;
    const z = 1 + zoom / 100 * 29; // 1× (true size) to 30×
    const zoomText = z < 1.05 ? 'true size' : '×' + z.toFixed(0);
    if (slider.getAttribute('aria-valuetext') !== zoomText) {
      p.out('zoom', zoomText);
      slider.setAttribute('aria-valuetext', zoomText);
    }
    p.say(checked ? `Each time the chip closes its switch, the reader’s current changes by ${(dip * 100).toFixed(1)}%. Those are the dips.`
      : 'Switch removed: the reader’s current never changes. It hears nothing at all.');

    const ctx = fit(p), compact = p.w < 330, bx = box(p, 26, 40, compact ? 38 : 54, compact ? 14 : 18);
    const { axes, reveal, blend = Number(checked), from, to, sweep } = answerMotion;
    if (axes < 1) {
      const base = bx.y + bx.h;
      ctx.strokeStyle = FAINT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx.x, base - bx.h * axes); ctx.lineTo(bx.x, base);
      ctx.lineTo(bx.x + bx.w * axes, base); ctx.stroke();
      return;
    }
    const lo = 1 - 1 / z, hi = 1 + .08 / z;
    const finalSample = on[to].length - 1;
    const duration = Math.round(finalSample / iso.SAMPLE_RATE * 1e6);
    const { X, Y } = chart(ctx, bx, { from: 0, to: finalSample, ticks: [[0, '0']], label: `Time · ${duration} µs shown` },
      { from: lo, to: hi, ticks: [[1, '100%'], [lo, Math.round(lo * 100) + '%']], label: 'The reader’s coil current' });
    const edge = sweep * finalSample;
    // Finish the blend at the right edge before the next pass starts.
    const feather = Math.min(7, finalSample - edge);
    const currentAt = (i, take) => off[take][i] + (on[take][i] - off[take][i]) * blend;
    function sampleAt(i) {
      if (from === to || sweep === 1 || i <= edge - feather) return currentAt(i, to);
      const before = currentAt(i, from);
      if (i >= edge) return before;
      return before + (currentAt(i, to) - before) * (edge - i) / feather;
    }
    const previous = p.canvas.answerTrace;
    const points = previous?.zoom === zoom && previous.blend === blend && previous.from === from &&
      previous.to === to && previous.sweep === sweep ? previous.points
      : Array.from(on[to], (_, i) => [i, clamp(sampleAt(i), lo, hi)]);
    const color = blend === 1 ? COPPER : blend === 0 ? INK : `color-mix(in srgb, ${COPPER} ${blend * 100}%, ${INK})`;
    const capture = captureNames[sweep === 1 ? to : from];
    if (captureLabel.textContent !== capture) captureLabel.textContent = capture;
    // The sweep and the next scene both follow the same coordinates as the drawn trace.
    p.canvas.answerTrace = { box: bx, points, X, Y, color, zoom, blend, from, to, sweep };
    if (!reveal) return;
    ctx.save();
    if (reveal < 1) {
      ctx.beginPath(); ctx.rect(bx.x - 1, bx.y - 1, bx.w * reveal + 1, bx.h + 2); ctx.clip();
    }
    curve(ctx, points, X, Y, color, 1.2);
    ctx.restore();
  });
  if (answerScene) {
    answerScene.canvas.answerCaptureCount = captureNames.length;
    answerScene.canvas.setAnswerMotion = (axes, reveal, blend, from, to, sweep) => {
      if (axes === answerMotion.axes && reveal === answerMotion.reveal && blend === answerMotion.blend &&
        from === answerMotion.from && to === answerMotion.to && sweep === answerMotion.sweep) return;
      Object.assign(answerMotion, { axes, reveal, blend, from, to, sweep });
      answerScene.dirty = true;
    };
  }

  // ---------- 12. Whispering next to a shout ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const spectrumMotion = { blend: undefined };
  let spectrumRecording;
  function computeSpectrum(flicker) {
    const N = 8192, s = physics.solve({ tag: 'card', reader: 'pad', distance: .04 });
    // The card repeats an answer; with the flicker off, its switch stays closed for the whole
    // active half of each bit instead of flickering.
    const rand = tags.random(77), bits = Array.from({ length: N / iso.BIT }, () => rand() < .5 ? 1 : 0);
    let pattern = iso.manchesterSwitch(bits);
    if (!flicker) {
      pattern = new Uint8Array(pattern.length);
      [1, ...bits].forEach((b, i) => pattern.fill(1, i * iso.BIT + (b ? 0 : iso.HALF), i * iso.BIT + (b ? iso.HALF : iso.BIT)));
    }
    const samples = air.render({ length: N, loads: [{ at: 0, pattern, depth: s.dip }], noise: .0004, seed: 5 });
    // The reader's own field is never perfectly steady: slow wander close to its frequency.
    const g = air.gaussian(tags.random(9));
    let wander = 0;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      wander = wander * .995 + g() * .0009;
      const hann = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
      re[i] = (samples[i] + wander) * hann;
    }
    fft(re, im);
    const fs = iso.SAMPLE_RATE, freqs = [], raw = [];
    for (let k = -N / 2 + 1; k < N / 2; k++) {
      const j = (k + N) % N, f = k * fs / N;
      if (Math.abs(f) > 1.5e6) continue;
      freqs.push(iso.CARRIER + f);
      raw.push(20 * Math.log10(Math.hypot(re[j], im[j]) / N + 1e-12));
    }
    const peak = Math.max(...raw);
    return { freqs, values: raw.map(v => v - peak) };
  }
  const spectrumScene = plate('s12', p => {
    spectrumRecording ??= { on: computeSpectrum(true), off: computeSpectrum(false) };
    const flicker = p.input('flicker').checked;
    const blend = spectrumMotion.blend ?? Number(flicker);
    const ctx = fit(p), stagger = p.w < 340, bx = box(p, 26, stagger ? 54 : 44, 42, 32);
    const top = 0, floor = -110;
    const a = chart(ctx, bx, { from: iso.CARRIER - 1.5e6, to: iso.CARRIER + 1.5e6, ticks: [-1.5e6, -.8475e6, 0, .8475e6, 1.5e6].map(o => [iso.CARRIER + o, si(iso.CARRIER + o, 'Hz', 4)]), label: 'Pitch', stagger },
      { from: floor, to: top + 6, ticks: [[top, '0 dB'], [top - 50, '−50'], [top - 100, '−100']], label: 'Strength (decibels)' });
    const { freqs, values: onValues } = spectrumRecording.on, { values: offValues } = spectrumRecording.off;
    const points = freqs.map((f, i) => [f, Math.max(offValues[i] + (onValues[i] - offValues[i]) * blend, floor)]);
    // Keep the plotted bins and their canvas coordinates available for the next scene.
    p.canvas.spectrumTrace = { box: bx, points, ...a, color: INK, carrier: points[(points.length - 1) / 2], flicker, blend };
    ctx.save(); ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h); ctx.clip();
    curve(ctx, points, a.X, a.Y, INK, 1);
    ctx.restore();
    ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('The phone’s own field', a.X(iso.CARRIER), bx.y + 12);
    if (blend > .05) {
      ctx.globalAlpha = Math.min(1, Math.max(0, (blend - .2) / .8));
      for (const o of [-1, 1]) { ctx.fillStyle = COPPER; ctx.fillText('The card', a.X(iso.CARRIER + o * 847.5e3), a.Y(top - 38)); }
    }
    if (blend < .95) {
      ctx.globalAlpha = Math.min(1, Math.max(0, (.8 - blend) / .8));
      ctx.fillStyle = COPPER; ctx.fillText('The card, buried here', a.X(iso.CARRIER + 2.2e5), a.Y(top - 30));
    }
    ctx.globalAlpha = 1;
    p.say(flicker ? 'With the flicker, the card’s answer sits 847.5 kHz either side of the phone’s field, well clear of its noise.'
      : 'Without the flicker, the card’s answer sits right beside the phone’s huge field, inside the noise around it.');
  });
  if (spectrumScene) {
    spectrumScene.canvas.setSpectrumMotion = blend => {
      if (blend === spectrumMotion.blend) return;
      spectrumMotion.blend = blend;
      spectrumScene.dirty = true;
    };
  }

  // ---------- 13. Keeping count ----------
  let clockDrift = 7;
  const countingMotion = { codeBlend: undefined };
  function decodeBits(sent, code, drift, H) {
    const level = [];
    for (const b of sent) {
      if (code === 'simple') for (let k = 0; k < 2 * H; k++) level.push(b ? 1 : 0);
      else for (let k = 0; k < 2 * H; k++) level.push((k < H) === !!b ? 1 : 0);
    }
    // The reader: its own clock, resynchronised at every change it sees.
    const T = 2 * H / (1 + drift), read = [], ticks = [];
    if (code === 'simple') {
      let next = T / 2;
      for (let i = 1; i < level.length; i++) {
        if (level[i] !== level[i - 1]) next = i + T / 2;
        if (i >= next) { read.push(level[i]); ticks.push(i); next += T; }
      }
    } else {
      // Manchester: every bit has a change in its middle; the reader finds it and reads the
      // first half.
      let i = 0;
      while (i < level.length) {
        let mid = -1;
        for (let k = Math.round(i + .5 * T); k < Math.min(level.length, i + 1.5 * T); k++) if (level[k] !== level[k - 1]) { mid = k; break; }
        if (mid < 0) break;
        read.push(level[mid - Math.round(H / 2)]); ticks.push(mid - Math.round(H / 2));
        i = mid + H;
      }
    }
    return { level, read, ticks };
  }
  const counting = plate('s13', p => {
    const letter = (p.input('letter').value || 'A').slice(0, 1), code = p.radio('code') || 'manchester';
    const drift = clockDrift / 100;
    const byte = letter.charCodeAt(0) & 0xff, sent = [...Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1), 0, 0, 0, 0, 0, 0, 0, 0];
    const H = 40;   // samples per half bit
    const simple = decodeBits(sent, 'simple', drift, H), manchester = decodeBits(sent, 'manchester', drift, H);
    const active = code === 'manchester' ? manchester : simple;
    const blend = countingMotion.codeBlend ?? (code === 'manchester' ? 1 : 0);
    const right = active.read.length === sent.length && active.read.every((b, i) => b === sent[i]);
    const ctx = fit(p), bx = { x: 24, y: 46, w: p.w - 48, h: p.h - 120 };
    const X = i => bx.x + i / active.level.length * bx.w, Y = v => bx.y + bx.h - v * bx.h * .8;
    p.canvas.timingTrace = { box: bx, X, Y, sent, level: active.level, read: active.read, ticks: active.ticks, samplesPerBit: 2 * H, color: INK, codeBlend: blend };
    ctx.font = `600 14px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    sent.forEach((b, i) => { ctx.fillStyle = i < 8 ? INK : MUTED; ctx.fillText(String(b), X((i + .5) * 2 * H), bx.y - 8); });
    ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.fillText(`“${letter}” then eight zeros`, bx.x, bx.y - 28);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < simple.level.length; i++) {
      const y = Y(simple.level[i] + (manchester.level[i] - simple.level[i]) * blend);
      i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y);
    }
    ctx.stroke();
    function drawTick(xPos, bit, ok, alpha) {
      if (alpha <= .01) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ok ? GREEN : RED; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xPos, bx.y + bx.h + 6); ctx.lineTo(xPos, bx.y + bx.h + 18); ctx.stroke();
      ctx.fillStyle = ok ? GREEN : RED; ctx.font = `600 12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(bit), xPos, bx.y + bx.h + 22);
    }
    const shared = Math.min(simple.ticks.length, manchester.ticks.length);
    for (let i = 0; i < shared; i++) {
      const xPos = X(simple.ticks[i] + (manchester.ticks[i] - simple.ticks[i]) * blend);
      const okSimple = simple.read[i] === sent[i], okManch = manchester.read[i] === sent[i];
      if (simple.read[i] === manchester.read[i] && okSimple === okManch) drawTick(xPos, simple.read[i], okSimple, 1);
      else {
        drawTick(xPos, simple.read[i], okSimple, 1 - blend);
        drawTick(xPos, manchester.read[i], okManch, blend);
      }
    }
    for (let i = shared; i < simple.ticks.length; i++) drawTick(X(simple.ticks[i]), simple.read[i], simple.read[i] === sent[i], 1 - blend);
    for (let i = shared; i < manchester.ticks.length; i++) drawTick(X(manchester.ticks[i]), manchester.read[i], manchester.read[i] === sent[i], blend);
    ctx.globalAlpha = 1;
    p.say(right ? `The reader counted all ${sent.length} bits right.`
      : `The reader counted ${active.read.length} bits instead of ${sent.length}: ${active.read.filter(b => b === 0).length} zeros where there were ${sent.filter(b => b === 0).length}.`);
  });
  if (counting) {
    counting.canvas.setCountingMotion = codeBlend => {
      if (codeBlend === countingMotion.codeBlend) return;
      countingMotion.codeBlend = codeBlend;
      counting.dirty = true;
    };
  }
  const driftControl = counting?.el.querySelector('.s13-drift-control');
  if (driftControl) {
    const driftInput = counting.input('drift-input'), exactBtn = counting.input('exact');
    const driftOut = counting.el.querySelector('#s13-drift');
    const driftNum = driftOut?.querySelector('.s13-drift-num'), driftWord = driftOut?.querySelector('.s13-drift-word');
    const limit = 12;
    function showDrift() {
      const numText = clockDrift > 0 ? `+${clockDrift}%` : clockDrift < 0 ? `−${-clockDrift}%` : '0%';
      const wordText = clockDrift > 0 ? 'fast' : clockDrift < 0 ? 'slow' : 'exact';
      const label = `${numText} ${wordText}`;
      const exact = clockDrift === 0;
      const ratio = Math.abs(clockDrift) / limit * 50;
      if (driftNum && driftWord) {
        if (driftNum.textContent !== numText) driftNum.textContent = numText;
        if (driftWord.textContent !== wordText) driftWord.textContent = wordText;
      } else counting.out('drift', label);
      driftInput.value = String(clockDrift);
      driftInput.setAttribute('aria-valuetext', label);
      driftOut?.toggleAttribute('data-exact', exact);
      driftControl.toggleAttribute('data-exact', exact);
      driftControl.style.setProperty('--s13-fill-start', clockDrift < 0 ? `${50 - ratio}%` : '50%');
      driftControl.style.setProperty('--s13-fill-size', `${ratio}%`);
      exactBtn.setAttribute('aria-disabled', String(exact));
    }
    showDrift();
    driftInput.addEventListener('input', () => {
      clockDrift = clamp(Math.round(driftInput.valueAsNumber || 0), -limit, limit);
      showDrift();
    });
    driftInput.addEventListener('dblclick', () => {
      if (clockDrift === 0) return;
      clockDrift = 0;
      showDrift();
      driftInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    exactBtn.addEventListener('click', () => {
      if (clockDrift === 0) return;
      clockDrift = 0;
      showDrift();
      driftInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // ---------- 14. Catching mistakes ----------
  const firstSignalBit = 9, signalBitCount = 9;
  const I_SPUR = [1, 1, -1, -1];
  let s14seed = 1, checkedSignal, baseCapture = null, revealMode = 'none', prevSnapshot = null;
  const jammedCells = new Set();
  let replyAnimations = [];

  function cancelReplyReveal() {
    for (const animation of replyAnimations) animation.cancel();
    replyAnimations = [];
  }

  function getBaseIdReply(seed) {
    if (baseCapture?.seed === seed) return baseCapture.reply;
    const s = physics.solve({ tag: 'card', reader: 'pad', distance: .042 });
    const chip = tags.cardChip({ randomUid: true, seed });
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: s.awake }], { noise: .0015, seed: seed * 31 });
    reader.activate(link, { checks: true });
    const uidExchange = link.recording.find(ex => ex.answers[0]?.name === 'UID');
    const reply = uidExchange ? {
      begin: uidExchange.begin,
      answers: [{ name: 'UID', bits: [...uidExchange.answers[0].bits] }],
      samples: new Float32Array(uidExchange.samples),
    } : null;
    baseCapture = { seed, reply };
    return reply;
  }

  function applyJamming(samples, begin, origBits, seed, dip, cells, jamCount) {
    for (const cell of cells) {
      const bitIndex = firstSignalBit + cell;
      const g = air.gaussian(tags.random((seed * 97 + bitIndex * 17 + 1) * 31));
      const start = begin + (bitIndex + 1) * iso.BIT;
      const quietHalf = origBits[bitIndex] === 1 ? iso.HALF : 0;
      for (let n = 0; n < iso.BIT; n++) {
        const inQuiet = n >= quietHalf && n < quietHalf + iso.HALF;
        const spur = inQuiet ? I_SPUR[n & 3] * dip * .5 : 0;
        samples[start + n] = 1 + (samples[start + n] - 1) * .10 + spur + g() * (.010 + jamCount * .0014);
      }
    }
  }

  function checkSignal(checks) {
    const s = physics.solve({ tag: 'card', reader: 'pad', distance: .042 });
    const chip = tags.cardChip({ randomUid: true, seed: s14seed });
    const jamCount = jammedCells.size;
    const noisePct = jamCount === 0 ? 0 : .2 + (jamCount / signalBitCount) * 1.8;
    const channelNoise = jamCount === 0 ? .0015 : noisePct / 100;
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: s.awake }], { noise: channelNoise, seed: s14seed * 31 });
    let idReply;
    const run = reader.activate({
      send(bits) {
        const heard = link.send(bits), exchange = link.recording.at(-1);
        if (idReply || exchange.answers[0]?.name !== 'UID') return heard;
        idReply = exchange;
        if (jamCount) applyJamming(heard.samples, exchange.begin, exchange.answers[0].bits, s14seed, s.dip, jammedCells, jamCount);
        return heard;
      },
    }, { checks });
    let displayReply = idReply;
    if (!displayReply) {
      const base = getBaseIdReply(s14seed);
      if (base) {
        const samples = new Float32Array(base.samples);
        const bg = air.gaussian(tags.random(s14seed * 53 + jamCount * 13));
        const start = base.begin + (firstSignalBit + 1) * iso.BIT, end = start + signalBitCount * iso.BIT;
        for (let n = start; n < end; n++) samples[n] += bg() * channelNoise;
        if (jamCount) applyJamming(samples, base.begin, base.answers[0].bits, s14seed, s.dip, jammedCells, jamCount);
        displayReply = { begin: base.begin, answers: base.answers, samples };
      }
    }
    return { run, recording: link.recording, idReply, displayReply, uid: chip.uid, noisePct, jamCount };
  }

  function showErrorReplies(replies, { run, recording }) {
    const prompts = { REQA: 'Anyone there?', ANTICOLLISION: 'Tell me your ID.', SELECT: 'OK, I’ll talk to you.' };
    replies.replaceChildren(...run.steps.map((step, i) => {
      const row = document.createElement('li'), label = document.createElement('div');
      row.dataset.exchange = step.label;
      label.className = 's14-prompt';
      label.textContent = prompts[step.label];
      const retry = run.steps[i - 1]?.label === step.label;
      if (step.failed || retry) {
        const note = document.createElement('span');
        note.dataset.tone = step.failed ? 'fail' : 'retry';
        note.textContent = step.failed ? 'Check failed' : 'Phone retry';
        label.append(note);
      }
      const bits = document.createElement('div'), errors = [];
      bits.className = 's14-bits';
      if (!step.answer.found) bits.textContent = 'No answer';
      else {
        const sent = recording[i]?.answers[0]?.bits ?? [], heard = step.answer.bits;
        bits.append(...heard.map((bit, k) => {
          const digit = document.createElement('span');
          digit.className = 's14-bit';
          digit.textContent = bit;
          if (sent.length && bit !== sent[k]) {
            digit.dataset.wrong = '';
            errors.push(k + 1);
          }
          return digit;
        }));
        bits.setAttribute('role', 'img');
        bits.setAttribute('aria-label', `Heard ${heard.join(' ')}.${errors.length ? ` Misread at ${errors.join(', ')}.` : ''}`);
      }
      row.append(label, bits);
      return row;
    }));
  }

  function drawErrorSignal(p, reply) {
    const ctx = fit(p);
    p.canvas.errorTrace = null;
    if (!reply) return;
    const { w, h } = p;
    const start = reply.begin + (firstSignalBit + 1) * iso.BIT, length = signalBitCount * iso.BIT;
    const samples = reply.samples.subarray(start, start + length);
    const bits = reply.answers[0].bits.slice(firstSignalBit, firstSignalBit + signalBitCount);
    const X = n => n / length * w, Y = v => clamp(h * .52 + (1 - v) * h * 5.8, 26, h - 14);
    const points = [];
    // Average one subcarrier cycle at a time so the dips remain legible at this scale.
    for (let n = 0; n < length; n += iso.SUB) {
      let total = 0;
      for (let k = 0; k < iso.SUB; k++) total += samples[n + k];
      const average = total / iso.SUB;
      points.push([n, average], [n + iso.SUB, average]);
    }
    for (let i = 0; i < signalBitCount; i++) {
      if (i) {
        if (i === signalBitCount - 1) vline(ctx, X(i * iso.BIT), 0, h, 'rgba(184, 101, 42, .45)', '', [3, 3]);
        else vline(ctx, X(i * iso.BIT), 0, h, GRID, '', []);
      }
      if (jammedCells.has(i)) {
        ctx.fillStyle = 'rgba(179, 38, 30, .10)';
        ctx.fillRect(X(i * iso.BIT), 0, X(iso.BIT), h);
      }
    }
    ctx.font = `500 12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    bits.forEach((bit, i) => {
      ctx.fillStyle = jammedCells.has(i) ? RED : MUTED;
      ctx.fillText(String(bit), X((i + .5) * iso.BIT), 8);
    });
    ctx.font = `500 9px ${MONO}`; ctx.textBaseline = 'bottom';
    ctx.fillStyle = jammedCells.has(signalBitCount - 1) ? RED : MUTED;
    ctx.fillText('chk', X((signalBitCount - .5) * iso.BIT), h - 4);
    curve(ctx, points, X, Y, COPPER, 1.45);
    for (const cell of jammedCells) {
      const offset = cell * iso.BIT;
      const burst = Array.from({ length: iso.BIT }, (_, n) => [offset + n, samples[offset + n]]);
      curve(ctx, burst, X, Y, RED, 1.55);
    }
    p.canvas.errorTrace = { box: { x: 0, y: 0, w, h }, X, Y, points, bits, jammed: [...jammedCells], color: COPPER };
  }

  function snapshotS14(replies, readout, tone, checks, jamCount) {
    const rows = Array.from(replies.children).map(row => {
      const spans = Array.from(row.querySelectorAll('.s14-bit'));
      const bitsText = spans.length ? spans.map(s => s.textContent).join('') : (row.querySelector('.s14-bits')?.textContent || '');
      const wrongKey = spans.map((s, k) => (s.hasAttribute('data-wrong') ? String(k) : '')).filter(Boolean).join(',');
      return {
        exchange: row.dataset.exchange || '',
        badge: row.querySelector('.s14-prompt span')?.textContent || '',
        bitsText,
        wrongKey,
      };
    });
    return { readout, tone, checks, jamCount, rows };
  }

  function animateRowDrop(row, delay, blurPx = 5.5, offsetPx = 10, duration = 380) {
    if (!row?.animate) return;
    const easing = 'cubic-bezier(.16, 1, .3, 1)';
    replyAnimations.push(row.animate([
      { opacity: 0, transform: `translateY(-${offsetPx}px)`, filter: `blur(${blurPx}px)`, clipPath: 'inset(0 0 100% 0)' },
      { opacity: .82, transform: 'translateY(-1.5px)', filter: `blur(${(blurPx * .32).toFixed(1)}px)`, clipPath: 'inset(0 0 16% 0)', offset: .42 },
      { opacity: 1, transform: 'none', filter: 'blur(0px)', clipPath: 'inset(0 0 0% 0)' },
    ], { duration, delay, easing, fill: 'backwards' }));
  }

  function animateS14Reveal(p, replies, readoutText, tone, checks, jamCount) {
    const next = snapshotS14(replies, readoutText, tone, checks, jamCount);
    const prev = prevSnapshot;
    prevSnapshot = next;
    const mode = revealMode;
    revealMode = 'none';
    if (reduced.matches || document.hidden || mode === 'none') {
      cancelReplyReveal();
      return;
    }

    cancelReplyReveal();
    const easing = 'cubic-bezier(.16, 1, .3, 1)';
    const tapWave = p.el.querySelector('.s14-tap-wave');
    const tapBadge = p.input('tap-status');
    const checksState = p.input('checks-state');
    const disturbance = p.input('disturbance');
    const readout = p.el.querySelector('.plate-readout');
    const rows = Array.from(replies.children);

    if (mode === 'tap') {
      const cardWrap = p.el.querySelector('.s14-card-wrap');
      if (cardWrap?.animate) {
        replyAnimations.push(cardWrap.animate([
          { transform: 'translateX(-8px) rotate(4deg)' },
          { transform: 'translateX(-22px) rotate(-1deg)', offset: .28 },
          { transform: 'translateX(-22px) rotate(-1deg)', offset: .58 },
          { transform: 'translateX(0) rotate(7deg)' },
        ], { duration: 1050, easing: 'cubic-bezier(.22, 1, .36, 1)' }));
      }
      if (tapWave?.animate) {
        replyAnimations.push(tapWave.animate([
          { opacity: .25, transform: 'scale(.76)' },
          { opacity: 1, transform: 'scale(1.28)', offset: .36 },
          { opacity: .38, transform: 'scale(1)' },
        ], { duration: 880, delay: 140, easing }));
      }
      if (tapBadge?.animate) {
        replyAnimations.push(tapBadge.animate([
          { opacity: .15, transform: 'scale(.72)', filter: 'blur(3px)' },
          { opacity: 1, transform: 'scale(1.06)', filter: 'blur(0px)', offset: .62 },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ], { duration: 380, delay: 260, easing, fill: 'backwards' }));
      }
      if (p.canvas.animate) {
        replyAnimations.push(p.canvas.animate([
          { opacity: .28, filter: 'blur(5px)', clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-6px)' },
          { opacity: 1, filter: 'blur(0px)', clipPath: 'inset(0 0 0% 0)', transform: 'none' },
        ], { duration: 420, delay: 240, easing, fill: 'backwards' }));
      }
      rows.forEach((row, i) => animateRowDrop(row, 340 + i * 130, 7, 12, 520));
      if (readout?.animate) {
        replyAnimations.push(readout.animate([
          { opacity: .35, filter: 'blur(4px)', transform: 'translateY(-6px)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'none' },
        ], { duration: 420, delay: 360, easing, fill: 'backwards' }));
      }
      return;
    }

    if (prev && next.checks !== prev.checks && checksState?.animate) {
      const dir = next.checks ? -1 : 1;
      replyAnimations.push(checksState.animate([
        { opacity: 0, transform: `perspective(220px) translateY(${dir * 6}px) rotateX(${-dir * 48}deg)` },
        { opacity: 1, transform: 'none' },
      ], { duration: 240, easing }));
    }

    if (prev && next.readout !== prev.readout && readout?.animate) {
      replyAnimations.push(readout.animate([
        { opacity: 0, transform: 'translateY(-7px)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: 340, easing }));
    }

    if (prev && next.tone !== prev.tone) {
      if (tapBadge?.animate) {
        replyAnimations.push(tapBadge.animate([
          { opacity: .2, transform: 'scale(.62) rotate(-18deg)', filter: 'blur(3px)' },
          { opacity: 1, transform: 'scale(1.08)', filter: 'blur(0px)', offset: .6 },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ], { duration: 320, easing }));
      }
      if (tapWave?.animate) {
        replyAnimations.push(tapWave.animate([
          { opacity: .25, transform: 'scale(.85)' },
          { opacity: .9, transform: 'scale(1.15)', offset: .4 },
          { opacity: .38, transform: 'scale(1)' },
        ], { duration: 420, easing }));
      }
    }

    if (prev && next.jamCount !== prev.jamCount && disturbance?.animate) {
      const dir = Math.sign(next.jamCount - prev.jamCount);
      replyAnimations.push(disturbance.animate([
        { opacity: .4, transform: `translateY(${dir * 4}px)` },
        { opacity: 1, transform: 'none' },
      ], { duration: 200, easing }));
    }

    let changedIndex = 0;
    const prevRows = prev?.rows || [];
    rows.forEach((row, i) => {
      const pRow = prevRows[i];
      const nRow = next.rows[i];
      const noAnswerShift = nRow.bitsText === 'No answer' || pRow?.bitsText === 'No answer';
      const structureChanged = !pRow || nRow.exchange !== pRow.exchange || nRow.badge !== pRow.badge || noAnswerShift;
      const contentChanged = structureChanged || nRow.bitsText !== pRow.bitsText || nRow.wrongKey !== pRow.wrongKey;
      if (!contentChanged) return;

      if (mode === 'checks' || mode === 'clear' || structureChanged) {
        animateRowDrop(row, changedIndex++ * 72, 5, 9, 350);
        return;
      }

      const bitsEl = row.querySelector('.s14-bits');
      if (bitsEl?.animate) {
        replyAnimations.push(bitsEl.animate([
          { opacity: .55, filter: 'blur(2px)', transform: 'translateY(-3px)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'none' },
        ], { duration: 240, easing }));
      }
      const prevWrong = new Set(pRow.wrongKey ? pRow.wrongKey.split(',') : []);
      row.querySelectorAll('.s14-bit').forEach((digit, k) => {
        const bitChanged = digit.textContent !== pRow.bitsText[k];
        const newlyWrong = digit.hasAttribute('data-wrong') && !prevWrong.has(String(k));
        if ((bitChanged || newlyWrong) && digit.animate) {
          replyAnimations.push(digit.animate([
            { opacity: .25, filter: 'blur(2px)', transform: 'translateY(-4px) scale(1.26)' },
            { opacity: 1, filter: 'blur(0px)', transform: 'none' },
          ], { duration: 260, easing }));
        }
      });
    });
  }

  const mistakes = plate('s14', p => {
    const checks = p.input('checks').checked;
    const jamKey = [...jammedCells].sort((a, b) => a - b).join(',');
    const key = `${s14seed}/${checks}/${jamKey}`;
    if (key !== checkedSignal?.key) {
      checkedSignal = { key, ...checkSignal(checks) };
      const { run, idReply, displayReply, uid, noisePct, jamCount } = checkedSignal;
      const replies = p.input('replies'), disturbance = p.input('disturbance');
      const clearBtn = p.input('clear'), strip = p.input('signal'), cellsBox = p.input('cells');
      const pctText = `${noisePct.toFixed(1)}%`;
      disturbance.textContent = jamCount === 0
        ? `Quiet · ${pctText}`
        : `${jamCount} ${jamCount === 1 ? 'bit' : 'bits'} jammed · ${pctText}`;
      disturbance.toggleAttribute('data-active', jamCount > 0);
      if (clearBtn) clearBtn.setAttribute('aria-disabled', jamCount === 0 ? 'true' : 'false');
      strip?.style.setProperty('--s14-noise-ratio', `${(jamCount / signalBitCount * 100).toFixed(1)}%`);
      const bits = displayReply?.answers[0]?.bits.slice(firstSignalBit, firstSignalBit + signalBitCount) ?? [];
      if (cellsBox) {
        Array.from(cellsBox.children).forEach((btn, i) => {
          const pressed = jammedCells.has(i);
          const bitValue = bits[i];
          const bitName = i === signalBitCount - 1 ? `Bit ${firstSignalBit + i + 1} check bit` : `Bit ${firstSignalBit + i + 1}`;
          btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          btn.setAttribute('aria-label', `${bitName}${bitValue === undefined ? '' : ` (${bitValue})`} — ${pressed ? 'jammed, activate to clear' : 'activate to jam'}`);
        });
      }
      const tries = run.steps.filter(st => st.label === 'ANTICOLLISION').length;
      const badId = run.uid?.some((b, i) => b !== uid[i]);
      const checksState = p.input('checks-state'), tapPad = p.input('tap'), tapStatus = p.input('tap-status');
      if (checksState) {
        checksState.textContent = checks ? 'On' : 'Off';
        checksState.toggleAttribute('data-off', !checks);
      }
      const tone = run.ok ? (tries > 1 ? 'retry' : 'ok') : 'fail';
      if (tapPad) tapPad.dataset.tone = tone;
      if (tapStatus) tapStatus.dataset.tone = tone;
      const readoutText = run.ok
        ? `ID read: ${run.uid.map(hex).join(' ')} ✓${tries > 1 ? ` (a check failed, so the phone asked again ${tries - 1}×)` : ''}`
        : badId
          ? `Checks off: the phone accepted a wrong ID, ${run.uid.map(hex).join(' ')}. The card refused to confirm it: it knows its own ID.`
          : `${run.reason}${checks ? ' The checks stopped a bad read.' : ''}${!idReply && jamCount ? ' (REQA drowned before ID reply.)' : ''}`;
      p.say(readoutText);
      showErrorReplies(replies, checkedSignal);
      animateS14Reveal(p, replies, readoutText, tone, checks, jamCount);
    }
    drawErrorSignal(p, checkedSignal.displayReply);
  });

  if (mistakes) {
    const cellsBox = mistakes.input('cells'), clearBtn = mistakes.input('clear');
    const checksInput = mistakes.input('checks'), tapBtn = mistakes.input('tap');
    let focusIndex = 0, painting = null, suppressClick = false;
    const cellButtons = Array.from({ length: signalBitCount }, (_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's14-cell';
      btn.dataset.cell = String(i);
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.setAttribute('aria-pressed', 'false');
      return btn;
    });
    cellsBox?.replaceChildren(...cellButtons);

    function setFocusCell(index) {
      focusIndex = clamp(index, 0, signalBitCount - 1);
      cellButtons.forEach((btn, i) => { btn.tabIndex = i === focusIndex ? 0 : -1; });
    }

    function applyCellState(index, action) {
      const i = clamp(index, 0, signalBitCount - 1);
      const changed = action === 'jam'
        ? !jammedCells.has(i) && (jammedCells.add(i), true)
        : action === 'clear'
          ? jammedCells.delete(i)
          : (jammedCells.has(i) ? jammedCells.delete(i) : jammedCells.add(i), true);
      if (!changed) return false;
      revealMode = 'jam';
      mistakes.dirty = true;
      return true;
    }

    function cellIndexAt(clientX) {
      const { left, width } = cellsBox.getBoundingClientRect();
      return width ? clamp(Math.floor((clientX - left) / width * signalBitCount), 0, signalBitCount - 1) : 0;
    }

    if (cellsBox) {
      cellsBox.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        const idx = cellIndexAt(event.clientX);
        const action = jammedCells.has(idx) ? 'clear' : 'jam';
        painting = { id: event.pointerId, action, last: idx };
        suppressClick = true;
        setFocusCell(idx);
        applyCellState(idx, action);
        cellsBox.setPointerCapture?.(event.pointerId);
      });

      cellsBox.addEventListener('pointermove', event => {
        if (event.pointerId !== painting?.id || !(event.buttons & 1)) return;
        const idx = cellIndexAt(event.clientX);
        if (idx === painting.last) return;
        const step = Math.sign(idx - painting.last);
        for (let c = painting.last + step; c !== idx + step; c += step) applyCellState(c, painting.action);
        painting.last = idx;
        setFocusCell(idx);
      });

      for (const name of ['pointerup', 'pointercancel']) {
        cellsBox.addEventListener(name, event => {
          if (event.pointerId !== painting?.id) return;
          painting = null;
          setTimeout(() => { suppressClick = false; }, 0);
        });
      }

      cellsBox.addEventListener('click', event => {
        const btn = event.target.closest('.s14-cell');
        if (!btn) return;
        if (suppressClick) { suppressClick = false; return; }
        const idx = Number(btn.dataset.cell);
        setFocusCell(idx);
        applyCellState(idx, 'toggle');
      });

      cellsBox.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const current = cellButtons.indexOf(document.activeElement);
        const idx = current >= 0 ? current : focusIndex;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const next = clamp(idx + (event.key === 'ArrowLeft' ? -1 : 1), 0, signalBitCount - 1);
          setFocusCell(next);
          cellButtons[next].focus();
          if (event.shiftKey) applyCellState(next, 'jam');
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : signalBitCount - 1;
          setFocusCell(next);
          cellButtons[next].focus();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
          if (!jammedCells.size) return;
          event.preventDefault();
          jammedCells.clear();
          revealMode = 'clear';
          mistakes.dirty = true;
        }
      });
    }

    clearBtn?.addEventListener('click', () => {
      if (!jammedCells.size) return;
      jammedCells.clear();
      revealMode = 'clear';
      mistakes.dirty = true;
    });

    checksInput?.addEventListener('change', () => {
      revealMode = 'checks';
      mistakes.dirty = true;
    });

    tapBtn?.addEventListener('click', () => {
      s14seed++;
      revealMode = 'tap';
      mistakes.dirty = true;
    });

    reduced.addEventListener('change', cancelReplyReveal);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelReplyReveal(); });
  }

  // ---------- 15. The whole conversation (the Bit River) ----------
  const river = {
    messages: [],
    started: 0,
    steal: false,
    seed: 1,
    awaitingTap: !reduced.matches,
    stolenIndex: -1,
    preHeistPace: false,
    heistActive: false,
    heistGrabbed: false,
    grabAt: 0,
    packetPos: null,
    settledReadout: '',
  };

  function setS15StateUI(p) {
    const tapBox = p.el.querySelector('#s15-tap-box');
    const prompt = p.el.querySelector('#s15-tap-prompt');
    const randomInput = p.input('random');
    const randomState = p.input('random-state');
    if (tapBox) tapBox.dataset.state = river.awaitingTap ? 'idle' : 'ready';
    if (prompt) prompt.textContent = river.awaitingTap ? 'Tap the card on the reader' : 'Tap again to replay';
    if (randomState && randomInput) {
      randomState.textContent = randomInput.checked ? 'On' : 'Off';
      randomState.toggleAttribute('data-off', !randomInput.checked);
    }
  }

  function conversation(p, { fromSteal = false } = {}) {
    const random = p.input('random').checked;
    river.seed++;
    river.awaitingTap = false;
    river.heistGrabbed = false;
    river.grabAt = 0;
    river.packetPos = null;
    river.preHeistPace = fromSteal && !reduced.matches;
    const chip = tags.cardChip({ randomUid: random, seed: random ? river.seed : 1 });
    const s = physics.solve({ tag: 'card', reader: 'phone', distance: .015 });
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: true }], { noise: .0015, seed: river.seed });
    let stolen = false;
    const thief = {
      send(bits) {
        const heard = link.send(bits), rec = link.recording[link.recording.length - 1];
        // A stolen packet: the card's ID answer is wiped cleanly off the air.
        if (river.steal && !stolen && rec.answers[0]?.name === 'UID') {
          stolen = true; river.steal = false;
          const g = air.gaussian(tags.random(river.seed));
          for (let i = rec.begin + 3 * iso.BIT; i < rec.begin + 20 * iso.BIT && i < heard.samples.length; i++) heard.samples[i] = 1 + g() * .001;
          rec.stolen = true;
        }
        return heard;
      }
    };
    const run = reader.activate(thief);
    const messages = [];
    run.steps.forEach((step, i) => {
      const rec = link.recording[i];
      const sentBytes = step.sent.length === 7 ? [iso.REQA] : iso.parseStandard(step.sent).bytes;
      const said = iso.describe('reader', sentBytes, step.sent.length === 7 ? 7 : 0);
      messages.push({ from: 'phone', ...said, bytes: sentBytes });
      const answer = rec.answers[0];
      if (answer) {
        const bytes = step.bytes || iso.parseStandard(answer.bits).bytes;
        const words = answer.name === 'UID' ? (rec.stolen ? 'My ID is … (lost on the way)' : 'My ID is ' + bytes.slice(0, 4).map(hex).join(' ') + '.') : iso.describe('card', bytes, 0).words;
        messages.push({ from: 'card', name: answer.name, words, bytes, stolen: !!rec.stolen });
      }
    });
    if (run.ok) messages.push({ from: 'app', name: 'App', words: 'Then the app takes over: a payment, a ticket, a door.', bytes: [] });
    river.messages = messages;
    river.stolenIndex = messages.findIndex(m => m.stolen);
    river.started = performance.now();
    river.ok = run.ok;
    river.uid = run.uid;
    river.settledReadout = run.ok
      ? `Card ${run.uid.map(hex).join(' ')} selected.${messages.some(m => m.stolen) ? ' A packet went missing, so the phone simply asked again.' : ''}`
      : run.reason;
    const chat = p.el.querySelector('.chat');
    chat.innerHTML = '';
    setS15StateUI(p);
    p.say(river.preHeistPace ? 'Watching for the card’s ID packet…' : river.settledReadout);
  }

  function riverTiming(elapsed) {
    if (reduced.matches) return { shown: river.messages.length, q: 1 };
    if (!river.preHeistPace || river.stolenIndex < 0) {
      const each = 1.1;
      const shown = Math.min(river.messages.length, Math.floor(elapsed / each) + 1);
      const q = Math.min(1, (elapsed - (shown - 1) * each) / (each * .8));
      return { shown, q };
    }
    const preEach = .78, postEach = 1.05;
    const splitTime = (river.stolenIndex + 1) * preEach;
    if (elapsed < splitTime) {
      const idx = Math.floor(elapsed / preEach);
      return { shown: idx + 1, q: Math.min(1, (elapsed - idx * preEach) / (preEach * .82)) };
    }
    const rem = elapsed - splitTime;
    const extra = Math.floor(rem / postEach);
    const shown = Math.min(river.messages.length, river.stolenIndex + 2 + extra);
    const q = shown >= river.messages.length && rem - extra * postEach > postEach
      ? 1
      : Math.min(1, (rem - extra * postEach) / (postEach * .82));
    return { shown, q };
  }

  const s15 = plate('s15', p => {
    const ctx = fit(p), now = performance.now();
    const left = 40, right = p.w - 40, mid = p.h / 2;
    const t = river.awaitingTap ? now / 1000 : (now - river.started) / 1000;

    // The river: bits flowing between the phone and the card.
    ctx.font = `500 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const rand = tags.random(3);
    for (let i = 0; i < 90; i++) {
      const lane = rand() * 2 - 1, speed = .25 + rand() * .5, ph = (rand() + t * speed * (reduced.matches ? 0 : .12)) % 1;
      const x = left + ph * (right - left);
      ctx.fillStyle = `rgba(13, 13, 12, ${(.08 + .12 * rand()).toFixed(2)})`;
      ctx.fillText(rand() < .5 ? '0' : '1', x, mid + lane * p.h * .22);
    }
    ctx.font = `600 12px ${SANS}`; ctx.fillStyle = INK;
    ctx.textAlign = 'left'; ctx.fillText('Phone', 10, 16); ctx.textAlign = 'right'; ctx.fillText('Card', p.w - 10, 16);

    const chat = p.el.querySelector('.chat');
    if (river.awaitingTap) {
      river.packetPos = null;
      p.canvas.riverState = null;
      setS15StateUI(p);
      ctx.font = `500 13px ${SANS}`;
      ctx.fillStyle = 'rgba(87, 83, 76, .88)';
      ctx.textAlign = 'center';
      ctx.fillText('Tap the card on the reader to start', p.w / 2, mid);
      if (!chat.children.length) {
        const empty = document.createElement('li');
        empty.className = 'chat-empty';
        empty.textContent = 'Waiting for you to tap the card…';
        chat.append(empty);
      }
      p.say('Drag or click the card onto the reader to watch all six messages.');
      return;
    }

    if (!river.messages.length) conversation(p);
    const { shown, q } = riverTiming(t);
    chat.querySelector('.chat-empty')?.remove();

    // The packet in flight.
    const m = river.messages[shown - 1];
    if (m && m.from !== 'app') {
      const x = m.from === 'phone' ? left + q * (right - left) : right - q * (right - left);
      const label = m.name;
      ctx.font = `700 12px ${SANS}`;
      const w = ctx.measureText(label).width + 24;
      river.packetPos = { x, y: mid, w, h: 28, stolen: !!m.stolen, q, index: shown - 1, label };
      p.canvas.riverState = river.packetPos;
      if (m.stolen && river.heistGrabbed) {
        const age = Math.min(1, (now - river.grabAt) / 480);
        if (age < 1) {
          ctx.save();
          ctx.strokeStyle = RED;
          ctx.globalAlpha = (1 - age) * .72;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, mid, 10 + age * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = RED; ctx.font = `700 12px ${SANS}`; ctx.textAlign = 'center';
        ctx.fillText('WARNING: Data packet missing!', p.w / 2, mid + 40);
      } else {
        ctx.fillStyle = m.stolen ? RED : m.from === 'phone' ? INK : COPPER;
        ctx.beginPath(); ctx.roundRect(x - w / 2, mid - 14, w, 28, 14); ctx.fill();
        ctx.fillStyle = '#f5f2ec'; ctx.textAlign = 'center'; ctx.fillText(label, x, mid + 1);
        if (m.stolen && q > .5) { ctx.fillStyle = RED; ctx.font = `700 12px ${SANS}`; ctx.fillText('WARNING: Data packet missing!', p.w / 2, mid + 40); }
      }
    } else {
      river.packetPos = null;
      p.canvas.riverState = null;
    }

    // The phone's log, as a chat.
    while (chat.children.length < shown) {
      const msg = river.messages[chat.children.length], li = document.createElement('li');
      li.className = 'chat-' + msg.from + (msg.stolen ? ' is-stolen' : '');
      li.innerHTML = `<button type="button"><span>${msg.words}</span><small>${msg.name}${msg.bytes.length ? ' · ' + msg.bytes.map(hex).join(' ') : ''}</small></button>`;
      li.querySelector('button').addEventListener('click', () => li.classList.toggle('is-open'));
      chat.append(li);
    }
    if (shown >= river.messages.length && river.settledReadout) p.say(river.settledReadout);
  }, { animate: true });

  if (s15) {
    const tapBtn = s15.input('tap'), stealBtn = s15.input('steal');
    const stage = s15.el.querySelector('#s15-tap-stage'), ring = s15.el.querySelector('.s15-reader-ring');
    const randomInput = s15.input('random'), randomState = s15.input('random-state');
    const chartEl = s15.el.querySelector('#s15-chart');
    let cardAnim, ringAnim, randomFlip, heistFrame = 0, heistSvg = null, drag = null, suppressTapClick = false;
    let heistStartScroll = 0;

    function cancelHeist() {
      cancelAnimationFrame(heistFrame);
      heistFrame = 0;
      heistSvg?.remove();
      heistSvg = null;
      river.heistActive = false;
      river.heistGrabbed = false;
      if (stealBtn) {
        stealBtn.removeAttribute('data-heist');
        stealBtn.style.removeProperty('--s15-jaw-angle');
        stealBtn.style.removeProperty('--s15-jaw-scale');
        stealBtn.style.removeProperty('--s15-jaw-aim');
        stealBtn.style.removeProperty('transform');
      }
    }

    function performTap({ fromDrag = false } = {}) {
      cancelHeist();
      cardAnim?.cancel();
      ringAnim?.cancel();
      const distance = stage ? Math.max(52, stage.clientWidth - tapBtn.offsetWidth - 16) : 90;
      if (!fromDrag && !reduced.matches && !document.hidden && tapBtn?.animate) {
        cardAnim = tapBtn.animate([
          { transform: 'translateX(-6px) rotate(5deg)' },
          { transform: `translateX(-${distance}px) rotate(0deg)`, offset: .30 },
          { transform: `translateX(-${distance}px) rotate(0deg)`, offset: .56 },
          { transform: 'translateX(0px) rotate(7deg)' },
        ], { duration: 760, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }
      if (!reduced.matches && !document.hidden && ring?.animate) {
        ringAnim = ring.animate([
          { opacity: .35, transform: 'scale(.95)' },
          { opacity: 1, transform: 'scale(1.24)', offset: .36 },
          { opacity: .30, transform: 'scale(1)' },
        ], { duration: 680, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
      conversation(s15);
    }

    function launchHeistAnimation() {
      cancelHeist();
      if (reduced.matches || document.hidden || !stealBtn || !chartEl) return;
      river.heistActive = true;
      heistStartScroll = scrollY;
      stealBtn.dataset.heist = 'stalking';

      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 's15-heist-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = `
        <path class="s15-heist-arm" fill="none" stroke="#0d0d0c" stroke-width="3.6" stroke-linecap="round"/>
        <g class="s15-heist-crumbs" opacity="0">
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" font-weight="700" fill="#b3261e">0</text>
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" font-weight="700" fill="#0d0d0c">1</text>
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" font-weight="700" fill="#b3261e">1</text>
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" font-weight="700" fill="#0d0d0c">0</text>
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" font-weight="700" fill="#b3261e">0</text>
          <text font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" font-weight="700" fill="#0d0d0c">1</text>
        </g>
        <g class="s15-heist-packet" opacity="0">
          <rect x="-22" y="-14" width="44" height="28" rx="14" fill="#b3261e"/>
          <text x="0" y="4" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-size="12" font-weight="700" fill="#f5f2ec">UID</text>
        </g>
        <g class="s15-heist-hand">
          <g class="s15-hand-open">
            <path d="M-9 5 L-11 -6 C-11 -9 -7 -9 -7 -6 L-6 1 L-4 -10 C-4 -13 0 -13 0 -10 L0 0 L3 -9 C3 -12 7 -12 7 -9 L6 2 L10 -4 C11 -6 14 -5 13 -2 L8 10 C6 13 -5 13 -8 8 Z" fill="#f5f2ec" stroke="#0d0d0c" stroke-width="1.9" stroke-linejoin="round"/>
          </g>
          <g class="s15-hand-fist" opacity="0">
            <rect x="-10" y="-6" width="20" height="15" rx="7" fill="#f5f2ec" stroke="#0d0d0c" stroke-width="1.9"/>
            <path d="M-6 -6 V2 M-1 -6 V2 M4 -6 V2" stroke="#0d0d0c" stroke-width="1.5" stroke-linecap="round"/>
          </g>
        </g>`;
      document.body.append(svg);
      heistSvg = svg;

      const armEl = svg.querySelector('.s15-heist-arm');
      const handEl = svg.querySelector('.s15-heist-hand');
      const openHand = svg.querySelector('.s15-hand-open');
      const fistHand = svg.querySelector('.s15-hand-fist');
      const packetEl = svg.querySelector('.s15-heist-packet');
      const crumbsEl = svg.querySelector('.s15-heist-crumbs');
      const crumbNodes = Array.from(crumbsEl.children);
      const startTime = performance.now();
      let grabStart = 0, grabOrigin = null, snapped = false, chomped = false;

      function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
      function easeInOut(t) { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); }

      function step(now) {
        if (!heistSvg?.isConnected || Math.abs(scrollY - heistStartScroll) > innerHeight * .38) {
          cancelHeist();
          return;
        }
        const jawEl = stealBtn.querySelector('.s15-jaw-wrap') || stealBtn;
        const jRect = jawEl.getBoundingClientRect();
        const cRect = chartEl.getBoundingClientRect();
        const ax = jRect.left + jRect.width * .5;
        const ay = jRect.top + jRect.height * .5;
        const waitX = cRect.left + cRect.width * .52;
        const waitY = cRect.top + cRect.height * .78;
        const elapsed = now - startTime;

        const pkt = river.packetPos;
        if (!grabStart && pkt?.stolen && pkt.q >= .30) {
          grabStart = now;
          grabOrigin = { x: cRect.left + pkt.x, y: cRect.top + pkt.y };
        }

        let hx = ax, hy = ay, showArm = true, showPacket = false, pScale = 1, handRot = 0;

        if (!grabStart) {
          const outT = easeOutCubic(elapsed / 900);
          const bob = Math.sin(elapsed * .0065) * 4 * outT;
          hx = ax + (waitX - ax) * outT;
          hy = ay + (waitY - ay) * outT + bob;
          handRot = Math.atan2(hy - ay, hx - ax) * 180 / Math.PI + 90;
          stealBtn.style.setProperty('--s15-jaw-angle', '6deg');
          stealBtn.style.setProperty('--s15-jaw-scale', '1');
        } else {
          const gElapsed = now - grabStart;
          const livePktX = pkt?.stolen ? cRect.left + pkt.x : grabOrigin.x;
          const livePktY = pkt?.stolen ? cRect.top + pkt.y : grabOrigin.y;
          if (gElapsed < 170) {
            const p = easeOutCubic(gElapsed / 170);
            hx = waitX + (livePktX - waitX) * p;
            hy = waitY + (livePktY - waitY) * p;
            handRot = Math.atan2(hy - ay, hx - ax) * 180 / Math.PI + 90;
            if (gElapsed >= 100 && !snapped) {
              snapped = true;
              river.heistGrabbed = true;
              river.grabAt = now;
              openHand.setAttribute('opacity', '0');
              fistHand.setAttribute('opacity', '1');
              grabOrigin = { x: livePktX, y: livePktY };
            }
            if (snapped) showPacket = true;
          } else if (gElapsed < 1020) {
            if (!snapped) {
              snapped = true;
              river.heistGrabbed = true;
              river.grabAt = now;
              openHand.setAttribute('opacity', '0');
              fistHand.setAttribute('opacity', '1');
            }
            const retT = easeInOut((gElapsed - 170) / 850);
            const arc = Math.sin(Math.PI * retT) * -36;
            hx = grabOrigin.x + (ax - grabOrigin.x) * retT;
            hy = grabOrigin.y + (ay - grabOrigin.y) * retT + arc;
            handRot = Math.atan2(ay - grabOrigin.y, ax - grabOrigin.x) * 180 / Math.PI + 90;
            showPacket = true;
            pScale = retT > .78 ? 1 - easeInOut((retT - .78) / .22) * .42 : 1;
            const mouthOpen = easeOutCubic((retT - .38) / .52);
            if (mouthOpen > 0) {
              const aim = clamp(Math.atan2(grabOrigin.y - ay, grabOrigin.x - ax) * 180 / Math.PI, -72, 24);
              stealBtn.dataset.heist = 'open';
              stealBtn.style.setProperty('--s15-jaw-angle', `${(mouthOpen * 52).toFixed(1)}deg`);
              stealBtn.style.setProperty('--s15-jaw-scale', `${(1 + mouthOpen * .55).toFixed(3)}`);
              stealBtn.style.setProperty('--s15-jaw-aim', `${(aim * mouthOpen).toFixed(1)}deg`);
            }
          } else if (gElapsed < 1640) {
            const chT = gElapsed - 1020;
            showArm = chT < 160;
            hx = ax; hy = ay;
            const shrinkT = easeInOut(chT / 120);
            showPacket = chT < 120;
            pScale = Math.max(0, .58 * (1 - shrinkT));
            let angle = 0;
            if (chT < 120) angle = 52 * (1 - easeInOut(chT / 120));
            else if (chT < 260) angle = Math.sin(((chT - 120) / 140) * Math.PI) * 24;
            else if (chT < 400) angle = Math.sin(((chT - 260) / 140) * Math.PI) * 14;
            if (!chomped && chT >= 100) {
              chomped = true;
              stealBtn.dataset.heist = 'chomp';
              stealBtn.animate?.([
                { transform: 'scale(1)' },
                { transform: 'scale(1.06, .93)', offset: .32 },
                { transform: 'scale(.98, 1.03)', offset: .68 },
                { transform: 'scale(1)' },
              ], { duration: 340, easing: 'cubic-bezier(.16, 1, .3, 1)' });
            }
            stealBtn.style.setProperty('--s15-jaw-angle', `${angle.toFixed(1)}deg`);
            stealBtn.style.setProperty('--s15-jaw-scale', `${(1.55 - easeInOut(chT / 440) * .55).toFixed(3)}`);

            const burst = clamp((chT - 80) / 420, 0, 1);
            if (burst > 0 && burst < 1) {
              crumbsEl.setAttribute('opacity', (1 - burst).toFixed(2));
              crumbNodes.forEach((node, idx) => {
                const a = (-0.75 + idx * 0.42);
                const d = (12 + (idx % 2) * 8) * easeOutCubic(burst);
                node.setAttribute('x', (ax + Math.cos(a) * d).toFixed(1));
                node.setAttribute('y', (ay + Math.sin(a) * d - burst * 6).toFixed(1));
              });
            } else {
              crumbsEl.setAttribute('opacity', '0');
            }
          } else {
            cancelHeist();
            return;
          }
        }

        if (showArm) {
          const mx = (ax + hx) * .5 + 22;
          const my = (ay + hy) * .5 + 48;
          armEl.setAttribute('d', `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`);
          armEl.setAttribute('opacity', '1');
          handEl.setAttribute('opacity', '1');
          handEl.setAttribute('transform', `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${(clamp(handRot, -45, 45)).toFixed(1)})`);
        } else {
          armEl.setAttribute('opacity', '0');
          handEl.setAttribute('opacity', '0');
        }

        if (showPacket) {
          packetEl.setAttribute('opacity', '1');
          packetEl.setAttribute('transform', `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) scale(${pScale.toFixed(3)})`);
        } else {
          packetEl.setAttribute('opacity', '0');
        }

        heistFrame = requestAnimationFrame(step);
      }

      heistFrame = requestAnimationFrame(step);
    }

    if (tapBtn && stage) {
      tapBtn.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        const maxTravel = Math.max(52, stage.clientWidth - tapBtn.offsetWidth - 14);
        drag = { id: event.pointerId, startX: event.clientX, maxTravel, dx: 0, tapped: false };
        tapBtn.classList.add('is-dragging');
        tapBtn.setPointerCapture?.(event.pointerId);
      });

      tapBtn.addEventListener('pointermove', event => {
        if (event.pointerId !== drag?.id || !(event.buttons & 1)) return;
        const dx = clamp(drag.startX - event.clientX, 0, drag.maxTravel);
        drag.dx = dx;
        const prox = dx / drag.maxTravel;
        stage.style.setProperty('--s15-drag-x', `${(-dx).toFixed(1)}px`);
        stage.style.setProperty('--s15-prox', prox.toFixed(3));
        if (prox >= .76 && !drag.tapped) {
          drag.tapped = true;
          suppressTapClick = true;
          performTap({ fromDrag: true });
        }
      });

      for (const name of ['pointerup', 'pointercancel']) {
        tapBtn.addEventListener(name, event => {
          if (event.pointerId !== drag?.id) return;
          const ended = drag;
          drag = null;
          tapBtn.classList.remove('is-dragging');
          stage.style.removeProperty('--s15-drag-x');
          stage.style.removeProperty('--s15-prox');
          if (!ended.tapped) {
            if (ended.dx / ended.maxTravel >= .52) {
              suppressTapClick = true;
              performTap({ fromDrag: true });
            } else if (ended.dx < 8 && event.type === 'pointerup') {
              suppressTapClick = true;
              performTap({ fromDrag: false });
            }
          }
          setTimeout(() => { suppressTapClick = false; }, 0);
        });
      }

      tapBtn.addEventListener('click', () => {
        if (suppressTapClick) { suppressTapClick = false; return; }
        performTap({ fromDrag: false });
      });
    }

    chartEl?.addEventListener('click', () => {
      if (river.awaitingTap) performTap({ fromDrag: false });
    });

    randomInput?.addEventListener('change', () => {
      if (!randomState) return;
      const on = randomInput.checked;
      randomState.textContent = on ? 'On' : 'Off';
      randomState.toggleAttribute('data-off', !on);
      if (!reduced.matches && !document.hidden) {
        randomFlip?.cancel();
        const dir = on ? -1 : 1;
        randomFlip = randomState.animate([
          { opacity: 0, transform: `perspective(220px) translateY(${dir * 6}px) rotateX(${-dir * 48}deg)` },
          { opacity: 1, transform: 'none' },
        ], { duration: 240, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
    });

    stealBtn?.addEventListener('click', () => {
      river.steal = true;
      conversation(s15, { fromSteal: true });
      launchHeistAnimation();
    });

    for (const ev of ['resize', 'hashchange', 'pagehide']) addEventListener(ev, cancelHeist);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHeist(); });
    reduced.addEventListener('change', () => {
      if (reduced.matches) {
        cancelHeist();
        if (river.awaitingTap) conversation(s15);
      }
    });
  }

  // ---------- 16. Two cards in one field ----------
  let s16seed = 4;
  plate('s16', p => {
    const count = +p.input('cards').value, prefer = +(p.radio('pick') || 1);
    p.out('cards', String(count));
    const s = physics.solve({ tag: 'card', reader: 'phone', distance: .012 });
    // Random IDs (a random ID starts with 08, so every pair shares its first byte).
    const rand = tags.random(s16seed);
    const uids = Array.from({ length: count }, () => [0x08, ...Array.from({ length: 3 }, () => Math.floor(rand() * 256))]);
    const chips = uids.map(uid => tags.cardChip({ uid }));
    const link = channel.cardChannel(chips.map(chip => ({ chip, depth: s.dip, awake: true })), { noise: .001, seed: s16seed });
    const run = reader.activate(link, { prefer });
    const winner = run.ok ? uids.findIndex(u => u.every((b, i) => b === run.uid[i])) : -1;
    const clashes = run.steps.filter(st => st.clashAt !== undefined).map(st => st.clashAt);
    const ctx = fit(p), cw = Math.min(16, (p.w - 120) / 32), x0 = 96;
    ctx.textBaseline = 'middle';
    uids.forEach((uid, r) => {
      const y = 36 + r * 34, bits = iso.dataBits(uid);
      ctx.font = `600 12px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = r === winner ? GREEN : MUTED;
      ctx.fillText(`Card ${r + 1}${r === winner ? ' ✓' : ''}`, 10, y);
      ctx.font = `600 12px ${MONO}`; ctx.textAlign = 'center';
      bits.forEach((b, k) => {
        ctx.fillStyle = r === winner ? INK : MUTED;
        if (clashes.includes(k)) { ctx.fillStyle = 'rgba(179, 38, 30, .12)'; ctx.fillRect(x0 + k * cw - cw / 2, y - 12, cw, 24); ctx.fillStyle = RED; }
        ctx.fillText(String(b), x0 + k * cw, y);
      });
    });
    const y = 36 + count * 34 + 14;
    ctx.font = `500 12px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = INK;
    ctx.fillText('Each card’s ID, as sent: lowest bit first, byte by byte.', 10, y);
    if (clashes.length) {
      ctx.fillStyle = RED;
      clashes.forEach((c, i) => ctx.fillText(`Clash at bit ${c + 1}: the phone asks only cards with a ${prefer} there to go on.`, 10, y + 22 + i * 20));
    }
    const samples = link.recording.reduce((a, r) => a + r.samples.length, 0);
    p.say(count === 1 ? `One card: no clash. Selected in ${(samples / iso.SAMPLE_RATE * 1000).toFixed(2)} ms.`
      : run.ok ? `${clashes.length} clash${clashes.length === 1 ? '' : 'es'}; card ${winner + 1} won, the others went quiet. It took ${(samples / iso.SAMPLE_RATE * 1000).toFixed(2)} ms.`
      : run.reason);
  });
  document.getElementById('s16-tap')?.addEventListener('click', () => { s16seed++; plates.find(q => q.el.id === 's16').dirty = true; });

  // ---------- 17. Why your phone can't read your car key ----------
  plate('s17', p => {
    const readerKey = p.radio('reader') || 'phone', tagKey = p.radio('tag') || 'key';
    const R = physics.READERS[readerKey], T = physics.TAGS[tagKey];
    const opts = { tag: tagKey, reader: readerKey, distance: .01 };
    const s = physics.solve(opts);
    const ctx = fit(p), bx = box(p, 26, 44);
    const sweep = physics.sweep({ tag: tagKey, reader: readerKey, distance: .01 }, 30e3, 60e6, 300);
    const top = Math.max(...sweep.map(([, v]) => v)) * 1.15;
    const a = chart(ctx, bx, { from: 30e3, to: 60e6, log: true, ticks: [[125e3, '125 kHz'], [1e6, '1 MHz'], [13.56e6, '13.56 MHz']], label: 'Frequency' },
      { from: 1e-3, to: Math.max(top, 10), log: true, ticks: [[1e-3, '1 mV'], [.1, '0.1 V'], [10, '10 V']], label: `The ${tagKey === 'key' ? 'key' : 'card'}’s chip would get` });
    curve(ctx, sweep.map(([f, v]) => [f, Math.max(v, 1e-3)]), a.X, a.Y, COPPER, 2);
    vline(ctx, a.X(R.frequency), bx.y, bx.y + bx.h, INK, (readerKey === 'phone' ? 'The phone' : 'The car') + ' flips here');
    hline(ctx, a.Y(T.wake), bx.x, bx.x + bx.w, GREEN, 'Wake-up');
    dot(ctx, a.X(R.frequency), a.Y(Math.max(s.rawVolts, 1e-3)), s.awake ? GREEN : RED);
    p.say(`${readerKey === 'phone' ? 'The phone' : 'The car’s reader'} gives the ${tagKey === 'key' ? 'key' : 'card'}’s chip ${si(s.rawVolts, 'V', 2)}. It needs ${T.wake} V. ${s.awake ? 'Awake.' : 'Nothing happens.'}`);
  });

  // ---------- Drawing only what is on screen ----------
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) { const p = plates.find(q => q.el === e.target); if (p) { p.visible = e.isIntersecting; if (p.visible) p.dirty = true; } }
  }, { rootMargin: '120px' });
  for (const p of plates) seen.observe(p.el);
  addEventListener('resize', () => { for (const p of plates) p.dirty = true; });
  document.fonts?.ready.then(() => { for (const p of plates) p.dirty = true; });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000);
    last = now;
    for (const p of plates) {
      if (!p.visible || !(p.dirty || p.animate)) continue;
      p.dirty = false; p.dt = dt;
      try { p.draw(p); } catch (error) { console.error(p.el.id, error); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
