const TAU = 2 * Math.PI;
export const clamp = value => Math.max(0, Math.min(1, value));
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
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
    const bend = Math.sin(TAU * t) * h * (compact ? .095 : .13);
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

export function sizeCanvas(canvas, w, h) {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

// The pale loops show the source of power. The copper strands open into
// separate lanes as the scroll moves the camera into the reply.
export function drawField(ctx, geometry, zoom, inside) {
  const { w, h, reader, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = .8;
  for (let i = 1; i <= 5; i++) {
    const radius = Math.min(w * .25, h * .54) * (.38 + i * .19);
    ctx.strokeStyle = `rgba(118,101,80,${(.19 - i * .019) * (1 - zoom * .75)})`;
    ctx.beginPath();
    ctx.ellipse(reader.x, reader.y + h * .035, radius, radius * .32, -.18, 0, TAU);
    ctx.stroke();
  }
  const lanes = compact ? 24 : 38;
  for (let i = 0; i < lanes; i++) {
    const lane = i / (lanes - 1) * 2 - 1;
    const copper = i % 6 < 3;
    if (inside) ctx.strokeStyle = copper ? 'rgba(238,141,81,.58)' : 'rgba(236,197,144,.34)';
    else ctx.strokeStyle = copper ? `rgba(186,77,27,${.33 + zoom * .16})` : 'rgba(140,116,78,.28)';
    ctx.lineWidth = i % 7 === 0 ? 1.4 : .75;
    ctx.beginPath();
    for (let j = 0; j <= 88; j++) {
      const { x, y } = point(j / 88, lane);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function drawTraffic(ctx, geometry, progress, clock) {
  const { w, h, point, compact } = geometry;
  ctx.clearRect(0, 0, w, h);
  const front = ease(.32, .59, progress);
  if (!front) return;
  const lanes = compact ? 4 : 6, count = compact ? 10 : 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lanes; i++) {
    const lane = i / (lanes - 1) * 1.66 - .83;
    ctx.font = `${compact ? 9 : 11 + (i % 2)}px ui-monospace, monospace`;
    for (let j = 0; j < count; j++) {
      const t = (j / count + i * .073 + clock * .037) % 1;
      if (t > front) continue;
      const { x, y } = point(t, lane);
      if (progress >= .55) ctx.fillStyle = i % 2 === 0 ? '#ffd4a1' : '#ffe8cd';
      else ctx.fillStyle = i % 2 === 0 ? '#a04522' : '#5a574a';
      ctx.globalAlpha = ease(0, .08, t) * ease(0, .08, 1 - t) * ease(0, .06, front - t);
      ctx.fillText((i * 7 + j * 3 + (j >> 1)) % 2 ? '1' : '0', x, y);
    }
  }
  ctx.globalAlpha = 1;
}
