export function curve(ctx, points, X, Y, color, width = 2, dash = []) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([a, b], i) => { const x = X(a), y = Y(b); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.restore();
}
