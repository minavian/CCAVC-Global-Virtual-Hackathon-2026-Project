// The page moves one animation at a time, and the visitor's scroll is in charge. The stops,
// in order: the landing, the three everyday taps, then each screen of the card intro
// (index.html `.intro`) down to the card's drop. Started by main.js.
// One rule: one small scroll goes to the next animation at once (or back one, scrolling up),
// whatever is playing. A glide under way is dropped and the page heads straight for the next
// stop. Nothing waits and nothing is locked.
// Left alone after a scroll down, it moves on by itself, resting on each screen, so one small
// scroll plays the whole story. At the card's drop the intro's own autoplay carries the card
// to the reader and plays the close-up (main.js `auto`). Below that, the page scrolls as
// usual. It is off with reduced motion, and in presenter mode (js/present.js), which plays the
// page its own way. See EXPLAINED.md.
import { smoother } from './easing.js';
import { SCROLL_SCREENS } from './timeline.js?v=2';

// The landing, then the everyday taps (rest: one round of all three, LOOP_ALL in js/taps.js).
const LANDING = { glide: 1.2, rest: 0 };
const TAPS = { glide: 1.6, rest: 14.2 };
// The card intro's screens, in screens of its scroll (`scrollFrames` in timeline.js):
// where (screens), the glide there (seconds: the pace its animation is made for, whether the
// visitor scrolled or it moves on by itself), then rest (seconds).
const INTRO = [
  [.64, 2.0, .6],           // the card
  [1.68, 2.2, 1.3],         // "RFID": the card opens and the four letters fly out
  [3.43, 2.6, 2.2],         // "Radio-Frequency Identification"
  [5.10, 2.4, 2.8],         // "This technology works by exchanging data using radio waves."
  [7.63, 2.8, 2.8],         // the X-ray: antenna, chip, "So how does it talk?"
  [9.10, 2.2, 0],           // "Here's how: drag the card to the reader": the last stop
];
// Wheel events closer together than this are one scroll (ms): one scroll is one animation,
// however hard, so a trackpad's long fling does not race through everything.
const BURST = 200;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown']);    // and space
const UP_KEYS = new Set(['ArrowUp', 'PageUp']);          // and shift + space
// A step the visitor asked for moves off at once and slows into the stop (sine ease-out), so the
// page answers the scroll straight away yet its animation still plays at its own pace.
const prompt = k => Math.sin(k * Math.PI / 2);
const calm = k => smoother(0, 1, k);

export function autoplay({ experience, stage, reduce }) {
  let list = [];            // the stops' places on the page, read when needed (`stops`)
  let cur = -1;             // the stop the page is at, or heading to
  let glide = null;         // { from, to, y, t, length, ease }
  let restLeft = null;      // seconds until it moves on by itself, or null
  let onward = false;       // moving on by itself after each rest (after a scroll down)
  let ticking = false, then = 0;
  let endY = Infinity;      // the last stop: below it, the page is the browser's own
  let armed = false;
  let burst = { at: 0, dir: 0, handled: false };
  let touch = null;

  const on = () => !reduce.matches && !window.__presenting;

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { endY = Infinity; arm(); }, { passive: true });
  addEventListener('keydown', onKey, { capture: true });
  addEventListener('pointerdown', onPointer, { passive: true, capture: true });
  addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  addEventListener('touchend', () => { touch = null; }, { passive: true, capture: true });
  addEventListener('touchcancel', () => { touch = null; }, { passive: true, capture: true });
  arm();

  // Down to the last stop, a scroll is caught before the page moves, so it can go to the next
  // animation instead. That needs listeners that may cancel it; below the last stop they come
  // off, so the rest of the page keeps the browser's fastest scrolling.
  function arm() {
    const want = scrollY <= endY + 4;
    if (want === armed) return;
    armed = want;
    const toggle = want ? addEventListener : removeEventListener;
    toggle('wheel', onWheel, { passive: false, capture: true });
    toggle('touchmove', onTouchMove, { passive: false, capture: true });
  }

  // Every stop's place on the page, read now (the layout can change with the window).
  function stops() {
    const top = node => node.getBoundingClientRect().top + scrollY;
    list = [{ y: 0, ...LANDING }];
    const taps = document.getElementById('taps');
    if (taps) list.push({ y: top(taps), ...TAPS });
    const start = top(experience);
    const length = Math.max(experience.offsetHeight - stage.clientHeight, 1);
    for (const [screens, glide, rest] of INTRO) list.push({ y: start + screens / SCROLL_SCREENS * length, glide, rest });
    endY = list.at(-1).y;
    return list;
  }

  // Go one stop down (+1) or up (-1) now, from wherever the page is, even mid-glide.
  // `byHand`: the visitor asked. Returns false when there is nowhere to go that way, so the
  // browser scrolls as usual (below the last stop, or above the top).
  function step(dir, byHand) {
    if (!on()) return false;
    stops();
    const y = scrollY;
    let i;
    if (glide) i = cur + dir;                                   // on from where it was heading
    else if (dir > 0) i = list.findIndex(stop => stop.y > y + 4);
    else i = list.findLastIndex(stop => stop.y < y - 4);
    if (i < 0 || i >= list.length) return Boolean(glide);       // mid-glide: still going there
    const from = list[i - dir]?.y ?? y;
    cur = i;
    const to = list[i].y;
    const share = Math.min(1, Math.abs(to - y) / Math.max(Math.abs(to - from), 1));
    glide = { from: y, to, y, t: 0, length: Math.max(.6, list[i].glide * share), ease: byHand ? prompt : calm };
    restLeft = null;
    onward = dir > 0;
    run();
    return true;
  }

  // Stop moving by itself (the visitor did something else).
  function settle() {
    glide = null;
    restLeft = null;
    onward = false;
  }

  function run() {
    if (ticking) return;
    ticking = true;
    then = performance.now();
    requestAnimationFrame(tick);
  }

  function tick(now) {
    ticking = false;
    if (!on()) { settle(); return; }
    // Frame time, capped, so a hidden tab picks up where it left off instead of jumping.
    const dt = Math.min(.05, (now - then) / 1000);
    then = now;
    if (glide) {
      glide.t += dt;
      const k = Math.min(1, glide.t / glide.length);
      glide.y = glide.from + (glide.to - glide.from) * glide.ease(k);
      scrollTo(0, glide.y);
      if (k >= 1) {
        glide = null;
        restLeft = onward && cur < list.length - 1 ? list[cur].rest : null;
      }
    } else if (restLeft !== null) {
      restLeft -= dt;
      if (restLeft <= 0) { restLeft = null; step(1, false); }
    }
    if (glide || restLeft !== null) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  function onScroll() {
    // The glide lands within a pixel or two of where it put the page; resting, the page
    // stays on its stop. Anything else is the visitor (the scroll bar, a link, find in page).
    if (glide ? Math.abs(scrollY - glide.y) > 3 : restLeft !== null && Math.abs(scrollY - list[cur].y) > 3) settle();
    arm();
  }

  function onWheel(event) {
    if (event.ctrlKey || !event.deltaY || !on()) return;      // pinch zoom, or sideways
    const dir = Math.sign(event.deltaY), now = performance.now();
    // A new scroll: the next animation, now. The rest of the same scroll only rides along.
    if (now - burst.at > BURST || dir !== burst.dir) burst = { dir, handled: step(dir, true) };
    burst.at = now;
    if (burst.handled && event.cancelable) event.preventDefault();
  }

  function onTouchStart(event) {
    touch = event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY, dir: 0, handled: false }
      : null;
  }

  function onTouchMove(event) {
    if (!touch || event.touches.length !== 1 || !on()) return;
    const dx = event.touches[0].clientX - touch.x, dy = event.touches[0].clientY - touch.y;
    const vertical = Math.abs(dy) > Math.abs(dx);
    // At the last stop, a swipe up (scrolling down) leaves for the rest of the page as usual.
    const leaving = dy < 0 && !glide && scrollY >= endY - 4;
    if (!touch.dir) {
      if (Math.abs(dy) < 12 || !vertical) {
        // Not decided yet: hold the page still meanwhile, so it doesn't start scrolling.
        if (vertical && !leaving && event.cancelable) event.preventDefault();
        return;
      }
      touch.dir = dy < 0 ? 1 : -1;
      touch.handled = step(touch.dir, true);
    }
    if (touch.handled && event.cancelable) event.preventDefault();
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || !on()) return;
    if (event.target.closest?.('a, button, input, textarea, select, [contenteditable], [tabindex]')) return;
    const down = DOWN_KEYS.has(event.key) || (event.key === ' ' && !event.shiftKey);
    const up = UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey);
    if (!down && !up) {
      if (event.key === 'Home' || event.key === 'End') settle();
      return;
    }
    if (scrollY > endY + 4) return;                         // below the last stop: as usual
    if (step(down ? 1 : -1, true)) event.preventDefault();
  }

  function onPointer(event) {
    // A click on the page: stop moving on by itself, so nothing slides away under it.
    if (event.pointerType !== 'touch') { restLeft = null; onward = false; }
  }
}
