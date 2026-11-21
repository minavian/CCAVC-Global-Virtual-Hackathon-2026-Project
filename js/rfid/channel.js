/*
 * The channel joins a reader to the cards in its field, through the air, and records
 * everything for drawing. It is the only place that knows both sides.
 *
 * cardChannel(cards, options).send(bits):
 *   1. turns the reader's bits into pauses (modified Miller);
 *   2. lets every powered card feel those pauses, decode them itself, and decide;
 *      a card whose stored energy runs out during a pause resets instead (scene 10);
 *   3. turns each answering card's bits into its switch pattern, starting after the
 *      standard's waiting time;
 *   4. renders what the reader's coil hears: the pauses, every card's load, and noise.
 * It returns { samples, from } for the reader, and keeps a recording of every exchange.
 *
 * cards: [{ chip (tag.cardChip), depth (0..1, physics dip), awake (physics) }]
 * options: noise, seed, storage { capacitance (F), current (A), volts (V), reset (V) }
 *
 * keyRecording(key, options) renders the key repeating its message for `repeats` rounds.
 *
 * window.RFID.channel (browser) or require('./channel.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./iso14443a.js'), require('./lf.js'), require('./air.js'));
  else (root.RFID = root.RFID || {}).channel = factory(root.RFID.iso, root.RFID.lf, root.RFID.air);
}(typeof self !== 'undefined' ? self : this, function (iso, lf, air) {
  'use strict';

  const LEAD = 40;          // quiet samples before the reader's command
  const TAIL = 3 * iso.BIT; // quiet samples after the answer

  function cardChannel(cards, { noise = .0015, seed = 11, storage = null } = {}) {
    const recording = [];
    let exchanges = 0;
    for (const c of cards) if (c.awake) c.chip.powerUp();

    // Does a card ride through a pause on its stored energy? The chip draws `current` from a
    // capacitor charged to `volts`; it resets if the voltage falls below `reset`.
    const ridesThrough = pauseSeconds => {
      if (!storage) return true;
      const drop = storage.current * pauseSeconds / Math.max(storage.capacitance, 1e-15);
      return storage.volts - drop >= storage.reset;
    };

    function send(bits) {
      const { pauses, length } = iso.millerPauses(bits);
      const at = pauses.map(p => p + LEAD);
      const lastPause = at[at.length - 1];
      // What each card feels, and how it decodes it (from the field alone).
      const field = air.fieldAtTag(LEAD + length + 2 * iso.BIT, at, iso.PAUSE);
      const felt = air.findPauses(field);
      const pauseSeconds = iso.PAUSE / iso.SAMPLE_RATE;
      const answers = [];
      for (const c of cards) {
        if (!c.awake) continue;
        if (!ridesThrough(pauseSeconds)) { c.chip.powerDown(); c.brownOut = true; continue; }
        const decoded = iso.millerDecode(felt);
        const answer = c.chip.hear(decoded);
        if (answer) answers.push({ card: c, answer });
      }
      // The answers, after the standard's wait from the last pause.
      const begin = lastPause + iso.PAUSE + iso.answerDelay(bits[bits.length - 1]);
      const loads = answers.map(({ card, answer }) => ({ at: begin, pattern: iso.manchesterSwitch(answer.bits), depth: card.depth }));
      const answerLength = Math.max(0, ...loads.map(l => l.pattern.length));
      const total = begin + answerLength + TAIL;
      const samples = air.render({ length: total, pauses: at, pauseLength: iso.PAUSE, loads, noise, seed: seed + 7919 * exchanges++ });
      const from = lastPause + iso.PAUSE;
      recording.push({ bits, samples, from, begin, answers: answers.map(a => ({ name: a.answer.name, bits: a.answer.bits, card: cards.indexOf(a.card) })) });
      return { samples, from };
    }
    return { send, recording, cards };
  }

  function keyRecording(key, { depth = .05, noise = .002, seed = 5, repeats = 2, offset = 0 } = {}) {
    const message = key.message;
    const bits = Array.from({ length: repeats }, () => message).flat();
    const pattern = lf.manchesterSwitch(bits);
    const lead = offset % pattern.length;
    // Start somewhere in the middle of a message, as a reader would.
    const rotated = new Uint8Array(pattern.length);
    rotated.set(pattern.subarray(lead)); rotated.set(pattern.subarray(0, lead), pattern.length - lead);
    const samples = air.render({ length: rotated.length, loads: [{ at: 0, pattern: rotated, depth }], noise, seed });
    return { samples, pattern: rotated, bits };
  }

  return { cardChannel, keyRecording };
}));
