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
}

const opener = document.getElementById('deep-title');
const partOne = document.getElementById('part-one');
if (opener && partOne) watchPartOne(opener, partOne);
const power = document.getElementById('part-one-power');
const closer = document.getElementById('s6');
if (power && closer && typeof power.animate === 'function') watchCloser(power, closer);
