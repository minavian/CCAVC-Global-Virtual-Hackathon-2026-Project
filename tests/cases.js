/*
 * Checks for the simulation in js/rfid. The same list runs in Node (`node --test tests/`)
 * and in the browser (tests/index.html). Each case is [name, fn]; fn throws to fail.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '..', 'js', 'rfid');
    module.exports = factory({
      physics: require(path.join(dir, 'physics.js')), iso: require(path.join(dir, 'iso14443a.js')),
      lf: require(path.join(dir, 'lf.js')), tag: require(path.join(dir, 'tag.js')), air: require(path.join(dir, 'air.js')),
      reader: require(path.join(dir, 'reader.js')), channel: require(path.join(dir, 'channel.js')),
      readerSource: fs.readFileSync(path.join(dir, 'reader.js'), 'utf8')
    });
  } else root.RFIDTests = factory(Object.assign({ readerSource: null }, root.RFID));
}(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const { physics, iso, lf, tag, reader, channel } = R;

  const equal = (a, b, what) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };
  const ok = (value, what) => { if (!value) throw new Error(what); };
  const near = (a, b, tolerance, what) => { if (Math.abs(a - b) > tolerance) throw new Error(`${what}: expected ${b} ± ${tolerance}, got ${a}`); };
  const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

  // A card in a reader's field, at a given distance, for the reader to talk to.
  const cardAt = (chip, distance, extra = {}) => {
    const r = physics.solve({ tag: 'card', reader: 'pad', distance, ...extra });
    return { chip, depth: r.dip, awake: r.awake };
  };

  return [
    // ---------- The standard's own examples ----------
    ['CRC_A matches the standard: 50 00 gives 57 CD (the HLTA command)', () => {
      equal(iso.crcA([0x50, 0x00]), [0x57, 0xcd], 'CRC_A');
    }],
    ['CRC_A matches a real trace: E0 50 gives BC A5 (the RATS command)', () => {
      equal(iso.crcA([0xe0, 0x50]), [0xbc, 0xa5], 'CRC_A');
    }],
    ['The check bit makes every byte plus check bit odd', () => {
      for (let b = 0; b < 256; b++) {
        let ones = iso.oddParity(b);
        for (let i = 0; i < 8; i++) ones += (b >> i) & 1;
        ok(ones % 2 === 1, 'byte ' + b);
      }
    }],

    // ---------- The reader's pauses ----------
    ['A card decodes any command from the pauses alone (modified Miller)', () => {
      const rand = tag.random(3);
      for (let t = 0; t < 300; t++) {
        const bits = Array.from({ length: 1 + Math.floor(rand() * 60) }, () => rand() < .5 ? 1 : 0);
        const { pauses } = iso.millerPauses(bits);
        equal(iso.millerDecode(pauses), bits, 'bits');
      }
    }],

    // ---------- The reader hears only samples ----------
    ['The reader file never touches the tag or the channel', () => {
      const source = R.readerSource;
      if (source === null) return;   // the browser has no file access; Node checks this
      ok(!/tag\.js|channel\.js|air\.js|RFID\.tag|RFID\.channel|RFID\.air|physics/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')),
        'reader.js must only use the standard (iso14443a.js, lf.js) and the samples it is given');
    }],
    ['The reader reads 100 random card IDs from the samples alone', () => {
      for (let t = 0; t < 100; t++) {
        const chip = tag.cardChip({ randomUid: true, seed: 100 + t });
        const link = channel.cardChannel([cardAt(chip, .03)], { seed: t });
        const result = reader.activate(link);
        ok(result.ok, 'conversation ' + t + ': ' + result.reason);
        equal(hex(result.uid), hex(chip.uid), 'UID');
        equal(result.sak, 0x20, 'SAK');
      }
    }],
    ['A random-ID card has a new ID after every power-up, starting with 08', () => {
      const chip = tag.cardChip({ randomUid: true, seed: 9 });
      const seen = new Set();
      for (let t = 0; t < 20; t++) { chip.powerUp(); equal(chip.uid[0], 0x08, 'first byte'); seen.add(hex(chip.uid)); }
      ok(seen.size > 15, 'IDs should change');
    }],
    ['In heavy noise the reader fails, but never trusts a wrong ID', () => {
      let failed = 0;
      for (let t = 0; t < 60; t++) {
        const chip = tag.cardChip({ randomUid: true, seed: 500 + t });
        const result = reader.activate(channel.cardChannel([cardAt(chip, .045)], { noise: .02, seed: t }));
        if (!result.ok) failed++;
        else equal(hex(result.uid), hex(chip.uid), 'a trusted ID must be right');
      }
      ok(failed > 0, 'this much noise should break some reads');
    }],
    ['With the checks off, the reader accepts a wrong ID, and the card refuses to confirm it', () => {
      let wrong = 0;
      for (let t = 0; t < 120 && !wrong; t++) {
        const chip = tag.cardChip({ randomUid: true, seed: 900 + t });
        const result = reader.activate(channel.cardChannel([cardAt(chip, .045)], { noise: .012, seed: t }), { checks: false });
        if (result.uid && hex(result.uid) !== hex(chip.uid)) {
          wrong++;
          ok(!result.ok, 'the card must not confirm an ID that is not its own');
        }
      }
      ok(wrong > 0, 'a wrong ID should get past the reader without its checks');
    }],
    ['With the checks on, the reader never accepts a wrong ID', () => {
      for (let t = 0; t < 120; t++) {
        const chip = tag.cardChip({ randomUid: true, seed: 900 + t });
        const result = reader.activate(channel.cardChannel([cardAt(chip, .045)], { noise: .012, seed: t }));
        if (result.uid) equal(hex(result.uid), hex(chip.uid), 'accepted ID');
      }
    }],
    ['Out of range, the card stays silent and the reader says so', () => {
      const chip = tag.cardChip();
      const result = reader.activate(channel.cardChannel([cardAt(chip, .08)]));
      ok(!result.ok && /No card/.test(result.reason), result.reason);
    }],

    // ---------- Two cards at once ----------
    ['Two cards: the reader finds the clash and picks the card with a 1 there', () => {
      const a = tag.cardChip({ uid: [0x08, 0x12, 0x34, 0x56] });
      const b = tag.cardChip({ uid: [0x08, 0x12, 0x35, 0x56] });   // differs at bit 0 of byte 2
      const result = reader.activate(channel.cardChannel([cardAt(a, .02), cardAt(b, .02)]), { prefer: 1 });
      ok(result.ok, result.reason);
      equal(hex(result.uid), hex(b.uid), 'the card with a 1 at the clash');
      const clash = result.steps.find(s => s.clashAt !== undefined);
      ok(clash, 'there should be a clash');
      equal(clash.clashAt, 16, 'the clash is at data bit 16');
      equal(a.state, 'IDLE', 'the other card heard a SELECT for someone else and went back to waiting');
      equal(b.state, 'ACTIVE', 'the chosen card is selected');
    }],
    ['Two cards: preferring 0s picks the other card', () => {
      const a = tag.cardChip({ uid: [0x08, 0x12, 0x34, 0x56] });
      const b = tag.cardChip({ uid: [0x08, 0x12, 0x35, 0x56] });
      const result = reader.activate(channel.cardChannel([cardAt(a, .02), cardAt(b, .02)]), { prefer: 0 });
      equal(hex(result.uid), hex(a.uid), 'the card with a 0 at the clash');
    }],

    // ---------- Stored energy ----------
    ['Without its storage capacitor, the chip resets in the first pause and never answers', () => {
      const chip = tag.cardChip();
      const storage = { capacitance: 20e-12, current: 200e-6, volts: 3, reset: 1.8 };
      const result = reader.activate(channel.cardChannel([cardAt(chip, .02)], { storage }));
      ok(!result.ok, 'it should not answer');
      const fine = reader.activate(channel.cardChannel([cardAt(tag.cardChip(), .02)], { storage: { ...storage, capacitance: 2e-9 } }));
      ok(fine.ok, 'with its capacitor it should answer');
    }],

    // ---------- The car key ----------
    ['The reader reads the key’s ID from its repeating message', () => {
      const key = tag.keyChip();
      for (let t = 0; t < 20; t++) {
        const { samples } = channel.keyRecording(key, { depth: .03, noise: .003, seed: t, offset: t * 97 });
        const result = reader.hearKey(samples);
        ok(result.ok, 'read ' + t + ': ' + (result.reason || result.errors));
        equal(hex(result.id), '3f 9a 12 c7', 'key ID');
      }
    }],
    ['A single flipped bit in the key’s message fails its checks', () => {
      const message = [...lf.frame(0, [0x3f, 0x9a, 0x12, 0xc7])];
      ok(lf.parse(message).ok, 'the clean message passes');
      for (let i = 9; i < 63; i++) {
        const broken = [...message]; broken[i] ^= 1;
        ok(!lf.parse(broken).ok, 'flipping bit ' + i + ' must fail');
      }
    }],

    // ---------- Physics ----------
    ['The card wakes exactly where the pad’s field falls to the standard’s 1.5 A/m', () => {
      near(physics.range({ tag: 'card', reader: 'pad' }), physics.distanceForField('pad', physics.H_MIN), .001, 'range (m)');
    }],
    ['The pad’s field at its centre is the standard’s maximum, 7.5 A/m', () => {
      near(physics.solve({ tag: 'card', distance: 1e-4 }).field, physics.H_MAX, .05, 'A/m');
    }],
    ['A still magnet makes no electricity (Faraday)', () => {
      const slow = physics.solve({ tag: 'card', distance: .01, frequency: 1 }).emf;
      ok(slow < 1e-5, 'at 1 Hz the coil should get almost nothing, got ' + slow);
    }],
    ['Removing the tuning capacitor: the key’s frugal chip starves, the card’s range shrinks', () => {
      const key = physics.range({ tag: 'key' }), keyBare = physics.range({ tag: 'key', capacitance: 0 });
      const card = physics.range({ tag: 'card' }), cardBare = physics.range({ tag: 'card', capacitance: 0 });
      ok(keyBare < key * .3, `key: ${(key * 100).toFixed(1)} cm tuned, ${(keyBare * 100).toFixed(1)} cm without`);
      ok(cardBare < card * .9, `card: ${(card * 100).toFixed(1)} cm tuned, ${(cardBare * 100).toFixed(1)} cm without`);
    }],
    ['The tuned circuit peaks at the reader’s frequency', () => {
      const curve = physics.sweep({ tag: 'key', distance: .03 }, 60e3, 260e3, 400);
      const peak = curve.reduce((a, b) => b[1] > a[1] ? b : a);
      near(peak[0] / 125e3, 1, .03, 'peak frequency / 125 kHz');
    }],
    ['A metal plate behind the card cuts the field and pushes its tuning up', () => {
      const free = physics.solve({ tag: 'card', distance: .02 });
      const metal = physics.solve({ tag: 'card', distance: .02, metal: .005 });
      ok(metal.field < free.field / 2, 'field should drop by more than half');
      ok(metal.resonance > free.resonance * 1.05, 'tuning should rise');
    }],
    ['Turning the card sideways leaves only cos(angle) of the link', () => {
      const facing = physics.solve({ tag: 'card', distance: .02 }).emf;
      const turned = physics.solve({ tag: 'card', distance: .02, angle: Math.PI / 3 }).emf;
      near(turned / facing, .5, 1e-6, 'emf ratio at 60°');
    }],
    ['Mutual inductance agrees with the small-loop formula far away', () => {
      const a = .01, b = .01, d = .5;
      const small = physics.MU0 * Math.PI * a * a * b * b / (2 * (a * a + d * d) ** 1.5);
      near(physics.loopMutual(a, b, d) / small, 1, 1e-3, 'ratio');
    }]
  ];
}));
