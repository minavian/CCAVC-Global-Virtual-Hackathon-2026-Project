// The close-up of a tap. It is driven by the visitor, not by a clock:
// - While the card is dragged toward the reader, everything follows how far away it is
//   (`approach`): the reader's field, the current in the card's coil, the chip's power.
// - Once the card is dropped on the reader, the visitor steps through the exchange with
//   Next and Back (`STEPS`). Each step is a live loop that runs for as long as it is shown.
// - The steps show one new thing at a time, in one picture language (effects.js):
//   electricity is light running along a wire; the field is rings rising from the reader's
//   coil to the card's (orange), or coming back down (blue, the answer).
// - Then the card and the reader talk (`TALK`). The visitor presses Ask and the reader
//   sends its question the way a real reader does, as short gaps in its field; the card's
//   chip works on it for the standard's wait, then answers by switching a load on its coil.
//   Everything runs on one clock, the real one slowed down (`message`).
// Both give a set of target levels (`IDLE` lists them) and a camera (`view`); main.js
// glides what is shown toward them, card-scene.js draws the 3D, and effects.js the rings
// and the current.
import { clamp, smoother } from './easing.js';
import { TOP, COIL_Z, CHIP as READER_CHIP } from './reader-size.js';

export const MHZ = '13.56';   // the carrier of bank and metro cards (ISO 14443), in MHz

// Where the card lies over the reader (metres, in the reader's frame), and the reader's
// resting angle: tipped back to show its top and front.
export const HOVER = { x: .002, y: -.003, spin: -.1 };
export const REST = { tilt: .68, spin: -.3, yaw: .2 };
// How high the card is held over the reader's top after the drop (metres): 3 cm, a
// realistic tap, and enough room to see the field cross from one coil to the other.
export const TALK_GAP = .03;

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
// reply: the card's answer, going out through its coil and down to the reader (blue).
//   read, thinking: the reader taking the answer in and checking it. check: the check mark.
// page: the rest of the page (instructions, scroll guide). panel: the readout. explain:
//   the explanation at the end.
// charge: the chip's power, as the readout shows it. dark: the lights going down for the
//   close-up after the drop, so the current and the field glow.
export const IDLE = {
  dock: 0, gap: .034, card: 1, xray: 0, copper: 1, reader: 1, shell: 1,
  emit: 0, field: 0, receive: 0, power: 0, blink: 0, reply: 0, read: 0, thinking: 0,
  check: 0, page: 1, panel: 0, explain: 0, charge: 0, dark: 0,
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
// The line of small print under each sentence, while the card is dragged.
export const APPROACH_DETAIL = [
  'Keep moving the card toward the reader.',
  'Not enough power for the chip yet.',
  'Watch the chip power fill up.',
  'Drop it to watch the tap slowed down.',
];
export function approachBand(cm, before = -1) {
  let band = BANDS.filter(edge => cm <= edge).length;
  if (before >= 0 && band !== before) {
    const edge = BANDS[Math.min(band, before)];
    if (Math.abs(cm - edge) < .15) band = before;
  }
  return band;
}

// The conversation: the reader asks for the card's ID, the card sends it. These are the
// real frames of ISO/IEC 14443-3 anticollision, built by js/rfid/iso14443a.js: the reader
// sends SEL 0x93 with NVB 0x20 ("everyone, send your whole ID"); the card answers with its
// four ID bytes and their check byte (BCC). On the air each byte is 8 bits, lowest first,
// then an odd check bit.
//
// How each goes on the air, at 106 kbit/s (ISO/IEC 14443-2 Type A), from the same code the
// story's simulations run on:
// - The reader switches its field off for 2.36 µs at a time (100% ASK), placed by modified
//   Miller coding (`millerPauses`). The field dies away and comes back in a fraction of a
//   microsecond (`fieldAtTag` in js/rfid/air.js). The card's chip runs through each gap on
//   the charge it has stored.
// - The card switches a load across its coil on and off 847,500 times a second, in the
//   first half of a bit for a 1 and the second half for a 0 (Manchester coding,
//   `manchesterSwitch`). The reader feels its own field change by a few percent.
// - The card starts its answer a fixed time after the reader's last gap (`answerDelay`):
//   that is how long its chip has to work out the answer.
// Everything here happens at once along the whole path: the wires and coils are a few
// centimetres long and the change crosses the 15 mm gap in 50 picoseconds, while a bit
// lasts 9.44 µs. So one clock, the real one slowed down, runs all of it.
const iso = globalThis.RFID?.iso, air = globalThis.RFID?.air;
const ID = [0x04, 0x7b, 0x21, 0x9e];
const check = iso ? iso.bcc(ID) : ID.reduce((a, b) => a ^ b, 0);
const hex = bytes => bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
export const CARD_ID = hex(ID);
// One sample is 4 carrier cycles; one bit is 32 samples (9.44 µs). See iso14443a.js.
const BIT = iso?.BIT ?? 32, SUB = iso?.SUB ?? 4, RATE = iso?.SAMPLE_RATE ?? 3.39e6;
export const SAMPLES_PER_BIT = BIT;
// One bit as shown: 0.15 s, about 16,000 times slower than in life.
export const BIT_SECONDS = .15;

// The signal over the frame, one value a sample. The question: the reader's field at the
// card (1 on, 0 in a gap). The answer: the card's switch (1 while it switches the load).
// What a receiver makes of a signal: a real card (and a real reader) runs what it picks up
// through a smoothing filter before it decides on each bit (its demodulator: here two RC
// stages, each with a time constant of 10 samples, about a third of a bit). A 2.36 µs gap
// comes out of it as a soft dip, and a burst of the card's load as a soft swell. The 3D
// follows this, so the picture pulses with the message instead of strobing; the trace under
// the label shows the exact signal.
function demodulate(signal, start, tau = 10) {
  const k = 1 - Math.exp(-1 / tau), out = new Float32Array(signal.length);
  let a = start, b = start;
  for (let n = 0; n < signal.length; n++) {
    a += (signal[n] - a) * k;
    b += (a - b) * k;
    out[n] = b;
  }
  return out;
}

function onTheAir(bytes, dir) {
  const bits = iso ? iso.standardFrame(bytes) : [];
  if (!iso) {
    const flat = new Float32Array(BIT * 3).fill(dir > 0 ? 1 : 0);
    return { bits, length: BIT * 3, signal: flat, soft: flat, lastGap: 0 };
  }
  if (dir > 0) {
    const { pauses, length } = iso.millerPauses(bits);
    const signal = air ? air.fieldAtTag(length, pauses, iso.PAUSE)
      : Float32Array.from({ length }, (_, n) => (pauses.some(p => n >= p && n < p + iso.PAUSE) ? 0 : 1));
    return { bits, length, signal, soft: demodulate(signal, 1), lastGap: pauses[pauses.length - 1] };
  }
  // The switch itself flickers with the 847.5 kHz subcarrier (two samples closed, two open),
  // far too fast to see even slowed down, so this keeps where it is switching at all.
  const raw = iso.manchesterSwitch(bits), on = new Float32Array(raw.length);
  for (let n = 0; n < raw.length; n += SUB) {
    let closed = 0;
    for (let k = 0; k < SUB; k++) closed |= raw[n + k];
    on.fill(closed, n, n + SUB);
  }
  return { bits, length: raw.length, signal: on, soft: demodulate(on, 0), raw };
}
const say = (dir, words, bytes) => ({ dir, words, bytes, ...onTheAir(bytes, dir) });
export const TALK = {
  ask: say(1, 'Who are you?', [iso?.SEL1 ?? 0x93, iso?.NVB_ALL ?? 0x20]),
  answer: say(-1, 'ID ' + CARD_ID, [...ID, check]),
};
// The card answers the standard's wait after the reader's last gap (in samples: about 86 µs).
const DELAY = iso ? iso.answerDelay(TALK.ask.bits[TALK.ask.bits.length - 1]) : 300;
// As shown: seconds from the question's start to the answer's, on the same clock.
export const ANSWER_AFTER = (TALK.ask.lastGap + DELAY) / BIT * BIT_SECONDS;
// When each message happens in a real tap (ms), counted from the reader's question at 1 ms.
const ms = samples => samples / RATE * 1000;
export const TALK_MS = {
  ask: [1, 1 + ms(TALK.ask.length)],
  answer: [1 + ms(TALK.ask.lastGap + DELAY), 1 + ms(TALK.ask.lastGap + DELAY + TALK.answer.length)],
};

// A message `seconds` after its sender started it, as shown. `n`: how far into its frame it
// is (samples). `amp`: the reader's field as the card's demodulator sees it (a soft dip in
// each of the question's gaps); `load`: the card's switch as the reader sees it (a soft
// swell in each burst); `exact`: the signal itself, without the smoothing. `decoded`: how
// many bits the receiving chip has read (each at the end of its bit time); `beat`: a soft
// pulse each time it has read a whole byte. `done` once the frame is over, `landed` rising
// to 1 just after. `realMs`: how far into the frame, in real time; `frameMs`: the whole frame.
export function message(name, seconds) {
  const talk = TALK[name], { length, signal, soft, dir } = talk;
  const n = seconds / BIT_SECONDS * BIT;
  const i = Math.floor(n), idle = dir > 0 ? 1 : 0;
  const at = values => (n < 0 || n >= length - 1 ? idle : values[i] + (values[i + 1] - values[i]) * (n - i));
  const now = at(soft);
  const bitsIn = n / BIT - 1;   // bit k sits in the frame's bit time k + 1 (the first is the start of frame)
  // A byte is nine bits with its check bit: how many are read, and how long (in bits) since the last.
  const bytesRead = Math.floor(bitsIn / 9), since = bitsIn - 9 * bytesRead;
  const beat = bytesRead >= 1 && bytesRead <= talk.bytes.length && n < length + 4 * BIT
    ? smoother(0, .6, since) * Math.exp(-since * .45) : 0;
  return {
    ...talk, name, n, bit: BIT, started: n >= 0,
    amp: dir > 0 ? now : 1, load: dir > 0 ? 0 : now, exact: at(signal),
    decoded: clamp(Math.floor(bitsIn), 0, talk.bits.length), beat,
    done: n >= length, landed: smoother(length, length + 3 * BIT, n),
    realMs: ms(clamp(n, 0, length)), frameMs: ms(length),
  };
}

// While a message is on the air: the card's chip works on the question once it has it, for
// the standard's wait; the answer goes down only while the card sends it; the reader's
// light reads while it comes in, and its chip works on it after.
export function talkLevels(levels, said) {
  const out = { ...levels };
  if (said.dir < 0) out.reply = said.started ? levels.reply * (1 - said.landed) : 0;
  if (!said.started) {
    if (said.dir < 0) out.blink = 1;
    return out;
  }
  if (said.dir > 0) out.blink = Math.max(levels.blink, said.landed);
  else {
    out.read = clamp(said.n / said.length) * .9 * (1 - said.landed * .4);
    out.thinking = said.landed * .8;
  }
  return out;
}

// After the drop: the tap, one step at a time. `ms` is when it happens in a real tap
// (round numbers, except the conversation's, which come from the frames above; the whole
// exchange takes about 5 ms). `shot` names the camera. A step with `talk` is part of the
// conversation: the lights go down, the field and the flow of power show. In the `ask`
// step the visitor plays the reader: nothing is sent until they press Ask.
export const REAL_MS = 5;
// `detail` is the line of small print under the sentence (`askingDetail` once the question
// is on its way).
export const STEPS = [
  // How the card gets its power, one new thing per step, the rest dimmed. `labels` names
  // the parts shown on screen (main.js); `hold` is how long the step stays on screen when
  // the close-up plays by itself (seconds).
  { text: 'Electricity runs round the reader’s coil.', detail: 'The reader is plugged in.',
    ms: [0, .05], shot: 'coils', labels: ['readerCoil'], hold: 4.5,
    levels: { card: .45, emit: 1 } },
  { text: 'That makes a magnetic field.', detail: 'It reaches up to the card.',
    ms: [.05, .1], shot: 'coils', labels: ['field'], hold: 5,
    levels: { card: .7, emit: .5, field: 1 } },
  { text: 'The field makes electricity in the card’s coil.', detail: 'Nothing touches. The field does it.',
    ms: [.1, .3], shot: 'coils', labels: ['cardCoil'], hold: 5,
    levels: { emit: .3, field: .26, receive: 1 } },
  { text: 'That electricity powers the chip.', detail: 'No battery. The reader is the battery.',
    ms: [.3, 1], shot: 'chip', labels: ['chip'], hold: 5,
    levels: { reader: .3, emit: .1, field: .1, receive: .4, power: 1, blink: .4, charge: 1 } },
  // `asking`: what the readout says once the question is on its way; `waiting`: while the
  // card's chip works out its answer, before the answer goes out.
  { text: 'Your turn. Ask the card who it is.', detail: 'The field stays on. It powers the card.',
    asking: 'The reader asks: who are you?', askingDetail: 'It flicks its field off and on.',
    ms: TALK_MS.ask, shot: 'coils', talk: 'ask', hold: 2.6,
    levels: { emit: .7, field: 1, receive: .45, power: .6, charge: 1 } },
  { text: 'The card answers with its ID.', detail: 'Its coil changes the field. The reader feels it.',
    waiting: 'The chip works out its answer.', waitingDetail: 'In life this takes 86 millionths of a second.',
    ms: TALK_MS.answer, shot: 'coils', talk: 'answer', hold: 1.6,
    levels: { emit: .35, field: .22, receive: .3, power: .5, reply: 1, charge: 1 } },
  { text: 'The reader checks the ID.', detail: 'The check byte must match the four ID bytes.',
    ms: [TALK_MS.answer[1], 5], shot: 'read', hold: 4,
    levels: { card: DIM, shell: .1, emit: .15, read: 1, thinking: 1, charge: 1, dark: 0 } },
  { text: 'Verified. Card detected.', detail: 'The whole tap took about 5 milliseconds.',
    ms: [5, 5], shot: 'done', hold: 3.5,
    levels: { gap: .0016, xray: 0, shell: 1, check: 1, charge: 1, dark: 0 } },
  { text: '', ms: [5, 5], shot: 'rest', explain: true,
    levels: { gap: .0016, xray: 0, shell: 1, check: 1, page: 1, panel: 0, explain: 1, charge: 1, dark: 0 } },
].map(step => ({ ...step, levels: { ...IDLE, dock: 1, gap: TALK_GAP, page: DIM, panel: 1, xray: 1, shell: .14, dark: 1, ...step.levels } }));
// Every drop starts at step 1. The drag shows how distance changes the power; the steps
// are the tap itself, slowed down, so they always begin with the reader's signal.
export const LAST = STEPS.length - 1;
export const ASK = STEPS.findIndex(step => step.talk === 'ask');

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
// the stage; the readout runs along the bottom, in the middle, so the parts sit above it),
// the viewing angle, and the lens: `fov` is its field of view in degrees, 0 for none (flat,
// like a plan drawing). Between shots the lens widens as the camera moves in, so the
// framing holds while the depth opens up (a dolly zoom).
export const SHOTS = {
  // One view for the whole of the power and the conversation, so nothing jumps: from the
  // front and a little above, the reader's coil at the bottom, the card's coil above it,
  // and the gap between them, where the field crosses. The chip's step moves in on the
  // chip, a little more from above, while the reader fades back. `phone` is the framing on a narrow screen.
  coils: { zoom: 2.05, focus: 'gap', at: [.5, .42], tilt: 1.2, spin: .12, yaw: 0, fov: 30, phone: { at: [.5, .44], zoom: 1.7 } },
  chip: { zoom: 3.6, focus: 'chip', at: [.42, .42], tilt: .95, spin: .12, yaw: 0, fov: 30, phone: { at: [.32, .42], zoom: 2.6 } },
  read: { zoom: 2.2, focus: 'readerChip', at: [.5, .4], tilt: .92, spin: -.75, yaw: .02, fov: 16 },
  done: { zoom: 2.1, focus: 'top', at: [.5, .42], tilt: .96, spin: -.92, yaw: .03, fov: 0 },
};

// A camera: { zoom, focus: [x, y, z], at: [x, y], tilt, spin, yaw, fov }. `rest` is where
// the reader's centre sits on the stage at rest, as shares of its width and height.
export function view(name, gap, rest, compact) {
  const shot = SHOTS[name];
  if (!shot) return { zoom: 1, focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST, fov: 0 };
  const at = compact ? shot.phone?.at ?? [.5, shot.at[1] - .03] : shot.at;
  const zoom = compact ? shot.phone?.zoom ?? (shot.zoom > 1 ? shot.zoom * .82 : shot.zoom) : shot.zoom;
  return { zoom, focus: FOCUS[shot.focus](gap), at, tilt: shot.tilt, spin: shot.spin, yaw: shot.yaw, fov: shot.fov };
}

// While the card is dragged, the camera pushes in on the reader as the card comes near,
// keeping the reader where it stands, so the place to drop it never moves.
export function approachView(cm, rest, compact) {
  return { zoom: 1 + (compact ? .18 : .28) * smoother(9, 1, cm), focus: FOCUS.reader(), at: [rest.x, rest.y], ...REST, fov: 0 };
}
