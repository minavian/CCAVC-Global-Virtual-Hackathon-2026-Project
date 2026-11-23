// The close-up of a tap. It is driven by the visitor, not by a clock:
// - While the card is dragged toward the reader, everything follows how far away it is
//   (`approach`): the reader's field, the current in the card's coil, the chip's power.
// - Once the card is dropped on the reader, the visitor steps through the exchange with
//   Next and Back (`STEPS`). Each step is a live loop that runs for as long as it is shown.
// Both give a set of target levels (`IDLE` lists them) and a camera (`view`); main.js
// glides what is shown toward them, card-scene.js draws the 3D and effects.js the waves,
// the current and the bits.
import { clamp, smoother } from './easing.js';
import { TOP, COIL_Z, CHIP as READER_CHIP } from './reader-size.js';

export const MHZ = '13.56';   // the carrier of bank and metro cards (ISO 14443), in MHz

// Where the card lies over the reader (metres, in the reader's frame), and the reader's
// resting angle: tipped back to show its top and front.
export const HOVER = { x: .002, y: -.003, spin: -.1 };
export const REST = { tilt: .68, spin: -.3, yaw: .2 };

// Distance. The drag happens on a flat screen, so how far the card is from the reader's
// centre (`zone`: 1 is the edge of the drop zone) is turned into centimetres. The drop
// zone's edge is about 4 cm, where a real card wakes up; the nearest is half a centimetre.
export const NEAREST = .5, FARTHEST = 10, WAKE_CM = 4;
export const centimetres = zone => clamp(NEAREST + (zone - .25) * 4.75, NEAREST, FARTHEST);

// The power that reaches the card at `cm`, as a share of what it gets lying on the reader.
// On the axis of a round coil of radius R, the field falls as (R² / (R² + d²))^1.5, and the
// power the card can collect goes as the field squared. R is about the reader coil's size.
const R2 = 3.5 ** 2;
const field = cm => (R2 / (R2 + cm * cm)) ** 1.5;
export const power = cm => (field(cm) / field(NEAREST)) ** 2;
export const WAKE = power(WAKE_CM);   // about 9%: the chip needs this much to start

// Every level main.js glides, at rest. Opacities and strengths run 0 to 1.
// dock: the card's place, free (0) or lying over the reader (1); gap: its height above
//   the reader's top, in metres.
// card, reader: each object as a whole (focus dims the one not being shown to 15% or less).
// xray: the card's shell turns see-through. copper: the card's coils. shell: the reader's
//   body (low shows its coil, board and chip).
// emit, field: current in the reader's coil and the field rising from it. receive: current
//   in the card's coils. power: current into the chip. blink: the chip working.
// reply, bits: the card's answer. read, thinking: the reader taking the answer in and
//   checking it. check: the check mark.
// page: the rest of the page (instructions, scroll guide). panel: the readout. explain:
//   the explanation at the end.
// charge: the chip's power, as the readout shows it.
export const IDLE = {
  dock: 0, gap: .034, card: 1, xray: 0, copper: 1, reader: 1, shell: 1,
  emit: 0, field: 0, receive: 0, power: 0, blink: 0, reply: 0, bits: 0, read: 0, thinking: 0,
  check: 0, page: 1, panel: 0, explain: 0, charge: 0,
};
const DIM = .12;   // what is not being shown fades to this

// While the card is dragged: the levels at `cm` from the reader.
export function approach(cm) {
  const reach = smoother(9, 6.5, cm);          // the close-up comes in as the card comes near
  const share = power(cm);
  return {
    ...IDLE,
    page: 1 - (1 - DIM) * reach,
    panel: reach,
    shell: 1 - .88 * reach,                     // the reader shows its coil
    emit: reach,
    field: reach,
    xray: smoother(7.5, 5, cm),                 // the card shows its coil
    receive: clamp(Math.sqrt(share) * 1.5) * smoother(8, 5.5, cm),
    power: smoother(WAKE * .75, WAKE * 2.2, share),
    blink: smoother(.5, .85, share) * .6,
  };
}

// What the readout says while the card is dragged: one sentence for each band of
// distance. `before` is the band shown last; a band changes only once the card is
// .15 cm past its edge, so the words don't flicker on the line.
const BANDS = [6.5, WAKE_CM, 1.5];
export const APPROACH_TEXT = [
  'Closer. The reader’s signal only reaches a few centimetres.',
  'The signal reaches the card. A small current flows in its coil.',
  'Closer, the current is strong enough to power the chip.',
  'The chip is awake. Let go to tap.',
];
export function approachBand(cm, before = -1) {
  let band = BANDS.filter(edge => cm <= edge).length;
  if (before >= 0 && band !== before) {
    const edge = BANDS[Math.min(band, before)];
    if (Math.abs(cm - edge) < .15) band = before;
  }
  return band;
}

// After the drop: the exchange, one step at a time. `ms` is when it happens in a real tap
// (round numbers; the whole exchange takes about 5 ms). `shot` names the camera.
export const REAL_MS = 5;
export const STEPS = [
  { text: 'The reader sends out a radio signal.', ms: [0, .1], shot: 'field',
    levels: { card: .28, xray: 1, shell: .1, emit: 1, field: 1 } },
  { text: 'The signal makes a current in the card’s coil.', ms: [.1, .3], shot: 'coil',
    levels: { xray: 1, reader: DIM, shell: .5, emit: .6, field: .5, receive: 1 } },
  { text: 'The current powers the chip. No battery needed.', ms: [.3, 1.2], shot: 'power',
    levels: { xray: 1, reader: DIM, shell: .5, emit: .4, receive: .8, power: 1, blink: .5, charge: 1 } },
  { text: 'The chip answers through the same coil.', ms: [1.2, 3], shot: 'answer',
    levels: { xray: 1, shell: .1, emit: .2, power: .5, reply: 1, bits: 1, charge: 1 } },
  { text: 'The reader reads the answer and checks it.', ms: [3, 5], shot: 'read',
    levels: { card: DIM, xray: 1, shell: .1, emit: .15, read: 1, thinking: 1, charge: 1 } },
  { text: 'Verified. Card detected.', ms: [5, 5], shot: 'done',
    levels: { gap: .0016, check: 1, charge: 1 } },
  { text: '', ms: [5, 5], shot: 'rest', explain: true,
    levels: { gap: .0016, check: 1, page: 1, panel: 0, explain: 1, charge: 1 } },
].map(step => ({ ...step, levels: { ...IDLE, dock: 1, gap: .012, page: DIM, panel: 1, ...step.levels } }));
// Every drop starts at step 1. The drag shows how distance changes the power; the steps
// are the tap itself, slowed down, so they always begin with the reader's signal.
export const LAST = STEPS.length - 1;

// Points the camera looks at, in the reader's frame (metres). `gap` is the card's height.
const cardZ = gap => TOP + gap;
const FOCUS = {
  reader: () => [0, 0, 0],
  top: () => [0, 0, TOP],
  gap: gap => [0, 0, (TOP + cardZ(gap)) / 2],
  card: gap => [HOVER.x, HOVER.y, cardZ(gap)],
  chip: gap => {
    const [x, y] = [-.0277, .0031], s = Math.sin(HOVER.spin), k = Math.cos(HOVER.spin);
    return [HOVER.x + x * k - y * s, HOVER.y + x * s + y * k, cardZ(gap)];
  },
  readerChip: () => [READER_CHIP.x, READER_CHIP.y, (READER_CHIP.z + COIL_Z) / 2],
};

// The camera for each step: zoom, what it looks at, where that sits on screen (shares of
// the stage; the readout takes the left on a wide screen and the top on a phone), and the
// viewing angle.
const SHOTS = {
  field: { zoom: 2, focus: 'gap', at: [.63, .58], tilt: 1.12, spin: -.34, yaw: .05 },
  coil: { zoom: 2.1, focus: 'card', at: [.63, .56], tilt: .62, spin: -.5, yaw: 0 },
  power: { zoom: 7, focus: 'chip', at: [.63, .55], tilt: .78, spin: -.7, yaw: .03 },
  answer: { zoom: 3.3, focus: 'gap', at: [.63, .56], tilt: 1.04, spin: -.84, yaw: .02 },
  read: { zoom: 2.5, focus: 'readerChip', at: [.64, .5], tilt: .92, spin: -.75, yaw: .02 },
  done: { zoom: 2.1, focus: 'top', at: [.63, .58], tilt: .96, spin: -.92, yaw: .03 },
};

// A camera: { zoom, focus: [x, y, z], at: [x, y], tilt, spin, yaw }. `rest` is where the
// reader's centre sits on the stage at rest, as shares of its width and height.
export function view(name, gap, rest, compact) {
  const shot = SHOTS[name];
  if (!shot) return { zoom: 1, focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST };
  const at = compact ? [.5, shot.at[1] + .06] : shot.at;
  const zoom = compact && shot.zoom > 1 ? shot.zoom * .9 : shot.zoom;
  return { zoom, focus: FOCUS[shot.focus](gap), at, tilt: shot.tilt, spin: shot.spin, yaw: shot.yaw };
}

// While the card is dragged, the camera pushes in on the reader as the card comes near,
// keeping the reader where it stands, so the place to drop it never moves.
export function approachView(cm, rest, compact) {
  return { zoom: 1 + (compact ? .18 : .28) * smoother(9, 1, cm), focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST };
}
