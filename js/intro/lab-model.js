// The close-up's lab (cinema.js `lab` step): the visitor changes the tap and sees what
// happens, worked out live by the site's own physics engine (js/rfid/physics.js, the same
// one every simulation further down the page runs on). This file turns the controls into
// that engine's inputs, and its answers into what the close-up shows: where the card is,
// how bright the field and the currents are, whether the chip wakes, how strong its answer
// is, and one plain sentence saying why.
//
// The controls, as the visitor sets them:
//   distance  cm between the reader's coil and the card's (0.5 to 10)
//   angle     degrees the card is turned from facing the reader (0 to 90)
//   metal     which metal plate is behind the card: 0 none, then 20, 10, 5 or 2 mm behind it
//   drive     the reader's power, % of normal (0 to 150)
//   tune      the frequency the card's coil is tuned to, MHz (5 to 30; real cards: 13.56)
//   reader    which reader: 'pad', a shop's card reader, or 'phone', a phone's NFC
//   clone     the card is a copy: the same ID, but not the secret key (see `proofCode`)
//   tag       the size of the card's coil: 'card', a bank card's; 'fob', a key ring tag's; 'sticker'
import { shownPower } from './easing.js';

export const METAL_GAPS = [null, .02, .01, .005, .002];
export const LAB_START = { distance: 3, angle: 0, metal: 0, drive: 100, tune: 13.56, reader: 'pad', clone: false, tag: 'card' };
export const LIMITS = {
  distance: [.5, 10], angle: [0, 90], metal: [0, METAL_GAPS.length - 1], drive: [0, 150], tune: [5, 30],
};
// The two readers. A phone's coil is smaller and weaker (js/rfid/physics.js READERS: 2 turns of
// 21 mm against the pad's 35 mm, 0.21 A against 0.525 A), so it only reaches about 2.4 cm and a
// normal tap is about 1 cm. Its camera island stands 7 mm proud of its coil (phone-reader.js),
// so a card can't come closer than 0.8 cm.
// `surface`: how far the reader's top stands above its coil (cm): the pad's glass, the phone's
// camera island (phone-reader.js ISLAND_TOP).
export const READERS = {
  pad: { label: 'Card reader', noun: 'reader', start: 3, nearest: .5, surface: .24 },
  phone: { label: 'Phone', noun: 'phone', start: 1, nearest: .8, surface: .71 },
};
// A turned card can't come as close: one edge rests on the reader's top and its middle (where its
// coil's centre is) rises by half its height (27 mm) × sin(angle). So the nearest it can be, with
// a millimetre to spare. Turned 80°, the pad's nearest is 3.0 cm, and the phone's 3.5 cm: tilted
// even 30° on a phone, the card's own edge holds it out at 2.2 cm, past where it can wake.
const CARD_HALF_CM = 2.7;
export function nearestFor(s) {
  // Up to the distance slider's next 0.1 cm step, so a lifted card sits on a value it can show.
  return Math.max(READERS[readerOf(s)].nearest, Math.ceil(restFor(s) * 10 - 1e-9) / 10);
}
// Where a turned card's middle is with its edge resting on the reader, exactly (cm).
function restFor(s) {
  const r = READERS[readerOf(s)], half = CARD_HALF_CM * TAG_SIZES[tagOf(s)].scale;
  return half * Math.sin((s.angle || 0) * Math.PI / 180) + r.surface + .1;
}
const readerOf = s => READERS[s.reader] ? s.reader : 'pad';
// The tag's coil: a bank card's (35.7 mm in radius, the engine's card), a key ring tag's (15 mm) or
// a sticker's (10 mm), the same chip in each. A smaller coil catches less of the field, so it reaches
// less over the card reader (4.9, 3.7, 2.8 cm); but over the phone, whose own coil is small, the key
// ring tag reaches a little further than the card (2.5 against 2.4 cm): coils of a size couple best.
// `scale`: how big the close-up draws the card for it (its coil, as a share of a bank card's).
// `name`: what the readout calls it.
export const TAG_SIZES = {
  card: { label: 'Card', name: 'A bank card', radius: .0357, scale: 1 },
  fob: { label: 'Key ring', name: 'A key ring tag', radius: .015, scale: .45 },
  sticker: { label: 'Sticker', name: 'A sticker', radius: .01, scale: .32 },
};
const tagOf = s => TAG_SIZES[s.tag] ? s.tag : 'card';
// Where a setting starts for a reader: everything normal, the card at that reader's normal tap.
export const startFor = reader => ({ ...LAB_START, reader, distance: READERS[reader].start });
// Situations to try, one click each, for each reader. Every one is checked against the physics:
// the normal tap wakes the chip, and each of the others puts it to sleep for its own reason.
export const PRESETS = {
  pad: {
    tap: { label: 'Normal tap', ...startFor('pad') },
    far: { label: 'Too far', ...startFor('pad'), distance: 7 },
    side: { label: 'Side-on', ...startFor('pad'), distance: 3, angle: 80 },
    metal: { label: 'On metal', ...startFor('pad'), distance: 2.5, metal: 4 },
    weak: { label: 'Weak reader', ...startFor('pad'), distance: 3.5, drive: 40 },
    tuned: { label: 'Badly tuned', ...startFor('pad'), distance: 2, tune: 6 },
    copy: { label: 'A copy', ...startFor('pad'), clone: true },
  },
  phone: {
    tap: { label: 'Normal tap', ...startFor('phone') },
    far: { label: 'Too far', ...startFor('phone'), distance: 3.5 },
    side: { label: 'Side-on', ...startFor('phone'), distance: 2.2, angle: 30 },
    metal: { label: 'On metal', ...startFor('phone'), metal: 4 },
    weak: { label: 'Weak phone', ...startFor('phone'), distance: 1.2, drive: 50 },
    tuned: { label: 'Badly tuned', ...startFor('phone'), tune: 6 },
    copy: { label: 'A copy', ...startFor('phone'), clone: true },
  },
};

const physics = () => globalThis.RFID?.physics;
// Below this power (%) the reader counts as off: it sends no question.
export const READER_ON = 1;
const clampTo = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

// The engine's options for a setting (SI units).
function options(s, distanceCm = s.distance) {
  const P = physics(), card = P.TAGS.card, radius = TAG_SIZES[tagOf(s)].radius;
  // Each tag is tuned to 13.56 MHz for its own coil, as a real one is: the capacitor that tunes a
  // coil of this size (a bank card's is the engine's own).
  const C0 = radius === card.radius ? card.capacitance
    : 1 / ((2 * Math.PI * 13.56e6) ** 2 * P.coilInductance(card.turns, radius, card.wire));
  return {
    tag: 'card', reader: readerOf(s), radius,
    distance: distanceCm / 100,
    angle: s.angle * Math.PI / 180,
    metal: METAL_GAPS[Math.round(s.metal)] ?? null,
    drive: s.drive / 100,
    // A coil tuned to f has a capacitor C0 × (13.56 MHz / f)².
    capacitance: C0 * (13.56 / s.tune) ** 2,
  };
}

// Everything the close-up shows for a setting. `field`: A/m through the card's coil;
// `volts`: what reaches the chip (after its limiter); `raw`: what would without the
// limiter; `awake`; `dip`: how much the reader's own current changes when the card answers
// (the answer's strength); `reach`: the farthest the card still wakes, with everything else
// as set (cm); `shield`: how much of the field a metal plate takes away at the card (0 to 1).
export function measure(s) {
  const P = physics();
  if (!P) return null;
  const o = options(s), r = P.solve(o);
  const bare = o.metal === null ? r : P.solve({ ...o, metal: null });
  return {
    field: r.field, volts: r.chipVolts, raw: r.rawVolts, wake: r.wake, clamp: r.clamp,
    awake: r.awake, limited: r.limited, dip: r.dip, resonance: r.resonance,
    reach: reachOf(s),
    shield: bare.field > 0 ? Math.max(0, 1 - r.field / bare.field) : 0,
    // The current in the card's coil, as a share of a normal tap's (see `labLevels`).
    current: r.rawVolts / normal(),
    // Whether the reader makes a field at all: off, it can neither power nor ask.
    on: s.drive >= READER_ON,
    // The power the chip gets, in watts: the engine models the running chip as a resistor
    // (`chipLoad`, calibrated so the card wakes where the standard's 1.5 A/m is), so it is
    // V² / 2R for the peak voltage V. It needs 5.1 mW to wake; with its limiter holding 3.3 V it
    // takes at most 13.9 mW, and the limiter burns off the rest. The reader is the battery.
    watts: r.chipVolts ** 2 / (2 * P.TAGS.card.chipLoad),
    needs: r.wake ** 2 / (2 * P.TAGS.card.chipLoad),
    H_MIN: P.H_MIN, H_MAX: P.H_MAX,
  };
}

// How far the chip still wakes (cm), everything else as set: the farthest distance it wakes at,
// from the reader's nearest out to 20 cm. Not by bisection from the reader's face (the engine's
// `range`): very close, a metal plate detunes the card so much that it can sleep there and wake
// further out, and bisection from 1 mm then said it worked nowhere while the chip was awake. So a
// scan every half millimetre (about 400 solves, under 2 ms), then bisection on the last step.
function reachOf(s) {
  const P = physics(), near = READERS[readerOf(s)].nearest;
  const awakeAt = cm => P.solve(options(s, cm)).awake;
  let far = 0;
  for (let i = 0; near + i * .05 <= 20 + 1e-9; i++) if (awakeAt(near + i * .05)) far = near + i * .05;
  if (!far) return 0;
  let lo = far, hi = far + .05;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (awakeAt(mid)) lo = mid; else hi = mid; }
  return lo;
}

// Where the chip wakes, by distance and the card's angle together, everything else as set: the
// lab's Map chart. One band for each of `rows` angles, 0° to 90°, from face-on up. Each band has
// `start`, the nearest a card turned that far can be (its edge rests on the reader's top; `rest`,
// the same unrounded, for drawing a smooth edge rather than the slider's 0.1 cm steps), and
// `spans`, the stretches of distance (cm, up to 10, as the Distance chart) where the chip wakes:
// usually one, but metal can leave it asleep very close and awake further out. Each band is
// scanned at `cols` points, then every edge found is pinned down by bisection, so the outline is
// exact (to a fiftieth of a millimetre) rather than stepped. About 2,000 solves, a few milliseconds.
export function wakeMap(s, rows = 37, cols = 36) {
  const near = LIMITS.distance[0], far = LIMITS.distance[1], bands = [];
  for (let j = 0; j < rows; j++) {
    const angle = 90 * j / (rows - 1), start = Math.max(near, nearestFor({ ...s, angle }));
    const base = clampSetting({ ...s, angle }), at = distance => wakes({ ...base, distance });
    const spans = [];
    let before = start, was = at(start), from = was ? start : null;
    for (let i = 1; i <= cols; i++) {
      const x = start + (far - start) * i / cols, is = at(x);
      if (is !== was) {
        let lo = before, hi = x;
        for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (at(mid) === was) lo = mid; else hi = mid; }
        const edge = (lo + hi) / 2;
        if (is) from = edge; else { spans.push([from, edge]); from = null; }
        was = is;
      }
      before = x;
    }
    if (from !== null) spans.push([from, far]);
    bands.push({ angle, start, rest: Math.max(near, READERS[readerOf(s)].nearest, Math.min(start, restFor({ ...s, angle }))), spans });
  }
  return { near, far, rows, bands };
}

// The voltage at the chip across distances (cm), or across the reader's frequency (MHz),
// with everything else as set: the lab's chart.
export function curve(s, kind) {
  const P = physics();
  if (!P) return [];
  const points = [];
  if (kind === 'tuning') {
    const o = options(s);
    for (let i = 0; i <= 120; i++) {
      const f = 5 * (30 / 5) ** (i / 120);
      points.push([f, P.solve({ ...o, frequency: f * 1e6 }).rawVolts]);
    }
  } else if (kind === 'answer') {
    // The answer's strength (%) across distance: it rises as the card comes in, then falls again
    // very close, where the chip's limiter soaks up the field and the switch changes less.
    for (let i = 0; i <= 120; i++) {
      const cm = .5 + 9.5 * i / 120;
      points.push([cm, P.solve(options(s, cm)).dip * 100]);
    }
  } else {
    for (let i = 0; i <= 120; i++) {
      const cm = .5 + 9.5 * i / 120;
      points.push([cm, P.solve(options(s, cm)).rawVolts]);
    }
  }
  return points;
}

// What the close-up draws as full strength: the voltage a normal tap induces in the card's
// coil (the lab's start, on the card reader: about 4.2 V). Worked out once, when first needed.
let normalVolts = 0;
function normal() {
  const P = physics();
  if (!normalVolts && P) normalVolts = P.solve(options(startFor('pad'))).rawVolts;
  return normalVolts || 4.2;
}

// What the 3D shows for a setting (cinema.js levels), from its measurement. Every level is
// the physics, not a guess: with no field nothing moves, and a current too small to matter
// barely shows.
export function labLevels(s, m) {
  const gap = Math.max(.0016, s.distance / 100 - .0032);
  if (!m) return { gap };
  const drive = s.drive / 100;
  // The current in the card's coil, as a share of a normal tap's (it goes with the voltage
  // induced in it). Too far, it is about a fifth; with the reader off, none.
  const current = m.raw / normal();
  return {
    gap,
    tilt: s.angle * Math.PI / 180,
    metal: s.metal > 0 ? 1 : 0,
    plate: METAL_GAPS[Math.round(s.metal)] ?? .02,
    shield: m.shield,
    // The reader's coil current is set by its power, and its field follows it: off is none.
    emit: Math.min(1.25, drive),
    field: Math.min(1.25, drive),
    readerPace: Math.min(1.5, drive),
    // The card's current is drawn as bright as the power it carries (the current squared), so
    // a fifth of the current shows a twenty-fifth as bright, and its light runs as fast as the
    // current is strong: a weak current is a faint crawl, not electricity at full flow.
    receive: shownPower(current * current),
    cardPace: Math.min(1.5, current),
    // Into the chip: only once it is awake, as much as it gets (its limiter holds it at 3.3 V).
    power: m.awake ? Math.max(.6, Math.min(1, m.volts / m.clamp)) : 0,
    blink: m.awake ? .3 : 0,
    charge: chipPower(m),
    answerScale: Math.max(.15, Math.min(1.2, m.dip / .06)),
    falloff: 1,
    // Which reader shows: the pad (0) or the phone (1). It glides, so the swap is animated.
    phone: readerOf(s) === 'phone' ? 1 : 0,
    // Where the chip stops waking, drawn in space (not past the lab's 10 cm, and not at all when
    // it wakes nowhere).
    reachZ: Math.min(m.reach, 10) / 100,
    reachShow: m.reach > .05 ? 1 : 0,
    // How big the card is drawn: its coil's size (TAG_SIZES).
    tagScale: TAG_SIZES[tagOf(s)].scale,
  };
}

// The chip's power as the readout shows it: the power it gets as a share of what it needs to wake.
// Power goes as the voltage squared, so it is (V / 2 V)², at most 100% (awake).
export const chipPower = m => Math.min(1, (m.raw / m.wake) ** 2);

// Whether the chip wakes with a setting (no range, so it is quick). The lab's sliders use it to
// show where along each one the chip wakes (main.js `paintZones`).
export function wakes(s) {
  const P = physics();
  return Boolean(P && P.solve(options(s)).awake);
}

// How many times a normal reader's power it would take to wake the chip as set, or null if no
// power would (beyond a million times). The reader's power goes as its current squared, and the
// chip needs a set field, which falls steeply with distance: on the card reader, 2 times the power
// wakes it at 6 cm, 22 times at 10 cm, about 890 times at 20 cm. That is why a thief's reader
// can't read a card in a pocket across the room. Bisection on the current (40 solves).
export function powerToWake(s) {
  const at = drive => wakes({ ...s, drive });
  let lo = Math.max(s.drive, READER_ON), hi = lo;
  if (at(lo)) return (lo / 100) ** 2;
  while (!at(hi)) { hi *= 2; if (hi > 1e5) return null; }
  for (let i = 0; i < 40; i++) { const mid = Math.sqrt(lo * hi); if (at(mid)) hi = mid; else lo = mid; }
  return (hi / 100) ** 2;
}
// "22", "1.6", "890", "9,100": a power factor, to two significant figures.
export const timesText = k => (k < 10 ? k.toFixed(1) : Number(k.toPrecision(2)).toLocaleString('en-US'));

// Why the chip is asleep, found by asking the physics rather than guessing: each control,
// put back to normal on its own, in order of how much it usually matters. The first that
// would wake the chip by itself is the reason. Null if none would on its own.
const CAUSES = ['drive', 'angle', 'metal', 'tune', 'tag', 'distance'];
function cause(s) {
  const normal = startFor(readerOf(s));
  // (Each as it could really be: a turned card stays lifted by its edge.)
  for (const key of CAUSES) if (s[key] !== normal[key] && wakes(clampSetting({ ...s, [key]: normal[key] }))) return key;
  return null;
}

// The one plain sentence (and its small print) for a setting: the most important reason.
export function status(s, m) {
  if (!m) return { text: 'Change anything. Watch what happens.', detail: '' };
  const phone = readerOf(s) === 'phone', noun = READERS[readerOf(s)].noun;
  const reach = m.reach < .05 ? 'Like this, it works at no distance.' : `Like this, it works up to ${m.reach.toFixed(1)} cm.`;
  if (m.awake) {
    if (s.drive < 5) return { text: 'Awake, on a very weak field.', detail: reach };
    if (s.angle > 45 && !wakes({ ...s, angle: s.angle + 15 })) return { text: 'Awake, but only just: it is turned away.', detail: 'Less field passes through a tilted coil.' };
    if (s.metal > 0) return { text: 'Awake, but metal soaks up the field.', detail: reach };
    if (s.drive < 70) return { text: 'Awake, on a weak field.', detail: reach };
    if (Math.abs(s.tune - 13.56) > 3) return { text: 'Awake, though its tuning is off.', detail: reach };
    // A smaller tag (a key ring tag, a sticker) is named, with how far it reaches against a bank
    // card's, everything else the same: less over the card reader, a key ring tag a little more
    // over the phone. Without this the readout often stayed the same when the tag changed (close
    // to the phone the chip's limiter holds 3.3 V whatever the coil), so the switch seemed dead.
    if (tagOf(s) !== 'card' && !s.clone) {
      const card = reachOf({ ...s, tag: 'card' });
      return { text: `${TAG_SIZES[tagOf(s)].name}: smaller coil, still awake.`,
        detail: `Up to ${m.reach.toFixed(1)} cm. A bank card: ${card.toFixed(1)} cm.` };
    }
    // More field than the standard lets a reader make (7.5 A/m): a reader turned up, or a phone
    // right at its camera island. The chip copes, but only because its limiter burns the extra.
    if (m.field > m.H_MAX) return { text: 'Awake, in too strong a field.', detail: `Over the standard’s ${m.H_MAX} A/m. Its limiter burns the extra.` };
    // Awake, but answering faintly: very close its limiter soaks up the field, so its switch
    // changes the field less (the Answer chart shows the peak in between); far off it barely
    // changes it at all.
    if (m.dip < .02) return { text: 'Awake, but its answer is faint.',
      detail: m.limited ? 'So close, its limiter soaks up the field.' : 'Far off, it barely changes the field.' };
    // The point of it all, in numbers: the power comes through the air.
    const runs = `It runs on ${(m.watts * 1000).toFixed(1)} mW from the ${noun}.`;
    // A copy wakes and answers with the same ID: only asking it to prove itself catches it.
    if (s.clone) return { text: 'A copy: the same ID, no secret key.', detail: 'Press Check it’s real to catch it.' };
    if (phone) return { text: 'The phone powers the chip. It can answer.', detail: runs };
    return { text: 'The chip is awake. It can answer.', detail: runs };
  }
  if (s.drive < READER_ON) return phone
    ? { text: 'The phone’s NFC is off. No field, no power.', detail: 'Turn the phone’s power up.' }
    : { text: 'The reader is off. No field, no power.', detail: 'Turn the reader’s power up.' };
  switch (cause(s)) {
    case 'drive': return { text: `Asleep: the ${noun} is too weak.`, detail: reach };
    case 'angle': return { text: 'Asleep: the card is turned away.', detail: s.angle > 10 && s.distance <= nearestFor(s) + .05
      ? `Its edge on the ${noun} holds it further off too.` : 'Little field passes through a tilted coil.' };
    case 'metal': return { text: 'Asleep: the metal blocks the field.', detail: 'Metal makes currents that cancel the field.' };
    case 'tune': return { text: 'Asleep: the card is tuned wrong.', detail: 'Its coil must be tuned to 13.56 MHz.' };
    case 'tag': return { text: 'Asleep: too far for so small a coil.', detail: `${reach} A bank card’s coil would wake.` };
    case 'distance': {
      // Turned up past normal and still too far: how much more power waking it here would take.
      const k = s.drive > 100 ? powerToWake(s) : null;
      if (k) return { text: 'Asleep: too far, even turned up.', detail: `Here it would need ${timesText(k)}× normal power.` };
      return { text: `Asleep: too far from the ${noun}.`, detail: phone ? `${reach} A phone reaches less than a reader.` : reach };
    }
    default: return { text: 'Asleep: not enough power.', detail: 'Several things are working against it.' };
  }
}

// A setting kept inside its limits (the phone's camera island keeps the card 0.8 cm away).
export function clampSetting(s) {
  const out = { ...s, reader: readerOf(s), clone: Boolean(s.clone), tag: tagOf(s) };
  for (const key in LIMITS) out[key] = clampTo(+out[key], LIMITS[key]);
  out.distance = Math.max(out.distance, nearestFor(out));
  return out;
}

// The card's answer to a challenge: a code worked out from the challenge and its secret key. Real
// cards use a standard cipher (AES or 3DES) for this; this stand-in mixes the key and the
// challenge the same way in spirit: change either by one bit and the whole code changes, and
// without the key there is no way to get it right. The bank keeps a copy of the key, so the
// reader (through the bank) can check the code. A copy of the card has the ID but not the key.
export function proofCode(key, challenge) {
  let h = 0x811c9dc5;
  const out = [];
  for (let round = 0; round < 4; round++) {
    for (const byte of [...key, ...challenge, round, ...key]) {
      h ^= byte;
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 15;
      h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    }
    out.push(h & 0xff);
  }
  return out;
}

// The card's ID typed by the visitor: four bytes in hex ("04 7B 21 9E"), or null.
// The numbers behind the lab, for whoever wants them (the panel's "The numbers behind it"), all
// from the same solve as everything else: how tightly the two coils are linked (the coupling k,
// the share of one coil's field that threads the other, and the mutual inductance M), the voltage
// the field induces in the card's coil (peak), where the card's own circuit resonates, the
// reader's coil current (peak), the two coils' inductances, and how much the answer changes the
// reader's current.
export function behind(s) {
  const P = physics();
  if (!P) return null;
  const r = P.solve(options(s)), reader = P.READERS[readerOf(s)];
  return {
    k: Math.abs(r.mutual) / Math.sqrt(reader.inductance * r.inductance), mutual: Math.abs(r.mutual),
    emf: r.emf, resonance: r.resonance, current: r.readerCurrent,
    tagInductance: r.inductance, readerInductance: reader.inductance, dip: r.dip,
  };
}

// Why a typed ID can't be a card's, or null if it can be: four bytes in hex, and not starting
// with 88, the cascade tag (CT) that tells the reader a longer ID follows (ISO/IEC 14443-3).
export function idProblem(text) {
  const bytes = parseId(text);
  if (!bytes) return 'An ID is four bytes, like 04 7B 21 9E.';
  if (bytes[0] === 0x88) return '88 can’t come first: it means a longer ID follows.';
  return null;
}

export function parseId(text) {
  const hex = text.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 8) return null;
  return hex.match(/../g).map(byte => parseInt(byte, 16));
}
