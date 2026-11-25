// The card intro's hold (index.html `.intro`). The page scrolls as usual, but until the visitor has
// reached the tap's last step (main.js `completed`) it won't go past "Here's how: drag the card to
// the reader": the wheel, a swipe up and the keys that scroll down go nowhere there, and whatever
// else moves the page further (the scroll bar, a link) brings it back. Each try calls `nudge`
// (main.js), which shows what to do next. Not in presenter mode (js/present.js), and not for a
// visitor who came in below the intro (a link to a later section) until they come up into it.
// Started by main.js. See EXPLAINED.md.
// (It replaced autoplay.js on 2026-11-26: the scroll assist that played one animation per scroll
// from the top of the page to the card's drop. That file is in the git history, last at ec55bb0.)
import { PACE, SCROLL_SCREENS } from './timeline.js?v=3';

// Where "Here's how" holds still, in screens of the intro's scroll at the first pace (the
// `scrollFrames` of timeline.js): the page may go to its end, no further.
const HERE_ENDS = 9.27;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End']);    // and space

export function hold({ experience, stage, done = () => true, nudge = () => {} }) {
  let end = Infinity, stale = true, seen = false, touch = null;

  // Where "Here's how" ends on the page, read again whenever the page's size changes.
  function place() {
    if (!stale) return;
    const start = experience.getBoundingClientRect().top + scrollY;
    const length = Math.max(experience.offsetHeight - stage.clientHeight, 1);
    end = start + HERE_ENDS * PACE / SCROLL_SCREENS * length;
    stale = false;
  }
  // Held: until the last step, once the visitor has been in the intro, not in presenter mode.
  const holding = () => seen && !window.__presenting && !done();
  // At the end of "Here's how", where a scroll down would leave it.
  const atEnd = () => { place(); return scrollY >= end - 4; };

  addEventListener('resize', () => { stale = true; }, { passive: true });
  new ResizeObserver(() => { stale = true; }).observe(document.body);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('wheel', onWheel, { passive: false, capture: true });
  addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  addEventListener('touchend', () => { touch = null; }, { passive: true, capture: true });
  addEventListener('keydown', onKey, { capture: true });
  place();
  seen = scrollY <= end + 4;

  function onScroll() {
    place();
    if (scrollY <= end + 4) seen = true;
    if (holding() && scrollY > end + 4) { scrollTo(0, end); nudge(); }
  }

  function onWheel(event) {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.deltaY <= 0 ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (holding() && atEnd()) { event.preventDefault(); nudge(); }
  }

  function onTouchStart(event) {
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }

  // A swipe up scrolls the page down.
  function onTouchMove(event) {
    if (!touch || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - touch.x, dy = event.touches[0].clientY - touch.y;
    if (dy >= 0 || Math.abs(dy) <= Math.abs(dx) || !holding() || !atEnd()) return;
    if (event.cancelable) event.preventDefault();
    if (dy < -12) nudge();
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('a, button, input, textarea, select, [contenteditable], [tabindex]')) return;
    const down = DOWN_KEYS.has(event.key) || (event.key === ' ' && !event.shiftKey);
    if (down && holding() && atEnd()) { event.preventDefault(); nudge(); }
  }
}
