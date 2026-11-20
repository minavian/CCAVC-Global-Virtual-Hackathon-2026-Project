/*
 * The story after the hero, played like a film by scrolling.
 *
 *   1. The objects drop out of the hero's diagonal into a straight line.
 *   2. "This is RFID technology."
 *   3. The key fob is chosen: the others leave, it moves right, text appears on the left.
 *   4. It opens (its own Explode animation), the shells slide away, the camera moves in on
 *      the coil and the chip, and the parts are labelled.
 *
 * Everything here is a pure function of the scroll position `s`, measured in screens
 * (1 = one viewport height of scrolling), so scrubbing backwards replays it exactly.
 * landing.js owns the 3D scene; this file owns the timeline and the words on screen.
 *
 * window.RFIDStory.create() returns { length, chapters, timeline(s), paint(state, points) }.
 */
(function () {
  'use strict';

  const LENGTH = 5.1;                       // screens of scrolling after the hero
  const TIME = {
    hero: [0, .38],                         // the hero's words leave
    drop: { start: .06, stagger: .1, span: .55 },
    titleIn: [.62, 1.02],
    titleOut: [1.4, 1.66],
    feature: [1.42, 2.08],                  // the fob moves right, the others leave
    open: [2.25, 3.15],                     // the fob opens
    inside: [3.2, 3.85],                    // the shells slide away; the camera moves in on the inside
    labels: { start: 3.62, stagger: .16, span: .3 },
    beats: [[1.72, 2.36], [2.42, 3.3], [3.42, Infinity]]
  };
  const CHAPTERS = [['Intro', 0], ['RFID', .85], ['Key fob', 1.95], ['Inside', 3.55]];

  // Parts of the open key fob to label. The line starts at `aim` on `part` (a fraction of
  // the part's half-size from its centre, x right and y down). The label sits just outside
  // `frame` (the whole piece the part belongs to) on `side`, so it never covers the object,
  // whatever size the object is drawn at. `narrowSide` is used on phones.
  const CALLOUTS = [
    { part: 'copper-winding-and-leads', frame: 'antenna-coil', aim: [.96, -.15], side: 'right', narrowSide: 'top',
      title: 'Copper antenna coil', text: 'Catches the reader’s magnetic field.' },
    { part: 'two-ceramic-tuning-capacitors', frame: 'rfid-chip', aim: [0, 0], side: 'top', narrowSide: 'top',
      title: 'Tuning capacitors', text: 'Tune the coil to the reader’s frequency.' },
    { part: 'rfid-ic-package', frame: 'rfid-chip', aim: [0, 0], side: 'bottom', narrowSide: 'bottom',
      title: 'Transponder chip', text: 'Stores the ID. Wakes when the coil powers it.' }
  ];

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const span = ([a, b], s) => clamp01((s - a) / (b - a));
  const easeOut = p => 1 - (1 - p) ** 3;
  const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

  function create() {
    const $ = s => document.querySelector(s);
    const copy = $('.copy'), title = $('.story-title'), words = [...title.querySelectorAll('.word')];
    const titleLine = title.querySelector('p'), beats = [...document.querySelectorAll('.beat')];
    const cue = $('.scroll-cue'), fill = $('.chapters-fill'), lines = $('.callout-lines');
    const chapterButtons = [...document.querySelectorAll('.chapters button')];
    document.documentElement.style.setProperty('--story-length', LENGTH);

    // Build the labels and their leader lines once.
    const svg = 'http://www.w3.org/2000/svg';
    const labels = CALLOUTS.map(c => {
      const el = document.createElement('div');
      el.className = 'callout';
      el.innerHTML = `<b>${c.title}</b><span>${c.text}</span>`;
      $('.callouts').append(el);
      const line = document.createElementNS(svg, 'path');
      const dot = document.createElementNS(svg, 'circle');
      dot.setAttribute('r', '3.5');
      lines.append(line, dot);
      return { ...c, el, line, dot };
    });

    chapterButtons.forEach((button, i) => button.addEventListener('click', () => {
      scrollTo({ top: CHAPTERS[i][1] * innerHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));

    function timeline(s) {
      const n = 3;
      return {
        s,
        hero: easeInOut(span(TIME.hero, s)),
        drop: Array.from({ length: n }, (_, i) => clamp01((s - TIME.drop.start - i * TIME.drop.stagger) / TIME.drop.span)),
        titleIn: span(TIME.titleIn, s),
        titleOut: easeInOut(span(TIME.titleOut, s)),
        feature: easeInOut(span(TIME.feature, s)),
        open: easeInOut(span(TIME.open, s)),
        inside: easeInOut(span(TIME.inside, s)),
        labels: CALLOUTS.map((_, k) => easeOut(clamp01((s - TIME.labels.start - k * TIME.labels.stagger) / TIME.labels.span))),
        beats: TIME.beats.map(([a, b]) => Math.min(clamp01((s - a) / .18), 1 - clamp01((s - b) / .14))),
        callouts: [...new Set(CALLOUTS.flatMap(c => [c.part, c.frame]))]
      };
    }

    // `points` maps a part name to its [x, y, halfWidth, halfHeight] on screen, or is empty
    // while there is no 3D.
    function paint(state, points = {}, ready = true) {
      const { s } = state;
      const narrow = innerWidth < 760 || innerWidth < innerHeight;

      // The hero's words rise and fade as the film begins.
      if (state.hero > 0) {
        copy.style.transform = `translateY(${(-state.hero * 14).toFixed(2)}vh)`;
        copy.style.opacity = (1 - state.hero).toFixed(3);
      } else if (copy.style.transform) {
        copy.style.transform = copy.style.opacity = '';
      }
      cue.style.opacity = ready ? (1 - clamp01(s / .12)).toFixed(3) : '0';

      // "This is RFID technology." Each word lifts from faint to solid, then all of it leaves.
      const out = state.titleOut;
      title.style.opacity = (state.titleIn > 0 ? 1 - out : 0).toFixed(3);
      title.style.transform = `translateY(${(-out * 40).toFixed(1)}px)`;
      title.style.visibility = state.titleIn > 0 && out < 1 ? 'visible' : 'hidden';
      words.forEach((word, j) => {
        const q = easeOut(clamp01((state.titleIn - j * .14) / .5));
        word.style.opacity = (.12 + .88 * q).toFixed(3);
        word.style.transform = `translateY(${((1 - q) * .18).toFixed(3)}em) scale(${(.94 + .06 * q).toFixed(4)})`;
      });
      const lineIn = easeOut(clamp01((state.titleIn - .55) / .45));
      titleLine.style.opacity = lineIn.toFixed(3);
      titleLine.style.transform = `translateY(${((1 - lineIn) * 12).toFixed(1)}px)`;

      // The words on the left, one beat at a time.
      beats.forEach((beat, k) => {
        const q = state.beats[k];
        beat.style.opacity = q.toFixed(3);
        beat.style.transform = `translateY(${((1 - q) * 24).toFixed(1)}px)`;
        beat.style.visibility = q > .001 ? 'visible' : 'hidden';
      });

      // Labels on the open fob, joined to their parts by hairlines.
      const minX = narrow ? 12 : innerWidth * .46;
      labels.forEach((label, k) => {
        const q = state.labels[k], point = points[label.part];
        if (!point || q <= .001) {
          label.el.style.opacity = '0';
          label.line.setAttribute('opacity', '0'); label.dot.setAttribute('opacity', '0');
          return;
        }
        // The spot the line starts from, on the part itself.
        const [cx, cy, hw = 0, hh = 0] = point;
        const px = cx + label.aim[0] * hw, py = cy + label.aim[1] * hh;
        // The whole piece it belongs to; the label goes just outside it.
        const [fx, fy, fw, fh] = points[label.frame] || point;
        const w = label.el.offsetWidth, h = label.el.offsetHeight, gap = narrow ? 18 : 30;
        const place = side => side === 'top' ? [px - 14, fy - fh - gap - h]
          : side === 'bottom' ? [px - 14, fy + fh + gap]
          : side === 'right' ? [fx + fw + gap, py - h / 2]
          : [fx - fw - gap - w, py - h / 2];
        let side = narrow ? label.narrowSide : label.side;
        let [lx, ly] = place(side);
        if (side === 'right' && lx + w > innerWidth - 12) [lx, ly] = place(side = 'top');
        lx = Math.min(Math.max(lx, minX), innerWidth - w - 12);
        ly = Math.min(Math.max(ly, 12), innerHeight - h - 12);
        // The line meets the label's nearest edge: straight up or down to it, or across.
        const anchorX = side === 'right' ? lx - 8 : side === 'left' ? lx + w + 8 : Math.min(Math.max(px, lx + 4), lx + w - 4);
        const anchorY = side === 'top' ? ly + h + 8 : side === 'bottom' ? ly - 8 : Math.min(Math.max(py, ly + 4), ly + h - 4);
        label.el.style.transform = `translate(${lx.toFixed(1)}px, ${(ly + (1 - q) * 10).toFixed(1)}px)`;
        label.el.style.opacity = q.toFixed(3);
        // The line draws itself from the part out to the label.
        const ex = px + (anchorX - px) * q, ey = py + (anchorY - py) * q;
        label.line.setAttribute('d', `M${px.toFixed(1)} ${py.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
        label.line.setAttribute('opacity', q.toFixed(3));
        label.dot.setAttribute('cx', px.toFixed(1)); label.dot.setAttribute('cy', py.toFixed(1));
        label.dot.setAttribute('opacity', q.toFixed(3));
      });

      // The chapter bar works like a video's scrubber.
      fill.style.transform = `scaleX(${clamp01(s / LENGTH).toFixed(4)})`;
      let active = 0;
      CHAPTERS.forEach(([, at], i) => { if (s >= at - .05) active = i; });
      chapterButtons.forEach((b, i) => {
        if (i === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }

    return { length: LENGTH, chapters: CHAPTERS, timeline, paint };
  }

  window.RFIDStory = { create };
})();
