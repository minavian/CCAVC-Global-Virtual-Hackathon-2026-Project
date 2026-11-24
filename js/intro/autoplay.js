// The card intro plays its opening by itself (index.html `.intro`, started by main.js).
// Once a visitor scrolls the section in, the page glides on without them: onto the card,
// through its opening as R, F, I, D fly out, a rest on the four letters, then on until they
// spell Radio-Frequency Identification, where the scroll is theirs again.
// While it plays, scrolling down is absorbed, so the glide stays smooth. Scrolling up, a
// click or any other key hands the page back at once. It is off with reduced motion, and in
// presenter mode (js/present.js), which scrolls the intro itself. See EXPLAINED.md.
import { smoother } from './easing.js';

// Places in the intro's scroll, in screens (`scrollFrames` in js/intro/timeline.js).
const START = .15;          // just after the stage pins: going down past here starts it
const STOPS = [
  // where (screens), glide (seconds), then rest (seconds)
  [.64, 1.2, .6],           // the card, at rest
  [1.68, 2.2, 1.3],         // "RFID": the card opens and the four letters fly out
  [3.30, 2.8, 0],           // "Radio-Frequency Identification": hand the scroll back
];
const LAST = STOPS.at(-1)[0];
const STILL = .12;          // the visitor's own scroll has stopped once still this long (s)
const SETTLE_MAX = 1.5;     // ... or after this long at most (s)
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar']);
const AWAY_KEYS = new Set(['ArrowUp', 'PageUp', 'Home', 'End', 'Tab', 'Escape']);

// `screensAt(y)`: how far into the intro's scroll a page position is, in screens.
// `yAt(screens)`: the page position for that point. Both come from main.js's measurements.
export function autoplay({ screensAt, yAt, reduce }) {
  let run = null;
  let before = screensAt(scrollY);
  let touchY = 0, touching = false;

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('touchstart', event => { touching = true; touchY = event.touches[0].clientY; }, { passive: true, capture: true });
  addEventListener('touchend', () => { touching = false; }, { passive: true, capture: true });
  addEventListener('touchcancel', () => { touching = false; }, { passive: true, capture: true });

  function onScroll() {
    const at = screensAt(scrollY);
    const was = before;
    before = at;
    if (run) {
      if (run.phase === 'settle') {
        // The visitor's own scroll (a fling on a phone) is still running out: let it, unless
        // it turns back up or carries past the end.
        if (scrollY < run.y - 3 || at >= LAST - .1) stop();
        else { run.y = scrollY; run.still = 0; }
      } else if (Math.abs(scrollY - run.y) > 3) {
        // Our own glide lands within a pixel or two of where it was put. Anything else is the
        // visitor taking the page back (the scroll bar, a link, find in page).
        stop();
      }
      return;
    }
    if (was < START && at >= START && at < LAST - .1 && !reduce.matches && !window.__presenting) begin();
  }

  function begin() {
    run = { phase: 'settle', t: 0, still: 0, then: performance.now(), y: scrollY, next: 0 };
    addEventListener('wheel', onWheel, { passive: false, capture: true });
    addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    addEventListener('keydown', onKey, { capture: true });
    addEventListener('pointerdown', onPointer, { passive: true, capture: true });
    requestAnimationFrame(tick);
  }

  function stop() {
    if (!run) return;
    run = null;
    removeEventListener('wheel', onWheel, { capture: true });
    removeEventListener('touchmove', onTouchMove, { capture: true });
    removeEventListener('keydown', onKey, { capture: true });
    removeEventListener('pointerdown', onPointer, { capture: true });
  }

  function glideTo(index) {
    const at = screensAt(scrollY);
    // Skip the stops the visitor has already scrolled past.
    while (index < STOPS.length && STOPS[index][0] <= at + .02) index++;
    if (index >= STOPS.length) { stop(); return; }
    const [where, glide] = STOPS[index];
    const from = index ? STOPS[index - 1][0] : START;
    // A shorter way to go takes a shorter time, at the same pace.
    const share = Math.min(1, Math.max(0, (where - at) / (where - from)));
    Object.assign(run, { phase: 'glide', t: 0, next: index, from: scrollY, to: yAt(where), length: Math.max(.5, glide * share) });
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
      if ((run.still >= STILL && !touching) || run.t >= SETTLE_MAX) glideTo(0);
    } else if (run.phase === 'glide') {
      const k = Math.min(1, run.t / run.length);
      run.y = run.from + (run.to - run.from) * smoother(0, 1, k);
      scrollTo(0, run.y);
      if (k >= 1) {
        if (run.next >= STOPS.length - 1) { stop(); return; }
        Object.assign(run, { phase: 'rest', t: 0, rest: STOPS[run.next][2] });
      }
    } else if (run.t >= run.rest) {
      glideTo(run.next + 1);
    }
    if (run) requestAnimationFrame(tick);
  }

  function onWheel(event) {
    if (event.ctrlKey) return;                       // pinch zoom
    if (event.deltaY < 0) stop();                    // up: the visitor takes over
    else if (event.cancelable) event.preventDefault();   // down: already going there
  }

  function onTouchMove(event) {
    const y = event.touches[0]?.clientY ?? touchY;
    if (y - touchY > 6) stop();                      // pulling down scrolls up: take over
    else if (event.cancelable) event.preventDefault();
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('a, button, input, textarea, select, [contenteditable]')) { stop(); return; }
    if (DOWN_KEYS.has(event.key) && !event.shiftKey) event.preventDefault();
    else if (AWAY_KEYS.has(event.key) || event.key === ' ') stop();
  }

  function onPointer(event) {
    if (event.pointerType !== 'touch') stop();       // a click; touches are handled above
  }
}
