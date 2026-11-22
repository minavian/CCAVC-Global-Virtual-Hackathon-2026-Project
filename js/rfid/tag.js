/*
 * The chips inside the tags.
 *
 * cardChip(options) is a contactless card's chip (ISO/IEC 14443 Type A). It only ever hears
 * the bits it decoded from pauses in the field, and only ever answers by choosing bits for its
 * switch. It follows the standard's states:
 *   IDLE   just powered up; answers REQA ("Anyone there?") and WUPA
 *   READY  has said "Here!"; takes part in anticollision ("Tell me your ID.")
 *   ACTIVE selected by the reader; the app's conversation would start here
 *   HALT   told to sleep; only WUPA wakes it
 * Losing power (too far, or a pause it could not ride through) sends it back to IDLE.
 *
 * keyChip(options) is the car key's chip: it repeats its ID whenever it has power.
 *
 * window.RFID.tag (browser) or require('./tag.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./iso14443a.js'), require('./lf.js'));
  else (root.RFID = root.RFID || {}).tag = factory(root.RFID.iso, root.RFID.lf);
}(typeof self !== 'undefined' ? self : this, function (iso, lf) {
  'use strict';

  // A small seeded random number generator, so a run can be repeated exactly.
  function random(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cardChip({ uid = [0x08, 0x5c, 0x1e, 0x93], randomUid = false, sak = 0x20, atqa = [0x04, 0x00], seed = 1 } = {}) {
    const rand = random(seed);
    const chip = { state: 'IDLE', uid: [...uid], randomUid, sak, atqa };
    const full = () => [...chip.uid, iso.bcc(chip.uid)];          // the UID and its check byte

    // Power comes on: start again from IDLE. A card with random IDs makes up a new one now
    // (a random single-size UID starts with 08).
    chip.powerUp = () => {
      chip.state = 'IDLE';
      if (chip.randomUid) chip.uid = [0x08, ...Array.from({ length: 3 }, () => Math.floor(rand() * 256))];
    };
    chip.powerDown = () => { chip.state = 'IDLE'; };

    // The card heard `bits`. Returns the bits it answers with, or null to stay silent.
    chip.hear = bits => {
      if (!bits || !bits.length) return null;
      // A 7-bit frame is REQA or WUPA.
      if (bits.length === 7) {
        let code = 0; bits.forEach((b, i) => { code |= b << i; });
        const wakes = code === iso.WUPA ? ['IDLE', 'HALT', 'READY'] : code === iso.REQA ? ['IDLE', 'READY'] : [];
        if (!wakes.includes(chip.state)) return null;
        chip.state = 'READY';
        return { bits: iso.standardFrame(chip.atqa), bytes: chip.atqa, name: 'ATQA' };
      }
      const { bytes, parityErrors } = iso.parseStandard(bits.slice(0, 18));
      if (parityErrors.length || bytes.length < 2) return null;
      const [sel, nvb] = bytes;

      if (chip.state === 'ACTIVE') {
        const all = iso.parseStandard(bits);
        if (all.bytes[0] === iso.HLTA && iso.crcOk(all.bytes) && !all.parityErrors.length) chip.state = 'HALT';
        return null;
      }
      if (chip.state !== 'READY' || sel !== iso.SEL1) return null;

      if (nvb === iso.NVB_SELECT) {
        // "OK, I'll talk to you": only the card whose UID this is answers, with its SAK.
        const all = iso.parseStandard(bits);
        const mine = all.bytes.slice(2, 7).every((b, i) => b === full()[i]);
        if (all.parityErrors.length || !iso.crcOk(all.bytes) || !mine) { chip.state = 'IDLE'; return null; }
        chip.state = 'ACTIVE';
        const answer = iso.withCrc([chip.sak]);
        return { bits: iso.standardFrame(answer), bytes: answer, name: 'SAK' };
      }

      // Anticollision: the reader sends the UID bits it is sure of. A card whose UID starts
      // with them answers with the rest; the others stay quiet.
      const valid = ((nvb >> 4) - 2) * 8 + (nvb & 7);
      const known = [];
      for (let i = 18; i < bits.length && known.length < valid; i++) {
        known.push(bits[i]);
        if (known.length % 8 === 0) i++;                        // skip that byte's check bit
      }
      const mineBits = iso.dataBits(full());
      if (known.some((b, i) => b !== mineBits[i])) return null;
      return { bits: restOfUid(mineBits, valid), name: 'UID', from: valid };
    };

    // The UID bits from `from` on, with each byte's check bit after its last bit. A byte the
    // reader already started is finished first, then its check bit.
    function restOfUid(mineBits, from) {
      const out = [];
      for (let i = from; i < 40; i++) {
        out.push(mineBits[i]);
        if (i % 8 === 7) {
          let b = 0; for (let k = 0; k < 8; k++) b |= mineBits[i - 7 + k] << k;
          out.push(iso.oddParity(b));
        }
      }
      return out;
    }
    return chip;
  }

  function keyChip({ id = [0x3f, 0x9a, 0x12, 0xc7], version = 0x00 } = {}) {
    return { id, version, message: lf.frame(version, id) };
  }

  return { cardChip, keyChip, random };
}));
