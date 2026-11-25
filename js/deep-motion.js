const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const viewportWidth = () => document.body.clientWidth;

function watchPartOne(word, part) {
  const chapter = part.closest('.deep');
  const opener = word.closest('.deep-head');
  const root = document.documentElement;
  const cover = document.createElement('span');
  cover.className = 'deep-blink-cover';
  cover.setAttribute('aria-hidden', 'true');
  const motionAllowed = () => !reducedMotion.matches && !document.hidden;
  const normal = { color: 'var(--ink)', backgroundColor: 'transparent' };
  const inverted = { color: 'var(--paper)', backgroundColor: 'var(--ink)' };
  const sceneHold = 1000;
  let partTop = bounds(part, scrollY).y;
  let animation, holdTimer;
  const active = () => !!animation || holdTimer !== undefined;

  function releaseHold() {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    root.classList.remove('deep-blink-hold', 'deep-reverse-hold');
    scheduleMotion();
  }

  function interrupt() {
    if (!active()) return;
    animation?.cancel();
    cover.remove();
    releaseHold();
  }

  async function blink() {
    try {
      sanitizeChapter();
      root.classList.add('deep-blink-hold');
      animation = word.animate([
        normal, { ...normal, offset: .10 }, { ...inverted, offset: .14 },
        { ...inverted, offset: .27 }, { ...normal, offset: .32 },
        { ...normal, offset: .48 }, { ...inverted, offset: .53 },
        { ...inverted, offset: .66 }, { ...normal, offset: .72 }, normal,
      ], { duration: sceneHold });
      await animation.finished;
      if (!motionAllowed()) return;

      chapter.append(cover);
      const close = cover.animate({ opacity: [0, 1] }, { duration: 135, easing: 'ease-in', fill: 'forwards' });
      animation = close;
      await close.finished;
      if (!motionAllowed()) return;

      // Move to the existing title while the viewport is fully covered.
      part.scrollIntoView({ block: 'start', behavior: 'instant' });
      animation = cover.animate([
        { opacity: 1 }, { opacity: 1, offset: .16, easing: 'ease-out' }, { opacity: 0 },
      ], { duration: 265, fill: 'both' });
      close.cancel();
      await animation.finished;
      holdTimer = setTimeout(releaseHold, sceneHold);
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    } finally {
      animation?.cancel();
      cover.remove();
      animation = null;
      if (holdTimer === undefined) releaseHold();
    }
  }

  async function reverseBlink() {
    try {
      sanitizeChapter();
      root.classList.add('deep-reverse-hold');
      chapter.append(cover);
      const close = cover.animate({ opacity: [0, 1] }, { duration: 130, easing: 'ease-in', fill: 'forwards' });
      animation = close;
      await close.finished;
      if (!motionAllowed()) return;

      opener.scrollIntoView({ block: 'start', behavior: 'instant' });
      animation = cover.animate([
        { opacity: 1 }, { opacity: 1, offset: .14, easing: 'ease-out' }, { opacity: 0 },
      ], { duration: 250, fill: 'both' });
      close.cancel();
      await animation.finished;
      if (!motionAllowed()) return;

      animation = word.animate([
        normal, { ...inverted, offset: .24 }, { ...normal, offset: .52 }, normal,
      ], { duration: 420 });
      await animation.finished;
      holdTimer = setTimeout(releaseHold, 320);
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    } finally {
      animation?.cancel();
      cover.remove();
      animation = null;
      if (holdTimer === undefined) releaseHold();
    }
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure) partTop = bounds(part, top).y;
    if (active() && !motionAllowed()) interrupt();
  });
  addEventListener('hashchange', interrupt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) interrupt(); });

  return {
    forward() {
      if (!motionAllowed() || active()) return;
      partTop = bounds(part, scrollY).y;
      const openEnd = Math.max(bounds(opener, scrollY).y, partTop - innerHeight);
      if (Math.abs(scrollY - openEnd) > 2) scrollTo({ top: openEnd, behavior: 'instant' });
      void blink();
    },
    reverse() {
      if (!motionAllowed() || active()) return;
      void reverseBlink();
    },
    cancel: interrupt,
    active,
  };
}

const scrollMotions = [];
const arrivalEase = 'cubic-bezier(.16, 1, .3, 1)';
const clamp = n => Math.min(1, Math.max(0, n));
const mix = (a, b, t) => a + (b - a) * t;
const stage = (start, end, value) => clamp((value - start) / (end - start));
const ease = (start, end, value) => {
  const t = stage(start, end, value);
  return t * t * (3 - 2 * t);
};
let motionFrame = 0;
let measureMotions = true;

function bounds(node, top) {
  const rect = node.getBoundingClientRect();
  return { x: rect.left, y: rect.top + top, w: rect.width, h: rect.height };
}

function scheduleMotion() {
  if (motionFrame) return;
  motionFrame = requestAnimationFrame(() => {
    motionFrame = 0;
    const top = scrollY, height = innerHeight;
    for (const update of scrollMotions) update(top, height, measureMotions);
    measureMotions = false;
  });
}

export function watchScrollMotion(update) {
  if (!scrollMotions.length) {
    const measure = () => { measureMotions = true; scheduleMotion(); };
    addEventListener('scroll', scheduleMotion, { passive: true });
    for (const event of ['resize', 'pageshow', 'hashchange']) addEventListener(event, measure);
    document.addEventListener('visibilitychange', measure);
    document.fonts?.ready.then(measure);
    reducedMotion.addEventListener('change', measure);
  }
  scrollMotions.push(update);
  scheduleMotion();
}

const ALL_HOLD_CLASSES = [
  'deep-blink-hold', 'deep-closer-hold', 'deep-flipping-hold', 'deep-tuning-hold',
  'deep-metal-hold', 'deep-pauses-hold', 'deep-part-two-hold', 'deep-soaking-hold',
  'deep-whispering-hold', 'deep-counting-hold', 'deep-mistakes-hold', 'deep-conversation-hold',
  'deep-twocards-hold', 'deep-carkey-hold', 'deep-finale-hold', 'deep-reverse-hold',
];
const ALL_STAGED_CLASSES = [
  's8-awaiting', 's9-entering',
  's10-awaiting', 's10-entering', 's12-staged', 's12-title-in-flight',
  's15-staged', 's16-staged', 's17-staged', 'deep-end-staged', 'deep-rev-staged',
];
const STRAY_OVERLAY_SELECTOR = [
  '.deep-rev-copy', '.deep-blink-cover', '.s7-trace-handoff', '.s9-plot-copy', '.part-two-reveal', '.part-two-reverse-cover',
  '.s12-vortex', '.s13-spectrum-copy', '.s14-timing-copy',
  '.s15-handoff-copy', '.s16-handoff-copy', '.s16-title-morph', '.s17-handoff-copy', '.s17-portal-wallet',
].join(', ');

function sanitizeChapter() {
  const root = document.documentElement;
  root.classList.remove(...ALL_HOLD_CLASSES);
  for (const cls of ALL_STAGED_CLASSES) {
    for (const el of document.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
  }
  for (const node of document.querySelectorAll(STRAY_OVERLAY_SELECTOR)) node.remove();
  for (const id of ['s6-chart', 's7-chart', 's8-chart', 's9-chart', 's10-chart', 's11-chart', 's12-chart', 's13-chart', 's14-chart', 's15-chart', 's16-chart', 's17-chart']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.removeProperty('opacity');
    el.style.removeProperty('clip-path');
    el.style.removeProperty('mask-image');
    el.style.removeProperty('transform');
    el.style.removeProperty('--s8-plot-opacity');
    el.style.removeProperty('--s13-spectrum-opacity');
    el.style.removeProperty('--s15-river-opacity');
    el.style.removeProperty('--s16-chart-opacity');
  }
  for (const id of ['s14', 's15', 's16-wallet', 's16-title']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.removeProperty('visibility');
    el.style.removeProperty('opacity');
    el.style.removeProperty('--s15-source-opacity');
    el.style.removeProperty('--s16-source-opacity');
  }
  for (const el of document.querySelectorAll('.plate-words, .plate-words > *, .s16-desk, #s14-replies > *, #deep-end > *')) {
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
    el.style.removeProperty('filter');
  }
}

function runReverseCanvasMorph(fromEl, toEl, { mode = 'default', cut = 430, arrivalEnd = 1040, readHold = 360, onDone, arrivalCopy } = {}) {
  const root = document.documentElement, chapter = fromEl.closest('.deep');
  const fromWords = fromEl.querySelector('.plate-words')?.children;
  const toWords = arrivalCopy ?? toEl.querySelector('.plate-words')?.children;
  const fromCanvas = fromEl.querySelector('canvas'), toCanvas = toEl.querySelector('canvas');
  if (!chapter || !fromWords || !toWords) {
    toEl.scrollIntoView({ block: 'start', behavior: 'instant' });
    onDone?.();
    return { active: () => false, cancel: () => {} };
  }

  sanitizeChapter();
  const originTop = bounds(fromEl, scrollY).y;
  if (Math.abs(scrollY - originTop) > 2) scrollTo({ top: originTop, behavior: 'instant' });
  const destination = bounds(toEl, scrollY).y;

  const copy = document.createElement('canvas');
  copy.className = 'deep-rev-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const width = viewportWidth(), height = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  copy.width = Math.round(width * dpr);
  copy.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = ctx.lineJoin = 'round';

  const fromBox = fromCanvas ? bounds(fromCanvas, originTop) : { x: width * .5, y: originTop + height * .25, w: 320, h: 180 };
  const fromView = { x: fromBox.x, y: fromBox.y - originTop, w: Math.max(40, fromBox.w), h: Math.max(40, fromBox.h) };
  const toBoxRaw = toCanvas ? bounds(toCanvas, originTop) : { x: width * .5, y: destination + height * .25, w: 320, h: 180 };
  const toView = { x: toBoxRaw.x, y: toBoxRaw.y - destination, w: Math.max(40, toBoxRaw.w), h: Math.max(40, toBoxRaw.h) };

  let snap = null;
  if (fromCanvas && fromCanvas.width > 0 && fromCanvas.height > 0) {
    snap = document.createElement('canvas');
    snap.width = fromCanvas.width;
    snap.height = fromCanvas.height;
    snap.getContext('2d')?.drawImage(fromCanvas, 0, 0);
  }

  let titleMorph = null;
  if (mode === 'whispering') {
    const outTitle = fromEl.querySelector('h3'), inTitle = toEl.querySelector('h3');
    if (outTitle && inTitle) {
      const ftb = bounds(outTitle, originTop), ttb = bounds(inTitle, originTop);
      const wrap = document.createElement('div');
      wrap.className = 's16-title-morph';
      wrap.setAttribute('aria-hidden', 'true');
      const outLayer = document.createElement('div');
      outLayer.className = 's16-title-layer';
      outLayer.textContent = outTitle.textContent;
      outLayer.style.width = `${Math.max(180, ftb.w)}px`;
      const inLayer = document.createElement('div');
      inLayer.className = 's16-title-layer';
      inLayer.textContent = inTitle.textContent;
      inLayer.style.width = `${Math.max(180, ttb.w)}px`;
      wrap.append(outLayer, inLayer);
      chapter.append(wrap);
      titleMorph = {
        wrap, outLayer, inLayer,
        from: { x: ftb.x, y: ftb.y - originTop },
        to: { x: ttb.x, y: ttb.y - destination },
      };
    }
  }

  const animations = [];
  let frame = 0, landed = false, topPin = originTop, activeFlag = true;
  const started = performance.now();

  root.classList.add('deep-reverse-hold');
  toEl.classList.add('deep-rev-staged');
  if (fromCanvas) fromCanvas.style.opacity = '0';
  if (toCanvas) toCanvas.style.opacity = '0';
  chapter.append(copy);

  const textBlur = 'blur(3px)';
  for (const [i, node] of Array.from(fromWords).entries()) {
    animations.push(node.animate([
      { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      { opacity: 0, transform: 'translateY(11px)', filter: textBlur },
    ], { duration: 320, delay: i * 24, easing: 'ease-in', fill: 'both' }));
  }

  function clear() {
    if (!activeFlag) return;
    cancelAnimationFrame(frame);
    frame = 0;
    activeFlag = false;
    animations.forEach(a => a.cancel());
    copy.remove();
    titleMorph?.wrap?.remove();
    toEl.classList.remove('deep-rev-staged');
    fromCanvas?.style.removeProperty('opacity');
    toCanvas?.style.removeProperty('opacity');
    root.classList.remove('deep-reverse-hold');
    scheduleMotion();
    onDone?.();
  }

  function land() {
    landed = true;
    scrollTo({ top: destination, behavior: 'instant' });
    topPin = scrollY;
    toEl.classList.remove('deep-rev-staged');
    for (const [i, node] of Array.from(toWords).entries()) {
      if (mode === 'whispering' && i === 1) continue;
      animations.push(node.animate([
        { opacity: 0, transform: 'translateY(-10px)', filter: textBlur },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: 380, delay: 40 + i * 38, easing: arrivalEase, fill: 'both' }));
    }
  }

  function draw(elapsed) {
    if (Math.abs(scrollY - topPin) > 1 && Math.abs(scrollY - topPin) < height * .95) {
      scrollTo({ top: topPin, behavior: 'instant' });
    }
    const carry = ease(40, arrivalEnd - 180, elapsed);
    const arc = Math.sin(Math.PI * carry) * -18;
    const cx = mix(fromView.x, toView.x, carry);
    const cy = mix(fromView.y, toView.y, carry) + arc;
    const cw = mix(fromView.w, toView.w, carry);
    const ch = mix(fromView.h, toView.h, carry);
    const snapAlpha = 1 - ease(cut + 140, arrivalEnd - 40, elapsed);

    ctx.clearRect(0, 0, width, height);
    if (snap && snapAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = snapAlpha;
      ctx.drawImage(snap, cx, cy, cw, ch);
      ctx.restore();
    }

    if (mode === 'tuning' || mode === 'pauses') {
      const waveFade = ease(120, 360, elapsed) * (1 - ease(cut + 180, arrivalEnd, elapsed));
      if (waveFade > 0) {
        ctx.save();
        ctx.globalAlpha = waveFade * .72;
        ctx.strokeStyle = '#b8652a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 36; i++) {
          const u = i / 36;
          const px = cx + u * cw;
          const py = cy + ch * .5 + Math.sin(u * Math.PI * 3 - elapsed * .005) * (1 - carry) * 14;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    if (titleMorph?.wrap?.isConnected) {
      const m = ease(40, arrivalEnd - 140, elapsed);
      const tx = mix(titleMorph.from.x, titleMorph.to.x, m);
      const ty = mix(titleMorph.from.y, titleMorph.to.y, m);
      titleMorph.outLayer.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      titleMorph.outLayer.style.opacity = String(1 - ease(60, cut + 60, elapsed));
      titleMorph.outLayer.style.filter = `blur(${(ease(60, cut + 60, elapsed) * 6).toFixed(2)}px)`;
      const inO = ease(cut - 60, arrivalEnd - 140, elapsed);
      titleMorph.inLayer.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      titleMorph.inLayer.style.opacity = String(inO);
      titleMorph.inLayer.style.filter = `blur(${((1 - inO) * 6).toFixed(2)}px)`;
    }

    if (landed && toCanvas) {
      toCanvas.style.opacity = String(ease(cut + 140, arrivalEnd, elapsed));
    }
  }

  function step(now) {
    if (!activeFlag) return;
    const elapsed = now - started;
    if (elapsed >= cut && !landed) land();
    if (elapsed < arrivalEnd) draw(elapsed);
    else if (copy.isConnected) {
      copy.remove();
      titleMorph?.wrap?.remove();
      toCanvas?.style.removeProperty('opacity');
    }
    if (elapsed >= arrivalEnd + readHold) return clear();
    frame = requestAnimationFrame(step);
  }
  frame = requestAnimationFrame(step);

  return {
    active: () => activeFlag,
    cancel: clear,
  };
}

function watchCloser(source, plate) {
  const part = source.closest('.deep-part');
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const title = plate.querySelector('#s6-title');
  const controls = plate.querySelector('.plate-controls');
  const distanceDemo = plate.querySelector('.s6-distance-demo');
  const rows = Array.from(controls.querySelectorAll('.s6-control'));
  const chart = plate.querySelector('#s6-chart');
  const drawDuration = 1150;
  const readHold = 1000;
  const motions = [];
  const traveledTitle = document.createElement('span');
  traveledTitle.className = 'deep-part-title s6-title-travel';
  traveledTitle.textContent = source.textContent;
  traveledTitle.setAttribute('aria-hidden', 'true');

  let partTop, plateTop, lockedAt, awaitingChart, returning;
  let frame = 0;
  const locked = () => lockedAt !== undefined;
  const canPlay = () => !reducedMotion.matches && !document.hidden;

  function release() {
    for (const motion of motions) motion.cancel();
    motions.length = 0;
    traveledTitle.remove();
    lockedAt = undefined;
    returning = false;
    root.classList.remove('deep-closer-hold');
    scheduleMotion();
  }

  function settle() {
    if (!locked() && !awaitingChart && !frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    awaitingChart = false;
    chart.setReveal?.(1);
    release();
  }

  function drawingPosition(height) {
    const box = chart.getBoundingClientRect();
    const visible = Math.min(height, box.bottom) - Math.max(0, box.top);
    return visible >= Math.min(height, box.height) * .85;
  }

  function playCloser(goingBack) {
    sanitizeChapter();
    settle();
    partTop = bounds(part, scrollY).y;
    plateTop = bounds(plate, scrollY).y;
    scrollTo({ top: goingBack ? plateTop : partTop, behavior: 'instant' });
    const from = source.getBoundingClientRect(), to = title.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight);
    const fromTop = from.top + (from.height - lineHeight) / 2 + (goingBack ? scrollY - partTop : 0);
    const toTop = to.top + (goingBack ? 0 : scrollY - plateTop);
    const ratio = parseFloat(getComputedStyle(title).fontSize) / parseFloat(getComputedStyle(source).fontSize);
    const gathered = `translate(${to.left - from.left}px, ${toTop - fromTop}px) scale(${ratio})`;
    const chartFits = chart.getBoundingClientRect().bottom + scrollY - plateTop <= innerHeight + 2;
    const started = performance.now();
    const titleSwap = 260, wordsEnd = 1610, drawAt = 860;
    const pace = goingBack ? .58 : 1;
    const seatAt = goingBack ? (wordsEnd - titleSwap) * pace : titleSwap;
    const releaseAt = goingBack ? wordsEnd * pace + 300 : (chartFits ? drawAt + drawDuration : wordsEnd) + readHold;

    lockedAt = scrollY;
    returning = goingBack;
    awaitingChart = !goingBack && !chartFits;
    root.classList.add('deep-closer-hold');
    traveledTitle.style.left = `${from.left}px`;
    traveledTitle.style.top = `${fromTop}px`;
    chapter.append(traveledTitle);
    if (goingBack) motions.push(chart.animate({ opacity: [1, 0] }, { duration: 420, fill: 'both', easing: 'ease-in-out' }));
    else chart.setReveal?.(0);

    function animate(node, frames, duration, delay = 0, easing = arrivalEase) {
      // Mirror the typography cues around the end of the forward entrance.
      const start = goingBack ? wordsEnd - delay - duration : delay;
      motions.push(node.animate(frames, {
        duration: duration * pace, delay: start * pace, direction: goingBack ? 'reverse' : 'normal', easing, fill: 'both',
      }));
    }

    animate(traveledTitle, [
      { transform: 'none', opacity: 1, easing: 'cubic-bezier(.42, .08, .24, 1)' },
      { transform: gathered, opacity: 1, offset: .80 },
      { transform: `${gathered} perspective(280px) rotateX(70deg) scaleY(.74)`, opacity: 0 },
    ], 720, 40, 'linear');
    for (const node of [part.firstElementChild, source.parentElement]) {
      animate(node, [{ opacity: 1 }, { opacity: 0 }], titleSwap, 0, 'ease-in-out');
    }
    animate(source, [{ opacity: 0 }, { opacity: 0 }], titleSwap);

    const turnIn = [
      { opacity: 0, transform: 'perspective(360px) rotateX(-58deg) translateY(7px)', filter: 'blur(2px)' },
      { opacity: 1, transform: 'none', filter: 'none' },
    ];
    animate(title, turnIn, 380, 744);
    // Start at the heading and let the supporting lines turn outward above and below it.
    const copy = plate.querySelectorAll('.plate-num, .s6-intro, .s6-control-text, .s6-distance-demo, .plate-readout, .plate-real');
    copy.forEach((node, i) => animate(node, turnIn, 350, 800 + i * 76));
    rows.forEach((row, i) => animate(row.querySelector('input'), [
      { clipPath: 'inset(-5px 100% -5px -5px)' }, { clipPath: 'inset(-5px)' },
    ], 390, 980 + i * 74));

    let seated = false;
    function tick(now) {
      const elapsed = now - started;
      if (!seated && elapsed >= seatAt) {
        seated = true;
        const destination = goingBack ? part : plate;
        destination.scrollIntoView({ block: 'start', behavior: 'instant' });
        lockedAt = scrollY;
      }
      if (!goingBack && chartFits && elapsed >= drawAt) chart.setReveal?.(stage(drawAt, drawAt + drawDuration, elapsed));
      if (elapsed >= releaseAt) {
        frame = 0;
        release();
        return;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure || partTop === undefined) {
      partTop = bounds(part, top).y;
      plateTop = bounds(plate, top).y;
    }

    if (!canPlay() || (locked() && Math.abs(top - lockedAt) > height * .95) || (awaitingChart && !locked() && top < plateTop - 2)) settle();
    else if (locked() && Math.abs(top - lockedAt) > 1) scrollTo({ top: lockedAt, behavior: 'instant' });

    if (!awaitingChart || locked() || !drawingPosition(height)) return;
    awaitingChart = false;
    const started = performance.now();
    function draw(now) {
      const progress = stage(0, drawDuration, now - started);
      chart.setReveal?.(progress);
      frame = progress < 1 ? requestAnimationFrame(draw) : 0;
    }
    frame = requestAnimationFrame(draw);
  });

  for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, settle);
  for (const event of ['focusin', 'pointerdown']) distanceDemo.addEventListener(event, settle);
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, settle);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settle(); });

  return {
    forward: () => canPlay() && playCloser(false),
    reverse: () => canPlay() && playCloser(true),
    cancel: settle,
    active: () => locked() || !!frame,
  };
}

function watchFlipping(previous, plate) {
  const root = document.documentElement;
  const source = previous.querySelector('#s6-chart'), target = plate.querySelector('#s7-chart');
  const overlay = document.createElement('canvas');
  overlay.className = 's7-trace-handoff';
  overlay.setAttribute('aria-hidden', 'true');
  const ctx = overlay.getContext('2d');
  const duration = 900, readHold = 1000;
  let run, frame;

  const canPlay = () => !reducedMotion.matches && !document.hidden;

  function cancel() {
    if (!run) return;
    cancelAnimationFrame(frame);
    run = undefined;
    overlay.remove();
    for (const scene of [previous, plate]) {
      scene.style.removeProperty('--s7-scene-opacity');
      scene.style.removeProperty('--s7-title-offset');
    }
    root.classList.remove('deep-flipping-hold');
    scheduleMotion();
  }

  function render() {
    const { position, before, after, from, to, width, height } = run;
    const t = position / duration;
    const outgoing = ease(.04, .36, t), incoming = ease(.64, .96, t);
    previous.style.setProperty('--s7-scene-opacity', 1 - outgoing);
    previous.style.setProperty('--s7-title-offset', `${-12 * outgoing}px`);
    plate.style.setProperty('--s7-scene-opacity', incoming);
    plate.style.setProperty('--s7-title-offset', `${12 * (1 - incoming)}px`);
    const top = t < .5 ? before : after;
    if (Math.abs(scrollY - top) > 1) scrollTo({ top, behavior: 'instant' });
    run.top = scrollY;

    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const alpha = outgoing * (1 - incoming);
    const start = source.transitionTraces, finish = target.transitionTraces;
    if (!alpha || !start || !finish) return;
    const travel = ease(.22, .76, t), shape = ease(.32, .74, t);
    ctx.globalAlpha = alpha;
    start.forEach((trace, index) => {
      const next = finish[index];
      const startY = from.y + trace.box.y, endY = to.y + next.box.y;
      const baseline = mix(startY + trace.box.h / 2, endY + next.box.h / 2, travel);
      ctx.strokeStyle = trace.color;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        const x = mix(from.x + trace.box.x + trace.box.w * u, to.x + next.box.x + next.box.w * u, travel);
        const y = baseline + mix((trace.yAt(u) - .5) * trace.box.h, (next.yAt(u) - .5) * next.box.h, shape);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  function animate(now) {
    const elapsed = Math.max(0, Math.min(48, now - run.last));
    run.last = now;
    const end = run.dir > 0 ? duration : 0;
    const position = Math.max(0, Math.min(duration, run.position + run.dir * elapsed));
    if (run.position !== position) {
      run.position = position;
      render();
    }
    if (position === end) {
      run.hold ??= now + readHold;
      if (now >= run.hold) {
        const [departed, arrived] = run.dir > 0 ? [previous, plate] : [plate, previous];
        cancel();
        if (departed.contains(document.activeElement)) arrived.focus({ preventScroll: true });
        return;
      }
    }
    frame = requestAnimationFrame(animate);
  }

  function start(dir) {
    if (!canPlay() || run) return;
    const beforeTop = bounds(previous, scrollY).y;
    const afterTop = bounds(plate, scrollY).y;
    // On a tall scene, reverse to the edge the visitor originally paged from.
    const before = dir > 0 ? scrollY : Math.max(beforeTop, afterTop - innerHeight);
    const after = dir > 0 ? afterTop : scrollY;
    const from = bounds(source, scrollY), to = bounds(target, scrollY);
    from.y -= before;
    to.y -= after;
    const width = viewportWidth(), height = innerHeight;
    run = { before, after, from, to, width, height, dir, position: dir > 0 ? 0 : duration, last: performance.now() };
    root.classList.add('deep-flipping-hold');
    if (ctx) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.25;
      ctx.lineJoin = ctx.lineCap = 'round';
      plate.closest('.deep').append(overlay);
    }
    render();
    frame = requestAnimationFrame(animate);
  }

  watchScrollMotion((top, height) => {
    if (!run) return;
    const drift = Math.abs(top - run.top);
    if (!canPlay() || drift > height * .95) cancel();
    else if (drift > 1) scrollTo({ top: run.top, behavior: 'instant' });
  });

  for (const scene of [previous, plate]) {
    scene.addEventListener('focusin', cancel);
    scene.addEventListener('input', cancel);
    scene.addEventListener('pointerdown', event => {
      if (event.target.closest('.plate-controls, .s6-distance-demo')) cancel();
    });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) cancel(); });

  return {
    forward: () => start(1),
    reverse: () => start(-1),
    turn(dir) {
      if (!run) return false;
      run.dir = dir;
      run.last = performance.now();
      run.hold = undefined;
      return true;
    },
    cancel,
    active: () => !!run,
  };
}

function watchTuning(previous, plate) {
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const flipping = previous.querySelector('#s7-flipping');
  const sourceChart = previous.querySelector('#s7-chart');
  const title = plate.querySelector('#s8-title');
  const targetChart = plate.querySelector('#s8-chart');
  const plot = document.createElement('canvas');
  const capacitor = document.createElement('span');
  plot.className = 's8-plot-copy';
  capacitor.className = 's8-capacitor s8-pluck';
  for (const node of [plot, capacitor]) node.setAttribute('aria-hidden', 'true');
  const ctx = plot.getContext('2d');
  const turns = [];
  const gatherAt = 380, gatherEnd = 960, pluck = 1900, end = 2950, readHold = 1000;
  let layout, elapsed, waves, previousTop, targetTop, lockedAt, frame, revCtrl;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined || !!revCtrl?.active();

  function startWords() {
    function turn(node, frames, start, end) {
      const animation = node.animate(frames, { duration: 1, fill: 'both' });
      animation.pause();
      turns.push({ animation, start, end });
    }

    const down = [{ transform: 'none', opacity: 1, easing: 'ease-in' },
      { transform: 'perspective(260px) rotateX(-88deg)', opacity: 0 }];
    turn(flipping, [down[0],
      { transform: 'perspective(260px) rotateX(14deg)', opacity: 1, offset: .28, easing: 'ease-in' },
      down[1]], 0, 490);
    [...flipping.parentElement.children].slice(0, -1).reverse().forEach((word, i) => {
      const cue = 190 + i * 122;
      turn(word, down, cue, cue + 420);
    });
    [...title.children].forEach((word, i) => {
      const cue = 890 + i * 128;
      turn(word, [
        { opacity: 0, transform: 'perspective(260px) rotateX(76deg)', easing: arrivalEase },
        { opacity: 1, transform: 'perspective(260px) rotateX(-5deg)', offset: .78, easing: 'ease-out' },
        { opacity: 1, transform: 'none' },
      ], cue, cue + 550);
    });
    for (const node of title.parentElement.children) {
      if (node !== title) turn(node, [{ opacity: 0 }, { opacity: 1 }], 1250, 1680);
    }
  }

  function clearPlot() {
    if (!plot.isConnected) return;
    delete sourceChart.drawOutgoingHandoff;
    plot.remove();
    capacitor.remove();
    capacitor.style.opacity = 0;
    for (const chart of [sourceChart, targetChart]) chart.style.removeProperty('--s8-plot-opacity');
    waves = null;
  }

  function settle() {
    revCtrl?.cancel();
    plate.classList.remove('s8-awaiting');
    if (lockedAt === undefined) return;
    cancelAnimationFrame(frame);
    for (const { animation } of turns) animation.cancel();
    turns.length = 0;
    clearPlot();
    lockedAt = undefined;
    root.classList.remove('deep-tuning-hold');
    scheduleMotion();
  }

  function skip() {
    settle();
  }

  function paintPlot() {
    const curve = targetChart.resonanceCurve;
    if (!curve) return;
    const { from, to, width, height, stacked } = layout;
    const viewport = scrollY;
    const merge = ease(gatherAt, gatherEnd, elapsed);
    if (merge < 1 && !waves) return;

    const travel = ease(gatherEnd, pluck, elapsed);
    const release = stage(pluck, end, elapsed);
    const shape = ease(0, .39, release);
    const leave = ease(0, .17, merge), arrive = ease(.83, 1, release);
    const { box, points, X, Y, color } = curve;
    const peakIndex = points.reduce((peak, [, volts], i) => volts > points[peak][1] ? i : peak, 0);
    const [peakFrequency, peakVolts] = points[peakIndex];
    const peakPosition = peakIndex / (points.length - 1), peakY = Y(peakVolts);
    const lineY = Math.max(box.y + box.h * .72, Math.min(box.y + box.h + 8, peakY + box.h * .22));
    const middle = mix(from.y + from.h * .52, to.y + lineY, travel) - viewport;
    // While the controls pass through the center on narrow screens, carry the line down the right margin.
    const tuck = stacked ? ease(.04, .24, travel) * (1 - ease(.73, .98, travel)) : 0;
    const rail = to.x + to.w + 4;
    const left = mix(mix(from.x, to.x, travel) + box.x, rail, tuck);
    const span = mix(box.w + (from.w - to.w) * (1 - travel), width - rail - 3, tuck);

    plot.style.opacity = leave * (1 - arrive);
    sourceChart.style.setProperty('--s8-plot-opacity', 1 - leave);
    targetChart.style.setProperty('--s8-plot-opacity', arrive);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    if (merge < 1) {
      capacitor.style.opacity = 0;
      waves.forEach(({ box: area, yAt, color: stroke }, i) => {
        ctx.globalAlpha = i === 0 ? 1 - ease(.5, .95, merge) : 1;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let j = 0; j <= 200; j++) {
          const u = j / 200;
          const x = mix(from.x + area.x + area.w * u, left + span * u, merge);
          const y = mix(from.y + area.y + area.h * yAt(u) - viewport, middle, merge);
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      return;
    }

    const launch = stage(pluck - 320, pluck, elapsed);
    const draw = ease(.36, .53, release), recoil = ease(.56, .77, release);
    const lift = Math.min(28, box.h * .09) * draw * (1 - recoil);
    const lineAt = (u, y) => {
      const stretch = (u - peakPosition) / .17;
      return mix(middle, to.y + y - viewport, shape) - lift * Math.exp(-stretch * stretch);
    };

    // Keep the capacitor against the rising crest until the extra pull is released.
    const exit = stage(.56, .92, release), drop = exit * (.35 + .65 * exit);
    const below = height + 24, contact = lineAt(peakPosition, peakY) + 6;
    const chipY = mix(mix(below, contact, launch * (1.7 - .7 * launch)), below, drop);
    const chipX = to.x + X(peakFrequency) + 12 * drop;
    const angle = mix(-12, 0, launch) + 24 * drop;
    capacitor.style.opacity = launch > 0 && exit < 1 ? 1 : 0;
    capacitor.style.transform = `translate(${chipX - 21}px, ${chipY - 7.5}px) rotate(${angle}deg) scale(.8)`;

    ctx.save();
    if (release > 0) {
      ctx.beginPath();
      ctx.rect(to.x, to.y - viewport, to.w, to.h);
      ctx.clip();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = mix(2, 2.2, shape);
    ctx.beginPath();
    points.forEach(([frequency, volts], i) => {
      const u = i / (points.length - 1);
      const x = mix(left + span * u, to.x + X(frequency), shape);
      const y = lineAt(u, Y(volts));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function begin(event) {
    if (!ctx) return;
    event.preventDefault();
    const height = innerHeight, top = scrollY;
    const from = bounds(sourceChart, top), to = bounds(targetChart, top);
    layout = { from, to, width: viewportWidth(), height, stacked: Math.abs(from.x - to.x) < 1 };
    const overflow = Math.max(0, Math.min(to.y + to.h + 12 - targetTop - height, plate.offsetHeight - height));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    plot.width = Math.round(layout.width * dpr);
    plot.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    targetChart.style.setProperty('--s8-plot-opacity', 0);
    sourceChart.drawOutgoingHandoff = drawn => { waves = drawn; };
    lockedAt = top;
    root.classList.add('deep-tuning-hold');
    chapter.append(plot, capacitor);
    startWords();
    plate.classList.remove('s8-awaiting');

    const started = performance.now();
    function tick(now) {
      elapsed = now - started;
      const pageTravel = ease(700, 1640, elapsed);
      // When the chart sits below the fold, finish the handoff with it in view.
      const destination = mix(top, targetTop, pageTravel) + overflow * ease(1490, pluck, elapsed);
      if (Math.abs(destination - scrollY) >= .5) {
        scrollTo({ top: destination, behavior: 'instant' });
        lockedAt = scrollY;
      }
      for (const { animation, start, end: finish } of turns) animation.currentTime = stage(start, finish, elapsed);
      if (elapsed >= gatherEnd) delete sourceChart.drawOutgoingHandoff;
      if (elapsed < end) paintPlot();
      else clearPlot();
      if (elapsed >= end + readHold) return skip();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure || targetTop === undefined) {
      previousTop = bounds(previous, top).y;
      targetTop = bounds(plate, top).y;
    }
    if (!canPlay() || (lockedAt !== undefined && Math.abs(top - lockedAt) > height * .95)) skip();
    else if (lockedAt !== undefined && Math.abs(top - lockedAt) > 1) scrollTo({ top: lockedAt, behavior: 'instant' });
  });

  for (const scene of [previous, plate]) {
    const controls = scene.querySelector('.plate-controls');
    for (const event of ['focusin', 'pointerdown', 'input', 'change']) controls.addEventListener(event, skip);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });

  return {
    forward() {
      if (!canPlay() || active()) return;
      previousTop = bounds(previous, scrollY).y;
      targetTop = bounds(plate, scrollY).y;
      const cue = Math.max(previousTop, targetTop - innerHeight);
      if (Math.abs(scrollY - cue) > 2) scrollTo({ top: cue, behavior: 'instant' });
      begin({ preventDefault() {} });
    },
    reverse() {
      if (!canPlay() || active()) return;
      const arrivalCopy = previous.querySelectorAll('.s7-heading, .s7-scope figcaption, .s7-console, .s7-formula');
      revCtrl = runReverseCanvasMorph(plate, previous, { mode: 'tuning', arrivalCopy });
    },
    cancel: skip,
    active,
  };
}

function watchMetal(previous, plate) {
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const source = previous.querySelector('#s8-chart'), target = plate.querySelector('#s9-chart');
  const outgoing = previous.querySelector('.plate-words'), incoming = plate.querySelector('.plate-words');
  const figure = target.parentElement;
  const plot = document.createElement('canvas');
  plot.className = 's9-plot-copy';
  plot.setAttribute('aria-hidden', 'true');
  const ctx = plot.getContext('2d');
  const end = 1580, readHold = 1000;
  let layout, frame, lockedAt, elapsed, lastFrame, direction, holdUntil;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined;

  function settle(land = true) {
    if (!active()) return;
    cancelAnimationFrame(frame);
    plot.remove();
    for (const node of [source, figure, outgoing, incoming]) {
      node.style.removeProperty('transform');
      node.style.removeProperty('opacity');
    }
    plate.classList.remove('s9-entering');
    if (land) scrollTo({ top: direction > 0 ? layout.metalTop : layout.tuningTop, behavior: 'instant' });
    lockedAt = undefined;
    root.classList.remove('deep-metal-hold');
    scheduleMotion();
  }

  function point(points, index) {
    const i = Math.floor(index), [x, y] = points[i], next = points[i + 1];
    return next ? [mix(x, next[0], index - i), mix(y, next[1], index - i)] : [x, y];
  }

  function stroke(pointAt, color, opacity, width) {
    if (opacity <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const [x, y] = pointAt(i / 96);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function paint() {
    const { from, to, width, height, tuningTop, metalTop } = layout;
    const curve = source.resonanceCurve, field = target.metalField;
    const morph = curve && field;
    const away = ease(0, morph ? 170 : 740, elapsed);
    const arrive = ease(morph ? 1320 : 630, end, elapsed);
    source.style.opacity = 1 - away;
    figure.style.opacity = arrive;
    outgoing.style.opacity = 1 - ease(100, 600, elapsed);
    incoming.style.opacity = ease(470, 1080, elapsed);
    outgoing.style.transform = `translate(${-14 * ease(100, 600, elapsed)}px, ${lockedAt - tuningTop}px)`;
    incoming.style.transform = `translate(${14 * (1 - ease(470, 1080, elapsed))}px, ${lockedAt - metalTop}px)`;
    plot.style.opacity = away * (1 - arrive);
    ctx.clearRect(0, 0, width, height);
    if (!morph || !away || arrive === 1) return;

    const { points, X, Y, color } = curve;
    const middle = (points.length - 1) / 2;
    const curl = ease(100, 675, elapsed);
    const open = ease(585, 1410, elapsed);
    const gap = 12 * ease(60, 330, elapsed) * (1 - curl);
    const fieldTop = to.y + field.edge;
    const last = field.lines.length - 1;
    for (const side of [-1, 1]) {
      const inner = field.lines[last];
      const [rho, z] = inner.points[0];
      const center = to.x + field.X(side * rho);
      const baseline = to.y + field.Y(z);
      const radius = Math.min(14, to.w * .033);
      const core = u => {
        const [frequency, volts] = point(points, middle + side * middle * u);
        const angle = side * u * Math.PI * 2;
        const cx = mix(from.x + X(frequency) + side * gap, center + radius * Math.sin(angle), curl);
        const cy = mix(from.y + Y(volts), baseline - radius + radius * Math.cos(angle), curl);
        const [r, h] = point(inner.points, (inner.points.length - 1) * u);
        return [mix(cx, to.x + field.X(side * r), open), mix(cy, to.y + field.Y(h), open)];
      };
      const tint = ease(1050, 1430, elapsed);
      stroke(core, color, 1 - tint, mix(2, 1.4, open));
      stroke(core, inner.color, tint, 1.4);

      ctx.save();
      ctx.beginPath();
      ctx.rect(to.x, fieldTop, to.w, to.y + to.h - fieldTop);
      ctx.clip();
      for (let i = last - 1; i >= 0; i--) {
        const { points: path, color: lineColor } = field.lines[i];
        const start = 680 + (last - 1 - i) * 115;
        const length = ease(start, start + 480, elapsed);
        stroke(u => {
          const [r, h] = point(path, (path.length - 1) * u * length);
          return [to.x + field.X(side * r), to.y + field.Y(h)];
        }, lineColor, ease(start, start + 160, elapsed), 1.4);
      }
      ctx.restore();
    }
  }

  function tick(now) {
    const next = Math.max(0, Math.min(end, elapsed + (now - lastFrame) * direction));
    lastFrame = now;
    if (next !== elapsed) {
      elapsed = next;
      paint();
    }
    if (elapsed === (direction > 0 ? end : 0)) {
      holdUntil ??= now + readHold;
      if (now >= holdUntil) return settle();
    }
    frame = requestAnimationFrame(tick);
  }

  function begin(dir) {
    if (!canPlay() || active()) return;
    const origin = scrollY, height = innerHeight, width = viewportWidth();
    const from = bounds(source, origin), to = bounds(target, origin);
    const tuningStart = bounds(previous, origin).y, metalStart = bounds(plate, origin).y;
    const chartFit = (start, scene, box) => start + Math.max(0, Math.min(box.y + box.h + 8 - start - height, scene.offsetHeight - height));
    const tuningTop = dir > 0 ? origin : chartFit(tuningStart, previous, from);
    const metalTop = dir < 0 ? origin : chartFit(metalStart, plate, to);
    if (!ctx) {
      scrollTo({ top: dir > 0 ? metalTop : tuningTop, behavior: 'instant' });
      return;
    }
    layout = { from: { ...from, y: from.y - tuningTop }, to: { ...to, y: to.y - metalTop }, width, height, tuningTop, metalTop };
    direction = dir;
    elapsed = dir > 0 ? 0 : end;
    holdUntil = undefined;

    const dpr = Math.min(devicePixelRatio || 1, 2);
    plot.width = Math.round(width * dpr);
    plot.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
    root.classList.add('deep-metal-hold');
    plate.classList.add('s9-entering');
    scrollTo({ top: metalTop, behavior: 'instant' });
    lockedAt = scrollY;
    source.style.transform = `translateY(${lockedAt - tuningTop}px)`;
    figure.style.transform = `translateY(${lockedAt - metalTop}px)`;
    chapter.append(plot);
    paint();
    lastFrame = performance.now();
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height) => {
    if (!active()) return;
    if (!canPlay() || Math.abs(top - lockedAt) > height * .95) settle(false);
    else if (Math.abs(top - lockedAt) > 1) scrollTo({ top: lockedAt, behavior: 'instant' });
  });

  for (const [node, dir] of [[previous.querySelector('.plate-controls'), -1], [figure, 1]]) {
    for (const event of ['focusin', 'pointerdown', 'input']) {
      node.addEventListener(event, () => {
        if (!active()) return;
        direction = dir;
        settle();
      });
    }
  }
  addEventListener('resize', () => settle());
  for (const event of ['hashchange', 'pagehide']) addEventListener(event, () => settle(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settle(); });

  return {
    forward: () => begin(1),
    reverse: () => begin(-1),
    turn(dir) {
      if (!active()) return false;
      direction = dir;
      holdUntil = undefined;
      return true;
    },
    cancel: settle,
    active,
  };
}

function watchPauses(previous, plate) {
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const metal = previous.querySelector('#s9-metal'), metalAction = previous.querySelector('#s9-metal-action');
  const surface = metal.querySelector('.s9-metal-surface');
  const figure = previous.querySelector('#s9-field');
  const oldWords = previous.querySelector('.plate-words'), words = plate.querySelector('.plate-words');
  const previousTitle = previous.querySelector('h3'), title = plate.querySelector('#s10-title');
  const partLink = title.querySelector('#s10-pauses');
  const track = plate.querySelector('.s10-track'), slider = track.parentElement, cap = plate.querySelector('#s10-cap');
  const plot = plate.querySelector('#s10-chart');
  const piece = surface.cloneNode(false);
  piece.classList.add('s10-rail-travel');
  const echo = document.createElement('span');
  echo.className = 's10-title-echo';
  echo.setAttribute('aria-hidden', 'true');
  echo.textContent = previousTitle.textContent;
  const end = 2800, readHold = 1000;
  let layout, previousTop, targetTop, approach, lockedAt, frame, revCtrl;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined || !!revCtrl?.active();

  function clearMotion() {
    piece.remove();
    echo.remove();
    for (const node of [surface, plot]) node.style.removeProperty('opacity');
    for (const node of [figure, oldWords]) {
      node.style.removeProperty('transform');
      node.style.removeProperty('opacity');
    }
    slider.style.removeProperty('--s10-track-opacity');
    for (const copy of [oldWords, words]) {
      for (const name of ['wipe', 'blur', 'shift']) copy.style.removeProperty(`--s10-word-${name}`);
    }
    plot.setPauseHandoff?.(1, 1, 1);
  }

  function skip() {
    revCtrl?.cancel();
    plate.classList.remove('s10-awaiting');
    if (lockedAt === undefined) return;
    cancelAnimationFrame(frame);
    clearMotion();
    lockedAt = undefined;
    root.classList.remove('deep-pauses-hold');
    scheduleMotion();
  }

  function wipeMask(width, progress, entering) {
    const edge = mix(-10, width + 10, progress);
    const stops = entering ? ['#000', 'transparent'] : ['transparent', '#000'];
    return `linear-gradient(90deg, ${stops[0]} ${edge - 10}px, ${stops[1]} ${edge + 10}px)`;
  }

  function wipe(copy, width, progress, entering, blur, shift) {
    copy.style.setProperty('--s10-word-wipe', wipeMask(width, progress, entering));
    copy.style.setProperty('--s10-word-blur', blur ? `blur(${blur}px)` : 'none');
    copy.style.setProperty('--s10-word-shift', shift ? `0 ${shift}px` : 'none');
  }

  function carry(elapsed) {
    if (!piece.isConnected) return;
    const { from, to, stacked, width } = layout;
    const progress = stage(170, 1430, elapsed);
    const arrival = ease(.90, 1, progress);
    slider.style.setProperty('--s10-track-opacity', arrival);
    const travel = ease(0, .97, progress);
    // On small screens the sheet turns edge-on to pass beside the text.
    const tuck = stacked ? ease(.08, .4, travel) * (1 - ease(.62, .96, travel)) : 0;
    const margin = width - to.x - to.w;
    const edgeWidth = Math.max(24, margin * .68);
    const x = mix(mix(from.x + from.w / 2, to.x + to.w / 2, travel), width - margin / 2, tuck);
    const y = mix(from.y + from.h / 2, to.y + to.h / 2 - scrollY, travel);
    const w = mix(mix(from.w, to.w, travel), edgeWidth, tuck);
    const h = mix(from.h, to.h, travel);
    const angle = -5 * Math.sin(Math.PI * travel);
    piece.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${w / from.w}, ${h / from.h}) translate(-50%, -50%)`;
    piece.style.opacity = 1 - arrival;
    if (progress === 1) piece.remove();
  }

  function paint(elapsed) {
    const overlap = ease(390, 720, elapsed) * (1 - ease(720, 1190, elapsed));
    const incoming = ease(290, 1380, elapsed);
    wipe(oldWords, layout.oldWidth, ease(220, 1180, elapsed), false, 1.35 * overlap, 22 * ease(230, 1110, elapsed));
    wipe(words, layout.newWidth, incoming, true, 1.35 * overlap, -28 * (1 - ease(550, 1380, elapsed)));
    if (overlap) {
      if (!echo.isConnected) title.append(echo);
      echo.style.maskImage = wipeMask(layout.newWidth, incoming, false);
      echo.style.opacity = .22 * overlap;
    } else echo.remove();
    oldWords.style.opacity = 1 - ease(710, 1020, elapsed);
    figure.style.opacity = 1 - ease(180, 820, elapsed);
    carry(elapsed);
    const sweep = ease(960, 1670, elapsed);
    plot.style.opacity = sweep === 0 ? '0' : '1';
    plot.setPauseHandoff?.(sweep, ease(1670, 2260, elapsed), ease(2300, end, elapsed));
  }

  function begin(event) {
    if (!plot.setPauseHandoff) {
      plate.scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }
    event.preventDefault();
    const origin = scrollY, height = innerHeight;
    const old = bounds(surface, origin), to = bounds(track, origin), chart = bounds(plot, origin);
    const extra = Math.max(0, Math.min(chart.y + chart.h + 8 - targetTop - height, plate.offsetHeight - height));
    layout = { origin, from: { ...old, y: old.y - origin }, to, oldWidth: oldWords.clientWidth, newWidth: words.clientWidth,
      width: viewportWidth(), stacked: Math.abs(bounds(figure, origin).x - bounds(words, origin).x) < 1 };
    piece.style.width = `${old.w}px`;
    piece.style.height = `${old.h}px`;
    root.classList.add('deep-pauses-hold');
    plate.classList.add('s10-entering');
    scrollTo({ top: targetTop, behavior: 'instant' });
    lockedAt = scrollY;
    const pin = `translateY(${lockedAt - origin}px)`;
    oldWords.style.transform = pin;
    figure.style.transform = pin;
    surface.style.opacity = 0;
    chapter.append(piece);
    paint(0);
    plate.classList.remove('s10-awaiting');

    const started = performance.now();
    let finished = false;
    function tick(now) {
      const elapsed = now - started;
      const destination = targetTop + extra * ease(1320, 1650, elapsed);
      if (Math.abs(destination - scrollY) >= .5) {
        scrollTo({ top: destination, behavior: 'instant' });
        lockedAt = scrollY;
      }
      if (elapsed < end) paint(elapsed);
      else if (!finished) {
        clearMotion();
        finished = true;
      }
      if (elapsed >= end + readHold) return skip();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height) => {
    previousTop = bounds(previous, top).y;
    targetTop = bounds(plate, top).y;
    const visible = bounds(figure, top);
    approach = Math.min(targetTop - 2, Math.max(previousTop, visible.y + visible.h + 8 - height));
    if (!canPlay() || (lockedAt !== undefined && Math.abs(top - lockedAt) > height * .95)) skip();
    else if (lockedAt !== undefined && Math.abs(top - lockedAt) > 1) scrollTo({ top: lockedAt, behavior: 'instant' });
    if (lockedAt === undefined) plate.classList.remove('s10-entering');
  });

  for (const control of [metal, metalAction, partLink, cap]) {
    for (const event of ['focus', 'pointerdown', 'input']) control.addEventListener(event, skip);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });

  return {
    forward() {
      if (!canPlay() || active()) return;
      previousTop = bounds(previous, scrollY).y;
      targetTop = bounds(plate, scrollY).y;
      const visible = bounds(figure, scrollY);
      approach = Math.min(targetTop - 2, Math.max(previousTop, visible.y + visible.h + 8 - innerHeight));
      if (Math.abs(scrollY - approach) > 2) scrollTo({ top: approach, behavior: 'instant' });
      begin({ preventDefault() {} });
    },
    reverse() {
      if (!canPlay() || active()) return;
      revCtrl = runReverseCanvasMorph(plate, previous, { mode: 'pauses' });
    },
    cancel: skip,
    active,
  };
}

function watchPartTwo(source, part) {
  const plate = source.closest('.plate'), chapter = part.closest('.deep');
  const root = document.documentElement, word = source.firstElementChild;
  const reveal = document.createElement('div'), heading = part.cloneNode(true);
  reveal.className = 'part-two-reveal';
  reveal.setAttribute('aria-hidden', 'true');
  reveal.inert = true;
  heading.removeAttribute('id');
  heading.removeAttribute('tabindex');
  for (const child of heading.querySelectorAll('[id]')) child.removeAttribute('id');
  reveal.append(heading);

  const sweepStart = 210, sweepEnd = 1540, readHold = 1000;
  let transition, frame, revCover, revFrame, revActive = false;
  const canPlay = () => !reducedMotion.matches && !document.hidden &&
    CSS.supports('mask-image', 'radial-gradient(black, transparent)');

  function land() {
    if (transition.followLink && location.hash !== source.hash) {
      history.pushState(history.state, '', source.hash);
    }
    part.scrollIntoView({ block: 'start', behavior: 'instant' });
    transition.top = scrollY;
    transition.arrived = true;
    reveal.remove();
    word.style.removeProperty('transform');
    if (transition.followLink) part.focus({ preventScroll: true });
  }

  function cancelReverse() {
    if (!revActive) return;
    revActive = false;
    cancelAnimationFrame(revFrame);
    revCover?.remove();
    revCover = null;
    word.style.removeProperty('transform');
    root.classList.remove('deep-reverse-hold');
    scheduleMotion();
  }

  function release(followLink = false) {
    cancelReverse();
    if (!transition) return;
    if (followLink && transition.followLink && !transition.arrived) land();
    cancelAnimationFrame(frame);
    transition = undefined;
    reveal.remove();
    word.style.removeProperty('transform');
    root.classList.remove('deep-part-two-hold');
    scheduleMotion();
  }

  function playReverse() {
    if (!canPlay() || revActive || transition) return;
    sanitizeChapter();
    part.scrollIntoView({ block: 'start', behavior: 'instant' });
    const { cue } = approach(scrollY, innerHeight);
    scrollTo({ top: cue, behavior: 'instant' });
    const lockedTop = scrollY;
    const { x, y, w, h } = bounds(word, lockedTop);
    const centerX = x + w / 2, centerY = y + h * .69 - lockedTop;
    const reach = Math.hypot(Math.max(centerX, viewportWidth() - centerX), Math.max(centerY, innerHeight - centerY)) + 20;

    revCover = document.createElement('div');
    revCover.className = 'part-two-reveal part-two-reverse-cover';
    revCover.setAttribute('aria-hidden', 'true');
    const clone = part.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    for (const c of clone.querySelectorAll('[id]')) c.removeAttribute('id');
    revCover.append(clone);
    revCover.style.setProperty('--ripple-center', `${centerX}px ${centerY}px`);
    revCover.style.setProperty('--ripple-radius', `${reach}px`);
    revCover.style.setProperty('--ripple-crest', '0');

    revActive = true;
    root.classList.add('deep-reverse-hold');
    chapter.append(revCover);

    const started = performance.now(), dur = 980, hold = 340;
    function tick(now) {
      if (!revActive) return;
      if (Math.abs(scrollY - lockedTop) > 1 && Math.abs(scrollY - lockedTop) < innerHeight * .95) {
        scrollTo({ top: lockedTop, behavior: 'instant' });
      }
      const elapsed = now - started;
      if (elapsed < dur) {
        const shrink = stage(0, dur, elapsed);
        const radius = reach * (1 - shrink) ** 1.8;
        revCover.style.setProperty('--ripple-radius', `${radius}px`);
        revCover.style.setProperty('--ripple-crest', ease(40, 220, elapsed) * (1 - ease(dur - 180, dur, elapsed)));
        const press = ease(dur - 220, dur - 80, elapsed) * (1 - ease(dur - 80, dur, elapsed));
        word.style.transform = `translateY(${press * .09}em) scale(${1 - press * .04}, ${1 - press * .16})`;
      } else {
        revCover.remove();
        word.style.removeProperty('transform');
      }
      if (elapsed >= dur + hold) return cancelReverse();
      revFrame = requestAnimationFrame(tick);
    }
    revFrame = requestAnimationFrame(tick);
  }

  function play(followLink) {
    const wordBox = word.getBoundingClientRect();
    if (wordBox.top < 0 || wordBox.bottom > innerHeight) {
      source.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    const { x, y, w, h } = bounds(word, scrollY);
    const centerX = x + w / 2, centerY = y + h * .69 - scrollY;
    const reach = Math.hypot(Math.max(centerX, viewportWidth() - centerX), Math.max(centerY, innerHeight - centerY)) + 20;
    transition = { top: scrollY, followLink, arrived: false };
    root.classList.add('deep-part-two-hold');
    reveal.style.setProperty('--ripple-center', `${centerX}px ${centerY}px`);
    reveal.style.setProperty('--ripple-radius', '0px');
    chapter.append(reveal);

    const started = performance.now();
    function tick(now) {
      const elapsed = now - started;
      if (elapsed < sweepEnd) {
        const press = ease(0, 155, elapsed) * (1 - ease(sweepStart, 375, elapsed));
        word.style.transform = `translateY(${press * .09}em) scale(${1 - press * .04}, ${1 - press * .16})`;
        const spread = stage(sweepStart, sweepEnd, elapsed);
        const radius = reach * (1 - (1 - spread) ** 2.2);
        reveal.style.setProperty('--ripple-radius', `${radius}px`);
        reveal.style.setProperty('--ripple-crest', ease(sweepStart, 360, elapsed) * (1 - ease(1310, sweepEnd, elapsed)));
      } else if (!transition.arrived) land();
      if (elapsed >= sweepEnd + readHold) return release();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  function approach(top, height) {
    const wordTop = bounds(word, top).y;
    const end = bounds(part, top).y;
    const cue = Math.max(bounds(plate, top).y, Math.min(end - height, wordTop - 8));
    return { cue, end };
  }

  source.addEventListener('click', event => {
    if (!canPlay() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!transition && ALL_HOLD_CLASSES.some(name => root.classList.contains(name))) return;
    event.preventDefault();
    if (transition) transition.followLink = true;
    else {
      sanitizeChapter();
      play(true);
    }
  });
  plate.addEventListener('focusin', event => { if (event.target !== source) release(); });

  watchScrollMotion((top, height) => {
    if (transition && Math.abs(top - transition.top) > height * .95) release();
    else if (transition && Math.abs(top - transition.top) > 1) scrollTo({ top: transition.top, behavior: 'instant' });
  });
  for (const event of ['hashchange', 'popstate', 'pagehide']) addEventListener(event, () => release());
  addEventListener('resize', () => release(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(true); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) release(true); });

  return {
    forward() {
      if (!canPlay() || transition || revActive) return;
      sanitizeChapter();
      const { cue } = approach(scrollY, innerHeight);
      if (Math.abs(scrollY - cue) > 2) scrollTo({ top: cue, behavior: 'instant' });
      play(false);
    },
    reverse: playReverse,
    cancel: () => release(false),
    active: () => !!transition || revActive,
  };
}

function watchSoaking(part, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const partTitle = part.querySelector('.deep-part-title');
  const plot = scene.querySelector('#s11-chart'), scan = scene.querySelector('.s11-scan');
  const playback = scene.querySelector('#s11-playback');
  const toggle = scene.querySelector('#s11-switch'), readout = scene.querySelector('.plate-readout');
  const words = scene.querySelector('.plate-words'), instrument = scene.querySelector('.s11-instrument');
  const filament = document.createElement('span');
  filament.className = 's11-filament';
  filament.setAttribute('aria-hidden', 'true');

  const cut = 490, entranceEnd = 2080, readHold = 1000, sweepTime = 4000;
  const scanCycle = sweepTime + 85;
  let intro, rev, frame = 0, visible = false, scanPaused = false, userPaused = false;
  let axes = 1, reveal = 1;
  let blend = Number(toggle.checked), destination = blend, blendFrom, blendStart, flip;
  let capture = 0, previousCapture = 0, scanElapsed = 0, scanFrame;
  const motionAllowed = () => !reducedMotion.matches && !document.hidden;
  const canScan = () => visible && !scanPaused && !userPaused && (!intro || intro.reading) && !rev;
  const sweepPosition = () => stage(0, sweepTime, scanElapsed);
  const updatePlot = () => plot.setAnswerMotion?.(axes, reveal, blend, previousCapture, capture,
    previousCapture === capture ? 1 : sweepPosition());

  function finishReverse() {
    if (!rev) return;
    rev.anims.forEach(a => a.cancel());
    rev = undefined;
    filament.remove();
    part.classList.remove('deep-rev-staged');
    root.classList.remove('deep-reverse-hold');
    scheduleMotion();
  }

  function finishIntro() {
    finishReverse();
    if (!intro) return;
    intro.outgoing.cancel();
    intro.incoming.forEach(animation => animation.cancel());
    filament.remove();
    intro = undefined;
    axes = reveal = 1;
    root.classList.remove('deep-soaking-hold');
    scene.classList.remove('s11-staged');
    updatePlot();
    scheduleMotion();
    requestFrame();
  }

  function startReverse() {
    if (!motionAllowed() || intro || rev) return;
    sanitizeChapter();
    scene.scrollIntoView({ block: 'start', behavior: 'instant' });
    const rect = plot.getBoundingClientRect(), margin = rect.width < 330 ? 38 : 54;
    const from = { x: rect.left + margin, y: rect.top + 26 + (rect.height - 66) * .08 / 1.08,
      w: Math.max(80, rect.width - margin - (rect.width < 330 ? 14 : 18)) };
    const partDest = bounds(part, scrollY).y;
    const tr = bounds(partTitle, scrollY);
    const to = { x: tr.x, y: tr.y - partDest + tr.h * .5, w: tr.w };
    const anims = Array.from(words.children, (node, i) => node.animate([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(10px)' },
    ], { duration: 280, delay: i * 35, easing: 'ease-in', fill: 'both' }));
    anims.push(instrument.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: 'both' }));
    rev = { start: performance.now(), from, to, landed: false, dest: partDest, anims };
    root.classList.add('deep-reverse-hold');
    part.classList.add('deep-rev-staged');
    filament.style.opacity = '0';
    chapter.append(filament);
    requestFrame();
  }

  function stepReverse(now) {
    const elapsed = now - rev.start;
    if (elapsed >= 420 && !rev.landed) {
      rev.landed = true;
      scrollTo({ top: rev.dest, behavior: 'instant' });
      rev.top = scrollY;
      part.classList.remove('deep-rev-staged');
      const mid = rev.to.y - bounds(part, scrollY).y + scrollY;
      const above = Math.max(0, part.firstElementChild.getBoundingClientRect().top - 14);
      const slide = part.getBoundingClientRect();
      rev.anims.push(part.animate([
        { clipPath: `inset(${mid}px 0 ${Math.max(0, slide.height - mid)}px 0)`, filter: 'blur(1.5px)' },
        { clipPath: `inset(${above}px 0 0px 0)`, filter: 'blur(0px)' },
      ], { duration: 480, easing: arrivalEase, fill: 'both' }));
    }
    if (rev.landed && Math.abs(scrollY - rev.top) > 1 && Math.abs(scrollY - rev.top) < innerHeight * .95) {
      scrollTo({ top: rev.top, behavior: 'instant' });
    }
    const t = ease(220, 620, elapsed);
    const width = mix(rev.from.w, rev.to.w, t);
    const x = mix(rev.from.x, rev.to.x, t);
    const y = mix(rev.from.y, rev.to.y, t);
    if (filament.isConnected) {
      filament.style.inlineSize = `${width}px`;
      filament.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      filament.style.opacity = ease(80, 260, elapsed) * (1 - ease(760, 980, elapsed));
      if (elapsed >= 980) filament.remove();
    }
    if (elapsed >= 1320) finishReverse();
  }

  function land() {
    const targetTop = bounds(scene, scrollY).y, chart = bounds(plot, scrollY);
    const extra = Math.max(0, Math.min(chart.y + chart.h + 6 - targetTop - innerHeight, scene.offsetHeight - innerHeight));
    scrollTo({ top: targetTop + extra, behavior: 'instant' });
    intro.top = scrollY;
    intro.outgoing.cancel();
    scene.classList.remove('s11-staged');
    const rect = plot.getBoundingClientRect(), margin = rect.width < 330 ? 38 : 54;
    intro.to = { x: rect.left + margin, y: rect.top + 26 + (rect.height - 66) * .08 / 1.08,
      w: rect.width - margin - (rect.width < 330 ? 14 : 18) };
    intro.incoming = Array.from(words.children, (node, i) => node.animate([
      { clipPath: 'inset(0 100% 0 0)', filter: 'blur(2px)', opacity: .4 },
      { clipPath: 'inset(-8px -8px -8px -8px)', filter: 'blur(0)', opacity: 1 },
    ], { delay: 50 + 75 * i, duration: 555, easing: arrivalEase, fill: 'both' }));
    for (const node of instrument.querySelectorAll('.plate-controls')) {
      intro.incoming.push(node.animate([{ opacity: 0 }, { opacity: 1 }],
        { delay: 510, duration: 330, easing: arrivalEase, fill: 'both' }));
    }
  }

  function animateIntro(now) {
    const elapsed = now - intro.start;
    if (elapsed >= cut && !intro.to) land();
    const { from, to } = intro;
    const travel = ease(cut, 965, elapsed);
    const width = to ? mix(from.w, to.w, travel) : from.w * ease(80, cut, elapsed);
    const x = to ? mix(from.x, to.x, travel) : from.x + (from.w - width) / 2;
    const y = to ? mix(from.y, to.y, travel) : from.y;
    if (filament.isConnected) {
      filament.style.inlineSize = `${width}px`;
      filament.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      filament.style.opacity = ease(130, 390, elapsed) * (1 - ease(875, 1150, elapsed));
      if (elapsed >= 1150) filament.remove();
    }

    axes = ease(545, 1100, elapsed);
    reveal = ease(1110, entranceEnd, elapsed);
    intro.reading = reveal === 1;
    if (elapsed >= entranceEnd + readHold) finishIntro();
  }

  function requestFrame() {
    if (!frame && motionAllowed() && (intro || rev || canScan() || (visible && blend !== destination))) {
      frame = requestAnimationFrame(animate);
    }
  }

  function drawScan(now) {
    const trace = plot.answerTrace;
    if (!trace) return;
    if (scanFrame !== undefined) scanElapsed += Math.min(64, now - scanFrame);
    scanFrame = now;
    if (scanElapsed >= scanCycle) {
      scanElapsed -= scanCycle;
      previousCapture = capture;
      capture = (capture + 1) % plot.answerCaptureCount;
    }

    const { box, points, X, Y } = trace;
    let forward = sweepPosition();
    if (previousCapture !== capture) forward = trace.to === capture ? trace.sweep : 0;
    const last = points.length - 1, at = forward * last;
    const index = Math.floor(at);
    const current = mix(points[index][1], points[Math.min(index + 1, last)][1], at - index);
    scan.style.blockSize = `${box.h}px`;
    scan.style.transform = `translate3d(${X(at)}px, ${box.y}px, 0)`;
    scan.style.setProperty('--s11-scan-point', `${Y(current) - box.y}px`);
    scan.hidden = false;
  }

  function hideScan() {
    scan.hidden = true;
    scanFrame = undefined;
  }

  function animate(now) {
    frame = 0;
    if (!motionAllowed()) return;
    if (intro) animateIntro(now);
    if (rev) stepReverse(now);
    if (blend !== destination) blend = mix(blendFrom, destination, ease(0, 320, now - blendStart));
    if (canScan()) drawScan(now);
    else hideScan();
    updatePlot();
    requestFrame();
  }

  function refreshLoop() {
    if (!canScan() || !motionAllowed()) hideScan();
    if (!visible || !motionAllowed()) {
      blend = destination;
      updatePlot();
    }
    if (!motionAllowed()) {
      cancelAnimationFrame(frame);
      frame = 0;
      finishIntro();
      flip?.cancel();
    }
    requestFrame();
  }

  plot.pauseAnswerScan = paused => {
    scanPaused = paused;
    refreshLoop();
  };

  function startForward() {
    if (!motionAllowed() || intro || rev) return;
    sanitizeChapter();
    part.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (!plot.setAnswerMotion) {
      scene.scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }
    const rect = partTitle.getBoundingClientRect(), slide = part.getBoundingClientRect();
    const from = { x: rect.left, y: Math.max(12, rect.top + rect.height / 2), w: rect.width };
    const center = from.y - slide.top;
    const above = Math.max(0, part.firstElementChild.getBoundingClientRect().top - slide.top - 14);
    const below = Math.max(0, slide.bottom - rect.bottom - 14);
    const outgoing = part.animate([
      { clipPath: `inset(${above}px 0 ${below}px 0)`, filter: 'blur(0)' },
      { clipPath: `inset(${center}px 0 ${slide.height - center}px 0)`, filter: 'blur(1.5px)' },
    ], { duration: cut, easing: 'cubic-bezier(.39, .08, .65, .88)', fill: 'both' });
    intro = { top: scrollY, start: performance.now(), from, outgoing, incoming: [] };
    root.classList.add('deep-soaking-hold');
    scene.classList.add('s11-staged');
    filament.style.opacity = 0;
    chapter.append(filament);
    axes = reveal = 0;
    scanElapsed = 0;
    previousCapture = capture;
    updatePlot();
    requestFrame();
  }

  watchScrollMotion(top => {
    if (intro && Math.abs(top - intro.top) > innerHeight * .95) finishIntro();
    else if (intro && Math.abs(top - intro.top) > 1) scrollTo({ top: intro.top, behavior: 'instant' });
  });

  function showPlaybackAction() {
    const action = reducedMotion.matches ? 'Next' : userPaused ? 'Play' : 'Pause';
    playback.textContent = action;
    playback.setAttribute('aria-label', action + (action === 'Next' ? ' capture' : ' captures'));
  }

  playback.hidden = false;
  showPlaybackAction();
  playback.addEventListener('click', () => {
    if (reducedMotion.matches) {
      capture = (capture + 1) % plot.answerCaptureCount;
      previousCapture = capture;
      updatePlot();
    } else userPaused = !userPaused;
    showPlaybackAction();
    refreshLoop();
  });
  for (const event of ['focusin', 'pointerdown', 'input']) scene.addEventListener(event, ({ target }) => {
    if (target.closest('.plate-controls')) finishIntro();
  });
  toggle.addEventListener('change', () => {
    destination = Number(toggle.checked);
    flip?.cancel();
    if (motionAllowed()) flip = readout.animate([
      { transform: 'perspective(440px) rotateX(-28deg)', opacity: .66 },
      { transform: 'none', opacity: 1 },
    ], { duration: 230, easing: arrivalEase });
    if (visible && motionAllowed()) {
      blend = blendFrom = plot.answerTrace?.blend ?? blend;
      blendStart = performance.now();
      requestFrame();
    } else blend = destination;
    updatePlot();
  });

  const viewport = new IntersectionObserver(([entry]) => {
    visible = entry.intersectionRatio >= .04;
    refreshLoop();
  }, { threshold: .04 });
  viewport.observe(plot);
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, finishIntro);
  document.addEventListener('visibilitychange', refreshLoop);
  reducedMotion.addEventListener('change', () => {
    previousCapture = capture;
    scanElapsed = 0;
    showPlaybackAction();
    refreshLoop();
  });

  return {
    forward: startForward,
    reverse: startReverse,
    cancel: finishIntro,
    active: () => !!intro || !!rev,
  };
}

function watchWhispering(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const source = previous.querySelector('#s11-title'), title = scene.querySelector('#s12-title');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const sourceChart = previous.querySelector('#s11-chart'), chart = scene.querySelector('#s12-chart');
  const instrument = sourceChart.closest('.s11-instrument');
  const flickerToggle = scene.querySelector('#s12-flicker');
  const flickerRate = scene.querySelector('#s12-flicker-rate');
  const readout = scene.querySelector('.plate-readout');
  const vortex = document.createElement('div'), wave = document.createElement('canvas');
  vortex.className = 's12-vortex';
  vortex.setAttribute('aria-hidden', 'true');
  wave.className = 's12-wave-copy';
  vortex.append(wave);
  const ctx = wave.getContext('2d');
  const cut = 880, arrivalEnd = 2260, readHold = 1000;
  let run, frame, revCtrl;
  let flickerBlend = Number(flickerToggle?.checked ?? true), flickerTarget = flickerBlend;
  let flickerFrom = flickerBlend, flickerStart = 0, flickerFrame = 0, readoutFlip;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden &&
    CSS.supports('mask-image', 'linear-gradient(transparent, black)');

  function glyphs(heading, shift) {
    const range = document.createRange(), text = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const list = [];
    while (text.nextNode()) {
      const node = text.currentNode;
      for (const { 0: character, index } of node.data.matchAll(/\S/gu)) {
        range.setStart(node, index);
        range.setEnd(node, index + character.length);
        const { left, top, width, height } = range.getBoundingClientRect();
        list.push({ character, x: left + width / 2, y: top + height / 2 + shift, width });
      }
    }
    return list;
  }

  function placeLetters(from, to) {
    return Array.from({ length: Math.max(from.length, to.length) }, (_, i) => {
      const letter = document.createElement('span');
      letter.className = 's12-vortex-letter';
      for (const [side, glyph] of [from[i], to[i]].entries()) {
        if (!glyph) continue;
        const face = document.createElement('span');
        face.className = side ? 's12-vortex-face s12-vortex-face--back' : 's12-vortex-face';
        face.textContent = glyph.character;
        face.style.width = `${glyph.width}px`;
        letter.append(face);
      }
      vortex.append(letter);
      return { letter, from: from[i] ?? to[i], to: to[i] ?? from[i] };
    });
  }

  function turnHeading(elapsed) {
    const { letters, hub, radius } = run;
    title.style.setProperty('--s12-heading-opacity', ease(1755, 1950, elapsed));
    vortex.style.setProperty('--s12-letter-opacity', 1 - ease(1840, 2040, elapsed));
    const span = Math.max(1, letters.length - 1);
    const orbit = ease(175, 1520, elapsed) * Math.PI * 1.85;
    const lift = ease(150, 815, elapsed) * (1 - ease(1020, 1710, elapsed));
    letters.forEach(({ letter, from, to }, i) => {
      const order = i / span, offset = order - .5, lag = order * 320;
      const gather = ease(68 + lag * .45, cut + lag * .16, elapsed);
      const release = ease(930 + lag * .37, 1620 + lag * .26, elapsed);
      const cx = mix(mix(from.x, hub.x, gather), to.x, release);
      const cy = mix(mix(from.y, hub.y, gather), to.y, release);
      const turn = ease(175 + lag, 1280 + lag, elapsed);
      const coil = Math.sin(Math.PI * turn), angle = orbit - offset * Math.PI * 1.78;
      const side = Math.sin(angle) * lift, depth = Math.cos(angle) * lift;
      const x = cx + radius * .72 * side;
      const y = cy + radius * (.4 * depth + .3 * offset * lift);
      const z = radius * .48 * depth;
      const roll = offset * 31 * coil + 17 * side, tilt = -19 * depth;
      letter.style.setProperty('--s12-fold', coil);
      letter.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateZ(${roll}deg) rotateX(${tilt}deg) rotateY(${turn * 180}deg) scale(${1 - .13 * lift})`;
    });
  }

  function strokeSignal(elapsed, carrierX, carrierY, opacity, lineWidth) {
    const { signal, signalPoints, trace, plot, height } = run;
    const travel = ease(310, 1550, elapsed), pinch = ease(235, 1310, elapsed);
    const peak = ease(925, 1520, elapsed);
    const arc = Math.sin(travel * Math.PI);
    const x = mix(signal.x, plot.x + carrierX, travel);
    const y = mix(signal.y, plot.y + carrierY, travel) + height * .044 * arc;
    const span = mix(trace.box.w, 11, pinch);
    const bend = Math.min(28, height * .038) * arc * (1 - peak);
    ctx.globalAlpha = (1 - ease(1515, 1980, elapsed)) * ease(65, 310, elapsed) * opacity;
    ctx.strokeStyle = trace.color;
    ctx.lineWidth = lineWidth + .4 * peak;
    ctx.beginPath();
    signalPoints.forEach(([offset, level, needle], i) => {
      const dx = x + offset * span;
      const dy = y + bend * Math.sin((offset + .5 + travel) * Math.PI * 1.5) +
        mix(level * (1 - pinch * .66), needle, peak);
      if (i === 0) ctx.moveTo(dx, dy);
      else ctx.lineTo(dx, dy);
    });
    ctx.stroke();
  }

  function drawSignal(elapsed) {
    const { plot, width, height } = run;
    const spectrum = chart.spectrumTrace;
    const carrierX = spectrum ? spectrum.X(spectrum.carrier[0]) : (plot.w + 10) / 2;
    const carrierY = spectrum ? spectrum.Y(spectrum.carrier[1]) : 26 + (plot.h - 70) * 6 / 116;
    ctx.clearRect(0, 0, width, height);
    const echo = ease(355, 680, elapsed) * (1 - ease(1330, 1640, elapsed));
    if (echo) strokeSignal(elapsed - 45, carrierX, carrierY, echo * .15, 2.5);
    strokeSignal(elapsed, carrierX, carrierY, 1, 1.2);

    if (!run.landed) return;
    const open = ease(1310, 2170, elapsed);
    const left = carrierX * (1 - open), right = mix(carrierX, plot.w, open);
    const feather = Math.min(28, (right - left) / 2) * (1 - open);
    chart.style.maskImage = `linear-gradient(90deg, transparent ${left}px, #000 ${left + feather}px, #000 ${right - feather}px, transparent ${right}px)`;
  }

  function clearEffects() {
    if (!vortex.isConnected) return;
    vortex.remove();
    vortex.replaceChildren(wave);
    source.classList.remove('s12-title-in-flight');
    title.classList.remove('s12-title-in-flight');
    title.style.removeProperty('--s12-heading-opacity');
    vortex.style.removeProperty('--s12-letter-opacity');
    scene.classList.remove('s12-staged');
    chart.style.removeProperty('mask-image');
    run.animations.forEach(animation => animation.cancel());
  }

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    clearEffects();
    run = undefined;
    root.classList.remove('deep-whispering-hold');
    sourceChart.pauseAnswerScan?.(false);
    scheduleMotion();
  }

  function land() {
    scrollTo({ top: run.destination, behavior: 'instant' });
    run.top = scrollY;
    run.landed = true;
    scene.classList.remove('s12-staged');
    for (const [i, node] of Array.from(after.children).entries()) {
      if (node === title) continue;
      run.animations.push(node.animate([
        { opacity: 0, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 410, delay: 465 + i * 42, easing: arrivalEase, fill: 'both' }));
    }
  }

  function animate(now) {
    const elapsed = now - run.start;
    if (elapsed >= cut && !run.landed) land();
    if (elapsed < arrivalEnd) {
      turnHeading(elapsed);
      drawSignal(elapsed);
    } else if (vortex.isConnected) clearEffects();
    if (elapsed >= arrivalEnd + readHold) return finish();
    frame = requestAnimationFrame(animate);
  }

  function approach(top, height) {
    const start = bounds(previous, top).y, end = bounds(scene, top).y;
    const cue = Math.max(start, Math.min(end - height, bounds(source, top).y - 8));
    return { start, cue, end };
  }

  function startRun(height) {
    if (run || !canPlay() || !sourceChart.answerTrace) return;
    const width = viewportWidth();
    const { cue, end } = approach(scrollY, height);
    if (scrollY > cue + 1 || source.getBoundingClientRect().top < 0) {
      scrollTo({ top: cue, behavior: 'instant' });
    }
    const top = scrollY;
    const plot = bounds(chart, top), oldPlot = bounds(sourceChart, top);
    const extra = Math.max(0, Math.min(plot.y + plot.h + 6 - end - height, bounds(title, top).y - end - 12));
    const destination = end + extra;
    const stacked = matchMedia('(max-width: 860px)').matches;
    plot.y -= destination;
    const letters = placeLetters(glyphs(source, 0), glyphs(title, top - destination));

    sourceChart.pauseAnswerScan?.(true);
    const trace = sourceChart.answerTrace;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    wave.width = Math.round(width * dpr);
    wave.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
    const baseline = trace.Y(1);
    const signal = { x: oldPlot.x + trace.box.x + trace.box.w / 2, y: oldPlot.y - top + baseline };
    const signalPoints = trace.points.map(([sample, current]) => {
      const offset = (trace.X(sample) - trace.box.x) / trace.box.w - .5;
      return [offset, trace.Y(current) - baseline, 49 * Math.abs(offset * 2) ** .37];
    });
    const hub = { x: width * (stacked ? .52 : .51), y: height * (stacked ? .30 : .47) };
    run = { top, width, height, start: performance.now(), letters, hub, destination, plot, signal, signalPoints, trace,
      radius: Math.min(stacked ? 112 : 226, width * .28), animations: [] };

    root.classList.add('deep-whispering-hold');
    scene.classList.add('s12-staged');
    chart.style.maskImage = 'linear-gradient(transparent, transparent)';
    source.classList.add('s12-title-in-flight');
    title.classList.add('s12-title-in-flight');
    chapter.append(vortex);
    for (const node of [...before.children, instrument]) {
      if (node === source) continue;
      run.animations.push(node.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: node === instrument ? 355 : 540, delay: node === instrument ? 135 : 65, fill: 'both' }));
    }
    turnHeading(0);
    frame = requestAnimationFrame(animate);
  }

  function syncFlickerRate() {
    if (!flickerToggle || !flickerRate) return;
    flickerRate.textContent = flickerToggle.checked ? '847.5 kHz' : 'Off';
    flickerRate.toggleAttribute('data-off', !flickerToggle.checked);
  }

  function stepFlicker(now) {
    flickerFrame = 0;
    const t = ease(0, 360, now - flickerStart);
    flickerBlend = mix(flickerFrom, flickerTarget, t);
    chart.setSpectrumMotion?.(flickerBlend);
    if (flickerBlend !== flickerTarget) flickerFrame = requestAnimationFrame(stepFlicker);
  }

  function settleFlicker() {
    cancelAnimationFrame(flickerFrame);
    flickerFrame = 0;
    readoutFlip?.cancel();
    flickerBlend = flickerTarget;
    chart.setSpectrumMotion?.(flickerBlend);
  }

  syncFlickerRate();
  flickerToggle?.addEventListener('change', () => {
    finish();
    syncFlickerRate();
    flickerTarget = Number(flickerToggle.checked);
    cancelAnimationFrame(flickerFrame);
    flickerFrame = 0;
    readoutFlip?.cancel();
    if (!reducedMotion.matches && !document.hidden && chart.setSpectrumMotion) {
      readoutFlip = readout?.animate([
        { transform: 'perspective(440px) rotateX(-28deg)', opacity: .66 },
        { transform: 'none', opacity: 1 },
      ], { duration: 230, easing: arrivalEase });
      flickerFrom = chart.spectrumTrace?.blend ?? flickerBlend;
      flickerStart = performance.now();
      flickerFrame = requestAnimationFrame(stepFlicker);
    } else {
      flickerBlend = flickerTarget;
      chart.setSpectrumMotion?.(flickerBlend);
    }
  });

  watchScrollMotion((top, height) => {
    if (run) {
      if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
      else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
    }
  });

  for (const controls of [previous, scene].flatMap(plate => [...plate.querySelectorAll('.plate-controls')])) {
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, finish);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, finish);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { revCtrl?.cancel(); finish(); settleFlicker(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { revCtrl?.cancel(); finish(); settleFlicker(); } });

  return {
    forward() {
      if (!canPlay() || run || revCtrl?.active()) return;
      sanitizeChapter();
      if (!sourceChart.answerTrace) {
        scene.scrollIntoView({ block: 'start', behavior: 'instant' });
        return;
      }
      startRun(innerHeight);
    },
    reverse() {
      if (!canPlay() || run || revCtrl?.active()) return;
      revCtrl = runReverseCanvasMorph(scene, previous, { mode: 'whispering' });
    },
    cancel: () => { revCtrl?.cancel(); finish(); },
    active: () => !!run || !!revCtrl?.active(),
  };
}

function watchCounting(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const source = previous.querySelector('#s12-chart'), chart = scene.querySelector('#s13-chart');
  const readout = scene.querySelector('.plate-readout'), exactBtn = scene.querySelector('#s13-exact');
  const codeSwitch = scene.querySelector('.s13-code-switch');
  const driftInput = scene.querySelector('#s13-drift-input');
  const driftWord = scene.querySelector('.s13-drift-word');
  const driftZero = scene.querySelector('.s13-drift-zero');
  const copy = document.createElement('canvas');
  copy.className = 's13-spectrum-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const end = 2260, readHold = 1000;
  let run, frame, readoutFlip;
  let codeBlend = scene.querySelector('input[name="s13-code"]:checked')?.value === 'manchester' ? 1 : 0;
  let codeTarget = codeBlend, codeFrom = codeBlend, codeStart = 0, codeFrame = 0;
  let prevDriftSign = Math.sign(driftInput?.valueAsNumber ?? 7), wordFlip, zeroPulse;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden;

  function finish(land = true) {
    if (!run) return;
    cancelAnimationFrame(frame);
    if (land) scrollTo({ top: run.direction > 0 ? run.destination : run.origin, behavior: 'instant' });
    copy.remove();
    source.style.removeProperty('--s13-spectrum-opacity');
    for (const node of [source, before]) node.style.removeProperty('transform');
    before.style.removeProperty('opacity');
    before.style.removeProperty('visibility');
    chart.style.removeProperty('opacity');
    chart.setCountingHandoff?.(1);
    for (const property of ['words-in', 'words-offset', 'controls-in', 'controls-visibility', 'result-in']) {
      scene.style.removeProperty(`--s13-${property}`);
    }
    run = undefined;
    root.classList.remove('deep-counting-hold');
    scheduleMotion();
  }

  function paint() {
    const { elapsed, width, height, from, to, spectrum } = run;
    const wordsOut = 1 - ease(50, 570, elapsed);
    const wordsIn = ease(385, 960, elapsed);
    const controlsIn = ease(1070, 1690, elapsed);
    const blend = ease(685, 885, elapsed);
    const digits = stage(850, end, elapsed);

    before.style.opacity = wordsOut;
    before.style.visibility = wordsOut ? 'visible' : 'hidden';
    scene.style.setProperty('--s13-words-in', wordsIn);
    scene.style.setProperty('--s13-words-offset', `${8 * (1 - wordsIn)}px`);
    scene.style.setProperty('--s13-controls-in', controlsIn);
    scene.style.setProperty('--s13-controls-visibility', controlsIn ? 'visible' : 'hidden');
    scene.style.setProperty('--s13-result-in', ease(1940, end, elapsed));
    chart.style.opacity = blend;
    chart.setCountingHandoff?.(digits);

    const leave = ease(0, 165, elapsed);
    source.style.setProperty('--s13-spectrum-opacity', 1 - leave);
    ctx.clearRect(0, 0, width, height);
    if (!leave || blend === 1) return;

    const travel = ease(75, 770, elapsed), flatten = ease(130, 750, elapsed);
    const x = mix(from.x, to.x, travel), w = mix(from.w, to.w, travel);
    const center = mix(from.y + from.h / 2, to.y, travel);
    const { box, X, Y, points, color } = spectrum;
    ctx.beginPath();
    for (const [i, [frequency, strength]] of points.entries()) {
      const px = x + (X(frequency) - box.x) / box.w * w;
      const py = center + (Y(strength) - box.y - box.h / 2) * (1 - flatten);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.globalAlpha = leave * (1 - blend) * (1 - flatten);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = leave * (1 - blend) * flatten;
    ctx.strokeStyle = '#b8652a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    const next = Math.max(0, Math.min(end, run.elapsed + (now - run.last) * run.direction));
    run.last = now;
    if (run.elapsed !== next) {
      run.elapsed = next;
      paint();
    }
    if (next === (run.direction > 0 ? end : 0)) {
      run.holdUntil ??= now + readHold;
      if (now >= run.holdUntil) return finish();
    }
    frame = requestAnimationFrame(tick);
  }

  function startRun(direction) {
    if (run || !canPlay()) return;
    sanitizeChapter();
    const spectrum = source.spectrumTrace, timing = chart.timingTrace;
    if (!spectrum || !timing) {
      (direction > 0 ? scene : previous).scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }

    const top = scrollY, width = viewportWidth(), height = innerHeight;
    const previousTop = bounds(previous, top).y, sceneTop = bounds(scene, top).y;
    const from = bounds(source, top), to = bounds(chart, top);
    const origin = direction > 0 ? top : previousTop;
    const extra = Math.max(0, Math.min(to.y + to.h + 6 - sceneTop - height, scene.offsetHeight - height));
    const destination = direction < 0 ? top : sceneTop + extra;
    const { box } = spectrum;

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';

    root.classList.add('deep-counting-hold');
    scrollTo({ top: destination, behavior: 'instant' });
    const pin = `translateY(${scrollY - origin}px)`;
    source.style.transform = before.style.transform = pin;
    run = { top: scrollY, width, height, origin, destination, direction, elapsed: direction > 0 ? 0 : end,
      spectrum, from: { x: from.x + box.x, y: from.y - origin + box.y, w: box.w, h: box.h },
      to: { x: to.x + timing.box.x, y: to.y - destination + timing.Y(0), w: timing.box.w } };
    chapter.append(copy);
    paint();
    run.last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function flipReadout() {
    readoutFlip?.cancel();
    if (!reducedMotion.matches && !document.hidden) {
      readoutFlip = readout?.animate([
        { transform: 'perspective(440px) rotateX(-28deg)', opacity: .66 },
        { transform: 'none', opacity: 1 },
      ], { duration: 210, easing: arrivalEase });
    }
  }

  function syncCodePill() {
    if (!codeSwitch) return;
    const checked = codeSwitch.querySelector('input:checked')?.closest('label');
    if (!checked) return;
    codeSwitch.style.setProperty('--s13-pill-x', `${checked.offsetLeft}px`);
    codeSwitch.style.setProperty('--s13-pill-w', `${checked.offsetWidth}px`);
  }

  function stepCodeMorph(now) {
    codeFrame = 0;
    const t = ease(0, 380, now - codeStart);
    codeBlend = mix(codeFrom, codeTarget, t);
    chart.setCountingMotion?.(codeBlend);
    if (codeBlend !== codeTarget) codeFrame = requestAnimationFrame(stepCodeMorph);
  }

  function settleControls() {
    cancelAnimationFrame(codeFrame);
    codeFrame = 0;
    codeBlend = codeTarget;
    chart.setCountingMotion?.(codeBlend);
    readoutFlip?.cancel();
    wordFlip?.cancel();
    zeroPulse?.cancel();
  }

  syncCodePill();
  requestAnimationFrame(() => codeSwitch?.classList.add('is-ready'));
  document.fonts?.ready.then(syncCodePill);
  addEventListener('resize', syncCodePill);
  if (codeSwitch && typeof ResizeObserver === 'function') new ResizeObserver(syncCodePill).observe(codeSwitch);

  for (const radio of scene.querySelectorAll('input[name="s13-code"]')) {
    radio.addEventListener('change', () => {
      finish();
      syncCodePill();
      flipReadout();
      codeTarget = radio.value === 'manchester' ? 1 : 0;
      cancelAnimationFrame(codeFrame);
      codeFrame = 0;
      if (!reducedMotion.matches && !document.hidden && chart.setCountingMotion) {
        codeFrom = chart.timingTrace?.codeBlend ?? codeBlend;
        chart.setCountingMotion(codeFrom);
        codeStart = performance.now();
        codeFrame = requestAnimationFrame(stepCodeMorph);
      } else {
        codeBlend = codeTarget;
        chart.setCountingMotion?.(codeBlend);
      }
    });
  }

  driftInput?.addEventListener('input', () => {
    const nextSign = Math.sign(driftInput.valueAsNumber || 0);
    if (nextSign !== prevDriftSign) {
      const dir = Math.sign(nextSign - prevDriftSign);
      if (!reducedMotion.matches && !document.hidden) {
        wordFlip?.cancel();
        wordFlip = driftWord?.animate([
          { opacity: 0, transform: `perspective(260px) translateY(${dir * 7}px) rotateX(${-dir * 52}deg)` },
          { opacity: 1, transform: 'none' },
        ], { duration: 260, easing: arrivalEase });
        zeroPulse?.cancel();
        zeroPulse = driftZero?.animate([
          { transform: 'translateX(-50%) scaleY(1)' },
          { transform: 'translateX(-50%) scaleY(1.65)', offset: .36 },
          { transform: 'translateX(-50%) scaleY(1)' },
        ], { duration: 260, easing: arrivalEase });
        if (scene.querySelector('input[name="s13-code"]:checked')?.value === 'simple') flipReadout();
      }
      prevDriftSign = nextSign;
    }
  });
  exactBtn?.addEventListener('click', flipReadout);

  watchScrollMotion((top, height) => {
    if (!run) return;
    if (!canPlay() || Math.abs(top - run.top) > height * .95) finish(false);
    else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
  });

  for (const [plate, direction] of [[previous, -1], [scene, 1]]) {
    const controls = plate.querySelector('.plate-controls');
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, () => {
      if (!run) return;
      run.direction = direction;
      finish();
    });
  }
  addEventListener('resize', () => finish());
  for (const event of ['hashchange', 'pagehide']) addEventListener(event, () => finish(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finish(); settleControls(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { finish(); settleControls(); } });

  return {
    forward: () => startRun(1),
    reverse: () => startRun(-1),
    turn(direction) {
      if (!run) return false;
      run.direction = direction;
      run.holdUntil = undefined;
      return true;
    },
    cancel: finish,
    active: () => !!run,
  };
}

function watchMistakes(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const source = previous.querySelector('#s13-chart'), chart = scene.querySelector('#s14-chart');
  const strip = scene.querySelector('#s14-signal'), replies = scene.querySelector('#s14-replies');
  const copy = document.createElement('canvas');
  copy.className = 's14-timing-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const cut = 690, duration = 1740, readHold = 1000;
  let run, frame;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden;

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    run.animations.forEach(animation => animation.cancel());
    copy.remove();
    root.classList.remove('deep-mistakes-hold');
    run = undefined;
    scheduleMotion();
  }

  function wavePoints(fromTop, toTop) {
    const timing = source.timingTrace, signal = chart.errorTrace;
    if (!timing?.level.length || !signal?.points.length) return [];
    const level = timing.plottedLevel ?? timing.level;
    const from = bounds(source, scrollY), to = bounds(chart, scrollY);
    // Sample both live traces once, using the viewport position where each scene settles.
    return Array.from({ length: 641 }, (_, i) => {
      const u = i / 640, sample = Math.min(level.length - 1, Math.floor(u * level.length));
      const [step, current] = signal.points[Math.round(u * (signal.points.length - 1))];
      return [
        from.x + timing.X(u * level.length), from.y - fromTop + timing.Y(level[sample]),
        to.x + signal.X(step), to.y - toTop + signal.Y(current),
      ];
    });
  }

  function animateStyles() {
    const add = (node, keyframes, delay, duration) => {
      const animation = node.animate(keyframes, { delay, duration, easing: 'ease-in-out', fill: 'both' });
      animation.pause();
      run.animations.push(animation);
    };
    const fade = (node, delay, duration, enter, offset) => {
      const hidden = { opacity: 0, transform: `translateY(${offset}px)`, filter: 'blur(2px)' };
      const visible = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
      add(node, enter ? [hidden, visible] : [visible, hidden], delay, duration);
    };
    Array.from(before.children).forEach((node, i) => fade(node, 60 + i * 36, 380, false, -5));
    add(source, [{ opacity: 1 }, { opacity: 0 }], 120, 300);
    Array.from(after.children).forEach((node, i) => fade(node, cut + i * 52, 470, true, 7));
    for (const node of [strip.previousElementSibling, strip.nextElementSibling]) fade(node, cut + 180, 460, true, 4);
    add(strip, [
      { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
      { opacity: 1, clipPath: 'inset(0)' },
    ], 950, 430);
    const rows = Array.from(replies.children);
    rows.forEach((row, i) => fade(row, 1050 + i * (300 / rows.length), 390, true, 5));
  }

  function drawHandoff(position) {
    const { width, height, points } = run;
    ctx.clearRect(0, 0, width, height);
    if (!points.length) return;
    const alpha = ease(120, 420, position) * (1 - ease(1110, 1380, position));
    if (alpha <= 0) return;

    const travel = ease(310, 1090, position);
    const fold = ease(350, 1080, position);
    const arch = Math.sin(Math.PI * travel) * -Math.min(24, height * .045);
    const scan = ease(410, 1100, position);
    const point = points[Math.round(scan * (points.length - 1))];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgb(${Math.round(mix(13, 184, fold))}, ${Math.round(mix(13, 101, fold))}, ${Math.round(mix(12, 42, fold))})`;
    ctx.lineWidth = mix(2, 1.45, fold);
    ctx.beginPath();
    points.forEach(([x0, y0, x1, y1], i) => {
      const x = mix(x0, x1, travel), y = mix(y0, y1, fold) + arch;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();

    ctx.globalAlpha = alpha * Math.sin(Math.PI * scan) * .8;
    ctx.beginPath();
    ctx.arc(mix(point[0], point[2], travel), mix(point[1], point[3], fold) + arch, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f2ec';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    const { position, fromTop, toTop, animations } = run;
    for (const animation of animations) animation.currentTime = position;
    const top = position < cut ? fromTop : toTop;
    if (Math.abs(scrollY - top) > 1) scrollTo({ top, behavior: 'instant' });
    run.top = scrollY;
    drawHandoff(position);
  }

  function animate(now) {
    const elapsed = Math.max(0, now - run.lastTime);
    run.lastTime = now;
    const position = Math.max(0, Math.min(duration, run.position + run.dir * elapsed));
    if (position !== run.position) {
      run.position = position;
      render();
    }
    if (position === (run.dir > 0 ? duration : 0)) {
      run.holdUntil ??= now + readHold;
      if (now >= run.holdUntil) {
        const [departed, arrived] = run.dir > 0 ? [previous, scene] : [scene, previous];
        finish();
        if (departed.contains(document.activeElement)) arrived.focus({ preventScroll: true });
        return;
      }
    }
    frame = requestAnimationFrame(animate);
  }

  function start(dir) {
    if (run || !canPlay()) return;
    sanitizeChapter();
    const top = scrollY, width = viewportWidth(), height = innerHeight;
    const sceneTop = bounds(scene, top).y;
    const fromTop = dir > 0 ? top : bounds(previous, top).y;
    const toTop = dir > 0 ? sceneTop : top;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';

    run = { top, width, height, fromTop, toTop, dir, position: dir > 0 ? 0 : duration,
      lastTime: performance.now(), points: wavePoints(fromTop, toTop), animations: [] };
    root.classList.add('deep-mistakes-hold');
    chapter.append(copy);
    animateStyles();
    render();
    frame = requestAnimationFrame(animate);
  }

  watchScrollMotion((top, height) => {
    if (!run) return;
    if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
    else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
  });

  for (const area of [previous.querySelector('.plate-controls'), scene.querySelector('.plate-controls'), scene.querySelector('.s14-instrument')]) {
    for (const event of ['focusin', 'input']) area?.addEventListener(event, finish);
    area?.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !event.target.closest('.s14-cell')) finish();
    });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, finish);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finish(); });

  return {
    forward: () => start(1),
    reverse: () => start(-1),
    turn(dir) {
      if (!run) return false;
      run.dir = dir;
      run.lastTime = performance.now();
      run.holdUntil = undefined;
      return true;
    },
    cancel: finish,
    active: () => !!run,
  };
}

function watchConversation(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const source = previous.querySelector('#s14-replies'), sourceChart = previous.querySelector('#s14-chart');
  const title = scene.querySelector('#s15-title'), gate = scene.querySelector('.plate-gate');
  const chart = scene.querySelector('#s15-chart'), chat = scene.querySelector('.chat');
  if (!before || !source || !after || !gate || !chart) return;

  const copy = document.createElement('canvas');
  copy.className = 's15-handoff-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const cut = 640, arrivalEnd = 1660, readHold = 1000;
  let run, rev, frame;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden;

  function clearEffects() {
    if (!copy.isConnected && !scene.classList.contains('s15-staged')) return;
    copy.remove();
    previous.style.removeProperty('--s15-source-opacity');
    chart.style.removeProperty('--s15-river-opacity');
    scene.classList.remove('s15-staged');
    run?.animations.forEach(animation => animation.cancel());
  }

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    clearEffects();
    run = undefined;
    root.classList.remove('deep-conversation-hold');
    scheduleMotion();
  }

  function sampleBits(height, toBox, stacked) {
    const bits = [];
    for (const el of source.querySelectorAll('.s14-bit')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > height) continue;
      const ch = (el.textContent || '0').trim().slice(0, 1) || '0';
      bits.push({ sx: r.left + r.width * .5, sy: r.top + r.height * .5, ch, wrong: el.hasAttribute('data-wrong') });
    }
    const maxCount = 56;
    const picked = bits.length > maxCount
      ? Array.from({ length: maxCount }, (_, i) => bits[Math.floor(i * bits.length / maxCount)])
      : bits;
    if (picked.length < 32 && sourceChart) {
      const cr = sourceChart.getBoundingClientRect();
      const needed = 32 - picked.length;
      for (let i = 0; i < needed; i++) {
        picked.push({
          sx: cr.left + (i + .5) / needed * Math.max(40, cr.width),
          sy: cr.top + cr.height * .42,
          ch: i % 3 === 0 ? '1' : '0',
          wrong: false,
        });
      }
    }
    const n = Math.max(1, picked.length);
    return picked.map((bit, i) => {
      const lane = i % 2;
      const laneT = ((i + .5) / n);
      return {
        ...bit,
        lane,
        dep: 40 + (i / n) * 260,
        dur: 860 + (i % 5) * 55,
        arc: stacked ? -12 : (lane === 0 ? -26 : -14),
        tx: toBox.x + 14 + laneT * Math.max(40, toBox.w - 28),
        ty: toBox.y + toBox.h * (lane === 0 ? .36 : .64),
      };
    });
  }

  function land() {
    scrollTo({ top: run.destination, behavior: 'instant' });
    run.top = scrollY;
    run.landed = true;
    scene.classList.remove('s15-staged');
    for (const [i, node] of Array.from(after.children).entries()) {
      const focused = node === title || node === gate;
      run.animations.push(node.animate(
        focused
          ? [{ opacity: 0, filter: 'blur(6px)', transform: 'translateY(6px)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }]
          : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        {
          duration: focused ? 460 : 400,
          delay: focused ? (node === title ? 40 : 120) : 160 + i * 42,
          easing: arrivalEase,
          fill: 'both',
        }
      ));
    }
    if (chat) {
      run.animations.push(chat.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 440, delay: 420, easing: arrivalEase, fill: 'both' }));
    }
  }

  function drawHandoff(elapsed) {
    const { width, height, bits, gateBox } = run;
    previous.style.setProperty('--s15-source-opacity', 1 - ease(40, 280, elapsed));
    ctx.clearRect(0, 0, width, height);

    const bitsAlpha = 1 - ease(1220, 1620, elapsed);
    if (bitsAlpha > 0) {
      ctx.save();
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of bits) {
        const travel = ease(b.dep, b.dep + b.dur, elapsed);
        const px = mix(b.sx, b.tx, travel);
        const py = mix(b.sy, b.ty, travel) + Math.sin(Math.PI * travel) * b.arc;
        if (b.wrong) {
          const cool = travel;
          const r = Math.round(mix(179, b.lane === 0 ? 87 : 184, cool));
          const g = Math.round(mix(38, b.lane === 0 ? 83 : 101, cool));
          const bp = Math.round(mix(30, b.lane === 0 ? 76 : 42, cool));
          ctx.fillStyle = `rgb(${r}, ${g}, ${bp})`;
        } else {
          ctx.fillStyle = b.lane === 0 ? '#57534c' : '#b8652a';
        }
        ctx.globalAlpha = bitsAlpha * mix(.92, .8, travel);
        ctx.fillText(b.ch, px, py);
      }
      ctx.restore();
    }

    if (elapsed >= cut) {
      const lineSweep = ease(cut, 1040, elapsed);
      const lineFade = 1 - ease(1060, 1320, elapsed);
      if (lineSweep > 0 && lineFade > 0) {
        ctx.save();
        ctx.globalAlpha = lineFade * .85;
        ctx.strokeStyle = '#b8652a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gateBox.x, gateBox.y - 6);
        ctx.lineTo(gateBox.x + gateBox.w * lineSweep, gateBox.y - 6);
        ctx.stroke();
        ctx.restore();
      }
      chart.style.setProperty('--s15-river-opacity', ease(1100, 1520, elapsed));
    }
  }

  function animate(now) {
    const elapsed = now - run.start;
    if (elapsed >= cut && !run.landed) land();
    if (elapsed < arrivalEnd) drawHandoff(elapsed);
    else if (copy.isConnected) clearEffects();
    if (elapsed >= arrivalEnd + readHold) return finish();
    frame = requestAnimationFrame(animate);
  }

  function approach(top, height) {
    const start = bounds(previous, top).y, end = bounds(scene, top).y;
    const cue = Math.max(start, end - height);
    return { start, cue, end };
  }

  function startRun(height) {
    if (run || !canPlay()) return;
    const width = viewportWidth();
    const { cue, end } = approach(scrollY, height);
    if (scrollY > cue + 1) scrollTo({ top: cue, behavior: 'instant' });
    const top = scrollY;

    const destination = end;
    const to = bounds(chart, top), gBounds = bounds(gate, top);
    const toBox = { x: to.x, y: to.y - destination, w: Math.max(120, to.w), h: Math.max(48, to.h) };
    const gateBox = { x: gBounds.x, y: gBounds.y - destination, w: Math.max(80, gBounds.w) };
    const stacked = matchMedia('(max-width: 860px)').matches;
    const bits = sampleBits(height, toBox, stacked);

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    run = { top, width, height, start: performance.now(), destination, bits, gateBox, animations: [] };
    root.classList.add('deep-conversation-hold');
    scene.classList.add('s15-staged');
    chart.style.setProperty('--s15-river-opacity', 0);
    chapter.append(copy);
    for (const node of before.children) {
      run.animations.push(node.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 380, delay: 40, fill: 'both' }));
    }
    drawHandoff(0);
    frame = requestAnimationFrame(animate);
  }

  function finishReverse() {
    if (!rev) return;
    cancelAnimationFrame(rev.frame);
    rev.anims.forEach(a => a.cancel());
    copy.remove();
    previous.classList.remove('deep-rev-staged');
    previous.style.removeProperty('--s15-source-opacity');
    chart.style.removeProperty('--s15-river-opacity');
    root.classList.remove('deep-reverse-hold');
    rev = undefined;
    scheduleMotion();
  }

  function startReverse() {
    if (run || rev || !canPlay()) return;
    sanitizeChapter();
    const s15Top = bounds(scene, scrollY).y;
    if (Math.abs(scrollY - s15Top) > 2) scrollTo({ top: s15Top, behavior: 'instant' });
    const top = scrollY, width = viewportWidth(), height = innerHeight;
    const destination = bounds(previous, top).y;
    const gBounds = bounds(gate, top), gateBox = { x: gBounds.x, y: gBounds.y - top, w: Math.max(80, gBounds.w) };
    const fromRect = bounds(chart, top), fromBox = { x: fromRect.x, y: fromRect.y - top, w: Math.max(120, fromRect.w), h: Math.max(48, fromRect.h) };
    const stacked = matchMedia('(max-width: 860px)').matches;

    const rawTargets = Array.from(source.querySelectorAll('.s14-bit'));
    const maxB = 48;
    const chosen = rawTargets.length > maxB ? Array.from({ length: maxB }, (_, i) => rawTargets[Math.floor(i * rawTargets.length / maxB)]) : rawTargets;
    const bits = chosen.map((el, i) => {
      const b = bounds(el, top), lane = i % 2, u = (i + .5) / Math.max(1, chosen.length);
      return {
        ch: (el.textContent || '0').trim().slice(0, 1) || '0',
        wrong: el.hasAttribute('data-wrong'),
        sx: fromBox.x + 14 + u * Math.max(40, fromBox.w - 28),
        sy: fromBox.y + fromBox.h * (lane === 0 ? .36 : .64),
        tx: b.x + b.w * .5,
        ty: b.y - destination + b.h * .5,
        dep: 140 + (i / Math.max(1, chosen.length)) * 240,
        dur: 760 + (i % 4) * 45,
        arc: stacked ? 14 : (lane === 0 ? -22 : -10),
        lane,
      };
    });

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rev = { top, width, height, destination, gateBox, fromBox, bits, start: performance.now(), landed: false, frame: 0, anims: [] };
    root.classList.add('deep-reverse-hold');
    previous.classList.add('deep-rev-staged');
    chapter.append(copy);

    for (const node of Array.from(after.children)) {
      const focused = node === title || node === gate;
      rev.anims.push(node.animate([
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
        { opacity: 0, filter: `blur(${focused ? 5 : 2}px)`, transform: 'translateY(8px)' },
      ], { duration: 360, delay: focused ? 20 : 60, easing: 'ease-in', fill: 'both' }));
    }
    if (chat) rev.anims.push(chat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'both' }));

    function stepRev(now) {
      if (!rev) return;
      const elapsed = now - rev.start;
      if (elapsed >= 520 && !rev.landed) {
        rev.landed = true;
        scrollTo({ top: rev.destination, behavior: 'instant' });
        rev.top = scrollY;
        previous.classList.remove('deep-rev-staged');
        for (const [i, node] of Array.from(before.children).entries()) {
          rev.anims.push(node.animate([
            { opacity: 0, transform: 'translateY(-10px)' },
            { opacity: 1, transform: 'none' },
          ], { duration: 380, delay: 40 + i * 36, easing: arrivalEase, fill: 'both' }));
        }
      }
      if (Math.abs(scrollY - rev.top) > 1 && Math.abs(scrollY - rev.top) < innerHeight * .95) {
        scrollTo({ top: rev.top, behavior: 'instant' });
      }
      if (!rev.landed) chart.style.setProperty('--s15-river-opacity', 1 - ease(80, 380, elapsed));
      else previous.style.setProperty('--s15-source-opacity', ease(580, 1020, elapsed));

      ctx.clearRect(0, 0, rev.width, rev.height);
      const lineFade = 1 - ease(420, 560, elapsed);
      const lineSweep = 1 - ease(40, 420, elapsed);
      if (lineFade > 0 && lineSweep > 0) {
        ctx.save();
        ctx.globalAlpha = lineFade * .85;
        ctx.strokeStyle = '#b8652a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rev.gateBox.x, rev.gateBox.y - 6);
        ctx.lineTo(rev.gateBox.x + rev.gateBox.w * lineSweep, rev.gateBox.y - 6);
        ctx.stroke();
        ctx.restore();
      }
      const bitsAlpha = ease(60, 220, elapsed) * (1 - ease(1020, 1280, elapsed));
      if (bitsAlpha > 0) {
        ctx.save();
        ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const b of rev.bits) {
          const t = ease(b.dep, b.dep + b.dur, elapsed);
          const px = mix(b.sx, b.tx, t);
          const py = mix(b.sy, b.ty, t) + Math.sin(Math.PI * t) * b.arc;
          ctx.fillStyle = b.wrong && t > .6 ? '#b3261e' : (b.lane === 0 ? '#57534c' : '#b8652a');
          ctx.globalAlpha = bitsAlpha;
          ctx.fillText(b.ch, px, py);
        }
        ctx.restore();
      }
      if (elapsed >= 1280 + 360) return finishReverse();
      rev.frame = requestAnimationFrame(stepRev);
    }
    rev.frame = requestAnimationFrame(stepRev);
  }

  watchScrollMotion((top, height) => {
    if (run) {
      if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
      else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
    }
  });

  for (const area of [previous.querySelector('.plate-controls'), previous.querySelector('.s14-instrument'), scene.querySelector('.plate-controls'), scene.querySelector('.plate-river')]) {
    if (!area) continue;
    for (const event of ['focusin', 'pointerdown', 'input']) area.addEventListener(event, () => { finishReverse(); finish(); });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, () => { finishReverse(); finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finishReverse(); finish(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { finishReverse(); finish(); } });

  return {
    forward() {
      if (!canPlay() || run || rev) return;
      sanitizeChapter();
      startRun(innerHeight);
    },
    reverse: startReverse,
    cancel: () => { finishReverse(); finish(); },
    active: () => !!run || !!rev,
  };
}

function watchTwoCards(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const before = previous.querySelector('.plate-words'), source = previous.querySelector('.plate-river');
  const sourceChart = previous.querySelector('#s15-chart'), sourceTitle = previous.querySelector('#s15-title');
  const after = scene.querySelector('.plate-words'), targetTitle = scene.querySelector('#s16-title');
  const chart = scene.querySelector('#s16-chart'), desk = scene.querySelector('#s16-desk');
  if (!before || !source || !sourceChart || !sourceTitle || !after || !targetTitle || !chart) return;

  const copy = document.createElement('canvas');
  copy.className = 's16-handoff-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const cut = 620, arrivalEnd = 1680, readHold = 1000;
  let run, rev, frame;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden;

  function clearEffects() {
    if (!copy.isConnected && !run?.titleMorph?.isConnected && !scene.classList.contains('s16-staged')) return;
    copy.remove();
    run?.titleMorph?.remove();
    targetTitle.style.removeProperty('opacity');
    previous.style.removeProperty('--s16-source-opacity');
    chart.style.removeProperty('--s16-chart-opacity');
    scene.classList.remove('s16-staged');
    run?.animations.forEach(animation => animation.cancel());
  }

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    clearEffects();
    run = undefined;
    root.classList.remove('deep-twocards-hold');
    scheduleMotion();
  }

  function buildStrandBits(fromBox, toBox, stacked) {
    const trace = chart.clashTrace;
    const x0 = trace?.x0 ?? 96;
    const cw = trace?.cw ?? Math.min(16, (toBox.w - 116) / 32);
    const y0 = trace?.y0 ?? 26;
    const rowStep = trace?.rowStep ?? 30;
    const row0 = trace?.rows?.[0]?.bits || [0,0,0,1,0,0,0,0, 1,1,0,1,0,1,1,0, 0,0,1,1,0,1,0,0, 1,0,1,0,0,0,1,0];
    const row1 = trace?.rows?.[1]?.bits || [0,0,0,1,0,0,0,0, 0,1,0,1,0,1,1,0, 1,0,1,1,0,1,0,0, 0,0,1,0,0,0,1,0];
    const clashes = trace?.clashes?.length ? trace.clashes : [8];
    const bits = [];
    const pairs = [[row0, 0], [row1, 1]];
    for (const [arr, r] of pairs) {
      const targetY = toBox.y + (trace?.rows?.[r]?.y ?? (y0 + r * rowStep));
      arr.slice(0, 32).forEach((b, k) => {
        const laneOff = r === 0 ? .36 : .64;
        const riverPhase = ((k + r * .5) / 32);
        const sx = fromBox.x + 28 + riverPhase * Math.max(80, fromBox.w - 56);
        const sy = fromBox.y + fromBox.h * laneOff + ((k % 3) - 1) * 8;
        const tx = toBox.x + x0 + k * cw;
        bits.push({
          row: r,
          k,
          ch: String(b),
          sx,
          sy,
          tx,
          ty: targetY,
          dep: 60 + k * 7 + r * 40,
          dur: 860 + (k % 4) * 35,
          arc: stacked ? -14 : (r === 0 ? -34 : 18),
          isClash: clashes.includes(k),
        });
      });
    }
    return { bits, clashes, x0, cw, y0, rowStep };
  }

  function createTitleMorph(fromBox) {
    const wrap = document.createElement('div');
    wrap.className = 's16-title-morph';
    wrap.setAttribute('aria-hidden', 'true');
    const outEl = document.createElement('div');
    outEl.className = 's16-title-layer';
    outEl.textContent = sourceTitle.textContent;
    outEl.style.width = `${Math.max(180, fromBox.w)}px`;
    const inEl = document.createElement('div');
    inEl.className = 's16-title-layer';
    inEl.textContent = targetTitle.textContent;
    wrap.append(outEl, inEl);
    chapter.append(wrap);
    return { wrap, outEl, inEl };
  }

  function land() {
    scrollTo({ top: run.destination, behavior: 'instant' });
    run.top = scrollY;
    run.landed = true;
    scene.classList.remove('s16-staged');
    targetTitle.style.opacity = '0';
    for (const [i, node] of Array.from(after.children).entries()) {
      if (node === targetTitle) continue;
      run.animations.push(node.animate([
        { opacity: 0, filter: 'blur(4px)', transform: 'translateY(8px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ], { duration: 420, delay: 110 + i * 44, easing: arrivalEase, fill: 'both' }));
    }
    if (desk) {
      run.animations.push(desk.animate([
        { opacity: 0, filter: 'blur(4px)', transform: 'translateY(10px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ], { duration: 460, delay: 320, easing: arrivalEase, fill: 'both' }));
    }
  }

  function drawHandoff(elapsed) {
    const { width, height, strand, fromTitleBox, toTitleBox, morph, toBox } = run;
    previous.style.setProperty('--s16-source-opacity', 1 - ease(40, 340, elapsed));

    if (morph?.wrap?.isConnected) {
      const m = ease(80, 960, elapsed);
      const curX = mix(fromTitleBox.x, toTitleBox.x, m);
      const curY = mix(fromTitleBox.y, toTitleBox.y, m);
      const outFade = 1 - ease(100, 620, elapsed);
      const outBlur = ease(100, 620, elapsed) * 7;
      const inFade = ease(320, 960, elapsed);
      const inBlur = (1 - inFade) * 7;
      morph.outEl.style.transform = `translate(${curX.toFixed(1)}px, ${curY.toFixed(1)}px)`;
      morph.outEl.style.opacity = String(outFade);
      morph.outEl.style.filter = `blur(${outBlur.toFixed(2)}px)`;
      morph.inEl.style.width = `${Math.max(180, toTitleBox.w)}px`;
      morph.inEl.style.transform = `translate(${curX.toFixed(1)}px, ${curY.toFixed(1)}px)`;
      morph.inEl.style.opacity = String(inFade);
      morph.inEl.style.filter = `blur(${inBlur.toFixed(2)}px)`;
      if (elapsed >= 980) {
        targetTitle.style.removeProperty('opacity');
        morph.wrap.remove();
      }
    }

    ctx.clearRect(0, 0, width, height);
    const bitsAlpha = 1 - ease(1260, 1600, elapsed);
    if (bitsAlpha > 0) {
      ctx.save();
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of strand.bits) {
        const travel = ease(b.dep, b.dep + b.dur, elapsed);
        const px = mix(b.sx, b.tx, travel);
        const py = mix(b.sy, b.ty, travel) + Math.sin(Math.PI * travel) * b.arc;
        if (b.isClash && travel > .62) {
          ctx.fillStyle = '#b3261e';
        } else {
          ctx.fillStyle = b.row === 0 ? '#0d0d0c' : '#b8652a';
        }
        ctx.globalAlpha = bitsAlpha * mix(.85, 1, travel);
        ctx.fillText(b.ch, px, py);
      }

      const clashHint = ease(1020, 1280, elapsed) * bitsAlpha;
      if (clashHint > 0) {
        ctx.globalAlpha = clashHint * .14;
        ctx.fillStyle = '#b3261e';
        for (const c of strand.clashes) {
          ctx.fillRect(toBox.x + strand.x0 + c * strand.cw - strand.cw * .5, toBox.y + strand.y0 - 11, strand.cw, strand.rowStep + 22);
        }
      }
      ctx.restore();
    }

    if (run.landed) {
      chart.style.setProperty('--s16-chart-opacity', ease(1160, 1520, elapsed));
    }
  }

  function animate(now) {
    const elapsed = now - run.start;
    if (elapsed >= cut && !run.landed) land();
    if (elapsed < arrivalEnd) drawHandoff(elapsed);
    else if (copy.isConnected || run.titleMorph?.wrap?.isConnected) clearEffects();
    if (elapsed >= arrivalEnd + readHold) return finish();
    frame = requestAnimationFrame(animate);
  }

  function approach(top, height) {
    const start = bounds(previous, top).y, end = bounds(scene, top).y;
    const cue = Math.max(start, end - height);
    return { start, cue, end };
  }

  function startRun(height) {
    if (run || !canPlay()) return;
    const width = viewportWidth();
    const { cue, end } = approach(scrollY, height);
    if (scrollY > cue + 1) scrollTo({ top: cue, behavior: 'instant' });
    const top = scrollY;

    const destination = end;
    const from = bounds(sourceChart, top), to = bounds(chart, top);
    const fromBox = { x: from.x, y: from.y - top, w: Math.max(160, from.w), h: Math.max(80, from.h) };
    const toBox = { x: to.x, y: to.y - destination, w: Math.max(200, to.w), h: Math.max(120, to.h) };
    const stBounds = bounds(sourceTitle, top), ttBounds = bounds(targetTitle, top);
    const fromTitleBox = { x: stBounds.x, y: stBounds.y - top, w: stBounds.w, h: stBounds.h };
    const toTitleBox = { x: ttBounds.x, y: ttBounds.y - destination, w: ttBounds.w, h: ttBounds.h };
    const stacked = matchMedia('(max-width: 860px)').matches;
    const strand = buildStrandBits(fromBox, toBox, stacked);
    const morph = createTitleMorph(fromTitleBox);

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    run = { top, width, height, start: performance.now(), destination, strand, toBox, fromTitleBox, toTitleBox, morph, titleMorph: morph.wrap, animations: [] };
    root.classList.add('deep-twocards-hold');
    scene.classList.add('s16-staged');
    chart.style.setProperty('--s16-chart-opacity', 0);
    chapter.append(copy);
    for (const node of before.children) {
      run.animations.push(node.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 380, delay: 40, fill: 'both' }));
    }
    drawHandoff(0);
    frame = requestAnimationFrame(animate);
  }

  function finishReverse() {
    if (!rev) return;
    cancelAnimationFrame(rev.frame);
    rev.anims.forEach(a => a.cancel());
    rev.morph?.wrap?.remove();
    copy.remove();
    sourceTitle.style.removeProperty('opacity');
    previous.classList.remove('deep-rev-staged');
    previous.style.removeProperty('--s16-source-opacity');
    chart.style.removeProperty('--s16-chart-opacity');
    root.classList.remove('deep-reverse-hold');
    rev = undefined;
    scheduleMotion();
  }

  function startReverse() {
    if (run || rev || !canPlay()) return;
    sanitizeChapter();
    const s16Top = bounds(scene, scrollY).y;
    if (Math.abs(scrollY - s16Top) > 2) scrollTo({ top: s16Top, behavior: 'instant' });
    const top = scrollY, width = viewportWidth(), height = innerHeight;
    const destination = bounds(previous, top).y;
    const from = bounds(chart, top), to = bounds(sourceChart, top);
    const fromBox = { x: from.x, y: from.y - top, w: Math.max(200, from.w), h: Math.max(120, from.h) };
    const toBox = { x: to.x, y: to.y - destination, w: Math.max(160, to.w), h: Math.max(80, to.h) };
    const stBounds = bounds(targetTitle, top), ttBounds = bounds(sourceTitle, top);
    const fromTitleBox = { x: stBounds.x, y: stBounds.y - top, w: stBounds.w, h: stBounds.h };
    const toTitleBox = { x: ttBounds.x, y: ttBounds.y - destination, w: ttBounds.w, h: ttBounds.h };
    const stacked = matchMedia('(max-width: 860px)').matches;

    const trace = chart.clashTrace;
    const x0 = trace?.x0 ?? 96, cw = trace?.cw ?? Math.min(16, (fromBox.w - 116) / 32), y0 = trace?.y0 ?? 26, rowStep = trace?.rowStep ?? 30;
    const row0 = trace?.rows?.[0]?.bits || [0,0,0,1,0,0,0,0, 1,1,0,1,0,1,1,0, 0,0,1,1,0,1,0,0, 1,0,1,0,0,0,1,0];
    const row1 = trace?.rows?.[1]?.bits || [0,0,0,1,0,0,0,0, 0,1,0,1,0,1,1,0, 1,0,1,1,0,1,0,0, 0,0,1,0,0,0,1,0];
    const bits = [];
    [[row0, 0], [row1, 1]].forEach(([arr, r]) => {
      const sy = fromBox.y + (trace?.rows?.[r]?.y ?? (y0 + r * rowStep));
      arr.slice(0, 32).forEach((b, k) => {
        const laneOff = r === 0 ? .36 : .64;
        const riverPhase = ((k + r * .5) / 32);
        bits.push({
          row: r, ch: String(b),
          sx: fromBox.x + x0 + k * cw, sy,
          tx: toBox.x + 28 + riverPhase * Math.max(80, toBox.w - 56),
          ty: toBox.y + toBox.h * laneOff + ((k % 3) - 1) * 8,
          dep: 60 + k * 7 + r * 36, dur: 760 + (k % 4) * 35,
          arc: stacked ? -14 : (r === 0 ? -30 : 16),
        });
      });
    });

    const wrap = document.createElement('div');
    wrap.className = 's16-title-morph';
    wrap.setAttribute('aria-hidden', 'true');
    const outEl = document.createElement('div');
    outEl.className = 's16-title-layer';
    outEl.textContent = targetTitle.textContent;
    outEl.style.width = `${Math.max(180, fromTitleBox.w)}px`;
    const inEl = document.createElement('div');
    inEl.className = 's16-title-layer';
    inEl.textContent = sourceTitle.textContent;
    inEl.style.width = `${Math.max(180, toTitleBox.w)}px`;
    wrap.append(outEl, inEl);
    chapter.append(wrap);

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rev = { top, width, height, destination, fromTitleBox, toTitleBox, morph: { wrap, outEl, inEl }, bits, start: performance.now(), landed: false, frame: 0, anims: [] };
    root.classList.add('deep-reverse-hold');
    previous.classList.add('deep-rev-staged');
    chapter.append(copy);

    for (const [i, node] of Array.from(after.children).entries()) {
      rev.anims.push(node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }],
        { duration: 320, delay: i * 24, fill: 'both' }));
    }
    if (desk) rev.anims.push(desk.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 340, fill: 'both' }));

    function stepRev(now) {
      if (!rev) return;
      const elapsed = now - rev.start;
      if (elapsed >= 520 && !rev.landed) {
        rev.landed = true;
        scrollTo({ top: rev.destination, behavior: 'instant' });
        rev.top = scrollY;
        previous.classList.remove('deep-rev-staged');
        sourceTitle.style.opacity = '0';
        for (const [i, node] of Array.from(before.children).entries()) {
          if (node === sourceTitle) continue;
          rev.anims.push(node.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
            { duration: 380, delay: 80 + i * 36, easing: arrivalEase, fill: 'both' }));
        }
      }
      if (Math.abs(scrollY - rev.top) > 1 && Math.abs(scrollY - rev.top) < innerHeight * .95) {
        scrollTo({ top: rev.top, behavior: 'instant' });
      }
      if (!rev.landed) chart.style.setProperty('--s16-chart-opacity', 1 - ease(60, 320, elapsed));
      else previous.style.setProperty('--s16-source-opacity', ease(640, 1080, elapsed));

      const m = ease(60, 920, elapsed);
      const tx = mix(rev.fromTitleBox.x, rev.toTitleBox.x, m), ty = mix(rev.fromTitleBox.y, rev.toTitleBox.y, m);
      rev.morph.outEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      rev.morph.outEl.style.opacity = String(1 - ease(80, 540, elapsed));
      rev.morph.outEl.style.filter = `blur(${(ease(80, 540, elapsed) * 6).toFixed(2)}px)`;
      const inO = ease(320, 900, elapsed);
      rev.morph.inEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      rev.morph.inEl.style.opacity = String(inO);
      rev.morph.inEl.style.filter = `blur(${((1 - inO) * 6).toFixed(2)}px)`;
      if (elapsed >= 920 && rev.morph.wrap.isConnected) {
        sourceTitle.style.removeProperty('opacity');
        rev.morph.wrap.remove();
      }

      ctx.clearRect(0, 0, rev.width, rev.height);
      const ba = 1 - ease(980, 1260, elapsed);
      if (ba > 0) {
        ctx.save();
        ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const b of rev.bits) {
          const t = ease(b.dep, b.dep + b.dur, elapsed);
          ctx.fillStyle = b.row === 0 ? '#0d0d0c' : '#b8652a';
          ctx.globalAlpha = ba * mix(1, .82, t);
          ctx.fillText(b.ch, mix(b.sx, b.tx, t), mix(b.sy, b.ty, t) + Math.sin(Math.PI * t) * b.arc);
        }
        ctx.restore();
      }
      if (elapsed >= 1260 + 360) return finishReverse();
      rev.frame = requestAnimationFrame(stepRev);
    }
    rev.frame = requestAnimationFrame(stepRev);
  }

  watchScrollMotion((top, height) => {
    if (run) {
      if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
      else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
    }
  });

  for (const area of [previous.querySelector('.plate-controls'), previous.querySelector('.plate-river'), scene.querySelector('.plate-controls'), scene.querySelector('.s16-instrument')]) {
    if (!area) continue;
    for (const event of ['focusin', 'pointerdown', 'input']) area.addEventListener(event, () => { finishReverse(); finish(); });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, () => { finishReverse(); finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finishReverse(); finish(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { finishReverse(); finish(); } });

  return {
    forward() {
      if (!canPlay() || run || rev) return;
      sanitizeChapter();
      startRun(innerHeight);
    },
    reverse: startReverse,
    cancel: () => { finishReverse(); finish(); },
    active: () => !!run || !!rev,
  };
}

function watchCarKey(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const sourceChart = previous.querySelector('#s16-chart'), fieldZone = previous.querySelector('#s16-field-zone');
  const walletZone = previous.querySelector('#s16-wallet-zone'), walletBtn = previous.querySelector('#s16-wallet');
  const targetChart = scene.querySelector('#s17-chart');
  if (!before || !after || !targetChart) return;

  const copy = document.createElement('canvas');
  copy.className = 's17-handoff-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  const cut = 620, burstStart = 860, arrivalEnd = 1660, readHold = 1000;
  let run, rev, frame;
  const canPlay = () => ctx && !reducedMotion.matches && !document.hidden;

  function clearEffects() {
    if (!copy.isConnected && !run?.portal?.isConnected && !scene.classList.contains('s17-staged')) return;
    copy.remove();
    run?.portal?.remove();
    walletBtn?.style.removeProperty('visibility');
    scene.classList.remove('s17-staged');
    run?.animations.forEach(animation => animation.cancel());
  }

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    clearEffects();
    run = undefined;
    root.classList.remove('deep-carkey-hold');
    scheduleMotion();
  }

  function createPortalWallet(wRect) {
    const portal = document.createElement('div');
    portal.className = 's16-wallet s17-portal-wallet';
    portal.setAttribute('aria-hidden', 'true');
    if (walletBtn) {
      portal.innerHTML = walletBtn.innerHTML;
      for (const node of portal.querySelectorAll('[id]')) node.removeAttribute('id');
      if (walletBtn.matches(':hover, :focus-visible, [data-open="true"], [data-catching="true"]')) portal.dataset.open = 'true';
    }
    portal.style.left = `${wRect.left.toFixed(1)}px`;
    portal.style.top = `${wRect.top.toFixed(1)}px`;
    portal.style.width = `${wRect.width.toFixed(1)}px`;
    portal.style.height = `${wRect.height.toFixed(1)}px`;
    chapter.append(portal);
    return portal;
  }

  function land() {
    scrollTo({ top: run.destination, behavior: 'instant' });
    run.top = scrollY;
    run.landed = true;
  }

  function releaseScene17() {
    run.released = true;
    run.portal.dataset.open = 'true';
    scene.classList.remove('s17-staged');
    const { cx, cy } = run;
    const targets = [...Array.from(after.children), targetChart].filter(Boolean);
    targets.forEach((node, i) => {
      const r = node.getBoundingClientRect();
      const fx = cx - (r.left + r.width * .5);
      const fy = cy - (r.top + r.height * .5);
      run.animations.push(node.animate([
        { transform: `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px) scale(.12) rotate(${fx >= 0 ? -7 : 7}deg)`, opacity: 0, filter: 'blur(4px)' },
        { transform: `translate(${(fx * .16).toFixed(1)}px, ${(fy * .16 - 10).toFixed(1)}px) scale(1.02) rotate(0deg)`, opacity: .96, filter: 'blur(0.5px)', offset: .64 },
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
      ], { duration: 540, delay: i * 42, easing: arrivalEase, fill: 'both' }));
    });
  }

  function drawHandoff(elapsed) {
    const { width, height, portal, wx, wy, cx, cy, wisps } = run;
    if (elapsed >= burstStart && !run.released) releaseScene17();

    if (portal?.isConnected) {
      const glide = ease(420, 790, elapsed);
      const tx = mix(0, cx - wx, glide);
      const ty = mix(0, cy - wy, glide);
      const load = ease(540, 690, elapsed) * (1 - ease(700, burstStart, elapsed));
      const vanish = ease(1120, 1540, elapsed);
      const sc = (mix(1, 1.07, glide) - .035 * load + .08 * ease(burstStart, 1090, elapsed)) * (1 - vanish);
      const rot = -3.5 * load - 12 * vanish;
      if (elapsed >= 80 && elapsed < burstStart) {
        if (elapsed < 510 && portal.dataset.open !== 'true') portal.dataset.open = 'true';
        else if (elapsed >= 510) delete portal.dataset.open;
      }
      portal.style.opacity = String(1 - vanish);
      if (vanish === 1) portal.remove();
      portal.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    }

    ctx.clearRect(0, 0, width, height);
    if (elapsed < 560) {
      ctx.save();
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const w of wisps) {
        const t = ease(w.dep, w.dep + 380, elapsed);
        const px = mix(w.x, wx, t);
        const py = mix(w.y, run.mouthY, t) + Math.sin(Math.PI * t) * w.arc;
        ctx.globalAlpha = ease(w.dep, w.dep + 100, elapsed) * (1 - ease(.80, 1, t)) * .82;
        ctx.fillStyle = w.copper ? '#b8652a' : '#0d0d0c';
        ctx.fillText(w.ch, px, py);
      }
      ctx.restore();
    }
  }

  function animate(now) {
    const elapsed = now - run.start;
    if (elapsed >= cut && !run.landed) land();
    if (elapsed < arrivalEnd) drawHandoff(elapsed);
    else if (copy.isConnected || run.portal?.isConnected) clearEffects();
    if (elapsed >= arrivalEnd + readHold) return finish();
    frame = requestAnimationFrame(animate);
  }

  function approach(top, height) {
    const start = bounds(previous, top).y, end = bounds(scene, top).y;
    const cue = Math.max(start, end - height);
    return { start, cue, end };
  }

  function startRun(height) {
    if (run || !canPlay()) return;
    const width = viewportWidth();
    const { cue, end } = approach(scrollY, height);
    if (scrollY > cue + 1) scrollTo({ top: cue, behavior: 'instant' });
    const top = scrollY;

    const rawRect = walletBtn?.getBoundingClientRect();
    const wRect = rawRect && rawRect.width > 40 ? rawRect : { left: width * .74 - 70, top: height * .58 - 78, width: 140, height: 156 };
    const wx = wRect.left + wRect.width * .5;
    const wy = wRect.top + wRect.height * .5;
    const mouthY = walletBtn?.querySelector('.s16-slot-lip')?.getBoundingClientRect().top ?? wRect.top + 32;
    const cx = width * .5;
    const cy = height * .48;
    const portal = createPortalWallet(wRect);

    const wisps = Array.from({ length: 20 }, (_, i) => ({
      x: mix(width * .12, width * .82, ((i * 37) % 19) / 18),
      y: mix(height * .16, height * .82, ((i * 53) % 17) / 16),
      ch: i % 2 === 0 ? '0' : '1',
      copper: i % 3 === 0,
      dep: (i % 5) * 28,
      arc: i % 2 === 0 ? -24 : 18,
    }));

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    run = { top, width, height, start: performance.now(), destination: end, portal, wx, wy, mouthY, cx, cy, wisps, animations: [] };
    root.classList.add('deep-carkey-hold');
    scene.classList.add('s17-staged');
    if (walletBtn) walletBtn.style.visibility = 'hidden';
    chapter.append(copy);

    const swallowTargets = [...Array.from(before.children), sourceChart, fieldZone, walletZone?.querySelector('.s16-zone-head')].filter(Boolean);
    swallowTargets.forEach((node, i) => {
      const r = node.getBoundingClientRect();
      const dx = wx - (r.left + r.width * .5);
      const dy = mouthY - (r.top + r.height * .5);
      run.animations.push(node.animate([
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate(${(dx * .46).toFixed(1)}px, ${(dy * .46).toFixed(1)}px) scale(.56) rotate(${dx >= 0 ? 5 : -5}deg)`, opacity: .88, filter: 'blur(1.5px)', offset: .54 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.05) rotate(${dx >= 0 ? 12 : -12}deg)`, opacity: 0, filter: 'blur(4px)' },
      ], { duration: 460, delay: i * 22, easing: 'cubic-bezier(.55, 0, .85, .35)', fill: 'both' }));
    });
    if (walletZone) {
      run.animations.push(walletZone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, delay: 180, fill: 'both' }));
    }

    drawHandoff(0);
    frame = requestAnimationFrame(animate);
  }

  function finishReverse() {
    if (!rev) return;
    cancelAnimationFrame(rev.frame);
    rev.anims.forEach(a => a.cancel());
    rev.portal?.remove();
    copy.remove();
    walletBtn?.style.removeProperty('visibility');
    previous.classList.remove('deep-rev-staged');
    root.classList.remove('deep-reverse-hold');
    rev = undefined;
    scheduleMotion();
  }

  function startReverse() {
    if (run || rev || !canPlay()) return;
    sanitizeChapter();
    const s17Top = bounds(scene, scrollY).y;
    if (Math.abs(scrollY - s17Top) > 2) scrollTo({ top: s17Top, behavior: 'instant' });
    const top = scrollY, width = viewportWidth(), height = innerHeight;
    const destination = bounds(previous, top).y;
    const wb = walletBtn ? bounds(walletBtn, top) : { x: width * .74 - 70, y: destination + height * .58 - 78, w: 140, h: 156 };
    const wTarget = { left: wb.x, top: wb.y - destination, width: Math.max(80, wb.w), height: Math.max(80, wb.h) };
    const wx = wTarget.left + wTarget.width * .5, wy = wTarget.top + wTarget.height * .5;
    const cx = width * .5, cy = height * .48;

    const portal = createPortalWallet({ ...wTarget, left: cx - wTarget.width * .5, top: cy - wTarget.height * .5 });
    portal.dataset.open = 'true';
    portal.style.transform = 'scale(.05)';
    portal.style.opacity = '0';

    const wisps = Array.from({ length: 18 }, (_, i) => ({
      x: mix(width * .12, width * .82, ((i * 37) % 19) / 18),
      y: mix(height * .16, height * .82, ((i * 53) % 17) / 16),
      ch: i % 2 === 0 ? '0' : '1', copper: i % 3 === 0, dep: (i % 4) * 28, arc: i % 2 === 0 ? -20 : 16,
    }));

    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(width * dpr);
    copy.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rev = { top, width, height, destination, portal, wx, wy, cx, cy, wisps, start: performance.now(), landed: false, frame: 0, anims: [] };
    root.classList.add('deep-reverse-hold');
    previous.classList.add('deep-rev-staged');
    chapter.append(copy);

    for (const [i, node] of [...Array.from(after.children), targetChart].filter(Boolean).entries()) {
      const r = node.getBoundingClientRect();
      const dx = cx - (r.left + r.width * .5), dy = cy - (r.top + r.height * .5);
      rev.anims.push(node.animate([
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.08) rotate(${dx >= 0 ? 9 : -9}deg)`, opacity: 0, filter: 'blur(4px)' },
      ], { duration: 420, delay: i * 20, easing: 'cubic-bezier(.55, 0, .85, .35)', fill: 'both' }));
    }

    function stepRev(now) {
      if (!rev) return;
      const elapsed = now - rev.start;
      if (elapsed >= 660 && !rev.landed) {
        rev.landed = true;
        scrollTo({ top: rev.destination, behavior: 'instant' });
        rev.top = scrollY;
        previous.classList.remove('deep-rev-staged');
        if (walletBtn) walletBtn.style.visibility = 'hidden';
        const releaseTargets = [...Array.from(before.children), sourceChart, fieldZone, walletZone?.querySelector('.s16-zone-head')].filter(Boolean);
        releaseTargets.forEach((node, i) => {
          const r = node.getBoundingClientRect();
          const fx = rev.wx - (r.left + r.width * .5), fy = rev.wy - (r.top + r.height * .5);
          rev.anims.push(node.animate([
            { transform: `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px) scale(.12) rotate(${fx >= 0 ? -7 : 7}deg)`, opacity: 0, filter: 'blur(4px)' },
            { transform: 'none', opacity: 1, filter: 'blur(0px)' },
          ], { duration: 480, delay: i * 28, easing: arrivalEase, fill: 'both' }));
        });
      }
      if (Math.abs(scrollY - rev.top) > 1 && Math.abs(scrollY - rev.top) < innerHeight * .95) {
        scrollTo({ top: rev.top, behavior: 'instant' });
      }
      if (rev.portal?.isConnected) {
        const pop = ease(0, 180, elapsed), glide = ease(480, 820, elapsed);
        const tx = mix(0, rev.wx - rev.cx, glide), ty = mix(0, rev.wy - rev.cy, glide);
        const load = ease(380, 510, elapsed) * (1 - ease(520, 660, elapsed));
        const rot = -3.5 * load;
        const sc = mix(.05, 1.1, pop) - .1 * glide - .035 * load;
        if (elapsed >= 380 && elapsed < 660) {
          delete rev.portal.dataset.open;
        } else if (elapsed >= 660) {
          if (elapsed < 875) rev.portal.dataset.open = 'true';
          else delete rev.portal.dataset.open;
          if (elapsed >= 1120) walletBtn?.style.removeProperty('visibility');
        }
        rev.portal.style.opacity = elapsed < 180 ? String(pop) : elapsed >= 1120 ? String(1 - ease(1120, 1340, elapsed)) : '1';
        rev.portal.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      }
      ctx.clearRect(0, 0, rev.width, rev.height);
      if (elapsed < 500) {
        const wa = 1 - ease(320, 500, elapsed);
        ctx.save();
        ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const w of rev.wisps) {
          const t = ease(w.dep, w.dep + 340, elapsed);
          ctx.globalAlpha = wa * .75;
          ctx.fillStyle = w.copper ? '#b8652a' : '#0d0d0c';
          ctx.fillText(w.ch, mix(w.x, rev.cx, t), mix(w.y, rev.cy, t) + Math.sin(Math.PI * t) * w.arc);
        }
        ctx.restore();
      }
      if (elapsed >= 1340 + 360) return finishReverse();
      rev.frame = requestAnimationFrame(stepRev);
    }
    rev.frame = requestAnimationFrame(stepRev);
  }

  watchScrollMotion((top, height) => {
    if (run) {
      if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
      else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
    }
  });

  for (const area of [previous.querySelector('.plate-controls'), previous.querySelector('.s16-instrument'), scene.querySelector('.plate-controls')]) {
    if (!area) continue;
    for (const event of ['focusin', 'pointerdown', 'input']) area.addEventListener(event, () => { finishReverse(); finish(); });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, () => { finishReverse(); finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finishReverse(); finish(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { finishReverse(); finish(); } });

  return {
    forward() {
      if (!canPlay() || run || rev) return;
      sanitizeChapter();
      startRun(innerHeight);
    },
    reverse: startReverse,
    cancel: () => { finishReverse(); finish(); },
    active: () => !!run || !!rev,
  };
}

function watchFinale(previous, end) {
  const root = document.documentElement, chapter = end.closest('.deep');
  const whyWord = previous.querySelector('#s17-why-word'), endBlink = end.querySelector('#deep-end-blink');
  if (!whyWord || !endBlink) return;

  const cover = document.createElement('span');
  cover.className = 'deep-blink-cover';
  cover.setAttribute('aria-hidden', 'true');
  const normal = { color: 'var(--ink)', backgroundColor: 'transparent' };
  const inverted = { color: 'var(--paper)', backgroundColor: 'var(--ink)' };
  const blinkEnd = 860, closeEnd = 995, openEnd = 1280, readHold = 1000;
  let run, rev, frame, finaleBlinkedOnce = false;
  const canPlay = () => !reducedMotion.matches && !document.hidden;

  function playFinaleBlinkOnce() {
    if (finaleBlinkedOnce || reducedMotion.matches || document.hidden) return;
    finaleBlinkedOnce = true;
    endBlink.dataset.blinked = 'once';
    endBlink.animate([
      normal,
      { color: 'var(--paper)', backgroundColor: 'rgba(13, 13, 12, .84)', offset: .26 },
      { ...normal, offset: .64 },
      normal,
    ], { duration: 560, delay: 160, easing: 'ease-out' });
  }

  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && !run && !rev) playFinaleBlinkOnce();
      }
    }, { threshold: .15 });
    observer.observe(end);
  } else {
    playFinaleBlinkOnce();
  }

  function clearEffects() {
    cover.remove();
    end.classList.remove('deep-end-staged');
    run?.animations.forEach(animation => animation.cancel());
  }

  function finish() {
    if (!run) return;
    cancelAnimationFrame(frame);
    clearEffects();
    run = undefined;
    root.classList.remove('deep-finale-hold');
    scheduleMotion();
  }

  function land() {
    scrollTo({ top: run.destination, behavior: 'instant' });
    run.top = scrollY;
    run.landed = true;
    end.classList.remove('deep-end-staged');
    for (const [i, node] of Array.from(end.children).entries()) {
      run.animations.push(node.animate([
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 400, delay: 110 + i * 65, easing: arrivalEase, fill: 'both' }));
    }
    playFinaleBlinkOnce();
  }

  function animate(now) {
    const elapsed = now - run.start;
    if (elapsed >= blinkEnd && !run.coverClosing) {
      run.coverClosing = true;
      chapter.append(cover);
      run.closeAnim = cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: closeEnd - blinkEnd, easing: 'ease-in', fill: 'forwards' });
      run.animations.push(run.closeAnim);
    }
    if (elapsed >= closeEnd && !run.landed) {
      land();
      run.closeAnim?.cancel();
      run.animations.push(cover.animate([
        { opacity: 1 }, { opacity: 1, offset: .16, easing: 'ease-out' }, { opacity: 0 },
      ], { duration: openEnd - closeEnd, fill: 'both' }));
    }
    if (elapsed >= openEnd && cover.isConnected) cover.remove();
    if (elapsed >= openEnd + readHold) return finish();
    frame = requestAnimationFrame(animate);
  }

  function approach(top, height) {
    const start = bounds(previous, top).y;
    const endTop = bounds(end, top).y;
    const cue = Math.max(start, endTop - height);
    return { start, cue, end: endTop };
  }

  function startRun(height) {
    if (run || !canPlay()) return;
    const { cue, end: endTop } = approach(scrollY, height);
    if (scrollY > cue + 1) scrollTo({ top: cue, behavior: 'instant' });
    const top = scrollY;
    const maxScroll = Math.max(0, root.scrollHeight - height);
    const destination = Math.min(endTop, maxScroll);

    run = { top, start: performance.now(), destination, animations: [] };
    root.classList.add('deep-finale-hold');
    end.classList.add('deep-end-staged');
    run.animations.push(whyWord.animate([
      normal, { ...normal, offset: .10 }, { ...inverted, offset: .14 },
      { ...inverted, offset: .27 }, { ...normal, offset: .32 },
      { ...normal, offset: .48 }, { ...inverted, offset: .53 },
      { ...inverted, offset: .66 }, { ...normal, offset: .72 }, normal,
    ], { duration: blinkEnd }));
    frame = requestAnimationFrame(animate);
  }

  function finishReverse() {
    if (!rev) return;
    cancelAnimationFrame(rev.frame);
    rev.anims.forEach(a => a.cancel());
    cover.remove();
    root.classList.remove('deep-reverse-hold');
    rev = undefined;
    scheduleMotion();
  }

  function startReverse() {
    if (run || rev || !canPlay()) return;
    sanitizeChapter();
    const s17Top = bounds(previous, scrollY).y;
    rev = { top: scrollY, dest: s17Top, start: performance.now(), landed: false, coverClosing: false, frame: 0, anims: [], closeAnim: null };
    root.classList.add('deep-reverse-hold');

    function stepRev(now) {
      if (!rev) return;
      const elapsed = now - rev.start;
      if (elapsed >= 180 && !rev.coverClosing) {
        rev.coverClosing = true;
        chapter.append(cover);
        rev.closeAnim = cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, easing: 'ease-in', fill: 'forwards' });
        rev.anims.push(rev.closeAnim);
      }
      if (elapsed >= 310 && !rev.landed) {
        rev.landed = true;
        scrollTo({ top: rev.dest, behavior: 'instant' });
        rev.top = scrollY;
        rev.closeAnim?.cancel();
        rev.anims.push(cover.animate([
          { opacity: 1 }, { opacity: 1, offset: .14, easing: 'ease-out' }, { opacity: 0 },
        ], { duration: 250, fill: 'both' }));
        rev.anims.push(whyWord.animate([
          normal, { ...inverted, offset: .24 }, { ...normal, offset: .52 }, normal,
        ], { duration: 420, delay: 140 }));
      }
      if (Math.abs(scrollY - rev.top) > 1 && Math.abs(scrollY - rev.top) < innerHeight * .95) {
        scrollTo({ top: rev.top, behavior: 'instant' });
      }
      if (elapsed >= 600 && cover.isConnected) cover.remove();
      if (elapsed >= 920) return finishReverse();
      rev.frame = requestAnimationFrame(stepRev);
    }
    rev.frame = requestAnimationFrame(stepRev);
  }

  watchScrollMotion((top, height) => {
    if (run) {
      if (!canPlay() || Math.abs(top - run.top) > height * .95) finish();
      else if (Math.abs(top - run.top) > 1) scrollTo({ top: run.top, behavior: 'instant' });
    }
  });

  for (const area of [previous.querySelector('.plate-controls'), end]) {
    if (!area) continue;
    for (const event of ['focusin', 'pointerdown', 'input']) area.addEventListener(event, () => { finishReverse(); finish(); });
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, () => { finishReverse(); finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finishReverse(); finish(); } });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { finishReverse(); finish(); } });

  return {
    forward() {
      if (!canPlay() || run || rev) return;
      sanitizeChapter();
      startRun(innerHeight);
    },
    reverse: startReverse,
    cancel: () => { finishReverse(); finish(); },
    active: () => !!run || !!rev,
  };
}

function createChapterDeck(stops, transitions) {
  if (stops.length < 2 || stops.some(stop => !stop)) return;
  const WHEEL_THRESHOLD = 75, TOUCH_THRESHOLD = 48;
  const ENTRY_HOLD = 850, NATIVE_SCROLL_GAP = 350;
  const opener = stops[0], root = document.documentElement;
  let accum = 0, accumDir = 0, accumStop = -1;
  let active, cooldownUntil = 0, touchStart;
  let lastTop = scrollY, nativeEntryUntil = 0, entryHash;
  let entryY, entryTimer;

  const canPage = () => !reducedMotion.matches && !document.hidden;
  const canLockEntry = () => canPage() && !window.__presenting;

  function canChildScroll(target, dir) {
    let el = target instanceof Element ? target : target?.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
        if ((dir < 0 && el.scrollTop > 1) || (dir > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function ownsVerticalTouch(target) {
    return !!target?.closest?.('.s9-metal, .s16-pad-card, .s16-wallet, input[type="range"][aria-orientation="vertical"]');
  }

  function currentStopIndex() {
    const h = innerHeight;
    if (stops[0].getBoundingClientRect().top > 1) return -1;
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
      const r = stops[i].getBoundingClientRect();
      if (r.top <= h * .45 && r.bottom >= h * .25) return i;
      const d = Math.abs(r.top);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function running() {
    if (active && !active.transition.active()) {
      active = undefined;
      cooldownUntil = performance.now() + 180;
    }
    // The Part Two link can start its own handoff.
    if (active) return active;
    const index = transitions.findIndex(candidate => candidate?.active());
    if (index >= 0) active = { transition: transitions[index], index, dir: 1, reversal: 0 };
    return active;
  }

  function cancelActive() {
    releaseChapterEntry();
    accum = 0;
    accumDir = 0;
    const current = running();
    if (!current) return;
    current.transition.cancel();
    active = undefined;
    cooldownUntil = performance.now() + 180;
  }

  function changeDirection(current, dir) {
    current.reversal = 0;
    if (current.transition.turn?.(dir)) {
      current.dir = dir;
      return;
    }
    cancelActive();
    // If the scene already landed, replay its handoff in the new direction.
    queueMicrotask(() => {
      if (currentStopIndex() === current.index + (dir < 0 ? 1 : 0)) trigger(dir, true);
    });
  }

  function trigger(dir, deliberate = false) {
    if (!canPage() || running()) return false;
    const now = performance.now();
    if (!deliberate && now < cooldownUntil) return true;
    const idx = currentStopIndex();
    if (idx < 0) return false;
    const index = dir > 0 ? idx : idx - 1;
    const transition = transitions[index];
    if (!transition) return false;
    const top = scrollY;
    if (dir > 0) transition.forward();
    else transition.reverse();
    if (transition.active()) {
      active = { transition, index, dir, reversal: 0 };
    } else {
      if (scrollY === top) stops[idx + dir].scrollIntoView({ block: 'start', behavior: 'instant' });
      cooldownUntil = now + 180;
    }
    return true;
  }

  function distanceToEdge(dir, idx = currentStopIndex()) {
    if (idx < 0) return Infinity;
    if (!transitions[dir > 0 ? idx : idx - 1]) return Infinity;
    const { top, bottom } = stops[idx].getBoundingClientRect();
    return Math.max(0, dir > 0 ? bottom - innerHeight - 96 : -top - 96);
  }

  function releaseChapterEntry() {
    nativeEntryUntil = 0;
    if (entryY === undefined) return;
    clearTimeout(entryTimer);
    entryY = undefined;
    root.classList.remove('deep-entry-hold');
  }

  function lockChapterEntry() {
    nativeEntryUntil = 0;
    accum = 0;
    if (touchStart) touchStart.landed = true;
    root.classList.add('deep-entry-hold');
    opener.scrollIntoView({ block: 'start', behavior: 'instant' });
    entryY = scrollY;
    entryTimer = setTimeout(releaseChapterEntry, ENTRY_HOLD);
  }

  function noteEntryGesture(dir) {
    if (dir < 0) {
      releaseChapterEntry();
    } else if (canLockEntry()) {
      const top = scrollY, entryTop = bounds(opener, top).y;
      if (Math.min(top, lastTop) < entryTop - 1) {
        nativeEntryUntil = performance.now() + NATIVE_SCROLL_GAP;
        entryHash = location.hash;
      }
    }
  }

  function enterChapter(dir, distance) {
    if (dir < 0 || !canLockEntry()) return false;
    const top = opener.getBoundingClientRect().top;
    if (top <= 1 || distance < top) return false;
    lockChapterEntry();
    return true;
  }

  addEventListener('wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || !canPage()) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const dy = event.deltaY * unit;
    const dir = Math.sign(dy);
    if (!dir) return;
    noteEntryGesture(dir);
    if (entryY !== undefined) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    const current = running();
    if (current) {
      if (event.cancelable) event.preventDefault();
      current.reversal = dir === current.dir ? 0 : current.reversal + Math.abs(dy);
      if (current.reversal >= 24) changeDirection(current, dir);
      return;
    }
    if (canChildScroll(event.target, dir)) return;
    if (event.cancelable && enterChapter(dir, Math.abs(dy))) {
      event.preventDefault();
      return;
    }
    const stop = currentStopIndex();
    const distance = distanceToEdge(dir, stop);
    if (!event.cancelable || Math.abs(dy) <= distance) return;
    event.preventDefault();
    if (distance) scrollTo({ top: scrollY + dir * Math.ceil(distance), behavior: 'instant' });

    if (performance.now() < cooldownUntil) return;
    if (dir !== accumDir || stop !== accumStop) {
      accum = 0;
      accumDir = dir;
      accumStop = stop;
    }
    accum += dy - dir * distance;
    if (Math.abs(accum) >= WHEEL_THRESHOLD) {
      accum = 0;
      accumDir = 0;
      trigger(dir);
    }
  }, { passive: false });

  addEventListener('keydown', event => {
    if (!canPage() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (['Home', 'End', 'Escape'].includes(key)) { cancelActive(); return; }
    const pagingKey = key === 'PageUp' || key === 'PageDown';
    if (event.target.closest?.('input, textarea, select, [role="slider"], [contenteditable]')) return;
    if (!pagingKey && event.target.closest?.('a, button')) return;
    const dir = (['ArrowUp', 'PageUp'].includes(key) || (key === ' ' && event.shiftKey)) ? -1
      : ['ArrowDown', 'PageDown', ' '].includes(key) ? 1 : 0;
    if (!dir || canChildScroll(event.target, dir)) return;
    noteEntryGesture(dir);
    if (entryY !== undefined) {
      event.preventDefault();
      return;
    }
    const current = running();
    if (current) {
      event.preventDefault();
      if (dir !== current.dir) changeDirection(current, dir);
      return;
    }
    const step = key === 'ArrowUp' || key === 'ArrowDown' ? 40 : innerHeight * .875;
    if (enterChapter(dir, step)) {
      event.preventDefault();
      return;
    }
    const distance = distanceToEdge(dir);
    if (distance < step) {
      event.preventDefault();
      if (distance) scrollTo({ top: scrollY + dir * Math.ceil(distance), behavior: 'instant' });
      if (!distance || step - distance >= WHEEL_THRESHOLD) trigger(dir, !event.repeat);
    }
  });

  addEventListener('touchstart', ({ touches, target }) => {
    const finger = touches[0];
    touchStart = touches.length === 1 && !ownsVerticalTouch(target) ? { y: finger.clientY, x: finger.clientX, target } : null;
  }, { passive: true });

  for (const event of ['touchend', 'touchcancel']) addEventListener(event, () => { touchStart = null; }, { passive: true });

  addEventListener('touchmove', event => {
    if (event.defaultPrevented || !touchStart || event.touches.length !== 1 || !canPage()) return;
    const { clientX: x, clientY: y } = event.touches[0];
    const delta = touchStart.y - y;
    if (Math.abs(delta) <= Math.abs(x - touchStart.x)) return;
    const dir = Math.sign(delta);
    touchStart.x = x;
    touchStart.y = y;
    noteEntryGesture(dir);
    if (entryY !== undefined) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    const current = running();
    if (current) {
      if (event.cancelable) event.preventDefault();
      current.reversal = dir === current.dir ? 0 : current.reversal + Math.abs(delta);
      if (current.reversal >= 24) changeDirection(current, dir);
      return;
    }
    if (touchStart.landed) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (canChildScroll(touchStart.target, dir) || !event.cancelable) return;
    if (enterChapter(dir, Math.abs(delta))) {
      event.preventDefault();
      return;
    }
    const distance = distanceToEdge(dir);
    if (!Number.isFinite(distance)) return;
    event.preventDefault();
    // Keep the first vertical move cancellable so a tall scene cannot fling past its handoff.
    const advance = Math.min(Math.abs(delta), distance);
    if (advance) scrollTo({ top: scrollY + dir * Math.ceil(advance), behavior: 'instant' });
    if (touchStart.dir !== dir) touchStart.travel = 0;
    touchStart.dir = dir;
    touchStart.travel += Math.abs(delta) - advance;
    if (touchStart.travel >= TOUCH_THRESHOLD) {
      touchStart.travel = 0;
      touchStart.landed = trigger(dir);
    }
  }, { passive: false });

  watchScrollMotion(top => {
    const previous = lastTop;
    lastTop = top;
    if (entryY !== undefined) {
      if (!canLockEntry()) releaseChapterEntry();
      else if (Math.abs(top - entryY) > 1) scrollTo({ top: entryY, behavior: 'instant' });
      return;
    }
    if (running() || !canLockEntry() || location.hash !== entryHash || performance.now() > nativeEntryUntil || top <= previous) return;
    // A native fling can cross the boundary after its last cancellable input event.
    const entryTop = bounds(opener, top).y;
    if (previous < entryTop - 1 && top >= entryTop - 1) lockChapterEntry();
    else if (top < entryTop - 1) nativeEntryUntil = performance.now() + NATIVE_SCROLL_GAP;
  });
  for (const ev of ['resize', 'hashchange', 'pagehide']) addEventListener(ev, cancelActive);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelActive(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) cancelActive(); });
}

const chapterStops = [
  document.querySelector('.deep-head'),
  document.getElementById('part-one'),
  document.getElementById('s6'),
  document.getElementById('s7'),
  document.getElementById('s8'),
  document.getElementById('s9'),
  document.getElementById('s10'),
  document.getElementById('part-two'),
  document.getElementById('s11'),
  document.getElementById('s12'),
  document.getElementById('s13'),
  document.getElementById('s14'),
  document.getElementById('s15'),
  document.getElementById('s16'),
  document.getElementById('s17'),
  document.getElementById('deep-end'),
];

const blink = document.getElementById('deep-blink-word');
const partOne = document.getElementById('part-one');
const power = document.getElementById('part-one-power');
const closer = document.getElementById('s6');
const flipping = document.getElementById('s7');
const tuning = document.getElementById('s8');
const metal = document.getElementById('s9');
const pauses = document.getElementById('s10');
const pausesLink = document.getElementById('s10-pauses');
const partTwo = document.getElementById('part-two');
const soaking = document.getElementById('s11');
const whispering = document.getElementById('s12');
const counting = document.getElementById('s13');
const mistakes = document.getElementById('s14');
const conversationScene = document.getElementById('s15');
const twoCards = document.getElementById('s16');
const carKey = document.getElementById('s17');
const finale = document.getElementById('deep-end');

const t0 = blink?.animate && partOne ? watchPartOne(blink, partOne) : null;
const t1 = closer && power && typeof closer.animate === 'function' ? watchCloser(power, closer) : null;
const t2 = closer && flipping && typeof closer.animate === 'function' ? watchFlipping(closer, flipping) : null;
const t3 = flipping && tuning && typeof tuning.animate === 'function' ? watchTuning(flipping, tuning) : null;
const t4 = tuning && metal ? watchMetal(tuning, metal) : null;
const t5 = metal && pauses ? watchPauses(metal, pauses) : null;
const t6 = pausesLink && partTwo ? watchPartTwo(pausesLink, partTwo) : null;
const t7 = partTwo && soaking ? watchSoaking(partTwo, soaking) : null;
const t8 = soaking && whispering ? watchWhispering(soaking, whispering) : null;
const t9 = whispering && counting ? watchCounting(whispering, counting) : null;
const t10 = counting && mistakes ? watchMistakes(counting, mistakes) : null;
const t11 = mistakes && conversationScene ? watchConversation(mistakes, conversationScene) : null;
const t12 = conversationScene && twoCards ? watchTwoCards(conversationScene, twoCards) : null;
const t13 = twoCards && carKey ? watchCarKey(twoCards, carKey) : null;
const t14 = carKey && finale ? watchFinale(carKey, finale) : null;

createChapterDeck(chapterStops, [t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14]);
