// What RFID is: the card intro after the everyday taps (index.html `.intro`).
// A sticky stage that scrolling plays: the card opens and lets out the letters R, F, I, D,
// the letters spell the name, an X-ray shows the antenna and chip, and the visitor drags
// the card onto a reader. See EXPLAINED.md.
import { follow, settle, smoother, spring } from './easing.js';
import { ARRIVE, HERO, MOUTH_CLOSED, DROP_READY, SCROLL_SCREENS, beats, cardPose, clamp, ease, mix, measureStage, restingFrame, scrollTime } from './timeline.js';
import { renderSignals } from './signals.js';

const root = document.querySelector('.intro');
if (root) intro(root);

function intro(experience) {
  const $ = selector => experience.querySelector(selector);
  const stage = $('.intro-stage');
  const sceneCanvas = $('.card-scene');
  const poster = $('.card-poster');
  const shadow = $('.card-shadow');
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

  let scene, available = false, layout, scrollDistance, startY = 0, onScreen = false;
  let raf = 0, needsMeasure = true, dirty = true, nowBefore, playhead;
  let pointer, wasDragged = false, canDrop = false, detected = false, focusCard = false;
  let paintedPose, mouse;
  // Everything that moves follows its target through a critically damped spring
  // (easing.js), so its speed never jumps: the playhead, the drag offset, the lift and the tilt.
  const motion = { time: null, x: spring(), y: spring(), lift: spring(), pitch: spring(), yaw: spring() };

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
    layout = measureStage(w, h, glyph.map(letter => letter.offsetWidth));
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
      const x0 = mix(gutter + prefix[i] * heroSize / 100, gutter, visual.stack);
      const y0 = mix(heroY, stackY + i * lineGap, visual.stack);
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

  function paint(time, pose, visual) {
    panels.meaning.style.opacity = visual.meaning;
    panels.definition.style.opacity = visual.definition;
    panels.definition.style.translate = `0 ${(1 - visual.definition) * 12}px`;
    panels['cinema-title'].style.opacity = visual.cinema;
    panels['cinema-title'].style.scale = .94 + visual.cinema * .06;
    panels.question.style.opacity = visual.question;
    panels.question.style.translate = `0 ${(1 - visual.question) * 14}px`;
    stage.classList.toggle('show-callouts', visual.callouts > .001);
    panels.instruction.style.opacity = visual.instruction;
    reader.style.opacity = visual.reader;
    scrollGuide.style.opacity = 1 - ease(5.14, 5.62, time);

    const faceWidth = pose.width * Math.cos(pose.yaw);
    const faceHeight = pose.width * .63 * Math.cos(pose.pitch);
    place(poster, pose.x, pose.y, faceWidth, faceHeight, -pose.roll);
    poster.style.setProperty('--xray', pose.xray);
    place(shadow, pose.x + 10, pose.y + pose.width * .33, pose.width * .87, pose.width * .15);
    shadow.style.opacity = 1 - pose.xray * .8;
    if (canDrop) place(dropButton, pose.x, pose.y, faceWidth + 8, faceHeight + 8, -pose.roll);
    if (available) scene.draw(pose);
    paintedPose = pose;
  }

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
    const x = detected ? layout.reader.x : pointer?.moved ? pointer.x : base.x;
    const y = detected ? layout.reader.y : pointer?.moved ? pointer.y : base.y;
    const before = [motion.x.value, motion.y.value, motion.lift.value, motion.pitch.value, motion.yaw.value];
    const held = pointer?.moved;
    const offsetX = chase(motion.x, x - base.x, held ? 40 : 14, dt, .2);
    const offsetY = chase(motion.y, y - base.y, held ? 40 : 14, dt, .2);
    const proximity = held ? 1 - ease(.48, 1.8, readerDistance(pointer.x, pointer.y)) : 0;
    const liftTarget = detected ? -1 : held ? .5 - proximity * .75 : 0;
    const lift = chase(motion.lift, liftTarget, 18, dt, .002);
    const tilt = mouseTilt(base);
    const hoverPitch = chase(motion.pitch, tilt.pitch, 14, dt, .0003);
    const hoverYaw = chase(motion.yaw, tilt.yaw, 14, dt, .0003);
    const changed = [offsetX, offsetY, lift, hoverPitch, hoverYaw].some((value, i) => value !== before[i]);
    const pose = { ...base, x: base.x + offsetX, y: base.y + offsetY - Math.max(0, lift) * 12,
      width: base.width * (1 + lift * .07), pitch: base.pitch + lift * .22 + hoverPitch,
      yaw: base.yaw + lift * .18 + hoverYaw, roll: base.roll + lift * .085 };
    const visual = beats(time);
    // Where the letters and the spray leave from: the gap of the open mouth.
    const mouthPoint = () => available ? scene.mouth() : fromCard(pose, -.039, .002, .003 + pose.mouth * .010);
    if (dirty || readyChanged || time !== playhead || changed) {
      dirty = false;
      paint(time, pose, visual);
      paintLetters(time, visual, mouthPoint());
    }
    if (signal) {
      const mouth = mouthPoint();
      const callouts = paintLabels(pose, visual.callouts);
      const clock = reduce.matches ? 0 : now / 1000;
      renderSignals(signal, { layout, time, clock,
        mouth, card: pose, visual, labels: callouts, proximity, confirmed: Number(detected) });
    }
    playhead = time;
    if (focusCard && canDrop && !detected) {
      focusCard = false;
      dropButton.focus({ preventScroll: true });
    }
    const moving = (!reduce.matches && !resting(motion.time, target)) ||
      !resting(motion.x, x - base.x) || !resting(motion.y, y - base.y) || !resting(motion.lift, liftTarget) ||
      !resting(motion.pitch, tilt.pitch) || !resting(motion.yaw, tilt.yaw);
    const liveSignals = !document.hidden && signal && (visual.definition > 0 || visual.reader > 0);
    if (!reduce.matches && (moving || liveSignals)) wake();
  }

  function stopPointer() {
    const active = pointer;
    pointer = null;
    stage.classList.remove('dragging');
    if (active && dropButton.hasPointerCapture(active.id)) dropButton.releasePointerCapture(active.id);
  }

  function resetDrop() {
    stopPointer();
    wasDragged = false;
    detected = false;
    status.textContent = '';
    retry.hidden = true;
    dropButton.hidden = !canDrop;
    invalidate();
  }

  function confirmDrop() {
    if (!canDrop || detected) return;
    detected = true;
    const refocus = document.activeElement === dropButton;
    dropButton.hidden = true;
    status.textContent = 'Card detected.';
    retry.hidden = false;
    if (refocus) retry.focus({ preventScroll: true });
    invalidate();
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
    if (!canDrop || pointer || event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    pointer = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      dx: paintedPose.x + rect.left - event.clientX, dy: paintedPose.y + rect.top - event.clientY,
    };
    wasDragged = false;
    dropButton.setPointerCapture(event.pointerId);
    wake();
  });

  dropButton.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return;
    pointer.moved = true;
    pointer.x = clamp(event.clientX + pointer.dx, paintedPose.width * .28, layout.width - paintedPose.width * .28);
    pointer.y = clamp(event.clientY + pointer.dy, paintedPose.width * .19, layout.height - paintedPose.width * .19);
    stage.classList.add('dragging');
    wake();
  });

  dropButton.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    wasDragged = Boolean(pointer.moved);
    const onReader = wasDragged && readerDistance(event.clientX + pointer.dx, event.clientY + pointer.dy) <= 1;
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

  dropButton.addEventListener('click', event => {
    if (!wasDragged || event.detail === 0) confirmDrop();
  });

  retry.addEventListener('click', () => {
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
