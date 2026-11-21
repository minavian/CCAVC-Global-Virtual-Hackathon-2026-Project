import { SCAN_TIMING } from './scan-timing.js';

const stage = document.querySelector('.scan-stage');
const sequence = stage.closest('.scan-sequence');
const experience = stage.parentElement;
const depth = sequence.querySelector('.scan-depth');
const story = sequence.querySelector('.story');
const track = sequence.querySelector('.track');
const viewport = stage.querySelector('.scan-view');
const preview = stage.querySelector('.scan-preview');
const revealPreview = stage.querySelector('.scan-reveal-preview');
const grab = stage.querySelector('.scan-grab');
const gesture = stage.querySelector('.scan-gesture');
const keyboardHint = stage.querySelector('.scan-keyboard');
const next = stage.querySelector('.scan-next');
const status = stage.querySelector('.scan-status');
const reveal = stage.querySelector('.scan-reveal');
const deep = document.querySelector('#take-apart');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const CARD = 2;
const READ_AREA = { width: .8, height: .72 };
const HINT_DURATION = 1800;
const clamp = amount => Math.max(0, Math.min(1, amount));
const mix = (a, b, amount) => a + (b - a) * amount;
const ease = amount => amount * amount * (3 - 2 * amount);
const cue = (value, start, end) => clamp((value - start) / (end - start));

let scene, loading, audio, frame = 0;
let inView = false, playing = false, completed = false, startedAt = null, detected = false;
let fallback = false, preparing = false, borrowed = false;
let drag, returning, manualPosition, handoff, scrollHandoff, retry, sectionFocus;
let hintTimer, hintStart, hinted = false, hovered = false, attention = 0, previousCueFrame;
let hoverX = 0, hoverY = 0;

function loadScene() {
  if (loading) return loading;
  status.textContent = 'Loading the card…';
  loading = import('./scan-scene.js').then(({ createScanScene }) => createScanScene(viewport, wake))
    .then(async renderer => {
      await renderer.showObject(CARD);
      scene = renderer;
      status.textContent = '';
      wake();
      return renderer;
    }).catch(error => {
      fallback = true;
      console.warn('Could not start the 3D scan. Showing a static preview.', error);
      grab.classList.add('is-fallback');
      stage.querySelector('#scan-instructions').textContent = 'Select Scan card to try the simulated scan.';
      keyboardHint.hidden = true;
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

function updateGrab() {
  const target = scene?.getTargets()?.device;
  grab.hidden = !fallback && (!target || preparing);
  if (!target || drag) return;
  const { x, y } = target;
  const width = Math.max(44, target.width), height = Math.max(44, target.height);
  Object.assign(grab.style, {
    left: `${x - width / 2}px`, top: `${y - height / 2}px`,
    width: `${width}px`, height: `${height}px`
  });
}

function readerDistance(position, reader) {
  const radiusX = reader.width * READ_AREA.width / 2;
  const radiusY = reader.height * READ_AREA.height / 2;
  return Math.hypot((position.x - reader.x) / radiusX, (position.y - reader.y) / radiusY);
}

function stopHint() {
  clearTimeout(hintTimer);
  hintTimer = hintStart = null;
  gesture.hidden = true;
}

function queueHint(delay) {
  if (motion.matches || hintTimer || hintStart != null) return;
  hintTimer = setTimeout(() => {
    hintTimer = null;
    if (!inView || document.hidden || preparing || handoff || retry || drag || playing || completed || grab.hidden) return;
    if (stage.getBoundingClientRect().top > stage.clientHeight * .18) return;
    hintStart = performance.now();
    hinted = true;
    wake();
  }, delay);
}

function paintGuidance(now, position) {
  const targets = scene?.getTargets();
  const goal = Number(!!drag || hovered);
  const elapsed = Math.max(0, now - (previousCueFrame ?? now - 16));
  previousCueFrame = now;
  attention = motion.matches ? goal : mix(attention, goal, 1 - Math.exp(-elapsed / 75));
  if (Math.abs(attention - goal) < .02) attention = goal;

  const distance = position && targets ? readerDistance(position, targets.reader) : Infinity;
  const proximity = clamp((3.2 - distance) / 2.2);
  let inviting = 0;
  if (targets && hintStart != null && !motion.matches) {
    const progress = cue(now, hintStart, hintStart + HINT_DURATION);
    if (progress === 1) stopHint();
    else {
      const { device, reader } = targets;
      const travel = .92 * ease(cue(progress, .16, .83));
      const x = mix(device.x - device.width * .12, reader.x, travel);
      const y = mix(device.y + device.height * .10, reader.y, travel);
      const opacity = ease(cue(progress, 0, .16)) * (1 - ease(cue(progress, .84, 1)));
      gesture.hidden = false;
      gesture.style.opacity = opacity * .94;
      gesture.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${mix(1, .76, travel)})`;
      inviting = Math.sin(Math.PI * progress);
    }
  }
  const hoverWave = hovered && !drag ? Math.sin(now / 900) : 0;
  return { attention, proximity, inviting, hoverX, hoverY, hoverWave };
}

function confirmScan() {
  detected = true;
  status.setAttribute('data-success', '');
  status.textContent = 'Simulated scan successful';
  chime();
}

function finishScan() {
  const moveFocus = document.activeElement === grab;
  playing = false;
  manualPosition = null;
  completed = true;
  depth.hidden = track.hidden = deep.hidden = false;
  keyboardHint.hidden = true;
  paint();
  if (moveFocus) {
    (story.hidden ? reveal : story.querySelector('.chapters button')).focus({ preventScroll: true });
  }
}

function placeViewport(fixed) {
  if (fixed === viewport.classList.contains('is-handoff')) return;
  viewport.classList.toggle('is-handoff', fixed);
  if (fixed) document.body.append(viewport);
  else stage.insertBefore(viewport, gesture);
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

  if (paintScrollHandoff()) return;

  if (playing) {
    startedAt ??= now;
    const seconds = (now - startedAt) / 1000;
    const end = motion.matches ? SCAN_TIMING.contact + .65 : SCAN_TIMING.end;
    if (!detected && seconds >= SCAN_TIMING.contact) confirmScan();
    if (seconds >= end) finishScan();
    else {
      const opacity = motion.matches ? 0 : ease(cue(seconds, SCAN_TIMING.reveal, end));
      reveal.hidden = opacity === 0;
      reveal.style.setProperty('--reveal-opacity', opacity);
      stage.style.setProperty('--scan-chrome', motion.matches ? 1 : 1 - ease(cue(seconds, SCAN_TIMING.burst, SCAN_TIMING.reveal)));
      scene?.drawScan(seconds, motion.matches, manualPosition, !!manualPosition);
    }
    return;
  }

  if (retry) {
    const amount = cue(now, retry.start, retry.start + 680);
    if (amount < 1 && !motion.matches) {
      const position = ease(amount);
      reveal.style.setProperty('--reveal-opacity', 1 - position);
      stage.style.setProperty('--scan-chrome', position);
      scene.drawHandoff(retry.origin, position);
      return;
    }
    retry = null;
    stage.style.removeProperty('--scan-chrome');
    sectionFocus = grab;
  }

  placeViewport(false);
  const travel = completed ? -sequence.getBoundingClientRect().top : 0;
  const entry = depth.offsetHeight;
  // Scroll offsets can land on a fractional pixel at the end of the handoff.
  const inStory = completed && travel >= entry - 1;
  const progress = completed ? (inStory ? 1 : clamp(travel / entry)) : 0;
  const blend = motion.matches ? Number(inStory) : ease(cue(progress, .12, 1));
  const target = landing()?.setStoryProgress(blend, Math.max(0, (travel - entry) / experience.clientHeight));
  stage.dataset.view = completed ? 'reveal' : 'pick';
  stage.hidden = inStory;
  story.hidden = !inStory;
  preview.hidden = !fallback || completed;
  revealPreview.hidden = !fallback || !completed || inStory;
  revealPreview.style.opacity = 1 - blend;
  reveal.hidden = next.hidden = !completed || inStory;
  reveal.style.setProperty('--reveal-opacity', 1 - ease(cue(progress, .04, .64)));
  next.style.opacity = 1 - ease(cue(progress, .05, .45));
  next.inert = progress > .45;
  if (inStory) {
    if (borrowed) restoreLandingCard();
    if (sectionFocus === story) {
      story.querySelector('.chapters button').focus({ preventScroll: true });
      sectionFocus = null;
    }
    return;
  }

  if (borrowed && scrollY <= 1) restoreLandingCard();
  if (!inView) return;
  if (completed) {
    grab.hidden = gesture.hidden = true;
    if (scene && !borrowed && travel >= 0) borrowLandingCard(false);
    scene?.drawStory(blend, target);
  } else {
    let position = drag?.position;
    if (returning) {
      const amount = Math.min(1, Math.max(0, (now - returning.start) / 220));
      const target = returning.target;
      if (amount === 1) returning = null;
      else position = { x: mix(returning.position.x, target.x, ease(amount)), y: mix(returning.position.y, target.y, ease(amount)) };
    }
    if (scene) scene.drawScan(0, motion.matches, position, true, paintGuidance(now, position));
    updateGrab();
    if (!hinted && !grab.hidden && scene) queueHint(900);
    if (sectionFocus === grab && !grab.hidden) {
      grab.focus({ preventScroll: true });
      sectionFocus = null;
    }
  }
}

function wake() {
  if (frame || (!inView && !playing && !handoff && !borrowed && !completed) || document.hidden) return;
  frame = requestAnimationFrame(now => {
    frame = 0;
    paint(now);
    const easingCard = inView && !scrollHandoff && !completed && (attention !== Number(!!drag || hovered) || (hovered && !drag && !motion.matches));
    if (playing || handoff || returning || retry || hintStart != null || easingCard) wake();
  });
}

function startScan(position = null) {
  if (playing || handoff || preparing || completed) return;
  if (!position) sequence.scrollIntoView({ block: 'start', behavior: 'instant' });
  stopHint();
  attention = 0;
  hovered = false;
  prepareChime();
  returning = null;
  manualPosition = position;
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
  else if (!playing && !completed && !returning) queueHint(150);
});

grab.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!event.repeat) startScan();
});

grab.addEventListener('pointerenter', event => {
  if (event.pointerType === 'touch' || playing || completed) return;
  hovered = true;
  wake();
});

grab.addEventListener('pointermove', event => {
  if (!hovered || drag || event.pointerType === 'touch') return;
  const rect = grab.getBoundingClientRect();
  hoverX = clamp((event.clientX - rect.left) / rect.width) * 2 - 1;
  hoverY = clamp((event.clientY - rect.top) / rect.height) * 2 - 1;
  wake();
});

grab.addEventListener('pointerleave', () => {
  hovered = false;
  hoverX = hoverY = 0;
  wake();
});

grab.addEventListener('pointerdown', event => {
  if (!scene || !event.isPrimary || event.button !== 0 || playing || preparing || drag || completed) return;
  const targets = scene.getTargets();
  if (!targets) return;
  const bounds = viewport.getBoundingClientRect();
  returning = null;
  hinted = true;
  stopHint();
  status.textContent = '';
  prepareChime();
  drag = {
    id: event.pointerId, home: targets.home,
    offsetX: targets.device.x - event.clientX + bounds.left,
    offsetY: targets.device.y - event.clientY + bounds.top
  };
  grab.setPointerCapture(event.pointerId);
  wake();
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
  const close = readerDistance(position, reader) <= 1;
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
  if (event.type === 'pointerup' && active.position) {
    const distance = readerDistance(active.position, scene.getTargets().reader);
    if (distance < 2.3) status.textContent = 'A little closer.';
    else queueHint(520);
  }
  wake();
}

grab.addEventListener('pointerup', event => {
  moveDrag(event);
  cancelDrag(event);
});
for (const type of ['pointercancel', 'lostpointercapture']) grab.addEventListener(type, cancelDrag);

const entrance = document.querySelector('.copy .scan-link');
const landing = () => window.RFIDLanding;

function borrowLandingCard(fromHero = true) {
  if (borrowed || !scene) return null;
  const source = landing();
  const origin = fromHero ? source?.getPose(CARD) : null;
  if (fromHero && !origin) return null;
  const card = source?.borrowCard();
  if (!card) return null;
  borrowed = true;
  scene.showObject(CARD, card);
  return origin;
}

function restoreLandingCard() {
  if (!borrowed) return;
  scene.releaseObject();
  landing()?.returnCard();
  borrowed = false;
  return scene.showObject(CARD).then(wake);
}

function paintScrollHandoff() {
  if (!scene || handoff || preparing || playing || completed || retry) return false;
  const top = sequence.getBoundingClientRect().top;
  if (top <= 0 || top >= stage.clientHeight || motion.matches) {
    scrollHandoff = null;
    return false;
  }
  if (!scrollHandoff) {
    const origin = borrowLandingCard();
    if (!origin) return false;
    scrollHandoff = { origin, top };
  }
  const progress = clamp(1 - top / scrollHandoff.top);
  const origin = { ...scrollHandoff.origin, y: scrollHandoff.origin.y + Math.max(0, top - scrollHandoff.top) };
  grab.hidden = gesture.hidden = true;
  placeViewport(true);
  scene.drawHandoff(origin, ease(progress));
  return true;
}

entrance.addEventListener('pointerenter', loadScene, { once: true });
entrance.addEventListener('focus', loadScene, { once: true });
entrance.addEventListener('click', async event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
  if (preparing || handoff) {
    event.preventDefault();
    return;
  }
  if (completed || playing || scrollHandoff) return;
  event.preventDefault();
  preparing = true;
  entrance.setAttribute('aria-busy', 'true');
  const [renderer] = await Promise.all([loadScene(), landing()?.featureCard()]);
  preparing = false;
  entrance.removeAttribute('aria-busy');
  const origin = borrowLandingCard();
  landing()?.releaseFeature();
  if (location.hash !== '#scan-lab') history.pushState(null, '', '#scan-lab');
  if (!renderer || !origin || motion.matches) {
    sequence.scrollIntoView();
    stage.querySelector('#scan-title').focus({ preventScroll: true });
    wake();
    return;
  }
  const from = scrollY;
  const to = from + sequence.getBoundingClientRect().top;
  grab.hidden = gesture.hidden = true;
  placeViewport(true);
  scene.drawHandoff(origin, 0);
  handoff = { origin, start: performance.now(), from, to };
  wake();
});

function finishHandoff(arrived = true) {
  if (arrived) scrollTo({ top: handoff.to, behavior: 'instant' });
  handoff = null;
  placeViewport(false);
  if (!arrived) restoreLandingCard();
  if (arrived) stage.querySelector('#scan-title').focus({ preventScroll: true });
}

addEventListener('popstate', () => {
  if (handoff) finishHandoff(false);
});

stage.querySelector('.scan-replay').addEventListener('click', () => {
  const origin = scene?.getDevicePose();
  completed = detected = false;
  hinted = false;
  depth.hidden = track.hidden = deep.hidden = true;
  sectionFocus = null;
  status.removeAttribute('data-success');
  status.textContent = fallback ? 'The 3D view is unavailable.' : '';
  grab.removeAttribute('aria-disabled');
  keyboardHint.hidden = fallback;
  next.hidden = true;
  stage.dataset.view = 'pick';
  sequence.scrollIntoView({ block: 'start' });
  if (origin && !motion.matches) {
    retry = { origin, start: performance.now() };
    wake();
    return;
  }
  stage.style.removeProperty('--scan-chrome');
  paint();
  grab.focus({ preventScroll: true });
});

stage.querySelector('.scan-story-link').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  sectionFocus = story;
  scrollTo({ top: scrollY + track.getBoundingClientRect().top - experience.clientHeight,
    behavior: motion.matches ? 'instant' : 'smooth' });
  wake();
});

new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (inView) {
    loadScene();
    wake();
  } else stopHint();
}).observe(experience);
new ResizeObserver(wake).observe(viewport);
addEventListener('scroll', wake, { passive: true });
document.addEventListener('visibilitychange', wake);
motion.addEventListener('change', () => { stopHint(); wake(); });
