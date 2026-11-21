/*
 * The first two minutes after the opening, played like a film by scrolling.
 *
 *   Scene 2  Look inside   The three objects line up and turn to glass. Inside each, a copper
 *                          coil and a tiny chip glow: the same two parts.
 *   Scene 3  No battery    The key comes forward and opens. The visitor drags its battery out
 *                          (or scrolling pulls it out). The buttons die; the coil and the chip
 *                          don't care. The card comes back: it has no battery at all.
 *   Scenes 4–5             The reader rises and the lab takes over (js/lab.js).
 *
 * Everything here is a function of the scroll position `s`, measured in screens (1 = one
 * viewport height), plus the one thing the visitor does by hand: pull the battery out.
 * landing.js owns the 3D scene; this file owns the timeline, the words and the labels.
 *
 * window.RFIDStory.create() returns { length, chapters, timeline(s), paint(state, points, ready) }.
 */
(function () {
  'use strict';

  const LENGTH = 9.6;                       // screens of scrolling after the hero
  const TIME = {
    hero: [0, .38],                         // the hero's words leave
    drop: { start: .06, stagger: .1, span: .55 },
    titleIn: [.62, 1.0],
    glass: [1.05, 1.45],                    // all three turn to glass
    insideLine: [1.25, 1.55],
    labelsInside: { start: 1.3, stagger: .07, span: .26 },
    titleOut: [2.0, 2.3],
    feature: [2.1, 2.75],                   // the key comes forward, the others step aside
    open: [2.8, 3.5],                       // the key opens
    labelsOpen: { start: 3.45, stagger: .09, span: .3 },
    pull: [4.25, 4.75],                     // scrolling pulls the battery out, if no hand did
    cardBack: [4.95, 5.35],                 // the card returns, in glass
    leave: [5.7, 6.1],                      // the card leaves, the key closes, still in glass
    reader: [5.9, 6.4],                     // the reader rises; the lab starts at 6.2
    lab: 6.2,
    breakIt: 7.7,
    beats: [[3.4, 4.95], [4.95, 5.7]]       // "Drag the battery out" … and "So what powers it?"
  };
  const CHAPTERS = [['Intro', 0], ['RFID', .85], ['Inside', 1.35], ['No battery', 2.4], ['The reader', 6.3], ['Break it', 7.8]];

  // Labels. `object` is 0 key, 1 phone, 2 card, 3 reader. The line starts on `part` (at `aim`,
  // a fraction of its half-size); the label sits outside `frame` ('*' = the whole object).
  // Where on each coil the line lands: the key's and phone's coils are compact loops; the
  // card's runs right around its edge.
  const COIL_AIM = [[.6, -.5], [.6, -.5], [.985, -.4]];
  const INSIDE = [0, 1, 2].flatMap(object => [
    { object, part: 'coil', frame: '*', aim: COIL_AIM[object], side: 'top', narrowSide: 'top', title: 'Coil', group: 'inside' },
    { object, part: 'chip', frame: '*', aim: [0, 0], side: 'bottom', narrowSide: 'bottom', title: 'Chip', group: 'inside' }
  ]);
  const OPEN = [
    { object: 0, part: 'lock-button', frame: '*', aim: [0, 0], side: 'right', narrowSide: 'top', title: 'Buttons', group: 'open' },
    { object: 0, part: 'coin-battery', frame: '*', aim: [0, .2], side: 'left', narrowSide: 'bottom', title: 'Battery', group: 'open', battery: true },
    { object: 0, part: 'coil', frame: 'coil', aim: [.96, -.2], side: 'top', narrowSide: 'top', title: 'RFID coil', group: 'open' },
    { object: 0, part: 'chip', frame: 'rfid-chip', aim: [0, 0], side: 'bottom', narrowSide: 'bottom', title: 'RFID chip', group: 'open' }
  ];
  const CALLOUTS = [...INSIDE, ...OPEN];

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const span = ([a, b], s) => clamp01((s - a) / (b - a));
  const easeOut = p => 1 - (1 - p) ** 3;
  const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

  function create() {
    const $ = s => document.querySelector(s);
    const copy = $('.copy'), title = $('.story-title'), words = [...title.querySelectorAll('h2 .word')];
    const titleLines = [...title.querySelectorAll('p')], beats = [...document.querySelectorAll('.story-panel .beat')];
    const cue = $('.scroll-cue'), fill = $('.chapters-fill'), lines = $('.callout-lines');
    const chapterButtons = [...document.querySelectorAll('.chapters button')];
    const handle = $('.battery-handle'), dead = $('.beat-dead'), deadWords = $('.beat-dead-words');
    document.documentElement.style.setProperty('--story-length', LENGTH);

    // Build the labels and their leader lines once.
    const svg = 'http://www.w3.org/2000/svg';
    const labels = CALLOUTS.map(c => {
      const el = document.createElement('div');
      el.className = 'callout callout-' + c.group;
      el.innerHTML = `<b>${c.title}</b>`;
      $('.callouts').append(el);
      const line = document.createElementNS(svg, 'path');
      const dot = document.createElementNS(svg, 'circle');
      dot.setAttribute('r', '3');
      lines.append(line, dot);
      return { ...c, el, line, dot };
    });

    chapterButtons.forEach((button, i) => button.addEventListener('click', () => {
      scrollTo({ top: CHAPTERS[i][1] * innerHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));

    // ---------- The battery, by hand ----------
    // The handle sits over the battery. Dragging it moves the battery; far enough, and it
    // comes out for good (until the visitor scrolls back before the key opened).
    const battery = { x: 0, y: 0, out: 0, freed: false, since: 0, drag: null, scale: 1 };
    handle.addEventListener('pointerdown', e => {
      if (battery.freed) return;
      handle.setPointerCapture(e.pointerId);
      battery.drag = { id: e.pointerId, x: e.clientX - battery.x * battery.scale, y: e.clientY + battery.y * battery.scale };
      handle.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', e => {
      const d = battery.drag;
      if (!d || e.pointerId !== d.id) return;
      battery.x = (e.clientX - d.x) / battery.scale;
      battery.y = -(e.clientY - d.y) / battery.scale;
      if (Math.hypot(battery.x, battery.y) > .022) free();
    });
    const drop = e => {
      if (!battery.drag || e.pointerId !== battery.drag.id) return;
      battery.drag = null;
      handle.classList.remove('is-dragging');
      if (!battery.freed) { battery.x = battery.y = 0; }
    };
    handle.addEventListener('pointerup', drop);
    handle.addEventListener('pointercancel', drop);
    handle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) { e.preventDefault(); free(); }
    });
    function free() {
      if (battery.freed) return;
      battery.freed = true;
      battery.since = performance.now();
      battery.drag = null;
      handle.classList.remove('is-dragging');
      handle.blur();
    }

    function timeline(s) {
      const n = 3;
      // The battery: pulled by hand (animated over 0.7 s), or by scrolling.
      if (s < TIME.open[0]) { battery.freed = false; battery.x = battery.y = 0; }
      const byHand = battery.freed ? easeInOut(clamp01((performance.now() - battery.since) / 700)) : 0;
      const byScroll = easeInOut(span(TIME.pull, s));
      const out = Math.max(byHand, byScroll);
      const leave = easeInOut(span(TIME.leave, s));
      return {
        s,
        hero: easeInOut(span(TIME.hero, s)),
        drop: Array.from({ length: n }, (_, i) => clamp01((s - TIME.drop.start - i * TIME.drop.stagger) / TIME.drop.span)),
        titleIn: span(TIME.titleIn, s),
        titleOut: easeInOut(span(TIME.titleOut, s)),
        glass: easeInOut(span(TIME.glass, s)),
        insideLine: span(TIME.insideLine, s),
        feature: easeInOut(span(TIME.feature, s)),
        open: easeInOut(span(TIME.open, s)) * (1 - leave),
        battery: { out, x: battery.freed ? battery.x * (1 - out) : battery.x, y: battery.freed ? battery.y * (1 - out) : battery.y },
        power: 1 - out,
        cardBack: easeInOut(span(TIME.cardBack, s)) * (1 - leave),
        leave,
        reader: easeInOut(span(TIME.reader, s)),
        lab: s >= TIME.lab,
        breakIt: s >= TIME.breakIt,
        labels: CALLOUTS.map((c, k) => {
          if (c.group === 'inside') {
            const i = INSIDE.indexOf(c);
            const q = easeOut(clamp01((s - TIME.labelsInside.start - i * TIME.labelsInside.stagger) / TIME.labelsInside.span));
            return q * (1 - span([1.95, 2.15], s));
          }
          const i = OPEN.indexOf(c);
          const q = easeOut(clamp01((s - TIME.labelsOpen.start - i * TIME.labelsOpen.stagger) / TIME.labelsOpen.span));
          const gone = c.battery ? out : 0;
          return q * (1 - span([5.55, 5.8], s)) * (1 - gone);
        }),
        beats: TIME.beats.map(([a, b]) => Math.min(clamp01((s - a) / .16), 1 - clamp01((s - b) / .12))),
        callouts: CALLOUTS.map(c => [c.object, c.part, c.frame])
      };
    }

    // `points` maps "object:part" to its [x, y, halfWidth, halfHeight] on screen, or is
    // empty while there is no 3D.
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

      // "This is RFID." Each word lifts from faint to solid; then the lines below it.
      const out = state.titleOut;
      title.style.opacity = (state.titleIn > 0 ? 1 - out : 0).toFixed(3);
      title.style.transform = `translateY(${(-out * 40).toFixed(1)}px)`;
      title.style.visibility = state.titleIn > 0 && out < 1 ? 'visible' : 'hidden';
      words.forEach((word, j) => {
        const q = easeOut(clamp01((state.titleIn - j * .14) / .5));
        word.style.opacity = (.12 + .88 * q).toFixed(3);
        word.style.transform = `translateY(${((1 - q) * .18).toFixed(3)}em) scale(${(.94 + .06 * q).toFixed(4)})`;
      });
      [easeOut(clamp01((state.titleIn - .55) / .45)), easeOut(state.insideLine)].forEach((q, k) => {
        if (!titleLines[k]) return;
        titleLines[k].style.opacity = q.toFixed(3);
        titleLines[k].style.transform = `translateY(${((1 - q) * 12).toFixed(1)}px)`;
      });

      // The words on the left, one beat at a time. The first beat changes once the battery
      // is out: "Drag the battery out." becomes "The buttons die."
      beats.forEach((beat, k) => {
        const q = state.beats[k];
        beat.style.opacity = q.toFixed(3);
        beat.style.transform = `translateY(${((1 - q) * 24).toFixed(1)}px)`;
        beat.style.visibility = q > .001 ? 'visible' : 'hidden';
      });
      const isOut = state.battery.out > .5;
      dead.classList.toggle('is-out', isOut);
      deadWords.setAttribute('aria-hidden', String(!isOut));

      // Labels, joined to their parts by hairlines.
      const minX = narrow ? 12 : 12;
      labels.forEach((label, k) => {
        const q = state.labels[k];
        const point = points[label.object + ':' + label.part];
        if (!point || q <= .001) {
          label.el.style.opacity = '0';
          label.line.setAttribute('opacity', '0'); label.dot.setAttribute('opacity', '0');
          return;
        }
        const [cx, cy, hw = 0, hh = 0] = point;
        const px = cx + label.aim[0] * hw, py = cy + label.aim[1] * hh;
        const [fx, fy, fw, fh] = points[label.object + ':' + label.frame] || point;
        const w = label.el.offsetWidth, h = label.el.offsetHeight, gap = narrow ? 12 : 22;
        const place = side => side === 'top' ? [px - w / 2, fy - fh - gap - h]
          : side === 'bottom' ? [px - w / 2, fy + fh + gap]
          : side === 'right' ? [fx + fw + gap, py - h / 2]
          : [fx - fw - gap - w, py - h / 2];
        let side = narrow ? label.narrowSide : label.side;
        let [lx, ly] = place(side);
        if (side === 'right' && lx + w > innerWidth - 12) [lx, ly] = place(side = 'top');
        if (side === 'left' && lx < minX) [lx, ly] = place(side = 'bottom');
        lx = Math.min(Math.max(lx, minX), innerWidth - w - 12);
        ly = Math.min(Math.max(ly, 12), innerHeight - h - 12);
        const anchorX = side === 'right' ? lx - 6 : side === 'left' ? lx + w + 6 : Math.min(Math.max(px, lx + 4), lx + w - 4);
        const anchorY = side === 'top' ? ly + h + 6 : side === 'bottom' ? ly - 6 : Math.min(Math.max(py, ly + 4), ly + h - 4);
        label.el.style.transform = `translate(${lx.toFixed(1)}px, ${(ly + (1 - q) * 8).toFixed(1)}px)`;
        label.el.style.opacity = q.toFixed(3);
        const ex = px + (anchorX - px) * q, ey = py + (anchorY - py) * q;
        label.line.setAttribute('d', `M${px.toFixed(1)} ${py.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
        label.line.setAttribute('opacity', q.toFixed(3));
        label.dot.setAttribute('cx', px.toFixed(1)); label.dot.setAttribute('cy', py.toFixed(1));
        label.dot.setAttribute('opacity', q.toFixed(3));
      });

      // The battery's handle sits over the battery while it can be pulled.
      const cell = points['0:coin-battery'];
      const canPull = cell && state.beats[0] > .5 && state.battery.out < .02 && !battery.freed;
      handle.hidden = !canPull;
      if (canPull) {
        const r = Math.max(26, Math.max(cell[2], cell[3]) * 1.25);
        battery.scale = Math.max(cell[2], cell[3]) / .009;          // screen pixels per meter
        handle.style.transform = `translate(${(cell[0] - r).toFixed(1)}px, ${(cell[1] - r).toFixed(1)}px)`;
        handle.style.width = handle.style.height = (2 * r).toFixed(1) + 'px';
      }

      // The chapter bar works like a video's scrubber.
      fill.style.transform = `scaleX(${clamp01(s / LENGTH).toFixed(4)})`;
      let active = 0;
      CHAPTERS.forEach(([, at], i) => { if (s >= at - .05) active = i; });
      chapterButtons.forEach((b, i) => {
        if (i === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }

    return { length: LENGTH, chapters: CHAPTERS, time: TIME, timeline, paint };
  }

  window.RFIDStory = { create };
})();
