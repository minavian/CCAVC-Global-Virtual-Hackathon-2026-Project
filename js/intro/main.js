// What RFID is: the card intro after the everyday taps (index.html `.intro`).
// A sticky stage that scrolling plays: the card opens and lets out the letters R, F, I, D,
// the letters spell the name, an X-ray shows the antenna and chip, and the visitor drags
// the card onto a reader. Bringing it near opens a close-up that follows the card's
// distance; dropping it lets the visitor step through the tap, ask the card for its ID and
// watch the answer flow back, and drag to turn the camera. See EXPLAINED.md.
import { follow, settle, smoother, spring } from './easing.js';
import { ARRIVE, HERO, MOUTH_CLOSED, DROP_READY, SCROLL_SCREENS, beats, cardPose, clamp, ease, mix, measureStage, restingFrame, scrollTime } from './timeline.js';
import { renderSignals } from './signals.js';
import { ANSWER_AFTER, APPROACH_DETAIL, APPROACH_TEXT, ASK, SAMPLES_PER_BIT, CARD_ID, IDLE, LAST, NEAREST, REAL_MS, SHOTS, STEPS, approach, approachBand, approachView, centimetres,
  message, power, talkLevels, view } from './cinema.js';

const root = document.querySelector('.intro');
if (root) intro(root);

function intro(experience) {
  const $ = selector => experience.querySelector(selector);
  const stage = $('.intro-stage');
  const sceneCanvas = $('.card-scene');
  const poster = $('.card-poster');
  const shadow = $('.card-shadow');
  const frameLines = $('.frame');
  const signalCanvas = $('.signal');
  const signal = signalCanvas.getContext('2d');
  const letters = [...experience.querySelectorAll('.letter')];
  const tail = letters.map(letter => letter.lastElementChild);
  const glyph = letters.map(letter => letter.firstElementChild);
  const reader = $('.reader');
  const dropButton = $('.drag-card');
  const retry = $('.retry');
  const status = $('.status');
  const scrollGuide = $('.scroll-guide');
  const labels = [$('.antenna-label'), $('.chip-label')];
  const panels = Object.fromEntries(['meaning', 'definition', 'cinema-title', 'question', 'instruction']
    .map(name => [name, $('.' + name)]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hud = $('.hud');
  // The close-up's words and marks: the readout (one sentence at a time and a line of small
  // print, with the radio frequency, the distance or the real time, and the chip's power),
  // the check mark and the explanation at the end.
  const film = {
    readout: $('.readout'), words: $('.readout-words'), text: $('.readout-text'), detail: $('.readout-detail'),
    middleLabel: $('.readout-middle small'), middleValue: $('.readout-middle b'), middleBar: $('.readout-middle i'),
    powerValue: $('.readout-power b'), powerBar: $('.readout-power i'),
    nav: $('.readout-nav'), back: $('.readout-back'), next: $('.readout-next'), count: $('.readout-count'),
    dotList: $('.readout-dots'), dots: [],
    // The parts named on screen, each with a thin line to its part (paintLabels in paintFilm).
    labels: Object.fromEntries([...experience.querySelectorAll('.cine-label')].map(label => [label.dataset.part, label])),
    leaders: $('.cine-leaders'), auto: $('.cine-auto'), autoText: $('.cine-auto-text'),
    check: $('.cine-check'), explain: $('.cine-explain'), replay: $('.replay'),
    backdrop: $('.cine-backdrop'), hint: $('.cine-hint'), nextLabel: 'Next',
    // The message's label: which way, what it says, and its signal as the receiver feels it.
    tag: $('.talk-tag'), tagNote: $('.talk-note'), tagWords: $('.talk-words'),
    trace: $('.talk-trace'), traceTrack: $('.talk-track'), traceLine: $('.talk-line'), traceClip: $('.talk-clip rect'),
    traceDot: $('.talk-dot'), bytes: $('.talk-bytes'), traceFor: null,
  };
  // A dot for each step, as a button that jumps to it.
  film.dots = STEPS.slice(0, LAST).map((plan, i) => {
    const dot = document.createElement('li'), button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Step ${i + 1}: ${plan.text}`);
    button.addEventListener('click', () => { takeOver(); go(i); });
    dot.append(button);
    return dot;
  });
  film.dotList.replaceChildren(...film.dots);
  // The right arrow's drawing (index.html), put back after the ask step shows Ask instead.
  const NEXT_ARROW = film.next.innerHTML;
  // The letters' weight in flight: thinnest leaving the card, full (as in styles.css) once out.
  const THIN = 100, FULL = 800;
  const weights = glyph.map(() => undefined);
  // Which line of the stacked name each letter sits on: R, F, then I and D together.
  const STACK_ROW = [0, 1, 2, 2];
  // While dragged, the card glides behind the pointer instead of sticking to it: a softer
  // spring (lower is lazier) whose speed also tips the card the way it is moving.
  const GLIDE = 10, RETURN = 10, LEAN = 2600;

  let scene, available = false, layout, scrollDistance, startY = 0, onScreen = false;
  let raf = 0, needsMeasure = true, dirty = true, nowBefore, playhead;
  let pointer, wasDragged = false, canDrop = false, detected = false, focusCard = false;
  let paintedPose, mouse, focusWhenDone = false;
  // Everything that moves follows its target through a critically damped spring
  // (easing.js), so its speed never jumps: the playhead, the drag offset, the lift and the tilt.
  const motion = { time: null, x: spring(), y: spring(), lift: spring(), pitch: spring(), yaw: spring() };
  // The close-up (cinema.js). `step` is the step shown after a drop (-1 before one),
  // `band` the sentence shown while dragging. Every level and the camera glide toward their
  // targets on springs too, so moving the card, or pressing Next or Back, never jumps.
  let step = -1, band = -1, clock = 0, cm = 10, shownText = null;
  // The conversation (cinema.js TALK): which message is flowing and since when (on `clock`),
  // or null. In the ask step it stays null until the visitor presses Ask.
  let talk = null;
  // Dragging on the stage after the drop turns the camera by this much (radians), on top
  // of the step's own shot. It eases back to the shot when the step changes.
  const orbit = { spin: 0, tilt: 0 };
  let orbitDrag = null, orbited = false;
  // Autoplay. Until the visitor does anything, the close-up plays by itself: once the card is
  // ready it is carried to the reader, every step holds for its `hold` (cinema.js), and Ask
  // is pressed for them. The moment they touch, click, drag or press a key, it stops and
  // waits for them; the Play button starts it again. `wait`: seconds the card has been ready;
  // `held`: seconds on this step; `after`: seconds since the answer landed.
  const auto = { on: true, wait: 0, held: 0, after: 0 };
  const AUTO_WAIT = 2.2, AUTO_CARRY = 3.4;
  const shown = Object.fromEntries(Object.keys(IDLE).map(key => [key, spring(IDLE[key])]));
  let lens = null;

  function wake() {
    if (!raf && onScreen) raf = requestAnimationFrame(frame);
  }

  function invalidate() {
    dirty = true;
    wake();
  }

  function remeasure() {
    needsMeasure = true;
    invalidate();
  }

  function measure() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return false;
    // Measure the letters at their landed (full) weight, even if they are mid-flight and thin.
    for (const letter of glyph) letter.style.fontWeight = '';
    layout = measureStage(w, h, glyph.map(letter => letter.offsetWidth));
    glyph.forEach((letter, i) => { letter.style.fontWeight = weights[i] ?? ''; });
    // The section sits below the landing page and the taps, so its scroll starts where it starts.
    startY = experience.getBoundingClientRect().top + window.scrollY;
    scrollDistance = Math.max(experience.offsetHeight - h, 1);
    stage.style.setProperty('--gutter', layout.gutter + 'px');
    stage.style.setProperty('--meaning-x', layout.meaningX + 'px');
    stage.style.setProperty('--meaning-y', layout.meaningY + 'px');
    stage.style.setProperty('--definition-y', layout.definitionY + 'px');
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    signalCanvas.width = Math.round(w * ratio);
    signalCanvas.height = Math.round(h * ratio);
    signal?.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (available) scene.resize(w, h);
    place(reader, layout.reader.x, layout.reader.y, layout.reader.width, layout.reader.height);
    needsMeasure = false;
    return true;
  }

  function place(node, x, y, width, height, rotation = 0) {
    node.style.width = width + 'px';
    node.style.height = height + 'px';
    node.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2}px, 0) rotate(${rotation}rad)`;
  }

  // Moves a spring toward `target` and parks it there once it is closer than `threshold`
  // and nearly still. Reduced motion and hidden tabs jump straight to the target.
  function chase(state, target, omega, dt, threshold) {
    if (reduce.matches || document.hidden) {
      state.value = target;
      state.velocity = 0;
      return target;
    }
    follow(state, target, omega, dt);
    if (Math.abs(state.value - target) < threshold && Math.abs(state.velocity) < threshold * omega) {
      state.value = target;
      state.velocity = 0;
    }
    return state.value;
  }

  const resting = (state, target) => state.value === target && state.velocity === 0;

  function mouseTilt(pose) {
    if (!mouse || pointer || detected || reduce.matches) return { pitch: 0, yaw: 0 };
    const dx = (mouse.x - pose.x) / (pose.width * .72);
    const dy = (mouse.y - pose.y) / (pose.width * .50);
    const near = 1 - ease(.65, 1.34, Math.hypot(dx, dy));
    return { pitch: clamp(dy, -1, 1) * near * .14, yaw: clamp(dx, -1, 1) * near * .17 };
  }

  function fromCard(pose, x, y, z) {
    if (available) return scene.project(x, y, z);
    const scale = pose.width / .0856;
    const px = (x * Math.cos(pose.yaw) + z * Math.sin(pose.yaw)) * scale;
    const py = y * Math.cos(pose.pitch) * scale;
    return {
      x: pose.x + px * Math.cos(pose.roll) - py * Math.sin(pose.roll),
      y: pose.y - px * Math.sin(pose.roll) - py * Math.cos(pose.roll),
    };
  }

  function paintLetters(time, visual, mouth) {
    const { prefix, compact, gutter, heroY, heroSize, stackY, lineGap, rowSize, tagSize } = layout;
    for (let i = 0; i < letters.length; i++) {
      // Stacked, the name reads in three lines: Radio-, Frequency, IDentification.
      // I and D share the last line, so D sits one I-width (plus the gap) to the right.
      const indent = i === 3 ? prefix[3] - prefix[2] : 0;
      const x0 = mix(gutter + prefix[i] * heroSize / 100, gutter + indent * rowSize / 100, visual.stack);
      const y0 = mix(heroY, stackY + STACK_ROW[i] * lineGap, visual.stack);
      const x = mix(x0, gutter + prefix[i] * tagSize / 100, visual.regroup);
      const y = mix(y0, stackY, visual.regroup);
      const size = mix(mix(heroSize, rowSize, visual.stack), tagSize, visual.regroup);
      const launch = .59 + i * .035;
      const flight = clamp((time - launch) / (HERO - launch));
      // Leaves the mouth from rest, overshoots by a hair and lands with no speed left.
      // The rise is a sine squared, so it lifts off and touches down level.
      const travel = settle(flight);
      const arc = Math.sin(flight * Math.PI) ** 2 * (compact ? 38 : 48);
      const spin = (1 - travel) * (.3 - i * .105);
      const scale = mix(.12, size / 100, travel);
      // Inter Tight is a variable font, so the weight can change smoothly. It follows the
      // distance travelled, not the clock: a letter starts filling out the moment it leaves
      // the mouth (thinnest there) and reaches full weight as it arrives. Smootherstep ends
      // the change with no speed left, and the small overshoot past its place stays at full.
      const weight = mix(THIN, FULL, smoother(0, 1, travel)).toFixed(1);
      if (weights[i] !== weight) glyph[i].style.fontWeight = weights[i] = weight;
      const unfold = ease(MOUTH_CLOSED + .01 + i * .07, 1.74 + i * .038, time) * (1 - ease(2.15, 2.65, time));
      letters[i].style.opacity = ease(launch, launch + .08, time) * visual.letters;
      letters[i].style.transform = `translate3d(${mix(mouth.x, x, travel)}px, ${mix(mouth.y - 18, y, travel) - arc}px, 0) rotate(${spin}rad) scale(${scale})`;
      tail[i].style.setProperty('--conceal', (100 * (1 - unfold)) + '%');
    }
  }

  function paintLabels(pose, opacity) {
    if (opacity <= .001) {
      for (const label of labels) label.style.opacity = 0;
      return [];
    }
    const antenna = fromCard(pose, -.017, .0246, .0001);
    const chip = fromCard(pose, -.02774, .0031, .0001);
    const entries = [
      { x: antenna.x, y: antenna.y - 42, part: antenna },
      { x: chip.x + clamp(pose.width * .128, 34, 92), y: chip.y - 10, part: chip },
    ];
    return entries.map(({ x, y, part }, i) => {
      labels[i].style.opacity = opacity;
      labels[i].style.transform = `translate3d(${x}px, ${y}px, 0)${i === 0 ? ' translateX(-50%)' : ''}`;
      return { part, tip: i === 0 ? { x, y: y + 24 } : { x: x - 8, y: part.y } };
    });
  }

  function paint(time, pose, visual, b) {
    panels.meaning.style.opacity = visual.meaning;
    panels.definition.style.opacity = visual.definition;
    panels.definition.style.translate = `0 ${(1 - visual.definition) * 12}px`;
    panels['cinema-title'].style.opacity = visual.cinema;
    panels['cinema-title'].style.scale = .94 + visual.cinema * .06;
    panels.question.style.opacity = visual.question;
    panels.question.style.translate = `0 ${(1 - visual.question) * 14}px`;
    stage.classList.toggle('show-callouts', visual.callouts > .001);
    // The readout takes the instructions' place. They hand over, never overlap: the
    // instructions are gone before the readout comes in (`paintFilm`), one text at a time.
    panels.instruction.style.opacity = visual.instruction * (1 - smoother(0, .45, Math.max(b.panel, b.dock)));
    // Everything else steps back while the close-up shows something.
    reader.style.opacity = visual.reader * b.reader;
    scrollGuide.style.opacity = 1 - ease(5.14, 5.62, time);
    hud.style.opacity = b.page;
    frameLines.style.opacity = .16 * b.page;

    // While the camera pushes in during a drag, the card grows with it (card-scene.js, GROW).
    const grow = Math.min(b.view.zoom, 1.3);
    const faceWidth = pose.width * Math.cos(pose.yaw) * grow;
    const faceHeight = pose.width * .63 * Math.cos(pose.pitch) * grow;
    place(poster, pose.x, pose.y, faceWidth, faceHeight, -pose.roll);
    poster.style.setProperty('--xray', Math.max(pose.xray, b.xray));
    poster.style.opacity = b.card;
    place(shadow, pose.x + 10, pose.y + pose.width * .33 * grow, pose.width * .87 * grow, pose.width * .15 * grow);
    shadow.style.opacity = (1 - Math.max(pose.xray, b.xray) * .8) * (1 - b.dock);
    if (canDrop) place(dropButton, pose.x, pose.y, faceWidth + 8, faceHeight + 8, -pose.roll);
    if (available) {
      scene.setReader({ x: layout.reader.x, y: layout.reader.y, width: layout.reader.width, opacity: visual.reader });
      scene.draw(pose, b);
    }
    paintedPose = pose;
  }

  const show = (node, amount, lift = 10) => {
    node.style.opacity = amount;
    node.style.translate = `0 ${(1 - amount) * lift}px`;
  };

  // Swaps the readout's sentence and its small print, fading the new ones in.
  function say(text, detail = '') {
    if (text === shownText && detail === film.detail.textContent) return;
    shownText = text;
    film.text.textContent = text;
    film.detail.textContent = detail;
    if (!reduce.matches && text) {
      film.words.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    }
  }

  // The message's signal under its label (cinema.js `message`), as the receiver feels it.
  // The question: the reader's field at the card, full on, with a drop to nothing for each
  // gap. The answer: the field at the reader, with a dip each time the card's switch closes
  // (drawn far deeper than the few percent it really is, and flickering with the 847.5 kHz
  // subcarrier). The line is laid out once per message and drawn up to now; each byte
  // appears once the receiving chip has read it.
  const traceY = (dir, level) => 3 + (1 - level) * 18;
  function paintTrace(said) {
    const { length, dir } = said;
    if (film.traceFor !== said.name) {
      film.traceFor = said.name;
      film.trace.setAttribute('viewBox', `0 0 ${length} 24`);
      let d = '';
      for (let n = 0; n < length; n++) {
        d += `${n ? 'L' : 'M'}${n} ${traceY(dir, dir > 0 ? said.signal[n] : 1 - .6 * said.raw[n]).toFixed(2)}`;
      }
      film.traceLine.setAttribute('d', d);
      film.traceTrack.setAttribute('d', `M0 3H${length}`);
      // Each byte sits under its 8 bits (bit k is the frame's bit time k + 1; a byte's ninth
      // bit is its check bit).
      film.bytes.replaceChildren(...said.bytes.map((byte, k) => {
        const label = document.createElement('span');
        label.textContent = byte.toString(16).toUpperCase().padStart(2, '0');
        label.style.left = `${(1 + 9 * k + 4) * SAMPLES_PER_BIT / length * 100}%`;
        label.classList.toggle('is-check', dir < 0 && k === said.bytes.length - 1);
        return label;
      }));
    }
    const now = Math.min(length, Math.max(0, said.n));
    film.traceClip.setAttribute('width', now);
    const level = dir > 0 ? said.exact : 1 - .6 * said.exact;
    film.traceDot.style.left = `${now / length * 100}%`;
    film.traceDot.style.top = `${traceY(dir, level) / 24 * 100}%`;
    film.traceDot.style.opacity = said.n >= length ? 0 : 1;
    [...film.bytes.children].forEach((label, k) => label.classList.toggle('is-in', said.decoded >= 9 * (k + 1)));
  }

  // The parts a step names (cinema.js `labels`): each label sits a little way out from its
  // part, away from the middle of the picture, joined to it by a thin line, so it never
  // covers what it names.
  const LABEL_AT = { chip: 'cardChip' };
  const leaderLines = new Map();
  function paintLabels3D(names) {
    const middle = names.length ? scene.anchor('middle') : null;
    for (const [part, label] of Object.entries(film.labels)) {
      const name = part === 'cardChip' ? 'chip' : part;
      const shown = names.includes(name);
      label.classList.toggle('is-shown', shown);
      let line = leaderLines.get(part);
      if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        film.leaders.append(line);
        leaderLines.set(part, line);
      }
      line.classList.toggle('is-shown', shown);
      if (!shown) continue;
      const at = scene.anchor(LABEL_AT[name] ?? name);
      let dx = at.x - middle.x, dy = at.y - middle.y;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length; dy /= length;
      if (length < 20) { dx = 0; dy = -1; }
      const reach = layout.compact ? 44 : 66;
      const x = clamp(at.x + dx * reach, 70, layout.width - 70), y = clamp(at.y + dy * reach - 6, 60, layout.height - 200);
      label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      line.setAttribute('x1', at.x.toFixed(1));
      line.setAttribute('y1', at.y.toFixed(1));
      line.setAttribute('x2', (x - dx * 10).toFixed(1));
      line.setAttribute('y2', (y - dy * 10).toFixed(1));
    }
  }

  // The autoplay button: shown once the card can be dropped, until the close-up is over.
  function paintAuto() {
    const shown = (canDrop || detected) && step < LAST && !reduce.matches;
    if (film.auto.hidden === shown) film.auto.hidden = !shown;
    const label = auto.on ? 'Pause' : 'Play';
    if (film.autoText.textContent !== label) {
      film.autoText.textContent = label;
      film.auto.setAttribute('aria-pressed', String(auto.on));
      film.auto.setAttribute('aria-label', auto.on ? 'Pause: stop playing by itself' : 'Play: let it play by itself');
      film.auto.classList.toggle('is-on', auto.on);
    }
  }

  // How far the current step is toward moving on by itself (0 to 1).
  function autoProgress() {
    const plan = STEPS[step];
    if (plan.talk === 'ask') return talk ? 1 : clamp(auto.held / plan.hold);
    if (plan.talk === 'answer') return clamp(auto.after / plan.hold);
    return clamp(auto.held / plan.hold);
  }

  // Autoplay, each frame, before the card is placed (`base`: where the scroll puts it).
  function drive(dt, base) {
    if (!auto.on || reduce.matches) return;
    if (!detected) {
      if (!canDrop || (pointer && !pointer.auto)) { auto.wait = 0; return; }
      if (!pointer) {
        auto.wait += dt;
        if (auto.wait < AUTO_WAIT) return;
        pointer = { id: -1, auto: true, moved: true, t: 0, from: { x: base.x, y: base.y }, x: base.x, y: base.y };
      }
      // Carry the card to the reader in a gentle arc, slowing as it comes close (so the
      // distance and the power can be read on the way), then put it down.
      pointer.t += dt;
      const f = smoother(0, AUTO_CARRY, pointer.t);
      pointer.x = mix(pointer.from.x, layout.reader.x, f);
      pointer.y = mix(pointer.from.y, layout.reader.y, f) - Math.sin(Math.PI * f) * layout.height * .05;
      if (pointer.t >= AUTO_CARRY + .4) { stopPointer(); confirmDrop(); }
      return;
    }
    if (step < 0 || step >= LAST) return;
    const plan = STEPS[step];
    auto.held += dt;
    if (plan.talk === 'ask') {
      if (!talk && auto.held >= plan.hold) ask();
    } else if (plan.talk === 'answer') {
      const landed = talk ? message(talk.name, clock - talk.start).landed : 0;
      if (landed >= 1) auto.after += dt;
      if (auto.after >= plan.hold) go(step + 1);
    } else if (auto.held >= plan.hold) go(step + 1);
  }

  // The visitor did something: stop playing by itself.
  function takeOver() {
    if (!auto.on) return;
    auto.on = false;
    if (pointer?.auto) stopPointer();
    invalidate();
  }

  // The close-up's words and marks, laid over the 3D. `b` is what is shown (cinema.js levels).
  function paintFilm(b) {
    const docked = detected && step >= 0;
    const on = b.panel > .01;
    show(film.readout, smoother(.45, 1, b.panel), 8);
    film.readout.style.visibility = on || docked ? 'visible' : 'hidden';
    film.readout.style.pointerEvents = b.panel > .5 ? '' : 'none';
    // On a phone the readout waits at the top while the card is dragged (styles.css) and
    // moves to the bottom on the drop; it fades back in there rather than jump.
    if (film.readout.classList.contains('is-docked') !== docked) {
      film.readout.classList.toggle('is-docked', docked);
      if (layout.compact && on && !reduce.matches) {
        film.readout.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
      }
    }

    if (docked) {
      const plan = STEPS[step], { ms: [from, to] } = plan, msg = b.message;
      // In the conversation the readout follows the message, and while the card's chip works
      // on the question, it says so.
      let text = plan.text, detail = plan.detail;
      if (plan.talk === 'ask' && talk) { text = plan.asking; detail = plan.askingDetail; }
      else if (plan.talk === 'answer' && msg && !msg.started) { text = plan.waiting; detail = plan.waitingDetail; }
      if (text) say(text, detail);
      film.middleLabel.textContent = 'Real time';
      const said = b.message?.started && !b.message.done ? b.message : null;
      // While a message is on the air, the real time it has taken so far (in µs steps), so
      // you can see how slowed down it is.
      const places = to - from < 1 ? 2 : 1;
      film.middleValue.textContent = said ? `${(from + said.realMs).toFixed(3)} ms`
        : from === to ? `${to.toFixed(1)} ms` : `${from.toFixed(places)}–${to.toFixed(places)} ms`;
      film.middleBar.style.setProperty('--from', from / REAL_MS);
      film.middleBar.style.setProperty('--to', Math.max(said ? from + said.realMs : to, from + .06) / REAL_MS);
      // The chip's own power: none at the start of the tap, full once the current reaches it.
      film.powerValue.textContent = Math.round(b.charge * 100) + '%';
      film.powerBar.style.setProperty('--to', b.charge);
    } else if (on) {
      band = approachBand(cm, band);
      say(APPROACH_TEXT[band], APPROACH_DETAIL[band]);
      film.middleLabel.textContent = 'Distance';
      film.middleValue.textContent = cm.toFixed(1) + ' cm';
      film.middleBar.style.setProperty('--from', 0);
      film.middleBar.style.setProperty('--to', 1 - (cm - NEAREST) / (10 - NEAREST));
      const share = power(cm);
      film.powerValue.textContent = Math.round(share * 100) + '%';
      film.powerBar.style.setProperty('--to', share);
    }

    // The arrows and where you are, after the drop. In the ask step the right arrow is Ask.
    const navigable = docked && step < LAST;
    if (film.nav.hidden === navigable) film.nav.hidden = !navigable;
    if (navigable) {
      film.back.disabled = step === 0;
      const label = step === ASK ? (talk ? 'Asking…' : 'Ask') : 'Next';
      if (film.nextLabel !== label) {
        film.nextLabel = label;
        film.next.innerHTML = label === 'Next' ? NEXT_ARROW : 'Ask';
        film.next.setAttribute('aria-label', label === 'Next' ? 'Next' : label === 'Ask' ? 'Ask the card' : 'Asking');
        film.next.setAttribute('aria-disabled', String(label !== 'Next' && label !== 'Ask'));
        film.next.classList.toggle('is-ask', label !== 'Next');
      }
      film.count.textContent = `${step + 1} of ${LAST}`;
      film.dots.forEach((dot, i) => {
        dot.classList.toggle('is-done', i < step);
        dot.classList.toggle('is-now', i === step);
      });
    }
    // While it plays by itself, a ring round the right arrow fills until the next step.
    const timing = auto.on && navigable && !reduce.matches ? autoProgress() : -1;
    film.next.classList.toggle('is-timing', timing >= 0);
    if (timing >= 0) film.next.style.setProperty('--auto', timing.toFixed(3));
    paintAuto();
    // While the card's chip works out its answer, its label points to it.
    const working = docked && STEPS[step].talk === 'answer' && b.message && !b.message.started;
    paintLabels3D(docked && available ? (working ? ['chip'] : STEPS[step].labels ?? []) : []);

    // The lights going down: the backdrop, and the readout turning dark with it.
    film.backdrop.style.opacity = b.dark;
    const dark = b.dark > .5;
    if (film.readout.classList.contains('is-dark') !== dark) film.readout.classList.toggle('is-dark', dark);
    film.auto.classList.toggle('is-dark', dark);
    stage.classList.toggle('is-docked', navigable);

    // The message's label, holding still at the top in the middle while the message is on
    // the air: which way it goes, what it says, and its signal drawn as it comes in, with each
    // byte under its bits once they have all arrived. Then the ID by the reader's chip while
    // it checks.
    let tag = null;
    const said = b.message;
    if (docked && said?.started && (said.landed < 1 || reduce.matches)) {
      const asking = said.dir > 0;
      tag = {
        kind: asking ? 'ask' : 'answer', text: said.words,
        note: `${asking ? 'Reader → card' : 'Card → reader'} · ${said.bits.length} bits · ${said.frameMs.toFixed(2)} ms`,
      };
    } else if (docked && available && STEPS[step].shot === 'read') {
      tag = { kind: 'check', text: CARD_ID, note: '', at: scene.anchor('readerChip') };
    }
    film.tag.classList.toggle('is-shown', Boolean(tag));
    if (tag) {
      if (film.tagWords.textContent !== tag.text) {
        film.tagWords.textContent = tag.text;
        film.tagNote.textContent = tag.note;
      }
      film.tag.dataset.kind = tag.kind;
      film.tag.style.transform = tag.at ? `translate3d(${tag.at.x}px, ${tag.at.y}px, 0)` : '';
      if (tag.kind !== 'check') paintTrace(said);
    }
    // Not while it plays by itself: then there is nothing to do but watch.
    film.hint.classList.toggle('is-shown', docked && b.dark > .6 && !orbited && !auto.on);

    // The check mark, drawn over the reader, and the explanation at the end.
    const top = available ? scene.anchor('readerTop') : { x: layout.reader.x, y: layout.reader.y - layout.reader.height * .3 };
    film.check.style.transform = `translate(${top.x}px, ${top.y - layout.reader.width * .16}px) translate(-50%, -100%)`;
    film.check.style.opacity = Math.min(1, b.check * 3) * (1 - b.explain);
    film.check.style.setProperty('--draw', b.check);
    // The explanation comes in once the readout has gone, so they never show together.
    const explain = b.explain * (1 - smoother(.3, .45, b.panel));
    show(film.explain, explain, 16);
    film.explain.classList.toggle('is-shown', explain > .02);
    if (docked && step >= LAST - 1 && b.check > .5 && status.textContent === '') status.textContent = 'Card detected.';
    const done = docked && step === LAST && explain > .3;
    if (retry.hidden === done) retry.hidden = film.replay.hidden = !done;
    // Whoever pressed Next to get here lands on Watch again once it shows.
    if (done && focusWhenDone) {
      focusWhenDone = false;
      film.replay.focus({ preventScroll: true });
    }
  }

  // How far the card's centre is from the reader's, as a share of the drop zone (1 is its edge).
  function readerDistance(x, y) {
    const target = layout.reader;
    return Math.hypot((x - target.x) / (target.width * .38), (y - target.y) / (target.height * .40));
  }

  function frame(now) {
    raf = 0;
    if (!onScreen) { nowBefore = undefined; return; }
    if (needsMeasure && !measure()) return;
    const elapsed = nowBefore === undefined ? 1000 / 60 : now - nowBefore;
    const dt = Math.min(.05, elapsed / 1000);
    nowBefore = now;
    const into = window.scrollY - startY;
    const fraction = clamp(into / scrollDistance);
    // Before the stage pins, it is still sliding up over the taps: play the card's arrival.
    // It eases out as the stage pins, where the scroll curve eases in, so they join smoothly.
    const target = into < 0
      ? ARRIVE * (1 - smoother(0, 1, 1 + into / layout.height))
      : scrollTime(fraction);
    stage.style.setProperty('--progress', fraction);
    motion.time ??= spring(target);
    // The playhead trails the scroll a little and catches up softly. It is a touch slower
    // through the mouth, which is where the eye watches the card closest.
    const omega = target <= MOUTH_CLOSED && motion.time.value <= MOUTH_CLOSED ? 10 : 12;
    const time = reduce.matches ? restingFrame(target) : chase(motion.time, target, omega, dt, .0002);
    const ready = target >= (reduce.matches ? 5.53 : 5.59) && time >= DROP_READY;
    const readyChanged = ready !== canDrop;
    if (readyChanged) {
      canDrop = ready;
      if (!ready) resetDrop();
      dropButton.hidden = !ready || detected;
    }

    const base = cardPose(time, layout);
    drive(dt, base);
    const held = Boolean(pointer?.moved);
    const x = detected ? layout.reader.x : held ? pointer.x : base.x;
    const y = detected ? layout.reader.y : held ? pointer.y : base.y;
    const before = [motion.x.value, motion.y.value, motion.lift.value, motion.pitch.value, motion.yaw.value];
    // Held, the card glides behind the pointer; let go, it glides home or onto the reader.
    const glide = held ? GLIDE : RETURN;
    const offsetX = chase(motion.x, x - base.x, glide, dt, .2);
    const offsetY = chase(motion.y, y - base.y, glide, dt, .2);
    const proximity = held ? 1 - ease(.48, 1.8, readerDistance(pointer.x, pointer.y)) : 0;
    const liftTarget = detected ? -1 : held ? .5 - proximity * .75 : 0;
    const lift = chase(motion.lift, liftTarget, 18, dt, .002);
    const tilt = mouseTilt(base);
    const hoverPitch = chase(motion.pitch, tilt.pitch, 14, dt, .0003);
    const hoverYaw = chase(motion.yaw, tilt.yaw, 14, dt, .0003);
    const changed = [offsetX, offsetY, lift, hoverPitch, hoverYaw].some((value, i) => value !== before[i]);
    // It leans into its own motion, the way a card held at one corner swings as it moves.
    const leanX = clamp(motion.x.velocity / LEAN, -1, 1), leanY = clamp(motion.y.velocity / LEAN, -1, 1);
    const pose = { ...base, x: base.x + offsetX, y: base.y + offsetY - Math.max(0, lift) * 12,
      width: base.width * (1 + lift * .07), pitch: base.pitch + lift * .22 + hoverPitch - leanY * .2,
      yaw: base.yaw + lift * .18 + hoverYaw + leanX * .26, roll: base.roll + lift * .085 - leanX * .1 };
    const visual = beats(time);

    // The close-up. Dragging, it follows the card's distance from the reader (where the card
    // is shown, so it matches what you see); after a drop, the step the visitor is on.
    const rest = { x: layout.reader.x / layout.width, y: layout.reader.y / layout.height };
    cm = centimetres(readerDistance(pose.x, pose.y));
    const docked = detected && step >= 0;
    let goal, look, said = null;
    if (docked) {
      const plan = STEPS[step];
      // With reduced motion, a message shows finished, on one still frame.
      said = plan.talk && talk?.name === plan.talk ? message(talk.name, reduce.matches ? 99 : clock - talk.start) : null;
      goal = said ? talkLevels(plan.levels, said) : plan.levels;
      // Aim where the card is going, so the camera and the card arrive together.
      look = view(plan.shot, goal.gap, rest, layout.compact);
      if (plan.talk && !reduce.matches) {
        // While they talk the camera never quite stops: a slight, slow drift.
        look.spin += Math.sin(clock * .19) * .035;
        look.tilt += Math.sin(clock * .14 + 1) * .012;
      }
      look.spin += orbit.spin;
      look.tilt = clamp(look.tilt + orbit.tilt, .2, 1.48);
      // The question is over: the camera goes to the card's chip, which answers the standard's
      // wait after the reader's last gap (ANSWER_AFTER), on the same clock.
      if (said?.done && talk.name === 'ask') {
        talk.doneAt ??= clock;
        if (clock - talk.doneAt > .1) go(step + 1, talk.start + ANSWER_AFTER);
      }
    } else if (canDrop) {
      goal = approach(cm);
      look = approachView(cm, rest, layout.compact);
    } else {
      goal = IDLE;
      look = view('rest', IDLE.gap, rest, layout.compact);
    }
    let settled = true;
    const pace = docked ? 4.5 : 14;
    for (const key in shown) {
      chase(shown[key], goal[key], pace, dt, key === 'gap' ? 1e-5 : .0008);
      settled &&= resting(shown[key], goal[key]);
    }
    // The camera glides from shot to shot: its zoom in even steps (log), its aim and angle.
    const aim = [Math.log(look.zoom), ...look.focus, ...look.at, look.tilt, look.spin, look.yaw, look.fov ?? 0];
    lens ??= aim.map(value => spring(value));
    // Turning the view by hand follows the pointer closely; between shots the camera glides.
    const lensPace = orbitDrag ? 9 : docked ? 3 : 12;
    lens.forEach((state, i) => {
      chase(state, aim[i], lensPace, dt, i >= 1 && i <= 3 ? 1e-6 : i === 9 ? .005 : 2e-4);
      settled &&= resting(state, aim[i]);
    });
    const levels = Object.fromEntries(Object.entries(shown).map(([key, state]) => [key, state.value]));
    const [z, fx, fy, fz, ax, ay, tiltAngle, spin, yaw, fov] = lens.map(state => state.value);
    const live = levels.panel > .001 || levels.dock > .001 || docked;
    // The loops (the current, the waves, the bits) run on their own clock while the close-up
    // shows. With reduced motion they hold still on one frame.
    if (live && !reduce.matches && !document.hidden) clock += dt;
    if (reduce.matches) clock = .4;
    const b = { ...levels, clock, message: said,
      view: { zoom: Math.exp(z), focus: [fx, fy, fz], at: [ax, ay], tilt: tiltAngle, spin, yaw, fov } };

    // Where the letters and the spray leave from: the gap of the open mouth.
    const mouthPoint = () => available ? scene.mouth() : fromCard(pose, -.039, .002, .003 + pose.mouth * .010);
    if (dirty || readyChanged || time !== playhead || changed || !settled || live) {
      dirty = false;
      paint(time, pose, visual, b);
      paintLetters(time, visual, mouthPoint());
      paintFilm(b);
    }
    if (signal) {
      const mouth = mouthPoint();
      const callouts = paintLabels(pose, visual.callouts);
      const tick = reduce.matches ? 0 : now / 1000;
      // The flat rings round the reader step aside once the 3D close-up shows its field.
      const away = { ...visual, reader: visual.reader * (1 - Math.max(levels.panel, levels.dock)) };
      renderSignals(signal, { layout, time, clock: tick,
        mouth, card: pose, visual: away, labels: callouts, proximity, confirmed: Number(detected) });
    }
    playhead = time;
    if (focusCard && canDrop && !detected) {
      focusCard = false;
      dropButton.focus({ preventScroll: true });
    }
    const moving = (!reduce.matches && !resting(motion.time, target)) ||
      !resting(motion.x, x - base.x) || !resting(motion.y, y - base.y) || !resting(motion.lift, liftTarget) ||
      !resting(motion.pitch, tilt.pitch) || !resting(motion.yaw, tilt.yaw) || !settled;
    const liveSignals = !document.hidden && signal && (visual.definition > 0 || visual.reader > 0);
    if ((!reduce.matches && (moving || liveSignals || live)) || (reduce.matches && !settled)) wake();
  }

  function stopPointer() {
    const active = pointer;
    pointer = null;
    stage.classList.remove('dragging');
    if (active && !active.auto && dropButton.hasPointerCapture(active.id)) dropButton.releasePointerCapture(active.id);
  }

  function resetDrop() {
    stopPointer();
    auto.wait = 0;
    wasDragged = false;
    detected = false;
    step = -1;
    band = -1;
    talk = null;
    orbit.spin = orbit.tilt = 0;
    status.textContent = '';
    focusWhenDone = false;
    retry.hidden = film.replay.hidden = true;
    film.nav.hidden = true;
    dropButton.hidden = !canDrop;
    invalidate();
  }

  // The card is on the reader: start stepping through the tap, from step 1.
  function confirmDrop() {
    if (!canDrop || detected) return;
    detected = true;
    const refocus = document.activeElement === dropButton;
    dropButton.hidden = true;
    go(0);
    if (refocus) {
      film.nav.hidden = false;
      film.readout.style.visibility = 'visible';
      film.next.focus({ preventScroll: true });
    }
    invalidate();
  }

  // Moves to step `index` (the last one is the explanation). `answerAt`: when the card's
  // answer starts, on the clock, if it follows straight on from the question.
  function go(index, answerAt) {
    if (!detected) return;
    const leaving = stage.contains(document.activeElement) && document.activeElement !== dropButton;
    step = clamp(index, 0, LAST);
    auto.held = auto.after = 0;
    // The card answers by itself, a moment after the step starts; the question waits for Ask.
    talk = STEPS[step].talk === 'answer' ? { name: 'answer', start: Math.max(answerAt ?? 0, clock + .2) } : null;
    orbit.spin = orbit.tilt = 0;
    focusWhenDone = step === LAST && leaving;
    film.nav.hidden = step >= LAST;
    if (step < LAST - 1) status.textContent = '';
    invalidate();
  }

  // The visitor plays the reader: Ask makes the reader send its question.
  function ask() {
    if (!detected || step !== ASK || talk) return;
    if (reduce.matches) { go(ASK + 1); return; }
    talk = { name: 'ask', start: clock };
    invalidate();
  }

  function forward() {
    if (step === ASK) ask();
    else go(step + 1);
  }

  film.next.addEventListener('click', event => { if (event.isTrusted) takeOver(); forward(); });
  film.back.addEventListener('click', event => { if (event.isTrusted) takeOver(); go(step - 1); });
  // Watch again plays it again by itself.
  film.replay.addEventListener('click', () => {
    auto.on = true;
    go(0);
    film.next.focus({ preventScroll: true });
  });
  film.auto.addEventListener('click', () => {
    auto.on = !auto.on;
    auto.held = auto.after = auto.wait = 0;
    if (!auto.on && pointer?.auto) stopPointer();
    invalidate();
  });
  // The arrow keys step too, and Escape takes the card off the reader.
  // The space bar (outside a button) plays or pauses it.
  stage.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ' && (canDrop || detected) && !event.target.closest('button')) {
      event.preventDefault();
      film.auto.click();
      return;
    }
    if (!detected) return;
    if (event.key === 'ArrowRight' && step < LAST) { event.preventDefault(); takeOver(); forward(); }
    else if (event.key === 'ArrowLeft' && step > 0) { event.preventDefault(); takeOver(); go(step - 1); }
    else if (event.key === 'Escape') { event.preventDefault(); takeOver(); resetDrop(); dropButton.focus({ preventScroll: true }); }
  });

  // With ?debug in the address: __intro.step(3) docks the card and shows step 4, and
  // __intro.advance(2) runs two seconds of animation at once (for checking a settled frame
  // when the browser paints slowly).
  if (new URLSearchParams(location.search).has('debug')) {
    window.__intro = {
      step(index) {
        if (!detected) { detected = true; dropButton.hidden = true; }
        go(index);
      },
      advance(seconds = 1) {
        let now = performance.now();
        nowBefore = now;
        for (let i = 0; i < seconds * 60; i++) frame(now += 1000 / 60);
        nowBefore = undefined;
      },
      state: () => ({ onScreen, canDrop, detected, step, needsMeasure }),
      shots: SHOTS,
      scene: () => scene,
    };
  }

  // After the drop, dragging anywhere on the stage (not on a button) turns the camera.
  stage.addEventListener('pointerdown', event => {
    if (!detected || step < 0 || step >= LAST || event.button !== 0) return;
    if (event.target.closest('button, a, .readout, .cine-explain')) return;
    takeOver();
    orbitDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, spin: orbit.spin, tilt: orbit.tilt };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-orbiting');
  });
  stage.addEventListener('pointermove', event => {
    if (orbitDrag?.id !== event.pointerId) return;
    const dx = event.clientX - orbitDrag.x, dy = event.clientY - orbitDrag.y;
    orbit.spin = clamp(orbitDrag.spin + dx * .0055, -1.4, 1.4);
    orbit.tilt = clamp(orbitDrag.tilt - dy * .0035, -.6, .35);
    if (Math.hypot(dx, dy) > 6) orbited = true;
    wake();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stage.addEventListener(type, event => {
      if (orbitDrag?.id !== event.pointerId) return;
      orbitDrag = null;
      stage.classList.remove('is-orbiting');
      wake();
    });
  }

  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') {
      clearMouseTilt();
      return;
    }
    if (event.buttons || reduce.matches) return;
    const rect = stage.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    wake();
  }, { passive: true });

  function clearMouseTilt() {
    if (!mouse) return;
    mouse = null;
    wake();
  }

  stage.addEventListener('pointerleave', clearMouseTilt);
  window.addEventListener('blur', clearMouseTilt);

  dropButton.addEventListener('pointerdown', event => {
    if (event.button === 0) takeOver();
    if (!canDrop || pointer || event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    // Where on the card it was grabbed, so the card keeps that spot under the pointer.
    pointer = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      dx: paintedPose.x - (event.clientX - rect.left), dy: paintedPose.y - (event.clientY - rect.top),
    };
    wasDragged = false;
    dropButton.setPointerCapture(event.pointerId);
    wake();
  });

  dropButton.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return;
    pointer.moved = true;
    const rect = stage.getBoundingClientRect();
    pointer.x = clamp(event.clientX - rect.left + pointer.dx, paintedPose.width * .28, layout.width - paintedPose.width * .28);
    pointer.y = clamp(event.clientY - rect.top + pointer.dy, paintedPose.width * .19, layout.height - paintedPose.width * .19);
    stage.classList.add('dragging');
    wake();
  });

  dropButton.addEventListener('pointerup', event => {
    if (pointer?.auto || pointer?.id !== event.pointerId) return;
    wasDragged = Boolean(pointer.moved);
    // Dropped where it is heading: the card is still gliding there.
    const onReader = wasDragged && readerDistance(pointer.x, pointer.y) <= 1;
    stopPointer();
    if (onReader) confirmDrop();
    invalidate();
  });

  for (const event of ['pointercancel', 'lostpointercapture']) {
    dropButton.addEventListener(event, e => {
      if (pointer?.id !== e.pointerId) return;
      stopPointer();
      invalidate();
    });
  }

  // A keyboard press or a plain tap on the card puts it on the reader too.
  dropButton.addEventListener('click', event => {
    if (event.isTrusted) takeOver();
    if (!wasDragged || event.detail === 0) confirmDrop();
  });

  retry.addEventListener('click', () => {
    takeOver();
    resetDrop();
    dropButton.focus({ preventScroll: true });
  });

  $('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    focusCard = true;
    if (needsMeasure) measure();
    window.scrollTo(0, startY + scrollDistance);
    invalidate();
  });

  sceneCanvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    available = false;
    stage.classList.remove('has-card');
    invalidate();
  });

  sceneCanvas.addEventListener('webglcontextrestored', () => {
    if (!scene) return;
    available = true;
    stage.classList.add('has-card');
    remeasure();
  });

  experience.style.setProperty('--scroll-screens', SCROLL_SCREENS);
  experience.classList.add('enhanced');
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  // The sections above can change height (fonts, a phone's toolbar), which moves this one.
  new ResizeObserver(remeasure).observe(stage);
  new ResizeObserver(remeasure).observe(document.body);
  reduce.addEventListener('change', invalidate);
  document.addEventListener('visibilitychange', wake);
  document.fonts.ready.then(remeasure);

  // Draw only while the stage is on screen.
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) invalidate();
  }).observe(stage);

  // Load the 3D card shortly before the section scrolls into view.
  const loader = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    loader.disconnect();
    start();
  }, { rootMargin: '150% 0px' });
  loader.observe(experience);

  async function start() {
    try {
      const { createCardScene } = await import('./card-scene.js');
      scene = await createCardScene(sceneCanvas);
      available = true;
      stage.classList.add('has-card');
      remeasure();
    } catch (error) {
      console.warn('Could not start the 3D card.', error);
    }
  }
}
