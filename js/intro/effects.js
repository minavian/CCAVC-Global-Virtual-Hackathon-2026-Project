// What the close-up shows moving between the reader and the card (see cinema.js). It has
// one simple picture language, so each step adds one thing you can follow:
// - Electricity is golden light running along a wire: round one loop on each coil (its
//   outer turn), and on the card from its coil into the chip.
// - The magnetic field is rings that leave one coil in its shape and arrive at the other in
//   that one's shape. Orange rings rise from the reader to the card: the reader's field,
//   which powers the card and carries the question. Blue rings come down from the card to
//   the reader: the answer.
// - The chips glow while they have power or work, and flash as they read each byte.
// The rings live in the reader's frame; the wires and the chip's glow live in the card's
// frame, so they move with it. Units are metres.
// The page behind is light while the card is dragged, so nothing here adds light: every
// mark is a saturated colour laid over the scene with ordinary blending, which reads on
// paper as well as on the dark close-up.
import * as THREE from 'three';
import { squarePoint, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP } from './reader-model.js';
import { HOVER } from './cinema.js';

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
// turn: one ring of the field (a thin bright core, and a wide faint halo round it).
const RING_HALF = COIL_HALF - .002;
function ringGeometry(band) {
  const outer = new THREE.Shape(), inner = new THREE.Path();
  const steps = 160, half = RING_HALF + band / 2, radius = COIL_RADIUS - .002 + band / 2;
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
// on the axis of a loop of radius R it falls as (R² / (R² + z²))^1.5.
const R2 = .035 ** 2;
const fieldAt = z => (R2 / (R2 + z * z)) ** 1.5;
const blendShape = (a, b, k, out) => {
  for (const key of ['x', 'y', 'sx', 'sy', 'spin']) out[key] = lerp(a[key], b[key], k);
  return out;
};

export function buildEffects() {
  const table = new THREE.Group();   // in the reader's frame
  const onCard = new THREE.Group();  // in the card's frame
  const glow = glowTexture();

  // The field's rings: enough of each to fill the gap. Each is a core and a halo.
  const core = ringGeometry(.0013), halo = ringGeometry(.0055);
  const makeRings = color => Array.from({ length: Math.ceil(CROSS / EVERY) + 1 }, () => {
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
  const up = makeRings(UP_COLOR), down = makeRings(COOL);
  const landing = { ...AT_CARD }, cardShape = { ...AT_CARD };
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
  function update(b, cardZ, talk = { amp: 1, load: 0, reader: 0, reading: 0 }) {
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
    cardShape.sy = AT_CARD.sy * Math.max(.05, Math.cos(b.tilt || 0));
    const to = blendShape(SPREAD, cardShape, smoothstep(0, 1, b.dock), landing);
    const top = cardZ + .00034;
    // In the lab the rings fade as they rise, as the field does with height, and a metal
    // plate behind the card soaks up what would reach it.
    const falloff = b.falloff || 0, soak = (b.metal || 0) * (b.shield || 0);
    // (The metal's share is taken away over the upper half of the climb, so the rings visibly
    // die out before they reach the plate.)
    const upFade = (p, z) => lerp(1, fieldAt(z - COIL_Z), falloff) * (1 - soak * smoothstep(.15, .7, p));
    // The card's answer is a change in the field near its coil, weaker by the reader.
    const downFade = (p, z) => lerp(1, fieldAt(top - z), falloff * .7);
    // On the light page, while the card is still in the hand, the rings are lighter.
    const paper = 1 - (b.dark || 0), halo = b.dark || 0;
    stream(up, t, b.field * (said?.dir > 0 ? .12 + .88 * amp : 1) * (1 - .5 * paper), AT_READER, to, COIL_Z + .0004, top, halo, upFade);
    // Down: the answer, from the card's coil to the reader's. It swells each time the card
    // closes its switch.
    // (Once the answer has landed, full strength: then only a still frame, with reduced
    // motion, still shows it; blended over the landing, so nothing jumps.)
    stream(down, t, b.reply * (b.answerScale ?? 1) * (said?.dir < 0 ? lerp(.35 + .65 * load, 1, said.landed) : 1), cardShape, AT_READER, top, COIL_Z + .0004, halo, downFade);

    // The reader's chip beats while it checks, and flashes as it reads each byte of the answer.
    const beat = .5 + .5 * Math.sin(t * Math.PI * 2 * 1.4);
    const readFlash = said && said.dir < 0 ? said.beat : 0;
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
    readerBand.uniforms.uAmount.value = talk.reader;
    // Round the same way as the copper's comets under it, and back the other way as the
    // reader takes the answer in.
    readerBand.uniforms.uPhase.value += dt * 1.5 * (1 - 2 * talk.reading);
    readerBand.uniforms.uColor.value.copy(WARM).lerp(COOL, talk.reading);
    readerBand.mesh.visible = talk.reader > .003;
    const flows = [[coilBand, Math.max(b.receive * amp, sent), 1.4, .05],
      [moduleBand, Math.max(b.power * amp, b.receive * .6 * amp, sent), 1.3, .08],
      ...wires.map(wire => [wire, Math.max(b.power * amp, sent), 1.6, .3])];
    for (const [{ mesh, uniforms }, amount, speed, base] of flows) {
      uniforms.uAmount.value = amount;
      uniforms.uBase.value = base;
      uniforms.uPhase.value += dt * speed * way;
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

  return { table, onCard, update, WARM, COOL };
}
