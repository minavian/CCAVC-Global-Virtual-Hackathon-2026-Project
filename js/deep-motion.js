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
  let layout, lastTop, armed, position, waves;

  function measure(top, height) {
    const word = bounds(flipping, top), heading = bounds(title, top);
    const from = bounds(sourceChart, top), to = bounds(targetChart, top);
    const start = Math.max(bounds(previous, top).y, word.y - height * .24);
    const flipEnd = Math.max(start + height * .14, word.y + word.h - height * .04);
    const reveal = Math.max(start + height * .065, heading.y - height * .975);
    const gatherAt = Math.max(start + height * .045, from.y + from.h - height * .87);
    const gatherEnd = gatherAt + height * .19;
    const pluck = Math.max(gatherEnd + height * .19, to.y + to.h * .59 - height * .73);
    const end = Math.max(pluck + height * .22, reveal + height * .205);
    return { start, flipEnd, reveal, gatherAt, gatherEnd, pluck, end, from, to, width: innerWidth, height,
      stacked: Math.abs(from.x - to.x) < 1 };
  }

  function startWords() {
    function turn(node, frames, start, end) {
      const animation = node.animate(frames, { duration: 1, fill: 'both' });
      animation.pause();
      turns.push({ animation, start, end });
    }

    const { start, flipEnd, reveal, height } = layout;
    const down = [{ transform: 'none', opacity: 1, easing: 'ease-in' },
      { transform: 'perspective(260px) rotateX(-88deg)', opacity: 0 }];
    turn(flipping, [down[0],
      { transform: 'perspective(260px) rotateX(14deg)', opacity: 1, offset: .28, easing: 'ease-in' },
      down[1]], start, mix(start, flipEnd, .58));
    [...flipping.parentElement.children].slice(0, -1).reverse().forEach((word, i) => {
      const offset = .24 + i * .11;
      turn(word, down, mix(start, flipEnd, offset), mix(start, flipEnd, offset + .42));
    });
    [...title.children].forEach((word, i) => {
      const cue = reveal + i * height * .035;
      turn(word, [
        { opacity: 0, transform: 'perspective(260px) rotateX(76deg)', easing: arrivalEase },
        { opacity: 1, transform: 'perspective(260px) rotateX(-5deg)', offset: .78, easing: 'ease-out' },
        { opacity: 1, transform: 'none' },
      ], cue, cue + height * .135);
    });
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
    for (const { animation } of turns) animation.cancel();
    turns.length = 0;
    clearPlot();
  }

  function paintPlot() {
    const curve = targetChart.resonanceCurve;
    if (!curve) return;
    const { from, to, width, height, stacked, gatherAt, gatherEnd, pluck, end } = layout;
    const merge = ease(gatherAt, gatherEnd, position);
    if (merge < 1 && !waves) return;

    const travel = ease(gatherEnd, pluck, position);
    const release = stage(pluck, end, position);
    const shape = ease(.30, .84, release);
    const leave = ease(0, .17, merge), arrive = ease(.79, 1, release);
    const { box, points, X, Y, color } = curve;
    const middle = mix(from.y + from.h * .52, to.y + box.y + box.h * .72, travel) - position;
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
          const y = mix(from.y + area.y + area.h * yAt(u) - position, middle, merge);
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      return;
    }

    const pull = ease(0, .26, release), spring = ease(.26, .55, release);
    const bend = 19 * pull * (1 - spring);
    const chipX = left + span / 2;
    const chipY = middle + mix(-33, bend, pull) - 22 * spring;
    capacitor.style.opacity = ease(0, .11, release) * (1 - spring);
    capacitor.style.transform = `translate(${chipX - 21}px, ${chipY - 9}px) rotate(${mix(-24, 9, pull)}deg) scale(.62)`;

    ctx.save();
    if (release > 0) {
      ctx.beginPath();
      ctx.rect(to.x, to.y - position, to.w, to.h);
      ctx.clip();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = mix(2, 2.2, shape);
    ctx.beginPath();
    points.forEach(([frequency, volts], i) => {
      const u = i / (points.length - 1);
      const x = mix(left + span * u, to.x + X(frequency), shape);
      const y = mix(middle + bend * (1 - Math.abs(2 * u - 1)), to.y + Y(volts) - position, shape);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function copyWaves(drawn) {
    waves = drawn;
    paintPlot();
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      settle();
      layout = measure(top, height);
      armed = top <= layout.start;
      lastTop = top;
    }
    const jumped = Math.abs(top - lastTop) > height * .55;
    lastTop = top;
    if (top <= layout.start) {
      armed = true;
      return settle();
    }
    if (jumped) armed = false;
    if (!armed || top >= layout.end) return settle();

    if (!turns.length) startWords();
    for (const { animation, start, end } of turns) animation.currentTime = stage(start, end, top);
    if (top < layout.gatherAt || sourceChart.drawHandoff) return clearPlot();

    position = top;
    if (!plot.isConnected) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      plot.width = Math.round(layout.width * dpr);
      plot.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      chapter.append(plot, capacitor);
    }
    if (top < layout.gatherEnd) sourceChart.drawOutgoingHandoff = copyWaves;
    else delete sourceChart.drawOutgoingHandoff;
    paintPlot();
  });

  for (const scene of [previous, plate]) {
    const controls = scene.querySelector('.plate-controls');
    for (const event of ['focusin', 'pointerdown', 'input', 'change']) controls.addEventListener(event, () => {
      armed = false;
      settle();
    });
  }
  const copySize = new ResizeObserver(() => {
    layout = null;
    scheduleMotion();
  });
  for (const scene of [previous, plate]) copySize.observe(scene.querySelector('.plate-words'));
}

function watchMetal(previous, plate) {
  const chapter = plate.closest('.deep');
  const source = previous.querySelector('#s8-chart'), target = plate.querySelector('#s9-chart');
  const copy = plate.querySelector('.plate-words'), figure = target.parentElement;
  const cue = figure.querySelector('#s9-metal-action');
  const plot = document.createElement('canvas');
  plot.className = 's9-plot-copy';
  plot.setAttribute('aria-hidden', 'true');
  const ctx = plot.getContext('2d');
  let layout, lastTop, armed;

  function measure(top, height) {
    const from = bounds(source, top), to = bounds(target, top);
    const start = from.y - height * .06;
    const curled = start + height * .19;
    const end = Math.max(curled + height * .32, to.y + to.h - height * .82);
    const unfold = Math.max(curled + height * .07, end - height * .21);
    const reveal = Math.max(start, bounds(copy, top).y - height * .94);
    return { from, to, start, curled, unfold, end, reveal, height, width: innerWidth,
      stacked: matchMedia('(max-width: 860px)').matches };
  }

  function settle() {
    if (!plot.isConnected) return;
    plot.remove();
    source.style.removeProperty('--s9-source-opacity');
    target.style.removeProperty('opacity');
    copy.style.removeProperty('opacity');
    copy.style.removeProperty('transform');
    cue.style.removeProperty('--s9-cue-drop');
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

  function paint(top) {
    const { from, to, width, height, stacked, start, curled, unfold, end, reveal } = layout;
    const { box, points, X, Y, color } = source.resonanceCurve;
    const cut = (points.length - 1) / 2;
    const curl = ease(start + height * .025, curled, top), flight = ease(curled, unfold, top);
    const bloom = stage(unfold, end, top);
    const leave = ease(start, start + height * .06, top), arrive = ease(.76, 1, bloom);
    const words = ease(reveal, reveal + height * .16, top);
    source.style.setProperty('--s9-source-opacity', 1 - leave);
    target.style.opacity = arrive;
    plot.style.opacity = leave * (1 - arrive);
    copy.style.opacity = mix(.87, 1, words);
    copy.style.transform = stacked ? `translateY(${7 * (1 - words)}px)` : `translateX(${18 * (1 - words)}px)`;
    cue.style.setProperty('--s9-cue-drop', `${Math.sin(Math.PI * ease(.72, 1, bloom)) * 4}px`);
    ctx.clearRect(0, 0, width, height);

    // On narrow screens the loop stays beside the copy until it reaches the illustration.
    const margin = width - to.x - to.w;
    const centerX = stacked ? width - margin / 2 : to.x + to.w / 2;
    const centerY = stacked ? mix(height * .51, to.y + to.h * .14 - top, flight) : height * mix(.48, .57, flight);
    const radius = stacked ? margin * .37 : Math.min(23, to.w * .045);
    const angle = -Math.PI / 2 + flight * .6;
    const loop = (side, u) => {
      const turn = angle + side * Math.PI * u;
      return [centerX + radius * Math.cos(turn), centerY + radius * Math.sin(turn)];
    };

    if (!bloom) {
      const splitX = box.x + box.w / 2;
      const gap = 14 * ease(0, .25, curl) * (1 - ease(.35, .9, curl));
      for (const side of [-1, 1]) {
        stroke(u => {
          const [frequency, volts] = sample(points, cut + side * cut * u);
          const x = u === 0 ? splitX : X(frequency);
          const [lx, ly] = loop(side, u);
          return [mix(from.x + x + side * gap * (1 - u / 2), lx, curl), mix(from.y + Y(volts) - top, ly, curl)];
        }, color, 1, mix(2.2, 1.8, curl));
      }
      return;
    }

    const field = target.metalField;
    const last = field.lines.length - 1;
    for (let i = last; i >= 0; i--) {
      const line = field.lines[i];
      const delay = (last - i) * .105;
      const growth = ease(delay, .91, bloom);
      const visibility = i === last ? 1 : ease(delay, delay + .14, bloom);
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

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      settle();
      layout = measure(top, height);
      armed = top <= layout.start;
      lastTop = top;
    }
    if (Math.abs(top - lastTop) > height * .55) armed = false;
    lastTop = top;
    if (top <= layout.start) {
      armed = true;
      return settle();
    }
    if (!armed || top >= layout.end || !source.resonanceCurve || !target.metalField || chapter.querySelector('.s8-plot-copy')) return settle();

    if (!plot.isConnected) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      plot.width = Math.round(layout.width * dpr);
      plot.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      chapter.append(plot);
    }
    paint(top);
  });

  function interrupt() {
    if (plot.isConnected) armed = false;
    settle();
  }
  for (const controls of [previous.querySelector('.plate-controls'), figure]) {
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, interrupt);
  }
  const contentSize = new ResizeObserver(() => {
    layout = null;
    scheduleMotion();
  });
  for (const node of [source, figure, copy]) contentSize.observe(node);
}

function watchPauses(previous, plate) {
  const chapter = plate.closest('.deep');
  const metal = previous.querySelector('#s9-metal'), metalAction = previous.querySelector('#s9-metal-action');
  const surface = metal.querySelector('.s9-metal-surface');
  const field = previous.querySelector('#s9-chart');
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
  let layout, lastTop, armed, active, from;

  function measure(top, height) {
    const oldTitle = bounds(previousTitle, top);
    const newTitle = bounds(title, top);
    const middle = (oldTitle.y + oldTitle.h + newTitle.y - height) / 2;
    const textStart = middle - height * .085, textEnd = middle + height * .15;
    const to = bounds(track, top), chart = bounds(plot, top);
    const carryStart = Math.max(middle - height * .17, bounds(field, top).y - height * .22);
    const carryEnd = Math.max(carryStart + height * .26, to.y + to.h / 2 - height * .70);
    // Start once both flat traces fit on screen, even in the taller desktop plot.
    const plotStart = chart.y + chart.h * .56 - height * .96, plotEnd = chart.y - height * .26;
    return { middle, textStart, textEnd, to, carryStart, carryEnd, plotStart, plotEnd,
      oldWidth: oldWords.clientWidth, newWidth: words.clientWidth, width: innerWidth,
      stacked: matchMedia('(max-width: 860px)').matches,
      start: Math.min(textStart, carryStart, plotStart), end: Math.max(textEnd, carryEnd, plotEnd) };
  }

  function clearPiece() {
    if (!piece.isConnected) return;
    piece.remove();
    surface.style.removeProperty('opacity');
    metalAction.style.removeProperty('opacity');
  }

  function settle() {
    if (!active) return;
    active = false;
    clearPiece();
    echo.remove();
    slider.style.removeProperty('--s10-track-opacity');
    for (const copy of [oldWords, words]) {
      for (const name of ['wipe', 'blur', 'shift']) copy.style.removeProperty(`--s10-word-${name}`);
    }
    plot.setPauseHandoff?.(1, 1, 1);
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

  function carry(top) {
    const { to, carryStart, carryEnd, stacked, width } = layout;
    const progress = stage(carryStart, carryEnd, top);
    const arrival = ease(.92, 1, progress);
    slider.style.setProperty('--s10-track-opacity', arrival);
    if (progress === 0 || progress === 1) return clearPiece();

    if (!piece.isConnected) {
      from = bounds(surface, top);
      piece.style.width = `${from.w}px`;
      piece.style.height = `${from.h}px`;
      chapter.append(piece);
      surface.style.opacity = '0';
    }
    const travel = ease(0, .97, progress);
    // Turn edge-on at the mobile gutter so the plate can pass beside the words.
    const tuck = stacked ? ease(.08, .4, travel) * (1 - ease(.62, .96, travel)) : 0;
    // On desktop, drop past the copy before crossing into the control's column.
    const across = stacked ? travel : ease(.56, .97, progress);
    const down = stacked ? travel : ease(0, .68, progress);
    const margin = width - to.x - to.w;
    const edgeWidth = Math.max(24, margin * .68);
    const x = mix(mix(from.x + from.w / 2, to.x + to.w / 2, across), width - edgeWidth / 2 - 4, tuck);
    const y = mix(from.y + from.h / 2 - carryStart, to.y + to.h / 2 - top, down);
    const w = mix(mix(from.w, to.w, travel), edgeWidth, tuck);
    const h = mix(from.h, to.h, travel);
    const angle = -5 * Math.sin(Math.PI * travel);
    piece.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${w / from.w}, ${h / from.h}) translate(-50%, -50%)`;
    piece.style.opacity = 1 - arrival;
    metalAction.style.opacity = 1 - .45 * ease(0, .35, progress);
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      settle();
      layout = measure(top, height);
      armed = top <= layout.start;
      lastTop = top;
    }
    const jumped = Math.abs(top - lastTop) > height * .55;
    const { start, end, middle, textStart, textEnd, oldWidth, newWidth, plotStart, plotEnd } = layout;
    lastTop = top;
    if (top <= start) {
      armed = true;
      return settle();
    }
    if (jumped || document.activeElement === cap || document.activeElement === partLink) armed = false;
    if (!armed || top >= end || chapter.querySelector('.s9-plot-copy')) return settle();

    active = true;
    const overlap = ease(middle - height * .065, middle, top) * (1 - ease(middle, middle + height * .065, top));
    const incoming = ease(middle - height * .075, textEnd, top);
    wipe(oldWords, oldWidth, ease(textStart, middle + height * .08, top), false, 1.35 * overlap,
      Math.min(42, height * .045) * ease(textStart, middle, top));
    wipe(words, newWidth, incoming, true, 1.35 * overlap, -Math.min(72, height * .08) * (1 - ease(middle, textEnd, top)));
    if (overlap) {
      if (!echo.isConnected) title.append(echo);
      echo.style.maskImage = wipeMask(newWidth, incoming, false);
      echo.style.opacity = .22 * overlap;
    } else echo.remove();
    carry(top);
    const progress = stage(plotStart, plotEnd, top);
    plot.setPauseHandoff?.(ease(0, .28, progress), ease(.28, .81, progress), ease(.81, 1, progress));
  });

  for (const control of [metal, metalAction, partLink, cap]) {
    for (const event of ['focus', 'pointerdown', 'input']) control.addEventListener(event, () => {
      if (active) armed = false;
      settle();
    });
  }
  const contentSize = new ResizeObserver(() => {
    layout = null;
    scheduleMotion();
  });
  for (const node of [oldWords, words, field, plot]) contentSize.observe(node);
}

function watchPartTwo(source, part) {
  const plate = source.closest('.plate'), chapter = part.closest('.deep');
  const word = source.firstElementChild, title = part.querySelector('.deep-part-title');
  const ripple = document.createElement('span'), wave = document.createElement('span');
  ripple.className = 'part-two-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.append(wave);
  let layout, lastTop, armed, followedFrom;

  function settle() {
    if (!ripple.isConnected) return;
    ripple.remove();
    word.style.removeProperty('transform');
  }

  function measure(top, height) {
    const from = bounds(source, top), to = bounds(title, top);
    const x = from.x + from.w / 2, y = from.y + from.h / 2;
    // Keep the source visible for the press, including when the plot stacks below it.
    const cue = Math.max(bounds(plate, top).y + height * .05, y - height * .24);
    const reach = Math.hypot(to.x + to.w / 2 - x, to.y + to.h / 2 - y) + height * .16;
    return { x, y, cue, reach, end: bounds(part, top).y };
  }

  source.addEventListener('click', event => {
    if (reducedMotion.matches || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    followedFrom = scrollY;
    layout = undefined;
    // Let the native fragment link set the hash, history and focus.
    const root = document.documentElement;
    root.classList.add('part-two-link-scroll');
    requestAnimationFrame(() => root.classList.remove('part-two-link-scroll'));
  });

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) {
      followedFrom = undefined;
      return settle();
    }
    if (needsMeasure || !layout) {
      settle();
      layout = measure(top, height);
      armed = top <= layout.cue;
      lastTop = top;
    }
    const { x, y, cue, reach, end } = layout;
    const jumped = Math.abs(top - lastTop) > height * .5;
    lastTop = top;
    if (followedFrom !== undefined && (jumped || top < followedFrom || top >= end || location.hash !== source.hash)) {
      followedFrom = undefined;
    }
    if (top <= cue) armed = true;
    else if (jumped) armed = false;
    const start = followedFrom ?? cue;
    if ((!armed && followedFrom === undefined) || top <= start || top >= end) return settle();

    const progress = stage(start, end, top);
    const press = ease(0, .043, progress) * (1 - ease(.048, .115, progress));
    word.style.transform = press ? `translateY(${press * .05}em) scale(${1 - press * .06}, ${1 - press * .11})` : '';
    const radius = mix(18, reach, stage(.075, .98, progress));
    wave.style.transform = `translate3d(${x}px, ${y - top}px, 0) scale(${radius / 64}) translate(-50%, -50%)`;
    wave.style.opacity = .22 * ease(.055, .17, progress) * (1 - ease(.83, 1, progress));
    if (!ripple.isConnected) chapter.append(ripple);
  });

  const contentSize = new ResizeObserver(() => {
    layout = undefined;
    scheduleMotion();
  });
  contentSize.observe(chapter);
  contentSize.observe(source.closest('.plate-words'));
}

function watchSoaking(source, scene) {
  const chapter = scene.closest('.deep'), part = source.closest('.deep-part');
  const target = scene.querySelector('#s11-soaking-s');
  const plot = scene.querySelector('#s11-chart'), scan = scene.querySelector('.s11-scan');
  const toggle = scene.querySelector('#s11-switch'), readout = scene.querySelector('.plate-readout');
  const letter = document.createElement('span'), lower = document.createElement('span'), upper = document.createElement('span');
  letter.className = 's11-letter-flight';
  letter.setAttribute('aria-hidden', 'true');
  lower.textContent = source.textContent;
  upper.textContent = target.textContent;
  letter.append(lower, upper);

  let layout, lastTop, armed, entered, introStart = null, entrance = 1;
  let blend = Number(toggle.checked), destination = blend, blendFrom, blendStart, flip;
  let frame = 0, visible = false, scanStart = null, scannedTrace, scanPaused = false;
  const motionAllowed = () => !reducedMotion.matches && !document.hidden;
  const updatePlot = () => plot.setAnswerMotion?.(ease(0, .28, entrance), ease(.28, 1, entrance), blend);

  function clearLetter() {
    if (!letter.isConnected) return;
    letter.remove();
    source.classList.remove('s11-letter-in-flight');
    target.classList.remove('s11-letter-in-flight');
  }

  function settleEntrance() {
    clearLetter();
    introStart = null;
    entrance = 1;
    updatePlot();
  }

  function measure(top, height) {
    const from = bounds(source, top), to = bounds(target, top);
    const fromType = getComputedStyle(source), toType = getComputedStyle(target);
    const size = parseFloat(fromType.fontSize);
    const start = Math.max(bounds(part, top).y, from.y + from.h / 2 - height * .42);
    const end = Math.max(start + height * .24, to.y + to.h / 2 - height * .64);
    const cue = Math.max(end, bounds(plot, top).y - height * .82);
    const deadline = scene.getBoundingClientRect().bottom + top;
    letter.style.fontSize = fromType.fontSize;
    return { from, to, start, end, cue, deadline, scale: parseFloat(toType.fontSize) / size };
  }

  function carryLetter(top, height) {
    const { from, to, start, end, scale } = layout;
    const progress = stage(start, end, top), travel = ease(0, 1, progress);
    const x = mix(from.x + from.w / 2, to.x + to.w / 2, travel);
    const y = mix(from.y + from.h / 2, to.y + to.h / 2, travel) - top;
    const arc = Math.sin(Math.PI * progress);
    const size = mix(1, scale, ease(.17, 1, progress)) * (1 + .28 * arc);
    const capital = ease(.3, .72, progress);
    letter.style.transform = `translate3d(${x}px, ${y - height * .045 * arc}px, 0) translate(-50%, -50%) scale(${size})`;
    letter.style.color = `color-mix(in srgb, var(--copper) ${30 * arc}%, var(--ink))`;
    lower.style.opacity = 1 - capital;
    upper.style.opacity = capital;
    lower.style.transform = `scaleY(${mix(1, 1.24, capital)})`;
    upper.style.transform = `scaleY(${mix(.8, 1, capital)})`;
    if (!letter.isConnected) {
      chapter.append(letter);
      source.classList.add('s11-letter-in-flight');
      target.classList.add('s11-letter-in-flight');
    }
  }

  function hideScan() {
    scan.hidden = true;
    scanStart = null;
  }

  function requestFrame() {
    if (!frame && visible && motionAllowed() && (!scanPaused || introStart !== null || blend !== destination)) {
      frame = requestAnimationFrame(animate);
    }
  }

  plot.pauseAnswerScan = paused => {
    scanPaused = paused;
    if (paused) hideScan();
    else requestFrame();
  };

  function animate(now) {
    frame = 0;
    if (!visible || !motionAllowed()) return;
    if (introStart !== null) {
      entrance = stage(0, 620, now - introStart);
      if (entrance === 1) introStart = null;
    }
    if (blend !== destination) blend = mix(blendFrom, destination, ease(0, 280, now - blendStart));
    updatePlot();

    const trace = plot.answerTrace;
    if (!scanPaused && entrance === 1 && blend === destination && trace?.blend === blend) {
      const { box, points, X, Y } = trace;
      scanStart ??= now;
      const progress = (now - scanStart) % 2800 / 2800;
      const index = progress * (points.length - 1), i = Math.floor(index);
      const value = mix(points[i][1], points[i + 1][1], index - i);
      if (trace !== scannedTrace) {
        scan.style.blockSize = `${box.h}px`;
        scannedTrace = trace;
      }
      scan.style.transform = `translate3d(${X(index)}px, ${box.y}px, 0)`;
      scan.style.setProperty('--s11-scan-point', `${Y(value) - box.y}px`);
      scan.style.opacity = .86 * ease(0, .055, progress) * (1 - ease(.89, 1, progress));
      scan.hidden = false;
    } else hideScan();
    requestFrame();
  }

  function refreshLoop() {
    if (visible && motionAllowed()) return requestFrame();
    cancelAnimationFrame(frame);
    frame = 0;
    hideScan();
    blend = destination;
    if (introStart !== null || !motionAllowed()) settleEntrance();
    else updatePlot();
    if (!motionAllowed()) flip?.cancel();
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (!motionAllowed()) return settleEntrance();
    if (needsMeasure || !layout) {
      layout = measure(top, height);
      armed = top <= layout.start;
      lastTop = top;
    }
    const { start, end, cue, deadline } = layout;
    const jumped = Math.abs(top - lastTop) > height * .48;
    lastTop = top;
    if (top <= start) {
      armed = !scene.contains(document.activeElement);
      entered = false;
      return settleEntrance();
    }
    if (jumped || top >= deadline) armed = false;
    if (!armed) return settleEntrance();

    if (top < end) carryLetter(top, height);
    else clearLetter();
    if (!entered) {
      entrance = 0;
      updatePlot();
      if (top >= cue) {
        entered = true;
        introStart = performance.now();
        requestFrame();
      }
    }
  });

  for (const event of ['focusin', 'pointerdown', 'input']) scene.addEventListener(event, ({ target }) => {
    if (!target.closest('.plate-controls')) return;
    armed = false;
    settleEntrance();
  });
  toggle.addEventListener('change', () => {
    destination = Number(toggle.checked);
    flip?.cancel();
    if (motionAllowed()) flip = readout.animate?.([
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
  document.addEventListener('visibilitychange', refreshLoop);
  reducedMotion.addEventListener('change', refreshLoop);

  const contentSize = new ResizeObserver(() => {
    layout = undefined;
    scheduleMotion();
  });
  contentSize.observe(chapter);
  contentSize.observe(scene);
}

function watchWhispering(previous, scene) {
  const chapter = scene.closest('.deep');
  const source = previous.querySelector('#s11-title'), title = scene.querySelector('#s12-title');
  const sourceChart = previous.querySelector('#s11-chart'), chart = scene.querySelector('#s12-chart');
  const vortex = document.createElement('div');
  vortex.className = 's12-vortex';
  vortex.setAttribute('aria-hidden', 'true');
  const wave = document.createElement('canvas');
  wave.className = 's12-wave-copy';
  const ctx = wave.getContext('2d');

  const bands = Array.from({ length: 5 }, () => {
    const band = document.createElement('div');
    band.className = 's12-vortex-band';
    const faces = Array.from({ length: 2 }, () => {
      const face = document.createElement('div'), text = document.createElement('span');
      face.className = 's12-vortex-face';
      text.className = 's12-vortex-type';
      face.append(text);
      band.append(face);
      return face;
    });
    vortex.append(band);
    return { band, faces };
  });
  let layout, copiedTrace;
  let armed = false, lastTop = scrollY;

  function headingBounds(heading, top) {
    const rect = bounds(heading, top), range = document.createRange();
    range.selectNodeContents(heading);
    return { ...rect, stripWidth: Math.min(rect.w, range.getBoundingClientRect().width + 3) };
  }

  function measure(top, height) {
    const stacked = matchMedia('(max-width: 860px)').matches;
    const to = headingBounds(title, top), from = stacked ? to : headingBounds(source, top);
    const start = stacked ? to.y - height * .81 : from.y + from.h / 2 - height * .21;
    const end = stacked ? to.y - height * .51 : Math.max(start + height * .38, to.y + to.h / 2 - height * .68);
    const captions = [stacked ? title.textContent : source.textContent, title.textContent];
    vortex.classList.toggle('s12-vortex--stacked', stacked);
    bands.forEach(({ faces }, i) => {
      faces.forEach((face, side) => {
        const rect = side === 0 ? from : to, h = rect.h / bands.length;
        face.firstChild.textContent = captions[side];
        Object.assign(face.style, { width: `${rect.stripWidth}px`, height: `${h}px` });
        Object.assign(face.firstChild.style, { width: `${rect.w}px`, top: `${-i * h}px` });
      });
    });
    return { from, to, start, end, stacked, width: innerWidth, fromChart: bounds(sourceChart, top), toChart: bounds(chart, top) };
  }

  function settle() {
    if (!vortex.isConnected) return;
    vortex.remove();
    source.classList.remove('s12-title-in-flight');
    title.classList.remove('s12-title-in-flight');
    chart.style.removeProperty('opacity');
    sourceChart.pauseAnswerScan?.(false);
  }

  function turnHeading(top, height, progress) {
    const { from, to, stacked, width } = layout;
    const radius = Math.min(stacked ? 72 : 180, width * .23);
    const hubY = stacked ? to.y - top + to.h / 2 - 18 : height * .45;
    const gather = ease(0, .35, progress), open = ease(.53, .94, progress);
    // Move the stack together so the stagger changes the turn without scattering the bands.
    const centerX = mix(mix(from.x + from.stripWidth / 2, width / 2, gather), to.x + to.stripWidth / 2, open);
    const centerY = mix(mix(from.y + from.h / 2 - top, hubY, ease(.17, .44, progress)),
      to.y + to.h / 2 - top, ease(.45, .73, progress));
    bands.forEach(({ band }, i) => {
      const offset = (i + .5) / bands.length - .5, delay = i * .055;
      const turn = ease(delay, .78 + delay, progress), angle = Math.PI * turn;
      const fold = Math.sin(angle), orbit = angle + offset * 1.8;
      const x = centerX + radius * offset * Math.sin(orbit) * fold;
      const y = centerY + mix(from.h, to.h, open) * offset * (1 + .68 * fold);
      const depth = radius * .64 * Math.cos(orbit) * fold;
      const roll = (offset * 44 - 6) * fold;
      band.style.setProperty('--s12-fold', fold);
      band.style.transform = `translate3d(${x}px, ${y}px, ${depth}px) rotateZ(${roll}deg) rotateY(${turn * 180}deg)`;
    });
  }

  function carryWave(top, height, progress) {
    const trace = sourceChart.answerTrace, spectrum = chart.spectrumTrace;
    if (layout.stacked || !trace || !spectrum) return;
    const { box, X, Y } = trace;
    if (trace !== copiedTrace) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      wave.width = Math.round(box.w * dpr);
      wave.height = Math.round(box.h * dpr);
      Object.assign(wave.style, { width: `${box.w}px`, height: `${box.h}px` });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = trace.color;
      ctx.beginPath();
      trace.points.forEach(([sample, current], i) => {
        const x = X(sample) - box.x, y = Y(current) - box.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      copiedTrace = trace;
    }

    const { fromChart, toChart } = layout;
    const [frequency, strength] = spectrum.carrier;
    const travel = ease(.04, .72, progress), pivot = Y(1) - box.y;
    const x = mix(fromChart.x + box.x + box.w / 2, toChart.x + spectrum.X(frequency), travel);
    const y = mix(fromChart.y + Y(1), toChart.y + spectrum.Y(strength), travel) - top;
    const arc = Math.sin(Math.PI * travel) * Math.min(52, height * .064);
    wave.style.transform = `translate(${x}px, ${y + arc}px) scale(${mix(1, .065, travel)}, ${mix(1, .19, travel)}) translate(${-box.w / 2}px, ${-pivot}px)`;
    wave.style.opacity = .86 * ease(0, .13, progress) * (1 - ease(.53, .82, progress));
    chart.style.opacity = ease(.38, .96, progress);
    if (!wave.isConnected) vortex.prepend(wave);
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) layout = measure(top, height);
    if (needsMeasure || Math.abs(top - lastTop) > height * .42) armed = false;
    lastTop = top;
    if (top <= layout.start) armed = true;
    if (!armed || top <= layout.start || top >= layout.end) return settle();

    if (!vortex.isConnected) {
      // The mobile stack leaves the old title in place and turns the new title in its own row.
      if (!layout.stacked) {
        source.classList.add('s12-title-in-flight');
        sourceChart.pauseAnswerScan?.(true);
      }
      title.classList.add('s12-title-in-flight');
      chapter.append(vortex);
    }
    const progress = stage(layout.start, layout.end, top);
    turnHeading(top, height, progress);
    carryWave(top, height, progress);
  });

  const copy = [previous, scene].map(plate => plate.querySelector('.plate-words'));
  const contentSize = new ResizeObserver(() => {
    layout = undefined;
    scheduleMotion();
  });
  for (const element of [chapter, ...copy]) contentSize.observe(element);
  for (const controls of [previous, scene].flatMap(plate => [...plate.querySelectorAll('.plate-controls')])) {
    for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, () => {
      if (vortex.isConnected) armed = false;
      settle();
    });
  }
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
const answerLetter = document.getElementById('part-two-answer-s');
const soaking = document.getElementById('s11');
if (answerLetter && soaking) watchSoaking(answerLetter, soaking);
const whispering = document.getElementById('s12');
if (soaking && whispering) watchWhispering(soaking, whispering);
const counting = document.getElementById('s13');
if (whispering && counting) watchCounting(whispering, counting);
const mistakes = document.getElementById('s14');
if (counting && mistakes) watchMistakes(counting, mistakes);
