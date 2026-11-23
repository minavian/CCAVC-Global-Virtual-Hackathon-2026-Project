// The close-up of a tap. It is driven by the visitor, not by a clock:
// - While the card is dragged toward the reader, everything follows how far away it is
//   (`approach`): the reader's field, the current in the card's coil, the chip's power.
// - Once the card is dropped on the reader, the visitor steps through the exchange with
//   Next and Back (`STEPS`). Each step is a live loop that runs for as long as it is shown.
// - In the middle, the card and the reader talk (`TALK`): the lights go down, the camera
//   dives in between them, the visitor presses Ask and the reader's question flows from its
//   chip, round its coil, across to the card's coil, round that and into the card's chip
//   (river.js, `LEGS`); the card's ID flows back the same way by itself.
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
// reply: the card's answer leaving through its coil. read, thinking: the reader taking the answer in and
//   checking it. check: the check mark.
// page: the rest of the page (instructions, scroll guide). panel: the readout. explain:
//   the explanation at the end.
// charge: the chip's power, as the readout shows it. dark: the lights going down for the
//   conversation. river: the channel the conversation flows along (river.js).
export const IDLE = {
  dock: 0, gap: .034, card: 1, xray: 0, copper: 1, reader: 1, shell: 1,
  emit: 0, field: 0, receive: 0, power: 0, blink: 0, reply: 0, read: 0, thinking: 0,
  check: 0, page: 1, panel: 0, explain: 0, charge: 0, dark: 0, river: 0,
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

// After the drop: the tap, one step at a time. `ms` is when it happens in a real tap
// (round numbers; the whole exchange takes about 5 ms). `shot` names the camera. A step
// with `talk` is part of the conversation: the lights go down, the camera dives in between
// the card and the reader, and the message flows along the river (river.js). In the `ask`
// step the visitor plays the reader: nothing is sent until they press Ask.
export const REAL_MS = 5;
export const STEPS = [
  { text: 'The reader sends out a radio signal.', ms: [0, .1], shot: 'field',
    levels: { card: .28, xray: 1, shell: .1, emit: 1, field: 1 } },
  { text: 'The signal makes a current in the card’s coil.', ms: [.1, .3], shot: 'coil',
    levels: { xray: 1, reader: DIM, shell: .5, emit: .6, field: .5, receive: 1 } },
  { text: 'The current powers the chip. No battery needed.', ms: [.3, 1], shot: 'power',
    levels: { xray: 1, reader: DIM, shell: .5, emit: .4, receive: .8, power: 1, blink: .5, charge: 1 } },
  { text: 'Your turn. Ask the card who it is.', asking: 'The reader asks: who are you?', ms: [1, 1.5],
    shot: 'ask', talk: 'ask',
    levels: { xray: 1, shell: .14, emit: .3, receive: .35, power: .7, charge: 1, dark: 1, river: 1 } },
  { text: 'The chip answers with its ID.', ms: [1.5, 2.5], shot: 'answer', talk: 'answer',
    levels: { xray: 1, shell: .14, emit: .2, power: .6, blink: .4, charge: 1, dark: 1, river: 1 } },
  { text: 'The reader checks the ID.', ms: [2.5, 5], shot: 'read',
    levels: { card: DIM, xray: 1, shell: .1, emit: .15, read: 1, thinking: 1, charge: 1 } },
  { text: 'Verified. Card detected.', ms: [5, 5], shot: 'done',
    levels: { gap: .0016, check: 1, charge: 1 } },
  { text: '', ms: [5, 5], shot: 'rest', explain: true,
    levels: { gap: .0016, check: 1, page: 1, panel: 0, explain: 1, charge: 1 } },
].map(step => ({ ...step, levels: { ...IDLE, dock: 1, gap: .012, page: DIM, panel: 1, ...step.levels } }));
// Every drop starts at step 1. The drag shows how distance changes the power; the steps
// are the tap itself, slowed down, so they always begin with the reader's signal.
export const LAST = STEPS.length - 1;
export const ASK = STEPS.findIndex(step => step.talk === 'ask');

// The conversation: the reader asks for the card's ID, the card sends it. These are the
// real frames of ISO/IEC 14443-3 anticollision, built by js/rfid/iso14443a.js: the reader
// sends SEL 0x93 with NVB 0x20 ("everyone, send your whole ID"); the card answers with its
// four ID bytes and their check byte (BCC). On the air each byte is 8 bits, lowest first,
// then an odd check bit.
const iso = globalThis.RFID?.iso;
const ID = [0x04, 0x7b, 0x21, 0x9e];
const frame = bytes => iso ? iso.standardFrame(bytes)
  : bytes.flatMap(b => [...Array.from({ length: 8 }, (_, i) => (b >> i) & 1), 1 - [0, 1, 2, 3, 4, 5, 6, 7].reduce((n, i) => n ^ (b >> i) & 1, 0)]);
const check = iso ? iso.bcc(ID) : ID.reduce((a, b) => a ^ b, 0);
const hex = bytes => bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
export const TALK = {
  // `every`: seconds between one bit and the next, as shown.
  ask: { dir: 1, words: 'Who are you?', bits: frame([iso?.SEL1 ?? 0x93, iso?.NVB_ALL ?? 0x20]), every: .06 },
  answer: { dir: -1, words: 'ID ' + hex(ID), bits: frame([...ID, check]), every: .036 },
};
export const CARD_ID = hex(ID);

// The way a message travels, from the reader's chip (0) to the card's chip (1), in three
// legs (river.js draws each): along the reader's wire from its chip into its coil and
// round the coil; across the gap from the reader's coil to the card's coil; round the
// card's coil and in through its small coil and wires to its chip. Chip, coil, coil, chip.
// The answer takes the same legs back. Each leg takes this many seconds for the front.
export const LEGS = [['reader', .8], ['gap', 1], ['card', 1.1]];
const RUN = LEGS.reduce((sum, [, seconds]) => sum + seconds, 0);
// Where each leg starts and ends along the way, from 0 at the reader's chip to 1 at the card's.
export const LEG = {};
LEGS.reduce((at, [name, seconds]) => { LEG[name] = [at / RUN, (at + seconds) / RUN]; return at + seconds; }, 0);

// How a message moves. `dir` is +1 from the reader to the card, -1 back. `head` is how far
// its front has gone from the sender (0 to 1); its bits follow in single file `spacing`
// apart, and the way behind the last bit dims again (`tail`). `done` once every bit has
// reached the far chip.
export function message(name, seconds) {
  const talk = TALK[name];
  const head = Math.max(0, seconds) / RUN, spacing = talk.every / RUN;
  const last = head - .012 - (talk.bits.length - 1) * spacing;
  return { ...talk, head, tail: last - .1, spacing, done: last > 1, landed: smoother(1, 1.12, last) };
}

// While a message flows, each part lights up for as long as the message is on it: the
// sender's coil, then the receiver's coil, then the chip it is for.
export function talkLevels(levels, said) {
  const along = x => (said.dir > 0 ? x : 1 - x);   // from the sender's side to the reader-to-card way
  const a = along(said.head), b = along(said.tail), lo = Math.min(a, b), hi = Math.max(a, b);
  const on = ([from, to]) => smoother(from, from + .04, hi) * (1 - smoother(to - .02, to + .03, lo));
  const reader = on(LEG.reader), card = on(LEG.card), out = { ...levels };
  if (said.dir > 0) {
    out.emit = Math.max(levels.emit, reader);         // the reader's coil carries the question
    out.receive = Math.max(levels.receive, card);     // then the card's coil
    out.blink = Math.max(levels.blink, said.landed);  // and the chip works on it
  } else {
    out.reply = card;                                 // the card's coil carries the answer
    out.read = reader * .9;                           // then the reader's coil
    out.thinking = said.landed * .8;                  // and the reader's chip has it
  }
  return out;
}

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
  // The middle of the river's whole run, from the reader's chip to the card's (river.js).
  river: gap => [-.022, -.006, COIL_Z + (cardZ(gap) - COIL_Z) * .5],
};

// The camera for each step: zoom, what it looks at, where that sits on screen (shares of
// the stage; the readout takes the left on a wide screen and the top on a phone), the
// viewing angle, and the lens: `fov` is its field of view in degrees, 0 for none (flat,
// like a plan drawing). Between shots the lens widens as the camera moves in, so the
// framing holds while the depth opens up (a dolly zoom).
export const SHOTS = {
  field: { zoom: 2.15, focus: 'gap', at: [.64, .6], tilt: 1.3, spin: -.3, yaw: .04, fov: 26 },
  coil: { zoom: 2, focus: 'card', at: [.64, .56], tilt: .66, spin: -.5, yaw: 0, fov: 14 },
  power: { zoom: 7.5, focus: 'chip', at: [.64, .55], tilt: .82, spin: -.72, yaw: .03, fov: 18 },
  // The conversation: low between the card and the reader, the lens wide open.
  // `phone` is the framing on a narrow screen, where the readout takes the top.
  ask: { zoom: 2.3, focus: 'river', at: [.6, .62], tilt: 1.3, spin: .35, yaw: -.02, fov: 50, phone: { at: [.48, .7], zoom: 1.36 } },
  answer: { zoom: 2.5, focus: 'river', at: [.58, .6], tilt: 1.12, spin: 1.25, yaw: .05, fov: 58, phone: { at: [.5, .68], zoom: 1.55 } },
  read: { zoom: 2.5, focus: 'readerChip', at: [.64, .5], tilt: .92, spin: -.75, yaw: .02, fov: 16 },
  done: { zoom: 2.1, focus: 'top', at: [.63, .58], tilt: .96, spin: -.92, yaw: .03, fov: 0 },
};

// A camera: { zoom, focus: [x, y, z], at: [x, y], tilt, spin, yaw, fov }. `rest` is where
// the reader's centre sits on the stage at rest, as shares of its width and height.
export function view(name, gap, rest, compact) {
  const shot = SHOTS[name];
  if (!shot) return { zoom: 1, focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST, fov: 0 };
  const at = compact ? shot.phone?.at ?? [.5, shot.at[1] + .1] : shot.at;
  const zoom = compact ? shot.phone?.zoom ?? (shot.zoom > 1 ? shot.zoom * .82 : shot.zoom) : shot.zoom;
  return { zoom, focus: FOCUS[shot.focus](gap), at, tilt: shot.tilt, spin: shot.spin, yaw: shot.yaw, fov: shot.fov };
}

// While the card is dragged, the camera pushes in on the reader as the card comes near,
// keeping the reader where it stands, so the place to drop it never moves.
export function approachView(cm, rest, compact) {
  return { zoom: 1 + (compact ? .18 : .28) * smoother(9, 1, cm), focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST, fov: 0 };
}
