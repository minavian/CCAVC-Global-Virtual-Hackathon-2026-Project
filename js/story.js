/*
 * The first two minutes after the opening, played like a film by scrolling (SCRIPT.md,
 * Part 1). One plain sentence is on screen at a time, always in the same place, and a part
 * is labelled only while the sentence names it.
 *
 *   Scene 2  Inside      "They all use RFID." / "Inside each one: a coil and a chip."
 *   Scene 3  No battery  The key opens; the visitor pulls its battery out (or scrolling does).
 *   Scenes 4–6           Power, Reply, Break it: the lab (js/lab.js) runs the reader and the
 *                        key, and supplies the sentences that depend on what the visitor does.
 *
 * Everything here is a function of the scroll position `s`, measured in screens (1 = one
 * viewport height), plus the battery, which the visitor can pull by hand.
 * landing.js owns the 3D scene; this file owns the timeline, the sentence and the labels.
 *
 * window.RFIDStory.create() returns { length, chapters, time, timeline(s), paint(state, points, ready, lab) }.
 */
(function () {
  'use strict';

  const LENGTH = 10.8;                      // screens of scrolling after the hero
  const TIME = {
    hero: [0, .38],                         // the hero's words leave
    drop: { start: .06, stagger: .1, span: .55 },
    glass: [1.05, 1.4],                     // all three turn to glass
    feature: [1.95, 2.55],                  // the key comes forward, the others step aside
    open: [2.55, 3.1],                      // the key opens
    pull: [4.0, 4.4],                       // scrolling pulls the battery out, if no hand did
    cardBack: [4.9, 5.25],                  // the card returns, in glass
    leave: [5.75, 6.1],                     // the card leaves, the key closes, still in glass
    reader: [5.85, 6.35],                   // the reader rises
    lab: 6.1,                               // the lab runs from here
    power: 6.45,                            // the lab's power sentences from here
    reply: 7.6,                             // scene 5
    spell: 8.9,                             // "The changes spell the key's ID."
    breakIt: 9.35                           // scene 6
  };
  const CHAPTERS = [['Intro', 0], ['Inside', .5], ['No battery', 1.95], ['Power', 5.85], ['Reply', 7.6], ['Break it', 9.35]];

  // The sentences that only depend on the scroll: [from, to, sentence].
  const SAY = [
    [.5, 1.05, 'They all use RFID.'],
    [1.05, 1.9, 'Inside each one: a coil and a chip.'],
    [2.55, 3.0, 'The key has a battery.'],
    [6.0, 6.45, 'This is a reader.'],
    [7.6, 7.9, 'Now the chip replies.'],
    [7.9, 8.2, 'It has no radio.'],
    [8.2, 8.55, 'It takes more power, then less.'],
    [8.55, 8.9, 'The reader feels each change.']
  ];
  // After the battery is out.
  const AFTER = [
    [3.0, 4.5, 'The buttons stop working.'],
    [4.5, 4.9, 'The coil and chip don’t need it.'],
    [4.9, 5.3, 'Your bank card has no battery at all.'],
    [5.3, 5.9, 'So what powers its chip?']
  ];

  // Labels: `object` is 0 key, 1 phone, 2 card, 3 reader. `when` names the sentence that
  // shows it. The line starts on `part` (at `aim`, a fraction of its half-size), and the label
  // sits outside `frame` ('*' = the whole object) on `side`.
  const COIL_AIM = [[.6, -.5], [.6, -.5], [.985, -.4]];
  const CALLOUTS = [
    ...[0, 1, 2].flatMap(object => [
      { object, part: 'coil', frame: '*', aim: COIL_AIM[object], side: 'top', narrowSide: 'top', title: 'Coil', when: ['Inside each one: a coil and a chip.'] },
      { object, part: 'chip', frame: '*', aim: [0, 0], side: 'bottom', narrowSide: 'bottom', title: 'Chip', when: ['Inside each one: a coil and a chip.'] }
    ]),
    { object: 0, part: 'coin-battery', frame: 'coin-battery', aim: [0, .6], side: 'bottom', narrowSide: 'bottom', title: 'Battery', when: ['The key has a battery.', 'Pull it out.'] },
    { object: 0, part: 'lock-button', frame: '*', aim: [0, 0], side: 'left', narrowSide: 'top', title: 'Buttons', when: ['The buttons stop working.'] },
    { object: 0, part: 'coil', frame: 'coil', aim: [.96, -.2], side: 'top', narrowSide: 'top', title: 'Coil', when: ['The coil and chip don’t need it.'] },
    { object: 0, part: 'chip', frame: 'rfid-chip', aim: [0, 0], side: 'bottom', narrowSide: 'bottom', title: 'Chip', when: ['The coil and chip don’t need it.'] },
    { object: 3, part: '*', frame: '*', aim: [.7, 0], side: 'right', narrowSide: 'bottom', title: 'Reader', when: ['This is a reader.', 'Move the key to the reader.'] }
  ];

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const span = ([a, b], s) => clamp01((s - a) / (b - a));
  const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  const inRange = (list, s) => list.find(([a, b]) => s >= a && s < b)?.[2] || '';

  function create() {
    const $ = s => document.querySelector(s);
    const copy = $('.copy'), say = $('#say');
    const cue = $('.scroll-cue'), fill = $('.chapters-fill'), lines = $('.callout-lines');
    const chapterButtons = [...document.querySelectorAll('.chapters button')];
    const handle = $('.battery-handle');
    const track = $('.track');   // the story's scroll starts here, after the everyday taps
    document.documentElement.style.setProperty('--story-length', LENGTH);

    const svg = 'http://www.w3.org/2000/svg';
    const labels = CALLOUTS.map(c => {
      const el = document.createElement('div');
      el.className = 'callout';
      el.innerHTML = `<b>${c.title}</b>`;
      $('.callouts').append(el);
      const line = document.createElementNS(svg, 'path');
      const dot = document.createElementNS(svg, 'circle');
      dot.setAttribute('r', '3');
      lines.append(line, dot);
      return { ...c, el, line, dot, q: 0 };
    });

    chapterButtons.forEach((button, i) => button.addEventListener('click', () => {
      scrollTo({ top: track.offsetTop + CHAPTERS[i][1] * innerHeight + (i ? 2 : 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));

    // ---------- The battery, by hand ----------
    // The handle sits over the battery. Dragging it moves the battery; far enough, and it
    // comes out for good (until the visitor scrolls back before the key opened).
    const battery = { x: 0, y: 0, freed: false, since: 0, drag: null, scale: 1 };
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
      if (!battery.freed) battery.x = battery.y = 0;
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
      if (s < TIME.open[0]) { battery.freed = false; battery.x = battery.y = 0; }
      const byHand = battery.freed ? easeInOut(clamp01((performance.now() - battery.since) / 700)) : 0;
      const out = Math.max(byHand, easeInOut(span(TIME.pull, s)));
      const leave = easeInOut(span(TIME.leave, s));
      return {
        s,
        hero: easeInOut(span(TIME.hero, s)),
        drop: [0, 1, 2].map(i => clamp01((s - TIME.drop.start - i * TIME.drop.stagger) / TIME.drop.span)),
        glass: easeInOut(span(TIME.glass, s)),
        feature: easeInOut(span(TIME.feature, s)),
        open: easeInOut(span(TIME.open, s)) * (1 - leave),
        battery: { out, x: battery.freed ? battery.x * (1 - out) : battery.x, y: battery.freed ? battery.y * (1 - out) : battery.y },
        power: 1 - out,
        cardBack: easeInOut(span(TIME.cardBack, s)) * (1 - leave),
        leave,
        reader: easeInOut(span(TIME.reader, s)),
        lab: s >= TIME.lab,
        mode: s >= TIME.breakIt ? 'break' : s >= TIME.reply ? 'reply' : s >= TIME.lab ? 'power' : null,
        spell: s >= TIME.spell,
        breakIt: s >= TIME.breakIt,
        callouts: CALLOUTS.map(c => [c.object, c.part, c.frame])
      };
    }

    // The one sentence for this moment. The lab speaks for itself in the power and break
    // scenes, and when the key is out of reach during the reply.
    function sentence(st, lab) {
      const s = st.s;
      if (s < TIME.open[0] || s >= TIME.reader[0] && s < TIME.power) return inRange(SAY, s);
      if (s < TIME.reader[0]) {
        if (s < 3.0) return inRange(SAY, s);
        return st.battery.out > .5 ? inRange(AFTER, s) : 'Pull it out.';
      }
      if (!lab) return '';
      if (st.mode === 'power' || st.mode === 'break') return lab.say;
      if (!lab.awake) return 'Move the key to the reader.';
      if (s >= TIME.spell) return lab.idOk ? 'That’s the “ID” in RFID.' : 'The changes spell the key’s ID.';
      return inRange(SAY, s);
    }

    let shown = null;
    function speak(text) {
      if (text === shown) return;
      shown = text;
      say.textContent = text;
      say.classList.remove('is-new');
      void say.offsetWidth;                 // restart the fade-in
      say.classList.add('is-new');
    }

    // `points` maps "object:part" to its [x, y, halfWidth, halfHeight] on screen, or is
    // empty while there is no 3D.
    function paint(state, points = {}, ready = true, lab = null) {
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

      const text = state.hero >= .6 ? sentence(state, lab) : '';
      speak(text);

      // Labels: only the ones the sentence names, joined to their parts by hairlines.
      labels.forEach(label => {
        const want = text && label.when.includes(text) ? 1 : 0;
        label.q += (want - label.q) * .2;
        if (Math.abs(want - label.q) < .01) label.q = want;
        const q = label.q;
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
        if (side === 'left' && lx < 12) [lx, ly] = place(side = 'bottom');
        lx = Math.min(Math.max(lx, 12), innerWidth - w - 12);
        ly = Math.min(Math.max(ly, 12), innerHeight - h - 12);
        const anchorX = side === 'right' ? lx - 6 : side === 'left' ? lx + w + 6 : Math.min(Math.max(px, lx + 4), lx + w - 4);
        const anchorY = side === 'top' ? ly + h + 6 : side === 'bottom' ? ly - 6 : Math.min(Math.max(py, ly + 4), ly + h - 4);
        label.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
        label.el.style.opacity = q.toFixed(3);
        label.line.setAttribute('d', `M${px.toFixed(1)} ${py.toFixed(1)}L${anchorX.toFixed(1)} ${anchorY.toFixed(1)}`);
        label.line.setAttribute('opacity', q.toFixed(3));
        label.dot.setAttribute('cx', px.toFixed(1)); label.dot.setAttribute('cy', py.toFixed(1));
        label.dot.setAttribute('opacity', q.toFixed(3));
      });

      // The battery's handle sits over the battery while the sentence asks for it.
      const cell = points['0:coin-battery'];
      const canPull = cell && (text === 'Pull it out.' || text === 'The key has a battery.') && state.battery.out < .02 && !battery.freed;
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
