const TAU = 2 * Math.PI;
export const clamp = value => Math.max(0, Math.min(1, value));
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// Both the copper strands and the bits advance from the tag to the reader.
export const replyFront = progress => ease(.28, .66, progress);

function spreadAt(front, t) {
  const taper = 1 - ease(0, .13, front - t);
  return 1 - taper * (1 - ease(.9, 1, front));
}

// t = 0 is the card, t = 1 is the reader. Ink, digits, hit testing and packets
// share these coordinates so touch targets always travel with their artwork.
export function riverGeometry(w, h, zoom, compact) {
  const tag = { x: w * (compact ? .70 + .08 * zoom : .73 + .07 * zoom),
    y: h * (compact ? .25 - .03 * zoom : .30 - .04 * zoom) };
  const reader = { x: w * (compact ? .25 - .04 * zoom : .24 - .06 * zoom),
    y: h * (compact ? .77 + .01 * zoom : .76 + .005 * zoom) };
  const breadth = Math.min(h * .13, w * .09) * (.75 + zoom * .7);
  function point(t, lane = 0) {
    const swell = Math.sin(Math.PI * t);
    const bend = Math.sin(TAU * t) * h * (compact ? .055 : .13);
    const twist = .78 + .40 * Math.sin(1.25 + TAU * t);
    const offset = breadth * swell * (lane * twist + .19 * Math.sin(lane * 3 + t * TAU));
    return { x: tag.x + (reader.x - tag.x) * t,
      y: tag.y + (reader.y - tag.y) * t + bend + offset };
  }
  function contains(x, y) {
    const t = (x - tag.x) / (reader.x - tag.x);
    if (t < 0 || t > 1) return false;
    return y >= point(t, -1).y - 20 && y <= point(t, 1).y + 20;
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
export function drawField(ctx, geometry, zoom, progress) {
  const { w, h, tag, reader, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
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
  const inside = ease(.45, .64, progress);
  const lanes = compact ? 18 : 38;
  const tip = point(front);
  const haloEnd = point(Math.max(0, front - .1));
  const copper = ctx.createLinearGradient(haloEnd.x, 0, tip.x, 0);
  copper.addColorStop(0, `rgba(224,122,63,${.34 + inside * .24})`);
  copper.addColorStop(1, `rgba(255,171,111,${.88 - front * .29})`);
  for (let i = 0; i < lanes; i++) {
    const lane = i / (lanes - 1) * 2 - 1;
    ctx.strokeStyle = i % 6 < 3 ? copper : `rgba(178,139,98,${.27 + inside * .08})`;
    ctx.lineWidth = i % 7 === 0 ? 1.4 : .75;
    strand(lane, front);
  }

  function strand(lane, end) {
    const segments = Math.max(2, Math.ceil((compact ? 42 : 76) * end));
    ctx.beginPath();
    ctx.moveTo(tag.x, tag.y);
    for (let j = 1; j <= segments; j++) {
      const t = end * j / segments;
      const { x, y } = point(t, lane * spreadAt(end, t));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function drawTraffic(ctx, geometry, progress, clock) {
  const { w, h, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
  const front = replyFront(progress);
  if (!front) return;
  const lanes = compact ? 3 : 6, count = compact ? 10 : 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lanes; i++) {
    const lane = i / (lanes - 1) * 1.66 - .83;
    ctx.font = `${compact ? 10 : 11 + (i % 2)}px ui-monospace, monospace`;
    if (progress >= .55) ctx.fillStyle = i % 2 === 0 ? '#ffd4a1' : '#ffe8cd';
    else ctx.fillStyle = i % 2 === 0 ? '#a04522' : '#5a574a';
    for (let j = 0; j < count; j++) {
      const t = (j / count + i * .073 + clock * .037) % 1;
      if (t > front) continue;
      const { x, y } = point(t, lane * spreadAt(front, t));
      ctx.globalAlpha = ease(0, .08, t) * ease(0, .08, 1 - t) * ease(0, .06, front - t);
      ctx.fillText((i * 7 + j * 3 + (j >> 1)) % 2 ? '1' : '0', x, y);
    }
  }
  ctx.globalAlpha = 1;
}
