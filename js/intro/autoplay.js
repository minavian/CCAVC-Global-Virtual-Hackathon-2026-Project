// The page plays itself. One small scroll down, anywhere from the landing to the card intro,
// and the page glides on without the visitor: to the three everyday taps, which play once,
// then through the card intro (index.html `.intro`), resting on each of its screens, and stops
// where the card can be dropped on the reader. From there the intro's own autoplay carries the
// card to the reader and plays the close-up (main.js `auto`). Started by main.js.
// While it glides, scrolling down is absorbed, so nothing jolts. While it rests, scrolling down
// skips to the next stop. Scrolling up, a click or any other key hands the page back at once,
// and the next scroll down picks the tour up again from there. It is off with reduced motion,
// and in presenter mode (js/present.js), which plays the page its own way. See EXPLAINED.md.
import { smoother } from './easing.js';
import { SCROLL_SCREENS } from './timeline.js?v=2';

// The everyday taps: glide there, then rest for one round of all three (LOOP_ALL in js/taps.js).
const TAPS = { glide: 1.8, rest: 14.2 };
// The card intro's screens, in screens of its scroll (`scrollFrames` in timeline.js):
// where (screens), glide there (seconds), then rest (seconds).
const INTRO = [
  [.64, 2.4, .6],           // the card
  [1.68, 2.2, 1.3],         // "RFID": the card opens and the four letters fly out
  [3.43, 2.8, 2.2],         // "Radio-Frequency Identification"
  [5.10, 2.6, 2.8],         // "This technology works by exchanging data using radio waves."
  [7.63, 3.0, 2.8],         // the X-ray: antenna, chip, "So how does it talk?"
  [9.10, 2.4, 0],           // "Here's how: drag the card to the reader": the end of the tour
];
const STILL = .12;          // the visitor's own scroll has stopped once still this long (s)
const SETTLE_MAX = 1.5;     // ... or after this long at most (s)
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar']);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

export function autoplay({ experience, stage, reduce }) {
  let run = null;
  let lastY = scrollY;
  let touchY = 0, touching = false, swiped = false, lastWheel = 0;
  // Where the tour ends, from the last time the stops were read: below it, a scroll needs no
  // measuring at all. Read again after a resize.
  let endY = Infinity;

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { endY = Infinity; }, { passive: true });
  addEventListener('touchstart', event => {
    touching = true;
    swiped = false;
    touchY = event.touches[0].clientY;
  }, { passive: true, capture: true });
  addEventListener('touchend', () => { touching = false; }, { passive: true, capture: true });
  addEventListener('touchcancel', () => { touching = false; }, { passive: true, capture: true });

  // Every stop's place on the page, read now (the layout can change with the window).
  function stops() {
    const top = node => node.getBoundingClientRect().top + scrollY;
    const list = [];
    const taps = document.getElementById('taps');
    if (taps) list.push({ y: top(taps), ...TAPS });
    const start = top(experience);
    const length = Math.max(experience.offsetHeight - stage.clientHeight, 1);
    for (const [screens, glide, rest] of INTRO) list.push({ y: start + screens / SCROLL_SCREENS * length, glide, rest });
    endY = list.at(-1).y;
    return list;
  }

  // The first stop below `y`, or -1 when the tour is over there.
  const nextFrom = (list, y) => list.findIndex(stop => stop.y > y + 4);

  function onScroll() {
    const y = scrollY, was = lastY;
    lastY = y;
    if (run) {
      if (run.phase === 'settle') {
        // The visitor's own scroll (a fling on a phone) is still running out: let it, unless it
        // turns back up.
        if (y < run.y - 3) stop();
        else { run.y = y; run.still = 0; }
      } else if (Math.abs(y - run.y) > 3) {
        // The glide lands within a pixel or two of where it was put. Anything else is the
        // visitor taking the page back (the scroll bar, a link, find in page).
        stop();
      }
      return;
    }
    // Any scroll down, however small, starts the tour (or picks it up again).
    if (y > was + 1 && y < endY - 4 && !reduce.matches && !window.__presenting && nextFrom(stops(), y) >= 0) begin();
  }

  function begin() {
    run = { phase: 'settle', t: 0, still: 0, then: performance.now(), y: scrollY, next: 0 };
    addEventListener('wheel', onWheel, { passive: false, capture: true });
    addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    addEventListener('keydown', onKey, { capture: true });
    addEventListener('pointerdown', onPointer, { passive: true, capture: true });
    requestAnimationFrame(tick);
  }

  function stop() {
    if (!run) return;
    run = null;
    removeEventListener('wheel', onWheel, { capture: true });
    removeEventListener('touchmove', onTouchMove, { capture: true });
    removeEventListener('touchend', onTouchEnd, { capture: true });
    removeEventListener('keydown', onKey, { capture: true });
    removeEventListener('pointerdown', onPointer, { capture: true });
  }

  // Glide to the next stop below where the page is now.
  function glideOn() {
    const list = stops(), y = scrollY, index = nextFrom(list, y);
    if (index < 0) { stop(); return; }
    const stop_ = list[index];
    const from = index ? list[index - 1].y : 0;
    // A shorter way to go takes a shorter time, at the same pace.
    const share = Math.min(1, Math.max(0, (stop_.y - y) / Math.max(stop_.y - from, 1)));
    Object.assign(run, { phase: 'glide', t: 0, from: y, to: stop_.y, length: Math.max(.6, stop_.glide * share),
      rest: stop_.rest, last: index === list.length - 1 });
  }

  function tick(now) {
    if (!run) return;
    if (window.__presenting || reduce.matches) { stop(); return; }
    // Frame time, capped, so a hidden tab picks up where it left off instead of jumping.
    const dt = Math.min(.05, (now - run.then) / 1000);
    run.then = now;
    run.t += dt;
    if (run.phase === 'settle') {
      run.still += dt;
      if ((run.still >= STILL && !touching) || run.t >= SETTLE_MAX) glideOn();
    } else if (run.phase === 'glide') {
      const k = Math.min(1, run.t / run.length);
      run.y = run.from + (run.to - run.from) * smoother(0, 1, k);
      scrollTo(0, run.y);
      if (k >= 1) {
        if (run.last) { stop(); return; }
        run.phase = 'rest';
        run.t = 0;
      }
    } else if (run.t >= run.rest) {
      glideOn();
    }
    if (run) requestAnimationFrame(tick);
  }

  // Resting, a fresh push down moves on to the next stop now.
  function skip() {
    if (run?.phase === 'rest') glideOn();
  }

  function onWheel(event) {
    if (event.ctrlKey) return;                        // pinch zoom
    if (event.deltaY < 0) { stop(); return; }         // up: the visitor takes over
    if (event.cancelable) event.preventDefault();     // down: the page is going there anyway
    // A new push, not the tail of a fling (a trackpad sends many events for one swipe).
    const now = performance.now(), fresh = now - lastWheel > 250;
    lastWheel = now;
    if (fresh && event.deltaY > 0) skip();
  }

  function onTouchMove(event) {
    const dy = (event.touches[0]?.clientY ?? touchY) - touchY;
    if (dy > 8) { stop(); return; }                   // pulling down scrolls up: take over
    if (event.cancelable) event.preventDefault();
    if (dy < -30) swiped = true;
  }

  function onTouchEnd() {
    if (swiped) skip();
    swiped = false;
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || MODIFIERS.has(event.key)) return;
    if (event.key === 'p' || event.key === 'P') return;   // presenter mode's key (js/present.js)
    if (event.target.closest?.('a, button, input, textarea, select, [contenteditable]')) { stop(); return; }
    if (DOWN_KEYS.has(event.key) && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) skip();
    } else {
      stop();
    }
  }

  function onPointer(event) {
    if (event.pointerType !== 'touch') stop();        // a click; touches are handled above
  }
}
