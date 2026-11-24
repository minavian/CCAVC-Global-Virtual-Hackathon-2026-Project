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
  const closer = plate('s6', p => {
    const distance = p.input('distance'), coil = p.input('radius');
    const d = distance.valueAsNumber / 1000, r = coil.valueAsNumber / 1000;
    const distanceText = cm(d), coilText = (2 * r * 100).toFixed(1) + ' cm across';
    p.out('distance', distanceText); p.out('radius', coilText);
    distance.setAttribute('aria-valuetext', distanceText);
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
    p.el.style.setProperty('--card-distance', (distance.valueAsNumber - Number(distance.min)) / (distance.max - distance.min));
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
  if (closer) closer.canvas.setReveal = progress => {
    if (closer.reveal === progress) return;
    closer.reveal = progress;
    closer.dirty = true;
  };

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
    const handoffPlots = drawHandoff || drawOutgoingHandoff ? [] : null;
    for (const [bx, label, fn, color] of [
      [B, 'The field through the coil', t => f === 0 ? .7 : Math.sin(t), INK],
      [V, 'The voltage it makes', t => f === 0 ? 0 : vAmp * Math.cos(t), COPPER]]) {
      const yAt = u => .5 - fn(ph - u * Math.PI * 4) * .45;
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(bx.x, bx.y + bx.h / 2); ctx.lineTo(bx.x + bx.w, bx.y + bx.h / 2); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(label, bx.x, bx.y - 6);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200, x = bx.x + u * bx.w, y = bx.y + yAt(u) * bx.h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      handoffPlots?.push({ box: bx, yAt, color });
    }
    drawHandoff?.(handoffPlots);
    drawOutgoingHandoff?.(handoffPlots);
    ctx.fillStyle = MUTED; ctx.font = `500 11px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('Slowed down. Voltage height uses a log scale.', p.w - 18, p.h - 18);
    p.say(f === 0 ? 'A still magnet: the field is there, but nothing changes, so the coil makes 0 V.'
      : `Flipping ${si(f, 'Hz', 3)}: the coil makes ${si(s.emf, 'V', 2)}. ${s.emf >= 3 ? 'Plenty for the chip.' : 'The chip needs about 2 V.'}`);
  }, { animate: true });

  // ---------- 8. The tuning trick ----------
  plate('s8', p => {
    const which = p.radio('tag') || 'card', T = physics.TAGS[which];
    const cap = p.input('cap'), removed = p.input('remove').checked;
    const setting = cap.valueAsNumber / Number(cap.max);
    const C = removed ? 0 : T.capacitance * (setting * 2);
    const capText = removed ? 'taken out' : si(C, 'F', 3);
    cap.disabled = removed;
    cap.setAttribute('aria-valuetext', capText);
    p.out('cap', capText);
    p.el.style.setProperty('--s8-cap-size', .62 + setting * .48);
    const readerKey = which === 'key' ? 'key' : 'pad', d = which === 'key' ? .025 : .03;
    const opts = { tag: which, reader: readerKey, distance: d, capacitance: C };
    const f0 = T.frequency, ctx = fit(p), bx = box(p, 26, 44, 54, 28);
    const curveNow = physics.sweep(opts, f0 / 4, f0 * 4, 220), tuned = physics.sweep({ ...opts, capacitance: T.capacitance }, f0 / 4, f0 * 4, 220);
    const top = Math.max(...tuned.map(([, v]) => v)) * 1.12;
    const fmt = v => si(v, 'Hz', 3);
    const a = chart(ctx, bx, { from: f0 / 4, to: f0 * 4, log: true, ticks: [f0 / 4, f0 / 2, f0, f0 * 2, f0 * 4].map(v => [v, fmt(v)]), label: 'If the reader’s field flipped at…' },
      { from: 0, to: top, ticks: [0, top / 2, top].map(v => [v, v.toFixed(1) + ' V']), label: 'Volts at the chip' });
    curve(ctx, tuned, a.X, a.Y, FAINT, 1.5, [5, 5]);
    curve(ctx, curveNow, a.X, a.Y, COPPER, 2.2);
    p.canvas.resonanceCurve = { box: bx, points: curveNow, X: a.X, Y: a.Y, color: COPPER };
    vline(ctx, a.X(f0), bx.y, bx.y + bx.h, INK, 'The reader: ' + fmt(f0));
    const s = physics.solve(opts);
    hline(ctx, a.Y(s.wake), bx.x, bx.x + bx.w, GREEN, 'Wake-up');
    dot(ctx, a.X(f0), a.Y(Math.min(s.rawVolts, top)), s.awake ? GREEN : RED);
    const r = physics.range({ tag: which, reader: readerKey, capacitance: C }), r0 = physics.range({ tag: which, reader: readerKey });
    const tunedRight = Math.abs(r - r0) < .0005;
    const tuning = removed ? 'Without its capacitor' : C === 0 ? 'At 0 F' : 'Tuned to ' + fmt(s.resonance);
    p.say(`${tuning}, the ${which === 'key' ? 'key' : 'card'} works up to ${cm(r)} away${tunedRight ? '.' : ` (${cm(r0)} when tuned right).`}`);
  });

  // ---------- 9. Why metal fights back ----------
  function traceField(coils, seeds, limit) {
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
        const nz = z + hz2 / m2 * st;
        if (z > 0 && nz <= 0 || z < 0 && nz >= 0) crossed++;
        rho += hr2 / m2 * st; z = nz;
        pts.push([rho, z]);
        if (crossed >= 2 || !limit(rho, z)) break;
      }
      return pts;
    });
  }
  function setupMetal(figure) {
    const metal = document.getElementById('s9-metal'), action = document.getElementById('s9-metal-action');
    const distance = document.getElementById('s9-distance'), chip = document.getElementById('s9-chip');
    const strength = document.getElementById('s9-strength'), tuning = document.getElementById('s9-tuning');
    const park = 61, restY = 68, d = .02, a = physics.READERS.pad.radius;
    const card = physics.TAGS.card.radius;
    let value = park, model, scale, coilY, metalY = restY, pointer = null, grabOffset;
    const heightAt = mm => coilY - (d + mm / 1000) * scale;

    function positionMetal(y = value === park ? restY : heightAt(value)) {
      metalY = y;
      metal.style.setProperty('--s9-metal-y', `${y}px`);
    }

    function setGap(mm) {
      if (mm === value) return;
      value = mm;
      const label = mm === park ? 'No metal' : `Metal ${mm} mm behind the card`;
      metal.setAttribute('aria-valuenow', mm);
      metal.setAttribute('aria-valuetext', label);
      distance.textContent = label;
      action.textContent = mm === park ? 'Bring metal closer' : 'Move metal away';
      figure.classList.toggle('has-metal', mm !== park);
      scene.dirty = true;
    }

    const scene = plate('s9', p => {
      if (model?.value !== value) {
        const gap = value === park ? null : value / 1000;
        const coils = [[a, 1, 0]];
        if (gap !== null) coils.push([a, -1, 2 * (d + gap)]);
        const paths = traceField(coils, [.3, .5, .68, .82, .93].map(f => [f * a, 0]),
          (rho, z) => Math.abs(rho) < .09 && z > -.03 && z < .1 && (gap === null || z < d + gap));
        const lines = paths.map(points => {
          const through = points.some(([rho, z], i) => i > 0 && (points[i - 1][1] - d) * (z - d) <= 0 && Math.abs(rho) < card);
          return { points, color: through ? COPPER : FAINT };
        });
        model = { value, lines };
        const s = physics.solve({ tag: 'card', reader: 'pad', distance: d, metal: gap });
        strength.textContent = `${s.field.toFixed(2)} A/m`;
        tuning.textContent = si(s.resonance, 'Hz', 4);
        const state = s.awake ? 'Chip awake' : 'Chip asleep';
        if (chip.textContent !== state) chip.textContent = state;
        chip.dataset.awake = s.awake;
      }

      const ctx = fit(p), k = Math.min(p.w / .2, p.h / .15);
      coilY = p.h - 34;
      // Leave room above the first field line for the parked metal and its cue.
      scale = (coilY - 88) / .1;
      const X = rho => p.w / 2 + rho * k, Y = z => coilY - z * scale;
      const { lines } = model;
      p.canvas.metalField = { lines, X, Y };
      for (const { points, color } of lines) {
        for (const side of [-1, 1]) curve(ctx, points, rho => X(side * rho), Y, color, 1.4);
      }

      for (const side of [-1, 1]) dot(ctx, X(side * a), Y(0), INK, 4);
      ctx.fillStyle = 'rgba(184, 101, 42, .25)'; ctx.fillRect(X(-card), Y(d) - 3, X(card) - X(-card), 6);
      ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('Card', X(card) + 6, Y(d) + 4);
      ctx.textBaseline = 'top'; ctx.fillText('Reader’s coil', X(a) + 8, Y(0) + 4);
      metal.style.setProperty('--s9-metal-width', `${.16 * k}px`);
      if (pointer === null) positionMetal();
    });

    action.addEventListener('click', () => setGap(value === park ? 1 : park));
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10, Home: 1 - park, End: park - 1 };
    metal.addEventListener('keydown', event => {
      if (!Object.hasOwn(steps, event.key)) return;
      event.preventDefault();
      setGap(clamp(value + steps[event.key], 1, park));
    });
    metal.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || !scale) return;
      metal.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      grabOffset = event.clientY - figure.getBoundingClientRect().top - metalY;
    });
    metal.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const y = clamp(event.clientY - figure.getBoundingClientRect().top - grabOffset, restY, heightAt(1));
      const mm = y < heightAt(60) ? park : clamp(Math.round(((coilY - y) / scale - d) * 1000), 1, 60);
      setGap(mm);
      positionMetal(mm === park ? y : heightAt(mm));
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      metal.addEventListener(type, event => {
        if (event.pointerId !== pointer) return;
        pointer = null;
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
  const answerMotion = { axes: 1, reveal: 1, blend: undefined };
  let answerRecording;
  function answerSamples(depth) {
    const link = channel.cardChannel([{ chip: tags.cardChip(), depth, awake: true }], { noise: .001, seed: 3 });
    link.send(iso.shortFrame(iso.REQA));
    const { begin, samples } = link.recording[0];
    return samples.subarray(begin - 64, begin + 21 * iso.BIT);
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

    const ctx = fit(p), bx = box(p, 26, 40);
    const { axes, reveal, blend = Number(checked) } = answerMotion;
    if (axes < 1) {
      const base = bx.y + bx.h;
      ctx.strokeStyle = FAINT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx.x, base - bx.h * axes); ctx.lineTo(bx.x, base);
      ctx.lineTo(bx.x + bx.w * axes, base); ctx.stroke();
      return;
    }
    const lo = 1 - 1 / z, hi = 1 + .08 / z;
    const { X, Y } = chart(ctx, bx, { from: 0, to: on.length, ticks: [[0, '0']], label: 'Time (the card answering “Here!”, about 200 µs)' },
      { from: lo, to: hi, ticks: [[1, '100%'], [lo, Math.round(lo * 100) + '%']], label: 'The reader’s coil current' });
    const previous = p.canvas.answerTrace;
    const points = previous?.zoom === zoom && previous.blend === blend ? previous.points
      : Array.from(on, (v, i) => [i, clamp(off[i] + (v - off[i]) * blend, lo, hi)]);
    const color = blend === 1 ? COPPER : blend === 0 ? INK : `color-mix(in srgb, ${COPPER} ${blend * 100}%, ${INK})`;
    // The sweep and the next scene both follow the same coordinates as the drawn trace.
    p.canvas.answerTrace = { box: bx, points, X, Y, color, zoom, blend };
    if (!reveal) return;
    ctx.save();
    if (reveal < 1) {
      ctx.beginPath(); ctx.rect(bx.x - 1, bx.y - 1, bx.w * reveal + 1, bx.h + 2); ctx.clip();
    }
    curve(ctx, points, X, Y, color, 1.2);
    ctx.restore();
  });
  if (answerScene) answerScene.canvas.setAnswerMotion = (axes, reveal, blend) => {
    if (axes === answerMotion.axes && reveal === answerMotion.reveal && blend === answerMotion.blend) return;
    Object.assign(answerMotion, { axes, reveal, blend });
    answerScene.dirty = true;
  };

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
  plate('s12', p => {
    const flicker = p.input('flicker').checked, N = 8192;
    const s = physics.solve({ tag: 'card', reader: 'pad', distance: .04 });
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
    const fs = iso.SAMPLE_RATE, spec = [];
    for (let k = -N / 2 + 1; k < N / 2; k++) {
      const j = (k + N) % N, f = k * fs / N;
      if (Math.abs(f) > 1.5e6) continue;
      spec.push([iso.CARRIER + f, 20 * Math.log10(Math.hypot(re[j], im[j]) / N + 1e-12)]);
    }
    const ctx = fit(p), stagger = p.w < 340, bx = box(p, 26, stagger ? 54 : 44, 42, 32);
    const top = Math.max(...spec.map(([, v]) => v)), floor = top - 110;
    const a = chart(ctx, bx, { from: iso.CARRIER - 1.5e6, to: iso.CARRIER + 1.5e6, ticks: [-1.5e6, -.8475e6, 0, .8475e6, 1.5e6].map(o => [iso.CARRIER + o, si(iso.CARRIER + o, 'Hz', 4)]), label: 'Pitch', stagger },
      { from: floor, to: top + 6, ticks: [[top, '0 dB'], [top - 50, '−50'], [top - 100, '−100']], label: 'Strength (decibels)' });
    const points = spec.map(([f, v]) => [f, Math.max(v, floor)]);
    // Keep the plotted bins and their canvas coordinates available for the next scene.
    p.canvas.spectrumTrace = { box: bx, points, ...a, color: INK, carrier: points[(points.length - 1) / 2], flicker };
    ctx.save(); ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h); ctx.clip();
    curve(ctx, points, a.X, a.Y, INK, 1);
    ctx.restore();
    ctx.fillStyle = INK; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('The phone’s own field', a.X(iso.CARRIER), bx.y + 12);
    if (flicker) for (const o of [-1, 1]) { ctx.fillStyle = COPPER; ctx.fillText('The card', a.X(iso.CARRIER + o * 847.5e3), a.Y(top - 38)); }
    else { ctx.fillStyle = COPPER; ctx.fillText('The card, buried here', a.X(iso.CARRIER + 2.2e5), a.Y(top - 30)); }
    p.say(flicker ? 'With the flicker, the card’s answer sits 847.5 kHz either side of the phone’s field, well clear of its noise.'
      : 'Without the flicker, the card’s answer sits right beside the phone’s huge field, inside the noise around it.');
  });

  // ---------- 13. Keeping count ----------
  let clockDrift = 7;
  const counting = plate('s13', p => {
    const letter = (p.input('letter').value || 'A').slice(0, 1), code = p.radio('code') || 'manchester';
    const drift = clockDrift / 100;
    const byte = letter.charCodeAt(0) & 0xff, sent = [...Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1), 0, 0, 0, 0, 0, 0, 0, 0];
    const H = 40;   // samples per half bit
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
    const right = read.length === sent.length && read.every((b, i) => b === sent[i]);
    const ctx = fit(p), bx = { x: 24, y: 46, w: p.w - 48, h: p.h - 120 };
    const X = i => bx.x + i / level.length * bx.w, Y = v => bx.y + bx.h - v * bx.h * .8;
    p.canvas.timingTrace = { box: bx, X, Y, sent, level, read, ticks, samplesPerBit: 2 * H, color: INK };
    ctx.font = `600 14px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    sent.forEach((b, i) => { ctx.fillStyle = i < 8 ? INK : MUTED; ctx.fillText(String(b), X((i + .5) * 2 * H), bx.y - 8); });
    ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.fillText(`“${letter}” then eight zeros`, bx.x, bx.y - 28);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
    level.forEach((v, i) => { const y = Y(v); i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); });
    ctx.stroke();
    ticks.forEach((t, i) => {
      const ok = read[i] === sent[i];
      ctx.strokeStyle = ok ? GREEN : RED; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(t), bx.y + bx.h + 6); ctx.lineTo(X(t), bx.y + bx.h + 18); ctx.stroke();
      ctx.fillStyle = ok ? GREEN : RED; ctx.font = `600 12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(read[i]), X(t), bx.y + bx.h + 22);
    });
    p.say(right ? `The reader counted all ${sent.length} bits right.`
      : `The reader counted ${read.length} bits instead of ${sent.length}: ${read.filter(b => b === 0).length} zeros where there were ${sent.filter(b => b === 0).length}.`);
  });
  const clock = counting?.el.querySelector('.s13-clock');
  if (clock) {
    const slower = counting.input('slower'), faster = counting.input('faster');
    const limit = 12;
    function showDrift() {
      counting.out('drift', clockDrift > 0 ? `+${clockDrift}% fast` : clockDrift < 0 ? `−${-clockDrift}% slow` : '0% exact');
      clock.style.setProperty('--s13-clock-angle', `${clockDrift * 7}deg`);
      slower.setAttribute('aria-disabled', clockDrift === -limit);
      faster.setAttribute('aria-disabled', clockDrift === limit);
    }
    showDrift();
    clock.addEventListener('click', event => {
      const button = event.target.closest('button[data-drift-step]');
      if (!button) return;
      const step = Number(button.dataset.driftStep);
      const next = step === 0 ? 0 : clamp(clockDrift + step, -limit, limit);
      if (next === clockDrift) return;
      clockDrift = next;
      showDrift();
      clock.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // ---------- 14. Catching mistakes ----------
  const firstSignalBit = 9, signalBitCount = 9;
  let s14seed = 1, noiseBit = null, checkedSignal, revealReplies = false, replyMotion;

  function checkSignal(checks) {
    const s = physics.solve({ tag: 'card', reader: 'pad', distance: .042 });
    const chip = tags.cardChip({ randomUid: true, seed: s14seed });
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: s.awake }], { noise: .007, seed: s14seed * 31 });
    let idReply;
    const run = reader.activate({
      send(bits) {
        const heard = link.send(bits), exchange = link.recording.at(-1);
        if (idReply || exchange.answers[0]?.name !== 'UID') return heard;
        idReply = exchange;
        if (noiseBit !== null) {
          const noise = air.gaussian(tags.random((s14seed + noiseBit + 1) * 31));
          const start = exchange.begin + (noiseBit + 1) * iso.BIT;
          // A brief disturbance drowns one bit of the first answer. The phone can still retry.
          for (let n = start; n < start + iso.BIT; n++) heard.samples[n] = 1 + (heard.samples[n] - 1) * .25 + noise() * .035;
        }
        return heard;
      },
    }, { checks });
    return { run, recording: link.recording, idReply, uid: chip.uid };
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
    const X = n => n / length * w, Y = v => clamp(h * .53 + (1 - v) * h * 7, 26, h - 7);
    const points = [];
    // Average one subcarrier cycle at a time so the dips remain legible at this scale.
    for (let n = 0; n < length; n += iso.SUB) {
      let total = 0;
      for (let k = 0; k < iso.SUB; k++) total += samples[n + k];
      const average = total / iso.SUB;
      points.push([n, average], [n + iso.SUB, average]);
    }
    const offset = noiseBit === null ? null : (noiseBit - firstSignalBit) * iso.BIT;
    ctx.fillStyle = 'rgba(179, 38, 30, .09)';
    if (offset !== null) ctx.fillRect(X(offset), 0, X(iso.BIT), h);
    ctx.font = `500 12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    bits.forEach((bit, i) => {
      if (i) vline(ctx, X(i * iso.BIT), 0, h, GRID, '', []);
      ctx.fillStyle = i + firstSignalBit === noiseBit ? RED : MUTED;
      ctx.fillText(String(bit), X((i + .5) * iso.BIT), 8);
    });
    curve(ctx, points, X, Y, COPPER, 1.4);
    const burst = offset === null ? [] : Array.from({ length: iso.BIT }, (_, i) => [offset + i, samples[offset + i]]);
    if (burst.length) curve(ctx, burst, X, Y, RED, 1.6);
    p.canvas.errorTrace = { box: { x: 0, y: 0, w, h }, X, Y, points, bits, burst, noiseBit, color: COPPER };
  }

  const mistakes = plate('s14', p => {
    const checks = p.input('checks').checked, key = `${s14seed}/${checks}/${noiseBit}`;
    if (key !== checkedSignal?.key) {
      checkedSignal = { key, ...checkSignal(checks) };
      const { run, idReply, uid } = checkedSignal;
      const replies = p.input('replies'), disturbance = p.input('disturbance');
      disturbance.textContent = !idReply ? 'No ID signal' : noiseBit === null ? 'No added noise' : `Your noise at bit ${noiseBit + 1}`;
      disturbance.toggleAttribute('data-active', !!idReply && noiseBit !== null);
      const retried = run.steps.find((step, i) => step.label === run.steps[i + 1]?.label);
      const retry = retried?.failed ? ' The phone retried after a failed check.' : retried ? ' The phone asked again.' : '';
      const badId = run.uid?.some((b, i) => b !== uid[i]);
      p.say((run.ok ? `ID read: ${run.uid.map(hex).join(' ')} ✓`
        : badId ? `Checks off. The phone accepted a wrong ID, ${run.uid.map(hex).join(' ')}. The card refused it.`
        : run.reason) + retry);
      replyMotion?.cancel();
      showErrorReplies(replies, checkedSignal);
      if (revealReplies && !reduced.matches && !document.hidden) replyMotion = replies.animate?.([
        { clipPath: 'inset(0 0 100% 0)', filter: 'blur(2px)', transform: 'translateY(-4px)' },
        { clipPath: 'inset(0 0 50% 0)', filter: 'blur(0)', transform: 'none', offset: .48 },
        { clipPath: 'inset(0)', filter: 'blur(0)', transform: 'none' },
      ], { duration: 350, easing: 'cubic-bezier(.19, .68, .32, 1)' });
      revealReplies = false;
    }
    drawErrorSignal(p, checkedSignal.idReply);
  });

  if (mistakes) {
    const signal = mistakes.input('signal'), middle = firstSignalBit + Math.floor(signalBitCount / 2);
    let pointer;
    function disrupt(bit) {
      const next = clamp(bit, firstSignalBit, firstSignalBit + signalBitCount - 1);
      if (next === noiseBit) return;
      noiseBit = next;
      revealReplies = false;
      mistakes.dirty = true;
    }
    function disturbAt(x) {
      const { left, width } = signal.getBoundingClientRect();
      if (width) disrupt(firstSignalBit + Math.floor((x - left) / width * signalBitCount));
    }
    signal.addEventListener('pointerdown', event => {
      if (event.isPrimary && event.button === 0) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    signal.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer?.id || !(event.buttons & 1)) return;
      const dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y);
      if (dx >= 6 && dx > dy) disturbAt(event.clientX);
    });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) signal.addEventListener(name, event => {
      if (event.pointerId === pointer?.id) pointer = null;
    });
    signal.addEventListener('click', event => {
      if (event.detail === 0) disrupt(noiseBit ?? middle);
      else disturbAt(event.clientX);
    });
    signal.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      disrupt((noiseBit ?? middle) + (event.key === 'ArrowLeft' ? -1 : 1));
    });
    mistakes.input('tap').addEventListener('click', () => {
      s14seed++;
      noiseBit = null;
      revealReplies = true;
      mistakes.dirty = true;
    });
    reduced.addEventListener('change', () => replyMotion?.cancel());
  }

  // ---------- 15. The whole conversation (the Bit River) ----------
  const river = { messages: [], started: 0, steal: false, seed: 1 };
  function conversation(p) {
    const random = p.input('random').checked;
    river.seed++;
    const chip = tags.cardChip({ randomUid: random, seed: random ? river.seed : 1 });
    const s = physics.solve({ tag: 'card', reader: 'phone', distance: .015 });
    const link = channel.cardChannel([{ chip, depth: s.dip, awake: true }], { noise: .0015, seed: river.seed });
    let stolen = false;
    const thief = {
      send(bits) {
        const heard = link.send(bits), rec = link.recording[link.recording.length - 1];
        // A stolen packet: the card's ID answer is wiped out on the air.
        if (river.steal && !stolen && rec.answers[0]?.name === 'UID') {
          stolen = true; river.steal = false;
          const g = air.gaussian(tags.random(river.seed));
          for (let i = rec.begin + 3 * iso.BIT; i < rec.begin + 20 * iso.BIT && i < heard.samples.length; i++) heard.samples[i] = 1 + g() * .05;
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
    river.messages = messages; river.started = performance.now(); river.ok = run.ok; river.uid = run.uid;
    const chat = p.el.querySelector('.chat');
    chat.innerHTML = '';
    p.say(run.ok ? `Card ${run.uid.map(hex).join(' ')} selected. ${messages.some(m => m.stolen) ? 'A packet went missing, so the phone simply asked again.' : ''}` : run.reason);
  }
  const s15 = plate('s15', p => {
    if (!river.messages.length) conversation(p);
    const ctx = fit(p), t = (performance.now() - river.started) / 1000;
    const each = reduced.matches ? 0 : 1.1, shown = reduced.matches ? river.messages.length : Math.min(river.messages.length, Math.floor(t / each) + 1);
    const left = 40, right = p.w - 40, mid = p.h / 2;
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
    // The packet in flight.
    const m = river.messages[shown - 1];
    if (m && m.from !== 'app') {
      const q = reduced.matches ? 1 : Math.min(1, (t - (shown - 1) * each) / (each * .8));
      const x = m.from === 'phone' ? left + q * (right - left) : right - q * (right - left);
      const label = m.name;
      ctx.font = `700 12px ${SANS}`;
      const w = ctx.measureText(label).width + 24;
      ctx.fillStyle = m.stolen ? RED : m.from === 'phone' ? INK : COPPER;
      ctx.beginPath(); ctx.roundRect(x - w / 2, mid - 14, w, 28, 14); ctx.fill();
      ctx.fillStyle = '#f5f2ec'; ctx.textAlign = 'center'; ctx.fillText(label, x, mid + 1);
      if (m.stolen && q > .5) { ctx.fillStyle = RED; ctx.font = `700 12px ${SANS}`; ctx.fillText('WARNING: Data packet missing!', p.w / 2, mid + 40); }
    }
    // The phone's log, as a chat.
    const chat = p.el.querySelector('.chat');
    while (chat.children.length < shown) {
      const msg = river.messages[chat.children.length], li = document.createElement('li');
      li.className = 'chat-' + msg.from + (msg.stolen ? ' is-stolen' : '');
      li.innerHTML = `<button type="button"><span>${msg.words}</span><small>${msg.name}${msg.bytes.length ? ' · ' + msg.bytes.map(hex).join(' ') : ''}</small></button>`;
      li.querySelector('button').addEventListener('click', () => li.classList.toggle('is-open'));
      chat.append(li);
    }
  }, { animate: true });
  document.getElementById('s15-tap')?.addEventListener('click', () => conversation(s15));
  document.getElementById('s15-steal')?.addEventListener('click', () => { river.steal = true; conversation(s15); });

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
