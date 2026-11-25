/*
 * Presenter mode: the page plays itself, for a live demo. Open the page with ?play in the
 * address, or press P. It waits for the landing's opening, scrolls to the everyday taps and
 * lets them play once, then scrolls through the card intro, pausing on each of the intro's
 * reading holds, and stops where the card can be dropped: from there the close-up plays by
 * itself (js/intro/main.js), through the tap and its lab. Any wheel, touch, click or key
 * (other than P) hands the page back to the visitor. About a minute to the close-up.
 */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // The card intro's reading holds, in screens of its scroll (js/intro/timeline.js
  // scrollFrames): the middle of each, and how long to stay (seconds).
  const INTRO_HOLDS = [[.64, 2.4], [1.68, 2.6], [2.23, 1.6], [3.43, 3], [5.1, 3.2], [7.63, 3], [9.1, 0]];
  const PACE = .3;           // the card intro's scroll scale (PACE in js/intro/timeline.js)
  // After the landing's opening (js/landing.js announces its end), a little longer while the
  // taps' and the card intro's 3D load behind it (they wait for the opening to end).
  const LOADING = 2.6;
  const TAPS = 14.2;         // the everyday taps, all three once (js/taps.js LOOP_ALL)

  let run = null;
  const badge = document.createElement('p');
  badge.className = 'presenting';
  badge.setAttribute('role', 'status');
  badge.hidden = true;
  badge.textContent = 'Playing by itself. Press P to stop.';
  document.body.append(badge);

  const smoother = t => t * t * t * (t * (6 * t - 15) + 10);

  // Where each stop is, worked out from the page as it is laid out now.
  function plan() {
    const taps = document.getElementById('taps'), intro = document.getElementById('what-is-rfid');
    const stops = [{ y: () => 0, hold: LOADING, afterOpening: true }];
    if (taps) stops.push({ y: () => taps.offsetTop, hold: TAPS, travel: 1.8 });
    if (intro) for (const [screens, hold] of INTRO_HOLDS) {
      stops.push({ y: () => intro.offsetTop + screens * PACE * innerHeight, hold, travel: 1.3 });
    }
    return stops;
  }

  function start() {
    if (run) return;
    run = { stops: plan(), i: 0, phase: 'hold', since: performance.now(), from: scrollY, to: 0 };
    if (scrollY > 4) { run.phase = 'travel'; run.to = run.stops[0].y(); }
    // The card intro's hold at "Here's how" (js/intro/hold.js) stands aside while this runs.
    window.__presenting = true;
    badge.hidden = false;
    for (const type of ['wheel', 'touchstart', 'pointerdown']) addEventListener(type, stop, { passive: true, capture: true });
    requestAnimationFrame(tick);
  }

  function stop() {
    if (!run) return;
    run = null;
    window.__presenting = false;
    badge.hidden = true;
    for (const type of ['wheel', 'touchstart', 'pointerdown']) removeEventListener(type, stop, { capture: true });
  }

  function tick(now) {
    if (!run) return;
    const stop_ = run.stops[run.i], elapsed = (now - run.since) / 1000;
    if (run.phase === 'travel') {
      // Glide to the stop, softly in and out.
      const duration = reduce.matches ? 0 : stop_.travel ?? 1.5;
      const k = duration ? Math.min(1, elapsed / duration) : 1;
      scrollTo(0, run.from + (run.to - run.from) * smoother(k));
      if (k >= 1) { run.phase = 'hold'; run.since = now; }
    } else if (stop_.afterOpening && !window.__openingDone) {
      run.since = now;   // the hold counts from the end of the landing's opening
    } else if (elapsed >= stop_.hold) {
      run.i++;
      if (run.i >= run.stops.length) { stop(); return; }
      run.phase = 'travel';
      run.since = now;
      run.from = scrollY;
      // Where it is going, read once (reading the layout every frame would slow the glide).
      run.to = run.stops[run.i].y();
    }
    requestAnimationFrame(tick);
  }

  addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'p' || event.key === 'P') { event.preventDefault(); run ? stop() : start(); }
    else if (run) stop();
  });

  if (new URLSearchParams(location.search).has('play')) {
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  }
}());
