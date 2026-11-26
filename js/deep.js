/*
 * Part 2, "Take it apart": scenes 6 to 18. Each scene is one question with one thing to try,
 * and every picture is computed from the simulation in js/rfid as the visitor changes it.
 *
 *   The power      6 distance and coil size   7 a still magnet makes nothing
 *                  8 the tuning capacitor      9 metal                10 riding through pauses
 *   The answer     11 load modulation          12 the subcarrier      13 Manchester coding
 *                  14 check bits and CRC       15 the whole conversation
 *                  16 two cards at once        17 why a phone can't read a car key
 *                  18 passive vs. active RFID
 *
 * Plates draw only while they are on screen. Static ones redraw when an input changes;
 * moving ones (7, 15, 18) draw every frame while visible.
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
    p.canvas.transitionTraces = [[top, field, a, INK], [bottom, cappedVolts, b, COPPER]].map(([box, points, axes, color]) => {
      const x = axes.X(points[0][0]);
      const yAt = u => {
        const index = u * (points.length - 1), i = Math.floor(index);
        const value = points[i][1], next = points[Math.min(i + 1, points.length - 1)][1];
        return (axes.Y(value + (next - value) * (index - i)) - box.y) / box.h;
      };
      return { box: { ...box, x, w: axes.X(points.at(-1)[0]) - x }, yAt, color };
    });
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
  const s7VoltageFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 2 });
  const s7Coil = { tag: 'card', reader: 'phone', distance: .02 };
  const s7MaxEmf = physics.solve(s7Coil).emf;
  plate('s7', p => {
    const speed = p.input('speed'), v = speed.valueAsNumber;
    if (v !== p.waveSetting) {
      p.waveSetting = v;
      const f = v === 0 ? 0 : 10 * (13.56e6 / 10) ** (v / 100);
      const emf = f > 0 ? physics.solve({ ...s7Coil, frequency: f }).emf : 0;
      const frequency = v === 100 ? '13.56 MHz' : f === 0 ? '0 Hz' : si(f, 'Hz', 3);
      p.out('speed', frequency);
      speed.setAttribute('aria-valuetext', f === 0 ? '0 Hz (still field)' : frequency + (v === 100 ? ' (reader speed)' : ''));
      const [scale, unit] = emf === 0 || emf >= 1 ? [1, 'V'] : emf >= .001 ? [1e3, 'mV'] : [1e6, 'µV'];
      p.say(`${s7VoltageFormat.format(emf * scale)} ${unit}`);
      p.el.querySelector('.s7-threshold').textContent = f === 0 ? 'The field stays steady. The coil makes no voltage.'
        : emf >= 3 ? 'Plenty for the chip.' : 'The chip needs about 2 V.';
      p.waveTarget = [Number(f > 0), clamp(Math.log10(1 + emf / s7MaxEmf * 1e4) / 4, 0, 1),
        f === 0 ? 0 : .25 + Math.log10(f) / Math.log10(13.56e6) * 1.6];
    }
    // Keep the phase and continue from the trace already on screen when the slider moves again.
    const dt = Math.min(p.dt, 1 / 30);
    const ease = 1 - Math.exp(-20 * dt);
    p.waveShown = !p.waveShown || reduced.matches ? p.waveTarget : p.waveTarget.map((target, i) => {
      const gap = target - p.waveShown[i];
      return Math.abs(gap) < .001 ? target : p.waveShown[i] + gap * ease;
    });
    const [flip, vAmp, shown] = p.waveShown;
    const ctx = fit(p);
    if (!reduced.matches) p.phase = (p.phase || 0) + shown * dt * Math.PI * 2;
    const ph = p.phase || 0;
    const inset = p.w < 500 ? 14 : 28;
    const laneHeight = (p.h - 70) / 2;
    const B = { x: inset, y: 28, w: p.w - 2 * inset, h: laneHeight };
    const V = { ...B, y: B.y + laneHeight + 28 };
    const handoffPlots = [];
    const divider = (B.y + B.h + V.y) / 2 - 6;
    hline(ctx, divider, B.x, B.x + B.w, '#d3cabe', '', []);
    for (const [bx, label, fn, color] of [
      [B, 'Magnetic field through the coil', t => .7 * (1 - flip) + Math.sin(t) * flip, INK],
      [V, 'Induced voltage', t => vAmp * Math.cos(t), COPPER]]) {
      const yAt = u => .5 - fn(ph - u * Math.PI * 4) * .45;
      ctx.strokeStyle = '#ded7cc'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const x = bx.x + bx.w * i / 8;
        ctx.moveTo(x, bx.y); ctx.lineTo(x, bx.y + bx.h);
      }
      ctx.stroke();
      hline(ctx, bx.y + bx.h / 2, bx.x, bx.x + bx.w, '#bdb4a6', '', []);
      ctx.fillStyle = color === COPPER ? '#89481e' : INK;
      ctx.font = `700 13px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, bx.x, bx.y - 6);
      ctx.strokeStyle = color; ctx.lineWidth = 2.25; ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200, x = bx.x + u * bx.w, y = bx.y + yAt(u) * bx.h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      handoffPlots.push({ box: bx, yAt, color });
    }
    p.canvas.transitionTraces = handoffPlots;
    p.canvas.drawOutgoingHandoff?.(handoffPlots);
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
        pts.push(crossed >= 2 ? start : [rho, z]);
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
    const card = physics.TAGS.card.radius, seeds = [.3, .5, .68, .82, .93].map(f => [f * a, 0]);
    const mix = (from, to, t) => from + (to - from) * t;
    const samples = new Map();
    let gapMm = park, value = park, model, scale, coilY, geometry, nearestY, pointer = null, grabOffset, travel;
    const heightAt = mm => mix(nearestY, restY, (mm - 1) / (park - 1));

    function setGap(mm) {
      gapMm = mm;
      scene.dirty = true;
    }

    function moveTo(to, duration) {
      if (reduced.matches || to === gapMm) {
        travel = null;
        setGap(to);
      } else {
        travel = { from: gapMm, to, duration, elapsed: 0, last: performance.now() };
        scene.dirty = true;
      }
    }

    const unshielded = physics.solve({ tag: 'card', reader: 'pad', distance: d, metal: null });
    function fieldAt(mm) {
      if (samples.has(mm)) return samples.get(mm);
      const gap = mm / 1000, height = d + gap;
      const fraction = stage(0, 14, park - mm);
      const shielding = fraction * fraction * (3 - 2 * fraction);
      const coils = [[a, 1, 0]];
      if (shielding) coils.push([a, -shielding, 2 * height]);
      const lines = traceField(coils, seeds, Math.min(.1, height)).map(points => {
        const through = points.some(([rho, z], i) => i > 0 && (points[i - 1][1] - d) * (z - d) <= 0 && Math.abs(rho) < card);
        return { points, through: Number(through) };
      });
      const s = shielding ? physics.solve({ tag: 'card', reader: 'pad', distance: d, metal: gap }) : unshielded;
      const result = {
        lines,
        field: mix(unshielded.field, s.field, shielding),
        resonance: mix(unshielded.resonance, s.resonance, shielding),
      };
      samples.set(mm, result);
      return result;
    }

    function fieldBetween(mm) {
      const low = Math.floor(mm), high = Math.ceil(mm), t = mm - low;
      const from = fieldAt(low), to = fieldAt(high);
      const lines = from.lines.map((line, i) => {
        const next = to.lines[i];
        const color = mix(line.through, next.through, t);
        // The integrator advances a fixed distance per step. Keep a shorter line at its endpoint.
        const points = from === to ? line.points : Array.from({ length: Math.max(line.points.length, next.points.length) }, (_, j) => {
          const start = line.points[Math.min(j, line.points.length - 1)];
          const end = next.points[Math.min(j, next.points.length - 1)];
          return [mix(start[0], end[0], t), mix(start[1], end[1], t)];
        });
        return { points, color: color === 0 ? FAINT : color === 1 ? COPPER
          : `rgba(${mix(13, 184, color)}, ${mix(13, 101, color)}, ${mix(12, 42, color)}, ${mix(.35, 1, color)})` };
      });
      return { gapMm: mm, lines, field: mix(from.field, to.field, t), resonance: mix(from.resonance, to.resonance, t) };
    }

    function updateReadout() {
      const displayed = gapMm === park ? park : Math.min(park - 1, Math.round(gapMm));
      if (displayed !== value) {
        value = displayed;
        const label = value === park ? 'No metal' : `Metal ${value} mm behind the card`;
        metal.setAttribute('aria-valuenow', value);
        metal.setAttribute('aria-valuetext', label);
        distance.textContent = label;
      }
      const fieldText = `${model.field.toFixed(2)} A/m`, tuningText = si(model.resonance, 'Hz', 4);
      if (strength.textContent !== fieldText) strength.textContent = fieldText;
      if (tuning.textContent !== tuningText) tuning.textContent = tuningText;
      const awake = gapMm === park ? unshielded.awake : physics.solve({ tag: 'card', reader: 'pad', distance: d, metal: gapMm / 1000 }).awake;
      const state = awake ? 'Chip awake' : 'Chip asleep';
      if (chip.textContent !== state) {
        chip.textContent = state;
        chip.dataset.awake = awake;
      }
    }

    const scene = plate('s9', p => {
      const ctx = fit(p), k = Math.min(p.w / .2, p.h / .15);
      if (p.h !== geometry?.height || p.w !== geometry?.width) {
        const parkedDepth = d + park / 1000;
        // Reserve room for the lower half of the parked field loops.
        const loopDepth = Math.max(...fieldAt(park).lines.flatMap(line => line.points.map(([, z]) => -z)));
        scale = Math.min((p.h - restY - 34) / parkedDepth, (p.h - restY - 8) / (parkedDepth + loopDepth));
        coilY = restY + parkedDepth * scale;
        nearestY = coilY - (d + .001) * scale;
        metal.style.setProperty('--s9-metal-width', `${.16 * k}px`);
        geometry = { width: p.w, height: p.h };
      }
      if (travel) {
        const now = performance.now();
        // A cold field sample can delay a frame. Keep the plate moving from the last drawn position.
        travel.elapsed += Math.min(now - travel.last, 1000 / 30);
        travel.last = now;
        const t = reduced.matches ? 1 : stage(0, travel.duration, travel.elapsed);
        gapMm = t === 1 ? travel.to : mix(travel.from, travel.to, t * t * (3 - 2 * t));
        if (t === 1) travel = null;
        else p.dirty = true;
      }
      if (model?.gapMm !== gapMm) {
        model = fieldBetween(gapMm);
        updateReadout();
      }

      const parked = (travel?.to ?? gapMm) === park;
      figure.classList.toggle('has-metal', !parked);
      const nextAction = parked ? 'Bring metal closer' : 'Move metal away';
      if (action.textContent !== nextAction) action.textContent = nextAction;
      const edge = heightAt(gapMm);
      const metalPosition = `${edge}px`;
      if (metal.style.getPropertyValue('--s9-metal-y') !== metalPosition) metal.style.setProperty('--s9-metal-y', metalPosition);
      const X = rho => p.w / 2 + rho * k, Y = z => coilY - z * scale;
      p.canvas.metalField = { lines: model.lines, X, Y, edge };
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, edge, p.w, p.h - edge);
      ctx.clip();
      for (const { points, color } of model.lines) {
        for (const side of [-1, 1]) curve(ctx, points, rho => X(side * rho), Y, color, 1.4);
      }
      ctx.restore();

      for (const side of [-1, 1]) dot(ctx, X(side * a), Y(0), INK, 4);
      ctx.fillStyle = 'rgba(184, 101, 42, .25)'; ctx.fillRect(X(-card), Y(d) - 3, X(card) - X(-card), 6);
      ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Card', X(card) + 6, Y(d) + 6);
      ctx.fillText('Reader’s coil', X(a) + 8, Y(0) + 4);
    });

    action.addEventListener('click', () => moveTo((travel?.to ?? gapMm) === park ? 1 : park, 720));
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10, Home: 1 - park, End: park - 1 };
    metal.addEventListener('keydown', event => {
      if (!Object.hasOwn(steps, event.key)) return;
      event.preventDefault();
      const target = travel?.to ?? value;
      moveTo(clamp(target + steps[event.key], 1, park), event.key === 'Home' || event.key === 'End' ? 720 : 140);
    });
    metal.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || !scale) return;
      travel = null;
      scene.dirty = true;
      metal.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      grabOffset = event.clientY - figure.getBoundingClientRect().top - heightAt(gapMm);
      figure.classList.add('is-dragging');
    });
    function updateDrag(event) {
      if (event.pointerId !== pointer) return;
      const y = event.clientY - figure.getBoundingClientRect().top - grabOffset;
      setGap(mix(1, park, 1 - stage(restY, nearestY, y)));
    }
    metal.addEventListener('pointermove', updateDrag);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      metal.addEventListener(type, event => {
        if (event.pointerId !== pointer) return;
        if (type === 'pointerup') updateDrag(event);
        pointer = null;
        figure.classList.remove('is-dragging');
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
    const top = 0, floor = -110, sideband = iso.SAMPLE_RATE / iso.SUB;
    const a = chart(ctx, bx, { from: iso.CARRIER - 1.5e6, to: iso.CARRIER + 1.5e6, ticks: [-1.5e6, -sideband, 0, sideband, 1.5e6].map(o => [iso.CARRIER + o, si(iso.CARRIER + o, 'Hz', 4)]), label: 'Frequency', stagger },
      { from: floor, to: top + 6, ticks: [[top, '0 dB'], [top - 50, '−50'], [top - 100, '−100']], label: stagger ? 'Level (dB)' : 'Strength (dB)' });
    const { freqs, values: onValues } = spectrumRecording.on, { values: offValues } = spectrumRecording.off;
    const points = freqs.map((f, i) => [f, Math.max(offValues[i] + (onValues[i] - offValues[i]) * blend, floor)]);
    const carrierIndex = (points.length - 1) / 2, sidebandBins = Math.round(sideband / (freqs[1] - freqs[0]));
    const traceColor = 'rgba(13, 13, 12, .46)', sidebandColor = '#8b4e23';
    // Keep the plotted bins and their canvas coordinates available for the next scene.
    p.canvas.spectrumTrace = { box: bx, points, ...a, color: traceColor, carrier: points[carrierIndex], flicker, blend };
    ctx.save(); ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h); ctx.clip();
    curve(ctx, points, a.X, a.Y, traceColor, 1);
    ctx.restore();
    ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';

    function markPeak(index, color, label, labelY, opacity = 1) {
      if (!opacity) return;
      const [frequency, db] = points[index], x = a.X(frequency), y = a.Y(db);
      ctx.save();
      ctx.globalAlpha = opacity;
      curve(ctx, points.slice(index - 3, index + 4), a.X, a.Y, color, 1.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, labelY + 3); ctx.lineTo(x, y); ctx.stroke();
      dot(ctx, x, y, color, 2.5);
      ctx.fillStyle = color;
      ctx.fillText(label, x, labelY);
      ctx.restore();
    }

    markPeak(carrierIndex, INK, 'Phone’s field', bx.y - 6);
    for (const side of [-1, 1]) {
      const index = carrierIndex + side * sidebandBins;
      const offset = `${side < 0 ? '−' : '+'}${si(sideband, 'Hz', 4)}`;
      markPeak(index, sidebandColor, stagger ? offset : `Card ${offset}`, a.Y(points[index][1]) - 14, stage(.2, 1, blend));
    }
    ctx.save();
    ctx.globalAlpha = 1 - stage(0, .65, blend);
    ctx.fillStyle = sidebandColor;
    ctx.textAlign = 'left';
    ctx.fillText('Card near the carrier', a.X(iso.CARRIER) + 12, a.Y(-27));
    ctx.restore();
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
  let countingReveal = 1;
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
    const now = performance.now(), mix = (from, to, t) => from + (to - from) * t;
    if (p.countingLetter !== letter) {
      p.countingFrom = p.countingShown;
      p.countingStarted = now;
      p.countingLetter = letter;
    }
    const elapsed = now - p.countingStarted, bitDuration = 350, bitDelay = 10;
    if (elapsed >= bitDuration + 7 * bitDelay || reduced.matches || document.hidden) p.countingFrom = null;
    const before = p.countingFrom;
    const progress = i => {
      const t = before ? stage(0, bitDuration, elapsed - Math.min(i, 7) * bitDelay) : 1;
      return t * t * (3 - 2 * t);
    };
    const bitProgress = sent.map((_, i) => progress(i));
    const shownBits = sent.map((b, i) => mix(before?.bits[i] ?? b, b, bitProgress[i]));
    const level = simple.level.map((value, i) => {
      const target = mix(value, manchester.level[i], blend);
      return mix(before?.level[i] ?? target, target, bitProgress[Math.floor(i / (2 * H))]);
    });

    // Keep each visible label's position and opacity when another keystroke interrupts the roll.
    const captionProgress = bitProgress[0], captionTravel = 10;
    const captions = (before?.captions ?? []).map(({ char, opacity, offset }) => ({
      char, opacity: mix(opacity, Number(char === letter), captionProgress),
      offset: mix(offset, char === letter ? 0 : -captionTravel, captionProgress),
    })).filter(({ opacity }) => opacity > .005);
    if (!captions.some(({ char }) => char === letter)) {
      captions.push({ char: letter, opacity: captionProgress, offset: captionTravel * (1 - captionProgress) });
    }

    const ctx = fit(p), inset = p.w < 440 ? 8 : 18;
    const bx = { x: inset, y: 48, w: p.w - inset * 2, h: p.h - 96 };
    const X = i => bx.x + i / active.level.length * bx.w, Y = v => bx.y + bx.h - v * bx.h * .92;
    const bitSize = 2 * H;
    const revealBit = (i, lead = 0) => stage(i, i + 1, countingReveal * sent.length + lead);
    const plottedLevel = countingReveal === 1 ? level : level.map((value, i) => value * revealBit(Math.floor(i / bitSize)));
    p.canvas.timingTrace = { box: bx, X, Y, sent, level: active.level, plottedLevel, read: active.read, ticks: active.ticks, samplesPerBit: bitSize, color: INK, codeBlend: blend };

    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i <= sent.length; i++) {
      ctx.globalAlpha = revealBit(Math.max(0, i - 1));
      ctx.strokeStyle = i === 8 ? FAINT : GRID;
      const x = X(i * bitSize);
      ctx.beginPath(); ctx.moveTo(x, bx.y - 3); ctx.lineTo(x, Y(0) + 16); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(0, bx.y - 21, p.w, 16); ctx.clip();
    ctx.font = `600 ${p.w < 440 ? 12 : 14}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    shownBits.forEach((b, i) => {
      const x = X((i + .5) * bitSize), y = bx.y - 13, opacity = revealBit(i, .45);
      ctx.fillStyle = i < 8 ? INK : MUTED;
      if (b < 1) { ctx.globalAlpha = opacity * (1 - b); ctx.fillText('0', x, y - 10 * b); }
      if (b > 0) { ctx.globalAlpha = opacity * b; ctx.fillText('1', x, y + 10 * (1 - b)); }
    });
    ctx.restore();
    ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = MUTED;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, bx.y - 40, p.w, 14); ctx.clip();
    for (const { char, opacity, offset } of captions) {
      ctx.globalAlpha = opacity * revealBit(0, .45);
      ctx.fillText(`Sent “${char}”`, bx.x, bx.y - 28 + offset);
    }
    ctx.restore();
    ctx.globalAlpha = revealBit(8, .45);
    ctx.fillText('Eight trailing zeros', X(8 * bitSize) + 6, bx.y - 28);
    ctx.globalAlpha = revealBit(0);
    ctx.fillText('Reader samples', bx.x, Y(0) + 46);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < plottedLevel.length; i++) {
      const y = Y(plottedLevel[i]);
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
    const ticks = [];
    const tickCount = Math.max(simple.ticks.length, manchester.ticks.length, before?.ticks.length ?? 0);
    for (let i = 0; i < tickCount; i++) {
      const previous = before?.ticks[i];
      const a = simple.ticks[i], b = manchester.ticks[i];
      const target = mix(a ?? b ?? previous.sample, b ?? a ?? previous.sample, blend);
      const t = bitProgress[Math.min(sent.length - 1, Math.floor(target / (2 * H)))];
      const sample = mix(previous?.sample ?? target, target, t);
      // Four weights keep identical digits and colors steady when either control changes.
      const weights = [0, 0, 0, 0];
      if (a !== undefined) weights[2 * simple.read[i] + Number(simple.read[i] === sent[i])] += 1 - blend;
      if (b !== undefined) weights[2 * manchester.read[i] + Number(manchester.read[i] === sent[i])] += blend;
      weights.forEach((weight, k) => {
        weights[k] = mix(previous?.weights[k] ?? (before ? 0 : weight), weight, t);
        drawTick(X(sample), k >> 1, k % 2 === 1, weights[k] * revealBit(Math.floor(sample / bitSize)));
      });
      ticks.push({ sample, weights });
    }
    p.countingShown = { captions, bits: shownBits, level, ticks };
    if (before) p.dirty = true;
    ctx.globalAlpha = 1;
    p.say(right ? `The reader counted all ${sent.length} bits right.`
      : `The reader counted ${active.read.length} bits instead of ${sent.length}: ${active.read.filter(b => b === 0).length} zeros where there were ${sent.filter(b => b === 0).length}.`);
  });
  if (counting) {
    counting.canvas.setCountingHandoff = reveal => {
      if (reveal === countingReveal) return;
      countingReveal = reveal;
      counting.dirty = true;
    };
    counting.canvas.setCountingMotion = codeBlend => {
      if (codeBlend === countingMotion.codeBlend) return;
      countingMotion.codeBlend = codeBlend;
      counting.dirty = true;
    };
    reduced.addEventListener('change', () => { counting.dirty = true; });
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
      cellsBox?.dispatchEvent(new Event('input', { bubbles: true }));
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
        const pending = event.pointerType === 'touch';
        painting = { id: event.pointerId, action, last: idx, pending, vertical: false,
          x: event.clientX, y: event.clientY };
        suppressClick = true;
        if (!pending) {
          setFocusCell(idx);
          applyCellState(idx, action);
        }
        cellsBox.setPointerCapture?.(event.pointerId);
      });

      cellsBox.addEventListener('pointermove', event => {
        if (event.pointerId !== painting?.id || painting.vertical || (event.pointerType !== 'touch' && !(event.buttons & 1))) return;
        if (painting.pending) {
          const dx = Math.abs(event.clientX - painting.x), dy = Math.abs(event.clientY - painting.y);
          if (Math.max(dx, dy) < 8) return;
          painting.pending = false;
          painting.vertical = dy > dx;
          if (painting.vertical) return;
          applyCellState(painting.last, painting.action);
          setFocusCell(painting.last);
        }
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
          if (name === 'pointerup' && painting.pending) {
            applyCellState(painting.last, painting.action);
            setFocusCell(painting.last);
          }
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
    seed: 1,
    awaitingTap: true,
    approaching: false,
    heist: null,
    packetPos: null,
    settledReadout: '',
  };

  let chatScrollTimer = 0;
  function updateChatFade(chat) {
    if (!chat) return;
    const overflow = chat.scrollHeight - chat.clientHeight;
    chat.classList.toggle('has-scroll-top', overflow > 4 && chat.scrollTop > 4);
    chat.classList.toggle('has-scroll-bottom', overflow > 4 && chat.scrollTop + chat.clientHeight < chat.scrollHeight - 4);
  }

  function syncChatScroll(chat, autoFollow = false) {
    if (!chat) return;
    updateChatFade(chat);
    const overflow = chat.scrollHeight - chat.clientHeight;
    if (autoFollow && overflow > 2) {
      const distanceFromBottom = overflow - chat.scrollTop;
      if (distanceFromBottom < 140 || chat.scrollTop === 0) {
        chat.scrollTo({ top: chat.scrollHeight, behavior: reduced.matches ? 'auto' : 'smooth' });
      }
      requestAnimationFrame(() => updateChatFade(chat));
      clearTimeout(chatScrollTimer);
      chatScrollTimer = setTimeout(() => updateChatFade(chat), 360);
    }
  }

  function setS15StateUI(p) {
    const tapBox = p.input('tap');
    const prompt = p.el.querySelector('#s15-tap-prompt');
    const randomInput = p.input('random');
    const randomState = p.input('random-state');
    const state = river.approaching ? 'approaching' : river.awaitingTap ? 'idle' : 'ready';
    const label = river.awaitingTap ? 'Tap the card' : 'Tap again to replay';
    if (tapBox && tapBox.dataset.state !== state) tapBox.dataset.state = state;
    if (prompt && prompt.textContent !== label) prompt.textContent = label;
    if (randomState && randomInput) {
      randomState.textContent = randomInput.checked ? 'On' : 'Off';
      randomState.toggleAttribute('data-off', !randomInput.checked);
    }
  }

  function conversation(p) {
    const random = p.input('random').checked;
    river.seed++;
    river.awaitingTap = false;
    river.approaching = false;
    river.packetPos = null;
    const chip = tags.cardChip({ randomUid: random, seed: random ? river.seed : 1 });
    const s = physics.solve({ tag: 'card', reader: 'phone', distance: .015 });
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: true }], { noise: .0015, seed: river.seed });
    const run = reader.activate(link);
    const messages = [];
    run.steps.forEach((step, i) => {
      const rec = link.recording[i];
      const sentBytes = step.sent.length === 7 ? [iso.REQA] : iso.parseStandard(step.sent).bytes;
      const said = iso.describe('reader', sentBytes, step.sent.length === 7 ? 7 : 0);
      messages.push({ from: 'phone', ...said, bytes: sentBytes, stolen: false });
      const answer = rec.answers[0];
      if (answer) {
        const bytes = step.bytes || iso.parseStandard(answer.bits).bytes;
        const words = answer.name === 'UID' ? 'My ID is ' + bytes.slice(0, 4).map(hex).join(' ') + '.' : iso.describe('card', bytes, 0).words;
        messages.push({ from: 'card', name: answer.name, words, bytes, stolen: false });
      }
    });
    if (run.ok) messages.push({ from: 'app', name: 'App', words: 'Then the app takes over: a payment, a ticket, a door.', bytes: [], stolen: false });
    river.messages = messages;
    river.started = performance.now();
    river.ok = run.ok;
    river.uid = run.uid;
    river.settledReadout = run.ok ? `Card ${run.uid.map(hex).join(' ')} selected.` : run.reason;
    const chat = p.el.querySelector('.chat');
    chat.innerHTML = '';
    chat.scrollTop = 0;
    syncChatScroll(chat, false);
    setS15StateUI(p);
    p.say(reduced.matches ? river.settledReadout : 'The card touched the reader. Watch the six messages.');
  }

  function riverTiming(elapsed) {
    if (reduced.matches) return { shown: river.messages.length, q: 1 };
    const each = 1.5;
    const shown = Math.min(river.messages.length, Math.floor(elapsed / each) + 1);
    const isFinal = shown >= river.messages.length && elapsed >= river.messages.length * each;
    const q = isFinal ? 1 : Math.min(1, (elapsed - (shown - 1) * each) / (each * .88));
    return { shown, q };
  }

  const s15 = plate('s15', p => {
    const ctx = fit(p), now = performance.now();
    const left = 40, right = p.w - 40, mid = p.h / 2;
    const waiting = river.awaitingTap || river.approaching;
    const heist = river.heist;
    const clock = heist && !heist.caughtAt ? heist.pausedAt : now;
    const t = waiting ? now / 1000 : (clock - river.started) / 1000;

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
    if (waiting) {
      river.packetPos = null;
      p.canvas.riverState = null;
      setS15StateUI(p);
      ctx.font = `500 13px ${SANS}`;
      ctx.fillStyle = 'rgba(87, 83, 76, .88)';
      ctx.textAlign = 'center';
      ctx.fillText(river.approaching ? 'Waiting for contact…' : 'Tap the card to start', p.w / 2, mid);
      if (!chat.children.length) {
        const empty = document.createElement('li');
        empty.className = 'chat-empty';
        empty.textContent = 'The conversation starts when the card touches the reader.';
        chat.append(empty);
        syncChatScroll(chat, false);
      }
      p.say(river.approaching ? 'The card is moving toward the reader.' : 'Tap the card to watch all six messages.');
      return;
    }

    if (!river.messages.length) conversation(p);
    const { shown, q } = riverTiming(t);
    chat.querySelector('.chat-empty')?.remove();

    // The packet in flight.
    const idx = shown - 1, m = river.messages[idx];
    if (m && m.from !== 'app') {
      const held = heist?.packet.index === idx && !heist.caughtAt;
      const x = held ? heist.packet.x : m.from === 'phone' ? left + q * (right - left) : right - q * (right - left);
      const label = m.name;
      ctx.font = `700 12px ${SANS}`;
      const w = ctx.measureText(label).width + 24;
      river.packetPos = { x, y: mid, w, h: 28, stolen: !!m.stolen, q, index: idx, label };
      p.canvas.riverState = river.packetPos;
      if (m.stolen && !held) {
        const age = heist?.packet.index === idx ? Math.min(1, (now - heist.caughtAt) / 430) : 1;
        if (age < 1) {
          ctx.save();
          ctx.strokeStyle = COPPER;
          ctx.globalAlpha = (1 - age) * .62;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(heist.packet.x, mid, 10 + age * 19, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = RED; ctx.font = `700 12px ${SANS}`; ctx.textAlign = 'center';
        ctx.fillText('Packet missing. The phone will retry.', p.w / 2, mid + 40);
      } else {
        ctx.fillStyle = m.from === 'phone' ? INK : COPPER;
        ctx.beginPath(); ctx.roundRect(x - w / 2, mid - 14, w, 28, 14); ctx.fill();
        ctx.fillStyle = '#f5f2ec'; ctx.textAlign = 'center'; ctx.fillText(label, x, mid + 1);
      }
    } else {
      river.packetPos = null;
      p.canvas.riverState = null;
    }

    // The phone's log, as a chat.
    let added = false;
    while (chat.children.length < shown) {
      const msg = river.messages[chat.children.length], li = document.createElement('li');
      li.className = 'chat-' + msg.from + (msg.stolen ? ' is-stolen' : '');
      li.innerHTML = `<button type="button"><span>${msg.words}</span><small>${msg.name}${msg.bytes.length ? ' · ' + msg.bytes.map(hex).join(' ') : ''}</small></button>`;
      li.querySelector('button').addEventListener('click', () => {
        li.classList.toggle('is-open');
        syncChatScroll(chat, false);
      });
      chat.append(li);
      added = true;
    }
    if (added) syncChatScroll(chat, true);
    if (shown >= river.messages.length && river.settledReadout) p.say(river.settledReadout);
  }, { animate: true });

  if (s15) {
    const tapBtn = s15.input('tap'), stealBtn = s15.input('steal');
    const tapStage = s15.el.querySelector('#s15-tap-stage'), ring = tapStage.querySelector('.s15-reader-ring');
    const card = tapStage.querySelector('.s15-tap-card'), readerModel = tapStage.querySelector('.s15-reader');
    const hint = s15.el.querySelector('#s15-tap-hint');
    const randomInput = s15.input('random'), randomState = s15.input('random-state');
    const chartEl = s15.el.querySelector('#s15-chart'), chatEl = s15.el.querySelector('.chat');
    let tapRun, ringAnim, randomFlip, heistFrame = 0, heistSvg;

    chatEl?.addEventListener('scroll', () => updateChatFade(chatEl), { passive: true });
    addEventListener('resize', () => updateChatFade(chatEl));

    function cancelHeist() {
      const heist = river.heist;
      if (!heist) return;
      if (!heist.caughtAt) river.started += performance.now() - heist.pausedAt;
      river.heist = null;
      cancelAnimationFrame(heistFrame);
      heistSvg?.remove();
      heistSvg = null;
      stealBtn.removeAttribute('data-heist');
      for (const property of ['angle', 'scale', 'aim']) stealBtn.style.removeProperty(`--s15-jaw-${property}`);
    }

    function finishTap() {
      if (!tapRun) return;
      const { animation, contacted } = tapRun;
      tapRun = undefined;
      animation.cancel();
      ringAnim?.cancel();
      tapBtn.removeAttribute('aria-disabled');
      hint.textContent = '';
      if (!contacted) conversation(s15);
    }

    async function performTap() {
      if (tapRun) return;
      cancelHeist();
      if (reduced.matches || document.hidden || !card.animate) {
        conversation(s15);
        return;
      }

      const readerEdge = readerModel.offsetLeft + readerModel.offsetWidth + 6;
      const travel = readerEdge - card.offsetLeft - card.offsetWidth / 2;
      const resting = 'rotate(7deg)';
      const contact = `translateX(${travel}px) rotate(0deg)`;
      river.approaching = true;
      river.packetPos = null;
      chatEl.replaceChildren();
      tapBtn.setAttribute('aria-disabled', 'true');
      hint.textContent = 'Approaching';
      setS15StateUI(s15);

      const approach = card.animate([
        { transform: resting },
        { transform: `translate(${travel * .72}px, -5px) rotate(2deg)`, offset: .67 },
        { transform: contact },
      ], { duration: 760, easing: 'cubic-bezier(.35, 0, .25, 1)', fill: 'forwards' });
      const run = { animation: approach, contacted: false };
      tapRun = run;
      try {
        await approach.finished;
        if (tapRun !== run) return;
        run.contacted = true;
        conversation(s15);
        hint.textContent = 'Contact';
        ringAnim = ring.animate([
          { opacity: .42, transform: 'scale(1)' },
          { opacity: 1, transform: 'scale(1.18)', offset: .25 },
          { opacity: .42, transform: 'scale(1.38)' },
        ], { duration: 570, easing: 'ease-out' });
        run.animation = card.animate([
          { transform: contact },
          { transform: contact, offset: .4, easing: 'cubic-bezier(.4, 0, .35, 1)' },
          { transform: resting },
        ], { duration: 900 });
        approach.cancel();
        await run.animation.finished;
      } catch (error) {
        if (error.name !== 'AbortError') throw error;
      } finally {
        if (tapRun === run) finishTap();
      }
    }

    function launchHeist(packet, fromPhone) {
      if (reduced.matches || document.hidden) return;
      const heist = { packet, pausedAt: performance.now(), caughtAt: 0 };
      river.heist = heist;
      stealBtn.dataset.heist = 'reaching';

      const pillWidth = packet.w;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 's15-heist-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = `
        <path class="s15-heist-arm" fill="none" stroke="#8b4e23" stroke-width="3" stroke-linecap="round"/>
        <g class="s15-heist-packet" opacity="0">
          <rect x="${-pillWidth / 2}" y="-14" width="${pillWidth}" height="28" rx="14" fill="${fromPhone ? INK : COPPER}"/>
          <text x="0" y="1" dominant-baseline="middle" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-size="12" font-weight="700" fill="#f5f2ec"></text>
        </g>
        <g class="s15-heist-hand">
          <path class="s15-hand-open" d="M-9 5 L-11 -6 C-11 -9 -7 -9 -7 -6 L-6 1 L-4 -10 C-4 -13 0 -13 0 -10 L0 0 L3 -9 C3 -12 7 -12 7 -9 L6 2 L10 -4 C11 -6 14 -5 13 -2 L8 10 C6 13 -5 13 -8 8 Z" fill="#f5f2ec" stroke="#0d0d0c" stroke-width="1.9" stroke-linejoin="round"/>
          <g class="s15-hand-fist" opacity="0">
            <rect x="-10" y="-6" width="20" height="15" rx="7" fill="#f5f2ec" stroke="#0d0d0c" stroke-width="1.9"/>
            <path d="M-6 -6 V2 M-1 -6 V2 M4 -6 V2" stroke="#0d0d0c" stroke-width="1.5" stroke-linecap="round"/>
          </g>
        </g>
        <g class="s15-heist-crumbs" opacity="0" text-anchor="middle" fill="#8b4e23" font-family="JetBrains Mono, monospace" font-size="10" font-weight="600">
          <text>0</text><text>1</text><text>1</text><text>0</text>
        </g>`;
      svg.querySelector('.s15-heist-packet text').textContent = packet.label;
      document.body.append(svg);
      heistSvg = svg;

      const arm = svg.querySelector('.s15-heist-arm');
      const hand = svg.querySelector('.s15-heist-hand');
      const open = svg.querySelector('.s15-hand-open'), fist = svg.querySelector('.s15-hand-fist');
      const carried = svg.querySelector('.s15-heist-packet');
      const crumbs = svg.querySelector('.s15-heist-crumbs');
      const jaw = stealBtn.querySelector('.s15-jaw-wrap');
      const originScroll = scrollY;
      const grab = 422, returnAt = 490, mouthAt = 1110, bite = 1280, end = 1540;
      const smooth = (from, to, time) => {
        const t = stage(from, to, time);
        return t * t * (3 - 2 * t);
      };
      const mix = (from, to, t) => from + (to - from) * t;

      function step(now) {
        const elapsed = now - heist.pausedAt;
        if (!svg.isConnected || elapsed >= end || Math.abs(scrollY - originScroll) > innerHeight * .35) return cancelHeist();
        const button = jaw.getBoundingClientRect(), chart = chartEl.getBoundingClientRect();
        const ax = button.left + button.width / 2, ay = button.top + button.height / 2;
        const px = chart.left + packet.x, py = chart.top + packet.y;
        const reach = smooth(0, grab, elapsed), grip = smooth(grab - 55, returnAt, elapsed);
        const retract = smooth(returnAt, mouthAt, elapsed), eat = smooth(mouthAt, bite, elapsed);
        const position = reach * (1 - retract);
        const curl = Math.sin(Math.PI * reach) * 24 - Math.sin(Math.PI * retract) * 32;
        const x = mix(ax, px, position) + curl * .5, y = mix(ay, py, position) + curl;
        const aim = Math.atan2(py - ay, px - ax) * 180 / Math.PI;
        const twist = clamp((aim + 65) * .48, -46, 46) * position;

        if (!heist.caughtAt && elapsed >= grab) {
          heist.caughtAt = now;
          river.started += now - heist.pausedAt;
          stealBtn.dataset.heist = 'returning';
        }
        const handX = x, handY = y + position * 10;
        const armOpacity = smooth(0, 98, elapsed) * (1 - smooth(mouthAt - 25, bite - 35, elapsed));
        arm.setAttribute('d', `M ${ax} ${ay} Q ${mix(ax, handX, .38) + 34 * position} ${mix(ay, handY, .58) + 24 * position} ${handX} ${handY}`);
        arm.setAttribute('opacity', armOpacity);
        hand.setAttribute('opacity', armOpacity);
        hand.setAttribute('transform', `translate(${handX} ${handY}) rotate(${twist})`);
        open.setAttribute('opacity', 1 - grip);
        fist.setAttribute('opacity', grip);

        const jawOpen = smooth(returnAt + 190, mouthAt + 20, elapsed) * (1 - smooth(mouthAt + 65, bite + 90, elapsed));
        stealBtn.style.setProperty('--s15-jaw-angle', `${jawOpen * 38}deg`);
        stealBtn.style.setProperty('--s15-jaw-scale', 1 + jawOpen * .24);
        stealBtn.style.setProperty('--s15-jaw-aim', `${aim * jawOpen}deg`);
        carried.setAttribute('opacity', heist.caughtAt ? 1 - eat : 0);
        carried.setAttribute('transform', `translate(${x} ${y}) scale(${(1 - .34 * retract) * (1 - eat)})`);

        const burst = smooth(bite - 35, end, elapsed);
        crumbs.setAttribute('opacity', burst > 0 ? (1 - burst) * .72 : 0);
        Array.from(crumbs.children).forEach((dot, i) => {
          dot.setAttribute('x', ax + (i - 1.5) * (7 + 14 * burst));
          dot.setAttribute('y', ay - (12 + 13 * burst) * (1 - Math.abs(i - 1.5) * .22));
        });
        heistFrame = requestAnimationFrame(step);
      }
      heistFrame = requestAnimationFrame(step);
    }

    tapBtn.addEventListener('click', () => { void performTap(); });

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
      const pkt = river.packetPos;
      if (river.awaitingTap || river.approaching || river.heist || !pkt || pkt.stolen || pkt.q >= .96) return;
      const idx = pkt.index, msg = river.messages[idx];
      if (!msg || msg.from === 'app' || msg.stolen) return;

      const cleanCopy = { ...msg, bytes: [...msg.bytes], stolen: false };
      msg.stolen = true;
      msg.words = msg.name === 'UID' ? 'My ID is … (lost on the way)' : `${msg.words.replace(/\.$/, '')} (lost on the way)`;

      const existingLi = chatEl?.children[idx];
      if (existingLi) {
        existingLi.classList.add('is-stolen');
        const span = existingLi.querySelector('span');
        if (span) span.textContent = msg.words;
      }

      if (msg.from === 'phone') {
        river.messages.splice(idx + 1, 0, cleanCopy);
      } else {
        const askAgain = river.messages[idx - 1]
          ? { ...river.messages[idx - 1], bytes: [...river.messages[idx - 1].bytes], stolen: false }
          : null;
        river.messages.splice(idx + 1, 0, ...(askAgain ? [askAgain, cleanCopy] : [cleanCopy]));
      }

      if (!river.settledReadout.includes('missing')) {
        river.settledReadout = `${river.settledReadout} A packet went missing, so the phone simply asked again.`;
      }
      pkt.stolen = true;
      s15?.say('A packet was stolen mid-air — watch the phone ask again.');
      launchHeist(pkt, msg.from === 'phone');
    });

    const settle = () => { finishTap(); cancelHeist(); };
    for (const ev of ['resize', 'hashchange', 'pagehide']) addEventListener(ev, settle);
    document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
    reduced.addEventListener('change', () => { if (reduced.matches) settle(); });
  }

  // ---------- 16. Two cards in one field ----------
  const s16El = document.getElementById('s16');
  function rollS16Uids(seed) {
    const rand = tags.random(seed);
    return Array.from({ length: 3 }, () => [0x08, ...Array.from({ length: 3 }, () => Math.floor(rand() * 256))]);
  }
  const s16State = {
    seed: 4,
    placed: [0, 1],
    uids: rollS16Uids(4),
    busy: false,
    draggingSlot: -1,
    hiddenFlights: new Set(),
    returning: new Set(),
    winnerRow: -1,
    hasClash: false,
    seqToken: 0,
    flights: new Set(),
  };

  function s16StackPose(pos, total) {
    if (total <= 1) return { x: 0, y: -6, r: -2 };
    if (total === 2) return pos === 0 ? { x: -28, y: -18, r: -9 } : { x: 26, y: 14, r: 7 };
    return pos === 0 ? { x: -28, y: -18, r: -11 } : pos === 1 ? { x: 2, y: -3, r: -1 } : { x: 28, y: 15, r: 9 };
  }

  function buildS16CardFace(slot, uid, { compact = false, isWinner = false } = {}) {
    const label = compact ? `C${slot + 1}` : `Card ${slot + 1}${isWinner ? ' ✓' : ''}`;
    return `
      <img class="s16-card-img" src="images/intro/credit-card-face.webp" width="520" height="328" alt="" draggable="false">
      <span class="s16-card-tint" data-slot="${slot}" aria-hidden="true"></span>
      ${compact
        ? `<span class="s16-tucked-tag">${label}</span>`
        : `<span class="s16-card-bar"><span>${label}</span></span>`}`;
  }

  function syncS16Desk(winnerRow = s16State.winnerRow, hasClash = s16State.hasClash) {
    if (!s16El) return;
    const padStage = s16El.querySelector('#s16-pad-stage');
    const padCards = s16El.querySelector('#s16-pad-cards');
    const fieldHint = s16El.querySelector('#s16-field-hint');
    const walletBtn = s16El.querySelector('#s16-wallet');
    const walletSlots = s16El.querySelector('#s16-wallet-slots');
    const walletCount = s16El.querySelector('#s16-wallet-count');
    const walletAction = s16El.querySelector('#s16-wallet-action');

    const count = s16State.placed.length;
    const inWallet = [0, 1, 2].filter(slot => !s16State.placed.includes(slot) &&
      !s16State.hiddenFlights.has(slot) && !s16State.returning.has(slot)).length;
    if (padStage) {
      padStage.dataset.active = String(count > 0);
      padStage.dataset.clash = String(hasClash);
    }
    if (fieldHint) {
      fieldHint.textContent = count ? 'Drag a card off to return it' : 'Drag a card from the wallet';
    }
    if (walletCount) {
      walletCount.textContent = inWallet === 0 ? 'Empty' : `${inWallet} inside`;
    }
    if (walletBtn) walletBtn.dataset.empty = String(inWallet === 0);
    if (walletAction) walletAction.textContent = count === 3 ? 'All 3 on reader' : 'Drag or click';

    if (walletSlots) {
      for (const slotEl of walletSlots.querySelectorAll('.s16-slot')) {
        const slot = +slotEl.dataset.slot;
        const inserting = s16State.returning.has(slot);
        const shouldShow = !s16State.placed.includes(slot) && (inserting || !s16State.hiddenFlights.has(slot));
        let tucked = slotEl.querySelector('.s16-tucked-card');
        if (shouldShow) {
          if (!tucked) {
            tucked = document.createElement('span');
            tucked.className = 's16-tucked-card';
            tucked.innerHTML = buildS16CardFace(slot, s16State.uids[slot], { compact: true });
            slotEl.prepend(tucked);
          }
          tucked.toggleAttribute('data-inserting', inserting);
        } else {
          tucked?.remove();
        }
      }
    }

    if (padCards) {
      const wanted = new Set(s16State.placed);
      for (const node of Array.from(padCards.children)) {
        const slot = +node.dataset.slot;
        if (!wanted.has(slot) && slot !== s16State.draggingSlot) node.remove();
      }
      s16State.placed.forEach((slot, pos) => {
        const pose = s16StackPose(pos, s16State.placed.length);
        const uid = s16State.uids[slot];
        const isWinner = pos === winnerRow;
        const isQuiet = winnerRow >= 0 && !isWinner && s16State.placed.length > 1;
        let btn = padCards.querySelector(`.s16-pad-card[data-slot="${slot}"]`);
        if (!btn) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 's16-pad-card';
          btn.dataset.slot = String(slot);
          padCards.append(btn);
        }
        btn.style.setProperty('--sx', `${pose.x}px`);
        btn.style.setProperty('--sy', `${pose.y}px`);
        btn.style.setProperty('--sr', `${pose.r}deg`);
        btn.style.zIndex = String(pos + 2);
        const uidText = uid ? uid.map(hex).join(' ') : '';
        const faceChanged = btn.dataset.uid !== uidText || btn.classList.contains('is-winner') !== isWinner;
        btn.dataset.uid = uidText;
        btn.classList.toggle('is-winner', isWinner);
        btn.classList.toggle('is-quiet', isQuiet);
        btn.classList.toggle('is-hidden-flight', s16State.hiddenFlights.has(slot));
        if (faceChanged) {
          btn.setAttribute('aria-label', `Card ${slot + 1} (${uidText})${isWinner ? ', selected' : ''}. Drag off reader or press Delete to return to wallet.`);
          btn.innerHTML = buildS16CardFace(slot, uid, { compact: false, isWinner });
        }
      });
    }
  }

  const s16 = plate('s16', p => {
    const prefer = +(p.radio('pick') || 1);
    p.el.querySelector('#s16-pill')?.style.setProperty('--s16-pick-index', prefer === 1 ? '0' : '1');

    const activeUids = s16State.placed.map(slot => s16State.uids[slot]);
    const ctx = fit(p), cw = Math.min(16, (p.w - 116) / 32), x0 = 96, y0 = 26, rowStep = 30;
    if (!activeUids.length) {
      s16State.winnerRow = -1;
      s16State.hasClash = false;
      ctx.font = `500 13px ${SANS}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No cards in the field. Drag or click the wallet below to place one.', p.w / 2, p.h / 2);
      p.canvas.clashTrace = { x0, cw, y0, rowStep, rows: [], clashes: [], winner: -1, prefer };
      syncS16Desk(-1, false);
      p.say('No cards on the phone. Drag or click a card from the wallet.');
      return;
    }

    const s = physics.solve({ tag: 'card', reader: 'phone', distance: .012 });
    const chips = activeUids.map(uid => tags.cardChip({ uid }));
    const link = channel.cardChannel(chips.map(chip => ({ chip, depth: s.dip, awake: true })), { noise: .001, seed: s16State.seed });
    const run = reader.activate(link, { prefer });
    const winner = run.ok ? activeUids.findIndex(u => u.every((b, i) => b === run.uid[i])) : -1;
    const clashes = run.steps.filter(st => st.clashAt !== undefined).map(st => st.clashAt);
    s16State.winnerRow = winner;
    s16State.hasClash = clashes.length > 0;

    ctx.textBaseline = 'middle';
    const rows = activeUids.map((uid, r) => {
      const slot = s16State.placed[r], y = y0 + r * rowStep, bits = iso.dataBits(uid);
      ctx.font = `600 12px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = r === winner ? GREEN : MUTED;
      ctx.fillText(`Card ${slot + 1}${r === winner ? ' ✓' : ''}`, 10, y);
      ctx.font = `600 12px ${MONO}`; ctx.textAlign = 'center';
      bits.forEach((b, k) => {
        ctx.fillStyle = r === winner ? INK : MUTED;
        if (clashes.includes(k)) { ctx.fillStyle = 'rgba(179, 38, 30, .12)'; ctx.fillRect(x0 + k * cw - cw / 2, y - 11, cw, 22); ctx.fillStyle = RED; }
        ctx.fillText(String(b), x0 + k * cw, y);
      });
      return { slot, y, bits, winner: r === winner };
    });
    const captionY = y0 + activeUids.length * rowStep + 10;
    ctx.font = `500 12px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = INK;
    ctx.fillText('Each card’s ID, as sent: lowest bit first, byte by byte.', 10, captionY);
    if (clashes.length) {
      ctx.fillStyle = RED;
      clashes.slice(0, 2).forEach((c, i) => ctx.fillText(`Clash at bit ${c + 1}: the phone asks only cards with a ${prefer} there to go on.`, 10, captionY + 20 + i * 18));
    }
    p.canvas.clashTrace = { x0, cw, y0, rowStep, rows, clashes, winner, prefer };
    syncS16Desk(winner, clashes.length > 0);
    const samples = link.recording.reduce((a, r) => a + r.samples.length, 0);
    const winSlot = winner >= 0 ? s16State.placed[winner] + 1 : 1;
    p.say(activeUids.length === 1 ? `One card (Card ${winSlot}): no clash. Selected in ${(samples / iso.SAMPLE_RATE * 1000).toFixed(2)} ms.`
      : run.ok ? `${clashes.length} clash${clashes.length === 1 ? '' : 'es'}; Card ${winSlot} won, the others went quiet. It took ${(samples / iso.SAMPLE_RATE * 1000).toFixed(2)} ms.`
      : run.reason);
  });

  if (s16) {
    const padCards = s16.el.querySelector('#s16-pad-cards');
    const fieldZone = s16.el.querySelector('#s16-field-zone');
    const walletZone = s16.el.querySelector('#s16-wallet-zone');
    const walletBtn = s16.el.querySelector('#s16-wallet');
    const walletSlots = s16.el.querySelector('#s16-wallet-slots');
    const tapBtn = s16.el.querySelector('#s16-tap');
    let drag = null, walletDrag = null, suppressWalletClick = false;

    function isOverReaderDrop(clientX, clientY) {
      const fRect = fieldZone?.getBoundingClientRect();
      if (fRect && clientX >= fRect.left - 32 && clientX <= fRect.right + 32 &&
        clientY >= fRect.top - 32 && clientY <= fRect.bottom + 32) {
        return true;
      }
      const wRect = walletZone?.getBoundingClientRect();
      return !!(wRect && clientX < wRect.left - 16);
    }

    function cancelS16Animations() {
      s16State.seqToken++;
      walletDrag?.ghost?.remove();
      walletDrag = null;
      suppressWalletClick = false;
      if (fieldZone) delete fieldZone.dataset.dropTarget;
      for (const item of Array.from(s16State.flights)) {
        item.anim?.cancel();
        item.el?.remove();
      }
      s16State.flights.clear();
      s16State.hiddenFlights.clear();
      s16State.returning.clear();
      s16State.busy = false;
      s16State.draggingSlot = -1;
      drag?.card.classList.remove('is-dragging');
      drag?.card.style.removeProperty('transform');
      drag = null;
      if (walletBtn) {
        delete walletBtn.dataset.open;
        delete walletBtn.dataset.catching;
      }
      syncS16Desk(s16State.winnerRow, s16State.hasClash);
      s16.dirty = true;
    }

    function walletHasCard(slot) {
      return !s16State.placed.includes(slot) && !s16State.hiddenFlights.has(slot) && !s16State.returning.has(slot);
    }

    function closeWalletWhenIdle() {
      if (!s16State.busy && !s16State.returning.size && !s16State.hiddenFlights.size && !walletDrag && walletBtn) {
        delete walletBtn.dataset.open;
      }
    }

    function cardPose(node) {
      const rect = node.getBoundingClientRect();
      const { a, b } = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        width: node.offsetWidth * Math.hypot(a, b), angle: Math.atan2(b, a) * 180 / Math.PI };
    }

    async function tuckS16Card(slot, from, { delay = 0, vx = 0, vy = 0 } = {}) {
      const sequence = s16State.seqToken;
      s16State.returning.add(slot);
      walletBtn.dataset.open = 'true';
      syncS16Desk();
      const card = walletSlots?.querySelector(`.s16-slot[data-slot="${slot}"] .s16-tucked-card`);
      if (card && from && !reduced.matches && !document.hidden) {
        const to = cardPose(card);
        const dx = from.x - to.x, dy = from.y - to.y;
        const lift = Math.max(26, card.offsetHeight - 11);
        const animation = card.animate([
          { transform: `translate(${dx}px, ${dy}px) rotate(${from.angle}deg) scale(${from.width / to.width})`, easing: 'cubic-bezier(.35, 0, .22, 1)' },
          { transform: `translate(${dx * .42 + clamp(vx * 20, -18, 18)}px, ${dy * .45 - lift * .65 + clamp(vy * 20, -14, 14)}px) rotate(${from.angle * .4}deg)`,
            offset: .36, easing: 'ease-out' },
          { transform: `translateY(${-lift}px)`, offset: .68, easing: 'cubic-bezier(.36, .05, .6, 1)' },
          { transform: 'none' },
        ], { duration: 460, delay, fill: 'both' });
        const flight = { anim: animation };
        s16State.flights.add(flight);
        await animation.finished.catch(() => {});
        animation.cancel();
        s16State.flights.delete(flight);
      }
      if (sequence !== s16State.seqToken) return;
      s16State.returning.delete(slot);
      s16State.hiddenFlights.delete(slot);
      closeWalletWhenIdle();
      syncS16Desk();
    }

    function flyS16Card(slot, fromRect, toRect, { vx = 0, vy = 0, duration = 360, arc = -28, delay = 0, scaleFrom = 1, scaleTo = 1 } = {}) {
      if (reduced.matches || document.hidden || !fromRect || !toRect || !fromRect.width || !toRect.width) {
        return Promise.resolve();
      }
      const flyW = Math.max(fromRect.width, toRect.width, 86);
      const flyH = flyW * 328 / 520;
      const sx = fromRect.left + (fromRect.width - flyW) * .5;
      const sy = fromRect.top + (fromRect.height - flyH) * .5;
      const tx = toRect.left + (toRect.width - flyW) * .5;
      const ty = toRect.top + (toRect.height - flyH) * .5;
      const dx = tx - sx, dy = ty - sy;
      const mx = dx * .5 + clamp(vx * 85, -45, 45);
      const my = dy * .5 + clamp(vy * 85, -35, 35) + arc;

      const card = document.createElement('div');
      card.className = 's16-flight-card';
      card.setAttribute('aria-hidden', 'true');
      card.style.left = `${sx.toFixed(1)}px`;
      card.style.top = `${sy.toFixed(1)}px`;
      card.style.width = `${flyW.toFixed(1)}px`;
      card.style.height = `${flyH.toFixed(1)}px`;
      card.innerHTML = buildS16CardFace(slot, s16State.uids[slot], { compact: false });
      document.body.append(card);

      const token = { el: card, anim: null };
      s16State.flights.add(token);
      const anim = card.animate([
        { transform: `translate(0px, 0px) scale(${scaleFrom}) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) scale(${((scaleFrom + scaleTo) * .54).toFixed(3)}) rotate(${dx >= 0 ? 7 : -7}deg)`, opacity: 1, offset: .48 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scaleTo}) rotate(${dx >= 0 ? -3 : 4}deg)`, opacity: scaleTo < .75 ? .92 : 1 },
      ], { duration, delay, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' });
      token.anim = anim;
      return Promise.race([
        anim.finished.catch(() => {}),
        new Promise(resolve => setTimeout(resolve, duration + delay + 80)),
      ]).finally(() => {
        anim.cancel();
        s16State.flights.delete(token);
        card.remove();
      });
    }

    async function dealCardFromWallet(slot) {
      if (s16State.placed.includes(slot)) return;
      const token = s16State.seqToken;
      const slotNode = walletSlots?.querySelector(`.s16-slot[data-slot="${slot}"]`);
      const tuckedNode = slotNode?.querySelector('.s16-tucked-card') || slotNode;
      const fromRect = tuckedNode?.getBoundingClientRect();
      s16State.placed.push(slot);
      syncS16Desk(s16State.winnerRow, s16State.hasClash);
      const targetNode = padCards?.querySelector(`.s16-pad-card[data-slot="${slot}"]`);
      const toRect = targetNode?.getBoundingClientRect();
      s16State.hiddenFlights.add(slot);
      targetNode?.classList.add('is-hidden-flight');
      if (walletBtn) walletBtn.dataset.open = 'true';
      s16.dirty = true;
      await flyS16Card(slot, fromRect, toRect, { duration: 380, arc: -28, scaleFrom: .56, scaleTo: 1 });
      if (token !== s16State.seqToken) return;
      s16State.hiddenFlights.delete(slot);
      closeWalletWhenIdle();
      syncS16Desk(s16State.winnerRow, s16State.hasClash);
      s16.dirty = true;
    }

    function returnCardToWallet(slot, from, vx = 0, vy = 0) {
      const idx = s16State.placed.indexOf(slot);
      if (idx === -1) return;
      s16State.placed.splice(idx, 1);
      void tuckS16Card(slot, from, { vx, vy });
      s16.dirty = true;
    }

    walletBtn?.addEventListener('pointerdown', event => {
      if (s16State.busy || !event.isPrimary || event.button !== 0) return;
      const slotEl = event.target.closest?.('.s16-slot');
      const picked = slotEl ? +slotEl.dataset.slot : -1;
      const slot = (picked >= 0 && walletHasCard(picked))
        ? picked
        : [0, 1, 2].find(walletHasCard);
      if (slot === undefined) return;
      walletDrag = {
        id: event.pointerId,
        slot,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        ghost: null,
        cardW: 108,
        cardH: 68,
      };
      walletBtn.setPointerCapture?.(event.pointerId);
    });

    addEventListener('pointermove', event => {
      if (!walletDrag || event.pointerId !== walletDrag.id) return;
      const dx = event.clientX - walletDrag.startX;
      const dy = event.clientY - walletDrag.startY;
      if (!walletDrag.active) {
        if (Math.hypot(dx, dy) < 7) return;
        walletDrag.active = true;
        s16State.hiddenFlights.add(walletDrag.slot);
        syncS16Desk(s16State.winnerRow, s16State.hasClash);
        walletBtn.dataset.open = 'true';
        const sample = padCards?.querySelector('.s16-pad-card')?.getBoundingClientRect();
        const cardW = sample?.width || 108;
        const cardH = cardW * 328 / 520;
        walletDrag.cardW = cardW;
        walletDrag.cardH = cardH;
        const ghost = document.createElement('div');
        ghost.className = 's16-flight-card';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.zIndex = '25';
        ghost.style.width = `${cardW.toFixed(1)}px`;
        ghost.style.height = `${cardH.toFixed(1)}px`;
        ghost.innerHTML = buildS16CardFace(walletDrag.slot, s16State.uids[walletDrag.slot], { compact: false });
        document.body.append(ghost);
        walletDrag.ghost = ghost;
      }
      const tilt = clamp(dx * .07, -14, 14);
      const gx = event.clientX - walletDrag.cardW * .5;
      const gy = event.clientY - walletDrag.cardH * .5;
      walletDrag.ghost.style.left = `${gx.toFixed(1)}px`;
      walletDrag.ghost.style.top = `${gy.toFixed(1)}px`;
      walletDrag.ghost.style.transform = `rotate(${tilt.toFixed(1)}deg) scale(1.04)`;
      if (fieldZone) {
        if (isOverReaderDrop(event.clientX, event.clientY)) fieldZone.dataset.dropTarget = 'true';
        else delete fieldZone.dataset.dropTarget;
      }
    });

    for (const name of ['pointerup', 'pointercancel']) {
      addEventListener(name, async event => {
        if (!walletDrag || event.pointerId !== walletDrag.id) return;
        const ended = walletDrag;
        walletDrag = null;
        if (fieldZone) delete fieldZone.dataset.dropTarget;
        if (!ended.active) return;

        suppressWalletClick = true;
        setTimeout(() => { suppressWalletClick = false; }, 0);
        const fromRect = ended.ghost?.getBoundingClientRect();
        const from = ended.ghost && cardPose(ended.ghost);
        ended.ghost?.remove();
        const token = s16State.seqToken;

        if (event.type === 'pointerup' && isOverReaderDrop(event.clientX, event.clientY)) {
          s16State.placed.push(ended.slot);
          syncS16Desk(s16State.winnerRow, s16State.hasClash);
          const targetNode = padCards?.querySelector(`.s16-pad-card[data-slot="${ended.slot}"]`);
          const toRect = targetNode?.getBoundingClientRect();
          targetNode?.classList.add('is-hidden-flight');
          s16.dirty = true;
          await flyS16Card(ended.slot, fromRect, toRect, { duration: 240, arc: -10, scaleFrom: 1.04, scaleTo: 1 });
          if (token !== s16State.seqToken) return;
          s16State.hiddenFlights.delete(ended.slot);
          closeWalletWhenIdle();
          syncS16Desk(s16State.winnerRow, s16State.hasClash);
          s16.dirty = true;
        } else {
          void tuckS16Card(ended.slot, from);
        }
      });
    }

    walletBtn?.addEventListener('click', () => {
      if (suppressWalletClick) {
        suppressWalletClick = false;
        return;
      }
      if (s16State.busy) return;
      const slot = [0, 1, 2].find(walletHasCard);
      if (slot === undefined) {
        if (!s16State.returning.size && !s16State.hiddenFlights.size && !reduced.matches && !document.hidden) {
          walletBtn.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(4px)' },
            { transform: 'none' },
          ], { duration: 240, easing: 'ease-out' });
        }
        return;
      }
      void dealCardFromWallet(slot);
    });

    if (padCards) {
      padCards.addEventListener('pointerdown', event => {
        if (s16State.busy || !event.isPrimary || event.button !== 0) return;
        const card = event.target.closest?.('.s16-pad-card');
        if (!card) return;
        const slot = +card.dataset.slot;
        s16State.draggingSlot = slot;
        drag = {
          id: event.pointerId,
          slot,
          card,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          lastT: performance.now(),
          vx: 0,
          vy: 0,
        };
        card.classList.add('is-dragging');
        padCards.setPointerCapture?.(event.pointerId);
      });

      addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        const now = performance.now();
        const dt = Math.max(8, now - drag.lastT);
        drag.vx = (event.clientX - drag.lastX) / dt;
        drag.vy = (event.clientY - drag.lastY) / dt;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        drag.lastT = now;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const tilt = clamp(dx * .09, -18, 18);
        drag.card.style.transform = `translate(calc(-50% + var(--sx, 0px) + ${dx.toFixed(1)}px), calc(-50% + var(--sy, 0px) + ${dy.toFixed(1)}px)) rotate(calc(var(--sr, 0deg) + ${tilt.toFixed(1)}deg)) scale(1.04)`;
        if (walletBtn) {
          if (Math.hypot(dx, dy) > 52) walletBtn.dataset.catching = 'true';
          else delete walletBtn.dataset.catching;
        }
      });

      for (const name of ['pointerup', 'pointercancel']) {
        addEventListener(name, event => {
          if (!drag || event.pointerId !== drag.id) return;
          const ended = drag;
          drag = null;
          s16State.draggingSlot = -1;
          ended.card.classList.remove('is-dragging');
          if (walletBtn) delete walletBtn.dataset.catching;
          const dx = event.clientX - ended.startX;
          const dy = event.clientY - ended.startY;
          const dist = Math.hypot(dx, dy);
          const speed = Math.hypot(ended.vx, ended.vy);
          const toss = event.type === 'pointerup' && (dist > 62 || (speed > .36 && dist > 24));
          if (toss) {
            returnCardToWallet(ended.slot, cardPose(ended.card), ended.vx, ended.vy);
          } else {
            ended.card.style.removeProperty('transform');
          }
        });
      }

      padCards.addEventListener('keydown', event => {
        if (s16State.busy || event.altKey || event.ctrlKey || event.metaKey) return;
        const card = event.target.closest?.('.s16-pad-card');
        if (!card) return;
        if (['Backspace', 'Delete', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
          returnCardToWallet(+card.dataset.slot, cardPose(card));
          walletBtn.focus({ preventScroll: true });
        }
      });
    }

    tapBtn?.addEventListener('click', async () => {
      if (s16State.busy || s16State.returning.size || s16State.hiddenFlights.size || drag || walletDrag) return;
      const targetCount = s16State.placed.length ? s16State.placed.length : 2;
      if (reduced.matches || document.hidden || !walletBtn) {
        s16State.seed++;
        s16State.uids = rollS16Uids(s16State.seed);
        s16State.placed = [0, 1, 2].slice(0, targetCount);
        syncS16Desk(-1, false);
        s16.dirty = true;
        return;
      }

      const token = s16State.seqToken;
      s16State.busy = true;
      walletBtn.dataset.open = 'true';

      const recallList = s16State.placed.map(slot => {
        const card = padCards?.querySelector(`.s16-pad-card[data-slot="${slot}"]`);
        return { slot, from: card && cardPose(card) };
      });
      s16State.placed = [];
      s16.dirty = true;

      await Promise.all(recallList.map((item, i) => tuckS16Card(item.slot, item.from, { delay: i * 45 })));
      if (token !== s16State.seqToken) return;

      s16State.hiddenFlights.clear();
      syncS16Desk(-1, false);
      delete walletBtn.dataset.open;

      const shake = walletBtn.animate([
        { transform: 'none' },
        { transform: 'rotate(-2deg) translateY(2px)', offset: .48 },
        { transform: 'none' },
      ], { duration: 300, easing: 'ease-in-out' });
      const shakeToken = { el: null, anim: shake };
      s16State.flights.add(shakeToken);
      await Promise.race([
        shake.finished.catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
      shake.cancel();
      s16State.flights.delete(shakeToken);
      if (token !== s16State.seqToken) return;

      s16State.seed++;
      s16State.uids = rollS16Uids(s16State.seed);
      const freshSlots = [0, 1, 2].slice(0, targetCount);
      walletBtn.dataset.open = 'true';
      const dealFromRects = freshSlots.map(slot => {
        const node = walletSlots?.querySelector(`.s16-slot[data-slot="${slot}"] .s16-tucked-card`)
          || walletSlots?.querySelector(`.s16-slot[data-slot="${slot}"]`);
        return node?.getBoundingClientRect();
      });

      s16State.placed = freshSlots;
      syncS16Desk(-1, false);
      const targetRects = freshSlots.map(slot => padCards?.querySelector(`.s16-pad-card[data-slot="${slot}"]`)?.getBoundingClientRect());
      for (const slot of freshSlots) {
        s16State.hiddenFlights.add(slot);
        padCards?.querySelector(`.s16-pad-card[data-slot="${slot}"]`)?.classList.add('is-hidden-flight');
      }
      s16.dirty = true;

      await Promise.all(freshSlots.map((slot, i) =>
        flyS16Card(slot, dealFromRects[i], targetRects[i], { duration: 380, delay: i * 85, arc: -28, scaleFrom: .56, scaleTo: 1 })
          .then(() => {
            if (token !== s16State.seqToken) return;
            s16State.hiddenFlights.delete(slot);
            syncS16Desk(s16State.winnerRow, s16State.hasClash);
          })
      ));
      if (token !== s16State.seqToken) return;
      delete walletBtn.dataset.open;
      s16State.busy = false;
      syncS16Desk(s16State.winnerRow, s16State.hasClash);
      s16.dirty = true;
    });

    for (const ev of ['resize', 'hashchange', 'pagehide']) addEventListener(ev, cancelS16Animations);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelS16Animations(); });
    reduced.addEventListener('change', () => { if (reduced.matches) cancelS16Animations(); });
  }

  // ---------- 17. Why your phone can't read your car key ----------
  let s17Anim = null;
  const s17ReaderPulse = document.getElementById('s17-reader-pulse');
  plate('s17', p => {
    const readerKey = p.radio('reader') || 'phone', tagKey = p.radio('tag') || 'key';
    const R = physics.READERS[readerKey], T = physics.TAGS[tagKey];
    const opts = { tag: tagKey, reader: readerKey, distance: .01 };
    const s = physics.solve(opts);
    const sweep = physics.sweep(opts, 30e3, 60e6, 300);

    p.el.querySelector('#s17-reader-pill')?.style.setProperty('--s17-pill-index', readerKey === 'phone' ? '0' : '1');
    p.el.querySelector('#s17-tag-pill')?.style.setProperty('--s17-pill-index', tagKey === 'key' ? '0' : '1');
    const rOut = p.el.querySelector('#s17-reader-freq'), tOut = p.el.querySelector('#s17-tag-freq');
    if (rOut) rOut.textContent = readerKey === 'phone' ? '13.56 MHz' : '125 kHz';
    if (tOut) tOut.textContent = tagKey === 'key' ? '125 kHz' : '13.56 MHz';

    const target = {
      key: `${readerKey}:${tagKey}`,
      freq: R.frequency,
      wake: T.wake,
      sweep,
      volts: s.rawVolts,
      awake: s.awake,
      readerLabel: (readerKey === 'phone' ? 'The phone' : 'The car') + ' flips here',
      tagName: tagKey === 'key' ? 'key' : 'card',
    };

    const now = performance.now();
    if (!s17Anim || reduced.matches || document.hidden) {
      s17Anim = { from: target, to: target, started: now - 300, active: false };
    } else if (s17Anim.to.key !== target.key) {
      s17Anim = { from: s17Anim.current || s17Anim.to, to: target, started: now, active: true };
    }

    const rawT = s17Anim.active ? Math.min(1, (now - s17Anim.started) / 260) : 1;
    const easeT = rawT * rawT * (3 - 2 * rawT);
    const A = s17Anim.from, B = s17Anim.to;
    const curFreq = Math.pow(10, Math.log10(A.freq) + (Math.log10(B.freq) - Math.log10(A.freq)) * easeT);
    const curWake = A.wake + (B.wake - A.wake) * easeT;
    const curVolts = Math.pow(10, Math.log10(Math.max(A.volts, 1e-4)) + (Math.log10(Math.max(B.volts, 1e-4)) - Math.log10(Math.max(A.volts, 1e-4))) * easeT);
    const curSweep = B.sweep.map(([f, v], idx) => [f, (A.sweep[idx]?.[1] ?? v) + (v - (A.sweep[idx]?.[1] ?? v)) * easeT]);
    s17Anim.current = { key: B.key, freq: curFreq, wake: curWake, sweep: curSweep, volts: curVolts, awake: B.awake };

    const ctx = fit(p), bx = box(p, 26, 44);
    const top = Math.max(...curSweep.map(([, v]) => v)) * 1.15;
    const a = chart(ctx, bx, { from: 30e3, to: 60e6, log: true, ticks: [[125e3, '125 kHz'], [1e6, '1 MHz'], [13.56e6, '13.56 MHz']], label: 'Frequency' },
      { from: 1e-3, to: Math.max(top, 10), log: true, ticks: [[1e-3, '1 mV'], [.1, '0.1 V'], [10, '10 V']], label: `The ${B.tagName}’s chip would get` });
    curve(ctx, curSweep.map(([f, v]) => [f, Math.max(v, 1e-3)]), a.X, a.Y, COPPER, 2);
    vline(ctx, a.X(curFreq), bx.y, bx.y + bx.h, INK, B.readerLabel);
    hline(ctx, a.Y(curWake), bx.x, bx.x + bx.w, GREEN, 'Wake-up');
    const markerX = a.X(curFreq), markerY = a.Y(Math.max(curVolts, 1e-3));
    dot(ctx, markerX, markerY, s.awake ? GREEN : RED);
    if (s17ReaderPulse) {
      s17ReaderPulse.style.left = `${markerX}px`;
      s17ReaderPulse.style.top = `${markerY}px`;
      s17ReaderPulse.hidden = false;
    }
    p.say(`${readerKey === 'phone' ? 'The phone' : 'The car’s reader'} gives the ${B.tagName}’s chip ${si(s.rawVolts, 'V', 2)}. It needs ${T.wake} V. ${s.awake ? 'Awake.' : 'Nothing happens.'}`);
    if (rawT < 1) p.dirty = true;
    else s17Anim.active = false;
  });

  // ---------- 18. Passive vs. active: what a battery changes ----------
  const s18DistFromSlider = v => .01 * Math.pow(10, 4 * (v / 1000));
  const s18FormatDist = m => m < .1 ? `${(m * 100).toFixed(1)} cm`
    : m < 1 ? `${Math.round(m * 100)} cm`
    : m < 10 ? `${m.toFixed(1)} m`
    : `${Math.round(m)} m`;
  const s18SampleDistances = Array.from({ length: 141 }, (_, i) => s18DistFromSlider(i * 1000 / 140));
  const s18PassiveCurve = s18SampleDistances.map(d => {
    const r = physics.solve({ tag: 'card', reader: 'pad', distance: d });
    const db = 20 * Math.log10(Math.max(r.rawVolts, 1e-6) / r.wake);
    return [d, clamp(db, -60, 90)];
  });
  const s18ActiveCurve = s18SampleDistances.map(d => {
    const a = physics.activeLink(d);
    return [d, clamp(a.marginDb, -60, 90)];
  });
  const s18ReaderPulse = document.getElementById('s18-reader-pulse');

  plate('s18', p => {
    p.time += p.dt || 0;
    const distInput = p.input('distance'), fieldInput = p.input('field'), batteryInput = p.input('battery');
    const sliderVal = Number(distInput?.value ?? 75);
    const d = s18DistFromSlider(sliderVal);
    const fieldOn = !!fieldInput?.checked;
    const batteryOn = !!batteryInput?.checked;
    const distText = s18FormatDist(d);

    p.out('distance', distText);
    distInput?.setAttribute('aria-valuetext', distText);
    const fieldState = p.el.querySelector('#s18-field-state');
    if (fieldState) {
      fieldState.textContent = fieldOn ? 'On' : 'Off';
      fieldState.toggleAttribute('data-off', !fieldOn);
    }
    const batteryState = p.el.querySelector('#s18-battery-state');
    if (batteryState) {
      batteryState.textContent = batteryOn ? 'On' : 'Off';
      batteryState.toggleAttribute('data-off', !batteryOn);
    }

    const passive = physics.solve({ tag: 'card', reader: 'pad', distance: d, drive: fieldOn ? 1 : 0 });
    const active = physics.activeLink(d, { batteryOn });
    const passiveMargin = fieldOn ? 20 * Math.log10(Math.max(passive.rawVolts, 1e-6) / passive.wake) : -60;

    const ctx = fit(p);
    const bandY = 4, bandH = clamp(Math.round(p.h * .37), 108, 146), laneGap = 8;
    const laneH = (bandH - laneGap) / 2;
    const laneX = 8, laneW = p.w - 16;
    const readerX = laneX + 26;
    const tagMinX = readerX + 52, tagMaxX = laneX + laneW - 28;
    const tagX = tagMinX + (tagMaxX - tagMinX) * (sliderVal / 1000);

    function drawLane(y, { title, status, statusColor, activeColor, waveDir, waveOn, waveActive, strength, kind }) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 254, 250, .48)';
      ctx.strokeStyle = 'rgba(13, 13, 12, .12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(laneX, y, laneW, laneH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = `600 11px ${SANS}`;
      ctx.fillStyle = activeColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, laneX + 10, y + 7);

      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = statusColor;
      ctx.textAlign = 'right';
      ctx.fillText(status, laneX + laneW - 10, y + 7);

      const cy = y + laneH * .66;

      // Reader side icon
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      if (kind === 'passive') {
        ctx.beginPath();
        ctx.roundRect(readerX - 11, cy - 10, 22, 20, 4);
        ctx.stroke();
        ctx.strokeStyle = fieldOn ? COPPER : MUTED;
        ctx.beginPath();
        ctx.arc(readerX, cy, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(readerX - 6, cy + 10);
        ctx.lineTo(readerX + 6, cy + 10);
        ctx.moveTo(readerX, cy + 10);
        ctx.lineTo(readerX, cy - 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(readerX, cy - 8, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }

      // Animated waves between reader and tag
      const span = Math.max(18, tagX - 16 - (readerX + 14));
      if (waveOn) {
        for (let i = 0; i < 3; i++) {
          const prog = ((p.time * (kind === 'passive' ? .85 : 1.05)) + i / 3) % 1;
          const x = waveDir > 0
            ? readerX + 14 + prog * span
            : tagX - 16 - prog * span;
          const fade = Math.sin(prog * Math.PI);
          const alpha = fade * (kind === 'passive' ? Math.max(.18, strength) : (waveActive ? .85 : .35));
          ctx.save();
          ctx.strokeStyle = kind === 'passive' ? COPPER : (waveActive ? INK : RED);
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          const r = 6 + prog * 7;
          if (waveDir > 0) ctx.arc(x - r * .55, cy, r, -Math.PI * .34, Math.PI * .34);
          else ctx.arc(x + r * .55, cy, r, Math.PI * .66, Math.PI * 1.34);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (kind === 'passive' && waveActive) {
        for (let i = 0; i < 2; i++) {
          const prog = ((p.time * 1.15) + i / 2) % 1;
          const x = tagX - 16 - prog * span;
          ctx.save();
          ctx.strokeStyle = GREEN;
          ctx.globalAlpha = Math.sin(prog * Math.PI) * .72;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x + 5, cy, 7, Math.PI * .68, Math.PI * 1.32);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Tag side icon
      if (kind === 'passive') {
        ctx.fillStyle = '#f5f2ec';
        ctx.strokeStyle = passive.awake ? GREEN : (fieldOn ? COPPER : MUTED);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tagX - 14, cy - 9, 28, 18, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = passive.awake ? GREEN : MUTED;
        ctx.fillRect(tagX - 3, cy - 3, 6, 6);
      } else {
        ctx.fillStyle = '#f5f2ec';
        ctx.strokeStyle = batteryOn ? INK : RED;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tagX - 14, cy - 9, 28, 18, 3);
        ctx.fill();
        ctx.stroke();
        // Drawn battery cell inside active tag
        ctx.fillStyle = batteryOn ? GREEN : 'transparent';
        ctx.strokeStyle = batteryOn ? GREEN : RED;
        ctx.lineWidth = 1.2;
        ctx.fillRect(tagX - 7, cy - 4, 11, 8);
        ctx.strokeRect(tagX - 7, cy - 4, 11, 8);
        ctx.fillRect(tagX + 4, cy - 2, 2.5, 4);
        // Tiny TX antenna
        ctx.strokeStyle = batteryOn ? INK : MUTED;
        ctx.beginPath();
        ctx.moveTo(tagX + 10, cy - 9);
        ctx.lineTo(tagX + 10, cy - 14);
        ctx.stroke();
      }
      ctx.restore();
    }

    const passiveVolts = passive.awake ? passive.chipVolts : passive.rawVolts;
    const passiveVoltsText = passiveVolts < 1e-4 ? '< 0.1 mV' : si(passiveVolts, 'V', 2);
    const passiveStrength = fieldOn ? clamp((passiveMargin + 40) / 80, .15, 1) : 0;
    drawLane(bandY, {
      title: 'Passive · 13.56 MHz · no battery',
      status: !fieldOn ? 'Field off · 0 V' : passive.awake ? `Awake · ${passiveVoltsText}` : `Asleep · ${passiveVoltsText}`,
      statusColor: !fieldOn ? MUTED : passive.awake ? GREEN : RED,
      activeColor: COPPER,
      waveDir: 1,
      waveOn: fieldOn,
      waveActive: passive.awake,
      strength: passiveStrength,
      kind: 'passive',
    });
    drawLane(bandY + laneH + laneGap, {
      title: 'Active · 2.45 GHz · 3 V battery',
      status: !batteryOn ? 'Battery off' : active.readable ? `Readable · ${active.rxDbm.toFixed(0)} dBm` : `Out of range · ${active.rxDbm.toFixed(0)} dBm`,
      statusColor: !batteryOn ? RED : active.readable ? GREEN : RED,
      activeColor: INK,
      waveDir: -1,
      waveOn: batteryOn,
      waveActive: active.readable,
      strength: 1,
      kind: 'active',
    });

    // Lower shared log-distance margin chart
    const bx = box(p, bandY + bandH + 26, 36, 52, 16);
    const a = chart(ctx, bx,
      { from: .01, to: 100, log: true, ticks: [[.01, '1 cm'], [.1, '10 cm'], [1, '1 m'], [10, '10 m'], [100, '100 m']], label: 'Distance' },
      { from: -60, to: 90, ticks: [[-60, '−60'], [-30, '−30'], [0, '0 dB'], [45, '+45'], [90, '+90']], label: 'Signal margin' });

    hline(ctx, a.Y(0), bx.x, bx.x + bx.w, GREEN);
    curve(ctx, s18ActiveCurve, a.X, a.Y, batteryOn ? INK : 'rgba(13, 13, 12, .24)', 2.2, batteryOn ? [] : [4, 4]);
    curve(ctx, s18PassiveCurve, a.X, a.Y, fieldOn ? COPPER : 'rgba(184, 101, 42, .28)', 2.2, fieldOn ? [] : [4, 4]);

    // Direct curve and threshold labels (placed cleanly in open space)
    ctx.save();
    ctx.font = `600 11px ${SANS}`;
    ctx.fillStyle = GREEN;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('Working threshold', bx.x + bx.w - 2, a.Y(0) + 5);
    ctx.fillStyle = batteryOn ? INK : MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Active · 1/d²', a.X(1.2), a.Y(clamp(physics.activeLink(1.2).marginDb, -55, 84)) - 8);
    ctx.fillStyle = fieldOn ? COPPER : MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Passive · 1/d³', a.X(.28), a.Y(-24));
    ctx.restore();

    const curX = a.X(d);
    vline(ctx, curX, bx.y, bx.y + bx.h, MUTED);
    const pPlotY = a.Y(clamp(fieldOn ? passiveMargin : -58, -58, 88));
    const aPlotY = a.Y(clamp(batteryOn ? active.marginDb : -58, -58, 88));
    dot(ctx, curX, pPlotY, fieldOn && passive.awake ? GREEN : RED, 4.5);
    dot(ctx, curX, aPlotY, batteryOn && active.readable ? GREEN : RED, 4.5);

    if (s18ReaderPulse) {
      s18ReaderPulse.style.left = `${curX}px`;
      s18ReaderPulse.style.top = `${aPlotY}px`;
      s18ReaderPulse.hidden = false;
    }

    if (!fieldOn && !batteryOn) {
      p.say('Both power sources are off. Neither tag can answer.');
    } else if (!fieldOn) {
      p.say(`At ${distText} with reader’s field off: passive card gets 0 V (no power); active tag still broadcasts at ${active.rxDbm.toFixed(0)} dBm on its battery.`);
    } else if (!batteryOn) {
      p.say(`At ${distText} with active battery off: passive card gets ${passiveVoltsText} (${passive.awake ? 'awake' : 'too far'}); active tag is silent.`);
    } else {
      p.say(`At ${distText}: passive card gets ${passiveVoltsText} (${passive.awake ? 'awake' : 'too far'}); active tag signal is ${active.rxDbm.toFixed(0)} dBm (${active.readable ? 'readable' : 'too far'}).`);
    }
  }, { animate: true });

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
