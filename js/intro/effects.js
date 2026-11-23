// What the close-up shows moving between the reader and the card (see cinema.js):
// - wave fronts rising from the reader's coil to the card (the reader's signal),
// - wave fronts going back down from the card's coil to the reader (the answer),
// - current running round the card's coils and along the chip's two wires into the chip,
//   and the chip's glow,
// - a glow on the reader's chip while it checks the answer.
// The waves live in the reader's frame; the wires and the chip's glow live in
// the card's frame, so they move with it. Units are metres.
// The page behind is light, so nothing here adds light: every mark is a saturated colour
// laid over the scene with ordinary blending, which reads on paper as well as on the dark reader.
import * as THREE from 'three';
import { squarePoint, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP } from './reader-model.js';

const WARM = new THREE.Color('#f26a0c');   // the reader's signal and the power it brings
const COOL = new THREE.Color('#1d6ee8');   // the card's answer
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

// A thin band in the shape of the reader's coil: one wave front.
function ringGeometry() {
  const outer = new THREE.Shape(), inner = new THREE.Path();
  const steps = 160, half = COIL_HALF - .002, radius = COIL_RADIUS - .002, band = .0013;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = squarePoint(half, radius, i / steps);
    if (i) outer.lineTo(x, y); else outer.moveTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = squarePoint(half - band, radius - band, i / steps);
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
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying float vAlong;
      void main() { vAlong = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAmount; uniform float uPhase; uniform float uCount;
      uniform float uDir; uniform float uBase; uniform float uFadeIn;
      varying float vAlong;
      void main() {
        float at = fract(uDir * vAlong * uCount - uPhase);
        float comet = pow(at, 1.7) * (1. - smoothstep(.94, 1., at));
        float alpha = uAmount * (uBase + (1. - uBase) * comet);
        if (uFadeIn > 0.) alpha *= smoothstep(0., uFadeIn, uDir > 0. ? vAlong : 1. - vAlong);
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function buildEffects() {
  const table = new THREE.Group();   // in the reader's frame
  const onCard = new THREE.Group();  // in the card's frame
  const glow = glowTexture();

  // Wave fronts: four going up (the signal) and four coming down (the answer).
  const ring = ringGeometry();
  const makeRings = color => Array.from({ length: 5 }, () => {
    const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    mesh.renderOrder = 5;
    table.add(mesh);
    return mesh;
  });
  const up = makeRings(WARM), down = makeRings(COOL);

  // The reader's chip, glowing while it checks the answer.
  const think = new THREE.Sprite(overlay(glow, COOL));
  think.position.copy(READER_CHIP).setZ(READER_CHIP.z + .002);
  think.renderOrder = 8;
  table.add(think);

  // The current in the card, drawn over its copper: round the big coil, round the chip
  // module's coil, and along the module's two wires into the chip (traced from the model).
  // Power runs one way round; the answer runs back the other way, in blue.
  const z = .00034;
  const coilBand = currentWire(loop([-.0003, 0], .0402, .024, .0028, z), { radius: .00048, closed: true, count: 5, base: .06 });
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
  // seconds, how high the card floats over the reader and how it is turned. In the
  // conversation `talk` has the reader's field right now (`amp`), the card's switch (`load`)
  // and how far the currents are shown steady rather than as comets (`steady`).
  function update(b, cardZ, spin, talk = { amp: 1, load: 0, steady: 0 }) {
    const any = b.field + b.reply + b.thinking + b.power + b.blink + b.read + b.receive;
    table.visible = onCard.visible = any > .003;
    if (!table.visible) return;
    const t = b.clock;

    // The reader's signal rises from its coil and spreads as it climbs to the card.
    up.forEach((mesh, i) => {
      const p = ((t * .5 + i / up.length) % 1 + 1) % 1;
      mesh.position.set(0, 0, COIL_Z + (cardZ - COIL_Z - .0012) * p);
      mesh.scale.setScalar(.92 + .22 * p);
      mesh.material.opacity = b.field * Math.sin(Math.PI * p) ** 1.5 * .92;
      mesh.visible = mesh.material.opacity > .004;
    });
    // The answer leaves in the card's shape and lands in the reader's.
    down.forEach((mesh, i) => {
      const p = ((t * .55 + i / down.length) % 1 + 1) % 1;
      mesh.position.set(.002 * (1 - p), -.003 * (1 - p), cardZ - .0012 - (cardZ - COIL_Z - .0012) * p);
      mesh.rotation.z = spin * (1 - p);
      mesh.scale.set(1.13 - .13 * p, .7 + .3 * p, 1);
      mesh.material.opacity = b.reply * Math.sin(Math.PI * p) ** 2 * .55;
      mesh.visible = mesh.material.opacity > .004;
    });

    // The reader's chip beats while it checks.
    const beat = .5 + .5 * Math.sin(t * Math.PI * 2 * 1.4);
    think.material.opacity = Math.min(.85, b.thinking * (.45 + .4 * beat) + b.read * .15);
    think.scale.setScalar(.014 + .008 * b.thinking * beat);
    think.visible = think.material.opacity > .004;

    // Current in the card: warm and one way round while it takes power in, blue and the
    // other way while it answers.
    // Orange and blue would mix to purple, so the colour switches over quickly to
    // whichever current is the stronger.
    const { amp, load, steady } = talk;
    const share = Math.max(load, b.reply / Math.max(.001, b.reply + Math.max(b.receive, b.power)));
    const answering = share > .5, tint = smoothstep(.4, .6, share);
    const into = steady ? amp : 1;   // in a gap no current flows from the coil to the chip
    const flows = [[coilBand, Math.max(b.receive * amp, b.reply, load * .9), 1.1, .06],
      [moduleBand, Math.max(b.power * into, b.receive * .6 * amp, b.reply, load * .9), 1.3, .08],
      ...wires.map(wire => [wire, Math.max(b.power * into, b.reply, load * .9), 1.6, .3])];
    for (const [{ mesh, uniforms }, amount, speed, base] of flows) {
      // Steady: an even glow, a little dimmer than a comet's head.
      uniforms.uAmount.value = amount * (1 - .4 * steady);
      uniforms.uBase.value = base + (1 - base) * steady;
      uniforms.uPhase.value = t * speed;
      uniforms.uDir.value = answering ? -1 : 1;
      uniforms.uColor.value.copy(WARM).lerp(COOL, tint);
      mesh.visible = amount > .003;
    }

    // The chip glows while it has power and beats while it works out its answer.
    const work = b.blink * (.5 + .5 * Math.sin(t * Math.PI * 2 * 1.8)) ** 2;
    die.material.opacity = Math.min(.9, b.power * .5 + work * .7);
    die.scale.setScalar(.0075 + .006 * work + .002 * b.power);
    die.visible = die.material.opacity > .004;
  }

  return { table, onCard, update, WARM, COOL };
}
