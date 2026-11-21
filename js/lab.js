/*
 * Scenes 4 to 6 (SCRIPT.md): the reader and the key, live.
 *
 *   Power     The visitor brings the key to the reader (scrolling also lowers it). Field lines,
 *             copper sparks round the key's coil and a power bar show the power arriving; the
 *             chip wakes when the bar crosses its line. Each sentence comes from what the
 *             physics says is happening at that moment.
 *   Reply     The chip takes more power, then less. Under the reader, a trace of what the
 *             reader feels dips with each change, and the ID display fills in what the reader
 *             decoded from those dips.
 *   Break it  Three buttons (Turn it, Add metal, Use a card) and the drag. The sentence says
 *             what broke and asks for the next way to break it.
 *
 * Every frame, js/rfid/physics.js works out the field, the chip's power and the size of its
 * reply from where the key is. The ID is decoded by js/rfid/reader.js from the samples alone.
 *
 * landing.js calls update(dt, storyState, geometry) every frame and poses the 3D objects
 * from what it returns. geometry: { padX, padY, k (pixels per meter), tilt (radians) }.
 *
 * window.RFIDLab.create() returns { update }.
 */
(function () {
  'use strict';

  const { physics, lf, tag: tags, channel, reader, air } = window.RFID;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  const hex = b => b.toString(16).toUpperCase().padStart(2, '0');
  // Real seconds, for how long a sentence stays and how long the visitor has been idle.
  const now = () => performance.now() / 1000;

  const APPROACH = [6.45, 7.4];             // scrolling lowers the key from far to close
  const FAR = .056, NEAR = .025;            // meters: 2.5 cm reads, and is near enough to the
                                            // edge that metal or a turn breaks it
  const REACH = .052;                       // beyond this, "Move the key to the reader."
  const METAL_GAP = .004;                   // the plate sits 4 mm behind the key's coil
  const TURNED = 80 * Math.PI / 180;
  const BIT_SECONDS = .07;                  // slowed down: one of the key's bits (512 µs) takes this long
  const CARD_SECONDS = 7;                   // one whole card conversation (about 2.3 ms) takes this long
  const NOISE = .0025;                      // the reader's own noise, as a fraction of its signal
  // The 3D pad is drawn for a 3.5 cm coil; this scales it to the reader in use.
  const padScale = readerKey => physics.READERS[readerKey].radius / .035;

  function create() {
    const $ = s => document.querySelector(s);
    const root = $('.lab'), canvas = $('.lab-canvas'), trace = $('.lab-trace'), traceCanvas = trace.querySelector('canvas');
    const idBox = $('.lab-id'), meter = $('.lab-meter'), meterFill = meter.querySelector('i'), meterWake = meter.querySelector('em');
    const grab = $('.lab-grab'), badge = $('.lab-badge'), hand = $('.lab-hand');
    const buttons = { turn: $('#lab-turn'), metal: $('#lab-metal'), card: $('#lab-card') };
    const ctx = canvas.getContext('2d'), tctx = traceCanvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    const state = {
      tag: 'key', distance: FAR, angle: 0, angleGoal: 0, metal: false, held: false,
      jitter: 0, jitterGoal: 0, jitterClock: 0,
      awakeSince: Infinity, said: '', solved: null, active: false, mode: null,
      // Break it
      found: { far: false, turned: false, metal: false }, breakSince: null, lastInput: 0, ghost: null, ghostDone: false,
      cardSaid: -10, payoffAt: null
    };

    // ---------- The key's reply, as samples ----------
    // While awake, the key repeats its message. Samples are made one bit at a time, with the
    // size of the change at that moment and the reader's noise.
    const key = tags.keyChip(), message = key.message, B = lf.BIT;
    let played = [], bitClock = 0, bitIndex = 0, bitsHeard = [], idDigits = '', idOk = false, idAt = -1;
    const noise = air.gaussian(tags.random(4242));
    function playKeyBit(depth) {
      const bit = message[bitIndex % message.length];
      bitIndex++;
      for (let k = 0; k < B; k++) {
        const closed = depth > 0 && (bit ? k < lf.HALF : k >= lf.HALF);
        played.push((closed ? 1 - depth : 1) + NOISE * noise());
      }
      if (played.length > 4 * 64 * B) played = played.slice(-3 * 64 * B);
      const n = played.length - B;
      let a = 0, b = 0;
      for (let k = 0; k < lf.HALF; k++) { a += played[n + k]; b += played[n + lf.HALF + k]; }
      bitsHeard.push(depth > 0 ? (a < b ? 1 : 0) : null);
      if (bitsHeard.length > 200) bitsHeard = bitsHeard.slice(-130);
      readDigits();
    }
    // Digits appear as their four bits arrive (after the header); a whole message is then
    // checked by the reader, from the samples alone, before the display turns green.
    function readDigits() {
      const bits = bitsHeard;
      let header = -1;
      for (let i = bits.length - 9; i >= 1; i--) {
        if (bits[i - 1] === 0 && bits.slice(i, i + 9).every(b => b === 1)) { header = i; break; }
      }
      if (header < 0) return;
      let digits = '';
      for (let row = 0; row < 10; row++) {
        const at = header + 9 + row * 5;
        if (at + 4 > bits.length) break;
        const nibble = bits.slice(at, at + 4);
        if (nibble.includes(null)) break;
        digits += nibble.reduce((v, b) => v * 2 + b, 0).toString(16).toUpperCase();
      }
      if (!idOk) idDigits = digits.length > 2 ? digits.slice(2) : '';   // the first two are the version
      const absolute = header + bitIndex - bits.length;
      if (header + 64 <= bits.length && idAt !== absolute) {
        const heard = reader.hearKey(Float32Array.from(played.slice(-(bits.length - header + 2) * B)));
        if (heard.ok) { idOk = true; idAt = absolute; idDigits = heard.id.map(hex).join(''); }
      }
    }
    // Listen afresh, from the end of one message (its last bit, a 0) into the header of the
    // next, so the reader can find the header straight away.
    function listenAgain() { played = []; bitsHeard = []; idDigits = ''; idOk = false; idAt = -1; bitIndex = message.length - 1; bitClock = 0; card = null; }

    // The card replies only when asked: each time it wakes, the reader runs a whole
    // conversation through the simulated air, and the trace plays its samples back.
    let card = null;
    const cardChip = tags.cardChip({ uid: [0x08, 0x5c, 0x1e, 0x93] });
    function startCard(depth) {
      const link = channel.cardChannel([{ chip: cardChip, depth, awake: true }], { noise: NOISE, seed: 1 + Math.floor(Math.random() * 1e6) });
      const run = reader.activate(link);
      const total = link.recording.reduce((a, r) => a + r.samples.length, 0), samples = new Float32Array(total);
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
      const a = physics.READERS[readerKey].radius;
      const coils = [[a, 1, 0]];
      if (metal) coils.push([a, -1, 2 * (d + METAL_GAP)]);
      const field = (rho, z) => {
        let hr = 0, hz = 0;
        for (const [radius, current, z0] of coils) { const [r1, z1] = physics.loopField(radius, current, z0, rho, z); hr += r1; hz += z1; }
        return [hr, hz];
      };
      return [.28, .5, .68, .82, .93].map(f => {
        const pts = [[f * a, 0]];
        let rho = f * a, z = 0, crossed = 0;
        for (let n = 0; n < 900; n++) {
          const [hr, hz] = field(rho, z), m = Math.hypot(hr, hz) || 1, step = .0016;
          const [hr2, hz2] = field(rho + hr / m * step / 2, z + hz / m * step / 2), m2 = Math.hypot(hr2, hz2) || 1;
          const nz = z + hz2 / m2 * step;
          if (z > 0 && nz <= 0 || z < 0 && nz >= 0) crossed++;
          rho += hr2 / m2 * step; z = nz;
          pts.push([rho, z]);
          if (crossed >= 2 || Math.abs(rho) > .11 || z > .12 || z < -.035 || metal && z > d + METAL_GAP) break;
        }
        return pts;
      });
    }

    // ---------- Input ----------
    const geo = { padX: 0, padY: 0, k: 1, tilt: .5 };
    let drag = null, clock = 0;
    const touched = () => { state.lastInput = now(); state.ghost = null; };
    grab.addEventListener('pointerdown', e => {
      if (!state.active) return;
      grab.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, y: e.clientY, from: state.distance };
      state.held = true; touched();
      grab.classList.add('is-dragging');
    });
    grab.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      state.distance = clamp(drag.from + (drag.y - e.clientY) / (geo.k * Math.cos(geo.tilt)), .002, .12);
      touched();
    });
    const release = e => { if (drag && e.pointerId === drag.id) { drag = null; grab.classList.remove('is-dragging'); } };
    grab.addEventListener('pointerup', release);
    grab.addEventListener('pointercancel', release);
    grab.addEventListener('keydown', e => {
      const step = { ArrowUp: .003, ArrowRight: .003, ArrowDown: -.003, ArrowLeft: -.003, PageUp: .01, PageDown: -.01 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      state.held = true; touched();
      state.distance = clamp(state.distance + step, .002, .12);
    });
    const press = (button, on) => button.setAttribute('aria-pressed', String(on));
    buttons.turn.addEventListener('click', () => { touched(); state.angleGoal = state.angleGoal ? 0 : TURNED; press(buttons.turn, !!state.angleGoal); });
    buttons.metal.addEventListener('click', () => { touched(); state.metal = !state.metal; press(buttons.metal, state.metal); });
    buttons.card.addEventListener('click', () => {
      touched();
      state.tag = state.tag === 'key' ? 'card' : 'key';
      press(buttons.card, state.tag === 'card');
      buttons.card.textContent = state.tag === 'card' ? 'Use the key' : 'Use a card';
      if (state.tag === 'card') state.cardSaid = now();
      listenAgain();
    });

    // ---------- What broke ----------
    // The one change that would fix it: metal first, then the turn, then the distance.
    function reasonFor(options, solved) {
      if (solved.awake) return solved.rawVolts < solved.wake * 1.15 ? 'edge' : 'read';
      if (options.metal !== null && physics.solve({ ...options, metal: null }).awake) return 'metal';
      if (options.angle > .05 && physics.solve({ ...options, angle: 0 }).awake) return 'turned';
      return 'far';
    }
    const BROKE = {
      far: 'Too far. Not enough power.',
      turned: 'Turned. The field misses the coil.',
      metal: 'Metal pushes the field away.',
      edge: 'Almost too far. It flickers.'
    };

    // The power sentences, in order. Each is what the physics says is happening, but they move
    // forward one at a time and each stays at least 1.5 s, so a fast scroll can't skip one.
    // Moving the key away steps back at once.
    const POWER = ['Move the key to the reader.', 'The reader makes a magnetic field.', 'The field makes electricity in the coil.',
      'Enough power wakes the chip.', 'The reader is the battery.'];
    let powerStep = 0, powerSince = 0;
    function powerSentence(solved, d) {
            const target = !solved.awake ? (d > REACH ? 0 : solved.rawVolts < solved.wake * .35 ? 1 : 2) : now() - state.awakeSince < 1.6 ? 3 : 4;
      if (target < powerStep) { powerStep = target; powerSince = now(); }
      else if (target > powerStep && now() - powerSince >= 1.5) { powerStep++; powerSince = now(); }
      return POWER[powerStep];
    }

    function breakSentence(reason) {
      const since = now() - state.breakSince;
      if (reason === 'far' || reason === 'turned' || reason === 'metal') { state.found[reason] = true; return BROKE[reason]; }
      if (reason === 'edge' && Math.abs(state.angle - state.angleGoal) < .02) return BROKE.edge;
      if (now() - state.cardSaid < 3) return 'A bank card works the same way.';
      const all = state.found.far && state.found.turned && state.found.metal;
      if ((all || since > 20) && state.payoffAt === null) state.payoffAt = now();
      if (state.payoffAt !== null) return now() - state.payoffAt < 4 ? 'That’s why you tap close and flat.' : 'Scroll to take it apart.';
      if (since < 2) return 'Now break it.';
      if (!state.found.far) return 'Pull the key away.';
      if (!state.found.turned) return state.angleGoal ? 'Turn it back.' : 'Turn it sideways.';
      if (!state.found.metal) return state.metal ? 'Take the metal away.' : 'Put metal behind it.';
      return 'That’s why you tap close and flat.';
    }

    // ---------- Every frame ----------
    function update(dt, st, g) {
      Object.assign(geo, g);
      const on = !!(st && st.lab);
      if (on !== state.active) {
        state.active = on;
        root.classList.toggle('is-on', on);
        root.setAttribute('aria-hidden', String(!on));
        if (!on) listenAgain();
      }
      if (!on) return null;
      clock += dt;
      const mode = st.mode;
      if (mode !== state.mode) {
        // Entering the reply's "spell" moment, or a new scene: listen from the next header.
        if (mode === 'reply' || mode === 'break') listenAgain();
        if (mode === 'break') { state.breakSince = now(); state.lastInput = now(); state.payoffAt = null; state.found = { far: false, turned: false, metal: false }; }
        state.mode = mode;
      }
      if (mode === 'reply' && st.spell && !state.spelling) { state.spelling = true; listenAgain(); }
      if (!st.spell) state.spelling = false;
      root.dataset.mode = mode;

      // Until the visitor takes the key, scrolling brings it closer.
      if (!state.held) state.distance = lerp(FAR, NEAR, easeInOut(clamp01((st.s - APPROACH[0]) / (APPROACH[1] - APPROACH[0]))));
      // The ghost hand: in Break it, after 4 idle seconds, lift the key 3 cm and bring it back, once.
      if (mode === 'break' && !state.ghostDone && now() - state.lastInput > 4) { state.ghost = { t: 0, from: state.distance }; state.ghostDone = true; }
      let ghostLift = 0;
      if (state.ghost) {
        state.ghost.t += dt;
        const p = state.ghost.t / 2.6;
        ghostLift = Math.sin(Math.PI * clamp01(p)) * .03;
        if (p >= 1) state.ghost = null;
      }
      hand.classList.toggle('is-on', !!state.ghost);
      // A hand is never quite still: about a millimetre of drift.
      state.jitterClock -= dt;
      if (state.jitterClock <= 0) { state.jitterGoal = (Math.random() * 2 - 1) * .0011; state.jitterClock = .35 + Math.random() * .5; }
      state.jitter += (state.jitterGoal - state.jitter) * (1 - Math.exp(-4 * dt));
      state.angle += (state.angleGoal - state.angle) * (reduced.matches ? 1 : 1 - Math.exp(-6 * dt));

      const readerKey = state.tag === 'key' ? 'key' : 'pad';
      const d = Math.max(.0015, state.distance + ghostLift + state.jitter);
      const options = { tag: state.tag, reader: readerKey, distance: d, angle: state.angle, metal: state.metal ? METAL_GAP : null };
      const solved = state.solved = physics.solve(options);
      if (!solved.awake) state.awakeSince = Infinity; else if (state.awakeSince === Infinity) state.awakeSince = now();

      // The reply.
      let closed = false;
      if (state.tag === 'key') {
        bitClock += dt;
        let guard = 0;
        while (bitClock >= BIT_SECONDS && guard++ < 6) { bitClock -= BIT_SECONDS; playKeyBit(solved.awake ? solved.dip : 0); }
        const bit = message[bitIndex % message.length];
        closed = solved.awake && ((bitClock / BIT_SECONDS < .5) === (bit === 1));
        if (!solved.awake) idOk = false;
      } else {
        if (solved.awake && !card) startCard(solved.dip);
        if (card) {
          card.at += dt;
          const upTo = Math.min(card.samples.length, Math.floor(card.at / CARD_SECONDS * card.samples.length));
          played = Array.from(card.samples.subarray(Math.max(0, upTo - 900), upTo));
          closed = played.length > 0 && played[played.length - 1] < 1 - solved.dip / 2;
          if (upTo >= card.uidFrom && card.uid) { idDigits = card.uid.map(hex).join(''); idOk = card.ok; }
          if (card.at > CARD_SECONDS + 1.2) card = null;
          if (!solved.awake) { card = null; idOk = false; idDigits = ''; }
        } else {
          played.push(...Array.from({ length: 6 }, () => 1 + NOISE * noise()));
          if (played.length > 900) played = played.slice(-900);
          idDigits = ''; idOk = false;
        }
      }

      // The sentence for this moment.
      const reason = reasonFor(options, solved);
      state.say = mode === 'power' ? powerSentence(solved, d) : mode === 'break' ? breakSentence(reason) : '';

      // What shows when.
      const replying = mode === 'reply' || mode === 'break';
      root.classList.toggle('is-replying', replying);
      root.classList.toggle('is-breaking', mode === 'break');
      badge.classList.toggle('is-on', replying);
      const shown = (st.spell || mode === 'break') ? idDigits : '';
      idBox.querySelector('b').textContent = shown.padEnd(8, '·').match(/.{2}/g).join(' ');
      idBox.classList.toggle('is-ok', idOk && solved.awake && (st.spell || mode === 'break'));

      draw(solved, readerKey, options, closed);
      const glow = clamp01(solved.rawVolts / solved.wake) * .7;
      return {
        tag: state.tag, distance: d, angle: state.angle, metal: state.metal, metalGap: METAL_GAP,
        chip: solved.awake ? 1 : 0,
        glow: replying && solved.awake ? (closed ? 1 : .35) : glow,
        readerGlow: .55 + .45 * Math.abs(Math.sin(clock * 3.1)),
        say: state.say, awake: solved.awake, idOk: idOk && solved.awake,
        padScale: padScale(readerKey)
      };
    }

    // ---------- Drawing ----------
    function draw(solved, readerKey, options, closed) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { padX, padY, k, tilt } = geo, squash = Math.cos(tilt), u = geo.u || 1;
      const toScreen = (rho, z) => [padX + rho * k, padY - z * k * squash];
      const d = options.distance;
      const [, yTag] = toScreen(0, d);

      // Field lines, slowed down. Lines through the key's coil are copper, and brighter
      // while it takes more power.
      const sig = readerKey + '|' + (options.metal !== null ? Math.round(d * 2000) : 'free');
      if (sig !== linesFor) { lines = traceLines(readerKey, d, options.metal !== null); linesFor = sig; }
      const tagR = physics.TAGS[state.tag].radius * Math.abs(Math.cos(state.angle));
      const flow = reduced.matches ? 0 : clock * 26 * (Math.sin(clock * Math.PI / 1.1) >= 0 ? 1 : -1);
      for (const pts of lines) {
        let through = false;
        for (let i = 1; i < pts.length; i++) {
          const [r0, z0] = pts[i - 1], [, z1] = pts[i];
          if ((z0 - d) * (z1 - d) <= 0 && Math.abs(r0) < tagR) { through = true; break; }
        }
        const fade = ctx.createRadialGradient(padX, padY, 0, padX, padY, .12 * k);
        const strong = through && closed ? .95 : through ? .7 : 0;
        fade.addColorStop(0, through ? `rgba(196, 112, 44, ${strong})` : 'rgba(13, 13, 12, .28)');
        fade.addColorStop(.55, through ? `rgba(196, 112, 44, ${strong * .7})` : 'rgba(13, 13, 12, .16)');
        fade.addColorStop(1, 'rgba(13, 13, 12, 0)');
        ctx.lineWidth = (through && closed ? 2.6 : 1.6) * u;
        for (const side of [1, -1]) {
          ctx.beginPath();
          pts.forEach(([rho, z], i) => { const [x, y] = toScreen(side * rho, z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.strokeStyle = fade;
          ctx.setLineDash(through ? [9 * u, 9 * u] : [4 * u, 9 * u]);
          ctx.lineDashOffset = -flow * side * u;
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // Copper sparks running round the key's coil: electricity, faster with more power.
      const power = clamp01(solved.rawVolts / solved.wake);
      if (power > .2) {
        const rx = physics.TAGS[state.tag].radius * k * 1.05, ry = rx * Math.abs(Math.sin(tilt + state.angle)) + 2;
        const speed = reduced.matches ? 0 : clock * (1.2 + 5 * power);
        ctx.fillStyle = `rgba(214, 128, 58, ${(.35 + .65 * power).toFixed(2)})`;
        for (let i = 0; i < 12; i++) {
          const a = speed + i / 12 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(padX + Math.cos(a) * rx, yTag + Math.sin(a) * ry, 3.2 * u, 0, Math.PI * 2); ctx.fill();
        }
      }

      // The power bar beside the reader, at the key's height, with its wake-up line halfway up.
      // Every gap is in design pixels (u), like everything else in the film.
      meterFill.style.transform = `scaleY(${clamp01(solved.rawVolts / (solved.wake * 2)).toFixed(3)})`;
      meterWake.style.bottom = '50%';
      meter.classList.toggle('is-awake', solved.awake);
      const keyHalf = (state.tag === 'card' ? .043 : .03) * k;
      const padR = .047 * padScale(readerKey) * k;
      const meterX = geo.tall ? Math.max(padX - padR - meter.offsetWidth - 20 * u, padX - 186 * u) : padX - Math.max(padR, keyHalf) - meter.offsetWidth - 20 * u;
      meter.style.transform = `translate(${meterX.toFixed(1)}px, ${(geo.tall ? yTag - meter.offsetHeight - 12 * u : yTag - meter.offsetHeight / 2).toFixed(1)}px)`;
      grab.style.transform = `translate(${(padX - keyHalf).toFixed(1)}px, ${(yTag - 40 * u).toFixed(1)}px)`;
      grab.style.width = (2 * keyHalf).toFixed(1) + 'px';
      grab.style.height = (80 * u).toFixed(1) + 'px';
      grab.setAttribute('aria-valuenow', String(Math.round(d * 1000)));
      grab.setAttribute('aria-valuetext', `${(d * 100).toFixed(1)} centimeters, ${solved.awake ? 'chip awake' : 'chip asleep'}`);
      hand.style.transform = `translate(${(padX + keyHalf * .4).toFixed(1)}px, ${(yTag - 12 * u).toFixed(1)}px)`;

      // Under the reader: what it feels, then the ID it read.
      const below = padY + padR * Math.sin(tilt) + 30 * u;
      trace.style.transform = `translate(${(padX - trace.offsetWidth / 2).toFixed(1)}px, ${below.toFixed(1)}px)`;
      idBox.style.transform = `translate(${(padX - idBox.offsetWidth / 2).toFixed(1)}px, ${(below + trace.offsetHeight + 14 * u).toFixed(1)}px)`;
      drawTrace(solved);
    }

    // What the reader feels: its coil current, zoomed in so a few percent fills the strip.
    function drawTrace(solved) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = traceCanvas.clientWidth, h = traceCanvas.clientHeight;
      if (!w || !h) return;
      if (traceCanvas.width !== Math.round(w * dpr) || traceCanvas.height !== Math.round(h * dpr)) { traceCanvas.width = Math.round(w * dpr); traceCanvas.height = Math.round(h * dpr); }
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.clearRect(0, 0, w, h);
      const count = state.tag === 'key' ? 16 * B : 700;
      const data = played.slice(-count);
      const zoom = state.tag === 'key' ? .16 : .12;
      const y = v => 4 + (1 - v) / zoom * (h - 8);
      tctx.strokeStyle = solved.awake ? '#a85a1c' : 'rgba(13, 13, 12, .45)';
      tctx.lineWidth = 2 * (geo.u || 1);
      tctx.beginPath();
      data.forEach((v, i) => {
        const x = w - (data.length - i) * (w / count), yy = clamp(y(v), 1, h - 1);
        i ? tctx.lineTo(x, yy) : tctx.moveTo(x, yy);
      });
      tctx.stroke();
    }

    // Dev aid (?debug): what the reader has heard so far, and a way to skip ahead.
    if (new URLSearchParams(location.search).has('debug')) {
      window.__lab = { get bits() { return bitsHeard.map(b => b ?? '-').join(''); }, get digits() { return idDigits; },
        get ok() { return idOk; }, get state() { return state; }, fastForward(bits) { for (let i = 0; i < bits; i++) playKeyBit(state.solved?.awake ? state.solved.dip : 0); } };
    }
    return { update };
  }

  window.RFIDLab = { create };
})();
