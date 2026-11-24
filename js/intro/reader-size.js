// The reader's sizes (metres; its centre at the origin, its top facing +z). Kept apart from
// reader-model.js, which needs three.js, so the close-up's plan (cinema.js) and the drag
// still work if the 3D never loads.
export const SIZE = .092;          // 92 mm square
export const HEIGHT = .015;        // 15 mm thin
export const TOP = HEIGHT / 2;     // the top surface, measured from the centre
export const COIL_Z = TOP - .0024; // the coil sits just under the glass
export const COIL_HALF = .036;     // the coil's outer turn, half its width
export const COIL_RADIUS = .016;   // the outer turn's corner radius
export const CHIP = Object.freeze({ x: .016, y: -.018, z: -TOP + .0049 }); // the reader's chip

// A point `f` of the way round a rounded square (half-width `half`, corner radius `r`),
// counter-clockwise from the middle of the right edge.
export function squarePoint(half, r, f) {
  const s = 2 * (half - r), a = Math.PI * r / 2, c = half - r;
  let d = (((f % 1) + 1) % 1) * 4 * (s + a);
  if (d < s / 2) return [half, d];
  d -= s / 2;
  const parts = [
    [c, c, 0], [c, half, -1, 0, s], [-c, c, Math.PI / 2], [-half, c, 0, -1, s],
    [-c, -c, Math.PI], [-c, -half, 1, 0, s], [c, -c, 1.5 * Math.PI], [half, -c, 0, 1, s / 2],
  ];
  for (const p of parts) {
    if (p.length === 3) {
      if (d < a) { const t = p[2] + d / r; return [p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)]; }
      d -= a;
    } else {
      if (d < p[4]) return [p[0] + p[2] * d, p[1] + p[3] * d];
      d -= p[4];
    }
  }
  return [half, 0];
}
