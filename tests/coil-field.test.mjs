// Checks on the close-up's real field lines (js/intro/coil-field.js, the "Real physics" switch):
// that its Biot–Savart sum gives the textbook field, and that the lines it traces behave as real
// field lines do. Run with `node --test` from the project's folder. Owner: Mina Vian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCoil, fieldAt, trace, wholeLine, seeds, lines } from '../js/intro/coil-field.js';

const MU0 = 4e-7 * Math.PI;
// A round coil of radius `a`, one turn, cut into `n` straight pieces, flat at height `z`.
const ring = (a, n = 256, z = 0, soft = 1e-6) => makeCoil([Array.from({ length: n }, (_, i) => {
  const t = i / n * 2 * Math.PI;
  return [a * Math.cos(t), a * Math.sin(t), z];
})], { soft });

test('on its axis, a round coil gives μ0 I a² / 2(a² + z²)^1.5', () => {
  const a = .03, coil = ring(a);
  for (const z of [0, .005, .02, .05, .15]) {
    const exact = MU0 * a * a / (2 * (a * a + z * z) ** 1.5);
    const [bx, by, bz] = fieldAt(coil, 0, 0, z);
    assert.ok(Math.abs(bz / exact - 1) < 1e-3, `Bz at ${z} m: ${bz} vs ${exact}`);
    assert.ok(Math.abs(bx) + Math.abs(by) < exact * 1e-6, `no sideways field on the axis at ${z} m`);
  }
});

test('a long straight wire gives μ0 I / 2πd', () => {
  const L = 50, d = .01;
  const wire = { pieces: Float64Array.from([-L, 0, 0, L, 0, 0]), soft2: 1e-12, z: 0 };
  const [, , bz] = fieldAt(wire, 0, -d, 0);
  // The current runs along +x; a metre below it (−y) the field points down (−z).
  assert.ok(Math.abs(-bz / (MU0 / (2 * Math.PI * d)) - 1) < 1e-4);
});

test('the field is the same above and below the coil, mirrored', () => {
  const coil = ring(.03);
  for (const [x, y, z] of [[.01, .005, .012], [.04, -.02, .03], [-.025, .01, .004]]) {
    const up = fieldAt(coil, x, y, z), down = fieldAt(coil, x, y, -z);
    assert.ok(Math.abs(up[2] - down[2]) < 1e-12 && Math.abs(up[0] + down[0]) < 1e-12 && Math.abs(up[1] + down[1]) < 1e-12);
  }
});

test('field lines close: from inside the coil they come back down outside it', () => {
  const a = .03, coil = ring(a, 128, 0, .0008);
  for (const seed of seeds(coil, { angle: .3, edge: a, count: 6 }).slice(1)) {
    const { points, closed } = trace(coil, seed, { reach: .3 });
    assert.ok(closed, `a line from ${Math.hypot(seed[0], seed[1]).toFixed(4)} m comes back down`);
    const end = points[points.length - 1];
    assert.ok(Math.hypot(end[0], end[1]) > a, 'and lands outside the coil');
    assert.ok(Math.abs(end[2]) < 1e-9, 'on its plane');
  }
});

test('a line always runs along the field', () => {
  const coil = ring(.03, 128, 0, .0008);
  const { points } = trace(coil, [.012, 0, 0], { reach: .3 });
  for (let i = 1; i < points.length - 1; i += 5) {
    const [x, y, z] = points[i], [nx, ny, nz] = points[i + 1];
    const b = fieldAt(coil, (x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
    const step = [nx - x, ny - y, nz - z];
    const cos = (b[0] * step[0] + b[1] * step[1] + b[2] * step[2]) / (Math.hypot(...b) * Math.hypot(...step));
    assert.ok(cos > .995, `step ${i} runs ${Math.acos(cos)} rad off the field`);
  }
});

test('the lines start at equal shares of the flux: closer together near the wire', () => {
  const a = .03, at = seeds(ring(a, 128, 0, .0008), { angle: 0, edge: a, count: 6 }).map(p => p[0]);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1], 'they go outward in order');
  assert.ok(at[5] - at[4] < at[1] - at[0], 'near the wire, where the field is strong, they crowd');
});

test('a whole line runs one way round, through the coil and back under it', () => {
  const coil = ring(.03, 128, 0, .0008);
  const half = trace(coil, [.015, 0, 0], { reach: .3 });
  const { points } = wholeLine(half, 0);
  assert.ok(points.some(p => p[2] > .005) && points.some(p => p[2] < -.005), 'above and below');
  assert.equal(points.length, 2 * half.points.length - 1);
  // The mirror's last point is the seed, so the loop is closed.
  assert.deepEqual(points[points.length - 1], [.015, 0, 0]);
});

test('copies of a ray are the same lines, turned', () => {
  const coil = ring(.03, 128, 0, .0008);
  const set = lines(coil, { count: 2, reach: .2, rays: [{ angle: 0, edge: .03, copies: [{ turn: 0 }, { turn: Math.PI / 2 }] }] });
  assert.equal(set.length, 4);
  const [a, b] = set;
  a.points.forEach(([x, y, z], i) => {
    const [bx, by, bz] = b.points[i];
    assert.ok(Math.abs(bx + y) < 1e-12 && Math.abs(by - x) < 1e-12 && bz === z);
  });
});
