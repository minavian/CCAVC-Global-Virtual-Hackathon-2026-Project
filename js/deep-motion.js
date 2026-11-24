const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function blinkWord(heading) {
  if (reducedMotion.matches || typeof heading.animate !== 'function') return;

  const word = 'blink';
  const text = heading.lastChild;
  const start = text?.nodeType === Node.TEXT_NODE ? text.data.lastIndexOf(word) : -1;
  const chapter = heading.closest('.deep');
  if (start < 0 || !chapter) return;

  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, start + word.length);
  const rect = range.getBoundingClientRect();
  if (!rect.width || rect.bottom <= 0 || rect.top >= innerHeight) return;

  // The accent tracks the word in document space without touching the heading.
  const bounds = chapter.getBoundingClientRect();
  const accent = document.createElement('span');
  accent.className = 'deep-blink-accent';
  accent.setAttribute('aria-hidden', 'true');
  Object.assign(accent.style, {
    left: `${rect.left - bounds.left}px`,
    top: `${rect.top - bounds.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  chapter.append(accent);

  const blink = accent.animate([
    { opacity: 0, transform: 'scale(1.25, .1)' },
    { opacity: .46, transform: 'scale(1.25, 1)', offset: .22 },
    { opacity: 0, transform: 'scale(1.25, .1)', offset: .47 },
    { opacity: .28, transform: 'scale(1.25, .8)', offset: .68 },
    { opacity: 0, transform: 'scale(1.25, .1)' },
  ], { duration: 190, easing: 'ease-in-out' });
  blink.onfinish = blink.oncancel = () => accent.remove();
  return blink;
}

function settleTitle(element, travel, delay) {
  return element.animate([
    { opacity: 1, transform: 'none' },
    { opacity: .84, transform: `translateY(${travel}px)`, offset: .24, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    { opacity: 1, transform: 'none' },
  ], { delay, duration: 205 });
}

function watchPartOne(opener, part) {
  const label = part.firstElementChild;
  const title = part.querySelector('.deep-part-title');
  const sweep = part.querySelector('.deep-part-sweep');
  const animations = [];
  let cue;
  let armed;

  function stop() {
    for (const animation of animations) animation.cancel();
    animations.length = 0;
  }

  function reset() {
    stop();
    cue = Math.max(24, part.getBoundingClientRect().top + scrollY - innerHeight * .42);
    armed = scrollY < cue;
  }

  function onScroll() {
    const distance = scrollY - cue;
    if (distance < -20) armed = true;
    if (distance < 0 || distance > innerHeight * .4) stop();
    if (!armed || distance < 0) return;

    armed = false;
    if (distance > innerHeight * .24 || document.hidden) return;
    const blink = blinkWord(opener);
    if (!blink) return;

    animations.push(blink, sweep.animate([
      { opacity: 0, transform: 'translateY(-30%) scaleY(.1)' },
      { opacity: .15, transform: 'translateY(0) scaleY(.38)', offset: .48 },
      { opacity: 0, transform: 'translateY(27%) scaleY(.62)' },
    ], { delay: 151, duration: 170 }),
    settleTitle(label, 3, 185), settleTitle(title, 7, 205));
  }

  reset();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', reset);
  addEventListener('pageshow', reset);
  addEventListener('hashchange', reset);
  document.addEventListener('visibilitychange', reset);
  document.fonts?.ready.then(reset);
  reducedMotion.addEventListener('change', reset);
}

const scrollMotions = [];
const arrivalEase = 'cubic-bezier(.16, 1, .3, 1)';
let motionFrame = 0;
let measureMotions = true;

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
  const title = plate.querySelector('#s6-title');
  const controls = plate.querySelector('.plate-controls');
  const rows = controls.querySelectorAll('.s6-control');
  const chart = plate.querySelector('#s6-chart');
  const copy = plate.querySelectorAll('.plate-num, .s6-intro, .plate-readout, .plate-real, .s6-coupling');
  const wordMotions = [];
  let layout, traveledTitle, chartEntrance, chartStarted, armed, lastTop;

  function clearWords() {
    if (!traveledTitle) return;
    for (const { animation } of wordMotions) animation.cancel();
    wordMotions.length = 0;
    traveledTitle.remove();
    traveledTitle = null;
    source.classList.remove('s6-title-source');
  }

  function settle() {
    clearWords();
    chartEntrance?.cancel();
    chartEntrance = null;
  }

  function measure(top, height) {
    settle();
    const from = source.getBoundingClientRect(), to = title.getBoundingClientRect();
    const origin = chapter.getBoundingClientRect();
    const type = getComputedStyle(source);
    // The inline anchor's bounding box includes the font's leading.
    const fromTop = from.top + (from.height - parseFloat(type.lineHeight)) / 2;
    const start = Math.max(part.getBoundingClientRect().top + top + height * .12, fromTop + top - height * .36);
    const textEnd = Math.max(start + height * .26, to.top + top - height * .30);
    const chartCue = Math.max(start + (textEnd - start) * .76, chart.getBoundingClientRect().top + top - height * .80);
    layout = {
      start, textEnd, chartCue, end: Math.max(textEnd, chartCue) + height * .55,
      left: from.left - origin.left, top: fromTop - origin.top,
      shift: [to.left - from.left, to.top - fromTop],
      scale: parseFloat(getComputedStyle(title).fontSize) / parseFloat(type.fontSize),
    };
    armed = top <= start;
    lastTop = top;
    chartStarted = false;
  }

  function startWords() {
    traveledTitle = document.createElement('span');
    traveledTitle.className = 'deep-part-title s6-title-travel';
    traveledTitle.textContent = source.textContent;
    traveledTitle.setAttribute('aria-hidden', 'true');
    traveledTitle.style.left = `${layout.left}px`;
    traveledTitle.style.top = `${layout.top}px`;
    chapter.append(traveledTitle);
    source.classList.add('s6-title-source');

    function add(element, frames, start, end, easing = arrivalEase) {
      const animation = element.animate(frames, { duration: 1, easing, fill: 'both' });
      animation.pause();
      wordMotions.push({ animation, start, end });
    }

    const [x, y] = layout.shift;
    const gathered = `translate(${x}px, ${y}px) scale(${layout.scale})`;
    add(traveledTitle, [
      { transform: 'none', opacity: 1, filter: 'none', easing: 'cubic-bezier(.38, .05, .29, 1)' },
      { transform: gathered, opacity: 1, filter: 'none', offset: .83, easing: 'ease-in-out' },
      { transform: `${gathered} translateY(24%) scale(.93, .18)`, opacity: 0, filter: 'blur(2px)' },
    ], 0, .76, 'linear');
    const recede = [{ opacity: 1 }, { opacity: 0 }];
    add(source.parentElement, recede, .04, .38, 'ease-in-out');
    add(part.firstElementChild, recede, .04, .38, 'ease-in-out');
    const turnIn = [
      { opacity: 0, transform: 'perspective(260px) rotateX(-48deg) skewX(-7deg) translateY(5px)', filter: 'blur(3px)' },
      { opacity: 1, transform: 'none', filter: 'none' },
    ];
    add(title, turnIn, .69, .91, 'cubic-bezier(.36, .14, .23, 1)');
    const appear = [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }];
    for (const node of copy) add(node, appear, node.classList.contains('s6-intro') ? .72 : .78, 1);
    rows.forEach((row, i) => {
      const start = .73 + i * .035;
      add(row.firstElementChild, turnIn, start, start + .18);
      add(row.querySelector('input'), [
        { clipPath: 'inset(-5px 100% -5px -5px)' }, { clipPath: 'inset(-5px)' },
      ], start + .035, start + .23, 'cubic-bezier(.3, .05, .25, 1)');
    });
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) measure(top, height);
    const { start, textEnd, chartCue, end } = layout;
    const jumped = Math.abs(top - lastTop) > height * .6;
    lastTop = top;
    if (top <= start) {
      armed = !controls.contains(document.activeElement);
      chartStarted = false;
      return settle();
    }
    if (jumped) armed = false;
    if (!armed || top >= end) return settle();

    if (top < textEnd) {
      if (!traveledTitle) startWords();
      const progress = (top - start) / (textEnd - start);
      for (const motion of wordMotions) {
        motion.animation.currentTime = Math.min(1, Math.max(0, (progress - motion.start) / (motion.end - motion.start)));
      }
    } else clearWords();

    if (!chartStarted) {
      if (!chartEntrance) {
        chartEntrance = chart.animate([
          { opacity: 0, transform: 'translateY(clamp(48px, 10svh, 92px)) scale(.985)', easing: arrivalEase },
          { opacity: 1, transform: 'translateY(-13px)', offset: .76, easing: 'ease-out' },
          { opacity: 1, transform: 'none' },
        ], { duration: 720 });
        chartEntrance.pause();
        chartEntrance.currentTime = 0;
      }
      if (top >= chartCue) {
        chartStarted = true;
        chartEntrance.play();
      }
    }
  });

  for (const event of ['focusin', 'pointerdown', 'input']) controls.addEventListener(event, () => {
    armed = false;
    settle();
  });

  return () => {
    armed = false;
    settle();
  };
}

function watchFlipping(previous, plate, settlePrevious) {
  const chapter = plate.closest('.deep');
  const words = plate.querySelector('.plate-words');
  const title = plate.querySelector('#s7-title');
  const controls = plate.querySelector('.s7-control');
  const controlText = controls.querySelector('.s7-control-text');
  const speed = controls.querySelector('#s7-speed');
  const ranges = ['#s6-distance', '#s6-radius'].map(selector => previous.querySelector(selector));
  const sourceChart = previous.querySelector('#s6-chart');
  const targetChart = plate.querySelector('#s7-chart');
  const plot = document.createElement('canvas');
  plot.className = 's7-plot-copy';
  plot.setAttribute('aria-hidden', 'true');
  const ctx = plot.getContext('2d');
  const textMotions = [];
  const tracks = [];
  const clamp = n => Math.min(1, Math.max(0, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const stage = (start, end, value) => clamp((value - start) / (end - start));
  const ease = (start, end, value) => {
    const t = stage(start, end, value);
    return t * t * (3 - 2 * t);
  };
  let layout, lastTop, armed, scrollTop, plotProgress, chartShift;

  function bounds(node, top) {
    const rect = node.getBoundingClientRect();
    return { x: rect.left, y: rect.top + top, w: rect.width, h: rect.height };
  }

  function measure(top, height) {
    const toWords = bounds(words, top);
    const from = ranges.map(input => bounds(input, top));
    const to = bounds(speed, top);
    const target = bounds(targetChart, top);
    const stacked = Math.abs(toWords.x - from[0].x) < 1;
    const start = bounds(title, top).y - .98 * height;
    const textEnd = start + .075 * height;
    const tracksEnd = Math.max(textEnd + .14 * height, to.y + to.h - .96 * height);
    const end = Math.max(tracksEnd + .24 * height, target.y + target.h - .88 * height);
    const rail = from[0].x + from[0].w + (stacked ? 4 : 7);
    return { start, textEnd, tracksEnd, end, from, to, stacked, rail, width: innerWidth, height };
  }

  function clearTracks() {
    if (!tracks.length) return;
    for (const [i, track] of tracks.entries()) {
      track.remove();
      ranges[i].style.removeProperty('opacity');
    }
    tracks.length = 0;
  }

  function clearPlot() {
    if (!plot.isConnected) return;
    plot.remove();
    delete targetChart.drawHandoff;
  }

  function settle() {
    if (!textMotions.length) return;
    for (const animation of textMotions) animation.cancel();
    textMotions.length = 0;
    clearTracks();
    clearPlot();
    sourceChart.style.removeProperty('transform');
    for (const node of [controlText, speed, sourceChart, targetChart]) node.style.removeProperty('opacity');
  }

  function enter(top) {
    settlePrevious();
    layout.source = bounds(sourceChart, top);
    const shiftX = layout.stacked ? -8 : -44;
    const frames = [
      { opacity: 0, transform: `translate(${shiftX}px, 32px)`, easing: 'cubic-bezier(.32, .08, .33, 1)' },
      { opacity: 1, transform: 'translate(4px, -5px)', offset: .76, easing: 'ease-out' },
      { opacity: 1, transform: 'none' },
    ];
    for (const node of words.children) {
      if (node === controls) continue;
      const animation = node.animate(frames, { duration: 1, fill: 'both' });
      animation.pause();
      textMotions.push(animation);
    }
  }

  function moveTracks(progress) {
    controlText.style.opacity = ease(.45, .85, progress);
    const reveal = ease(.90, 1, progress);
    speed.style.opacity = reveal;
    if (progress <= 0 || progress >= 1) return clearTracks();
    const { from, to, rail, stacked, source } = layout;
    if (!tracks.length) {
      const origin = bounds(chapter, scrollTop);
      ranges.forEach((input, i) => {
        const track = document.createElement('input');
        track.type = 'range';
        track.min = 0;
        track.max = 1;
        track.step = 'any';
        track.className = 's7-track-copy';
        track.inert = true;
        track.setAttribute('aria-hidden', 'true');
        track.style.left = `${from[i].x - origin.x}px`;
        track.style.top = `${from[i].y - origin.y}px`;
        track.style.width = `${from[i].w}px`;
        tracks.push(track);
        chapter.append(track);
        input.style.opacity = 0;
      });
    }

    const gather = ease(0, .29, progress);
    const drop = ease(.26, .78, progress);
    const open = ease(.75, .93, progress);
    const railWidth = stacked ? layout.width - rail - 4 : Math.min(56, source.x - rail - 6);
    const middle = (from[0].y + from[1].y) / 2;
    const fraction = input => (input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min));
    tracks.forEach((track, i) => {
      const rect = from[i];
      const x = mix(mix(rect.x, rail, gather), to.x, open);
      const y = mix(mix(rect.y, middle + (i ? 3 : -3), gather), to.y, drop);
      const width = mix(mix(rect.w, railWidth, gather), to.w, open);
      track.value = mix(fraction(ranges[i]), fraction(speed), drop);
      track.style.transform = `translate(${x - rect.x}px, ${y - rect.y}px) scaleX(${width / rect.w})`;
      track.style.opacity = (1 - reveal) * (i ? 1 - ease(.54, .78, progress) : 1);
    });
  }

  function drawPlot(waves) {
    const { source, target, stacked, rail, width, height } = layout;
    const progress = plotProgress;
    const shape = ease(.035, .88, progress);
    const across = ease(.11, .78, progress);
    // The narrow route down the mobile margin keeps the curves out of the copy.
    const tuck = stacked ? ease(.04, .32, progress) * (1 - ease(.73, .90, progress)) : 0;
    const slide = stacked ? ease(.32, .73, progress) : ease(.48, .90, progress);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    waves.forEach(({ box: to, yAt, color }, index) => {
      const { box: from, points } = sourceChart.handoffPlots[index];
      const fullHeight = mix(from.h, to.h, slide);
      const h = fullHeight * mix(1, .4, tuck);
      const x = mix(mix(source.x + from.x, target.x + to.x, across), rail, tuck);
      const y = mix(source.y + from.y + chartShift, target.y + to.y, slide) - scrollTop + (fullHeight - h) / 2;
      const w = mix(mix(from.w, to.w, across), width - rail - 4, tuck);
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200, sample = u * (points.length - 1), first = Math.floor(sample);
        const [a, b] = points[first], [c, d] = points[Math.min(first + 1, points.length - 1)];
        const px = x + mix(mix(a, c, sample - first), u, shape) * w;
        const py = y + mix(mix(b, d, sample - first), yAt(u), shape) * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }

  watchScrollMotion((top, height, needsMeasure) => {
    if (reducedMotion.matches || document.hidden) return settle();
    if (needsMeasure || !layout) {
      settle();
      layout = measure(top, height);
      armed = top <= layout.start;
      lastTop = top;
    }
    const { start, textEnd, tracksEnd, end, stacked } = layout;
    const jumped = Math.abs(top - lastTop) > height * .55;
    lastTop = top;
    if (top <= start) {
      armed = true;
      return settle();
    }
    if (jumped) armed = false;
    if (!armed || top >= end) return settle();

    if (!textMotions.length) enter(top);
    scrollTop = top;
    for (const animation of textMotions) animation.currentTime = stage(start, textEnd, top);
    moveTracks(stage(textEnd, tracksEnd, top));
    plotProgress = stage(tracksEnd, end, top);
    chartShift = stacked ? 0 : top - start;
    sourceChart.style.transform = `translateY(${chartShift}px)`;
    const depart = ease(0, .13, plotProgress);
    const arrive = ease(.90, 1, plotProgress);
    sourceChart.style.opacity = 1 - depart;
    targetChart.style.opacity = arrive;
    if (plotProgress === 0) return clearPlot();
    if (!sourceChart.handoffPlots) return settle();

    if (!plot.isConnected) {
      layout.target = bounds(targetChart, top);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      plot.width = Math.round(layout.width * dpr);
      plot.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      chapter.append(plot);
      targetChart.drawHandoff = drawPlot;
    }
    plot.style.opacity = depart * (1 - arrive);
  });

  for (const input of [...ranges, speed]) {
    for (const event of ['focus', 'pointerdown', 'input']) input.addEventListener(event, () => {
      if (textMotions.length) armed = false;
      settle();
      if (event === 'input') {
        layout = null;
        scheduleMotion();
      }
    });
  }

  const copySize = new ResizeObserver(() => {
    layout = null;
    scheduleMotion();
  });
  copySize.observe(previous.querySelector('.plate-words'));
  copySize.observe(words);
}

const opener = document.getElementById('deep-title');
const partOne = document.getElementById('part-one');
if (opener && partOne) watchPartOne(opener, partOne);
const power = document.getElementById('part-one-power');
const closer = document.getElementById('s6');
const flipping = document.getElementById('s7');
if (closer && typeof closer.animate === 'function') {
  let settleCloser;
  if (flipping) watchFlipping(closer, flipping, () => settleCloser?.());
  if (power) settleCloser = watchCloser(power, closer);
}
