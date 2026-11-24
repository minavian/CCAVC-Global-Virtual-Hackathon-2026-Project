const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Listen only near a scene that handles paging, so ordinary scroll stays native elsewhere.
function capturePageGesture(canBegin, begin, interrupt) {
  const listeners = new AbortController();
  const { signal } = listeners;
  let touch;

  function page(event, direction) {
    if (canBegin(event, direction)) begin(event, direction);
    else if (direction < 0) interrupt(direction, event);
  }

  addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    page(event, Math.sign(event.deltaY));
  }, { passive: false, signal });

  addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (['Home', 'End', 'Escape'].includes(key)) return interrupt();
    if (event.target.closest?.('a, button, input, textarea, select, [role="slider"], [contenteditable]')) return;
    if (['ArrowUp', 'PageUp'].includes(key) || (key === ' ' && event.shiftKey)) page(event, -1);
    else if (['ArrowDown', 'PageDown', ' '].includes(key)) page(event, 1);
  }, { signal });

  addEventListener('touchstart', ({ touches, target }) => {
    const finger = touches[0];
    const onSlider = target.closest?.('input[type="range"], [role="slider"]');
    touch = touches.length === 1 && !onSlider ? { x: finger.clientX, y: finger.clientY, highest: finger.clientY } : null;
  }, { passive: true, signal });

  addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1) return;
    const { clientX: x, clientY: y } = event.touches[0];
    if (touch.highest < touch.y && y > touch.highest + 16) touch = { x, y: touch.highest, highest: touch.highest };
    touch.highest = Math.min(y, touch.highest);
    const delta = touch.y - y;
    if (Math.abs(delta) <= Math.abs(x - touch.x)) return;
    const direction = Math.sign(delta);
    if (canBegin(event, direction)) {
      if (Math.abs(delta) < 12) event.preventDefault();
      else {
        touch = { x, y, highest: y };
        begin(event, direction);
      }
    } else if (delta <= -16) {
      touch = { x, y, highest: y };
      interrupt(direction, event);
    }
  }, { passive: false, signal });

  return listeners;
}

function watchPartOne(word, part) {
  const chapter = part.closest('.deep');
  const root = document.documentElement;
  const cover = document.createElement('span');
  cover.className = 'deep-blink-cover';
  cover.setAttribute('aria-hidden', 'true');
  const motionAllowed = () => !reducedMotion.matches && !document.hidden;
  const normal = { color: 'var(--ink)', backgroundColor: 'transparent' };
  const inverted = { color: 'var(--paper)', backgroundColor: 'var(--ink)' };
  const sceneHold = 1000;
  let partTop = bounds(part, scrollY).y;
  let animation, holdTimer, startTop, arrived, inputListeners;
  const active = () => !!animation || holdTimer !== undefined;

  function releaseHold() {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    root.classList.remove('deep-blink-hold');
    scheduleMotion();
  }

  function interrupt() {
    if (!active()) return;
    animation?.cancel();
    releaseHold();
  }

  async function blink() {
    try {
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
      if (!motionAllowed() || scrollY >= partTop) return;

      // Move to the existing title while the viewport is fully covered.
      arrived = true;
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

  function openerReady(top, height) {
    const openingEnd = Math.max(0, partTop - height);
    if (top < openingEnd - 1 || top > openingEnd + 24) return false;
    const wordBox = word.getBoundingClientRect();
    return wordBox.top >= 0 && wordBox.bottom <= height;
  }

  function canBegin(event, direction) {
    return direction > 0 && event.cancelable && !event.defaultPrevented && !active() && motionAllowed() && openerReady(scrollY, innerHeight);
  }

  function begin(event) {
    event.preventDefault();
    startTop = scrollY;
    arrived = false;
    void blink();
  }

  function listenForInput(top, height) {
    if (!motionAllowed() || (!active() && !openerReady(top, height))) {
      inputListeners?.abort();
      inputListeners = null;
      return;
    }
    inputListeners ??= capturePageGesture(canBegin, begin, interrupt);
  }

  listenForInput(scrollY, innerHeight);
  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure) partTop = bounds(part, top).y;
    if (active() && (!motionAllowed() || Math.abs(top - (arrived ? partTop : startTop)) > 2)) interrupt();
    listenForInput(top, height);
  });
  addEventListener('hashchange', interrupt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) interrupt(); });
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

function watchCloser(source, plate) {
  const part = source.closest('.deep-part');
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const title = plate.querySelector('#s6-title');
  const controls = plate.querySelector('.plate-controls');
  const distanceDemo = plate.querySelector('.s6-distance-demo');
  const rows = Array.from(controls.querySelectorAll('.s6-control'));
  const chart = plate.querySelector('#s6-chart');
  const drawDuration = 1380;
  const readHold = 1000;
  const motions = [];
  const traveledTitle = document.createElement('span');
  traveledTitle.className = 'deep-part-title s6-title-travel';
  traveledTitle.textContent = source.textContent;
  traveledTitle.setAttribute('aria-hidden', 'true');

  let inputListeners, partTop, plateTop, lockedAt, awaitingChart, returning;
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

  function canBegin(event, direction) {
    if (!event.cancelable || event.defaultPrevented || !canPlay() ||
      root.classList.contains('deep-blink-hold') || root.classList.contains('deep-flipping-hold')) return false;
    const atPart = atPartTitle(scrollY, innerHeight);
    if (direction > 0) return atPart && (!locked() || returning);
    return !returning && (atCloserTitle(scrollY, innerHeight) || (locked() && atPart));
  }

  function atPartTitle(top, height) {
    return top >= partTop - 1 && top <= partTop + height * .18;
  }

  function atCloserTitle(top, height) {
    return Math.abs(top - plateTop) <= height * .18;
  }

  function begin(event, direction) {
    event.preventDefault();
    const goingBack = direction < 0;
    settle();
    if (goingBack && !atCloserTitle(scrollY, innerHeight)) {
      part.scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }
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

  function interrupt(direction) {
    if (direction !== -1 || !returning) settle();
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure || partTop === undefined) {
      partTop = bounds(part, top).y;
      plateTop = bounds(plate, top).y;
    }

    if (!canPlay() || (locked() && Math.abs(top - lockedAt) > 2) || (awaitingChart && !locked() && top < plateTop - 2)) settle();
    if (canPlay() && (locked() || atPartTitle(top, height) || atCloserTitle(top, height))) {
      inputListeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      inputListeners?.abort();
      inputListeners = undefined;
    }

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

  return settle;
}

function watchFlipping(previous, plate, settlePrevious) {
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const previousWords = previous.querySelector('.plate-words');
  const previousTitle = previous.querySelector('#s6-title');
  const words = plate.querySelector('.plate-words');
  const wordTargets = [...plate.querySelectorAll('#s7-title > span')];
  const controlText = plate.querySelector('.s7-control-text');
  const speed = plate.querySelector('#s7-speed');
  const coil = previous.querySelector('#s6-radius');
  const sourceChart = previous.querySelector('#s6-chart');
  const targetChart = plate.querySelector('#s7-chart');
  const plot = document.createElement('canvas');
  const track = document.createElement('input');
  const ctx = plot.getContext('2d');
  const theme = getComputedStyle(chapter);
  const colors = ['--ink', '--copper'].map(name => theme.getPropertyValue(name).trim());
  const motions = [];
  const wordsInFlight = [];
  const traceTime = 2180, guideTime = 2720, readHold = 1000;

  plot.className = 's7-plot-copy';
  plot.setAttribute('aria-hidden', 'true');
  Object.assign(track, { type: 'range', min: '0', max: '1', step: 'any', className: 's7-track-copy', inert: true });
  track.setAttribute('aria-hidden', 'true');

  let layout, inputListeners, previousTop, targetTop, lockedAt, waves;
  let armed = false, frame = 0;
  const active = () => lockedAt !== undefined;
  const canPlay = () => !reducedMotion.matches && !document.hidden;

  function settle() {
    plate.classList.remove('s7-awaiting', 's7-entering');
    if (!active()) return;
    cancelAnimationFrame(frame);
    for (const motion of motions) motion.cancel();
    motions.length = 0;
    for (const { copy, target } of wordsInFlight) {
      copy.remove();
      target.style.removeProperty('opacity');
    }
    wordsInFlight.length = 0;
    for (const node of [sourceChart, previousTitle, coil, speed]) node.style.removeProperty('opacity');
    track.remove();
    plot.remove();
    delete targetChart.drawHandoff;
    delete targetChart.flippingEntrance;
    lockedAt = undefined;
    root.classList.remove('deep-flipping-hold');
    scheduleMotion();
  }

  function skip() {
    armed = false;
    settle();
  }

  function interrupt(direction, event) {
    if (!active()) return;
    skip();
    if (direction === -1 && event?.cancelable) {
      event.preventDefault();
      previous.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

  function viewportBox(node, top = scrollY) {
    const box = bounds(node, scrollY);
    return { ...box, y: box.y - top };
  }

  function ready(top, height) {
    return top >= Math.max(previousTop, targetTop - height) - 2 && top < targetTop - 1;
  }

  function canBegin(event, direction) {
    if (direction < 0 || !event.cancelable || event.defaultPrevented || !canPlay() || !armed || active() ||
      root.classList.contains('deep-closer-hold')) return false;
    if (ready(scrollY, innerHeight)) return true;
    const wheelUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * wheelUnit >= targetTop;
  }

  function collectWords() {
    const text = previousTitle.firstChild;
    const range = document.createRange();
    const lineHeight = parseFloat(getComputedStyle(previousTitle).lineHeight);
    const origins = [...text.data.matchAll(/\S+/g)].map(match => {
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      return { word: match[0], x: rect.left, y: rect.top + (rect.height - lineHeight) / 2 };
    });

    wordTargets.forEach((target, index) => {
      const to = viewportBox(target, targetTop);
      const from = origins[Math.min(index, origins.length - 1)];
      const copy = document.createElement('span');
      copy.className = 's7-flow-word';
      copy.setAttribute('aria-hidden', 'true');
      copy.textContent = from.word;
      copy.style.left = `${from.x}px`;
      copy.style.top = `${from.y}px`;
      target.style.opacity = 0;
      chapter.append(copy);
      wordsInFlight.push({ copy, target, to, from, joins: index >= origins.length });
    });
    previousTitle.style.opacity = 0;
  }

  function flow(from, to, t, dip) {
    return {
      x: mix(from.x, to.x, t),
      y: mix(from.y, to.y, t) + Math.sin(Math.PI * t) * dip,
    };
  }

  function pour(elapsed) {
    wordsInFlight.forEach(({ copy, target, to, from, joins }, i) => {
      const start = 110 + i * 95;
      const p = stage(start, start + 900, elapsed);
      const position = flow(from, to, ease(0, 1, p), -32 - i * 12);
      const earlier = wordsInFlight[i - 1]?.to;
      if (earlier && Math.abs(earlier.y - to.y) < 2) {
        const edge = earlier.x + earlier.w;
        const above = ease(.46, .65, p) * (1 - ease(edge, Math.max(edge + 1, to.x), position.x));
        const lane = i % 2 === 0 && to.y > 2 * to.h + 10 ? to.h + 5 : 0;
        position.y = mix(position.y, Math.min(position.y, Math.max(4, to.y - to.h - 3 - lane)), above);
      }
      const swap = ease(.28, .48, p) * (1 - ease(.49, .70, p));
      const content = p < .49 ? from.word : target.textContent;
      if (copy.textContent !== content) copy.textContent = content;
      const arrive = ease(.91, 1, p);
      copy.style.transform = `translate(${position.x - from.x}px, ${position.y - from.y}px) skewX(${-7 * Math.sin(Math.PI * p)}deg)`;
      copy.style.opacity = (joins ? ease(.37, .63, p) : 1 - .86 * swap) * (1 - arrive);
      copy.style.filter = `blur(${swap * 3}px)`;
      target.style.opacity = arrive;
    });

    const { fromTrack, toTrack, coilValue, speedValue } = layout;
    const t = ease(360, 1500, elapsed);
    const placed = ease(1400, 1530, elapsed);
    const position = flow(fromTrack, toTrack, t, 47);
    const pinch = 1 - Math.sin(Math.PI * t) * .43;
    track.value = mix(coilValue, speedValue, ease(.34, .85, t));
    track.style.transform = `translate(${position.x - fromTrack.x}px, ${position.y - fromTrack.y}px) scaleX(${mix(fromTrack.w, toTrack.w, t) * pinch / fromTrack.w})`;
    track.style.opacity = 1 - placed;
    speed.style.opacity = placed;
  }

  function drawPlot(elapsed) {
    const { source, target, width, height, outgoing } = layout;
    const p = stage(200, traceTime, elapsed);
    const gather = ease(.03, .29, p);
    const travel = ease(.32, .61, p);
    const split = waves ? ease(.64, .78, p) : 0;
    const bend = waves ? ease(.81, 1, p) : 0;
    const merged = ease(.65, 1, gather) * (1 - ease(0, .55, split));
    const alpha = ease(200, 410, elapsed) * (1 - targetChart.flippingEntrance.traces);
    ctx.clearRect(0, 0, width, height);
    if (alpha === 0) return;

    const centerX = mix(source.x + source.w * .52, target.x + target.w * .53, travel);
    const centerY = mix(source.y + source.h * .49, Math.min(target.y + target.h * .51, height * .84), travel);
    const length = Math.min(width * .60, 284);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = mix(2, 1.45, gather * (1 - bend));
    outgoing.forEach(({ box, points }, index) => {
      if (index === 0 && merged === 1) return;
      const wave = waves?.[index];
      ctx.globalAlpha = alpha * (index === 0 ? 1 - merged : 1);
      ctx.strokeStyle = colors[index];
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200, sample = u * (points.length - 1), j = Math.floor(sample);
        const [ax, ay] = points[j], [bx, by] = points[Math.min(j + 1, points.length - 1)];
        const x = source.x + box.x + mix(ax, bx, sample - j) * box.w;
        const y = source.y + box.y + mix(ay, by, sample - j) * box.h;
        const mergeX = mix(x, centerX + (u - .5) * length, gather);
        const mergeY = mix(y, centerY, gather);
        // Open onto the two baselines first, then give the live waves their height.
        const px = wave ? mix(mergeX, target.x + wave.box.x + wave.box.w * u, split) : mergeX;
        const py = wave ? mix(mergeY, target.y + wave.box.y + wave.box.h * mix(.5, wave.yAt(u), bend), split) : mergeY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function begin(event) {
    if (!ready(scrollY, innerHeight)) {
      event.preventDefault();
      scrollTo({ top: Math.max(previousTop, targetTop - innerHeight), behavior: 'instant' });
      return;
    }
    if (!sourceChart.handoffPlots || !ctx) return;
    event.preventDefault();
    settlePrevious();
    const fromTrack = viewportBox(coil), toTrack = viewportBox(speed, targetTop);
    const fraction = input => (input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min));
    layout = {
      source: viewportBox(sourceChart), target: viewportBox(targetChart, targetTop),
      outgoing: sourceChart.handoffPlots, fromTrack, toTrack, width: innerWidth, height: innerHeight,
      coilValue: fraction(coil), speedValue: fraction(speed),
    };

    lockedAt = scrollY;
    waves = null;
    root.classList.add('deep-flipping-hold');
    plate.classList.add('s7-entering');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    plot.width = Math.round(layout.width * dpr);
    plot.height = Math.round(layout.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(track.style, { left: `${fromTrack.x}px`, top: `${fromTrack.y}px`, width: `${fromTrack.w}px` });
    track.value = layout.coilValue;
    chapter.append(plot, track);
    collectWords();
    coil.style.opacity = 0;
    speed.style.opacity = 0;

    const entrance = { labels: 0, traces: 0, guides: 0 };
    targetChart.flippingEntrance = entrance;
    targetChart.drawHandoff = live => { waves = live; };
    motions.push(previousWords.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 530, fill: 'both' }));
    const copy = [...words.children].filter(node => node.id !== 's7-title' && !node.contains(speed));
    copy.splice(2, 0, controlText);
    for (const [i, node] of copy.entries()) {
      motions.push(node.animate([
        { opacity: 0, transform: 'translate(-14px, -28px) skewX(-7deg)', filter: 'blur(2px)' },
        { opacity: .83, transform: 'translate(3px, 6px) skewX(1deg)', offset: .7, filter: 'none' },
        { opacity: 1, transform: 'none', filter: 'none' },
      ], { duration: 550, delay: 750 + i * 91, easing: arrivalEase, fill: 'both' }));
    }
    plate.classList.remove('s7-awaiting');

    const started = performance.now();
    let seated = false;
    function tick(now) {
      const elapsed = now - started;
      if (!seated && elapsed >= 620) {
        seated = true;
        plate.scrollIntoView({ block: 'start', behavior: 'instant' });
        lockedAt = scrollY;
      }
      sourceChart.style.opacity = 1 - ease(200, 410, elapsed);
      entrance.labels = ease(1990, 2270, elapsed);
      entrance.traces = ease(2130, traceTime, elapsed);
      entrance.guides = ease(2220, guideTime, elapsed);
      if (track.isConnected) {
        pour(elapsed);
        if (elapsed >= 1530) track.remove();
      }
      if (entrance.traces < 1) drawPlot(elapsed);
      else plot.remove();
      if (elapsed >= guideTime + readHold) return skip();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (needsMeasure || targetTop === undefined) {
      targetTop = bounds(plate, top).y;
      previousTop = bounds(previous, top).y;
    }
    if (!canPlay() || (active() && Math.abs(top - lockedAt) > 2)) skip();
    if (!active()) {
      if (!canPlay() || top >= targetTop - 1 || plate.contains(document.activeElement)) armed = false;
      else if (top >= previousTop - height * .2 && top <= targetTop - height * .65) armed = true;
      plate.classList.toggle('s7-awaiting', armed && top < targetTop - 1);
    }
    if (canPlay() && (active() || (armed && top >= previousTop - 2 && top < targetTop - 1))) {
      inputListeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      inputListeners?.abort();
      inputListeners = undefined;
    }
  });

  for (const event of ['pointerdown', 'focusin', 'input']) speed.addEventListener(event, skip);
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });
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
  let layout, armed, elapsed, waves, inputListeners, previousTop, targetTop, lockedAt, frame;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined;

  function ready(top, height) {
    return top >= Math.max(previousTop, targetTop - height) - height * .075 && top < targetTop - 1;
  }

  function canBegin(event, direction) {
    if (direction < 0 || !event.cancelable || event.defaultPrevented || !canPlay() || !armed || active() ||
      root.classList.contains('deep-flipping-hold')) return false;
    if (ready(scrollY, innerHeight)) return true;
    const wheelUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * wheelUnit >= targetTop;
  }

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
    plate.classList.remove('s8-awaiting');
    if (!active()) return;
    cancelAnimationFrame(frame);
    for (const { animation } of turns) animation.cancel();
    turns.length = 0;
    clearPlot();
    lockedAt = undefined;
    root.classList.remove('deep-tuning-hold');
    scheduleMotion();
  }

  function skip() {
    armed = false;
    settle();
  }

  function interrupt(direction, event) {
    if (!active()) return;
    skip();
    if (direction === -1 && event?.cancelable) {
      event.preventDefault();
      previous.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
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
    const shape = ease(.55, .92, release);
    const leave = ease(0, .17, merge), arrive = ease(.83, 1, release);
    const { box, points, X, Y, color } = curve;
    const middle = mix(from.y + from.h * .52, to.y + box.y + box.h * .72, travel) - viewport;
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

    const launch = stage(0, .24, release), fall = stage(.24, .41, release);
    const pull = ease(.41, .52, release), spring = ease(.52, .66, release);
    const exit = stage(.52, .79, release);
    const bend = 21 * pull * (1 - spring);
    const below = height + 24, contact = middle - 4;
    const apex = contact - Math.min(26, height * .04);
    const rise = mix(below, apex, launch * (2 - launch));
    const landing = mix(rise, contact, fall * fall);
    // Contact bends the line down. Its recoil sends the capacitor back out of view.
    const chipY = mix(landing + bend, below, exit * (2 - exit));
    const chipX = left + span / 2;
    const angle = mix(-18, 4, launch) + 19 * exit;
    capacitor.style.opacity = release > 0 && exit < 1 ? 1 : 0;
    capacitor.style.transform = `translate(${chipX - 21}px, ${chipY - 7.5}px) rotate(${angle}deg) scale(.62)`;

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
      const y = mix(middle + bend * (1 - Math.abs(2 * u - 1)), to.y + Y(volts) - viewport, shape);
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
    if (!ready(top, height)) {
      scrollTo({ top: Math.max(previousTop, targetTop - height), behavior: 'instant' });
      return;
    }
    const from = bounds(sourceChart, top), to = bounds(targetChart, top);
    layout = { from, to, width: innerWidth, height, stacked: Math.abs(from.x - to.x) < 1 };
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
    if (!canPlay() || (active() && Math.abs(top - lockedAt) > 2)) skip();
    if (!active()) {
      if (!canPlay() || top >= targetTop - 1 || plate.contains(document.activeElement)) armed = false;
      else if (top >= previousTop - height * .2 && top <= targetTop - height * .65) armed = true;
      plate.classList.toggle('s8-awaiting', armed && top < targetTop - 1);
    }
    if (canPlay() && (active() || (armed && top >= previousTop - height * .075 && top < targetTop - 1))) {
      inputListeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      inputListeners?.abort();
      inputListeners = undefined;
    }
  });

  for (const scene of [previous, plate]) {
    const controls = scene.querySelector('.plate-controls');
    for (const event of ['focusin', 'pointerdown', 'input', 'change']) controls.addEventListener(event, skip);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });
}

function watchMetal(previous, plate) {
  const chapter = plate.closest('.deep');
  const root = document.documentElement;
  const source = previous.querySelector('#s8-chart'), target = plate.querySelector('#s9-chart');
  const outgoing = previous.querySelector('.plate-words'), incoming = plate.querySelector('.plate-words');
  const figure = target.parentElement;
  const plot = document.createElement('canvas');
  const wipe = document.createElement('span');
  plot.className = 's9-plot-copy';
  wipe.className = 's9-copy-wipe';
  wipe.hidden = true;
  plot.setAttribute('aria-hidden', 'true');
  wipe.setAttribute('aria-hidden', 'true');
  const ctx = plot.getContext('2d');
  const end = 2560, readHold = 1000;
  let layout, frame, previousTop, targetTop, approach, lockedAt, listeners;
  let armed = false;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined;

  function settle() {
    plate.classList.remove('s9-awaiting', 's9-entering');
    if (!active()) return;
    cancelAnimationFrame(frame);
    plot.remove();
    wipe.remove();
    for (const node of [source, outgoing]) node.style.removeProperty('transform');
    incoming.style.removeProperty('transform');
    for (const node of [outgoing, incoming]) node.style.removeProperty('clip-path');
    source.style.removeProperty('--s9-source-opacity');
    figure.style.removeProperty('opacity');
    lockedAt = undefined;
    root.classList.remove('deep-metal-hold');
    scheduleMotion();
  }

  function skip() {
    armed = false;
    settle();
  }

  function interrupt(direction, event) {
    if (!active()) return;
    const origin = layout.origin;
    skip();
    if (direction === -1 && event?.cancelable) {
      event.preventDefault();
      scrollTo({ top: origin, behavior: 'instant' });
    }
  }

  function ready(top, height) {
    return top >= approach - height * .065 && top < targetTop - 1;
  }

  function canBegin(event, direction) {
    if (direction < 0 || !event.cancelable || event.defaultPrevented || !canPlay() || !armed || active() ||
      root.classList.contains('deep-tuning-hold')) return false;
    if (ready(scrollY, innerHeight)) return true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * unit >= targetTop;
  }

  function sample(points, index) {
    const i = Math.floor(index), [x, y] = points[i], next = points[i + 1];
    return next ? [mix(x, next[0], index - i), mix(y, next[1], index - i)] : [x, y];
  }

  function stroke(pointAt, color, alpha, width) {
    if (alpha <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const [x, y] = pointAt(i / 64);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function swapCopy(progress) {
    wipe.hidden = progress === 0 || progress === 1;
    if (wipe.hidden) {
      outgoing.style.clipPath = progress === 1 ? 'inset(0 0 0 100%)' : 'none';
      incoming.style.clipPath = progress === 0 ? 'inset(0 100% 0 0)' : 'none';
      return;
    }
    const edge = mix(-.05, 1.05, progress);
    const amplitude = .045 * Math.sin(Math.PI * progress);
    const old = outgoing.getBoundingClientRect(), next = incoming.getBoundingClientRect();
    const top = Math.min(old.top, next.top), height = Math.max(old.bottom, next.bottom) - top;
    const sampleFront = (areaTop, areaHeight) => Array.from({ length: 9 }, (_, i) => {
      const y = areaHeight * i / 8;
      const phase = (areaTop + y - top) / height * 2 * Math.PI - progress * Math.PI;
      return [old.left + old.width * (edge + amplitude * Math.sin(phase)), y];
    });
    const clip = (area, side) => {
      const front = sampleFront(area.top, area.height).map(([x, y]) => `${clamp((x - area.left) / area.width) * 100}% ${y}px`);
      return `polygon(${side}% 0, ${front.join(', ')}, ${side}% 100%)`;
    };
    outgoing.style.clipPath = clip(old, 100);
    incoming.style.clipPath = clip(next, 0);

    const band = 8;
    const front = sampleFront(top, height);
    const left = Math.max(0, Math.min(...front.map(([x]) => x)) - band);
    const right = Math.min(innerWidth, Math.max(...front.map(([x]) => x)) + band);
    const edgePoints = (points, offset) => points.map(([x, y]) => `${x - left + offset}px ${y}px`);
    wipe.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${height}px;`;
    wipe.style.clipPath = `polygon(${[...edgePoints(front, -band), ...edgePoints(front.reverse(), band)].join(', ')})`;
  }

  function paint(elapsed) {
    const { from, to, width, height, curve: { box, points, X, Y, color } } = layout;
    const cut = (points.length - 1) / 2;
    const split = ease(110, 440, elapsed);
    const curl = ease(400, 1110, elapsed);
    const bloom = stage(1270, 2320, elapsed);
    const leave = ease(0, 170, elapsed), arrive = ease(2180, end, elapsed);
    const top = scrollY;
    source.style.setProperty('--s9-source-opacity', 1 - leave);
    figure.style.opacity = arrive;
    plot.style.opacity = leave * (1 - arrive);
    incoming.style.transform = `translateY(${layout.headingShift * (1 - ease(1050, 1600, elapsed))}px)`;
    swapCopy(ease(325, 1240, elapsed));
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const peak = points[Math.floor(cut)];
    const centerX = mix(from.x + X(peak[0]), to.x + to.w / 2, curl);
    const centerY = mix(from.y + Y(peak[1]) + 34, to.y + to.h * .62 - top, curl);
    const radius = Math.min(21, to.w * .054);
    const loop = (side, u) => {
      const angle = -Math.PI / 2 + side * Math.PI * u;
      return [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)];
    };

    const field = target.metalField;
    if (!bloom || !field) {
      const gap = 26 * split * (1 - curl);
      for (const side of [-1, 1]) {
        stroke(u => {
          const [frequency, volts] = sample(points, cut + side * cut * u);
          const [lx, ly] = loop(side, u);
          const x = from.x + X(frequency) + side * gap * (1 - u * .6);
          return [mix(x, lx, curl), mix(from.y + Y(volts), ly, curl)];
        }, color, 1, mix(2.2, 1.8, curl));
      }
      return;
    }

    const last = field.lines.length - 1;
    for (let i = last; i >= 0; i--) {
      const line = field.lines[i];
      const delay = (last - i) * .12;
      const growth = ease(delay, .98, bloom);
      const visibility = i === last ? 1 : ease(delay, delay + .19, bloom);
      if (!visibility) continue;
      for (const side of [-1, 1]) {
        const pointAt = u => {
          const [rho, z] = sample(line.points, (line.points.length - 1) * u);
          const [lx, ly] = loop(side, u);
          return [mix(lx, to.x + field.X(side * rho), growth), mix(ly, to.y + field.Y(z) - top, growth)];
        };
        const copper = i === last ? 1 - ease(.15, .75, growth) : 0;
        stroke(pointAt, color, copper, mix(1.8, 1.4, growth));
        stroke(pointAt, line.color, visibility * (1 - copper), 1.4);
      }
    }
  }

  function begin(event) {
    if (!ctx || !source.resonanceCurve) return;
    event.preventDefault();
    const origin = scrollY, height = innerHeight;
    if (!ready(origin, height)) {
      scrollTo({ top: approach, behavior: 'instant' });
      return;
    }
    const from = bounds(source, origin), to = bounds(target, origin);
    const chartOverhang = to.y + to.h + 8 - targetTop - height;
    const extra = Math.max(0, Math.min(chartOverhang, plate.offsetHeight - height));
    const oldHeadingTop = outgoing.querySelector('h3').getBoundingClientRect().top;
    const newHeadingTop = bounds(incoming.querySelector('h3'), origin).y - targetTop;
    const shift = oldHeadingTop - newHeadingTop;
    const headingShift = oldHeadingTop >= 0 && Math.abs(shift) < 80 ? shift : 0;
    layout = { origin, from: { ...from, y: from.y - origin }, to, width: innerWidth, height, headingShift, curve: source.resonanceCurve };
    const dpr = Math.min(devicePixelRatio || 1, 2);
    plot.width = Math.round(layout.width * dpr);
    plot.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    root.classList.add('deep-metal-hold');
    plate.classList.add('s9-entering');
    scrollTo({ top: targetTop, behavior: 'instant' });
    lockedAt = scrollY;
    const pin = `translateY(${lockedAt - origin}px)`;
    outgoing.style.transform = pin;
    source.style.transform = pin;
    chapter.append(plot, wipe);
    paint(0);
    plate.classList.remove('s9-awaiting');

    const started = performance.now();
    function tick(now) {
      const elapsed = now - started;
      const destination = targetTop + extra * ease(960, 1270, elapsed);
      if (Math.abs(destination - scrollY) >= .5) {
        scrollTo({ top: destination, behavior: 'instant' });
        lockedAt = scrollY;
      }
      if (elapsed < end) paint(elapsed);
      else if (plot.isConnected) {
        paint(end);
        plot.remove();
        wipe.remove();
      }
      if (elapsed >= end + readHold) return skip();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  watchScrollMotion((top, height) => {
    previousTop = bounds(previous, top).y;
    targetTop = bounds(plate, top).y;
    const { y, h } = bounds(source, top);
    approach = Math.min(targetTop - 2, Math.max(previousTop, y + h + 12 - height));
    if (!canPlay() || (active() && Math.abs(top - lockedAt) > 2)) skip();
    if (!active()) {
      if (!canPlay() || top >= targetTop - 1 || plate.contains(document.activeElement)) armed = false;
      else if (top >= previousTop - height * .2 && top <= targetTop - height * .55) armed = true;
      plate.classList.toggle('s9-awaiting', armed && top < targetTop - 1);
    }
    if (canPlay() && (active() || (armed && top >= previousTop - height * .075 && top < targetTop - 1))) {
      listeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      listeners?.abort();
      listeners = undefined;
    }
  });

  for (const node of [previous.querySelector('.plate-controls'), figure]) {
    for (const event of ['focusin', 'pointerdown', 'input']) node.addEventListener(event, skip);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });
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
  let layout, previousTop, targetTop, approach, lockedAt, listeners, frame;
  let armed = false;
  const canPlay = () => !reducedMotion.matches && !document.hidden;
  const active = () => lockedAt !== undefined;

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
    armed = false;
    plate.classList.remove('s10-awaiting');
    if (!active()) return;
    cancelAnimationFrame(frame);
    clearMotion();
    lockedAt = undefined;
    root.classList.remove('deep-pauses-hold');
    scheduleMotion();
  }

  function interrupt(direction, event) {
    if (!active()) return;
    const origin = layout.origin;
    skip();
    if (direction === -1 && event?.cancelable) {
      event.preventDefault();
      scrollTo({ top: origin, behavior: 'instant' });
    }
  }

  function ready(top, height) {
    return top >= approach - height * .065 && top < targetTop - 1;
  }

  function canBegin(event, direction) {
    if (direction < 0 || !event.cancelable || event.defaultPrevented || !canPlay() || !armed || active() ||
      root.classList.contains('deep-metal-hold')) return false;
    if (ready(scrollY, innerHeight)) return true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * unit >= targetTop;
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
    if (!plot.setPauseHandoff) return;
    event.preventDefault();
    const origin = scrollY, height = innerHeight;
    if (!ready(origin, height)) {
      scrollTo({ top: approach, behavior: 'instant' });
      return;
    }
    const old = bounds(surface, origin), to = bounds(track, origin), chart = bounds(plot, origin);
    const extra = Math.max(0, Math.min(chart.y + chart.h + 8 - targetTop - height, plate.offsetHeight - height));
    layout = { origin, from: { ...old, y: old.y - origin }, to, oldWidth: oldWords.clientWidth, newWidth: words.clientWidth,
      width: innerWidth, stacked: Math.abs(bounds(figure, origin).x - bounds(words, origin).x) < 1 };
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
    if (!canPlay() || (active() && Math.abs(top - lockedAt) > 2)) skip();
    if (!active()) {
      plate.classList.remove('s10-entering');
      if (!canPlay() || top >= targetTop - 1 || plate.contains(document.activeElement)) armed = false;
      else if (top >= previousTop - height * .2 && top <= targetTop - height * .55) armed = true;
      plate.classList.toggle('s10-awaiting', armed && top < targetTop - 1);
    }
    if (canPlay() && (active() || (armed && top >= previousTop - height * .075 && top < targetTop - 1))) {
      listeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      listeners?.abort();
      listeners = undefined;
    }
  });

  for (const control of [metal, metalAction, partLink, cap]) {
    for (const event of ['focus', 'pointerdown', 'input']) control.addEventListener(event, skip);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, skip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) skip(); });
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
  let transition, listeners, frame;
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

  function release(followLink = false) {
    if (!transition) return;
    if (followLink && transition.followLink && !transition.arrived) land();
    cancelAnimationFrame(frame);
    transition = undefined;
    reveal.remove();
    word.style.removeProperty('transform');
    root.classList.remove('deep-part-two-hold');
    scheduleMotion();
  }

  function play(followLink) {
    const wordBox = word.getBoundingClientRect();
    if (wordBox.top < 0 || wordBox.bottom > innerHeight) {
      source.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    const { x, y, w, h } = bounds(word, scrollY);
    const centerX = x + w / 2, centerY = y + h * .69 - scrollY;
    const reach = Math.hypot(Math.max(centerX, innerWidth - centerX), Math.max(centerY, innerHeight - centerY)) + 20;
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

  function canBegin(event, direction) {
    if (direction < 0 || event.defaultPrevented || !event.cancelable || !canPlay()) return false;
    if (transition) return true;
    if (root.classList.contains('deep-pauses-hold')) return false;
    const { cue, end } = approach(scrollY, innerHeight);
    if (scrollY >= end - 1) return false;
    if (scrollY >= cue - 2) return true;
    // Stage a compact scene before the browser starts an inertial swipe.
    if (event.type === 'touchmove' || event.key === 'PageDown' || event.key === ' ') return true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * unit > cue;
  }

  function begin(event) {
    event.preventDefault();
    if (transition) return;
    const { cue } = approach(scrollY, innerHeight);
    if (scrollY < cue - 2) {
      scrollTo({ top: cue, behavior: 'instant' });
      return;
    }
    if (word.getBoundingClientRect().top < 0) scrollTo({ top: cue, behavior: 'instant' });
    play(false);
  }

  function interrupt(direction, event) {
    if (transition && !transition.arrived && direction === -1 && event.cancelable) event.preventDefault();
    release();
  }

  source.addEventListener('click', event => {
    if (!canPlay() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (transition) transition.followLink = true;
    else play(true);
  });
  plate.addEventListener('focusin', event => { if (event.target !== source) release(); });

  watchScrollMotion((top, height) => {
    const { cue, end } = approach(top, height);
    if (transition && Math.abs(top - transition.top) > 2) release();
    if (canPlay() && (transition || (top >= cue - height * .25 && top < end - 1))) {
      listeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      listeners?.abort();
      listeners = undefined;
    }
  });
  for (const event of ['hashchange', 'popstate', 'pagehide']) addEventListener(event, () => release());
  addEventListener('resize', () => release(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(true); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) release(true); });
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
  let intro, listeners, frame = 0, visible = false, scanPaused = false, userPaused = false;
  let axes = 1, reveal = 1;
  let blend = Number(toggle.checked), destination = blend, blendFrom, blendStart, flip;
  let capture = 0, previousCapture = 0, scanElapsed = 0, scanFrame;
  const motionAllowed = () => !reducedMotion.matches && !document.hidden;
  const canScan = () => visible && !scanPaused && !userPaused && (!intro || intro.reading);
  const sweepPosition = () => stage(0, sweepTime, scanElapsed);
  const updatePlot = () => plot.setAnswerMotion?.(axes, reveal, blend, previousCapture, capture,
    previousCapture === capture ? 1 : sweepPosition());

  function finishIntro() {
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
    if (!frame && motionAllowed() && (intro || canScan() || (visible && blend !== destination))) {
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

  function canBegin(event, direction) {
    if (direction < 0 || event.defaultPrevented || !event.cancelable || !motionAllowed()) return false;
    if (intro) return true;
    return !root.classList.contains('deep-part-two-hold') && plot.setAnswerMotion &&
      scrollY >= bounds(part, scrollY).y - 2 && scrollY < bounds(scene, scrollY).y - 1;
  }

  function begin(event) {
    event.preventDefault();
    if (intro) return;
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

  function interrupt(direction, event) {
    if (intro && !intro.to && direction === -1 && event.cancelable) event.preventDefault();
    finishIntro();
  }

  watchScrollMotion(top => {
    if (intro && Math.abs(top - intro.top) > 2) finishIntro();
    const start = bounds(part, top).y, end = bounds(scene, top).y;
    if (motionAllowed() && (intro || (top >= start - 2 && top < end - 1))) {
      listeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      listeners?.abort();
      listeners = undefined;
    }
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
}

function watchWhispering(previous, scene) {
  const root = document.documentElement, chapter = scene.closest('.deep');
  const source = previous.querySelector('#s11-title'), title = scene.querySelector('#s12-title');
  const before = previous.querySelector('.plate-words'), after = scene.querySelector('.plate-words');
  const sourceChart = previous.querySelector('#s11-chart'), chart = scene.querySelector('#s12-chart');
  const instrument = sourceChart.closest('.s11-instrument');
  const vortex = document.createElement('div'), wave = document.createElement('canvas');
  vortex.className = 's12-vortex';
  vortex.setAttribute('aria-hidden', 'true');
  wave.className = 's12-wave-copy';
  vortex.append(wave);
  const ctx = wave.getContext('2d');
  const cut = 880, arrivalEnd = 2260, readHold = 1000;
  let run, frame, listeners;
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
    return { cue, end };
  }

  function canBegin(event, direction) {
    if (direction < 0 || event.defaultPrevented || !event.cancelable || !canPlay()) return false;
    if (run) return true;
    if (!sourceChart.answerTrace || root.classList.contains('deep-soaking-hold')) return false;
    const { cue, end } = approach(scrollY, innerHeight);
    if (scrollY >= end - 1) return false;
    if (scrollY >= cue - 2 || event.type === 'touchmove' || event.key === 'PageDown' || event.key === ' ') return true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    return event.type === 'wheel' && scrollY + event.deltaY * unit > cue;
  }

  function begin(event) {
    event.preventDefault();
    if (run) return;
    const width = innerWidth, height = innerHeight;
    const { cue, end } = approach(scrollY, height);
    if (scrollY < cue - 2) {
      scrollTo({ top: cue, behavior: 'instant' });
      return;
    }
    if (source.getBoundingClientRect().top < 0) scrollTo({ top: cue, behavior: 'instant' });
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

  function interrupt(direction, event) {
    if (run && !run.landed && direction === -1 && event.cancelable) event.preventDefault();
    finish();
  }

  watchScrollMotion((top, height) => {
    if (run && (!canPlay() || Math.abs(top - run.top) > 2)) finish();
    const { cue, end } = approach(top, height);
    if (canPlay() && (run || (top >= cue - height * .25 && top < end - 1))) {
      listeners ??= capturePageGesture(canBegin, begin, interrupt);
    } else {
      listeners?.abort();
      listeners = undefined;
    }
  });

  for (const controls of [previous, scene].flatMap(plate => [...plate.querySelectorAll('.plate-controls')])) {
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, finish);
  }
  for (const event of ['resize', 'hashchange', 'pagehide']) addEventListener(event, finish);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finish(); });
}

function watchCounting(previous, scene) {
  const chapter = scene.closest('.deep');
  const source = previous.querySelector('#s12-chart'), chart = scene.querySelector('#s13-chart');
  const copy = document.createElement('canvas');
  copy.className = 's13-spectrum-copy';
  copy.setAttribute('aria-hidden', 'true');
  const ctx = copy.getContext('2d');
  let layout, copiedTrace, armed = false, lastTop = scrollY;

  function settle() {
    if (!copy.isConnected) return;
    copy.remove();
    source.style.removeProperty('--s13-spectrum-opacity');
    chart.style.removeProperty('clip-path');
  }

  function copySpectrum(trace) {
    if (copiedTrace === trace) return;
    const { box, X, Y, points, color } = trace;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    copy.width = Math.round(box.w * dpr);
    copy.height = Math.round(box.h * dpr);
    Object.assign(copy.style, { width: `${box.w}px`, height: `${box.h}px` });
    ctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    ctx.strokeStyle = color;
    ctx.beginPath();
    points.forEach(([frequency, strength], i) => {
      const x = X(frequency), y = Y(strength);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    copiedTrace = trace;
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      const from = bounds(source, top), to = bounds(chart, top);
      const stacked = matchMedia('(max-width: 860px)').matches;
      const start = Math.max(from.y + from.h * .36 - height * .27, to.y - height * 1.04);
      const end = Math.max(start + height * .24, to.y + to.h * .8 - height * .64);
      layout = { from, to, stacked, start, end };
      armed = false;
    }
    if (Math.abs(top - lastTop) > height * .42) armed = false;
    lastTop = top;
    const { from, to, stacked, start, end } = layout;
    if (top <= start) armed = true;
    if (!armed || top <= start || top >= end || chapter.querySelector('.s12-vortex')) return settle();

    const spectrum = source.spectrumTrace, timing = chart.timingTrace;
    if (!spectrum || !timing) return settle();
    const progress = stage(start, end, top);
    const count = timing.sent.length;
    const arriving = stage(.34, .99, progress) * count;
    if (arriving >= count) return settle();

    copySpectrum(spectrum);
    if (!copy.isConnected) chapter.append(copy);
    const fromBox = spectrum.box, toBox = timing.box;
    const travel = stacked ? 1 : ease(.05, .34, progress);
    const sideways = stacked ? 1 : ease(.03, .34, progress);
    const x = mix(from.x + fromBox.x, to.x + toBox.x, sideways);
    const y = mix(from.y + fromBox.y, to.y + timing.Y(1), travel) - top;
    const width = mix(fromBox.w, toBox.w, sideways);
    const plotHeight = mix(fromBox.h, timing.Y(0) - timing.Y(1), travel);
    copy.style.transform = `translate(${x}px, ${y}px) scale(${width / fromBox.w}, ${plotHeight / fromBox.h})`;
    const fade = ease(0, stacked ? .25 : .16, progress);
    copy.style.opacity = fade;
    source.style.setProperty('--s13-spectrum-opacity', 1 - (stacked ? ease(.3, .52, progress) : fade));

    // The number leads its column so each bit has time to register before the next arrives.
    const whole = Math.floor(arriving), fraction = arriving - whole;
    const labels = (whole + ease(0, .36, fraction)) / count;
    const replaced = (whole + ease(.24, 1, fraction)) / count;
    const digitsX = labels ? toBox.x + toBox.w * labels : 0;
    const waveX = replaced ? toBox.x + toBox.w * replaced : 0;
    const caption = toBox.y - 24, row = toBox.y;
    copy.style.clipPath = `inset(0 0 0 ${replaced * 100}%)`;
    chart.style.clipPath = `polygon(0 0, 100% 0, 100% ${caption}px, ${digitsX}px ${caption}px,
      ${digitsX}px ${row}px, ${waveX}px ${row}px, ${waveX}px 100%, 0 100%)`;
  });

  const contentSize = new ResizeObserver(() => {
    layout = undefined;
    scheduleMotion();
  });
  for (const node of [chapter, source, chart]) contentSize.observe(node);
  for (const plate of [previous, scene]) {
    const controls = plate.querySelector('.plate-controls');
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, () => {
      if (copy.isConnected) armed = false;
      settle();
    });
  }
}

function watchMistakes(previous, scene) {
  const chapter = scene.closest('.deep');
  const source = previous.querySelector('#s13-chart'), chart = scene.querySelector('#s14-chart');
  const copy = document.createElement('canvas'), ctx = copy.getContext('2d');
  copy.className = 's14-timing-copy';
  copy.setAttribute('aria-hidden', 'true');
  let layout, armed = false, lastTop = scrollY;

  function settle() {
    if (!copy.isConnected) return;
    copy.remove();
    source.style.removeProperty('--s14-timing-opacity');
    chart.style.removeProperty('--s14-signal-opacity');
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      const from = bounds(source, top), to = bounds(chart, top);
      const start = Math.max(from.y + from.h * .34 - height * .36, to.y - height * 1.24);
      const end = Math.max(start + height * .28, to.y + to.h * .5 - height * .62);
      layout = { from, to, start, end, stacked: matchMedia('(max-width: 860px)').matches };
      armed = false;
    }
    if (Math.abs(top - lastTop) > height * .42) armed = false;
    lastTop = top;
    const { from, to, start, end, stacked } = layout;
    if (top <= start) armed = true;
    if (!armed || top <= start || top >= end || chapter.querySelector('.s13-spectrum-copy')) return settle();

    const timing = source.timingTrace, signal = chart.errorTrace;
    if (!timing || !signal) return settle();
    const progress = stage(start, end, top);
    const carry = ease(0, stacked ? .58 : .92, progress);
    const fold = ease(.14, stacked ? .57 : .84, progress);
    const waveTop = timing.Y(1) - 5, waveBottom = timing.Y(0) - waveTop;
    const width = mix(timing.box.w, signal.box.w, carry);
    const x = mix(from.x + timing.box.x, to.x, carry);
    // On a narrow screen, let the line contract in place so it never moves across the copy.
    const y = mix(from.y + waveTop, stacked ? from.y + timing.Y(0) - signal.box.h : to.y, carry);
    const copyWidth = Math.ceil(Math.max(timing.box.w, signal.box.w));
    const copyHeight = Math.ceil(Math.max(waveBottom + 38, signal.box.h));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (copy.width !== Math.round(copyWidth * dpr) || copy.height !== Math.round(copyHeight * dpr)) {
      copy.width = Math.round(copyWidth * dpr);
      copy.height = Math.round(copyHeight * dpr);
      Object.assign(copy.style, { width: `${copyWidth}px`, height: `${copyHeight}px` });
    }
    if (!copy.isConnected) chapter.append(copy);
    copy.style.transform = `translate(${x}px, ${y - top}px)`;
    copy.style.opacity = ease(0, .18, progress) * (1 - ease(stacked ? .50 : .79, stacked ? .72 : .99, progress));
    source.style.setProperty('--s14-timing-opacity', 1 - .86 * ease(.02, .24, progress));
    chart.style.setProperty('--s14-signal-opacity', .22 + .78 * ease(stacked ? .57 : .74, .99, progress));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, copyWidth, copyHeight);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = signal.color;
    ctx.lineWidth = mix(2, 1.4, fold);
    ctx.beginPath();
    const divisions = 10 * timing.sent.length;
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const sample = timing.level[Math.min(timing.level.length - 1, Math.floor(t * timing.level.length))];
      const [, current] = signal.points[Math.round(t * (signal.points.length - 1))];
      const level = mix(timing.Y(sample) - waveTop, signal.Y(current), fold);
      if (i) ctx.lineTo(t * width, level);
      else ctx.moveTo(0, level);
    }
    ctx.stroke();
    ctx.globalAlpha = 1 - ease(.24, .67, progress);
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    timing.ticks.forEach((sample, i) => {
      ctx.fillStyle = timing.read[i] === timing.sent[i] ? '#1f7a4a' : '#b3261e';
      ctx.fillText(String(timing.read[i]), sample / timing.level.length * width, mix(waveBottom + 22, 8, fold));
    });
  });

  const contentSize = new ResizeObserver(() => { layout = undefined; scheduleMotion(); });
  for (const node of [chapter, previous, scene, source, chart]) contentSize.observe(node);
  for (const node of [previous.querySelector('.plate-controls'), scene]) {
    for (const event of ['focusin', 'pointerdown', 'input', 'click']) node.addEventListener(event, () => {
      if (copy.isConnected) armed = false;
      settle();
    });
  }
}

const blink = document.getElementById('deep-blink-word');
const partOne = document.getElementById('part-one');
if (blink?.animate && partOne) watchPartOne(blink, partOne);
const power = document.getElementById('part-one-power');
const closer = document.getElementById('s6');
const flipping = document.getElementById('s7');
if (closer && typeof closer.animate === 'function') {
  let settleCloser;
  if (flipping) watchFlipping(closer, flipping, () => settleCloser?.());
  if (power) settleCloser = watchCloser(power, closer);
}
const tuning = document.getElementById('s8');
if (flipping && tuning && typeof tuning.animate === 'function') watchTuning(flipping, tuning);
const metal = document.getElementById('s9');
if (tuning && metal) watchMetal(tuning, metal);
const pauses = document.getElementById('s10');
if (metal && pauses) watchPauses(metal, pauses);
const pausesLink = document.getElementById('s10-pauses');
const partTwo = document.getElementById('part-two');
if (pausesLink && partTwo) watchPartTwo(pausesLink, partTwo);
const soaking = document.getElementById('s11');
if (partTwo && soaking) watchSoaking(partTwo, soaking);
const whispering = document.getElementById('s12');
if (soaking && whispering) watchWhispering(soaking, whispering);
const counting = document.getElementById('s13');
if (whispering && counting) watchCounting(whispering, counting);
const mistakes = document.getElementById('s14');
if (counting && mistakes) watchMistakes(counting, mistakes);
