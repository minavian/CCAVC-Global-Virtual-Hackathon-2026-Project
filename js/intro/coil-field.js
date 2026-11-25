// The real magnetic field of a coil, for the close-up's "Real physics" switch (main.js; drawn by
// effects.js). The simple picture sends rings from coil to coil; this works the field out the way
// a physicist would, and traces its field lines:
// - Biot–Savart: each coil is cut into short straight pieces of wire, each piece adds the field of
//   a straight wire carrying the current, and the field at a point is the sum of them all.
// - A field line is followed from a starting point by always stepping along the field (fourth-order
//   Runge–Kutta), until it comes back round to the coil's plane or leaves the picture.
// - The field of a flat coil is the same above and below it, mirrored, so only the half above is
//   traced and the half below is its mirror image: each line is a closed loop through the coil.
// - Lines start where equal shares of the coil's magnetic flux pass, so where the lines crowd
//   together the field is strong, and where they spread out it is weak, as in a textbook.
// No three.js here (plain numbers), so Node can check it against the textbook formulas
// (tests/coil-field.test.mjs). Units are metres; the current is 1 A in each turn, so a field
// comes out in tesla per ampere. Owner: Mina Vian. See EXPLAINED.md.

const K = 1e-7;   // μ0 / 4π, in T·m/A

// A coil as straight pieces of wire, from closed loops of points [x, y, z], one loop per turn.
// `soft` (m) is about the wire bundle's thickness: closer than that, the field stops growing,
// as it does inside a real wire, instead of going to infinity.
export function makeCoil(loops, { soft = .0008 } = {}) {
  const pieces = [];
  for (const loop of loops)
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      pieces.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  return { pieces: Float64Array.from(pieces), soft2: soft * soft, z: loops[0][0][2] };
}

// The field at (x, y, z), into `out` [Bx, By, Bz]. Each piece, from a to b, adds the field of a
// straight wire: with r1 = a − p and r2 = b − p it is
//   K (r1 × r2) (|r1| + |r2|) / (|r1| |r2| (|r1| |r2| + r1 · r2)),
// which along a long wire gives the familiar μ0 I / (2π d).
export function fieldAt(coil, x, y, z, out = [0, 0, 0]) {
  const p = coil.pieces, soft2 = coil.soft2;
  let bx = 0, by = 0, bz = 0;
  for (let i = 0; i < p.length; i += 6) {
    const ax = p[i] - x, ay = p[i + 1] - y, az = p[i + 2] - z;
    const cx = p[i + 3] - x, cy = p[i + 4] - y, cz = p[i + 5] - z;
    const r1 = Math.sqrt(ax * ax + ay * ay + az * az), r2 = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const dot = ax * cx + ay * cy + az * cz, den = r1 * r2 * (r1 * r2 + dot);
    if (den < 1e-30) continue;
    const nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx;
    // How close the point is to this piece's wire (squared): within the wire's thickness the
    // field is scaled down smoothly, as inside a real conductor.
    const lx = cx - ax, ly = cy - ay, lz = cz - az;
    const d2 = (nx * nx + ny * ny + nz * nz) / Math.max(1e-30, lx * lx + ly * ly + lz * lz);
    const k = K * (r1 + r2) / den * d2 / (d2 + soft2);
    bx += nx * k; by += ny * k; bz += nz * k;
  }
  out[0] = bx; out[1] = by; out[2] = bz;
  return out;
}

export const strength = (coil, x, y, z) => Math.hypot(...fieldAt(coil, x, y, z));

// Follows the field line through `seed` (on the coil's plane, inside the coil) up and round. It
// stops back on the coil's plane (`closed`), or where it leaves a box `reach` metres round the coil
// and `reach` metres above it. The step is short near the wire, where the line bends hard, and
// longer far away.
export function trace(coil, seed, { reach = .16, minStep = .0004, maxStep = .004, maxPoints = 1200, centre = [0, 0] } = {}) {
  const z0 = coil.z, points = [seed.slice()];
  const f = [0, 0, 0];
  const dir = (x, y, z) => {
    fieldAt(coil, x, y, z, f);
    const m = Math.hypot(f[0], f[1], f[2]) || 1;
    return [f[0] / m, f[1] / m, f[2] / m, m];
  };
  const b0 = strength(coil, centre[0], centre[1], z0);
  let [x, y, z] = seed, closed = false;
  for (let n = 0; n < maxPoints; n++) {
    // The step: in a strong field the line is near the wire and bends tightly.
    const m = dir(x, y, z)[3];
    const h = Math.min(maxStep, Math.max(minStep, .006 * Math.cbrt(b0 / m) - .002));
    const k1 = dir(x, y, z);
    const k2 = dir(x + k1[0] * h / 2, y + k1[1] * h / 2, z + k1[2] * h / 2);
    const k3 = dir(x + k2[0] * h / 2, y + k2[1] * h / 2, z + k2[2] * h / 2);
    const k4 = dir(x + k3[0] * h, y + k3[1] * h, z + k3[2] * h);
    const nx = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const ny = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const nz = z + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    // Back down to the coil's plane: end exactly on it.
    if (n > 2 && nz <= z0) {
      const t = (z - z0) / Math.max(1e-12, z - nz);
      points.push([x + (nx - x) * t, y + (ny - y) * t, z0]);
      closed = true;
      break;
    }
    x = nx; y = ny; z = nz;
    points.push([x, y, z]);
    if (Math.abs(x - centre[0]) > reach || Math.abs(y - centre[1]) > reach || z - z0 > reach) break;
  }
  return { points, closed };
}

// The whole line from its half above the coil: the half below is the mirror image, run the other
// way, so the field goes round in one direction all along it.
export function wholeLine({ points, closed }, z0) {
  const mirror = points.map(([x, y, z]) => [x, y, 2 * z0 - z]).reverse();
  return closed ? { points: points.concat(mirror.slice(1)), closed } : { points: mirror.concat(points.slice(1)), closed };
}

// Where the lines start on one ray out from the coil's centre (angle `angle`, out to `edge`
// metres): at equal shares of the flux through the coil's plane (the field up through it, added
// up over rings of growing size: ψ(r) = ∫ Bz r dr), so the lines' crowding shows the field's
// strength. Only as far out as the field still points up through the coil.
export function seeds(coil, { angle = 0, edge, count = 6, centre = [0, 0], samples = 240 }) {
  const c = Math.cos(angle), s = Math.sin(angle), z0 = coil.z, f = [0, 0, 0];
  const flux = [0];
  let r = 0, last = 0, end = edge;
  for (let i = 1; i <= samples; i++) {
    r = edge * i / samples;
    const bz = fieldAt(coil, centre[0] + r * c, centre[1] + r * s, z0, f)[2];
    if (bz <= 0) { end = edge * (i - 1) / samples; break; }
    flux.push(flux[flux.length - 1] + (last + bz * r) / 2 * edge / samples);
    last = bz * r;
  }
  const total = flux[flux.length - 1], step = end / (flux.length - 1);
  return Array.from({ length: count }, (_, k) => {
    const want = total * (k + .5) / count;
    let i = flux.findIndex(v => v >= want);
    if (i < 1) i = 1;
    const at = step * (i - 1 + (want - flux[i - 1]) / Math.max(1e-30, flux[i] - flux[i - 1]));
    return [centre[0] + at * c, centre[1] + at * s, z0];
  });
}

// Every line of a coil: `angles` rays out from the centre, `count` lines on each. When the coil
// is symmetric, rays that are copies of each other (`copies`: rotations about the centre, in
// radians, and mirrors) are traced once and copied, which is the same field, worked out once.
export function lines(coil, { rays, count = 6, reach, centre = [0, 0] }) {
  const out = [];
  for (const { angle, edge, copies = [{ turn: 0 }] } of rays) {
    for (const seed of seeds(coil, { angle, edge, count, centre })) {
      const half = trace(coil, seed, { reach, centre });
      for (const { turn = 0, flipX = false, flipY = false } of copies) {
        const c = Math.cos(turn), s = Math.sin(turn);
        const move = ([x, y, z]) => {
          let u = x - centre[0], v = y - centre[1];
          if (flipX) u = -u;
          if (flipY) v = -v;
          return [centre[0] + u * c - v * s, centre[1] + u * s + v * c, z];
        };
        out.push(wholeLine({ points: half.points.map(move), closed: half.closed }, coil.z));
      }
    }
  }
  return out;
}
