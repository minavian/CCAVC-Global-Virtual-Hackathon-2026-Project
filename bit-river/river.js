const TAU = 2 * Math.PI;
export const clamp = value => Math.max(0, Math.min(1, value));
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export const CARD_VIEW_WIDTH = .1;
export const CARD_MODEL_WIDTH = .0856;
export function cardPose(zoom) {
  return { pitch: -.82 + zoom * .16, yaw: -.20 + zoom * .09, roll: .21 - zoom * .08, order: 'ZXY' };
}

// Both the copper strands and the bits advance from the tag to the reader.
export const replyFront = progress => ease(.26, .72, progress);

function spreadAt(front, t) {
  const width = .18 + .82 * ease(.035, .78, front);
  const tip = Math.max(ease(0, .18, front - t), ease(.87, 1, front));
  return width * (.12 + .88 * tip);
}

// One byte from the simulated ID. Type A replies enable four subcarrier
// cycles in the first half of a one or the second half of a zero.
const replyBit = cell => (0x7b >> Math.floor(cell)) & 1;
export function replySample(cell) {
  const phase = cell % 1;
  const active = replyBit(cell) ? phase < .5 : phase >= .5;
  return active ? Math.sin(phase * TAU * 8) : 0;
}

// t = 0 is the card, t = 1 is the reader. Ink, digits, hit testing and packets
// share these coordinates so touch targets always travel with their artwork.
export function riverGeometry(w, h, zoom, compact) {
  const tag = { x: w * (compact ? .70 + .08 * zoom : .73 + .07 * zoom),
    y: h * (compact ? .25 - .03 * zoom : .30 - .04 * zoom) };
  const reader = { x: w * (compact ? .25 - .04 * zoom : .24 - .06 * zoom),
    y: h * (compact ? .77 + .01 * zoom : .76 + .005 * zoom) };
  const breadth = Math.min(h * .13, w * .09) * (.75 + zoom * .7);
  const sway = Math.min(h * .015, 9);
  function point(t, lane = 0, clock = 0) {
    const swell = Math.sin(Math.PI * t);
    const bend = Math.sin(TAU * t) * h * (compact ? .055 : .13);
    const current = TAU * (t * 1.28 - clock * .16);
    const drift = swell * sway * (Math.sin(current) + .34 * Math.sin(current * .53 + 1.7));
    const twist = .78 + .40 * Math.sin(1.25 + TAU * t) + .07 * Math.sin(current);
    const offset = breadth * swell * (lane * twist + .19 * Math.sin(lane * 3 + t * TAU));
    return { x: tag.x + (reader.x - tag.x) * t,
      y: tag.y + (reader.y - tag.y) * t + bend + offset + drift };
  }
  function contains(x, y, clock = 0) {
    const t = (x - tag.x) / (reader.x - tag.x);
    if (t < 0 || t > 1) return false;
    return y >= point(t, -1, clock).y - 20 && y <= point(t, 1, clock).y + 20;
  }
  return { w, h, tag, reader, point, contains, compact };
}

export function sizeCanvas(canvas, w, h, compact) {
  const ratio = Math.min(devicePixelRatio || 1, compact ? 1.5 : 2);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

// The pale loops show the source of power. The copper strands open into
// separate lanes as the scroll moves the camera into the reply.
export function drawField(ctx, geometry, zoom, progress, clock) {
  const { w, h, tag, reader, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = .8;
  for (let i = 1; i <= 5; i++) {
    const radius = Math.min(w * .25, h * .54) * (.38 + i * .19);
    ctx.strokeStyle = `rgba(118,101,80,${(.19 - i * .019) * (1 - zoom * .75)})`;
    ctx.beginPath();
    ctx.ellipse(reader.x, reader.y + h * .035, radius, radius * .32, -.18, 0, TAU);
    ctx.stroke();
  }
  const front = replyFront(progress);
  if (front < 1) {
    ctx.strokeStyle = `rgba(150,120,89,${.22 * (1 - front)})`;
    ctx.setLineDash([3, 6]);
    strand(0, 1);
    ctx.setLineDash([]);
  }
  if (!front) return;
  const lanes = compact ? 18 : 36;
  const copper = ctx.createLinearGradient(tag.x, 0, reader.x, 0);
  copper.addColorStop(0, '#a04c2a');
  copper.addColorStop(.48, '#ae6b42');
  copper.addColorStop(1, '#9d4b32');
  ctx.strokeStyle = copper;
  for (let i = 0; i < lanes; i++) {
    // Open from the center first. Neighboring strands catch up as the front advances.
    const offset = i ? Math.ceil(i / 2) / (lanes / 2) : 0;
    const lane = offset * (i % 2 ? -1 : 1);
    const revealed = ease(offset * .33, offset * .33 + .23, front);
    if (!revealed) continue;
    const end = front * (1 - offset * .18 * (1 - ease(.56, 1, front)));
    ctx.globalAlpha = revealed * (i % 6 === 0 ? .63 : .31);
    ctx.lineWidth = i % 6 === 0 ? 1.1 : .7;
    strand(lane, end);
  }
  ctx.globalAlpha = 1;

  function strand(lane, end) {
    const segments = Math.max(2, Math.ceil((compact ? 42 : 76) * end));
    ctx.beginPath();
    ctx.moveTo(tag.x, tag.y);
    for (let j = 1; j <= segments; j++) {
      const t = end * j / segments;
      const { x, y } = point(t, lane * spreadAt(front, t), clock);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function drawTraffic(ctx, geometry, progress, clock) {
  const { w, h, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
  const front = replyFront(progress);
  ctx.lineCap = ctx.lineJoin = 'round';
  const charging = ease(.035, .15, progress) * (1 - ease(.29, .46, progress));
  if (charging) {
    const head = 1 - ease(.055, .34, progress);
    const tail = Math.min(1, head + .24);
    const pulse = ctx.createLinearGradient(point(head).x, 0, point(tail).x + .01, 0);
    pulse.addColorStop(0, 'rgba(191,108,63,0)');
    pulse.addColorStop(.22, '#9f6344');
    pulse.addColorStop(1, 'rgba(191,108,63,0)');
    ctx.globalAlpha = charging * (.64 + .15 * Math.cos(clock * 4));
    ctx.strokeStyle = pulse;
    ctx.lineWidth = 1.5;
    trace(head, tail, 0, 26);
  }

  if (!front) { ctx.globalAlpha = 1; return; }

  const cellAt = t => ((t - clock * .064) % 1 + 1) % 1 * 8;
  const amplitude = (compact ? 3.5 : 5.5) * ease(.07, .40, front);
  ctx.strokeStyle = '#a65030';
  ctx.globalAlpha = .23 + ease(.05, .48, front) * .48;
  ctx.lineWidth = compact ? 1 : 1.25;
  trace(0, front, 0, Math.max(2, Math.ceil(288 * front)), t =>
    Math.sin(Math.PI * t) * amplitude * replySample(cellAt(t)));

  for (let i = 0; i < (compact ? 2 : 3); i++) {
    const lane = [-.64, .48, -.23][i];
    const head = (i * .36 + clock * .092) % 1;
    const tail = Math.max(0, head - .14);
    if (head > front || head === tail) continue;
    const light = ctx.createLinearGradient(point(tail).x, 0, point(head).x, 0);
    light.addColorStop(0, 'transparent');
    light.addColorStop(.78, '#bb6944');
    light.addColorStop(1, 'transparent');
    ctx.strokeStyle = light;
    ctx.lineWidth = compact ? 1.35 : 1.75;
    ctx.globalAlpha = .67 * ease(0, .12, head) * ease(0, .11, front - head);
    trace(tail, head, lane, 15);
  }

  // A few moving glints leave enough open space to distinguish the modulation.
  const lanes = compact ? 2 : 4, count = compact ? 8 : 12;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lanes; i++) {
    const lane = i / (lanes - 1) * 1.42 - .71;
    ctx.font = `${compact ? 9 : 11}px ui-monospace, monospace`;
    ctx.fillStyle = '#8e492e';
    ctx.strokeStyle = '#a6542f';
    ctx.lineWidth = 1.3;
    for (let j = 0; j < count; j++) {
      const t = (j / count + i * .057 + clock * .064) % 1;
      if (t > front) continue;
      const { x, y } = point(t, lane * spreadAt(front, t), clock);
      ctx.globalAlpha = ease(0, .08, t) * ease(0, .08, 1 - t) * ease(0, .06, front - t);
      if ((i + j) % 3 === 0) ctx.fillText(replyBit(cellAt(t)), x, y);
      else {
        ctx.globalAlpha *= .48;
        trace(Math.max(0, t - .023), t, lane, 4);
      }
    }
  }
  ctx.globalAlpha = 1;

  function trace(start, end, lane, steps, wave) {
    ctx.beginPath();
    for (let j = 0; j <= steps; j++) {
      const t = start + (end - start) * j / steps;
      const { x, y } = point(t, lane ? lane * spreadAt(front, t) : 0, clock);
      const height = y + (wave ? wave(t) : 0);
      if (j) ctx.lineTo(x, height);
      else ctx.moveTo(x, height);
    }
    ctx.stroke();
  }
}
