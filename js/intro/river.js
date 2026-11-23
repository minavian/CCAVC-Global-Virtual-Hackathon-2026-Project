// The conversation between the reader and the card, drawn as light (the `ask` and `answer`
// steps in cinema.js). A message goes chip, coil, coil, chip, in three legs (cinema.js
// `LEGS`), and the answer comes back the same way:
// - the reader's side: out of the reader's chip, along its wire into its coil, and half
//   way round the coil (the side facing the camera), on the coil's own copper;
// - the gap: a braided river from the side of the reader's coil, out round the card's
//   edge, onto the side of the card's coil;
// - the card's side: once round the card's big coil, then round the small coil about the
//   chip module and along its wire into the card's chip.
// Three layers, all in the reader's frame (metres):
// - threads: fine lines along the way, a twisted cable on each coil and a wide braid across
//   the gap, lit where the message is;
// - drops: specks of light flowing along the threads, packed where the message is;
// - bits: the message's real bits, 0s and 1s in single file, with a glow at its front and
//   a flash where it lands.
// The lights are down while it shows, so all of it is drawn as added light.
import * as THREE from 'three';
import { COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP } from './reader-size.js';
import { squarePoint } from './reader-model.js';
import { rectPoint } from './effects.js';
import { HOVER, LEG } from './cinema.js';

const LANES = 28, CABLE = 7, DROPS = 2000, BITS = 48;
const SAMPLES = { reader: 110, gap: 120, card: 190 };
const WARM = new THREE.Color('#ff7d1f'), COOL = new THREE.Color('#4a93ff'), GHOST = new THREE.Color('#ffd9b0');
const TAU = Math.PI * 2;
// Light added over whatever is behind (the dark, or the page while the lights fade), with
// the canvas's own transparency left as it is, so nothing here can darken the page.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const smooth = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The same random numbers on every visit, so the river always has the same shape.
function random(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// A point on the card lying over the reader (cinema.js HOVER), in the reader's frame.
function onCard(x, y, z) {
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  return V(HOVER.x + x * c - y * s, HOVER.y + x * s + y * c, z);
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
const READER_END = coilAt(.9);
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

// One thread across the gap, from the side of the reader's coil to the side of the card's.
// `u` is its place along the side (-1 to 1), `h` which turn of each coil it meets. The
// threads bow out round the card's edge so the crossing can be seen.
function gapThread(u, h, cardZ) {
  const gap = cardZ - COIL_Z, middle = 1 - Math.abs(u);
  return smoothLine([
    V(-.0355 + .011 * h, u * .026, COIL_Z),
    V(-.054 - .004 * middle, u * .028, COIL_Z + .36 * gap),
    V(-.0555 - .004 * middle, u * .025, COIL_Z + .84 * gap),
    onCard(-.0405 + .0035 * h, u * .021, cardZ - .0003),
  ], SAMPLES.gap - 1);
}
// The middle of the river, from where the reader's side ends to where the card's begins.
function gapMiddle(cardZ) {
  const gap = cardZ - COIL_Z;
  return smoothLine([
    V(READER_END[0], READER_END[1], COIL_Z),
    V(-.059, 0, COIL_Z + .36 * gap),
    V(-.0595, 0, COIL_Z + .84 * gap),
    onCard(-.0402, 0, cardZ + .00034),
  ], SAMPLES.gap - 1);
}

// The card's side: once round the big coil from the middle of its left side, then over to
// the small coil round the chip module, once round that, and along its wire into the chip.
// The shapes are the traces effects.js draws over the card's copper.
function cardWay(cardZ) {
  const z = cardZ + .00034, points = [];
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
  const readerCable = Array.from({ length: CABLE }, (_, k) => addThread('reader', { k }));
  const lanes = Array.from({ length: LANES }, (_, k) => addThread('gap', {
    u: (k / (LANES - 1)) * 2 - 1 + (rand() - .5) * .05, h: rand(), phase: rand() * TAU }));
  const cardCable = Array.from({ length: CABLE }, (_, k) => addThread('card', { k }));
  // The way the bits ride: the middle of each leg.
  const spine = { reader: new Float32Array(SAMPLES.reader * 3), gap: new Float32Array(SAMPLES.gap * 3), card: new Float32Array(SAMPLES.card * 3) };
  const fill = (array, points) => points.forEach((p, i) => array.set([p.x, p.y, p.z], i * 3));

  const readerLine = readerWay();
  fill(spine.reader, readerLine);
  readerCable.forEach(thread => fill(thread.points, cable(readerLine, thread.k, .00062, 26)));

  // The gap and the card's side move with the card, so they are rebuilt when its height changes.
  let builtFor = NaN;
  function build(cardZ) {
    if (Math.abs(cardZ - builtFor) < 2e-5) return false;
    builtFor = cardZ;
    for (const lane of lanes) {
      gapThread(lane.u, lane.h, cardZ).forEach((p, i) => {
        // The threads braid: each weaves across the river and a little up and down.
        const s = i / (SAMPLES.gap - 1), swell = Math.sin(Math.PI * s) ** .7, a = s * TAU * 1.7 + lane.phase;
        lane.points.set([p.x + Math.cos(a) * .0006 * swell, p.y + Math.sin(a) * .0016 * swell, p.z + Math.cos(a * 1.3) * .0005 * swell], i * 3);
      });
    }
    fill(spine.gap, gapMiddle(cardZ));
    const cardLine = cardWay(cardZ);
    fill(spine.card, cardLine);
    cardCable.forEach(thread => fill(thread.points, cable(cardLine, thread.k, .00055, 40)));
    return true;
  }

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
  const threadPosition = new THREE.BufferAttribute(new Float32Array(segments * 6), 3);
  const wayAttr = new Float32Array(segments * 2), seedAttr = new Float32Array(segments * 2);
  {
    let n = 0;
    for (const t of threads) {
      for (let i = 0; i < t.count - 1; i++, n += 2) {
        wayAttr[n] = t.from + (t.to - t.from) * i / (t.count - 1);
        wayAttr[n + 1] = t.from + (t.to - t.from) * (i + 1) / (t.count - 1);
        seedAttr[n] = seedAttr[n + 1] = t.seed;
      }
    }
  }
  threadGeometry.setAttribute('position', threadPosition);
  threadGeometry.setAttribute('along', new THREE.BufferAttribute(wayAttr, 1));
  threadGeometry.setAttribute('seed', new THREE.BufferAttribute(seedAttr, 1));
  const writeThreads = () => {
    const array = threadPosition.array;
    let n = 0;
    for (const t of threads) {
      for (let i = 0; i < t.count - 1; i++, n += 6) array.set(t.points.subarray(i * 3, i * 3 + 6), n);
    }
    threadPosition.needsUpdate = true;
  };
  const threadUniforms = {
    uColor: { value: WARM.clone() }, uGhost: { value: GHOST.clone() }, uHead: { value: 0 }, uTail: { value: 0 },
    uAmount: { value: 0 }, uLit: { value: 0 }, uTime: { value: 0 }, uDir: { value: 1 },
  };
  const threadLines = new THREE.LineSegments(threadGeometry, new THREE.ShaderMaterial({
    uniforms: threadUniforms,
    vertexShader: `attribute float along; attribute float seed; varying float vAlong; varying float vSeed;
      void main() { vAlong = along; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uGhost; uniform float uHead; uniform float uTail; uniform float uAmount;
      uniform float uLit; uniform float uTime; uniform float uDir; varying float vAlong; varying float vSeed;
      void main() {
        float s = uDir > 0. ? vAlong : 1. - vAlong;          // how far from the sender
        float lit = uLit * smoothstep(uTail - .06, uTail, s) * (1. - smoothstep(uHead, uHead + .006, s));
        float front = lit * smoothstep(uHead - .07, uHead, s);
        float pulse = pow(fract(s * 14. - uTime * 1.9 + vSeed), 7.);
        float ends = smoothstep(0., .015, vAlong) * smoothstep(1., .985, vAlong);
        vec3 color = mix(uGhost * .55, uColor, lit) + vec3(1.) * front * .5;
        float alpha = uAmount * ends * (.13 + .16 * pulse + lit * (.3 + .5 * pulse) + front * .7);
        gl_FragColor = vec4(color, clamp(alpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  threadLines.renderOrder = 12;
  threadLines.frustumCulled = false;
  group.add(threadLines);

  // The drops: specks flowing along the threads, all the time, thick where the message is.
  // Most are in the gap, where the river is widest.
  const pick = () => {
    const r = rand();
    return r < .26 ? readerCable[Math.floor(rand() * CABLE)] : r < .72 ? lanes[Math.floor(rand() * LANES)] : cardCable[Math.floor(rand() * CABLE)];
  };
  const drops = Array.from({ length: DROPS }, () => ({
    thread: pick(), offset: rand(), speed: .85 + rand() * .4, lift: (rand() - .5) * .0011, size: .00042 + rand() ** 3 * .0009,
  }));
  const dropGeometry = new THREE.BufferGeometry();
  const dropPosition = new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const dropAlpha = new THREE.BufferAttribute(new Float32Array(DROPS), 1).setUsage(THREE.DynamicDrawUsage);
  dropGeometry.setAttribute('position', dropPosition);
  dropGeometry.setAttribute('alpha', dropAlpha);
  dropGeometry.setAttribute('size', new THREE.BufferAttribute(Float32Array.from(drops, d => d.size), 1));
  const dropUniforms = { uColor: { value: WARM.clone() }, uPixels: { value: 800 } };
  const dropPoints = new THREE.Points(dropGeometry, new THREE.ShaderMaterial({
    uniforms: dropUniforms,
    vertexShader: `attribute float alpha; attribute float size; uniform float uPixels; varying float vAlpha;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * view;
        // The speck's size in metres, as pixels at its distance (works for both lenses).
        float pixels = size * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1] * uPixels * .5 / gl_Position.w;
        gl_PointSize = clamp(pixels, 1.5, 48.);
        vAlpha = alpha * min(1., pixels / 2.5);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.;
        float glow = exp(-r * r * 3.5), core = exp(-r * r * 22.);
        vec3 color = mix(uColor, vec3(1.), core * .7);
        gl_FragColor = vec4(color, clamp((glow * .75 + core) * vAlpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  dropPoints.renderOrder = 13;
  dropPoints.frustumCulled = false;
  group.add(dropPoints);

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

  const point = new THREE.Vector3();
  // Where the message's front is (for the label riding on it), and the middle of its bits
  // (for the camera to follow, which keeps steady while the bits go round a coil).
  const head = new THREE.Vector3(), focus = new THREE.Vector3();
  let showing = false, written = false;

  // `amount`: the river as a whole (0 to 1). `message`: what is flowing (cinema.js
  // `message`), or nothing, when the way only glows faintly, waiting. `clock`: seconds.
  // `pixels`: the canvas's height in device pixels.
  function update({ amount, message, clock, cardZ, pixels }) {
    group.visible = amount > .003;
    showing = group.visible && Boolean(message) && message.head > .003 && message.head < 1.02;
    if (!group.visible) return;
    if (build(cardZ) || !written) {
      writeThreads();
      written = true;
    }
    const dir = message?.dir ?? 1;
    const color = dir > 0 ? WARM : COOL;
    const headAt = message ? message.head : 0, tailAt = message ? message.tail : 0;
    const lit = message ? 1 - message.landed : 0;
    const way = s => (dir > 0 ? s : 1 - s);   // from how far from the sender, to where along the way

    threadUniforms.uColor.value.copy(color);
    threadUniforms.uHead.value = headAt;
    threadUniforms.uTail.value = tailAt;
    threadUniforms.uAmount.value = amount;
    threadUniforms.uLit.value = lit;
    threadUniforms.uTime.value = clock;
    threadUniforms.uDir.value = dir;

    // Drops flow from the sender, a little faster than the message, so the front stays packed.
    // Each runs along its own thread at the speed the message runs on that leg.
    dropUniforms.uColor.value.copy(color);
    dropUniforms.uPixels.value = pixels;
    const position = dropPosition.array, alpha = dropAlpha.array;
    drops.forEach((drop, i) => {
      const t = drop.thread, span = t.to - t.from;
      const p = (((drop.offset + dir * clock * .36 * drop.speed / span) % 1) + 1) % 1;
      along(t.points, t.count, p, point);
      const w = t.from + span * p, s = dir > 0 ? w : 1 - w;
      position[i * 3] = point.x;
      position[i * 3 + 1] = point.y;
      position[i * 3 + 2] = point.z + (t.leg === 'gap' ? drop.lift * Math.sin(Math.PI * p) : 0);
      const inMessage = lit * smooth(tailAt - .05, tailAt, s) * (1 - smooth(headAt, headAt + .008, s));
      const ends = smooth(0, .012, w) * smooth(1, .988, w);
      alpha[i] = amount * ends * (.1 + inMessage * (.75 + .6 * smooth(headAt - .06, headAt, s)));
    });
    dropPosition.needsUpdate = dropAlpha.needsUpdate = true;

    // The bits, in the order they are sent. Across the gap they spread over the river.
    const sent = message?.bits ?? [];
    let seen = 0;
    focus.set(0, 0, 0);
    bits.forEach((sprite, j) => {
      const s = j < sent.length ? headAt - .012 - j * message.spacing : -1;
      sprite.visible = s > 0 && s < 1;
      if (!sprite.visible) return;
      const w = way(s), leg = legAt(w);
      if (leg === 'gap') along(lanes[(LANES >> 1) + ((j % 5) - 2) * 2].points, SAMPLES.gap, share('gap', w), sprite.position);
      else wayPoint(w, sprite.position);
      sprite.position.z += (leg === 'gap' ? .0011 : .0005) * Math.sin(j * 1.9 + clock * 2);
      sprite.material.map = digits[dir][sent[j]];
      sprite.material.opacity = amount * smooth(0, .012, s) * (1 - smooth(.988, 1, s));
      sprite.scale.setScalar(.0031 * (1 + .25 * smooth(.97, 1, s)));
      focus.add(sprite.position);
      seen++;
    });

    // A glow at the front, and a flash at the far chip while the bits arrive.
    wayPoint(way(Math.min(1, headAt)), front.position);
    front.material.color.copy(color);
    front.material.opacity = message ? amount * smooth(0, .01, headAt) * (1 - smooth(1, 1.01, headAt)) * .95 : 0;
    front.scale.setScalar(.008);
    wayPoint(way(1), flash.position);
    flash.material.color.copy(color);
    const arriving = message ? smooth(.99, 1, headAt) * (1 - message.landed) : 0;
    flash.material.opacity = amount * arriving * (.7 + .3 * Math.sin(clock * 22));
    flash.scale.setScalar(.011 + .006 * arriving);
    head.copy(front.position);
    if (seen) focus.divideScalar(seen); else focus.copy(front.position);
  }

  return { group, update, head, focus, showing: () => showing };
}
