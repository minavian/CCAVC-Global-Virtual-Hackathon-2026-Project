/*
 * The car key's answer, at 125 kHz (low frequency, "LF").
 *
 * The key in this simulation answers like the simplest read-only LF tags (the format of the
 * EM4100 chip): as long as it is powered, it repeats one 64-bit message, over and over.
 *   9 ones                    a header; nothing else in the message can hold nine 1s in a row
 *   10 rows of 4 data bits    the 40-bit ID (an 8-bit version, then a 32-bit number),
 *                             each row followed by a check bit (even parity)
 *   4 column check bits       even parity down each column
 *   one 0                     the end
 * Each bit lasts 64 carrier cycles (512 µs). It is Manchester coded straight onto the field:
 * a 1 closes the switch in the first half of the bit, a 0 in the second half.
 *
 * Real car keys differ by maker; many add a secret handshake on top. This is the plain part
 * every one of them shares: a battery-free chip answering through the field.
 *
 * Time is in samples, one every 4 carrier cycles: a bit is 16 samples, half a bit is 8.
 *
 * window.RFID.lf (browser) or require('./lf.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.RFID = root.RFID || {}).lf = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CARRIER = 125e3;
  const SAMPLE_RATE = CARRIER / 4;
  const BIT = 16, HALF = 8;

  // 40 data bits, most significant first: version byte, then the 4-byte ID.
  const dataBits = (version, id) => [version, ...id].flatMap(b => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));

  function frame(version, id) {
    const data = dataBits(version, id), out = Array(9).fill(1);
    for (let row = 0; row < 10; row++) {
      const nibble = data.slice(row * 4, row * 4 + 4);
      out.push(...nibble, nibble.reduce((a, b) => a ^ b, 0));
    }
    for (let col = 0; col < 4; col++) {
      let p = 0;
      for (let row = 0; row < 10; row++) p ^= data[row * 4 + col];
      out.push(p);
    }
    out.push(0);
    return out;
  }

  // From 64 bits starting at the header, back to the ID. Reports every failed check.
  function parse(bits) {
    if (bits.length < 64) return { ok: false, reason: 'short' };
    for (let i = 0; i < 9; i++) if (bits[i] !== 1) return { ok: false, reason: 'header' };
    const data = [], errors = [];
    for (let row = 0; row < 10; row++) {
      const at = 9 + row * 5, nibble = bits.slice(at, at + 4);
      if ((nibble.reduce((a, b) => a ^ b, 0)) !== bits[at + 4]) errors.push('row ' + (row + 1));
      data.push(...nibble);
    }
    for (let col = 0; col < 4; col++) {
      let p = 0;
      for (let row = 0; row < 10; row++) p ^= data[row * 4 + col];
      if (p !== bits[59 + col]) errors.push('column ' + (col + 1));
    }
    if (bits[63] !== 0) errors.push('end');
    const bytes = [];
    for (let b = 0; b < 5; b++) { let v = 0; for (let i = 0; i < 8; i++) v = v << 1 | data[b * 8 + i]; bytes.push(v); }
    return { ok: errors.length === 0, version: bytes[0], id: bytes.slice(1), errors };
  }

  // The moments the key's switch is closed while it sends `bits`: one value per sample.
  function manchesterSwitch(bits) {
    const out = new Uint8Array(bits.length * BIT);
    bits.forEach((bit, i) => out.fill(1, i * BIT + (bit ? 0 : HALF), i * BIT + (bit ? HALF : BIT)));
    return out;
  }

  return { CARRIER, SAMPLE_RATE, BIT, HALF, frame, parse, manchesterSwitch, dataBits };
}));
