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
export const METAL_GAPS = [null, .02, .01, .005, .002];
export const LAB_START = { distance: 3, angle: 0, metal: 0, drive: 100, tune: 13.56 };
export const LIMITS = {
  distance: [.5, 10], angle: [0, 90], metal: [0, METAL_GAPS.length - 1], drive: [0, 150], tune: [5, 30],
};
// Situations to try, one click each.
export const PRESETS = {
  tap: { label: 'Normal tap', ...LAB_START },
  far: { label: 'Too far', ...LAB_START, distance: 7 },
  side: { label: 'Side-on', ...LAB_START, distance: 2, angle: 80 },
  metal: { label: 'On metal', ...LAB_START, distance: 2.5, metal: 4 },
  weak: { label: 'Weak reader', ...LAB_START, distance: 3.5, drive: 40 },
  tuned: { label: 'Badly tuned', ...LAB_START, distance: 2, tune: 6 },
};

const physics = () => globalThis.RFID?.physics;
const clampTo = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

// The engine's options for a setting (SI units).
function options(s, distanceCm = s.distance) {
  const P = physics(), C0 = P.TAGS.card.capacitance;
  return {
    tag: 'card', reader: 'pad',
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
    reach: P.range(o, .2) * 100,
    shield: bare.field > 0 ? Math.max(0, 1 - r.field / bare.field) : 0,
    H_MIN: P.H_MIN,
  };
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
  } else {
    for (let i = 0; i <= 120; i++) {
      const cm = .5 + 9.5 * i / 120;
      points.push([cm, P.solve(options(s, cm)).rawVolts]);
    }
  }
  return points;
}

// What the 3D shows for a setting (cinema.js levels), from its measurement.
export function labLevels(s, m) {
  const gap = Math.max(.0016, s.distance / 100 - .0032);
  if (!m) return { gap };
  const drive = s.drive / 100;
  return {
    gap,
    tilt: s.angle * Math.PI / 180,
    metal: s.metal > 0 ? 1 : 0,
    plate: METAL_GAPS[Math.round(s.metal)] ?? .02,
    shield: m.shield,
    // The reader's coil and its field follow its power; the card's current follows what is
    // induced in it; the chip lights only once it is awake.
    emit: Math.min(1.1, .1 + .9 * drive),
    field: Math.min(1.1, .15 + .85 * drive),
    receive: Math.min(1, (m.raw / 4.2) ** .7),
    power: m.awake ? 1 : 0,
    blink: m.awake ? .3 : 0,
    charge: Math.min(1, m.raw / m.wake),
    answerScale: Math.max(.15, Math.min(1.2, m.dip / .06)),
    falloff: 1,
  };
}

// Whether the chip wakes with a setting (no range, so it is quick).
function wakes(s) {
  const P = physics();
  return Boolean(P && P.solve(options(s)).awake);
}

// Why the chip is asleep, found by asking the physics rather than guessing: each control,
// put back to normal on its own, in order of how much it usually matters. The first that
// would wake the chip by itself is the reason. Null if none would on its own.
const CAUSES = ['drive', 'angle', 'metal', 'tune', 'distance'];
function cause(s) {
  for (const key of CAUSES) if (s[key] !== LAB_START[key] && wakes({ ...s, [key]: LAB_START[key] })) return key;
  return null;
}

// The one plain sentence (and its small print) for a setting: the most important reason.
export function status(s, m) {
  if (!m) return { text: 'Change anything. Watch what happens.', detail: '' };
  const reach = m.reach < .05 ? 'Like this, it works at no distance.' : `Like this, it works up to ${m.reach.toFixed(1)} cm.`;
  if (m.awake) {
    if (s.drive < 5) return { text: 'The chip is awake.', detail: reach };
    if (s.angle > 45 && !wakes({ ...s, angle: s.angle + 15 })) return { text: 'Awake, but only just: it is turned away.', detail: 'Less field passes through a tilted coil.' };
    if (s.metal > 0) return { text: 'Awake, but metal soaks up the field.', detail: reach };
    if (s.drive < 70) return { text: 'Awake, on a weak field.', detail: reach };
    if (Math.abs(s.tune - 13.56) > 3) return { text: 'Awake, though its tuning is off.', detail: reach };
    return { text: 'The chip is awake. It can answer.', detail: reach };
  }
  if (s.drive < 5) return { text: 'The reader is off. No field, no power.', detail: 'Turn the reader’s power up.' };
  switch (cause(s)) {
    case 'drive': return { text: 'Asleep: the reader is too weak.', detail: reach };
    case 'angle': return { text: 'Asleep: the card is turned away.', detail: 'Little field passes through a tilted coil.' };
    case 'metal': return { text: 'Asleep: the metal blocks the field.', detail: 'Metal makes currents that cancel the field.' };
    case 'tune': return { text: 'Asleep: the card is tuned wrong.', detail: 'Its coil must be tuned to 13.56 MHz.' };
    case 'distance': return { text: 'Asleep: too far from the reader.', detail: reach };
    default: return { text: 'Asleep: not enough power.', detail: 'Several things are working against it.' };
  }
}

// A setting kept inside its limits.
export function clampSetting(s) {
  const out = { ...s };
  for (const key in LIMITS) out[key] = clampTo(+out[key], LIMITS[key]);
  return out;
}

// The card's ID typed by the visitor: four bytes in hex ("04 7B 21 9E"), or null.
export function parseId(text) {
  const hex = text.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 8) return null;
  return hex.match(/../g).map(byte => parseInt(byte, 16));
}
