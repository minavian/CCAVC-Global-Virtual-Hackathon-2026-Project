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

const opener = document.getElementById('deep-title');
const partOne = document.getElementById('part-one');
if (opener && partOne) watchPartOne(opener, partOne);
