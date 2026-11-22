// The close-up after the card is dropped on the reader: one slow-motion shot that zooms
// into the reader and the card and shows the whole exchange. Everything here is a pure
// function of the shot's clock `c` (seconds), so the shot can be skipped, replayed or
// paused on any frame. js/intro/main.js runs the clock; card-scene.js draws the 3D;
// effects.js draws the waves, sparks and bits.
import { clamp, monotone, smoother } from './easing.js';
import { TOP, COIL_Z, CHIP as READER_CHIP } from './reader-model.js';

export const LENGTH = 25;      // seconds, from the drop to the explanation
export const SKIP_TO = 22.8;   // Skip jumps here: the camera pulls back and the lights come up
export const REAL_MS = 5;      // what the exchange takes in real life, in milliseconds
const EXCHANGE = [11, 22];     // the part of the shot that shows those 5 ms

// Where the card lies over the reader (metres, in the reader's frame), and how high
// above the reader's top it floats. It hovers high while you meet the two parts, comes
// down for the exchange and settles onto the reader at the end.
export const HOVER = { x: .002, y: -.003, spin: -.1 };
const gapTrack = monotone([[0, .036], [2.4, .03], [6, .028], [11, .021], [13, .013], [22.4, .012], [24.6, .0016]]);

// The step captions during the exchange: [start time, words].
export const STEPS = [
  [11.4, 'The reader’s coil sends out a signal.'],
  [13.0, 'The tag’s coil catches it.'],
  [14.6, 'Electricity sparks across to the chip.'],
  [16.0, 'The chip wakes up and blinks.'],
  [17.4, 'The chip answers through the coil.'],
  [19.2, 'The reader reads and checks it.'],
  [21.0, 'Verified. Card detected.'],
];

const window_ = (c, start, end, rise = .4, fall = .4) => smoother(start, start + rise, c) * (1 - smoother(end - fall, end, c));
// Three soft blinks between `start` and `end`.
const blinks = (c, start, end, count = 3) => {
  if (c <= start || c >= end) return 0;
  const p = (c - start) / (end - start) * count;
  return Math.sin(Math.PI * (p % 1)) ** 2;
};

export function beats(c) {
  const exchange = clamp((c - EXCHANGE[0]) / (EXCHANGE[1] - EXCHANGE[0]));
  const reply = window_(c, 17.4, 19.9, .35, .5);
  const read = window_(c, 19.2, 21.7, .4, .6);
  let step = -1;
  STEPS.forEach(([at], i) => { if (c >= at) step = i; });
  return {
    c,
    dark: window_(c, 0, 24.4, 1.4, 1.6),           // the lights go down, then come back up
    // The card was moving when it was dropped. Time slows: it keeps going, slower and
    // slower, until it floats over the reader.
    dock: c <= 0 ? 0 : (1 - Math.exp(-2.6 * Math.min(c, 3))) / (1 - Math.exp(-7.8)),
    gap: gapTrack(c) + .0006 * Math.sin(c * 1.3) * window_(c, 1, 22.5, 1, 1),
    cardFade: 1 - .93 * window_(c, 2.6, 7.0, .7, .7),   // the card drops away: meet the reader
    xray: window_(c, 6.3, 24.0, .7, 1.0),               // then the card's coil and chip show
    readerShell: 1 - .87 * window_(c, 2.6, 24.0, .8, 1.0),
    // The reader drops away to meet the tag, and dims again while the camera is on the chip.
    readerFade: 1 - Math.max(.9 * window_(c, 6.3, 11.4, .6, .6), .8 * window_(c, 13.3, 17.6, .7, .6)),
    // The reader's field: shown off when you meet the reader, then on for the whole exchange.
    emit: Math.max(window_(c, 3.1, 6.3, .5, .5), window_(c, 11.2, 22.4, .5, .8) * (1 - .62 * smoother(13.4, 14.6, c))),
    rings: Math.max(window_(c, 3.3, 6.2, .5, .5), window_(c, 11.3, 13.9, .4, .8)),
    hint: window_(c, 7.3, 10.9, .6, .6),             // the card's coil glows while it is named
    receive: window_(c, 13.0, 17.6, .8, .6),
    sparks: window_(c, 14.6, 16.4, .25, .4),
    power: window_(c, 15.3, 22.8, .5, .8),
    blink: blinks(c, 16.0, 17.4),
    reply,
    bits: clamp((c - 17.6) / 2.3),
    read,
    thinking: blinks(c, 19.8, 21.2, 4),
    check: smoother(21.0, 21.9, c),
    badge: window_(c, .6, 23.2, .5, .6),
    exchange,
    ms: REAL_MS * exchange,
    noteReader: window_(c, 2.9, 6.3, .5, .5),
    noteTag: window_(c, 7.0, 10.8, .5, .5),
    step,
    stepIn: step < 0 ? 0 : smoother(STEPS[step][0], STEPS[step][0] + .35, c) * (1 - smoother(22.4, 22.9, c)),
    explain: smoother(23.4, 24.4, c),
    // Phases for the pulses of current running along the coils.
    flow: c * .9,
    cardFlow: c < 17.4 ? c * 1.1 : 17.4 * 1.1 - (c - 17.4) * 1.4,
  };
}

// Named points the camera looks at, in the reader's frame (metres).
function card(c) { return TOP + gapTrack(c); }
function chip(c) {
  const [x, y] = [-.0277, .0031], s = Math.sin(HOVER.spin), k = Math.cos(HOVER.spin);
  return [HOVER.x + x * k - y * s, HOVER.y + x * s + y * k, card(c)];
}
const focus = {
  reader: () => [0, 0, 0],
  top: () => [0, 0, TOP],
  gap: c => [0, 0, (TOP + card(c)) / 2],
  card: c => [HOVER.x, HOVER.y, card(c)],
  coil: c => [HOVER.x + .02, HOVER.y - .012, (COIL_Z + card(c)) / 2],
  chip: c => chip(c),
  readerChip: () => [READER_CHIP.x, READER_CHIP.y, READER_CHIP.z],
};

// The reader's resting angle, as in the picture: tipped back to show its top and front.
export const REST = { tilt: .68, spin: -.3, yaw: .2 };

// The camera, shot by shot: [time, zoom, look at, where it sits on screen (x, y as shares
// of the stage), tilt, spin, yaw]. Between shots every number glides on a monotone curve,
// so the camera never stops dead or swings past a mark.
function shots(rest, compact) {
  // On a phone the words sit underneath, so the subject is centred and raised.
  const at = (x, y) => compact ? [.5, y - .1] : [x, y];
  return [
    [0, 1, 'reader', rest.x, rest.y, REST.tilt, REST.spin, REST.yaw],
    [2.4, 1.65, 'gap', ...at(.42, .55), 1.15, -.3, .05],
    [5.9, 1.85, 'top', ...at(.4, .58), 1.06, -.42, .04],
    [7.0, 1.9, 'card', ...at(.58, .53), .64, -.5, 0],
    [10.4, 2.15, 'card', ...at(.6, .53), .56, -.58, -.02],
    [11.6, 2.35, 'gap', ...at(.5, .47), 1.08, -.66, .02],
    [13.2, 3.3, 'coil', ...at(.5, .47), 1.0, -.72, .02],
    [14.8, 7.5, 'chip', ...at(.5, .46), .8, -.78, .03],
    [16.6, 10.5, 'chip', ...at(.5, .46), .7, -.82, .03],
    [17.7, 3.4, 'gap', ...at(.5, .52), 1.02, -.86, .02],
    [19.4, 3.1, 'readerChip', ...at(.5, .5), 1.1, -.9, .02],
    [21.0, 2.4, 'top', ...at(.5, .5), .96, -.92, .03],
    [22.8, 2.2, 'top', ...at(.5, .5), .96, -.92, .03],
    [24.6, 1, 'reader', rest.x, rest.y, REST.tilt, REST.spin, REST.yaw],
  ];
}

// Builds the camera for a stage. `rest` is where the reader's centre sits on the stage
// at rest, as shares of its width and height.
export function camera(rest, compact) {
  const list = shots(rest, compact);
  const curve = index => monotone(list.map(row => [row[0], row[index]]));
  const zoom = monotone(list.map(row => [row[0], Math.log(row[1] * (compact && row[1] > 1 ? .9 : 1))]));
  const x = curve(3), y = curve(4), tilt = curve(5), spin = curve(6), yaw = curve(7);
  // The point looked at also glides from one target to the next.
  const fx = [], fy = [], fz = [];
  for (const row of list) {
    const p = focus[row[2]](row[0]);
    fx.push([row[0], p[0]]); fy.push([row[0], p[1]]); fz.push([row[0], p[2]]);
  }
  const [px, py, pz] = [fx, fy, fz].map(monotone);
  return c => ({
    zoom: Math.exp(zoom(c)), focus: [px(c), py(c), pz(c)], anchor: [x(c), y(c)],
    tilt: tilt(c), spin: spin(c), yaw: yaw(c),
  });
}
