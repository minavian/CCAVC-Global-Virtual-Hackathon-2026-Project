// The page plays itself. One small scroll down, anywhere from the landing to the card intro,
// and the page glides on without the visitor: to the three everyday taps, which play once,
// then through the card intro (index.html `.intro`), resting on each of its screens, and stops
// where the card can be dropped on the reader. From there the intro's own autoplay carries the
// card to the reader and plays the close-up (main.js `auto`). Started by main.js.
// It never holds the visitor back: while they scroll, the page moves as fast as they scroll,
// with the browser's own scrolling, and the tour waits. A moment after they stop, it carries
// on from there. Scrolling up, a click or any other key hands the page back until the next
// scroll down. It is off with reduced motion, and in presenter mode (js/present.js), which
// plays the page its own way. See EXPLAINED.md.
import { smoother } from './easing.js';
import { SCROLL_SCREENS } from './timeline.js?v=2';

// The everyday taps: glide there, then rest for one round of all three (LOOP_ALL in js/taps.js).
const TAPS = { glide: 1.6, rest: 14.2 };
// The card intro's screens, in screens of its scroll (`scrollFrames` in timeline.js):
// where (screens), glide there (seconds), then rest (seconds).
const INTRO = [
  [.64, 2.0, .6],           // the card
  [1.68, 2.2, 1.3],         // "RFID": the card opens and the four letters fly out
  [3.43, 2.6, 2.2],         // "Radio-Frequency Identification"
  [5.10, 2.4, 2.8],         // "This technology works by exchanging data using radio waves."
  [7.63, 2.8, 2.8],         // the X-ray: antenna, chip, "So how does it talk?"
  [9.10, 2.2, 0],           // "Here's how: drag the card to the reader": the end of the tour
];
// The visitor has stopped scrolling once nothing has come from them for this long (ms). Long
// enough to cover a mouse wheel's own short glide; a trackpad's fling keeps sending events
// until it is over, so the tour waits for that too.
const IDLE = 160;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End']);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

export function autoplay({ experience, stage, reduce }) {
  let run = null;
  let lastY = scrollY;
  // When the visitor last scrolled down, and whether a finger is on the screen.
  let activeAt = 0, touching = false, touchY = 0;
  // Where the tour ends, from the last time the stops were read: below it, nothing to do.
  let endY = Infinity;

  const canStart = () => !reduce.matches && !window.__presenting;

  // All passive: the tour only listens, so the browser's own scrolling stays as fast as it is.
  const quiet = { passive: true, capture: true };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { endY = Infinity; }, { passive: true });
  addEventListener('wheel', onWheel, quiet);
  addEventListener('touchstart', event => { touching = true; touchY = event.touches[0].clientY; }, quiet);
  addEventListener('touchmove', onTouchMove, quiet);
  addEventListener('touchend', () => { touching = false; }, quiet);
  addEventListener('touchcancel', () => { touching = false; }, quiet);
  addEventListener('keydown', onKey, { capture: true });
  addEventListener('pointerdown', onPointer, quiet);

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

  // The visitor is scrolling down: the page is theirs while they do; the tour waits, and
  // carries on from wherever they stop.
  function follow() {
    activeAt = performance.now();
    if (run) { run.phase = 'follow'; return; }
    if (!canStart() || scrollY >= endY - 4) return;
    run = { phase: 'follow', t: 0, then: performance.now(), y: scrollY };
    requestAnimationFrame(tick);
  }

  function stop() { run = null; }

  // Glide to the next stop below where the page is now.
  function glideOn() {
    const list = stops(), y = scrollY, index = nextFrom(list, y);
    if (index < 0) { stop(); return; }
    const next = list[index];
    const from = index ? list[index - 1].y : 0;
    // A shorter way takes a shorter time, at the same pace.
    const share = Math.min(1, Math.max(0, (next.y - y) / Math.max(next.y - from, 1)));
    Object.assign(run, { phase: 'glide', t: 0, from: y, y, to: next.y,
      length: Math.max(.5, next.glide * share), rest: next.rest, last: index === list.length - 1 });
  }

  function tick(now) {
    if (!run) return;
    if (!canStart()) { stop(); return; }
    // Frame time, capped, so a hidden tab picks up where it left off instead of jumping.
    const dt = Math.min(.05, (now - run.then) / 1000);
    run.then = now;
    run.t += dt;
    if (run.phase === 'follow') {
      if (!touching && now - activeAt > IDLE) glideOn();
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

  function onScroll() {
    const y = scrollY, was = lastY;
    lastY = y;
    // The tour's own glide lands within a pixel or two of where it put the page.
    if (run && run.phase !== 'follow' && Math.abs(y - run.y) <= 3) return;
    // Anything else is the visitor's hand (wheel, swipe, keys, the scroll bar).
    if (y < was - 1) stop();
    else if (y > was + 1) follow();
  }

  function onWheel(event) {
    if (event.ctrlKey) return;                    // pinch zoom
    if (event.deltaY < 0) stop();                 // up: the page is theirs
    else if (event.deltaY > 0) follow();
  }

  function onTouchMove(event) {
    const dy = (event.touches[0]?.clientY ?? touchY) - touchY;
    if (dy > 8) stop();                           // pulling down scrolls up
    else if (dy < -8) follow();
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || MODIFIERS.has(event.key)) return;
    if (event.key === 'p' || event.key === 'P') return;   // presenter mode's key (js/present.js)
    if (event.target.closest?.('a, button, input, textarea, select, [contenteditable], [tabindex]')) stop();
    else if (DOWN_KEYS.has(event.key) && !event.shiftKey) follow();
    else stop();
  }

  function onPointer(event) {
    if (event.pointerType !== 'touch') stop();    // a click; touches are handled above
  }
}
