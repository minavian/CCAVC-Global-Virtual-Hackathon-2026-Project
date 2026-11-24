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
  let layout, lastTop, armed, scrollTop, plotProgress, chartShift;

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
