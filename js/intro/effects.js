// What the close-up shows moving between the reader and the card (see cinema.js). It has
// one simple picture language, so each step adds one thing you can follow:
// - Electricity is golden light running along a wire: round one loop on each coil (its
//   outer turn), and on the card from its coil into the chip.
// - The magnetic field is rings that leave one coil in its shape and arrive at the other in
//   that one's shape. Orange rings rise from the reader to the card: the reader's field,
//   which powers the card and carries the question. Blue rings come down from the card to
//   the reader: the answer.
// - The chips glow while they have power or work, and flash as they read each byte.
// - With the "Real physics" switch on (main.js), the rings give way to the coils' real field
//   lines, worked out from their windings (coil-field.js; see "Real physics" below).
// The rings live in the reader's frame; the wires and the chip's glow live in the card's
// frame, so they move with it. Units are metres.
// The page behind is light while the card is dragged, so nothing here adds light: every
// mark is a saturated colour laid over the scene with ordinary blending, which reads on
// paper as well as on the dark close-up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solveJob } from './coil-field.js';
import { squarePoint, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP } from './reader-model.js';
import { HOVER } from './cinema.js';
import { PHONE_COIL, PHONE_CHIP } from './phone-reader.js';

const WARM = new THREE.Color('#ffb52e');   // electricity, while power comes in
const COOL = new THREE.Color('#2f7dff');   // the card's answer
const UP_COLOR = new THREE.Color('#ff8a2a'); // the reader's field
const MODULE = new THREE.Vector2(-.0277, .0031);   // the chip module's centre on the card
const smoothstep = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.3, 'rgba(255,255,255,.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// A band in the shape of the reader's coil, `band` metres wide, centred on its outer
// turn: one ring of the field (a thin bright core, and a wide faint halo round it). The phone's
// coil is round: a rounded square whose corners are as big as its half-width.
const RING_HALF = COIL_HALF - .002;
const PHONE_HALF = PHONE_COIL.radius - .001;
function ringGeometry(band, ringHalf = RING_HALF, corner = COIL_RADIUS - .002) {
  const outer = new THREE.Shape(), inner = new THREE.Path();
  const steps = 160, half = ringHalf + band / 2, radius = corner + band / 2;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = squarePoint(half, radius, i / steps);
    if (i) outer.lineTo(x, y); else outer.moveTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = squarePoint(half - band, Math.max(1e-5, radius - band), i / steps);
    if (i === steps) inner.moveTo(x, y); else inner.lineTo(x, y);
  }
  outer.holes.push(inner);
  return new THREE.ShapeGeometry(outer, 1);
}

const overlay = (map, color) => new THREE.SpriteMaterial({
  map, color, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0,
});

// A point `f` of the way round a rounded rectangle (half sizes `hx`, `hy`, corner radius
// `r`), counter-clockwise from the middle of the right side.
export function rectPoint(hx, hy, r, f) {
  const sx = 2 * (hx - r), sy = 2 * (hy - r), a = Math.PI * r / 2;
  let d = (((f % 1) + 1) % 1) * (2 * sx + 2 * sy + 4 * a);
  const cx = hx - r, cy = hy - r;
  const parts = [
    [hx, 0, 0, 1, sy / 2], [cx, cy, 0], [cx, hy, -1, 0, sx], [-cx, cy, Math.PI / 2], [-hx, cy, 0, -1, sy],
    [-cx, -cy, Math.PI], [-cx, -hy, 1, 0, sx], [cx, -cy, 1.5 * Math.PI], [hx, -cy, 0, 1, sy / 2],
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
  return [hx, 0];
}

// A closed loop of the card's coil, as points for a curve.
function loop(center, hx, hy, r, z, steps = 220) {
  return Array.from({ length: steps }, (_, i) => {
    const [x, y] = rectPoint(hx, hy, r, i / steps);
    return [center[0] + x, center[1] + y, z];
  });
}

// Current along a wire: a tube with comets running along it, each a solid head with a
// tail fading out behind it, so the direction of the current is plain to see. `base` is
// how much of the wire shows between comets. `uDir` sets the way they run (+1 or -1).
function currentWire(points, { radius, closed = false, count = 2, base = .3 }) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', .35);
  const geometry = new THREE.TubeGeometry(curve, closed ? 480 : 64, radius, 8, closed);
  const uniforms = {
    uColor: { value: WARM.clone() }, uAmount: { value: 0 }, uPhase: { value: 0 }, uCount: { value: count },
    uDir: { value: 1 }, uBase: { value: base }, uFadeIn: { value: closed ? 0 : .08 },
  };
  // The wire itself, and a wider, fainter copy round it: the glow round each bead of light.
  const material = (halo) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying float vAlong;
      void main() { vAlong = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAmount; uniform float uPhase; uniform float uCount;
      uniform float uDir; uniform float uBase; uniform float uFadeIn;
      varying float vAlong;
      void main() {
        float at = fract(uDir * vAlong * uCount - uPhase);
        // A bead of light with a short tail behind it.
        float comet = pow(at, 3.) * (1. - smoothstep(.93, 1., at));
        float alpha = uAmount * (${halo ? '.3 * comet' : 'uBase + (1. - uBase) * comet'});
        if (uFadeIn > 0.) alpha *= smoothstep(0., uFadeIn, uDir > 0. ? vAlong : 1. - vAlong);
        // Each bead's head is nearly white, so it reads as light, not as the copper's colour.
        gl_FragColor = vec4(mix(uColor, vec3(1., .97, .9), pow(comet, 4.) * .8), alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material(false));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, closed ? 480 : 64, radius * 3.2, 8, closed), material(true));
  mesh.add(glow);
  mesh.renderOrder = 9;
  glow.renderOrder = 8;
  mesh.frustumCulled = glow.frustumCulled = false;
  return { mesh, uniforms };
}

// The rings: how long one takes to cross from coil to coil, and how often one leaves.
// The crossing is only drawn slowed down: in life the field between the coils changes
// everywhere at once.
const CROSS = 1.5, EVERY = .3;
// A ring's place and shape: on the reader's coil, and on the card's coil once the card lies
// over the reader (its outer turn is 80 by 49 mm, turned with the card).
const AT_READER = { x: 0, y: 0, sx: 1, sy: 1, spin: 0 };
const AT_CARD = {
  x: HOVER.x - .0003 * Math.cos(HOVER.spin), y: HOVER.y - .0003 * Math.sin(HOVER.spin),
  sx: .0402 / RING_HALF, sy: .0246 / RING_HALF, spin: HOVER.spin,
};
// While the card is still in the hand, the rings just spread as they rise.
const SPREAD = { x: 0, y: 0, sx: 1.22, sy: 1.22, spin: 0 };
const lerp = (a, b, k) => a + (b - a) * k;
// The reader's field at height z (m) over its coil, as a share of its strength at the coil:
// on the axis of a loop of radius R it falls as (R² / (R² + z²))^1.5. The phone's coil is
// smaller (21 mm in the physics engine, js/rfid/physics.js), so its field dies away sooner.
const fieldAt = (z, R = .035) => (R * R / (R * R + z * z)) ** 1.5;
const PHONE_R = .021;
const blendShape = (a, b, k, out) => {
  for (const key of ['x', 'y', 'sx', 'sy', 'spin']) out[key] = lerp(a[key], b[key], k);
  return out;
};

// Real physics (the close-up's switch, main.js `physics`; shown as far as `b.physics`): in place
// of the rings, the coils' own magnetic field, worked out from their windings (coil-field.js) and
// drawn as its field lines. Owner: Mina Vian. What is real in it:
// - The shape: each line runs the way a compass needle would point, up through the coil, round,
//   and back under it (the half under the coil is fainter: it runs through the reader).
// - The strength: the lines crowd where the field is strong, and each fades where it weakens
//   (it falls about as the cube of the distance, so the far ends fade fast).
// - The timing: the field is not sent across. It is there everywhere at once and turns round
//   13.56 million times a second; here once every two seconds (WAVE_HZ). The beads on the lines
//   run the way the field points at that moment, so you see it swing back and forth.
// - The card's power: the lines that pass through the card's coil (drawn stronger) are the ones
//   that drive its current. Farther away, or turned side-on, fewer pass through.
// - The answer: the card's coil makes a small field of its own (blue), a quarter turn behind the
//   reader's, as the current a changing field drives round a tuned coil is.
// - Metal (the lab's plate behind the card): the eddy currents in it keep any field from passing
//   through, so the lines bend round the plate (coil-field.js `shield`). They are traced again in
//   the background (field-worker.js) each time the card or the plate moves, and the new lines
//   fade in over the old.
const WAVE_HZ = .5;     // 13.56 MHz shown 27 million times slower
const BEAD = .009;      // about this far between the beads on a line (m)
const CARD_CENTRE = [-.0003, 0], CARD_Z = .00034, CARD_HALF = [.0402, .0246];
const QUARTERS = [0, 1, 2, 3].map(k => ({ turn: k * Math.PI / 2 }));

// The coils, each turn a closed loop, and where their lines start: the reader's as wound in
// reader-model.js (five turns, drawn in from its outer one), the phone's (round, between its outer
// and inner turn, phone-reader.js), and the card's (its outer turn as drawn here, and three more
// inside it, in the card's own frame). `rays` trace one ray of each kind and copy it, as the coil
// alone is symmetric; `plated`, the rays for when a plate breaks that (the plate lies off-centre
// and turned over a reader, but centred on the card, so the card keeps its copies).
const PAD_RAYS = Array.from({ length: 8 }, (_, k) => ({ angle: k * Math.PI / 4, edge: k % 2 ? (COIL_HALF - COIL_RADIUS) * Math.SQRT2 + COIL_RADIUS : COIL_HALF }));
const CARD_RAYS = [
  { angle: 0, edge: CARD_HALF[0], copies: [{}, { flipX: true }] },
  { angle: Math.PI / 2, edge: CARD_HALF[1], copies: [{}, { flipY: true }] },
];
const COILS = {
  pad: {
    loops: Array.from({ length: 5 }, (_, k) => {
      const s = (k + .5) / 5;
      return Array.from({ length: 64 }, (_, i) => [...squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, i / 64), COIL_Z]);
    }),
    soft: .0008, count: 6, reach: .16, centre: [0, 0],
    rays: [{ ...PAD_RAYS[0], copies: QUARTERS }, { ...PAD_RAYS[1], copies: QUARTERS }], plated: PAD_RAYS,
  },
  phone: {
    loops: Array.from({ length: 4 }, (_, k) => {
      const r = PHONE_COIL.radius - (k + .5) / 4 * (PHONE_COIL.radius - PHONE_COIL.inner);
      return Array.from({ length: 64 }, (_, i) => [r * Math.cos(i / 64 * Math.PI * 2), r * Math.sin(i / 64 * Math.PI * 2), PHONE_COIL.z]);
    }),
    soft: .0008, count: 6, reach: .16, centre: [0, 0],
    rays: [{ angle: 0, edge: PHONE_COIL.radius, copies: Array.from({ length: 8 }, (_, k) => ({ turn: k * Math.PI / 4 })) }],
    plated: Array.from({ length: 8 }, (_, k) => ({ angle: k * Math.PI / 4, edge: PHONE_COIL.radius })),
  },
  card: {
    loops: Array.from({ length: 4 }, (_, k) =>
      loop(CARD_CENTRE, CARD_HALF[0] - k * .0011, CARD_HALF[1] - k * .0011, Math.max(.001, .0028 - k * .0006), CARD_Z, 96)),
    soft: .0005, count: 4, reach: .12, centre: CARD_CENTRE, rays: CARD_RAYS, plated: CARD_RAYS,
  },
};
const jobFor = (kind, plate) => {
  const { loops, soft, count, reach, centre, rays, plated } = COILS[kind];
  return { loops, soft, count, reach, centre, rays: plate ? plated : rays, plate };
};

// The lab's metal plate (card-scene.js `plate`): in the card's frame, centred on its coil, 0.9 mm
// plus `behind` (m) behind it, 94 by 62 mm. `cardPlate` as the card's own lines see it;
// `readerPlate` in the reader's frame, the card's frame at `cardZ` over the reader, turned `tilt`,
// drawn `size` times a bank card.
const PLATE_HALF = [.047, .031];
const cardPlate = behind => ({ centre: [CARD_CENTRE[0], CARD_CENTRE[1], .0009 + behind], half: PLATE_HALF });
function readerPlate(cardZ, tilt, size, behind) {
  const s = HOVER.spin, ex = [Math.cos(s), Math.sin(s), 0], n = [Math.sin(s) * Math.sin(tilt), -Math.cos(s) * Math.sin(tilt), Math.cos(tilt)];
  const along = CARD_CENTRE[0] * size, back = (.0009 + behind) * size;
  return {
    centre: [HOVER.x + ex[0] * along + n[0] * back, HOVER.y + ex[1] * along + n[1] * back, cardZ + n[2] * back],
    spin: s, tilt, half: [PLATE_HALF[0] * size, PLATE_HALF[1] * size],
  };
}

// The worker that traces the lines (field-worker.js), started the first time it is needed. If it
// can't start, or fails, the same work is done here instead.
let worker, jobs = 0;
const waiting = new Map();
function solveField(job) {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./field-worker.js', import.meta.url), { type: 'module' });
      worker.addEventListener('message', ({ data }) => { waiting.get(data.id)?.resolve(data.result); waiting.delete(data.id); });
      worker.addEventListener('error', () => {
        worker = null;
        for (const { resolve, job } of waiting.values()) resolve(solveJob(job));
        waiting.clear();
      });
    } catch (error) { worker = null; }
  }
  if (!worker) return Promise.resolve().then(() => solveJob(job));
  return new Promise(resolve => {
    const id = ++jobs;
    waiting.set(id, { resolve, job });
    worker.postMessage({ id, job });
  });
}

// One coil's field lines as one mesh: a thin tube along each line, which knows how far along the
// line each point is (in beads), how strong the field is there (0 to 1, on a log scale: a hundredth
// of the field at the coil's centre is 0; worked out with the line, coil-field.js `solveJob`) and
// whether it is under the coil.
function fieldLineSet({ z: coilZ, lines: list }, color) {
  const point = new THREE.Vector3();
  const parts = list.map(({ points, power: strengths, closed }, index) => {
    const count = points.length / 3, vectors = [], lengths = [0];
    for (let k = 0; k < count; k++) {
      vectors.push(new THREE.Vector3(points[k * 3], points[k * 3 + 1], points[k * 3 + 2]));
      if (k) lengths.push(lengths[k - 1] + vectors[k].distanceTo(vectors[k - 1]));
    }
    const curve = new THREE.CatmullRomCurve3(vectors, closed, 'centripetal');
    const length = curve.getLength(), radial = 5, total = lengths[count - 1] || 1;
    const segments = Math.round(THREE.MathUtils.clamp(length / .0012, 24, 360));
    const geometry = new THREE.TubeGeometry(curve, segments, .00045, radial, closed);
    const n = geometry.attributes.position.count, uv = geometry.attributes.uv;
    const along = new Float32Array(n), power = new Float32Array(n), under = new Float32Array(n);
    // A whole number of beads round a closed line, so the last one meets the first.
    const beads = Math.max(1, Math.round(length / BEAD));
    for (let i = 0, k = 1; i <= segments; i++) {
      curve.getPointAt(i / segments, point);
      // The field's strength there, from the traced points either side (by how far along).
      const want = i / segments * total;
      while (k < count - 1 && lengths[k] < want) k++;
      const t = THREE.MathUtils.clamp((want - lengths[k - 1]) / Math.max(1e-9, lengths[k] - lengths[k - 1]), 0, 1);
      const level = strengths[k - 1] + (strengths[k] - strengths[k - 1]) * t;
      const below = smoothstep(0, .003, coilZ - point.z);
      for (let j = 0; j <= radial; j++) {
        const v = i * (radial + 1) + j;
        along[v] = uv.getX(v) * beads;
        power[v] = level;
        under[v] = below;
      }
    }
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geometry.setAttribute('aPower', new THREE.BufferAttribute(power, 1));
    geometry.setAttribute('aUnder', new THREE.BufferAttribute(under, 1));
    geometry.setAttribute('aLine', new THREE.BufferAttribute(new Float32Array(n).fill(index), 1));
    return geometry;
  });
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const uniforms = {
    uColor: { value: color.clone() }, uAmount: { value: 0 }, uWave: { value: 1 }, uFlow: { value: 0 },
    uLink: { value: new Float32Array(list.length) }, uLinkShow: { value: 0 }, uUnder: { value: .6 },
    uSoak: { value: 0 }, uSoakFrom: { value: 0 }, uSoakTo: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, defines: { LINES: list.length },
    vertexShader: `attribute float aAlong; attribute float aPower; attribute float aUnder; attribute float aLine;
      uniform float uLink[LINES]; uniform float uLinkShow;
      varying float vAlong; varying float vPower; varying float vUnder; varying float vLine; varying float vZ; varying vec3 vNormal;
      void main() {
        vAlong = aAlong; vPower = aPower; vUnder = aUnder; vLine = aLine; vZ = position.z;
        vNormal = normalize(normalMatrix * normal);
        // The lines through the card's coil, drawn thicker.
        vec3 at = position + normal * .0003 * uLink[int(aLine + .5)] * uLinkShow;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAmount; uniform float uWave; uniform float uFlow;
      uniform float uLink[LINES]; uniform float uLinkShow; uniform float uUnder;
      uniform float uSoak; uniform float uSoakFrom; uniform float uSoakTo;
      varying float vAlong; varying float vPower; varying float vUnder; varying float vLine; varying float vZ; varying vec3 vNormal;
      void main() {
        // The field right now: as strong as the wave, pointing along the line or back (its sign).
        float wave = abs(uWave);
        float d = fract(vAlong - uFlow);
        float at = uWave < 0. ? 1. - d : d;
        // A bead with a short tail, its head the way the field points.
        float bead = pow(at, 3.) * (1. - smoothstep(.9, 1., at));
        float alpha = 1.6 * uAmount * (.25 + .75 * wave) * (.3 + .7 * vPower) * (.5 + .5 * bead);
        alpha *= 1. - uUnder * vUnder;
        // Once the card lies over the reader: the lines through its coil stronger, the rest fainter.
        alpha *= mix(1., .6 + .6 * uLink[int(vLine + .5)], uLinkShow);
        // A metal plate behind the card: the field dies out before it.
        alpha *= 1. - uSoak * smoothstep(uSoakFrom, uSoakTo, vZ);
        // Softer at the tube's edges, so a line reads as a line, not a pipe.
        alpha *= .55 + .45 * smoothstep(0., .6, abs(vNormal.z));
        gl_FragColor = vec4(uColor, clamp(alpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, uniforms, list, through: 0, key: '', mix: 0, plated: false };
}

// Which of a reader's lines pass through the card's coil (`card`: where its middle is in the
// reader's frame, its turn `spin` and `tilt`, its coil's half sizes), with the reader moved by
// `shift`: each line is followed until it crosses the plane of the card, inside the coil or not.
function threadCard(set, shift, card) {
  const c = Math.cos(card.spin), s = Math.sin(card.spin), ct = Math.cos(card.tilt), st = Math.sin(card.tilt);
  let through = 0;
  set.list.forEach(({ points }, i) => {
    let hit = 0, pu = 0, pv = 0, pw = 0;
    for (let k = 0; k < points.length && !hit; k += 3) {
      const dx = points[k] + shift.x - card.x, dy = points[k + 1] - card.y, dz = points[k + 2] + shift.z - card.z;
      const u = dx * c + dy * s, across = -dx * s + dy * c;
      const v = across * ct + dz * st, w = -across * st + dz * ct;
      if (k && (w > 0) !== (pw > 0)) {
        const t = pw / (pw - w);
        if (Math.abs(pu + (u - pu) * t) < card.hx && Math.abs(pv + (v - pv) * t) < card.hy) hit = 1;
      }
      pu = u; pv = v; pw = w;
    }
    set.uniforms.uLink.value[i] = hit;
    through += hit;
  });
  set.through = through;
}

export function buildEffects() {
  const table = new THREE.Group();   // in the reader's frame
  const onCard = new THREE.Group();  // in the card's frame
  const glow = glowTexture();

  // The field's rings: enough of each to fill the gap. Each is a core and a halo. The phone's
  // are round, the size of its coil.
  const core = ringGeometry(.0013), halo = ringGeometry(.0055);
  const phoneCore = ringGeometry(.0013, PHONE_HALF, PHONE_HALF), phoneHalo = ringGeometry(.0055, PHONE_HALF, PHONE_HALF);
  const makeRings = (color, core, halo) => Array.from({ length: Math.ceil(CROSS / EVERY) + 1 }, () => {
    const mesh = new THREE.Mesh(core, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    const around = new THREE.Mesh(halo, mesh.material.clone());
    mesh.add(around);
    mesh.renderOrder = 6;
    around.renderOrder = 5;
    mesh.frustumCulled = around.frustumCulled = false;
    table.add(mesh);
    return mesh;
  });
  const up = makeRings(UP_COLOR, core, halo), down = makeRings(COOL, core, halo);
  const phoneUp = makeRings(UP_COLOR, phoneCore, phoneHalo), phoneDown = makeRings(COOL, phoneCore, phoneHalo);
  // The phone's rings start the size of its coil, and reach the card's coil in its shape.
  const PHONE_CARD = { ...AT_CARD, sx: .0402 / PHONE_HALF, sy: .0246 / PHONE_HALF };
  const phoneCard = { ...PHONE_CARD };
  const PHONE_SPREAD = { x: 0, y: 0, sx: 1.22, sy: 1.22, spin: 0 }, phoneLanding = { ...PHONE_SPREAD };
  const landing = { ...AT_CARD }, cardShape = { ...AT_CARD };
  // Real physics: each coil's field lines (a "slot" per coil), worked out in the background the
  // first time they are needed, and again whenever the metal plate or the card behind it moves.
  // The card's live in its own frame, so they move with it.
  let realShow = 0, realSet = null;
  const realCard = { x: 0, y: 0, z: 0, spin: HOVER.spin, tilt: 0, hx: 0, hy: 0 };
  function lineSlot(kind, color, group) {
    const slot = { shown: null, leaving: [], wanted: '', asked: '', plate: null, busy: false };
    // The lines for `key`: with `plate` (as coil-field.js `shield` takes it), or none. Only one
    // job at a time; when it comes back, the latest wanted is asked for next.
    slot.want = (key, plate) => {
      slot.wanted = key;
      slot.plate = plate;
      if (!slot.busy && slot.asked !== key) send();
    };
    function send() {
      slot.busy = true;
      slot.asked = slot.wanted;
      const plate = slot.plate;
      solveField(jobFor(kind, plate)).then(result => {
        const set = fieldLineSet(result, color);
        set.plated = !!plate;
        group.add(set.mesh);
        if (slot.shown) slot.leaving.push(slot.shown);
        slot.shown = set;
      }).catch(error => console.warn('Could not trace the field lines.', error)).finally(() => {
        slot.busy = false;
        if (slot.wanted !== slot.asked) send();
      });
    }
    // Each frame: the newest lines fade in as the ones before fade out (a third of a second).
    slot.fade = dt => {
      if (slot.shown) slot.shown.mix = Math.min(1, slot.shown.mix + dt / .35);
      slot.leaving = slot.leaving.filter(set => {
        set.mix -= dt / .35;
        set.mesh.visible = false;
        if (set.mix > 0) return true;
        group.remove(set.mesh);
        set.mesh.geometry.dispose();
        set.mesh.material.dispose();
        return false;
      });
    };
    slot.sets = () => (slot.shown ? [slot.shown, ...slot.leaving] : slot.leaving);
    return slot;
  }
  let real = null;
  // How far the beads on each wire have run. It adds up frame by frame, so a change of
  // speed or of direction never makes them jump: they slow, stop and turn round.
  let lastClock = null;

  // Lays one stream of rings out at clock time `t`: a ring leaves every EVERY seconds,
  // `level` bright, from `from` (at height `fromZ`) to `to` (at `toZ`), taking the shape
  // of the coil it is reaching as it goes. Each is brightest halfway across. `halo`: how
  // much of the glow round each ring shows (only in the dark; on paper it looks heavy).
  // `fade(p, z)`: how much of a ring shows that far across and at that height (the lab's).
  function stream(rings, t, level, from, to, fromZ, toZ, halo, fade = () => 1) {
    const newest = Math.floor(t / EVERY);
    rings.forEach((mesh, i) => {
      const p = (t - (newest - i) * EVERY) / CROSS;
      const shape = p * p * (3 - 2 * p);
      const opacity = p < 0 || p > 1 ? 0 : level * Math.sin(Math.PI * p) ** 1.2 * .85 * fade(p, lerp(fromZ, toZ, p));
      mesh.visible = opacity > .004;
      if (!mesh.visible) return;
      mesh.material.opacity = opacity;
      mesh.children[0].material.opacity = opacity * .2 * halo;
      mesh.position.set(lerp(from.x, to.x, shape), lerp(from.y, to.y, shape), lerp(fromZ, toZ, p));
      mesh.rotation.z = lerp(from.spin, to.spin, shape);
      mesh.scale.set(lerp(from.sx, to.sx, shape), lerp(from.sy, to.sy, shape), 1);
    });
  }

  // The reader's chip, glowing while it checks the answer.
  const think = new THREE.Sprite(overlay(glow, COOL));
  think.position.copy(READER_CHIP).setZ(READER_CHIP.z + .002);
  think.renderOrder = 8;
  table.add(think);

  // The current in the reader's coil, drawn over its outer turn: the same loop the
  // reader's rings leave from.
  const readerBand = currentWire(Array.from({ length: 240 }, (_, i) => [...squarePoint(COIL_HALF - .0004, COIL_RADIUS - .0002, i / 240), COIL_Z + .0004]),
    { radius: .0008, closed: true, count: 6, base: .05 });
  table.add(readerBand.mesh);
  // The same round the phone's coil: its outer turn, just over the antenna.
  const phoneBand = currentWire(Array.from({ length: 240 }, (_, i) => {
    const a = i / 240 * Math.PI * 2;
    return [PHONE_COIL.radius * Math.cos(a), PHONE_COIL.radius * Math.sin(a), PHONE_COIL.z + .0006];
  }), { radius: .0007, closed: true, count: 5, base: .05 });
  table.add(phoneBand.mesh);

  // The current in the card, drawn over its copper: round the big coil's outer turn (where
  // the rings land), round the chip module's coil, and along the module's two wires into the
  // chip (traced from the model). Power runs one way round; the answer runs back the other
  // way, in blue.
  const z = .00034;
  const coilBand = currentWire(loop([-.0003, 0], .0402, .0246, .0028, z), { radius: .0007, closed: true, count: 5, base: .05 });
  const moduleBand = currentWire(loop([MODULE.x, MODULE.y], .0055, .0048, .0012, z), { radius: .00028, closed: true, count: 2, base: .08 });
  const wires = [
    [[-.0339, .0041, z], [-.0322, .0042, z], [-.0306, .0041, z], [-.0294, .0038, z]],
    [[-.0318, .0026, z], [-.0312, .0024, z], [-.0305, .00235, z], [-.0294, .0025, z]],
  ].map(points => currentWire(points, { radius: .00016, count: 2, base: .3 }));
  for (const { mesh } of [coilBand, moduleBand, ...wires]) onCard.add(mesh);

  // The chip's glow, over the silicon die: warm while it has power, a soft beat while it works.
  const die = new THREE.Sprite(overlay(glow, new THREE.Color('#ffb347')));
  die.position.set(MODULE.x, MODULE.y, .0012);
  die.renderOrder = 11;
  onCard.add(die);

  // Called every frame with the shown levels (cinema.js), the live clock `b.clock` in
  // seconds, and how high the card's coil is over the reader. `talk` has the reader's field
  // right now as the card feels it (`amp`, 0 in a gap), the card's switch (`load`), how
  // strong the current in the reader's coil is (`reader`) and how far it has turned blue
  // as it takes the answer in (`reading`).
  // `padShift`, `phoneShift` ({ x, z }, metres): where each reader is while the lab swaps them,
  // so its field and its current travel with it instead of waiting in the middle.
  const NO_SHIFT = { x: 0, z: 0 };
  const padFrom = { ...AT_READER }, phoneFrom = { x: 0, y: 0, sx: 1, sy: 1, spin: 0 };
  function update(b, cardZ, talk = { amp: 1, load: 0, reader: 0, reading: 0 }) {
    const padShift = talk.padShift || NO_SHIFT, phoneShift = talk.phoneShift || NO_SHIFT;
    padFrom.x = padShift.x;
    phoneFrom.x = phoneShift.x;
    const any = b.field + b.reply + b.thinking + b.power + b.blink + b.read + b.receive + talk.reader;
    table.visible = onCard.visible = any > .003;
    // The clock is kept even while nothing shows, so the beads carry on from where they were
    // when they come back, rather than catching up in one frame.
    if (!table.visible) { lastClock = b.clock; return; }
    const t = b.clock, said = b.message?.started ? b.message : null;
    const dt = lastClock === null ? 0 : Math.min(.1, Math.max(0, t - lastClock));
    lastClock = t;
    const { amp, load } = talk;

    // Up: the reader's field, from its coil to the card's. In the question the whole
    // stream dims in each of the reader's gaps, as the field does everywhere at once.
    // Where the rings land: spread while the card is in the hand, on the card's coil once it
    // is down, blending between the two as it docks so nothing jumps.
    // The card's coil as the rings meet it: narrower when the card is turned away (the lab).
    const facing = Math.abs(Math.cos(b.tilt || 0)), size = 1 + ((b.tagScale ?? 1) - 1) * (b.dock || 0);
    // The card's coil, as big as the lab's tag (a key ring tag's is smaller), and narrower turned away.
    cardShape.sx = AT_CARD.sx * size;
    cardShape.sy = AT_CARD.sy * size * Math.max(.05, facing);
    phoneCard.sx = PHONE_CARD.sx * size;
    phoneCard.sy = PHONE_CARD.sy * size * Math.max(.05, facing);
    // The rings take the card's coil's shape only as far as the card faces the reader: turned
    // side-on, little of the field goes through its coil, so they keep spreading past it rather
    // than closing onto it (they used to land on it even at 80°).
    const to = blendShape(SPREAD, cardShape, smoothstep(0, 1, b.dock) * facing, landing);
    const phoneTo = blendShape(PHONE_SPREAD, phoneCard, facing, phoneLanding);
    // Which reader (the lab): the pad's field fades out over the first half of the swap, the
    // phone's comes in over the second, so the two never show together.
    const phone = b.phone || 0, padShare = 1 - smoothstep(0, .5, phone), phoneShare = smoothstep(.5, 1, phone);
    const top = cardZ + .00034;
    // In the lab the rings fade as they rise, as the field does with height, and a metal
    // plate behind the card soaks up what would reach it.
    const falloff = b.falloff || 0, soak = (b.metal || 0) * (b.shield || 0);
    // (The metal's share is taken away over the upper half of the climb, so the rings visibly
    // die out before they reach the plate.)
    const upFade = (p, z) => lerp(1, fieldAt(z - COIL_Z), falloff) * (1 - soak * smoothstep(.15, .7, p));
    const phoneUpFade = (p, z) => lerp(1, fieldAt(z - COIL_Z, PHONE_R), falloff) * (1 - soak * smoothstep(.15, .7, p));
    // The card's answer is a change in the field near its coil, weaker by the reader.
    const downFade = (p, z) => lerp(1, fieldAt(top - z), falloff * .7);
    // On the light page, while the card is still in the hand, the rings are lighter.
    const paper = 1 - (b.dark || 0), halo = b.dark || 0;
    const physics = b.physics || 0;
    const upLevel = b.field * (said?.dir > 0 ? .12 + .88 * amp : 1) * (1 - .5 * paper) * (1 - physics);
    stream(up, t, upLevel * padShare, padFrom, to, COIL_Z + .0004 + padShift.z, top, halo, upFade);
    stream(phoneUp, t, upLevel * phoneShare, phoneFrom, phoneTo, COIL_Z + .0006 + phoneShift.z, top, halo, phoneUpFade);
    // Down: the answer, from the card's coil to the reader's. It swells each time the card
    // closes its switch.
    // (Once the answer has landed, full strength: then only a still frame, with reduced
    // motion, still shows it; blended over the landing, so nothing jumps.)
    const answer = b.reply * (b.answerScale ?? 1) * (said?.dir < 0 ? lerp(.35 + .65 * load, 1, said.landed) : 1);
    const downLevel = answer * (1 - physics);
    stream(down, t, downLevel * padShare, cardShape, padFrom, top, COIL_Z + .0004 + padShift.z, halo, downFade);
    stream(phoneDown, t, downLevel * phoneShare, phoneCard, phoneFrom, top, COIL_Z + .0006 + phoneShift.z, halo, downFade);

    // Real physics: the reader's field lines, and the card's while it answers.
    if (physics > .003 && !real) real = { pad: lineSlot('pad', UP_COLOR, table), phone: lineSlot('phone', UP_COLOR, table), card: lineSlot('card', COOL, onCard) };
    if (real) {
      const wave = Math.cos(2 * Math.PI * WAVE_HZ * t);
      // In each of the reader's gaps in the question its field really stops (100% ASK).
      const reader = b.field * physics * (said?.dir > 0 ? amp : 1);
      // The card's coil, where it lies over the reader: which lines pass through it.
      realShow = physics * smoothstep(.6, 1, b.dock || 0);
      const turn = Math.cos(HOVER.spin), side = Math.sin(HOVER.spin);
      Object.assign(realCard, { x: HOVER.x + CARD_CENTRE[0] * size * turn, y: HOVER.y + CARD_CENTRE[0] * size * side, z: top,
        tilt: b.tilt || 0, hx: CARD_HALF[0] * size, hy: CARD_HALF[1] * size });
      const soak = (b.metal || 0) * (b.shield || 0);
      // The metal plate, once it shows with the card down: where it is, to the millimetre (and the
      // card's turn to about 2°), so the lines are traced again only when it has really moved.
      const metal = (b.metal || 0) > .3 && (b.dock || 0) > .9;
      const snap = (v, by) => Math.round(v / by) * by;
      const behind = snap(b.plate ?? .02, .001), plateZ = snap(cardZ, .001), plateTilt = snap(b.tilt || 0, .03), plateSize = snap(size, .02);
      const plateKey = metal ? [behind, plateZ, plateTilt, plateSize].map(v => v.toFixed(3)).join() : 'none';
      const behindWave = Math.sin(2 * Math.PI * WAVE_HZ * t);
      // Which coils are wanted: the reader in use (both through a swap), and the card while it answers.
      if (physics > .003 && phone < .999) real.pad.want(plateKey, metal ? readerPlate(plateZ, plateTilt, plateSize, behind) : null);
      if (physics > .003 && phone > .001) real.phone.want(plateKey, metal ? readerPlate(plateZ, plateTilt, plateSize, behind) : null);
      if (physics > .003 && answer > .001) real.card.want(metal ? 'card ' + behind.toFixed(3) : 'none', metal ? cardPlate(behind) : null);
      realSet = (phone > .5 ? real.phone : real.pad).shown;
      for (const [slot, share, shift] of [[real.pad, padShare, padShift], [real.phone, phoneShare, phoneShift]]) {
        slot.fade(dt);
        for (const set of slot.sets()) {
          const amount = reader * share * set.mix;
          set.mesh.visible = amount > .003;
          if (!set.mesh.visible) continue;
          set.mesh.position.set(shift.x, 0, shift.z);
          const u = set.uniforms;
          u.uAmount.value = amount;
          u.uWave.value = wave;
          u.uFlow.value += dt * 2.2 * wave;
          u.uLinkShow.value = realShow;
          u.uUnder.value = lerp(.85, .55, b.xray || 0);
          // Lines traced without the plate (until the ones with it come back) fade out before it.
          u.uSoak.value = set.plated ? 0 : soak;
          u.uSoakFrom.value = top - shift.z;
          u.uSoakTo.value = top + (b.plate ?? .02) - shift.z;
          const key = [top, realCard.tilt, size, shift.x, shift.z].map(v => v.toFixed(5)).join();
          if (realShow > .003 && key !== set.key) { set.key = key; threadCard(set, shift, realCard); }
        }
      }
      // The card's own field, a quarter turn behind the reader's.
      real.card.fade(dt);
      for (const set of real.card.sets()) {
        const amount = answer * physics * set.mix;
        set.mesh.visible = amount > .003;
        if (!set.mesh.visible) continue;
        set.uniforms.uAmount.value = amount;
        set.uniforms.uWave.value = behindWave;
        set.uniforms.uFlow.value += dt * 2.2 * behindWave;
        set.uniforms.uUnder.value = 0;
      }
    } else realShow = 0;

    // The reader's chip beats while it checks, and flashes as it reads each byte of the answer.
    const beat = .5 + .5 * Math.sin(t * Math.PI * 2 * 1.4);
    const readFlash = said && said.dir < 0 ? said.beat : 0;
    // Over the reader's chip, or the phone's.
    const chipAt = phone > .5 ? PHONE_CHIP : READER_CHIP, chipShift = phone > .5 ? phoneShift : padShift;
    think.position.set(chipAt.x + chipShift.x, chipAt.y, chipAt.z + .002 + chipShift.z);
    think.material.opacity = Math.min(.9, b.thinking * (.45 + .4 * beat) + b.read * .15 + readFlash * .8);
    think.scale.setScalar(.014 + .008 * b.thinking * beat + .01 * readFlash);
    think.visible = think.material.opacity > .004;

    // Current in the card: orange and one way round, into the chip, while it takes power in;
    // blue and the other way, out of the chip, while it answers. Orange and blue would mix
    // to purple, so the colour switches over quickly to whichever current is the stronger.
    const share = b.reply / Math.max(.001, b.reply + .5 * Math.max(b.receive, b.power));
    // `way`: +1 into the chip, -1 out of it; it turns over with the colour.
    const tint = smoothstep(.4, .6, share), way = 1 - 2 * tint;
    const sent = b.reply * (.45 + .55 * load);
    // Round the same way as the copper's comets under it, and back the other way as the
    // reader takes the answer in. As fast as its current is strong (the lab's reader power).
    for (const [band, share, shift] of [[readerBand, padShare, padShift], [phoneBand, phoneShare, phoneShift]]) {
      band.mesh.position.set(shift.x, 0, shift.z);
      band.uniforms.uAmount.value = talk.reader * share;
      band.uniforms.uPhase.value += dt * 1.5 * (1 - 2 * talk.reading) * (b.readerPace ?? 1);
      band.uniforms.uColor.value.copy(WARM).lerp(COOL, talk.reading);
      band.mesh.visible = talk.reader * share > .003;
    }
    // The light runs as fast as the current is strong (the lab: a weak current crawls); the
    // card's answer always runs at its own pace.
    const pace = lerp(b.cardPace ?? 1, 1, tint);
    const flows = [[coilBand, Math.max(b.receive * amp, sent), 1.4, .05],
      [moduleBand, Math.max(b.power * amp, b.receive * .6 * amp, sent), 1.3, .08],
      ...wires.map(wire => [wire, Math.max(b.power * amp, sent), 1.6, .3])];
    for (const [{ mesh, uniforms }, amount, speed, base] of flows) {
      uniforms.uAmount.value = amount;
      uniforms.uBase.value = base;
      uniforms.uPhase.value += dt * speed * way * pace;
      uniforms.uColor.value.copy(WARM).lerp(COOL, tint);
      mesh.visible = amount > .003;
    }

    // The chip glows while it has power, beats while it works out its answer, and flashes
    // as it reads each byte of the question.
    const work = b.blink * (.5 + .5 * Math.sin(t * Math.PI * 2 * 1.8)) ** 2;
    const flash = said && said.dir > 0 ? said.beat : 0;
    die.material.opacity = Math.min(.95, b.power * .5 * amp + work * .8 + flash * .8);
    die.scale.setScalar(.0075 + .013 * work + .002 * b.power + .008 * flash);
    die.visible = die.material.opacity > .004;
  }

  // The lab's reach: a dashed outline of the card, lying as the card lies, at the farthest height
  // the chip still wakes (`b.reachZ`, from lab-model.js `reachOf`), so you can see where the
  // reader's power runs out, and the card go past it.
  const reachGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 121 }, (_, i) => {
    const [x, y] = rectPoint(.0428, .027, .0032, i / 120);
    return new THREE.Vector3(x, y, 0);
  }));
  const reachLine = new THREE.Line(reachGeometry, new THREE.LineDashedMaterial({
    color: 0xf4f1ea, dashSize: .003, gapSize: .002, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  reachLine.computeLineDistances();
  reachLine.renderOrder = 10;
  reachLine.frustumCulled = false;
  reachLine.rotation.z = HOVER.spin;
  table.add(reachLine);

  const baseUpdate = update;
  function updateAll(b, cardZ, talk) {
    baseUpdate(b, cardZ, talk);
    // Through a swap of readers it fades out over the first quarter and back in over the last, at
    // the new reader's reach (it used to vanish for the whole swap, then pop back in one frame).
    const across = Math.min(1, Math.abs((b.phone || 0) - .5) * 2);
    const show = (b.reachShow || 0) * THREE.MathUtils.smoothstep(across, .5, 1);
    reachLine.visible = show > .01;
    if (!reachLine.visible) return;
    // As far over the coil as the card's coil can be and still wake it.
    reachLine.position.set(HOVER.x, HOVER.y, COIL_Z + (b.reachZ || 0));
    reachLine.scale.setScalar(b.tagScale ?? 1);
    // Light on the dark close-up, ink on the paper (the lab keeps the lights up).
    reachLine.material.color.setHex(b.dark > .5 ? 0xf4f1ea : 0x0d0d0c);
    reachLine.material.opacity = (b.dark > .5 ? .55 : .45) * show;
  }

  // Real physics: how many of the reader's field lines pass through the card's coil, of how many,
  // and how far that is shown (0 until the card lies over the reader with the switch on).
  const realInfo = () => ({ through: realSet?.through ?? 0, total: realSet?.list.length ?? 0, show: realShow });
  return { table, onCard, update: updateAll, WARM, COOL, reach: () => reachLine.position, real: realInfo };
}
