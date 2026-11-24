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
export const METAL_GAPS = [null, .02, .01, .005, .002];
export const LAB_START = { distance: 3, angle: 0, metal: 0, drive: 100, tune: 13.56, reader: 'pad' };
export const LIMITS = {
  distance: [.5, 10], angle: [0, 90], metal: [0, METAL_GAPS.length - 1], drive: [0, 150], tune: [5, 30],
};
// The two readers. A phone's coil is smaller and weaker (js/rfid/physics.js READERS: 2 turns of
// 21 mm against the pad's 35 mm, 0.21 A against 0.525 A), so it only reaches about 2.4 cm and a
// normal tap is about 1 cm. Its camera island stands 7 mm proud of its coil (phone-reader.js),
// so a card can't come closer than 0.8 cm.
export const READERS = {
  pad: { label: 'Card reader', noun: 'reader', start: 3, nearest: .5 },
  phone: { label: 'Phone', noun: 'phone', start: 1, nearest: .8 },
};
const readerOf = s => READERS[s.reader] ? s.reader : 'pad';
// Where a setting starts for a reader: everything normal, the card at that reader's normal tap.
export const startFor = reader => ({ ...LAB_START, reader, distance: READERS[reader].start });
// Situations to try, one click each, for each reader. Every one is checked against the physics:
// the normal tap wakes the chip, and each of the others puts it to sleep for its own reason.
export const PRESETS = {
  pad: {
    tap: { label: 'Normal tap', ...startFor('pad') },
    far: { label: 'Too far', ...startFor('pad'), distance: 7 },
    side: { label: 'Side-on', ...startFor('pad'), distance: 2, angle: 80 },
    metal: { label: 'On metal', ...startFor('pad'), distance: 2.5, metal: 4 },
    weak: { label: 'Weak reader', ...startFor('pad'), distance: 3.5, drive: 40 },
    tuned: { label: 'Badly tuned', ...startFor('pad'), distance: 2, tune: 6 },
  },
  phone: {
    tap: { label: 'Normal tap', ...startFor('phone') },
    far: { label: 'Too far', ...startFor('phone'), distance: 3.5 },
    side: { label: 'Side-on', ...startFor('phone'), angle: 80 },
    metal: { label: 'On metal', ...startFor('phone'), metal: 4 },
    weak: { label: 'Weak phone', ...startFor('phone'), distance: 1.2, drive: 50 },
    tuned: { label: 'Badly tuned', ...startFor('phone'), tune: 6 },
  },
};

const physics = () => globalThis.RFID?.physics;
// Below this power (%) the reader counts as off: it sends no question.
export const READER_ON = 1;
const clampTo = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

// The engine's options for a setting (SI units).
function options(s, distanceCm = s.distance) {
  const P = physics(), C0 = P.TAGS.card.capacitance;
  return {
    tag: 'card', reader: readerOf(s),
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
    H_MIN: P.H_MIN,
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
    receive: Math.min(1.15, current * current),
    cardPace: Math.min(1.5, current),
    // Into the chip: only once it is awake, as much as it gets (its limiter holds it at 3.3 V).
    power: m.awake ? Math.max(.6, Math.min(1, m.volts / m.clamp)) : 0,
    blink: m.awake ? .3 : 0,
    charge: chipPower(m),
    answerScale: Math.max(.15, Math.min(1.2, m.dip / .06)),
    falloff: 1,
    // Which reader shows: the pad (0) or the phone (1). It glides, so the swap is animated.
    phone: readerOf(s) === 'phone' ? 1 : 0,
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

// Why the chip is asleep, found by asking the physics rather than guessing: each control,
// put back to normal on its own, in order of how much it usually matters. The first that
// would wake the chip by itself is the reason. Null if none would on its own.
const CAUSES = ['drive', 'angle', 'metal', 'tune', 'distance'];
function cause(s) {
  const normal = startFor(readerOf(s));
  for (const key of CAUSES) if (s[key] !== normal[key] && wakes({ ...s, [key]: normal[key] })) return key;
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
    // Awake, but answering faintly: very close its limiter soaks up the field, so its switch
    // changes the field less (the Answer chart shows the peak in between); far off it barely
    // changes it at all.
    if (m.dip < .02) return { text: 'Awake, but its answer is faint.',
      detail: m.limited ? 'So close, its limiter soaks up the field.' : 'Far off, it barely changes the field.' };
    // The point of it all, in numbers: the power comes through the air.
    const runs = `It runs on ${(m.watts * 1000).toFixed(1)} mW from the ${noun}.`;
    if (phone) return { text: 'The phone powers the chip. It can answer.', detail: runs };
    return { text: 'The chip is awake. It can answer.', detail: runs };
  }
  if (s.drive < READER_ON) return phone
    ? { text: 'The phone’s NFC is off. No field, no power.', detail: 'Turn the phone’s power up.' }
    : { text: 'The reader is off. No field, no power.', detail: 'Turn the reader’s power up.' };
  switch (cause(s)) {
    case 'drive': return { text: `Asleep: the ${noun} is too weak.`, detail: reach };
    case 'angle': return { text: 'Asleep: the card is turned away.', detail: 'Little field passes through a tilted coil.' };
    case 'metal': return { text: 'Asleep: the metal blocks the field.', detail: 'Metal makes currents that cancel the field.' };
    case 'tune': return { text: 'Asleep: the card is tuned wrong.', detail: 'Its coil must be tuned to 13.56 MHz.' };
    case 'distance': return { text: `Asleep: too far from the ${noun}.`, detail: phone ? `${reach} A phone reaches less than a reader.` : reach };
    default: return { text: 'Asleep: not enough power.', detail: 'Several things are working against it.' };
  }
}

// A setting kept inside its limits (the phone's camera island keeps the card 0.8 cm away).
export function clampSetting(s) {
  const out = { ...s, reader: readerOf(s) };
  for (const key in LIMITS) out[key] = clampTo(+out[key], LIMITS[key]);
  out.distance = Math.max(out.distance, READERS[out.reader].nearest);
  return out;
}

// The card's ID typed by the visitor: four bytes in hex ("04 7B 21 9E"), or null.
export function parseId(text) {
  const hex = text.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 8) return null;
  return hex.match(/../g).map(byte => parseInt(byte, 16));
}
