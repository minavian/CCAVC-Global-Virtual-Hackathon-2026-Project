// Inside the card intro (index.html `.intro`) the page moves one animation at a time, and the
// visitor's scroll is in charge. The stops are each screen of the intro, down to the card's
// drop. The landing, the everyday taps and the way from the taps into the intro scroll as
// usual: no assist there. Started by main.js.
// One rule: one scroll goes to the next animation at once (or back one, scrolling up), and the
// page stops there. No momentum: it never moves on by itself, a new glide always starts from
// standstill, and a trackpad's momentum after a swipe never counts as another scroll. At the
// card's drop the intro's own autoplay carries the card to the reader and plays the close-up
// (main.js `auto`). Below that, the page scrolls as usual. It is off with reduced motion, and in
// presenter mode (js/present.js), which plays the page its own way. See EXPLAINED.md.
import { SCROLL_SCREENS } from './timeline.js?v=2';

// The card intro's screens, in screens of its scroll (`scrollFrames` in timeline.js).
const INTRO = [
  .64,                      // the card
  1.68,                     // "RFID": the card opens and the four letters fly out
  3.43,                     // "Radio-Frequency Identification"
  5.10,                     // "This technology works by exchanging data using radio waves."
  7.63,                     // the X-ray: antenna, chip, "So how does it talk?"
  9.10,                     // "Here's how: drag the card to the reader": the last stop
];
// Every step takes exactly this long (seconds), however hard or lightly the visitor scrolled,
// so an animation always plays the same way.
const GLIDE = 3;
// A new scroll only once the wheel has been still this long (ms). A trackpad keeps sending
// small wheel events for a second or so after a swipe (its momentum); they arrive every few
// milliseconds, so they all belong to the swipe that started them and never count again.
const BURST = 300;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown']);    // and space
const UP_KEYS = new Set(['ArrowUp', 'PageUp']);          // and shift + space
// How far along a glide is at a share `k` of its time. It moves off at once (full pace within
// the first 1.5% of the step, about 45 ms), keeps one even pace so the animation plays slowly
// and evenly, and eases softly into the stop over the last 40%. A plain ease-in-out stretched to
// 3 s barely moved for its first second, which felt like lag. Built once as a table from that
// speed profile.
const ease = (() => {
  const N = 2000, START = .015, END = .4;
  const ramp = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const sum = [0];
  for (let i = 1; i <= N; i++) {
    const k = (i - .5) / N;
    sum.push(sum[i - 1] + ramp(k / START) * ramp((1 - k) / END));
  }
  const total = sum[N];
  return k => {
    const x = Math.min(1, Math.max(0, k)) * N, i = Math.floor(x);
    return i >= N ? 1 : (sum[i] + (sum[i + 1] - sum[i]) * (x - i)) / total;
  };
})();

export function autoplay({ experience, stage, reduce }) {
  let list = [];            // the stops' places on the page, read when needed (`stops`)
  let cur = -1;             // the stop the page is at, or heading to
  let glide = null;         // { from, to, y, t, length }
  let ticking = false, then = 0;
  // Where the intro's stage pins, and its last stop: outside them the page is the browser's own.
  // Read again whenever the page's size changes.
  let startY = Infinity, endY = -Infinity, stale = true;
  let armed = false;
  let burst = { at: 0, dir: 0, handled: false };
  let touch = null;

  const on = () => !reduce.matches && !window.__presenting;

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { stale = true; arm(); }, { passive: true });
  new ResizeObserver(() => { stale = true; }).observe(document.body);
  addEventListener('keydown', onKey, { capture: true });
  addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  addEventListener('touchend', () => { touch = null; }, { passive: true, capture: true });
  addEventListener('touchcancel', () => { touch = null; }, { passive: true, capture: true });
  arm();

  // Inside the intro, a scroll is caught before the page moves, so it can go to the next
  // animation instead. That needs listeners that may cancel it; everywhere else they come off,
  // so the page scrolls as usual.
  function inside() { return scrollY >= startY - 4 && scrollY <= endY + 4; }
  function arm() {
    if (stale) stops();
    const want = inside();
    if (want === armed) return;
    armed = want;
    const toggle = want ? addEventListener : removeEventListener;
    toggle('wheel', onWheel, { passive: false, capture: true });
    toggle('touchmove', onTouchMove, { passive: false, capture: true });
  }

  // Every stop's place on the page, read now (the layout can change with the window).
  function stops() {
    const top = node => node.getBoundingClientRect().top + scrollY;
    const start = top(experience);
    const length = Math.max(experience.offsetHeight - stage.clientHeight, 1);
    list = INTRO.map(screens => ({ y: start + screens / SCROLL_SCREENS * length }));
    startY = start;
    endY = list.at(-1).y;
    stale = false;
    return list;
  }

  // Go one stop down (+1) or up (-1) now, from wherever the page is, even mid-glide. Returns
  // false when there is nowhere to go that way, so the browser scrolls as usual (below the last
  // stop, or above the top).
  function step(dir) {
    if (!on()) return false;
    stops();
    if (!glide && !inside()) return false;                      // outside the intro: as usual
    const y = scrollY;
    let i;
    if (glide) i = cur + dir;                                   // on from where it was heading
    else if (dir > 0) i = list.findIndex(stop => stop.y > y + 4);
    else i = list.findLastIndex(stop => stop.y < y - 4);
    if (i < 0 || i >= list.length) return Boolean(glide);       // mid-glide: still going there
    cur = i;
    glide = { from: y, to: list[i].y, y, t: 0, length: GLIDE };
    run();
    return true;
  }

  // Stop the glide (the visitor moved the page some other way).
  function settle() {
    glide = null;
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
    // Real frame time, so a step lasts one second even when frames are slow (capped only so a
    // tab that was hidden for long does not jump).
    const dt = Math.min(.25, (now - then) / 1000);
    then = now;
    if (glide) {
      glide.t += dt;
      const k = Math.min(1, glide.t / glide.length);
      glide.y = glide.from + (glide.to - glide.from) * ease(k);
      scrollTo(0, glide.y);
      if (k >= 1) glide = null;                                 // there: stop, and stay
    }
    if (glide) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  function onScroll() {
    // The glide lands within a pixel or two of where it put the page. Anything else is the
    // visitor (the scroll bar, a link, find in page): let them.
    if (glide && Math.abs(scrollY - glide.y) > 3) settle();
    arm();
  }

  function onWheel(event) {
    if (event.ctrlKey || !event.deltaY || !on()) return;      // pinch zoom, or sideways
    const dir = Math.sign(event.deltaY), now = performance.now();
    // A new scroll: the next animation, now. The rest of the same scroll, and its momentum,
    // only ride along: they are swallowed, never another step.
    if (now - burst.at > BURST || dir !== burst.dir) burst = { dir, handled: step(dir) };
    burst.at = now;
    if (burst.handled && event.cancelable) event.preventDefault();
  }

  function onTouchStart(event) {
    touch = event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY, dir: 0, handled: false }
      : null;
  }

  function onTouchMove(event) {
    if (!touch || event.touches.length !== 1 || !on() || !inside()) return;
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
      touch.handled = step(touch.dir);
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
    if (!inside()) return;                                  // outside the intro: as usual
    if (step(down ? 1 : -1)) event.preventDefault();
  }

}
