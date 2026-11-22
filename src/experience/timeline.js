import { ease } from '../reusable/animations/river.mjs';

export const HERO = .94;
export const MOUTH_CLOSED = 1.23;
export const END = 5.94;
export const DROP_READY = 5.66;
export const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const mix = (a, b, t) => a + (b - a) * t;
export { ease };

// Positions on the scroll timeline. Each row poses the same card.
// time, wide x/y, compact x/y, size, pitch, yaw, roll, mouth
const cardFrames = [
  [0,   .500, .501, .500, .485, .88,  .19, -.19, -.10, 0],
  [.13, .501, .498, .500, .484, .94,  .21, -.13, -.12, 0],
  [.41, .757, .542, .614, .601, .99,  .28,  .60, -.22, 0],
  [.55, .739, .549, .592, .609, .95,  .33,  .63, -.26, .35],
  [.65, .778, .503, .630, .576, 1.02, .19,  .75, -.33, 1],
  [.77, .755, .516, .608, .591, .98,  .26,  .68, -.28, .72],
  [HERO,.749, .517, .593, .596, 1,    .25,  .64, -.26, .87],
  [MOUTH_CLOSED, .754, .531, .60, .621, .95, .24, .46, -.18, 0],
  [1.86,.745, .601, .591, .721, .85,  .29,  .30, -.16, 0],
  [2.80,.806, .688, .664, .715, .70,  .32, -.27, -.18, 0],
  [3.40,.503, .573, .501, .517, 1.07, .32, -.28, -.27, 0],
  [3.87,.493, .549, .501, .509, 1.12, .24, -.14, -.16, 0],
  [4.48,.382, .450, .50,  .414, 1.29, .05,  .05, -.096,0],
  [5.03,.387, .454, .50,  .414, 1.28, .06,  .035,-.083,0],
  [5.75,.690, .614, .621, .49,  .64,  .27,  .21, -.14, 0],
];

// Matching playhead values hold the reading composition over a stretch of scroll.
const scrollFrames = [
  [0, 0], [.57, .41], [.71, .41], [.98, .59], [1.29, .76], [1.60, HERO],
  [1.76, HERO], [2.12, MOUTH_CLOSED], [2.34, MOUTH_CLOSED],
  [3.01, 1.87], [3.85, 1.87],
  [4.56, 2.82], [5.66, 2.82],
  [6.34, 3.60], [7.01, 3.60],
  [7.72, 4.77], [8.88, 4.77],
  [9.58, END], [9.94, END],
];
export const SCROLL_SCREENS = scrollFrames.at(-1)[0];

export function scrollTime(fraction) {
  const distance = clamp(fraction) * SCROLL_SCREENS;
  const index = scrollFrames.findIndex(([position]) => position > distance);
  if (index < 0) return END;
  const [start, from] = scrollFrames[index - 1], [end, to] = scrollFrames[index];
  return mix(from, to, ease(start, end, distance));
}

const holdFrames = [0, HERO, MOUTH_CLOSED, 1.86, 2.81, 3.59, 4.77, END];
const cuts = [.61, 1.15, 1.47, 2.43, 3.28, 4.33, 5.53];

export function restingFrame(progress) {
  return holdFrames[cuts.filter(cut => progress >= cut).length];
}

export function measureStage(width, height, glyphWidths) {
  const compact = width <= 700 || width / height <= .85;
  const gutter = clamp(width * .067, 23, 112);
  const rowSize = compact
    ? Math.min(width * .177, height * .126, 95)
    : Math.min(width * .094, height * .163, 139);
  const stackY = height * (compact ? .128 : .127);
  const tagSize = rowSize * .68;
  const lineGap = rowSize * .95;
  const heroY = height * (compact ? .183 : .37);
  const definitionY = stackY + tagSize + clamp(height * .027, 10, 24);
  const cardSize = compact ? Math.min(width * .77, height * .66) : Math.min(width * .446, height * .82, 790);
  const reader = {
    x: width * (compact ? .353 : .288),
    y: height * (compact ? .715 : .622),
    width: compact ? Math.min(width * .54, height * .43, 300) : Math.min(width * .31, height * .50, 462),
  };
  reader.height = reader.width * .8;
  const gap = 2;
  const prefix = glyphWidths.map((_, index) => glyphWidths.slice(0, index).reduce((sum, w) => sum + w + gap, 0));
  const wordWidth = prefix[3] + glyphWidths[3];
  const heroSize = Math.min(width * (compact ? .414 : .236), height * (compact ? .25 : .39),
    width * (compact ? .79 : .405) * 100 / wordWidth);
  return {
    width, height, compact, gutter, heroSize, rowSize, tagSize, lineGap, stackY, heroY, definitionY,
    cardSize, reader, prefix, heroWidth: wordWidth * heroSize / 100,
    meaningX: compact ? gutter : width * .571,
    meaningY: compact ? stackY + 3 * lineGap + rowSize * 1.38 : height * .244,
  };
}

export function cardPose(time, layout) {
  let i = cardFrames.findIndex(row => row[0] > time);
  if (i === -1) i = cardFrames.length - 1;
  if (i === 0) i = 1;
  const from = cardFrames[i - 1], to = cardFrames[i];
  const progress = ease(from[0], to[0], time);
  const at = index => mix(from[index], to[index], progress);
  const { width, height, compact, cardSize } = layout;
  return {
    x: at(compact ? 3 : 1) * width,
    y: at(compact ? 4 : 2) * height,
    width: Math.min(at(5) * cardSize, width * (compact ? .90 : .63)),
    pitch: at(6),
    yaw: at(7),
    roll: at(8),
    mouth: at(9),
    xray: ease(3.89, 4.49, time) * (1 - ease(5.02, 5.61, time)),
  };
}

const show = (time, start, ready, leave, end) => ease(start, ready, time) * (1 - ease(leave, end, time));

export function beats(time) {
  return {
    stack: ease(MOUTH_CLOSED, 1.81, time),
    regroup: ease(2.18, 2.79, time),
    letters: 1 - ease(2.96, 3.29, time),
    meaning: show(time, 1.52, 1.82, 2.14, 2.44),
    definition: show(time, 2.44, 2.79, 3.01, 3.32),
    cinema: show(time, 3.10, 3.49, 3.86, 4.24),
    callouts: show(time, 4.25, 4.51, 5.09, 5.37),
    question: show(time, 4.43, 4.76, 5.10, 5.40),
    instruction: ease(5.31, 5.71, time),
    reader: ease(5.17, 5.69, time),
  };
}
