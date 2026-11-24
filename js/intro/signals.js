import { HERO, MOUTH_CLOSED, ease, mix } from './timeline.js?v=2';

const TAU = 2 * Math.PI;
const BRASS = '#80623d';

function stroke(ctx, points) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function dot(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function spit(ctx, time, mouth, layout) {
  const reach = ease(.55, .76, time);
  const opacity = ease(.55, .67, time) * (1 - .64 * ease(.73, HERO, time)) * (1 - ease(.98, MOUTH_CLOSED, time));
  if (opacity <= .001) return;
  const { compact, heroWidth, heroY, gutter, heroSize } = layout;
  const x = compact ? gutter + heroWidth * .81 : gutter + heroWidth + 20;
  const y = heroY + heroSize * (compact ? .99 : .56);
  const dx = x - mouth.x, dy = y - mouth.y;
  const spread = Math.min(32, Math.hypot(dx, dy) * .22);
  ctx.strokeStyle = ctx.fillStyle = BRASS;
  const arc = p => {
    const bend = Math.sin(Math.PI * p);
    return { x: mix(mouth.x, x, p), y: mix(mouth.y, y, p) - bend * 24 };
  };
  for (let i = 0; i < 3; i++) {
    const drift = (i - 1) * spread;
    ctx.lineWidth = i === 1 ? 1.8 : 1;
    ctx.globalAlpha = opacity * (i === 1 ? .84 : .41);
    ctx.beginPath();
    for (let n = 0; n <= 24; n++) {
      const p = reach * n / 24;
      const point = arc(p);
      const offset = drift * p + (i - 1) * 2;
      if (n) ctx.lineTo(point.x, point.y + offset);
      else ctx.moveTo(point.x, point.y + offset);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = opacity;
  for (let i = 0; i < 10; i++) {
    const p = ease(.55 + i * .017, .91 + i * .004, time) * (.96 - i * .077);
    const point = arc(p);
    if (p > .01) dot(ctx, point.x, point.y + Math.sin(p * Math.PI) * ((i % 5 - 2) * 16),
      (i % 3 === 0 ? 3.6 : 1.65) * (1 - p * .39));
  }
}

function radio(ctx, layout, card, opacity, clock) {
  if (opacity <= .001) return;
  const { gutter, height, compact } = layout;
  const x0 = gutter + 8;
  const x1 = Math.max(x0 + 42, card.x - card.width * (compact ? .27 : .31));
  const span = x1 - x0;
  const y = height * (compact ? .674 : .755);
  const amplitude = Math.min(span * .15, height * .079, 64);
  const cycles = compact ? 3.5 : 5.5;
  ctx.strokeStyle = ctx.fillStyle = BRASS;
  ctx.globalAlpha = opacity * .16;
  ctx.lineWidth = 1;
  stroke(ctx, [{x: x0, y}, {x: x1, y}]);
  for (let i = 1; i < 10; i++) {
    const x = mix(x0, x1, i / 10);
    stroke(ctx, [{x, y: y - 5}, {x, y: y + 5}]);
  }
  for (let trace = 2; trace >= 0; trace--) {
    ctx.globalAlpha = opacity * (trace === 0 ? .91 : .24 - trace * .055);
    ctx.lineWidth = trace === 0 ? 2.5 : 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 132; i++) {
      const p = i / 132;
      const envelope = Math.sin(Math.PI * p) ** .65 * (.66 + .34 * Math.cos(TAU * (p - clock * .10)));
      const wave = Math.sin(TAU * (p * cycles - clock * .48 + trace * .10));
      const py = y + wave * envelope * amplitude * (1 + .23 * trace);
      if (i) ctx.lineTo(x0 + span * p, py);
      else ctx.moveTo(x0, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = opacity * .8;
  dot(ctx, x0, y, 3.2);
  dot(ctx, x1, y, 3.2);
}

function internals(ctx, opacity, labels) {
  if (opacity <= .001) return;
  ctx.strokeStyle = ctx.fillStyle = BRASS;
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = opacity * .9;
  for (const { part, tip } of labels) {
    stroke(ctx, [part, tip]);
    dot(ctx, part.x, part.y, 3.1);
  }
}

function readerField(ctx, target, opacity, proximity, clock, confirmed) {
  if (opacity <= .001) return;
  const { x, y, width, height } = target;
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = confirmed ? 1.8 : 1.25;
  const motion = (clock * .43) % 1;
  for (let ring = 0; ring < 3; ring++) {
    const p = (ring / 3 + motion) % 1;
    const size = .85 + .48 * p;
    ctx.globalAlpha = opacity * (1 - p) * (.30 + .24 * proximity + .18 * confirmed);
    ctx.beginPath();
    ctx.ellipse(x + width * .035, y + height * .12, width * size * .56, height * size * .39, -.04, 0, TAU);
    ctx.stroke();
  }
}

export function renderSignals(ctx, { layout, time, clock, mouth, card, visual, labels, proximity, confirmed }) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  spit(ctx, time, mouth, layout);
  radio(ctx, layout, card, visual.definition, clock);
  internals(ctx, visual.callouts, labels);
  readerField(ctx, layout.reader, visual.reader, proximity, clock, confirmed);
  ctx.restore();
}
