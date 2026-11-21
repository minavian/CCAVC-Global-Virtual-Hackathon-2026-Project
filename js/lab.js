/*
 * Scenes 4 and 5: the reader and the tag, live.
 *
 * Every frame, js/rfid/physics.js works out the field, the volts at the chip and the size of
 * its answer from where the tag is. When the chip is awake, it answers: the key repeats its
 * ID (js/rfid/lf.js), the card holds a whole conversation (js/rfid/reader.js). The reader's
 * signal strip shows those samples, slowed down, and the ID on the reader's display is what
 * the reader decoded from them, digit by digit. Nothing on screen is drawn from a script.
 *
 *   Scene 4  "Drag the key toward the reader."  (Scrolling also brings it closer.)
 *   Scene 5  Break it: pull it away, turn it, slide metal behind it, or swap in the card.
 *
 * landing.js calls update(dt, storyState, geometry) every frame and poses the 3D objects
 * from what it returns. geometry: { padX, padY, k (pixels per meter), tilt (radians) }.
 *
 * window.RFIDLab.create() returns { update, wanted }.
 */
(function () {
  'use strict';

  const { physics, lf, tag: tags, channel, reader, air } = window.RFID;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  const hex = b => b.toString(16).toUpperCase().padStart(2, '0');

  const APPROACH = [6.45, 7.45];            // scrolling brings the tag from far to close
  const FAR = .095, NEAR = .025;            // meters: scrolling stops the tag 2.5 cm away, close enough
                                            // to read, near enough to the edge that metal breaks it
  const METAL_GAP = .004;                   // the plate sits 4 mm behind the tag's coil
  const BIT_SECONDS = .085;                 // slowed down: one of the key's bits (512 µs) takes this long
  const CARD_SECONDS = 7;                   // one whole card conversation (about 3 ms) takes this long
  const NOISE = .0025;                      // the reader's own noise, as a fraction of its signal

  function create() {
    const $ = s => document.querySelector(s);
    const root = $('.lab'), canvas = $('.lab-canvas'), strip = $('.lab-strip canvas');
    const steps = [...root.querySelectorAll('.lab-steps li')];
    const prompt = $('.lab-prompt'), result = $('.lab-result'), idBox = $('.lab-id'), meter = $('.lab-meter');
    const meterFill = meter.querySelector('i'), meterValue = meter.querySelector('b'), meterWake = meter.querySelector('em');
    const grab = $('.lab-grab'), controls = $('.lab-controls'), ticks = [...root.querySelectorAll('.lab-ticks li')];
    const payoff = $('.lab-payoff'), freq = $('.lab-frequency');
    const inputs = {
      distance: $('#lab-distance'), angle: $('#lab-angle'), metal: $('#lab-metal'),
      key: $('#lab-tag-key'), card: $('#lab-tag-card')
    };
    const ctx = canvas.getContext('2d'), sctx = strip.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    const state = {
      tag: 'key', distance: FAR, angle: 0, metal: false, held: false, touched: false,
      jitter: 0, jitterGoal: 0, jitterClock: 0,
      found: { far: false, turned: false, metal: false }, breakSince: null, payoff: false,
      solved: null, active: false, reason: ''
    };

    // ---------- The answer, as samples ----------
    // The key repeats its message while it is awake; the samples are made one bit at a time,
    // with the dip size of that moment, and the reader's noise.
    const key = tags.keyChip();
    const message = key.message;
    const KEY_SAMPLES = lf.BIT;
    let played = [];                        // the reader's samples so far (most recent last)
    let bitClock = 0, bitIndex = 0, bitsHeard = [], idDigits = '', idOk = false, idAt = -1;
    const noise = air.gaussian(tags.random(4242));
    function playKeyBit(depth) {
      const bit = message[bitIndex % message.length];
      bitIndex++;
      for (let k = 0; k < KEY_SAMPLES; k++) {
        const closed = depth > 0 && (bit ? k < lf.HALF : k >= lf.HALF);
        played.push((closed ? 1 - depth : 1) + NOISE * noise());
      }
      if (played.length > 4 * 64 * KEY_SAMPLES) played = played.slice(-3 * 64 * KEY_SAMPLES);
      // The reader decides each bit from its own samples, then looks for a whole message.
      const n = played.length - KEY_SAMPLES;
      let a = 0, b = 0;
      for (let k = 0; k < lf.HALF; k++) { a += played[n + k]; b += played[n + lf.HALF + k]; }
      bitsHeard.push(depth > 0 ? (a < b ? 1 : 0) : null);
      if (bitsHeard.length > 200) bitsHeard = bitsHeard.slice(-130);
      readDigits();
    }
    // Digits appear as soon as their four bits (and the header before them) have been heard.
    function readDigits() {
      const bits = bitsHeard;
      let header = -1;
      for (let i = bits.length - 9; i >= 1; i--) {
        if (bits[i - 1] === 0 && bits.slice(i, i + 9).every(b => b === 1)) { header = i; break; }
      }
      if (header < 0) { if (!idOk) idDigits = ''; return; }
      let digits = '';
      for (let row = 0; row < 10; row++) {
        const at = header + 9 + row * 5;
        if (at + 4 > bits.length) break;
        const nibble = bits.slice(at, at + 4);
        if (nibble.includes(null)) break;
        digits += nibble.reduce((v, b) => v * 2 + b, 0).toString(16).toUpperCase();
      }
      // The first two digits are the version. Once an ID is confirmed, it stays on the display
      // while the next repeat streams in.
      if (!idOk) idDigits = digits.length > 2 ? digits.slice(2) : '';
      // A whole message heard: the reader checks it, from the samples alone.
      if (header + 64 <= bits.length && idAt !== header + bitIndex - bits.length) {
        const heard = reader.hearKey(Float32Array.from(played.slice(-(bits.length - header + 2) * KEY_SAMPLES)));
        if (heard.ok) { idOk = true; idAt = header + bitIndex - bits.length; idDigits = heard.id.map(hex).join(''); }
      }
    }

    // The card answers only when asked: each time it wakes, the reader runs a whole
    // conversation through the simulated air, and the strip plays its samples back.
    let card = null;                        // { samples, at (seconds played), uid, ok, uidFrom }
    const cardChip = tags.cardChip({ uid: [0x08, 0x5c, 0x1e, 0x93] });
    function startCard(depth) {
      const link = channel.cardChannel([{ chip: cardChip, depth, awake: true }], { noise: NOISE, seed: 1 + Math.floor(Math.random() * 1e6) });
      const run = reader.activate(link);
      const parts = link.recording.map(r => r.samples);
      const total = parts.reduce((a, p) => a + p.length, 0), samples = new Float32Array(total);
      let at = 0, uidFrom = Infinity;
      link.recording.forEach((r, i) => {
        samples.set(r.samples, at);
        if (run.steps[i]?.label === 'ANTICOLLISION' && run.steps[i].bytes) uidFrom = at + r.begin + 46 * 32;
        at += r.samples.length;
      });
      card = { samples, at: 0, uid: run.uid, ok: run.ok, uidFrom: Math.min(uidFrom, total) };
    }

    // ---------- Field lines ----------
    // Traced through the field of the reader's coil (and its mirror image in a metal plate),
    // computed from the loop formula, in the vertical plane through the coil's axis.
    let lines = [], linesFor = '';
    function traceLines(readerKey, d, metal) {
      const R = physics.READERS[readerKey], a = R.radius;
      const coils = [[a, 1, 0]];
      if (metal) coils.push([a, -1, 2 * (d + METAL_GAP)]);
      const field = (rho, z) => {
        let hr = 0, hz = 0;
        for (const [radius, current, z0] of coils) {
          const [r1, z1] = physics.loopField(radius, current, z0, rho, z);
          hr += r1; hz += z1;
        }
        return [hr, hz];
      };
      const out = [];
      for (const f of [.28, .5, .68, .82, .93]) {
        const pts = [[f * a, 0]];
        let rho = f * a, z = 0, crossed = 0;
        const step = .0016;
        for (let n = 0; n < 900; n++) {
          const [hr, hz] = field(rho, z), m = Math.hypot(hr, hz) || 1;
          // Midpoint step along the field direction.
          const mr = rho + hr / m * step / 2, mz = z + hz / m * step / 2;
          const [hr2, hz2] = field(mr, mz), m2 = Math.hypot(hr2, hz2) || 1;
          const nr = rho + hr2 / m2 * step, nz = z + hz2 / m2 * step;
          if (z > 0 && nz <= 0 || z < 0 && nz >= 0) crossed++;
          rho = nr; z = nz;
          pts.push([rho, z]);
          if (crossed >= 2 || Math.abs(rho) > .11 || z > .12 || z < -.035 || metal && z > d + METAL_GAP) break;
        }
        out.push(pts);
      }
      return out;
    }

    // ---------- Input ----------
    const geo = { padX: 0, padY: 0, k: 1, tilt: .5 };
    let drag = null;
    grab.addEventListener('pointerdown', e => {
      if (!state.active) return;
      grab.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, y: e.clientY, from: state.distance };
      state.held = state.touched = true;
      grab.classList.add('is-dragging');
    });
    grab.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = (drag.y - e.clientY) / (geo.k * Math.cos(geo.tilt));
      state.distance = clamp(drag.from + dy, .002, .12);
    });
    const release = e => { if (drag && e.pointerId === drag.id) { drag = null; grab.classList.remove('is-dragging'); } };
    grab.addEventListener('pointerup', release);
    grab.addEventListener('pointercancel', release);
    grab.addEventListener('keydown', e => {
      const step = { ArrowUp: .002, ArrowRight: .002, ArrowDown: -.002, ArrowLeft: -.002, PageUp: .01, PageDown: -.01 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      state.held = state.touched = true;
      state.distance = clamp(state.distance + step, .002, .12);
    });
    inputs.distance.addEventListener('input', () => { state.held = state.touched = true; state.distance = +inputs.distance.value / 1000; });
    inputs.angle.addEventListener('input', () => { state.touched = true; state.angle = +inputs.angle.value * Math.PI / 180; });
    inputs.metal.addEventListener('change', () => { state.touched = true; state.metal = inputs.metal.checked; });
    for (const which of ['key', 'card']) inputs[which].addEventListener('change', () => {
      if (!inputs[which].checked) return;
      state.touched = true; state.tag = which;
      played = []; bitsHeard = []; idDigits = ''; idOk = false; card = null;
    });

    // ---------- The reason a read fails ----------
    // The one change that would fix it: metal first, then the angle, then the distance.
    function reasonFor(options, solved) {
      if (solved.awake) {
        return solved.rawVolts < solved.wake * 1.12 ? 'edge' : 'read';
      }
      if (options.metal !== null && physics.solve({ ...options, metal: null }).awake) return 'metal';
      if (options.angle > .05 && physics.solve({ ...options, angle: 0 }).awake) return 'turned';
      return 'far';
    }
    const REASONS = {
      read: 'ID read.',
      edge: 'On the edge. Some tries work, some don’t.',
      far: 'Too far: not enough field reaches the coil.',
      turned: 'Turned: the field slides past the coil instead of through it.',
      metal: 'Metal: it fights the field, so less of it reaches the coil.'
    };

    // ---------- Every frame ----------
    let clock = 0, lastReason = '';
    function update(dt, st, g) {
      Object.assign(geo, g);
      const on = !!(st && st.lab);
      if (on !== state.active) {
        state.active = on;
        root.classList.toggle('is-on', on);
        root.setAttribute('aria-hidden', String(!on));
        if (!on) { played = []; bitsHeard = []; idDigits = ''; idOk = false; card = null; }
      }
      if (!on) return null;
      clock += dt;
      const breaking = !!st.breakIt;
      controls.classList.toggle('is-on', breaking);
      root.classList.toggle('is-breaking', breaking);
      if (breaking && state.breakSince === null) state.breakSince = clock;
      if (!breaking) state.breakSince = null;

      // Until the visitor takes the key, scrolling brings it closer.
      if (!state.held) {
        const p = easeInOut(clamp01((st.s - APPROACH[0]) / (APPROACH[1] - APPROACH[0])));
        state.distance = lerp(FAR, NEAR, p);
      }
      // A hand is never quite still: about a millimetre of drift.
      state.jitterClock -= dt;
      if (state.jitterClock <= 0) { state.jitterGoal = (Math.random() * 2 - 1) * .0011; state.jitterClock = .35 + Math.random() * .5; }
      state.jitter += (state.jitterGoal - state.jitter) * (1 - Math.exp(-4 * dt));
      if (document.activeElement !== inputs.distance) inputs.distance.value = Math.round(state.distance * 1000);

      const readerKey = state.tag === 'key' ? 'key' : 'pad';
      const options = { tag: state.tag, reader: readerKey, distance: Math.max(.0015, state.distance + state.jitter),
        angle: state.angle, metal: state.metal ? METAL_GAP : null };
      const solved = state.solved = physics.solve(options);
      const reason = reasonFor(options, solved);

      // The answer.
      if (state.tag === 'key') {
        bitClock += dt;
        let guard = 0;
        while (bitClock >= BIT_SECONDS && guard++ < 6) { bitClock -= BIT_SECONDS; playKeyBit(solved.awake ? solved.dip : 0); }
        if (!solved.awake) { idOk = false; }
      } else {
        if (solved.awake && !card) startCard(solved.dip);
        if (card) {
          card.at += dt;
          const upTo = Math.min(card.samples.length, Math.floor(card.at / CARD_SECONDS * card.samples.length));
          played = Array.from(card.samples.subarray(Math.max(0, upTo - 900), upTo));
          if (upTo >= card.uidFrom && card.uid) { idDigits = card.uid.map(hex).join(''); idOk = card.ok; }
          if (card.at > CARD_SECONDS + 1.2) card = null;          // the reader asks again
          if (!solved.awake) { card = null; idOk = false; idDigits = ''; }
        } else {
          played.push(...Array.from({ length: 6 }, () => 1 + NOISE * noise()));
          if (played.length > 900) played = played.slice(-900);
          idDigits = ''; idOk = false;
        }
      }

      // Words.
      const chip = solved.awake ? 1 : 0;
      const answering = solved.awake;
      const lit = [true, solved.emf > solved.wake * .08, solved.awake, answering, idDigits.length > 0];
      const current = lit.lastIndexOf(true);
      steps.forEach((li, i) => { li.classList.toggle('is-on', lit[i]); li.classList.toggle('is-current', i === current); });
      prompt.textContent = breaking
        ? (!state.found.far ? 'Pull the key away, turn it sideways, or slide a metal plate behind it.'
          : !state.found.turned ? 'Bring it back, then turn it sideways.'
          : !state.found.metal ? 'Now slide a metal plate behind it.' : 'Try the card too.')
        : state.touched ? 'Keep it close, and watch the steps.' : 'Drag the key toward the reader.';
      if (state.tag === 'card' && !breaking) prompt.textContent = 'Drag the card toward the reader.';
      if (breaking && reason !== 'read' && reason !== 'edge') state.found[reason] = true;
      ticks.forEach(li => li.classList.toggle('is-on', state.found[li.dataset.reason]));
      const showReason = breaking ? REASONS[reason] : solved.awake ? (idOk ? REASONS.read : 'The chip is awake and answering…') : 'The chip is asleep.';
      if (showReason !== lastReason) { result.textContent = showReason; lastReason = showReason; }
      result.dataset.state = reason;
      const found = Object.values(state.found).filter(Boolean).length;
      state.payoff = breaking && (found === 3 || clock - state.breakSince > 20);
      payoff.classList.toggle('is-on', state.payoff);
      freq.textContent = state.tag === 'key' ? '125 kHz' : '13.56 MHz';

      // The reader's display.
      const shown = idDigits.padEnd(8, '·');
      idBox.querySelector('b').textContent = shown.match(/.{2}/g).join(' ');
      idBox.classList.toggle('is-ok', idOk && solved.awake);

      draw(solved, readerKey, options);
      return {
        tag: state.tag, distance: options.distance, angle: state.angle, metal: state.metal, metalGap: METAL_GAP,
        chip, glow: clamp01(solved.rawVolts / solved.wake) * .8 + .2 * chip, readerGlow: .55 + .45 * Math.abs(Math.sin(clock * 3.1))
      };
    }

    // ---------- Drawing ----------
    function draw(solved, readerKey, options) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { padX, padY, k, tilt } = geo, squash = Math.cos(tilt);
      const toScreen = (rho, z) => [padX + rho * k, padY - z * k * squash];
      const d = options.distance;

      // Field lines: recomputed only when the reader, the tag's height or the metal changes.
      const sig = readerKey + '|' + (options.metal !== null ? Math.round(d * 2000) : 'free');
      if (sig !== linesFor) { lines = traceLines(readerKey, d, options.metal !== null); linesFor = sig; }
      const tagR = physics.TAGS[state.tag].radius * Math.abs(Math.cos(state.angle));
      const flow = reduced.matches ? 0 : clock * 26 * (Math.sin(clock * Math.PI / 1.1) >= 0 ? 1 : -1);
      ctx.lineWidth = 1.3;
      for (const pts of lines) {
        // Does this line pass through the tag's coil? Then it's copper.
        let through = false;
        for (let i = 1; i < pts.length; i++) {
          const [r0, z0] = pts[i - 1], [r1, z1] = pts[i];
          if ((z0 - d) * (z1 - d) <= 0 && Math.abs(r0) < tagR) { through = true; break; }
        }
        // Lines fade as they leave the coil, like the field itself.
        const fade = ctx.createRadialGradient(padX, padY, 0, padX, padY, .12 * k);
        fade.addColorStop(0, through ? 'rgba(196, 112, 44, .95)' : 'rgba(13, 13, 12, .3)');
        fade.addColorStop(.55, through ? 'rgba(196, 112, 44, .7)' : 'rgba(13, 13, 12, .18)');
        fade.addColorStop(1, 'rgba(13, 13, 12, 0)');
        for (const side of [1, -1]) {
          ctx.beginPath();
          pts.forEach(([rho, z], i) => { const [x, y] = toScreen(side * rho, z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.strokeStyle = fade;
          ctx.setLineDash(through ? [7, 7] : [3, 7]);
          ctx.lineDashOffset = -flow * side;
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // A ruler from the reader to the tag.
      const [, yTag] = toScreen(0, d), [, yPad] = toScreen(0, 0);
      const rx = padX + physics.READERS[readerKey].radius * k + 34;
      ctx.strokeStyle = 'rgba(13, 13, 12, .55)'; ctx.fillStyle = 'rgba(13, 13, 12, .75)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rx, yPad); ctx.lineTo(rx, yTag); ctx.moveTo(rx - 5, yPad); ctx.lineTo(rx + 5, yPad); ctx.moveTo(rx - 5, yTag); ctx.lineTo(rx + 5, yTag); ctx.stroke();
      ctx.font = '600 12px "Inter Tight", sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText((d * 100).toFixed(1) + ' cm', rx + 9, (yPad + yTag) / 2);

      // The meter beside the tag: volts at the chip, and the line where it wakes.
      const max = solved.clamp * 1.15;
      meterFill.style.transform = `scaleY(${clamp01(solved.chipVolts / max).toFixed(3)})`;
      meterWake.style.bottom = (solved.wake / max * 100).toFixed(1) + '%';
      meterValue.textContent = solved.chipVolts.toFixed(1) + ' V';
      meter.classList.toggle('is-awake', solved.awake);
      const mx = Math.min(w - 70, padX - physics.READERS[readerKey].radius * k - 64);
      meter.style.transform = `translate(${Math.max(8, mx).toFixed(1)}px, ${(yTag - 60).toFixed(1)}px)`;
      grab.style.transform = `translate(${(padX - 70).toFixed(1)}px, ${(yTag - 46).toFixed(1)}px)`;
      grab.setAttribute('aria-valuenow', String(Math.round(d * 1000)));
      grab.setAttribute('aria-valuetext', `${(d * 100).toFixed(1)} centimeters, ${solved.awake ? 'chip awake' : 'chip asleep'}`);

      drawStrip(solved);
    }

    // The reader's signal: its coil current, zoomed in so a few percent fills the strip.
    function drawStrip(solved) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = strip.clientWidth, h = strip.clientHeight;
      if (!w || !h) return;
      if (strip.width !== Math.round(w * dpr) || strip.height !== Math.round(h * dpr)) { strip.width = Math.round(w * dpr); strip.height = Math.round(h * dpr); }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, w, h);
      const count = state.tag === 'key' ? 24 * KEY_SAMPLES : 900;
      const data = played.slice(-count);
      const zoom = state.tag === 'key' ? .16 : .12;          // the strip spans the top 16% (12%) of the signal
      const y = v => 6 + (1 - v) / zoom * (h - 12);
      sctx.strokeStyle = 'rgba(13, 13, 12, .12)'; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.moveTo(0, y(1)); sctx.lineTo(w, y(1)); sctx.stroke();
      sctx.strokeStyle = solved.awake ? '#a85a1c' : 'rgba(13, 13, 12, .55)';
      sctx.lineWidth = 1.4;
      sctx.beginPath();
      data.forEach((v, i) => {
        const x = w - (data.length - i) * (w / count);
        const yy = clamp(y(v), 1, h - 1);
        i ? sctx.lineTo(x, yy) : sctx.moveTo(x, yy);
      });
      sctx.stroke();
      // The key's bits, as the reader decided them, under their dips.
      if (state.tag === 'key') {
        const shownBits = bitsHeard.slice(-24);
        sctx.fillStyle = 'rgba(13, 13, 12, .7)';
        sctx.font = '600 11px "JetBrains Mono", monospace'; sctx.textAlign = 'center'; sctx.textBaseline = 'bottom';
        shownBits.forEach((b, i) => {
          if (b === null) return;
          const x = w - (shownBits.length - i - .5) * (w / 24);
          sctx.fillText(String(b), x, h - 2);
        });
      }
    }

    // Dev aid (?debug): what the reader has heard so far.
    if (new URLSearchParams(location.search).has('debug')) {
      window.__lab = { get bits() { return bitsHeard.map(b => b ?? '-').join(''); }, get digits() { return idDigits; },
        get ok() { return idOk; }, get state() { return state; }, fastForward(bits) { for (let i = 0; i < bits; i++) playKeyBit(state.solved?.awake ? state.solved.dip : 0); } };
    }
    return { update };
  }

  window.RFIDLab = { create };
})();
