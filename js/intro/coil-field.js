// The real magnetic field of a coil, for the close-up's "Real physics" switch (main.js; drawn by
// effects.js). The simple picture sends rings from coil to coil; this works the field out the way
// a physicist would, and traces its field lines:
// - Biot–Savart: each coil is cut into short straight pieces of wire, each piece adds the field of
//   a straight wire carrying the current, and the field at a point is the sum of them all.
// - A field line is followed from a starting point by always stepping along the field (fourth-order
//   Runge–Kutta), until it comes back round to the coil's plane or leaves the picture.
// - The field of a flat coil on its own is the same above and below it, mirrored, so only the half
//   above is traced and the half below is its mirror image: each line is a closed loop through the
//   coil. With a metal plate near, the field is no longer mirrored, so both halves are traced.
// - Lines start where equal shares of the coil's magnetic flux pass, so where the lines crowd
//   together the field is strong, and where they spread out it is weak, as in a textbook.
// - A metal plate (`shield`): at 13.56 MHz the current a changing field drives in metal keeps to a
//   skin about 20 µm deep, far thinner than the plate, so the plate acts as a perfect conductor.
//   Currents swirl in it (eddy currents) exactly so that no field passes through it, and the field
//   lines bend round it. The plate is cut into small squares, each with its own swirl of current,
//   and the swirls are solved for together so the field through the middle of every square is zero.
// No three.js here (plain numbers), so Node can check it against the textbook formulas
// (tests/coil-field.test.mjs), and a background worker can run it (field-worker.js). Units are
// metres; the current is 1 A in each turn, so a field comes out in tesla per ampere.
// Owner: Mina Vian. See EXPLAINED.md.

const K = 1e-7;   // μ0 / 4π, in T·m/A

// Straight pieces of wire, each from a to b ([ax, ay, az, bx, by, bz] in `pieces`) with its own
// current and its own `soft` (m): about the wire's thickness. Closer than that the field stops
// growing, as it does inside a real wire, instead of going to infinity.
function wires(pieces, current, soft, z) {
  const n = pieces.length / 6;
  return {
    pieces: Float64Array.from(pieces),
    current: current ? Float64Array.from(current) : new Float64Array(n).fill(1),
    soft2: new Float64Array(n).fill(soft * soft),
    z,
  };
}

// A coil from closed loops of points [x, y, z], one loop per turn, 1 A round each.
export function makeCoil(loops, { soft = .0008 } = {}) {
  const pieces = [];
  for (const loop of loops)
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      pieces.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  return wires(pieces, null, soft, loops[0][0][2]);
}

// Two sets of wires as one (the coil's plane is the first one's).
export function combine(a, b) {
  const join = (x, y) => { const out = new Float64Array(x.length + y.length); out.set(x); out.set(y, x.length); return out; };
  return { pieces: join(a.pieces, b.pieces), current: join(a.current, b.current), soft2: join(a.soft2, b.soft2), z: a.z };
}

// The field at (x, y, z), into `out` [Bx, By, Bz]. Each piece, from a to b, adds the field of a
// straight wire: with r1 = a − p and r2 = b − p it is
//   K I (r1 × r2) (|r1| + |r2|) / (|r1| |r2| (|r1| |r2| + r1 · r2)),
// which along a long wire gives the familiar μ0 I / (2π d).
export function fieldAt(source, x, y, z, out = [0, 0, 0]) {
  const p = source.pieces, current = source.current, soft2 = source.soft2;
  let bx = 0, by = 0, bz = 0;
  for (let i = 0, w = 0; i < p.length; i += 6, w++) {
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
    const k = K * current[w] * (r1 + r2) / den * d2 / (d2 + soft2[w]);
    bx += nx * k; by += ny * k; bz += nz * k;
  }
  out[0] = bx; out[1] = by; out[2] = bz;
  return out;
}

export const strength = (source, x, y, z) => Math.hypot(...fieldAt(source, x, y, z));

// A metal plate near a coil (`source`), as a perfect conductor: `centre` [x, y, z], turned
// `spin` about z and then `tilt` about its own long side (as the lab lies the card it is behind),
// `half` its half sizes. Returns the coil and the plate's eddy currents as one set of wires.
// How: the plate is cut into squares about `cell` wide, each with an unknown swirl of current
// round its edges. The field each swirl makes through the middle of every square is worked out
// (Biot–Savart again), and the swirls are solved for (Gaussian elimination) so that through every
// middle, theirs cancels the coil's. Where two squares meet, their currents run opposite ways, so
// each edge carries the difference of its two squares' swirls.
export function shield(source, { centre, spin = 0, tilt = 0, half, cell = .0065 }) {
  const cs = Math.cos(spin), ss = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
  const ex = [cs, ss, 0], ey = [-ss * ct, cs * ct, st], n = [ss * st, -cs * st, ct];
  const nx = Math.max(2, Math.round(2 * half[0] / cell)), ny = Math.max(2, Math.round(2 * half[1] / cell));
  const dx = 2 * half[0] / nx, dy = 2 * half[1] / ny, soft = Math.min(dx, dy) / 3;
  const at = (u, v) => [0, 1, 2].map(k => centre[k] + ex[k] * u + ey[k] * v);
  const node = (i, j) => at(-half[0] + i * dx, -half[1] + j * dy);
  const cells = nx * ny, middles = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) middles.push(at(-half[0] + (i + .5) * dx, -half[1] + (j + .5) * dy));
  const along = f => f[0] * n[0] + f[1] * n[1] + f[2] * n[2];

  // A[k][m]: the field through square k's middle from 1 A swirling round square m.
  const A = new Float64Array(cells * cells), rhs = new Float64Array(cells), f = [0, 0, 0];
  for (let j = 0, m = 0; j < ny; j++) for (let i = 0; i < nx; i++, m++) {
    const corners = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
    const loop = wires(corners.flatMap((c, q) => [...c, ...corners[(q + 1) % 4]]), null, soft, source.z);
    for (let k = 0; k < cells; k++) A[k * cells + m] = along(fieldAt(loop, ...middles[k], f));
  }
  for (let k = 0; k < cells; k++) rhs[k] = -along(fieldAt(source, ...middles[k], f));
  const swirl = solve(A, rhs, cells);
  const psi = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : swirl[j * nx + i]);

  // Each edge of the grid, with the difference of the swirls on its two sides.
  const pieces = [], current = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
    const I = psi(i, j) - psi(i, j - 1);
    if (Math.abs(I) > 1e-9) { pieces.push(...node(i, j), ...node(i + 1, j)); current.push(I); }
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) {
    const I = psi(i - 1, j) - psi(i, j);
    if (Math.abs(I) > 1e-9) { pieces.push(...node(i, j), ...node(i, j + 1)); current.push(I); }
  }
  return combine(source, wires(pieces, current, soft, source.z));
}

// Solves A x = b (n unknowns) by Gaussian elimination with partial pivoting.
function solve(A, b, n) {
  const a = Float64Array.from(A), x = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[best * n + c])) best = r;
    if (best !== c) {
      for (let k = 0; k < n; k++) { const t = a[c * n + k]; a[c * n + k] = a[best * n + k]; a[best * n + k] = t; }
      const t = x[c]; x[c] = x[best]; x[best] = t;
    }
    const pivot = a[c * n + c] || 1e-30;
    for (let r = c + 1; r < n; r++) {
      const k = a[r * n + c] / pivot;
      if (!k) continue;
      for (let q = c; q < n; q++) a[r * n + q] -= k * a[c * n + q];
      x[r] -= k * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let q = r + 1; q < n; q++) s -= a[r * n + q] * x[q];
    x[r] = s / (a[r * n + r] || 1e-30);
  }
  return x;
}

// Follows the field line through `seed` (on the coil's plane, inside the coil) up and round, or
// with `back` the other way (down under the coil and round). It stops back on the coil's plane
// (`closed`), or where it leaves a box `reach` metres round the coil and `reach` metres above and
// below it. The step is short near the wire, where the line bends hard, and longer far away.
export function trace(source, seed, { reach = .16, minStep = .0004, maxStep = .004, maxPoints = 1200, centre = [0, 0], back = false } = {}) {
  const z0 = source.z, points = [seed.slice()];
  const f = [0, 0, 0], way = back ? -1 : 1;
  const dir = (x, y, z) => {
    fieldAt(source, x, y, z, f);
    const m = Math.hypot(f[0], f[1], f[2]) || 1e-30;
    return [way * f[0] / m, way * f[1] / m, way * f[2] / m, m];
  };
  const b0 = strength(source, centre[0], centre[1], z0);
  let [x, y, z] = seed, closed = false, side = 0;
  for (let n = 0; n < maxPoints; n++) {
    // The step: in a strong field the line is near the wire and bends tightly.
    const k1 = dir(x, y, z);
    const h = Math.min(maxStep, Math.max(minStep, .006 * Math.cbrt(b0 / k1[3]) - .002));
    const k2 = dir(x + k1[0] * h / 2, y + k1[1] * h / 2, z + k1[2] * h / 2);
    const k3 = dir(x + k2[0] * h / 2, y + k2[1] * h / 2, z + k2[2] * h / 2);
    const k4 = dir(x + k3[0] * h, y + k3[1] * h, z + k3[2] * h);
    const nx = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const ny = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const nz = z + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    // Back to the coil's plane, from the side it went to: end exactly on it.
    if (n > 2 && side && (nz - z0) * side <= 0) {
      const t = (z - z0) / Math.max(1e-12, Math.abs(z - nz)) * side;
      points.push([x + (nx - x) * t, y + (ny - y) * t, z0]);
      closed = true;
      break;
    }
    if (!side && Math.abs(nz - z0) > 1e-7) side = Math.sign(nz - z0);
    x = nx; y = ny; z = nz;
    points.push([x, y, z]);
    if (Math.abs(x - centre[0]) > reach || Math.abs(y - centre[1]) > reach || Math.abs(z - z0) > reach) break;
  }
  return { points, closed };
}

// The whole line from its half above the coil: the half below is the mirror image, run the other
// way, so the field goes round in one direction all along it. (Only for a coil on its own.)
export function wholeLine({ points, closed }, z0) {
  const mirror = points.map(([x, y, z]) => [x, y, 2 * z0 - z]).reverse();
  return closed ? { points: points.concat(mirror.slice(1)), closed } : { points: mirror.concat(points.slice(1)), closed };
}

// The whole line, both halves traced (with a metal plate near, the field is not mirrored): the
// half under the coil run up to the seed, then the half above.
export function loopLine(source, seed, options) {
  const up = trace(source, seed, options), down = trace(source, seed, { ...options, back: true });
  return { points: down.points.reverse().concat(up.points.slice(1)), closed: up.closed && down.closed };
}

// Where the lines start on one ray out from the coil's centre (angle `angle`, out to `edge`
// metres): at equal shares of the flux through the coil's plane (the field up through it, added
// up over rings of growing size: ψ(r) = ∫ Bz r dr), so the lines' crowding shows the field's
// strength. Only as far out as the field still points up through the coil.
export function seeds(source, { angle = 0, edge, count = 6, centre = [0, 0], samples = 240 }) {
  const c = Math.cos(angle), s = Math.sin(angle), z0 = source.z, f = [0, 0, 0];
  const flux = [0];
  let r = 0, last = 0, end = edge;
  for (let i = 1; i <= samples; i++) {
    r = edge * i / samples;
    const bz = fieldAt(source, centre[0] + r * c, centre[1] + r * s, z0, f)[2];
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

// Every line of a coil: `rays` out from the centre, `count` lines on each. When the field is
// symmetric, rays that are copies of each other (`copies`: rotations about the centre, in radians,
// and mirrors) are traced once and copied, which is the same field, worked out once. `mirror`:
// the field is the same above and below the coil (no plate), so only the half above is traced.
export function lines(source, { rays, count = 6, reach, centre = [0, 0], mirror = true }) {
  const out = [];
  for (const { angle, edge, copies = [{ turn: 0 }] } of rays) {
    for (const seed of seeds(source, { angle, edge, count, centre })) {
      const line = mirror ? wholeLine(trace(source, seed, { reach, centre }), source.z) : loopLine(source, seed, { reach, centre });
      for (const { turn = 0, flipX = false, flipY = false } of copies) {
        const c = Math.cos(turn), s = Math.sin(turn);
        const move = ([x, y, z]) => {
          let u = x - centre[0], v = y - centre[1];
          if (flipX) u = -u;
          if (flipY) v = -v;
          return [centre[0] + u * c - v * s, centre[1] + u * s + v * c, z];
        };
        out.push({ points: line.points.map(move), closed: line.closed });
      }
    }
  }
  return out;
}

// One whole job, as effects.js asks for it (here, or in the background in field-worker.js): the
// coil's turns (`loops`, `soft`), where its lines start (`rays`, `count`, `centre`), how far they
// go (`reach`), and a metal plate or none (`plate`, as `shield` takes it). Returns each line as
// flat [x, y, z, …] points, and how strong the field is at each point: 0 to 1, on a log scale
// from a hundredth of the coil's own field at its centre (no plate) up to it.
export function solveJob({ loops, soft, rays, count, reach, centre, plate = null }) {
  const coil = makeCoil(loops, { soft });
  const b0 = strength(coil, centre[0], centre[1], coil.z);
  const source = plate ? shield(coil, plate) : coil;
  const f = [0, 0, 0];
  return {
    z: coil.z,
    lines: lines(source, { rays, count, reach, centre, mirror: !plate }).map(({ points, closed }) => {
      const flat = new Float32Array(points.length * 3), power = new Float32Array(points.length);
      points.forEach(([x, y, z], i) => {
        flat.set([x, y, z], i * 3);
        const share = Math.hypot(...fieldAt(source, x, y, z, f)) / b0;
        power[i] = Math.min(1, Math.max(0, 1 + Math.log10(Math.max(share, 1e-6)) / 2));
      });
      return { points: flat, power, closed };
    }),
  };
}
