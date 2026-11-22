/*
 * The air between reader and tag: turns who did what, and when, into the samples a reader
 * would measure in its own coil.
 *
 *   level 1      the reader's field at full strength (its coil current, as a fraction)
 *   pauses       the reader switching its field off; the field dies away and comes back
 *                over a few samples, not instantly, because the coil is tuned (it rings)
 *   loads        each tag's switch: while it is closed, the reader's current changes by
 *                that tag's `depth` (from physics.solve().dip). Shown as a dip.
 *   noise        random noise in the reader's receiver, as a fraction of full strength
 *
 * render() is what the reader hears. fieldAtTag() is what a tag feels: the same pauses,
 * without the reader's receiver noise.
 *
 * window.RFID.air (browser) or require('./air.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tag.js'));
  else (root.RFID = root.RFID || {}).air = factory(root.RFID.tag);
}(typeof self !== 'undefined' ? self : this, function (tag) {
  'use strict';

  // Normally distributed noise from a seeded generator (Box-Muller).
  function gaussian(rand) {
    let spare = null;
    return () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
  }

  // The field's strength over time: 1, falling toward 0 during each pause and recovering
  // after it, with a time constant of `ring` samples.
  function fieldAtTag(length, pauses, pauseLength, ring = 1.6) {
    const out = new Float32Array(length), off = new Uint8Array(length);
    for (const p of pauses) off.fill(1, Math.max(0, p), Math.min(length, p + pauseLength));
    const k = 1 - Math.exp(-1 / ring);
    let level = 1;
    for (let n = 0; n < length; n++) {
      level += ((off[n] ? 0 : 1) - level) * k;
      out[n] = level;
    }
    return out;
  }

  /*
   * What the reader hears.
   *   length       samples
   *   pauses       sample positions where the reader's pauses start
   *   pauseLength  samples per pause
   *   loads        [{ at, pattern (Uint8Array, 1 = switch closed), depth }]
   *   noise        standard deviation, as a fraction of full strength
   *   seed         for repeatable noise
   */
  function render({ length, pauses = [], pauseLength = 8, loads = [], noise = 0, seed = 7, ring = 1.6 }) {
    const out = fieldAtTag(length, pauses, pauseLength, ring);
    for (const { at, pattern, depth } of loads) {
      for (let k = 0; k < pattern.length; k++) {
        const n = at + k;
        if (n >= 0 && n < length && pattern[k]) out[n] *= 1 - depth;
      }
    }
    if (noise > 0) {
      const g = gaussian(tag.random(seed));
      for (let n = 0; n < length; n++) out[n] += noise * g();
    }
    return out;
  }

  // Where a tag notices pauses: the field drops below half strength.
  function findPauses(field) {
    const out = [];
    for (let n = 1; n < field.length; n++) if (field[n] < .5 && field[n - 1] >= .5) out.push(n);
    return out;
  }

  return { render, fieldAtTag, findPauses, gaussian };
}));
