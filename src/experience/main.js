import { springProgress } from '../reusable/animations/easing.js';
import { HERO, MOUTH_CLOSED, DROP_READY, SCROLL_SCREENS, beats, cardPose, clamp, ease, measureStage, mix, restingFrame, scrollTime } from './timeline.js';
import { renderSignals } from './signals.js';

const $ = selector => document.querySelector(selector);
const experience = $('.experience');
const stage = $('.stage');
const sceneCanvas = $('.card-scene');
const poster = $('.card-poster');
const shadow = $('.card-shadow');
const signalCanvas = $('.signal');
const signal = signalCanvas.getContext('2d');
const letters = [...document.querySelectorAll('.letter')];
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

let scene, available = false, layout, scrollDistance;
let raf = 0, needsMeasure = true, dirty = true, nowBefore, playhead;
let pointer, wasDragged = false, canDrop = false, detected = false, focusCard = false;
let paintedPose, offsetX = 0, offsetY = 0, lift = 0;
let mouse, hoverPitch = 0, hoverYaw = 0;

function wake() {
  if (!raf) raf = requestAnimationFrame(frame);
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

function approach(current, target, rate, dt, threshold) {
  if (reduce.matches || document.hidden || Math.abs(target - current) < threshold) return target;
  return mix(current, target, 1 - Math.exp(-rate * dt));
}

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
    const spring = springProgress(flight);
    const travel = spring <= 1 ? spring : 1 + (spring - 1) * .18;
    const arc = Math.sin(flight * Math.PI) * (compact ? 38 : 48);
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
  if (needsMeasure && !measure()) return;
  const elapsed = nowBefore === undefined ? 1000 / 60 : now - nowBefore;
  const dt = Math.min(.05, elapsed / 1000);
  nowBefore = now;
  const fraction = clamp(window.scrollY / scrollDistance);
  const target = scrollTime(fraction);
  stage.style.setProperty('--progress', fraction);
  const current = playhead ?? target;
  const response = target <= MOUTH_CLOSED && current <= MOUTH_CLOSED ? 9.5 : 11;
  const time = reduce.matches ? restingFrame(target) : approach(current, target, response, dt, .0005);
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
  const previousOffsetX = offsetX, previousOffsetY = offsetY, previousLift = lift;
  offsetX = approach(offsetX, x - base.x, pointer?.moved ? 34 : 13, dt, .3);
  offsetY = approach(offsetY, y - base.y, pointer?.moved ? 34 : 13, dt, .3);
  const proximity = pointer?.moved ? 1 - ease(.48, 1.8, readerDistance(pointer.x, pointer.y)) : 0;
  lift = approach(lift, detected ? -1 : pointer?.moved ? .5 - proximity * .75 : 0, 15, dt, .005);
  const tilt = mouseTilt(base);
  const previousPitch = hoverPitch, previousYaw = hoverYaw;
  hoverPitch = approach(hoverPitch, tilt.pitch, 14, dt, .0005);
  hoverYaw = approach(hoverYaw, tilt.yaw, 14, dt, .0005);
  const tiltChanged = hoverPitch !== previousPitch || hoverYaw !== previousYaw;
  const pose = { ...base, x: base.x + offsetX, y: base.y + offsetY - Math.max(0, lift) * 12,
    width: base.width * (1 + lift * .07), pitch: base.pitch + lift * .22 + hoverPitch,
    yaw: base.yaw + lift * .18 + hoverYaw, roll: base.roll + lift * .085 };
  const visual = beats(time);
  if (dirty || readyChanged || time !== playhead || offsetX !== previousOffsetX || offsetY !== previousOffsetY || lift !== previousLift || tiltChanged) {
    dirty = false;
    paint(time, pose, visual);
    const mouth = fromCard(pose, -.039, .002, .003 + pose.mouth * .010);
    paintLetters(time, visual, mouth);
  }
  if (signal) {
    const mouth = fromCard(pose, -.039, .002, .003 + pose.mouth * .010);
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
  const moving = time !== target || offsetX !== x - base.x || offsetY !== y - base.y ||
    lift !== (detected ? -1 : pointer?.moved ? .5 - proximity * .75 : 0) ||
    hoverPitch !== tilt.pitch || hoverYaw !== tilt.yaw;
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
  window.scrollTo(0, experience.offsetHeight);
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
new ResizeObserver(remeasure).observe(stage);
reduce.addEventListener('change', invalidate);
document.addEventListener('visibilitychange', wake);
document.fonts.ready.then(remeasure);
invalidate();

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

start();
