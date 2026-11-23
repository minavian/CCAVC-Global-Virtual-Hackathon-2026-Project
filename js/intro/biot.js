// Magnetic field lines of the reader's coil, from the Biot–Savart law, for the path the
// conversation's river takes between the coils (river.js). Plain numbers, no three.js, so
// Node can check it. Metres, in the reader's frame (its centre at the origin, top up).
//
// The two coils are joined by the field they share: the reader's field passes up through
// the card's coil, which is how the card is powered and how it hears the reader. Each line
// here is one real field line of the reader's coil that loops round both coils' wires: up
// from beside the reader's coil, out round the card's edge, and down into the card's coil.
import { COIL_Z, COIL_HALF, COIL_RADIUS, squarePoint } from './reader-size.js';

const SOFT = .0005 ** 2;   // a wire's thickness, so the sum stays finite on it
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// A wire, cut into short straight pieces for the Biot–Savart sum: each piece's middle and
// its length as a vector, six numbers a piece.
function wire(loops) {
  const out = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      out.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
  }
  return new Float64Array(out);
}

// The reader's coil: five turns wound as a rounded square (reader-model.js winds the same
// turns as one spiral; as five closed turns the field is the same to within a line's width).
export const READER_WIRE = wire(Array.from({ length: 5 }, (_, k) => {
  const s = (k + .5) / 5;
  return Array.from({ length: 72 }, (_, i) => [...squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, i / 72), COIL_Z]);
}));

// The Biot–Savart law: each piece of wire adds dl × r / |r|³ to the field at a point. The
// constant and the current only scale the field, and a field line follows its direction,
// so they are left out. `out` gets the field and the distance to the nearest piece of wire.
export function fieldAt(pieces, x, y, z, out = new Float64Array(4)) {
  let bx = 0, by = 0, bz = 0, near = Infinity;
  for (let i = 0; i < pieces.length; i += 6) {
    const rx = x - pieces[i], ry = y - pieces[i + 1], rz = z - pieces[i + 2];
    const r2 = rx * rx + ry * ry + rz * rz;
    if (r2 < near) near = r2;
    const k = 1 / ((r2 + SOFT) * Math.sqrt(r2 + SOFT));
    const dx = pieces[i + 3], dy = pieces[i + 4], dz = pieces[i + 5];
    bx += (dy * rz - dz * ry) * k;
    by += (dz * rx - dx * rz) * k;
    bz += (dx * ry - dy * rx) * k;
  }
  out[0] = bx; out[1] = by; out[2] = bz; out[3] = Math.sqrt(near);
  return out;
}

// One field line through `seed`: small steps along the field's direction (Runge–Kutta,
// fourth order), shorter near the wire where the line bends hardest, until it comes back
// round to where it started, leaves a 25 cm box, or `stop(point)` says so. `sign` -1 walks
// it the other way. Returns its points.
export function traceLine(pieces, seed, sign = 1, stop = () => false) {
  const f = new Float64Array(4), k = [0, 1, 2, 3].map(() => new Float64Array(3));
  const along = (x, y, z, out) => {
    fieldAt(pieces, x, y, z, f);
    const m = (Math.hypot(f[0], f[1], f[2]) || 1) * sign;
    out[0] = f[0] / m; out[1] = f[1] / m; out[2] = f[2] / m;
  };
  const points = [seed.slice()];
  let [x, y, z] = seed;
  for (let n = 0; n < 5000; n++) {
    along(x, y, z, k[0]);
    const h = clamp(f[3] * .14, .0002, .002);   // f[3]: how near the wire this point is
    along(x + k[0][0] * h / 2, y + k[0][1] * h / 2, z + k[0][2] * h / 2, k[1]);
    along(x + k[1][0] * h / 2, y + k[1][1] * h / 2, z + k[1][2] * h / 2, k[2]);
    along(x + k[2][0] * h, y + k[2][1] * h, z + k[2][2] * h, k[3]);
    x += h / 6 * (k[0][0] + 2 * k[1][0] + 2 * k[2][0] + k[3][0]);
    y += h / 6 * (k[0][1] + 2 * k[1][1] + 2 * k[2][1] + k[3][1]);
    z += h / 6 * (k[0][2] + 2 * k[1][2] + 2 * k[2][2] + k[3][2]);
    points.push([x, y, z]);
    if (stop(points[points.length - 1])) break;
    if (n > 30 && Math.hypot(x - seed[0], y - seed[1], z - seed[2]) < h * 1.5) break;
    if (Math.abs(x) > .25 || Math.abs(y) > .25 || Math.abs(z - COIL_Z) > .25) break;
  }
  return points;
}

// The stretch of a field line that joins the coils, for the river. It starts at `seed`, in
// the reader's coil just inside its copper, rises through the card's coil (this is the field
// the two coils share: the flux through both, which is how they talk) and curls out over
// the card's copper. It ends where it passes nearest that copper (`cardWire(x, y, z)`: how
// far a point is from it). Returns null for a line that never rises through the card.
export function linkingStretch(pieces, seed, cardZ, cardWire) {
  let rose = false;
  const stop = p => { if (p[2] > cardZ + .002) rose = true; return rose && p[2] < cardZ - .004; };
  let line = traceLine(pieces, seed, 1, stop);
  if (line[4][2] < seed[2]) { rose = false; line = traceLine(pieces, seed, -1, stop); }   // the way that rises
  let through = -1;
  for (let i = 1; i < line.length; i++) if (line[i - 1][2] < cardZ && line[i][2] >= cardZ) { through = i; break; }
  if (through < 0) return null;
  let last = through, best = Infinity;
  for (let i = through; i < line.length; i++) {
    const d = cardWire(...line[i]);
    if (d < best) { best = d; last = i; }
  }
  return { points: line.slice(0, last + 1), miss: best };
}
