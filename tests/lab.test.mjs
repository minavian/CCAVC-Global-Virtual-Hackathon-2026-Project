// Checks for the close-up's lab (js/intro/lab-model.js): that what it draws always agrees with
// the physics it is worked out from. Runs with Node's test runner: `node --test` from the
// project's folder (Node 22.12 or newer, which loads the lab's ES module files as they are).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The lab finds the physics engine where the page puts it.
globalThis.RFID = { physics: require('../js/rfid/physics.js') };
const L = await import('../js/intro/lab-model.js');

// Every combination of these, on both readers, genuine and copied.
function* settings() {
  for (const reader of ['pad', 'phone']) for (const clone of [false, true])
    for (const distance of [.5, .8, 1, 2, 2.4, 3, 4.9, 7, 10])
      for (const angle of [0, 15, 30, 60, 80, 90])
        for (const metal of [0, 2, 4])
          for (const drive of [0, 20, 100, 150])
            for (const tune of [5, 13.56, 30]) yield L.clampSetting({ reader, distance, angle, metal, drive, tune, clone });
}

const ASLEEP = /^(Asleep|The reader is off|The phone’s NFC is off)/;

test('the lab never draws what is not happening', () => {
  let count = 0;
  for (const s of settings()) {
    const m = L.measure(s), v = L.labLevels(s, m), st = L.status(s, m), at = JSON.stringify(s);
    count++;
    if (s.drive === 0) {
      for (const key of ['emit', 'field', 'receive', 'power', 'readerPace', 'cardPace']) assert.equal(v[key], 0, `reader off, ${key} at ${at}`);
    }
    if (!m.awake) assert.ok(!v.power && !v.blink, `asleep but the chip is lit at ${at}`);
    else assert.ok(v.power > 0, `awake but the chip is dark at ${at}`);
    // A current carrying under a twentieth of a normal tap's power is not drawn at all.
    if (m.current ** 2 < .04) assert.equal(v.receive, 0, `negligible current drawn at ${at}`);
  }
  assert.ok(count > 7000);
});

test('the words, the reach and the card agree with the physics', () => {
  for (const s of settings()) {
    const m = L.measure(s), st = L.status(s, m), at = JSON.stringify(s);
    assert.equal(ASLEEP.test(st.text), !m.awake, `sentence "${st.text}" at ${at}`);
    if (m.awake) assert.ok(m.reach + .05 >= s.distance, `awake beyond its own reach at ${at}`);
    if (s.reader === 'phone') assert.ok(!/reader/.test(st.text), `the phone called a reader: "${st.text}"`);
    // A turned card rests its edge on the reader's top; it never sinks into it.
    const edge = s.distance - 2.7 * Math.sin(s.angle * Math.PI / 180);
    assert.ok(edge >= L.READERS[s.reader].surface + .05, `card inside the reader at ${at}`);
  }
});

test('every situation to try is where it says, for its own reason', () => {
  const expected = {
    tap: /^(The chip is awake|The phone powers the chip)/, far: /too far/, side: /turned away/, metal: /metal blocks/,
    weak: /too weak/, tuned: /tuned wrong/, copy: /^A copy/,
  };
  for (const reader of ['pad', 'phone']) {
    for (const [key, preset] of Object.entries(L.PRESETS[reader])) {
      const { label, ...set } = preset, s = L.clampSetting(set), m = L.measure(s);
      assert.equal(s.distance, set.distance, `${reader} ${label} is moved by the clamp`);
      assert.match(L.status(s, m).text, expected[key], `${reader} ${label}`);
    }
  }
});

test('the numbers the page states', () => {
  const pad = L.measure(L.startFor('pad')), phone = L.measure(L.startFor('phone'));
  assert.ok(Math.abs(pad.reach - 4.85) < .05, `card reader reach ${pad.reach}`);
  assert.ok(Math.abs(phone.reach - 2.38) < .05, `phone reach ${phone.reach}`);
  assert.ok(Math.abs(pad.watts * 1000 - 13.9) < .1, `power at a normal tap ${pad.watts * 1000} mW`);
  assert.ok(Math.abs(pad.needs * 1000 - 5.1) < .05, `power to wake ${pad.needs * 1000} mW`);
  assert.equal(L.chipPower(pad), 1);
  // The answer is strongest in between: weaker very close, and weaker far off.
  const dip = cm => L.measure(L.clampSetting({ ...L.startFor('pad'), distance: cm })).dip;
  assert.ok(dip(2.5) > dip(.5) && dip(2.5) > dip(4.8), 'the answer peaks in between');
});

test('every tag size: what is drawn and said agrees with the physics', () => {
  for (const tag of Object.keys(L.TAG_SIZES)) for (const reader of ['pad', 'phone'])
    for (const distance of [.5, 1, 2, 3, 4, 7]) for (const angle of [0, 45, 80]) for (const drive of [0, 50, 100, 150]) {
      const s = L.clampSetting({ ...L.startFor(reader), tag, distance, angle, drive }), m = L.measure(s), v = L.labLevels(s, m);
      const st = L.status(s, m), at = JSON.stringify(s);
      assert.equal(ASLEEP.test(st.text), !m.awake, `sentence "${st.text}" at ${at}`);
      assert.ok(!/several things/i.test(st.detail) || !m.awake, `at ${at}`);
      if (!m.awake) assert.ok(!v.power, `asleep but lit at ${at}`);
      if (m.awake) assert.ok(m.reach + .05 >= s.distance, `awake beyond its reach at ${at}`);
      assert.equal(v.tagScale, L.TAG_SIZES[tag].scale);
      const edge = s.distance - 2.7 * L.TAG_SIZES[tag].scale * Math.sin(angle * Math.PI / 180);
      assert.ok(edge >= L.READERS[reader].surface + .05, `tag inside the reader at ${at}`);
    }
  // Smaller coils reach less over the card reader; over the phone, a key ring tag reaches a
  // little further than a card (its coil is nearer the phone's own size).
  const reach = (reader, tag) => L.measure(L.clampSetting({ ...L.startFor(reader), tag })).reach;
  assert.ok(reach('pad', 'card') > reach('pad', 'fob') && reach('pad', 'fob') > reach('pad', 'sticker'));
  assert.ok(reach('phone', 'fob') > reach('phone', 'card'));
  const sticker = L.clampSetting({ ...L.startFor('pad'), tag: 'sticker' });
  assert.match(L.status(sticker, L.measure(sticker)).text, /small a coil/);
});

test('turned up, the power it would take to wake the card', () => {
  // Far off the field falls steeply, so a reader turned up still wakes it only a little further.
  const at = cm => L.clampSetting({ ...L.startFor('pad'), distance: cm, drive: 150 });
  for (const cm of [6.5, 8, 10]) {
    const s = at(cm), m = L.measure(s), st = L.status(s, m), k = L.powerToWake(s);
    assert.ok(!m.awake && k > 2.25, `asleep at ${cm} cm, needing more than 150% (${k})`);
    assert.match(st.text, /even turned up/);
    assert.ok(st.detail.includes(L.timesText(k) + '×'), st.detail);
    // Just that much power wakes it; a little less doesn't.
    const drive = Math.sqrt(k) * 100;
    assert.ok(L.wakes({ ...s, drive: drive * 1.001 }) && !L.wakes({ ...s, drive: drive * .99 }), `at ${cm} cm`);
  }
  // (20 cm is past the slider's end; the physics answers all the same.)
  const k10 = L.powerToWake(at(10)), k20 = L.powerToWake({ ...L.startFor('pad'), distance: 20, drive: 150 });
  assert.ok(k10 > 15 && k10 < 30 && k20 > 500, `10 cm ${k10}, 20 cm ${k20}`);
  assert.equal(L.timesText(22.4), '22');
  assert.equal(L.timesText(9149), '9,100');
});

test('the map of where it wakes has exact edges', () => {
  for (const reader of ['pad', 'phone']) for (const metal of [0, 2]) for (const tag of ['card', 'sticker']) {
    const s = L.clampSetting({ ...L.startFor(reader), metal, tag }), map = L.wakeMap(s), at = JSON.stringify(s);
    assert.equal(map.bands.length, 37);
    // Face-on, its last edge is the reach the lab states (both found from the same physics).
    const faceOn = map.bands[0].spans.at(-1)?.[1] ?? 0, reach = L.measure(L.clampSetting({ ...s, angle: 0 })).reach;
    assert.ok(Math.abs(faceOn - reach) < .03, `face-on ${faceOn} against reach ${reach} at ${at}`);
    for (const band of map.bands) {
      assert.equal(band.start, Math.max(.5, L.nearestFor({ ...s, angle: band.angle })));
      const base = L.clampSetting({ ...s, angle: band.angle });
      for (const [from, to] of band.spans) {
        assert.ok(from >= band.start - 1e-9 && to > from, `span ${from}–${to} at ${band.angle}°`);
        // Inside each span it wakes; just past an edge (not the chart's own ends) it sleeps.
        assert.ok(L.wakes({ ...base, distance: (from + to) / 2 }), `asleep inside a span at ${band.angle}°, ${at}`);
        if (to < 10) assert.ok(!L.wakes({ ...base, distance: to + .01 }), `awake past an edge at ${band.angle}°, ${at}`);
        if (from > band.start) assert.ok(!L.wakes({ ...base, distance: from - .01 }), `awake before an edge at ${band.angle}°, ${at}`);
      }
    }
  }
});

test('an ID that can not be a card’s says why', () => {
  assert.equal(L.idProblem('04 7B 21 9E'), null);
  assert.equal(L.idProblem('047b219e'), null);
  assert.match(L.idProblem('04 7B 21'), /four bytes/);
  assert.match(L.idProblem('zz'), /four bytes/);
  // 88 is the cascade tag: it tells the reader a longer ID follows, so no 4-byte ID starts with it.
  assert.match(L.idProblem('88 11 22 33'), /longer ID/);
  assert.equal(L.idProblem('08 11 22 33'), null);
});

test('a copy has the ID but not the key', () => {
  const key = Array.from({ length: 16 }, (_, i) => i * 17 & 255), copy = key.map(b => b ^ 1);
  const challenge = [0x5a, 0x13, 0xc2, 0x7e];
  assert.deepEqual(L.proofCode(key, challenge), L.proofCode(key, challenge), 'the same key gives the same code');
  assert.notDeepEqual(L.proofCode(copy, challenge), L.proofCode(key, challenge), 'a different key gives another code');
  assert.notDeepEqual(L.proofCode(key, [0x5a, 0x13, 0xc2, 0x7f]), L.proofCode(key, challenge), 'a new challenge gives a new code');
});
