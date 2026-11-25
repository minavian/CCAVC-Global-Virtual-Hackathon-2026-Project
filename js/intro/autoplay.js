// From the top of the page to the card's drop, the page moves one animation at a time, and the
// visitor's scroll is in charge: the landing, the everyday taps (index.html `.taps`) and each
// screen of the card intro (`.intro`). Started by main.js. See EXPLAINED.md.
// The rules:
// - A scroll down, however small, moves the page to the next animation at once. It starts moving
//   on the next frame, and the animation with it: where the picture holds still, the page jumps
//   over that stretch, because nothing on screen changes there.
// - One scroll is one animation. However hard or fast the scroll, it plays the next animation
//   only, for that animation's own time, then stops. A trackpad's momentum never counts again.
// - A new scroll while an animation plays finishes it at once and starts the next one.
// - Scrolling up is the browser's own: the page goes back up freely, as far and as fast as the
//   visitor scrolls, and the animations play backwards with it.
// Below the last stop ("Here's how"), the page scrolls as usual, and the intro's own autoplay
// (main.js `auto`) carries the card to the reader. Off with reduced motion, and in presenter
// mode (js/present.js), which plays the page its own way.
import { PACE, SCROLL_SCREENS } from './timeline.js?v=3';

// The card intro's stops: where its picture holds still (from, to), in screens of its scroll at
// the first pace (`scrollFrames` in timeline.js), and how long the animation into each one plays
// (seconds: 1.3 times the first timings, and the last one, the card moving beside the reader,
// 2.5 times).
const INTRO = [
  [.57, .71, 2.6],          // the card slides in over the taps and turns to face you
  [1.60, 1.76, 2.5],        // "RFID": the card opens and the four letters fly out
  [3.01, 3.85, 2.6],        // "Radio-Frequency Identification"
  [4.56, 5.66, 1.8],        // "This technology works by exchanging data using radio waves."
  [7.05, 8.21, 2.5],        // the X-ray: antenna, chip, "So how does it talk?"
  [8.91, 9.27, 3.5],        // "Here's how: drag the card to the reader": the last stop
];
// Still stretches inside an animation (the card's mouth closed, before the letters spell the
// name): crossed in one jump too, so an animation never pauses half-way.
const STILL = [[2.12, 2.34]];
// A stretch of plain page (the landing to the taps): this many seconds per screen, within limits.
const PER_SCREEN = 1.56, PLAIN_MIN = 1.04, PLAIN_MAX = 2.6;
// A new scroll only once the wheel has been still this long (ms), or when it is pushed again
// much harder (a new swipe while a trackpad still coasts from the last one). The coasting
// events after a swipe get smaller and smaller, so they never count as a scroll of their own.
const BURST = 300;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown']);    // and space
const UP_KEYS = new Set(['ArrowUp', 'PageUp']);          // and shift + space
// The glide's pace: full speed on the very first frame, softly to a stop at the end.
const ease = k => Math.sin(Math.min(1, k) * Math.PI / 2);

export function autoplay({ experience, stage, reduce }) {
  const taps = document.getElementById('taps');
  let rests = [];           // where the page can stop: { from, to, time }, on the page, top down
  let skips = [];           // still stretches inside an animation, on the page
  let glide = null;         // { pieces, total, to, y, t, length, dir }
  let ticking = false, then = 0;
  // Below the last stop the page is the browser's own. Read again whenever the page's size
  // changes.
  let endY = -Infinity, lastStop = -Infinity, stale = true;
  let armed = false;
  let burst = { at: 0, start: 0, dir: 0, size: 0, handled: false };
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

  // A scroll is caught before the page moves, so it can go to the next animation instead. That
  // needs listeners that may cancel it; below the last stop they come off, so the page scrolls
  // as usual.
  function inside() { return scrollY <= endY + 4; }
  function arm() {
    if (stale) stops();
    const want = inside();
    if (want === armed) return;
    armed = want;
    const toggle = want ? addEventListener : removeEventListener;
    toggle('wheel', onWheel, { passive: false, capture: true });
    toggle('touchmove', onTouchMove, { passive: false, capture: true });
  }

  // Every stop's place on the page, read now (the layout changes with the window).
  function stops() {
    const top = node => node.getBoundingClientRect().top + scrollY;
    const view = innerHeight;
    rests = [{ from: 0, to: 0 }];                                // the landing
    if (taps) {
      // The taps, framed. On a phone their panels stack taller than the screen: one stop per
      // screen, so none is skipped.
      const first = top(taps), last = first + Math.max(0, taps.offsetHeight - view);
      // (Not while the page has no height yet, in a hidden tab: a step of 0.9 × 0 px used to make
      // this loop forever, adding stops until the browser gave up. The stops are read again once
      // the page has a size.)
      if (view < 100) rests.push({ from: first, to: first });
      else for (let y = first; ; y += view * .9) {
        const at = Math.min(y, last);
        rests.push({ from: at, to: at });
        if (at >= last) break;
      }
    }
    const start = top(experience);
    const length = Math.max(experience.offsetHeight - stage.clientHeight, 1);
    const at = screens => start + screens * PACE / SCROLL_SCREENS * length;
    for (const [from, to, time] of INTRO) rests.push({ from: at(from), to: at(to), time });
    skips = STILL.map(([from, to]) => [at(from), at(to)]);
    endY = rests.at(-1).to;
    lastStop = rests.at(-1).from;
    stale = false;
  }

  // The way from one place to another, without the still stretches in between: pieces of page,
  // in the order the glide crosses them.
  function path(from, to) {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const pieces = [];
    let at = lo;
    for (const [a, b] of skips) if (a > lo && b < hi) { pieces.push([at, a]); at = b; }
    pieces.push([at, hi]);
    return to >= from ? pieces : pieces.reverse().map(([a, b]) => [b, a]);
  }
  const span = pieces => pieces.reduce((sum, [a, b]) => sum + Math.abs(b - a), 0);
  function along(pieces, d) {
    for (const [a, b] of pieces) {
      const n = Math.abs(b - a);
      if (d <= n) return a + Math.sign(b - a) * d;
      d -= n;
    }
    return pieces.at(-1)[1];
  }

  // Go one animation down (+1) or up (-1), now. Returns false when there is nowhere to go that
  // way, so the browser scrolls as usual (below the last stop, or above the top).
  function step(dir) {
    if (!on()) return false;
    stops();
    if (!glide && !inside()) return false;
    const busy = Boolean(glide);
    // A scroll mid-glide: the same way, the animation playing finishes at once; the other way,
    // it turns back from where it is.
    const y = glide ? (glide.dir === dir ? glide.to : glide.y) : scrollY;
    glide = null;
    // At a stop, leave from the far end of its still stretch, so the next animation starts at once.
    const here = rests.find(r => y >= r.from - 4 && y <= r.to + 4);
    const from = here ? (dir > 0 ? here.to : here.from) : y;
    const i = dir > 0 ? rests.findIndex(r => r.from > from + 4) : rests.findLastIndex(r => r.to < from - 4);
    if (i < 0) {
      if (busy) scrollTo(0, y);
      return busy;
    }
    const to = dir > 0 ? rests[i].from : rests[i].to;
    // The animation between two stops plays for its own time, whichever way it goes (`k`: the
    // stop it leads into). Joined part-way, it plays the rest at the same pace.
    const k = dir > 0 ? i : i + 1;
    const a = k > 0 ? rests[k - 1].to : 0, b = rests[k].from;
    const whole = Math.max(1, span(path(a, b)));
    const time = rests[k].time ?? Math.min(PLAIN_MAX, Math.max(PLAIN_MIN, PER_SCREEN * (b - a) / Math.max(1, innerHeight)));
    const pieces = path(from, to), total = span(pieces);
    // Over the still stretch at once. This also stops the browser's own smooth scroll, if one
    // (scrolling up) is still running, so it can't pull the page away from the glide.
    scrollTo(0, from);
    glide = { pieces, total, to, y: from, t: 0, length: Math.max(.3, time * Math.min(1, total / whole)), dir };
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
    // Real frame time, so an animation keeps its length even when frames are slow (capped only
    // so a tab that was hidden for long does not jump).
    const dt = Math.min(.25, Math.max(0, now - then) / 1000);
    then = now;
    if (glide) {
      glide.t += dt;
      const k = Math.min(1, glide.t / glide.length);
      glide.y = along(glide.pieces, glide.total * ease(k));
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
    // visitor (a link, find in page, the scroll bar): let them.
    if (glide && Math.abs(scrollY - glide.y) > 3) settle();
    arm();
  }

  function onWheel(event) {
    if (event.ctrlKey || !event.deltaY || !on()) return;      // pinch zoom, or sideways
    const dir = Math.sign(event.deltaY), now = performance.now();
    // Up: the browser's own scroll. A glide under way stops, so the page goes where the visitor
    // takes it.
    if (dir < 0) {
      settle();
      burst = { at: now, start: now, dir, size: 0, handled: false };
      return;
    }
    const size = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? innerHeight : 1);
    // A new scroll down: after a pause, after scrolling up, or a sudden much harder push (a new
    // swipe while the last one still coasts). The rest of the same scroll only rides along: swallowed,
    // never another animation.
    const fresh = now - burst.at > BURST || dir !== burst.dir ||
      (now - burst.start > BURST && size >= 12 && size > burst.size * 3);
    if (fresh) burst = { dir, start: now, handled: step(dir) };
    burst.at = now;
    burst.size = size;
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
    const leaving = dy < 0 && !glide && scrollY >= lastStop - 4;
    if (!touch.dir) {
      if (Math.abs(dy) < 12 || !vertical) {
        // Not decided yet: hold the page still meanwhile, so it doesn't start scrolling down.
        // (A swipe down, scrolling up, is the browser's own.)
        if (vertical && dy < 0 && !leaving && event.cancelable) event.preventDefault();
        return;
      }
      touch.dir = dy < 0 ? 1 : -1;
      if (touch.dir > 0) touch.handled = step(1);
      else settle();                                            // up: as usual
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
    if (up) { settle(); return; }                           // up: the browser's own scroll
    if (!inside()) return;                                  // below the last stop: as usual
    // A held key repeats: one press is one animation, so the repeats only hold the page.
    if (event.repeat) {
      if (glide || scrollY < lastStop - 4) event.preventDefault();
      return;
    }
    if (step(1)) event.preventDefault();
  }

}
