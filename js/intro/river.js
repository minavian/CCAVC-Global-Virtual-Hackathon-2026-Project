// The conversation between the reader and the card, drawn as light (the `ask` and `answer`
// steps in cinema.js). What flows is the real signal (cinema.js `message`), along the real
// way it takes, chip, coil, coil, chip, in three legs (cinema.js `LEGS`):
// - the reader's side: out of the reader's chip, along its wire into its coil, and half
//   way round the coil, on the coil's own copper;
// - the gap: the field the two coils share. Each thread is a real field line of the
//   reader's coil (biot.js): it rises from inside the reader's coil, through the card's
//   coil, and curls over the card's copper;
// - the card's side: once round the card's big coil, then round the small coil about the
//   chip module and along its wire into the card's chip.
// The reader's field is on all the time: it is the orange stream, and its ripples run from
// the reader to the card, carrying the card's power. The reader's question is that stream
// with its real gaps cut in. The card's answer is its load switching, blue bursts that run
// back the other way while the orange stream keeps flowing. Radio waves rise from the
// reader's coil with the same signal (a ring is missing where the reader made a gap), and
// in the answer come back down from the card's coil.
// In life all of this crosses the 15 mm gap in 50 picoseconds, a millionth of a bit; here
// the crossing is slowed far more than the bits, so you can follow the message across.
// Everything is in the reader's frame (metres). The lights are down while it shows, so it
// is all drawn as added light.
import * as THREE from 'three';
import { TOP, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP, squarePoint } from './reader-size.js';
import { rectPoint, ringGeometry } from './effects.js';
import { READER_WIRE, linkingStretch } from './biot.js';
import { HOVER, LEG, TALK_GAP } from './cinema.js';

const CABLE = 7, DROPS = 1500, ECHOES = 800, BITS = 48, RINGS = 10;
const SAMPLES = { reader: 110, gap: 80, card: 190 };
const WARM = new THREE.Color('#ff7d1f'), COOL = new THREE.Color('#4a93ff');
const TAU = Math.PI * 2;
// Light added over whatever is behind (the dark, or the page while the lights fade), with
// the canvas's own transparency left as it is, so nothing here can darken the page.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const smooth = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CARD_Z = TOP + TALK_GAP + .0004 + .00034;   // the card's copper, lying on the reader

// The same random numbers on every visit, so the river always has the same shape.
function random(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// A point on the card lying over the reader (cinema.js HOVER), in the reader's frame, and back.
function onCard(x, y, z) {
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  return V(HOVER.x + x * c - y * s, HOVER.y + x * s + y * c, z);
}
function cardLocal(x, y) {
  const dx = x - HOVER.x, dy = y - HOVER.y, c = Math.cos(-HOVER.spin), s = Math.sin(-HOVER.spin);
  return [dx * c - dy * s, dx * s + dy * c];
}

// A line through `points`, cut into `count` points evenly spaced along its length.
function resample(points, count) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths[lengths.length - 1], out = [];
  for (let k = 0, i = 1; k < count; k++) {
    const want = total * k / (count - 1);
    while (i < points.length - 1 && lengths[i] < want) i++;
    const f = (want - lengths[i - 1]) / Math.max(1e-9, lengths[i] - lengths[i - 1]);
    out.push(points[i - 1].clone().lerp(points[i], Math.min(1, Math.max(0, f))));
  }
  return out;
}
const smoothLine = (points, count) => new THREE.CatmullRomCurve3(points, false, 'centripetal').getSpacedPoints(count);

// The reader's side, from its chip: up the wire to the coil's inner end, then round the coil
// the way the wire is wound, outward, half a turn along the front to the middle of its left
// side. The coil is reader-model.js's: five turns from the outside in, its inner end on the right.
const coilAt = s => squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, s * 5);   // s: 0 outer end, 1 inner end
function readerWay() {
  const lead = smoothLine([
    V(READER_CHIP.x, READER_CHIP.y, READER_CHIP.z + .0011),
    V(READER_CHIP.x + .0055, READER_CHIP.y + .0035, READER_CHIP.z + .0009),
    V(.0225, -.013, READER_CHIP.z + .0009),
    V(.0245, -.004, COIL_Z - .0012),
    V(.0245, 0, COIL_Z),
  ], 40);
  const coil = [];
  for (let i = 1; i <= 90; i++) {
    const [x, y] = coilAt(1 - .1 * i / 90);
    coil.push(V(x, y, COIL_Z));
  }
  return resample([...lead, ...coil], SAMPLES.reader);
}

// The gap: real field lines of the reader's coil (biot.js) that rise through the card's coil
// and curl over the card's copper on its left side. Seeds sit just inside the reader's coil,
// along its left side, so the lines make one ribbon. Each joins the reader's copper at its
// start and the card's copper at its end with a few millimetres of curve.
function gapLines() {
  const cardWire = (x, y, z) => Math.hypot(cardLocal(x, y)[0] + .0003 + .0392, z - CARD_Z);
  const lines = [];
  for (const share of [.7, .73, .76, .79]) {
    for (const y of [-.0135, -.0081, -.0027, .0027, .0081, .0135]) {
      const found = linkingStretch(READER_WIRE, [-share * .02565, y, COIL_Z], CARD_Z, cardWire);
      if (!found || found.miss > .011) continue;
      const field = found.points.map(p => V(...p));
      const end = field[field.length - 1], wire = onCard(-.0392 - .0003, cardLocal(end.x, end.y)[1], CARD_Z);
      const start = V(-.0256, y * .9, COIL_Z);
      lines.push({ y, share, points: smoothLine([start, ...field.slice(1, -1), end, wire], SAMPLES.gap - 1) });
    }
  }
  return lines;
}

// The card's side: once round the big coil from the middle of its left side, then over to
// the small coil round the chip module, once round that, and along its wire into the chip.
// The shapes are the traces effects.js draws over the card's copper.
function cardWay() {
  const z = CARD_Z, points = [];
  for (let i = 0; i <= 150; i++) {
    const [x, y] = rectPoint(.0402, .024, .0028, .5 + i / 150);
    points.push(onCard(-.0003 + x, y, z));
  }
  points.push(onCard(-.0375, .0018, z), onCard(-.0345, .003, z));
  for (let i = 0; i <= 40; i++) {
    const [x, y] = rectPoint(.006, .0054, .0012, .5 + i / 40);
    points.push(onCard(-.0278 + x, .0031 + y, z));
  }
  for (const [x, y] of [[-.0322, .0042], [-.0306, .0041], [-.0294, .0038], [-.0277, .0031]]) points.push(onCard(x, y, z + .00006));
  return resample(points, SAMPLES.card);
}

// A twisted cable of threads round a line: each thread winds about it, a hair away.
function cable(line, k, radius, twist) {
  return line.map((p, i) => {
    const ahead = line[Math.min(line.length - 1, i + 1)], behind = line[Math.max(0, i - 1)];
    const tangent = ahead.clone().sub(behind).normalize();
    const side = Math.abs(tangent.z) > .9 ? V(1, 0, 0) : V(0, 0, 1);
    const normal = side.clone().cross(tangent).normalize(), binormal = tangent.clone().cross(normal);
    const a = k / CABLE * TAU + i / line.length * twist;
    return p.clone().addScaledVector(normal, Math.cos(a) * radius).addScaledVector(binormal, Math.sin(a) * radius);
  });
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.18, 'rgba(255,255,255,.55)');
  gradient.addColorStop(.5, 'rgba(255,255,255,.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// A bit, lit from inside: a white digit with a halo of the message's colour.
function digitTexture(digit, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.font = '700 80px "JetBrains Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#' + color.getHexString();
  g.shadowBlur = 26;
  g.fillStyle = '#' + color.getHexString();
  g.fillText(digit, 64, 68);
  g.shadowBlur = 8;
  g.fillStyle = '#fff';
  g.fillText(digit, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A message's signal as a texture the threads read (one texel a sample), so every point of
// every thread can look up what the sender was doing when the light now there left it.
function signalTexture(signal) {
  const data = new Uint8Array(signal.length * 4);
  for (let i = 0; i < signal.length; i++) data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, signal[i])) * 255);
  const texture = new THREE.DataTexture(data, signal.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function buildRiver() {
  const group = new THREE.Group();
  group.visible = false;
  const rand = random(1356);

  // Every thread: which leg it belongs to, how far along the way its ends are, and its points.
  const threads = [];
  const addThread = (leg, extra = {}) => {
    const thread = { leg, from: LEG[leg][0], to: LEG[leg][1], count: SAMPLES[leg], points: new Float32Array(SAMPLES[leg] * 3), seed: rand(), ...extra };
    threads.push(thread);
    return thread;
  };
  const fill = (array, points) => points.forEach((p, i) => array.set([p.x, p.y, p.z], i * 3));
  const readerLine = readerWay(), cardLine = cardWay(), gap = gapLines();
  const readerCable = Array.from({ length: CABLE }, (_, k) => addThread('reader', { k }));
  const lanes = gap.map(line => addThread('gap', { line }));
  const cardCable = Array.from({ length: CABLE }, (_, k) => addThread('card', { k }));
  readerCable.forEach(thread => fill(thread.points, cable(readerLine, thread.k, .00062, 26)));
  lanes.forEach(thread => fill(thread.points, thread.line.points));
  cardCable.forEach(thread => fill(thread.points, cable(cardLine, thread.k, .00055, 40)));
  // The way the bits ride: the middle of each leg (in the gap, the middle field line).
  const middle = lanes.reduce((best, lane) => (Math.abs(lane.line.y) + Math.abs(lane.line.share - .76) * .1
    < Math.abs(best.line.y) + Math.abs(best.line.share - .76) * .1 ? lane : best), lanes[0]);
  const spine = { reader: new Float32Array(SAMPLES.reader * 3), gap: middle.points, card: new Float32Array(SAMPLES.card * 3) };
  fill(spine.reader, readerLine);
  fill(spine.card, cardLine);

  // A point `p` of the way along an array of points (0 at its start, 1 at its end).
  function along(array, count, p, out) {
    const x = Math.min(1, Math.max(0, p)) * (count - 1), i = Math.min(count - 2, Math.floor(x)), f = x - i;
    return out.set(array[i * 3] + (array[i * 3 + 3] - array[i * 3]) * f, array[i * 3 + 1] + (array[i * 3 + 4] - array[i * 3 + 1]) * f,
      array[i * 3 + 2] + (array[i * 3 + 5] - array[i * 3 + 2]) * f);
  }
  // Which leg a place along the whole way (0 at the reader's chip, 1 at the card's) is on.
  const legAt = w => (w < LEG.gap[0] ? 'reader' : w < LEG.card[0] ? 'gap' : 'card');
  const share = (leg, w) => (w - LEG[leg][0]) / (LEG[leg][1] - LEG[leg][0]);
  function wayPoint(w, out) {
    const leg = legAt(w);
    return along(spine[leg], SAMPLES[leg], share(leg, w), out);
  }

  // The threads: one set of line segments, each knowing how far along the whole way it is.
  const segments = threads.reduce((sum, t) => sum + t.count - 1, 0);
  const threadGeometry = new THREE.BufferGeometry();
  const threadPosition = new Float32Array(segments * 6);
  const wayAttr = new Float32Array(segments * 2), seedAttr = new Float32Array(segments * 2);
  {
    let n = 0, v = 0;
    for (const t of threads) {
      for (let i = 0; i < t.count - 1; i++, n += 2, v += 6) {
        threadPosition.set(t.points.subarray(i * 3, i * 3 + 6), v);
        wayAttr[n] = t.from + (t.to - t.from) * i / (t.count - 1);
        wayAttr[n + 1] = t.from + (t.to - t.from) * (i + 1) / (t.count - 1);
        seedAttr[n] = seedAttr[n + 1] = t.seed;
      }
    }
  }
  threadGeometry.setAttribute('position', new THREE.BufferAttribute(threadPosition, 3));
  threadGeometry.setAttribute('along', new THREE.BufferAttribute(wayAttr, 1));
  threadGeometry.setAttribute('seed', new THREE.BufferAttribute(seedAttr, 1));
  const blank = signalTexture([1]);
  const threadUniforms = {
    uWarm: { value: WARM.clone() }, uCool: { value: COOL.clone() }, uSignal: { value: blank },
    uLength: { value: 1 }, uNow: { value: 0 }, uRun: { value: 1 }, uDir: { value: 0 },
    uAmount: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 1 },
  };
  const threadLines = new THREE.LineSegments(threadGeometry, new THREE.ShaderMaterial({
    uniforms: threadUniforms,
    vertexShader: `attribute float along; attribute float seed; varying float vAlong; varying float vSeed;
      void main() { vAlong = along; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uWarm; uniform vec3 uCool; uniform sampler2D uSignal; uniform float uLength;
      uniform float uNow; uniform float uRun; uniform float uDir; uniform float uAmount; uniform float uTime; uniform float uSpeed;
      varying float vAlong; varying float vSeed;
      // What the sender was doing n samples into its frame; idle before and after it.
      float signalAt(float n, float idle) {
        if (n < 0. || n >= uLength) return idle;
        return texture2D(uSignal, vec2((n + .5) / uLength, .5)).r;
      }
      void main() {
        float ends = smoothstep(0., .012, vAlong) * smoothstep(1., .988, vAlong);
        // Ripples running at the speed the light runs: toward the card for the reader's field...
        float toCard = pow(fract(vAlong * 18. - uTime * uSpeed * 18. + vSeed), 6.);
        float warm = .14 + .18 * toCard, cool = 0.;
        if (uDir > 0.) {
          // The question: what is here now left the reader's chip uRun samples per whole way ago.
          float n = uNow - vAlong * uRun;
          float lit = step(0., n) * step(n, uLength);
          warm = signalAt(n, 1.) * (warm + lit * (.3 + .5 * toCard)) + lit * exp(-n / 14.) * .9;
        } else if (uDir < 0.) {
          // The answer: the card's switch, from the card's chip back to the reader's; the
          // reader's field keeps flowing the other way.
          float s = 1. - vAlong, n = uNow - s * uRun;
          float lit = step(0., n) * step(n, uLength);
          float toReader = pow(fract(s * 18. - uTime * uSpeed * 18. + vSeed * 1.7), 6.);
          warm *= .65;
          cool = signalAt(n, 0.) * (.4 + .6 * toReader) + lit * exp(-n / 14.) * .7;
        }
        float a = (warm + cool) * uAmount * ends;
        vec3 color = (uWarm * warm + uCool * cool) / max(warm + cool, 1e-4) + vec3(1.) * cool * .15;
        gl_FragColor = vec4(color, clamp(a, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  threadLines.renderOrder = 12;
  threadLines.frustumCulled = false;
  group.add(threadLines);

  // The drops: specks riding the stream. Orange ones flow from the reader to the card all the
  // time (the field bringing power), gone where the reader makes a gap; blue ones flow back
  // from the card while it answers, only where its switch is closed. Most are in the gap.
  const pick = () => {
    const r = rand();
    return r < .26 ? readerCable[Math.floor(rand() * CABLE)] : r < .66 ? lanes[Math.floor(rand() * lanes.length)] : cardCable[Math.floor(rand() * CABLE)];
  };
  const drops = Array.from({ length: DROPS + ECHOES }, (_, i) => ({
    thread: pick(), offset: rand(), speed: .96 + rand() * .08, size: .0004 + rand() ** 3 * .0008, cool: i >= DROPS,
  }));
  const dropGeometry = new THREE.BufferGeometry();
  const dropPosition = new THREE.BufferAttribute(new Float32Array(drops.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const dropAlpha = new THREE.BufferAttribute(new Float32Array(drops.length), 1).setUsage(THREE.DynamicDrawUsage);
  dropGeometry.setAttribute('position', dropPosition);
  dropGeometry.setAttribute('alpha', dropAlpha);
  dropGeometry.setAttribute('size', new THREE.BufferAttribute(Float32Array.from(drops, d => d.size), 1));
  dropGeometry.setAttribute('cool', new THREE.BufferAttribute(Float32Array.from(drops, d => (d.cool ? 1 : 0)), 1));
  const dropUniforms = { uWarm: { value: WARM.clone() }, uCool: { value: COOL.clone() }, uPixels: { value: 800 } };
  const dropPoints = new THREE.Points(dropGeometry, new THREE.ShaderMaterial({
    uniforms: dropUniforms,
    vertexShader: `attribute float alpha; attribute float size; attribute float cool; uniform float uPixels;
      varying float vAlpha; varying float vCool;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * view;
        // The speck's size in metres, as pixels at its distance (works for both lenses).
        float pixels = size * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1] * uPixels * .5 / gl_Position.w;
        gl_PointSize = clamp(pixels, 1.5, 48.);
        vAlpha = alpha * min(1., pixels / 2.5);
        vCool = cool;
      }`,
    fragmentShader: `uniform vec3 uWarm; uniform vec3 uCool; varying float vAlpha; varying float vCool;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.;
        float glow = exp(-r * r * 3.5), core = exp(-r * r * 22.);
        vec3 color = mix(mix(uWarm, uCool, vCool), vec3(1.), core * .7);
        gl_FragColor = vec4(color, clamp((glow * .75 + core) * vAlpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  dropPoints.renderOrder = 13;
  dropPoints.frustumCulled = false;
  group.add(dropPoints);

  // Radio waves: rings in the reader coil's shape rising from it to the card and on past it,
  // and in the answer, rings coming down from the card's coil to the reader's. Each ring
  // carries the signal of the moment it left (`RINGS` of each in flight).
  const ring = ringGeometry();
  const makeRing = color => {
    const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...ADD }));
    mesh.renderOrder = 11;
    group.add(mesh);
    return mesh;
  };
  const rises = Array.from({ length: RINGS }, () => makeRing(WARM)), falls = Array.from({ length: RINGS }, () => makeRing(COOL));

  // The bits, and the glows at the message's front and where it lands.
  const digits = { 1: { 0: digitTexture('0', WARM), 1: digitTexture('1', WARM) }, [-1]: { 0: digitTexture('0', COOL), 1: digitTexture('1', COOL) } };
  const bits = Array.from({ length: BITS }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 }));
    sprite.renderOrder = 15;
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });
  const glow = glowTexture();
  const makeGlow = () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, opacity: 0, ...ADD }));
    sprite.renderOrder = 14;
    group.add(sprite);
    return sprite;
  };
  const front = makeGlow(), flash = makeGlow();

  const textures = new Map();
  const point = new THREE.Vector3();
  // Where the message's front is, and the middle of its bits on their way (for the camera
  // to follow, which keeps steady while the bits go round a coil).
  const head = new THREE.Vector3(), focus = new THREE.Vector3();
  let showing = false;

  // `amount`: the river as a whole (0 to 1). `message`: what is on the air (cinema.js
  // `message`), or nothing, when only the reader's field flows. `clock`: seconds.
  // `pixels`: the canvas's height in device pixels. `run`: seconds for light to run the
  // whole way (cinema.js), so the ripples, the drops and the message all move together.
  function update({ amount, message, clock, pixels, run }) {
    group.visible = amount > .003;
    const said = message?.started ? message : null;
    showing = group.visible && Boolean(said) && said.landed < 1;
    if (!group.visible) return;
    const dir = said ? said.dir : 0;
    if (said && !textures.has(said.name)) textures.set(said.name, signalTexture(said.signal));

    threadUniforms.uSignal.value = said ? textures.get(said.name) : blank;
    threadUniforms.uLength.value = said ? said.length : 1;
    threadUniforms.uNow.value = said ? said.n : 0;
    threadUniforms.uRun.value = said ? said.run : 1;
    threadUniforms.uDir.value = dir;
    threadUniforms.uAmount.value = amount;
    threadUniforms.uTime.value = clock;
    threadUniforms.uSpeed.value = 1 / run;

    // What the sender's signal is at a place along the way now, and whether the message is there.
    const at = w => (said ? said.levelAt(w) : 1);
    const inMessage = w => {
      if (!said) return 0;
      const n = said.n - (dir > 0 ? w : 1 - w) * said.run;
      return n >= 0 && n < said.length ? 1 : 0;
    };

    dropUniforms.uPixels.value = pixels;
    const position = dropPosition.array, alpha = dropAlpha.array;
    drops.forEach((drop, i) => {
      const t = drop.thread, span = t.to - t.from, way = drop.cool ? -1 : 1;
      const p = (((drop.offset + way * clock * drop.speed / run / span) % 1) + 1) % 1;
      along(t.points, t.count, p, point);
      position[i * 3] = point.x;
      position[i * 3 + 1] = point.y;
      position[i * 3 + 2] = point.z;
      const w = t.from + span * p, ends = smooth(0, .012, w) * smooth(1, .988, w);
      if (drop.cool) alpha[i] = dir < 0 ? amount * ends * at(w) * .95 : 0;
      else {
        const field = dir > 0 ? at(w) : 1, boost = dir > 0 ? inMessage(w) : 0;
        alpha[i] = amount * ends * field * ((dir < 0 ? .07 : .11) + boost * .6);
      }
    });
    dropPosition.needsUpdate = dropAlpha.needsUpdate = true;

    // The radio waves. A ring at height `q` (0 at the reader's coil, 1 at the card's) shows
    // the same moment as the river at that share of the gap: what left the sender then. The
    // reader's ring is dark if a gap fell in its slot; the card's lights if its switch closed.
    const gapSpan = LEG.gap[1] - LEG.gap[0], RISE = 1.3, slot = said ? gapSpan * said.run * RISE / RINGS : 1;
    const slotLevel = (w, idle, worst) => {
      if (!said) return idle;
      let level = worst ? 1 : 0;
      for (let k = -2; k <= 2; k++) {
        const v = said.levelAt(w + k * slot / 4 / said.run * (dir > 0 ? 1 : -1));
        level = worst ? Math.min(level, v) : Math.max(level, v);
      }
      return level;
    };
    const rise = clock / (gapSpan * run);
    rises.forEach((mesh, j) => {
      const q = (((rise / RISE + j / RINGS) % 1) + 1) % 1 * RISE;
      mesh.position.set(0, 0, COIL_Z + (CARD_Z - COIL_Z) * q);
      mesh.scale.setScalar(.92 + .2 * q);
      const level = dir > 0 ? slotLevel(LEG.gap[0] + Math.min(q, 1) * gapSpan, 1, true) : 1;
      mesh.material.opacity = amount * Math.sin(Math.PI * q / RISE) ** 2 * level * (dir < 0 ? .05 : .11);
      mesh.visible = mesh.material.opacity > .003;
    });
    falls.forEach((mesh, j) => {
      const q = (((rise / RISE + j / RINGS) % 1) + 1) % 1 * RISE, p = Math.min(q, 1);
      mesh.position.set(.002 * (1 - p), -.003 * (1 - p), CARD_Z - (CARD_Z - COIL_Z) * q);
      mesh.rotation.z = HOVER.spin * (1 - p);
      mesh.scale.set(1.13 - .13 * p, .7 + .3 * p, 1);
      const level = dir < 0 ? slotLevel(LEG.card[0] - p * gapSpan, 0, false) : 0;
      mesh.material.opacity = amount * Math.sin(Math.PI * q / RISE) ** 2 * level * .22;
      mesh.visible = mesh.material.opacity > .003;
    });

    // The bits, each riding the stretch of signal that carries it: bit k is the frame's bit
    // time k + 1 (the first is the start of frame), so it left the sender then.
    const sent = said ? said.bits : [];
    let seen = 0;
    focus.set(0, 0, 0);
    bits.forEach((sprite, j) => {
      const s = j < sent.length ? (said.n - (j + 1.5) * said.bit) / said.run : -1;
      sprite.visible = s > 0 && s < 1;
      if (!sprite.visible) return;
      const w = dir > 0 ? s : 1 - s, leg = legAt(w);
      if (leg === 'gap') along(lanes[(j * 7) % lanes.length].points, SAMPLES.gap, share('gap', w), sprite.position);
      else wayPoint(w, sprite.position);
      sprite.position.z += .0005 * Math.sin(j * 1.9 + clock * 2);
      sprite.material.map = digits[dir][sent[j]];
      sprite.material.opacity = amount * smooth(0, .015, s) * (1 - smooth(.985, 1, s));
      sprite.scale.setScalar(.0029 * (1 + .25 * smooth(.97, 1, s)));
      focus.add(sprite.position);
      seen++;
    });

    // A glow at the front, and a flash at the far chip while the message arrives.
    const reach = said ? said.n / said.run : 0;
    const way = s => (dir > 0 ? s : 1 - s);
    wayPoint(way(Math.min(1, Math.max(0, reach))), front.position);
    front.material.color.copy(dir < 0 ? COOL : WARM);
    front.material.opacity = said ? amount * smooth(0, .01, reach) * (1 - smooth(1, 1.01, reach)) * .9 : 0;
    front.scale.setScalar(.007);
    wayPoint(way(1), flash.position);
    flash.material.color.copy(dir < 0 ? COOL : WARM);
    const arriving = said ? smooth(.99, 1, reach) * (1 - said.landed) * (.5 + .5 * at(way(1))) : 0;
    flash.material.opacity = amount * arriving * .8;
    flash.scale.setScalar(.01 + .005 * arriving);
    head.copy(front.position);
    if (seen) focus.divideScalar(seen); else focus.copy(front.position);
  }

  return { group, update, head, focus, showing: () => showing };
}
