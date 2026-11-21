/*
 * The reader's receiver. It gets nothing but samples of the current in its own coil, and
 * works out from them what the tag said. It never sees the tag's memory or the simulation's
 * settings; the tests check that it works from the samples alone.
 *
 * Card (13.56 MHz, ISO/IEC 14443 Type A):
 *   1. Measure the quiet field just after its own command: that is the noise floor.
 *   2. Slide a 16-sample window along and measure how much 847.5 kHz flicker (the subcarrier)
 *      it holds, by correlating with a sine and a cosine at that frequency.
 *   3. The first strong window is the start of the answer. From there, every bit is two
 *      half-bit windows: flicker in the first half is a 1, in the second half a 0, in both
 *      halves a clash (two cards disagreeing), in neither the end.
 *   4. Group the bits into bytes and their check bits, and test the check number (CRC).
 *
 * Car key (125 kHz): find the header of nine 1s at every possible alignment, decode the
 * Manchester bits that follow, and keep the alignment whose checks all pass.
 *
 * activate(channel) runs a whole conversation with a card: "Anyone there?", anticollision,
 * selection. `channel.send(bits)` must return { samples, from }: the samples the reader
 * heard during that exchange, and where its own command ended.
 *
 * window.RFID.reader (browser) or require('./reader.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./iso14443a.js'), require('./lf.js'));
  else (root.RFID = root.RFID || {}).reader = factory(root.RFID.iso, root.RFID.lf);
}(typeof self !== 'undefined' ? self : this, function (iso, lf) {
  'use strict';

  const { BIT, HALF } = iso;
  const I_REF = [1, 1, -1, -1], Q_REF = [1, -1, -1, 1];   // one subcarrier cycle is 4 samples

  // Subcarrier strength in samples[n, n + 16).
  function flicker(samples, n) {
    let i = 0, q = 0;
    for (let k = 0; k < HALF; k++) {
      const x = samples[n + k] ?? 0;
      i += x * I_REF[k & 3];
      q += x * Q_REF[k & 3];
    }
    return Math.hypot(i, q);
  }

  /*
   * Find and read a card's answer in `samples`, which follow the reader's command ending at
   * `from`. Returns { found, bits, collisions, start, halves } where bits excludes the start
   * of frame, collisions are bit indexes where both halves flickered, and halves holds every
   * half-bit's strength (for drawing).
   */
  // A card may not answer sooner than the standard's shortest wait (1172 carrier cycles,
  // 293 samples) after the reader's last pause, so the reader listens from just before then.
  // `expect` is how many bits the answer should have (the reader knows from the protocol);
  // without it, the answer ends at the first bit time with no flicker.
  function hearCard(samples, from, { expect = null, maxBits = 64, searchFrom = 270, searchTo = 1000 } = {}) {
    // 1. The noise floor, from the quiet stretch before any card may answer.
    const quiet = [];
    for (let n = from + 24; n + HALF <= from + searchFrom && n + HALF < samples.length; n += HALF) quiet.push(flicker(samples, n));
    const mean = quiet.reduce((a, b) => a + b, 0) / Math.max(1, quiet.length);
    const spread = Math.sqrt(quiet.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, quiet.length));
    const detect = Math.max(mean + 6 * spread, 3 * mean, 2e-3);
    const none = reason => ({ found: false, bits: [], collisions: [], halves: [], noise: mean, reason });

    // 2. The start of frame: flicker in a first half-bit, none in the second, and a real bit
    //    after it. A burst of noise fails these tests, and the search goes on.
    for (let n = from + searchFrom; n < Math.min(samples.length - 3 * BIT, from + searchTo); n++) {
      if (flicker(samples, n) <= detect) continue;
      let start = n, strongest = 0;
      for (let m = n; m < n + HALF; m++) { const v = flicker(samples, m); if (v > strongest) { strongest = v; start = m; } }
      const threshold = Math.max(.25 * strongest, detect);
      const second = flicker(samples, start + HALF);
      const next = Math.max(flicker(samples, start + BIT), flicker(samples, start + BIT + HALF));
      if (second > .5 * strongest || next < threshold) { n = start + HALF; continue; }
      return readBits(samples, start, strongest, second, threshold, mean, expect, maxBits);
    }
    return none('silence');
  }

  // 3. Bit by bit, comparing each bit's two halves: the stronger half wins. Flicker in both,
  //    about equally, is a clash. Without an expected length, flicker in neither is the end.
  function readBits(samples, start, sof, sofSecond, threshold, noise, expect, maxBits) {
    const bits = [], collisions = [], halves = [[sof, sofSecond]];
    for (let i = 1; i <= (expect ?? maxBits); i++) {
      const n = start + i * BIT;
      if (n + BIT > samples.length) break;
      const a = flicker(samples, n), b = flicker(samples, n + HALF);
      halves.push([a, b]);
      const strong = Math.max(a, b), weak = Math.min(a, b);
      if (expect === null && strong < threshold) break;
      if (weak > threshold && weak > .7 * strong) collisions.push(bits.length);
      bits.push(a >= b ? 1 : 0);
    }
    return { found: true, bits, collisions, start, end: start + (bits.length + 2) * BIT, halves, threshold, noise };
  }

  // Read the key's repeating message from samples taken while it was powered.
  function hearKey(samples) {
    const B = lf.BIT, H = lf.HALF;
    let bestResult = { ok: false, reason: 'no header' };
    for (let offset = 0; offset < B; offset++) {
      const bits = [], strength = [];
      for (let n = offset; n + B <= samples.length; n += B) {
        let a = 0, b = 0;
        for (let k = 0; k < H; k++) { a += samples[n + k]; b += samples[n + H + k]; }
        bits.push(a < b ? 1 : 0);                           // a dip in the first half is a 1
        strength.push(Math.abs(a - b) / H);
      }
      // Find a header (nine 1s after a 0) and try to read a message from it.
      for (let i = 1; i + 64 <= bits.length; i++) {
        if (bits[i - 1] !== 0) continue;
        let header = true;
        for (let k = 0; k < 9; k++) if (bits[i + k] !== 1) { header = false; break; }
        if (!header) continue;
        const result = lf.parse(bits.slice(i, i + 64));
        const weakest = Math.min(...strength.slice(i, i + 64));
        if (result.ok) return { ...result, offset, at: offset + i * B, weakest };
        if (!bestResult.errors) bestResult = { ...result, offset, at: offset + i * B, weakest };
      }
    }
    return bestResult;
  }

  // Bits to bytes for an answer that continues a byte the reader had started (anticollision).
  function joinUid(known, received) {
    const data = [...known], parityErrors = [];
    let k = 0;
    while (data.length < 40 && k < received.length) {
      data.push(received[k++]);
      if (data.length % 8 === 0) {
        const at = data.length - 8;
        let b = 0; for (let j = 0; j < 8; j++) b |= data[at + j] << j;
        if (k < received.length && received[k] !== iso.oddParity(b)) parityErrors.push(at / 8);
        k++;                                                  // that byte's check bit
      }
    }
    return { data, parityErrors };
  }

  // Where received frame bit `index` falls among the UID's data bits, given `known` bits.
  function dataIndex(knownCount, index) {
    let data = knownCount, frame = 0;
    while (frame < index) {
      data++; frame++;
      if (data % 8 === 0) frame++;                            // a check bit follows each byte
    }
    return data;
  }

  /*
   * A whole conversation with whatever cards are in the field. Returns the steps (for the
   * chat and the river of bits) and, if all went well, the selected card's UID and SAK.
   *   prefer   which way to settle a clash: 1 ("only cards with a 1 here") or 0
   *   checks   false skips the check bits and check numbers (to show why they exist)
   */
  function activate(channel, { prefer = 1, checks = true, retries = 2 } = {}) {
    const steps = [];
    const exchange = (bits, label, expect) => {
      const heard = channel.send(bits);
      const answer = hearCard(heard.samples, heard.from, { expect });
      const step = { label, sent: bits, heard, answer };
      steps.push(step);
      return step;
    };

    // 1. "Anyone there?"
    let step;
    for (let t = 0; t <= retries; t++) {
      step = exchange(iso.shortFrame(iso.REQA), 'REQA', 18);       // ATQA: 2 bytes and their check bits
      if (step.answer.found) break;
    }
    if (!step.answer.found) return { ok: false, reason: 'No card answered.', steps };
    const atqa = iso.parseStandard(step.answer.bits);
    step.bytes = atqa.bytes;
    if (checks && atqa.parityErrors.length) return { ok: false, reason: 'Check bit failed.', steps };

    // 2. "Tell me your ID", narrowing down until only one card answers.
    let known = [], uid = null;
    for (let round = 0; round < 40 && !uid; round++) {
      // The rest of the UID and its check byte, plus a check bit for each byte that ends.
      const expect = (40 - known.length) + (5 - Math.floor(known.length / 8));
      const s = exchange(iso.anticollisionBits(known), 'ANTICOLLISION', expect);
      s.known = [...known];
      if (!s.answer.found) return { ok: false, reason: 'The card stopped answering.', steps };
      const { collisions, bits } = s.answer;
      if (collisions.length) {
        // A clash: keep the bits before it, pick a side, and ask again.
        const at = dataIndex(known.length, collisions[0]);
        const joined = joinUid(known, bits.slice(0, collisions[0]));
        s.clashAt = at;
        known = [...joined.data.slice(0, at), prefer];
        continue;
      }
      const joined = joinUid(known, bits);
      s.data = joined.data;
      if (joined.data.length < 40) return { ok: false, reason: 'The ID was cut short.', steps };
      const bytes = [];
      for (let b = 0; b < 5; b++) { let v = 0; for (let j = 0; j < 8; j++) v |= joined.data[b * 8 + j] << j; bytes.push(v); }
      s.bytes = bytes;
      if (checks && (joined.parityErrors.length || iso.bcc(bytes.slice(0, 4)) !== bytes[4])) {
        s.failed = true;
        if (round < 3) { known = []; continue; }               // ask again
        return { ok: false, reason: 'The ID failed its checks.', steps };
      }
      uid = bytes.slice(0, 4);
    }
    if (!uid) return { ok: false, reason: 'Could not single out a card.', steps };

    // 3. "OK, I'll talk to you."
    const select = iso.withCrc([iso.SEL1, iso.NVB_SELECT, ...uid, iso.bcc(uid)]);
    const s = exchange(iso.standardFrame(select), 'SELECT', 27);   // SAK: 1 byte, 2 check bytes
    if (!s.answer.found) return { ok: false, reason: 'The card did not confirm.', uid, steps };
    const sak = iso.parseStandard(s.answer.bits);
    s.bytes = sak.bytes;
    if (checks && (sak.parityErrors.length || !iso.crcOk(sak.bytes))) return { ok: false, reason: 'The confirmation failed its checks.', uid, steps };
    return { ok: true, uid, sak: sak.bytes[0], atqa: atqa.bytes, steps };
  }

  return { hearCard, hearKey, activate, flicker, joinUid, dataIndex };
}));
