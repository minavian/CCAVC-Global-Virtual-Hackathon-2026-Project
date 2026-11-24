// The page plays itself. One small scroll down, anywhere from the landing to the card intro,
// and the page glides on without the visitor: to the three everyday taps, which play once,
// then through the card intro (index.html `.intro`), resting on each of its screens, and stops
// where the card can be dropped on the reader. From there the intro's own autoplay carries the
// card to the reader and plays the close-up (main.js `auto`). Started by main.js.
// The visitor's scroll is the go signal: the glide starts on the push itself, and every push
// down while it rests moves on at once, so scrolling on flows through every stop. Scrolling up,
// a click or any other key hands the page back at once, and the next push down picks the tour
// up again from there. It is off with reduced motion, and in presenter mode (js/present.js),
// which plays the page its own way. See EXPLAINED.md.
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
const STILL = .12;          // a scroll that started some other way has stopped once still this long (s)
const SETTLE_MAX = 1.5;     // ... or after this long at most (s)
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar']);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);
// A glide the visitor asked for leaves at once and slows into the stop, like a flick (ease-out).
// One the tour starts by itself after a rest eases in and out (smootherstep).
const flick = k => 1 - (1 - k) ** 3;

export function autoplay({ experience, stage, reduce }) {
  let run = null;
  let lastY = scrollY;
  let touchY = 0, touching = false;
  // Where the tour ends, from the last time the stops were read. Read again after a resize.
  let endY = Infinity;
  // Above the end, a push down is caught before the page moves, so the glide can start on that
  // very push. That needs listeners that may cancel the push; below the end they come off, so
  // the rest of the page keeps the browser's fastest scrolling.
  let armed = false;

  const canStart = () => !reduce.matches && !window.__presenting;

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { endY = Infinity; arm(); }, { passive: true });
  addEventListener('keydown', onKey, { capture: true });
  addEventListener('pointerdown', onPointer, { passive: true, capture: true });
  addEventListener('touchstart', event => { touching = true; touchY = event.touches[0].clientY; }, { passive: true, capture: true });
  addEventListener('touchend', () => { touching = false; }, { passive: true, capture: true });
  addEventListener('touchcancel', () => { touching = false; }, { passive: true, capture: true });
  arm();

  function arm() {
    const want = Boolean(run) || scrollY < endY - 4;
    if (want === armed) return;
    armed = want;
    const toggle = want ? addEventListener : removeEventListener;
    toggle('wheel', onWheel, { passive: false, capture: true });
    toggle('touchmove', onTouchMove, { passive: false, capture: true });
  }

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

  // Starts the tour, if there is a stop ahead. `push`: the visitor just pushed down (wheel,
  // swipe, key), so glide at once. Otherwise the page moved some other way (the scroll bar):
  // let that settle first.
  function begin(push) {
    if (run || !canStart() || nextFrom(stops(), scrollY) < 0) return false;
    run = { phase: 'settle', t: 0, still: 0, then: performance.now(), y: scrollY };
    arm();
    if (push) glideOn(true);
    requestAnimationFrame(tick);
    return Boolean(run);
  }

  function stop() {
    if (!run) return;
    run = null;
    arm();
  }

  // Glide to the next stop below where the page is now. `eager`: the visitor asked for it.
  function glideOn(eager) {
    const list = stops(), y = scrollY, index = nextFrom(list, y);
    if (index < 0) { stop(); return; }
    const next = list[index];
    const from = index ? list[index - 1].y : 0;
    // A shorter way takes a shorter time, at the same pace.
    const share = Math.min(1, Math.max(0, (next.y - y) / Math.max(next.y - from, 1)));
    Object.assign(run, { phase: 'glide', t: 0, from: y, to: next.y, eager,
      length: Math.max(.5, next.glide * share), rest: next.rest, last: index === list.length - 1 });
  }

  // The visitor pushed down again: while resting (or settling), move on now.
  function push() {
    if (run && run.phase !== 'glide') glideOn(true);
  }

  function tick(now) {
    if (!run) return;
    if (!canStart()) { stop(); return; }
    // Frame time, capped, so a hidden tab picks up where it left off instead of jumping.
    const dt = Math.min(.05, (now - run.then) / 1000);
    run.then = now;
    run.t += dt;
    if (run.phase === 'settle') {
      run.still += dt;
      if ((run.still >= STILL && !touching) || run.t >= SETTLE_MAX) glideOn(false);
    } else if (run.phase === 'glide') {
      const k = Math.min(1, run.t / run.length);
      run.y = run.from + (run.to - run.from) * (run.eager ? flick(k) : smoother(0, 1, k));
      scrollTo(0, run.y);
      if (k >= 1) {
        if (run.last) { stop(); return; }
        run.phase = 'rest';
        run.t = 0;
      }
    } else if (run.t >= run.rest) {
      glideOn(false);
    }
    if (run) requestAnimationFrame(tick);
  }

  function onScroll() {
    const y = scrollY, was = lastY;
    lastY = y;
    if (run) {
      if (run.phase === 'settle') {
        // A scroll the page did not start (the scroll bar, a phone's fling) is still running
        // out: let it, unless it turns back up.
        if (y < run.y - 3) stop();
        else { run.y = y; run.still = 0; }
      } else if (Math.abs(y - run.y) > 3) {
        // The glide lands within a pixel or two of where it was put. Anything else is the
        // visitor taking the page back (the scroll bar, a link, find in page).
        stop();
      }
      return;
    }
    arm();
    // The page moved down some way the listeners below did not catch: start from there.
    if (y > was + 1 && y < endY - 4) begin(false);
  }

  function onWheel(event) {
    if (event.ctrlKey || !event.deltaY) return;          // pinch zoom, or sideways
    if (event.deltaY < 0) { stop(); return; }           // up: the visitor takes over
    if (run) {
      if (event.cancelable) event.preventDefault();     // the page is going there anyway
      push();
    } else if (begin(true) && event.cancelable) {
      event.preventDefault();                           // the glide moves the page, not the wheel
    }
  }

  function onTouchMove(event) {
    const dy = (event.touches[0]?.clientY ?? touchY) - touchY;
    if (dy > 8) { stop(); return; }                     // pulling down scrolls up: take over
    if (run) {
      if (event.cancelable) event.preventDefault();
      if (dy < -12) push();
    } else if (dy < -12 && begin(true) && event.cancelable) {
      event.preventDefault();
    }
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || MODIFIERS.has(event.key)) return;
    if (event.key === 'p' || event.key === 'P') return;   // presenter mode's key (js/present.js)
    const target = event.target;
    if (target.closest?.('a, button, input, textarea, select, [contenteditable], [tabindex]')) {
      stop();                                           // a key meant for a control
      return;
    }
    if (DOWN_KEYS.has(event.key) && !event.shiftKey) {
      if (run) { event.preventDefault(); push(); }
      else if (scrollY < endY - 4 && begin(true)) event.preventDefault();
    } else {
      stop();
    }
  }

  function onPointer(event) {
    if (run && event.pointerType !== 'touch') stop();   // a click; touches are handled above
  }
}
