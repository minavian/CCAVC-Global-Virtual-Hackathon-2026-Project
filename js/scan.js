import { SCAN_TIMING } from './scan-timing.js';

const stage = document.querySelector('.scan-stage');
const sequence = stage.closest('.scan-sequence');
const depth = sequence.querySelector('.scan-depth');
const viewport = stage.querySelector('.scan-view');
const grab = stage.querySelector('.scan-grab');
const choices = stage.querySelector('.scan-choices');
const buttons = [...choices.querySelectorAll('button')];
const next = stage.querySelector('.scan-next');
const status = stage.querySelector('.scan-status');
const reveal = stage.querySelector('.scan-reveal');
const anatomy = stage.querySelector('.scan-anatomy');
const [coil, chip] = anatomy.querySelectorAll('dd');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const mix = (a, b, amount) => a + (b - a) * amount;
const ease = amount => amount * amount * (3 - 2 * amount);
const descriptions = [
  ['The copper coil picks up energy from the reader’s field.', 'The chip wakes up and sends the key’s ID.'],
  ['The NFC antenna exchanges a short-range signal with the reader.', 'The phone’s NFC controller handles the exchange. It sits on the mainboard.'],
  ['The loop around the edge picks up energy from the reader’s field.', 'The chip uses that energy to send a reply.']
];

let scene, loading, audio, selected = 2, frame = 0;
let inView = false, playing = false, completed = false, startedAt = null, detected = false;
let fallback = false, preparing = false, drag, returning, manualPosition, handoff;

function loadScene() {
  loading ??= import('./scan-scene.js').then(({ createScanScene }) => createScanScene(viewport, wake))
    .then(async renderer => {
      await renderer.showObject(selected);
      scene = renderer;
      wake();
      return renderer;
    }).catch(() => {
      fallback = true;
      grab.classList.add('is-fallback');
      stage.querySelector('.scan-intro p').textContent = 'Choose a device, then select Scan.';
      status.textContent = 'The 3D view is unavailable. You can still explore how a scan works.';
      wake();
      return null;
    });
  return loading;
}

function prepareChime() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    audio ??= new Audio();
    audio.resume().catch(() => {});
  } catch {
    // The green reader and live status carry the same feedback when sound is unavailable.
  }
}

function chime() {
  if (audio?.state !== 'running') return;
  const start = audio.currentTime;
  for (const [frequency, delay, volume] of [[1050, 0, .09], [1575, .034, .055]]) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    const at = start + delay;
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(.001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .016);
    gain.gain.exponentialRampToValueAtTime(.001, at + .28);
    tone.connect(gain).connect(audio.destination);
    tone.start(at);
    tone.stop(at + .28);
  }
}

function setAnatomy() {
  [coil.textContent, chip.textContent] = descriptions[selected];
  anatomy.querySelectorAll('dt')[1].textContent = selected === 1 ? 'NFC controller' : 'Chip';
}

function updateDevice() {
  const button = buttons.find(choice => Number(choice.dataset.device) === selected);
  for (const choice of buttons) choice.setAttribute('aria-pressed', String(choice === button));
  const label = `Scan ${button.textContent.toLowerCase()}`;
  grab.setAttribute('aria-label', label);
  grab.firstElementChild.textContent = label;
  setAnatomy();
}

function updateGrab() {
  const target = scene?.getTargets()?.device;
  grab.hidden = !fallback && (!target || preparing || !!handoff);
  if (!target || drag) return;
  const { x, y } = target;
  const width = Math.max(44, target.width), height = Math.max(44, target.height);
  Object.assign(grab.style, {
    left: `${x - width / 2}px`, top: `${y - height / 2}px`,
    width: `${width}px`, height: `${height}px`
  });
}

function confirmScan() {
  detected = true;
  status.setAttribute('data-success', '');
  status.textContent = 'Simulated scan successful';
  chime();
}

function finishScan() {
  const moveFocus = document.activeElement === grab || choices.contains(document.activeElement);
  playing = false;
  manualPosition = null;
  completed = true;
  choices.hidden = true;
  next.hidden = false;
  paint();
  if (moveFocus) {
    (anatomy.hidden ? reveal : anatomy.querySelector('h2')).focus({ preventScroll: true });
  }
}

function paint(now = performance.now()) {
  if (handoff) {
    const progress = motion.matches ? 1 : Math.min(1, Math.max(0, (now - handoff.start) / 780));
    if (progress < 1) {
      const amount = ease(progress);
      scrollTo({ top: mix(handoff.from, handoff.to, amount), behavior: 'instant' });
      scene.drawHandoff(handoff.origin, amount);
      return;
    }
    finishHandoff();
  }

  if (playing) {
    startedAt ??= now;
    const seconds = (now - startedAt) / 1000;
    const end = motion.matches ? SCAN_TIMING.contact + .65 : SCAN_TIMING.end;
    if (!detected && seconds >= SCAN_TIMING.contact) confirmScan();
    if (seconds >= end) finishScan();
    else scene?.drawScan(seconds, motion.matches, manualPosition, !!manualPosition);
    return;
  }

  const progress = Math.min(1, Math.max(0, -sequence.getBoundingClientRect().top / depth.offsetHeight));
  const inside = progress > .38;
  const view = inside ? 'inside' : completed ? 'reveal' : 'pick';
  stage.dataset.view = view;
  reveal.hidden = view !== 'reveal';
  anatomy.hidden = !inside;
  reveal.style.setProperty('--reveal-opacity', 1 - Math.min(1, progress / .42));

  if (completed || inside) {
    grab.hidden = true;
    const opened = Math.max(0, (progress - .06) / .94);
    const position = motion.matches ? Number(inside) : opened;
    scene?.drawInside(position);
  } else {
    let position = drag?.position;
    if (returning) {
      const amount = Math.min(1, Math.max(0, (now - returning.start) / 220));
      const target = returning.target;
      if (amount === 1) returning = null;
      else position = { x: mix(returning.position.x, target.x, ease(amount)), y: mix(returning.position.y, target.y, ease(amount)) };
    }
    scene?.drawScan(0, motion.matches, position, true);
    updateGrab();
  }
}

function wake() {
  if (frame || (!inView && !playing && !handoff) || document.hidden) return;
  frame = requestAnimationFrame(now => {
    frame = 0;
    paint(now);
    if (playing || handoff || returning) wake();
  });
}

async function selectDevice(index) {
  preparing = true;
  grab.hidden = true;
  try {
    const renderer = await loadScene();
    await renderer?.showObject(index);
    selected = index;
    updateDevice();
    return renderer;
  } catch {
    status.textContent = 'This device couldn’t load. Choose a device to try again.';
    return null;
  } finally {
    preparing = false;
    wake();
  }
}

choices.addEventListener('click', async event => {
  const button = event.target.closest('button[data-device]');
  if (!button || preparing || handoff || playing || drag) return;
  returning = null;
  status.textContent = '';
  await selectDevice(Number(button.dataset.device));
  paint();
  if (event.detail === 0 && !grab.hidden) grab.focus({ preventScroll: true });
});

function startScan(position = null) {
  if (playing || handoff || preparing || completed) return;
  prepareChime();
  returning = null;
  manualPosition = position;
  for (const choice of buttons) choice.setAttribute('aria-disabled', 'true');
  grab.setAttribute('aria-disabled', 'true');
  if (fallback) {
    confirmScan();
    finishScan();
    return;
  }
  status.textContent = 'Scanning…';
  playing = true;
  startedAt = position || motion.matches ? performance.now() - SCAN_TIMING.contact * 1000 : null;
  wake();
}

grab.addEventListener('click', event => {
  if (event.detail === 0 || fallback) startScan();
});

grab.addEventListener('pointerdown', event => {
  if (!scene || !event.isPrimary || event.button !== 0 || playing || preparing || drag || completed) return;
  const targets = scene.getTargets();
  if (!targets) return;
  const bounds = viewport.getBoundingClientRect();
  returning = null;
  drag = {
    id: event.pointerId, home: targets.home,
    offsetX: targets.device.x - event.clientX + bounds.left,
    offsetY: targets.device.y - event.clientY + bounds.top
  };
  grab.setPointerCapture(event.pointerId);
});

function releaseDrag() {
  const active = drag;
  drag = null;
  if (grab.hasPointerCapture(active.id)) grab.releasePointerCapture(active.id);
  return active;
}

function moveDrag(event) {
  if (event.pointerId !== drag?.id) return;
  const bounds = viewport.getBoundingClientRect();
  const position = {
    x: event.clientX - bounds.left + drag.offsetX,
    y: event.clientY - bounds.top + drag.offsetY
  };
  drag.position = position;
  const { reader } = scene.getTargets();
  const close = Math.hypot((position.x - reader.x) / (reader.width * .55), (position.y - reader.y) / (reader.height * .48)) <= 1;
  if (close) {
    releaseDrag();
    startScan(position);
  }
  wake();
}

grab.addEventListener('pointermove', moveDrag);

function cancelDrag(event) {
  if (event.pointerId !== drag?.id) return;
  const active = releaseDrag();
  if (active.position && !motion.matches) returning = { position: active.position, target: active.home, start: performance.now() };
  wake();
}

grab.addEventListener('pointerup', event => {
  moveDrag(event);
  cancelDrag(event);
});
for (const type of ['pointercancel', 'lostpointercapture']) grab.addEventListener(type, cancelDrag);

const entrance = document.querySelector('.copy .scan-link');
const landing = () => window.RFIDLanding;
entrance.addEventListener('pointerenter', loadScene, { once: true });
entrance.addEventListener('focus', loadScene, { once: true });
entrance.addEventListener('click', async event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
  if (preparing || handoff) {
    event.preventDefault();
    return;
  }
  const pose = landing()?.getPose();
  if (!pose || completed || playing) return;
  event.preventDefault();
  entrance.setAttribute('aria-busy', 'true');
  const renderer = await selectDevice(pose.index);
  entrance.removeAttribute('aria-busy');
  const origin = landing().getPose(pose.index);
  if (location.hash !== '#scan-lab') history.pushState(null, '', '#scan-lab');
  if (!renderer || !origin || motion.matches) {
    sequence.scrollIntoView();
    stage.querySelector('#scan-title').focus({ preventScroll: true });
    wake();
    return;
  }
  const from = scrollY;
  const to = from + sequence.getBoundingClientRect().top;
  grab.hidden = true;
  viewport.classList.add('is-handoff');
  document.body.append(viewport);
  scene.drawHandoff(origin, 0);
  landing().hideObject(pose.index);
  handoff = { origin, start: performance.now(), from, to };
  wake();
});

function finishHandoff(arrived = true) {
  if (arrived) scrollTo({ top: handoff.to, behavior: 'instant' });
  handoff = null;
  viewport.classList.remove('is-handoff');
  stage.insertBefore(viewport, grab);
  landing().showObject();
  if (arrived) stage.querySelector('#scan-title').focus({ preventScroll: true });
}

addEventListener('popstate', () => {
  if (handoff) finishHandoff(false);
});

stage.querySelector('.scan-replay').addEventListener('click', () => {
  completed = detected = false;
  status.removeAttribute('data-success');
  status.textContent = fallback ? 'The 3D view is unavailable.' : '';
  for (const button of buttons) button.removeAttribute('aria-disabled');
  grab.removeAttribute('aria-disabled');
  choices.hidden = false;
  next.hidden = true;
  sequence.scrollIntoView({ block: 'start' });
  paint();
  grab.focus({ preventScroll: true });
});

stage.querySelector('.scan-inside-link').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  scrollBy({ top: sequence.getBoundingClientRect().top + depth.offsetHeight, behavior: 'instant' });
  paint();
  anatomy.querySelector('h2').focus({ preventScroll: true });
});

new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (inView) {
    loadScene();
    wake();
  }
}).observe(stage);
new ResizeObserver(wake).observe(viewport);
addEventListener('scroll', wake, { passive: true });
document.addEventListener('visibilitychange', wake);
motion.addEventListener('change', wake);
updateDevice();
