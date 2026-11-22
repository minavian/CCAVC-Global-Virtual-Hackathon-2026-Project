/*
 * ISO/IEC 14443 Type A, the language of contactless bank cards, transit cards and phones,
 * at its slowest speed (106 kbit/s). Only the parts both sides agree on live here: frames,
 * check bits, check numbers (CRC), and how bits become moments on the air. Neither the card
 * (tag.js) nor the reader (reader.js) is in this file.
 *
 * Time is counted in samples of the field, one sample every 4 carrier cycles
 * (13.56 MHz / 4 = 3.39 million samples a second). Then:
 *   one bit           = 128 carrier cycles = 32 samples (9.44 µs)
 *   half a bit        = 16 samples
 *   one subcarrier cycle (13.56 MHz / 16 = 847.5 kHz) = 4 samples
 *   the reader's pause = 8 samples (2.36 µs; the standard allows about 2 to 3 µs)
 *
 * Reader to card: the reader switches its field off for an instant (a pause), placed by
 *   "modified Miller" coding. Card to reader: the card switches a load on and off at the
 *   subcarrier rate, in the first half of a bit for a 1 and the second half for a 0
 *   (Manchester coding).
 *
 * window.RFID.iso (browser) or require('./iso14443a.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.RFID = root.RFID || {}).iso = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CARRIER = 13.56e6;
  const SAMPLE_RATE = CARRIER / 4;
  const BIT = 32, HALF = 16, SUB = 4, PAUSE = 8;

  // Commands and their codes.
  const REQA = 0x26, WUPA = 0x52, SEL1 = 0x93, NVB_ALL = 0x20, NVB_SELECT = 0x70, HLTA = 0x50;

  // ---------- Check numbers ----------
  // CRC_A (ISO/IEC 14443-3, Annex B): a 16-bit check number sent low byte first.
  function crcA(bytes) {
    let crc = 0x6363;
    for (const b of bytes) {
      let ch = (b ^ crc) & 0xff;
      ch = (ch ^ (ch << 4)) & 0xff;
      crc = ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
    }
    return [crc & 0xff, crc >> 8];
  }
  const withCrc = bytes => [...bytes, ...crcA(bytes)];
  const crcOk = bytes => bytes.length >= 3 && (([a, b]) => a === bytes[bytes.length - 2] && b === bytes[bytes.length - 1])(crcA(bytes.slice(0, -2)));

  // The check bit on every byte: odd parity, so each byte plus its check bit has an odd number of 1s.
  const oddParity = byte => { let ones = 0; for (let i = 0; i < 8; i++) ones += (byte >> i) & 1; return ones % 2 ? 0 : 1; };
  // The UID's check byte (BCC): all its bytes XORed together.
  const bcc = uid => uid.reduce((a, b) => a ^ b, 0);

  // ---------- Frames: bytes to the bits on the air (least significant bit first) ----------
  const byteBits = (byte, count = 8) => Array.from({ length: count }, (_, i) => (byte >> i) & 1);

  // A short frame: 7 bits, no check bit (REQA and WUPA).
  const shortFrame = code => byteBits(code, 7);

  // A standard frame: each byte's 8 bits, then its check bit.
  const standardFrame = bytes => bytes.flatMap(b => [...byteBits(b), oddParity(b)]);

  // Back from bits to bytes: every 9 bits are a byte and its check bit. Reports which bytes
  // fail their check bit. A trailing part-byte is kept in `partial`.
  function parseStandard(bits) {
    const bytes = [], parityErrors = [];
    let i = 0;
    for (; i + 9 <= bits.length; i += 9) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= bits[i + k] << k;
      if (bits[i + 8] !== oddParity(b)) parityErrors.push(bytes.length);
      bytes.push(b);
    }
    return { bytes, parityErrors, partial: bits.slice(i) };
  }

  // ---------- The reader's side: bits to pauses (modified Miller) ----------
  // Returns the sample positions where each pause starts, and the frame's length in samples.
  // Sequences in one bit time: X = pause halfway, Y = no pause, Z = pause at the start.
  //   start of frame: Z;  1: X;  0: Y, but Z after a 0 or straight after the start;
  //   end of frame: a 0, then Y.
  function millerPauses(bits) {
    const pauses = [];
    let t = 0;
    const seq = s => { if (s === 'X') pauses.push(t + HALF); else if (s === 'Z') pauses.push(t); t += BIT; };
    seq('Z');
    let previous = null;           // null: straight after the start
    for (const bit of bits) {
      if (bit) seq('X');
      else seq(previous === 1 ? 'Y' : 'Z');
      previous = bit;
    }
    seq(previous === 1 ? 'Y' : 'Z');   // the end: a 0 ...
    seq('Y');                           // ... then Y
    return { pauses, length: t };
  }

  // The card's side of the same thing: from where the pauses fell, back to bits.
  // `pauses` are sample positions relative to the frame's start.
  function millerDecode(pauses) {
    if (!pauses.length) return null;
    const t0 = pauses[0];                                  // the start's Z
    const slots = new Map();
    for (const p of pauses) slots.set(Math.round((p - t0) / HALF), true);
    const last = Math.max(...slots.keys());
    const bits = [];
    // Bit time n covers half-bit slots 2n (its start) and 2n + 1 (its middle).
    // X = 1. Z = 0. Y = 0 after a 1; Y after a 0 is the end of the frame.
    let previous = null;
    for (let n = 1; 2 * n <= last + 4; n++) {
      if (slots.has(2 * n + 1)) { bits.push(1); previous = 1; }
      else if (slots.has(2 * n)) { bits.push(0); previous = 0; }
      else if (previous === 1) { bits.push(0); previous = 0; }
      else break;
    }
    // The end of frame begins with a 0 the coder added; drop it.
    bits.pop();
    return bits;
  }

  // ---------- The card's side: bits to the moments its switch is closed ----------
  // Start of frame is a 1 (D), each 1 is D (load in the first half), each 0 is E (load in
  // the second half), and the end of frame (F) is a bit time with no load at all.
  // Returns a Uint8Array, one value per sample: 1 while the switch is closed.
  function manchesterSwitch(bits) {
    const all = [1, ...bits];
    const out = new Uint8Array((all.length + 1) * BIT);
    all.forEach((bit, i) => {
      const start = i * BIT + (bit ? 0 : HALF);
      for (let k = 0; k < HALF; k++) out[start + k] = (k % SUB) < SUB / 2 ? 1 : 0;   // the subcarrier
    });
    return out;
  }

  // How long the card waits before it answers: n·128 + 84 carrier cycles when the reader's
  // last bit was a 1, n·128 + 20 when it was a 0 (n = 9), counted from the reader's last pause.
  const answerDelay = lastBit => Math.round((9 * 128 + (lastBit ? 84 : 20)) / 4);

  // NVB: how many valid bits the reader is sending in an anticollision command:
  // high nibble = whole bytes (counting SEL and NVB), low nibble = extra bits.
  const nvb = validBits => ((2 + (validBits >> 3)) << 4) | (validBits & 7);

  // The reader's anticollision command after `known` UID bits (an array of bits, least
  // significant first) are certain: SEL, NVB, and those bits.
  function anticollisionBits(known) {
    const head = standardFrame([SEL1, nvb(known.length)]);
    const out = [...head];
    for (let i = 0; i < known.length; i++) {
      out.push(known[i]);
      if (i % 8 === 7) {                                  // a whole byte: add its check bit
        let b = 0; for (let k = 0; k < 8; k++) b |= known[i - 7 + k] << k;
        out.push(oddParity(b));
      }
    }
    return out;
  }

  // Bits of a byte array, least significant first, without check bits.
  const dataBits = bytes => bytes.flatMap(b => byteBits(b));

  // ---------- Plain-words names for the messages ----------
  function describe(direction, bytes, bits) {
    if (direction === 'reader') {
      if (bits === 7 && bytes[0] === REQA) return { name: 'REQA', words: 'Anyone there?' };
      if (bits === 7 && bytes[0] === WUPA) return { name: 'WUPA', words: 'Everyone, wake up.' };
      if (bytes[0] === SEL1 && bytes[1] === NVB_ALL) return { name: 'ANTICOLLISION', words: 'Tell me your ID.' };
      if (bytes[0] === SEL1 && bytes[1] === NVB_SELECT) return { name: 'SELECT', words: 'OK, I’ll talk to you.' };
      if (bytes[0] === SEL1) return { name: 'ANTICOLLISION', words: 'Only cards whose ID starts like this: answer.' };
      if (bytes[0] === HLTA) return { name: 'HLTA', words: 'Go to sleep.' };
    } else {
      if (bytes.length === 2 && !bits) return { name: 'ATQA', words: 'Here!' };
      if (bytes.length === 5) return { name: 'UID', words: 'My ID is …' };
      if (bytes.length === 3) return { name: 'SAK', words: 'Selected. Here’s what kind of card I am.' };
    }
    return { name: '?', words: '' };
  }

  return { CARRIER, SAMPLE_RATE, BIT, HALF, SUB, PAUSE, REQA, WUPA, SEL1, NVB_ALL, NVB_SELECT, HLTA,
    crcA, withCrc, crcOk, oddParity, bcc, byteBits, shortFrame, standardFrame, parseStandard,
    millerPauses, millerDecode, manchesterSwitch, answerDelay, nvb, anticollisionBits, dataBits, describe };
}));
