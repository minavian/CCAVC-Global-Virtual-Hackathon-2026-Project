// The conversation between the reader and the card, drawn as a river of light (the `ask`
// and `answer` steps in cinema.js). The river is the whole way a message travels: from the
// reader's chip, along its board to its coil, up across the gap round the card's edge,
// onto the card's coil and into the card's chip. The answer comes back the same way.
// Three layers, all in the reader's frame (metres):
// - threads: fine lines braided along the river, lit where the message is;
// - drops: specks of light flowing along the threads, packed where the message is;
// - bits: the message's real bits, 0s and 1s in single file, with a glow at its front and
//   a flash where it lands.
// The lights are down while it shows, so all of it is drawn as added light.
import * as THREE from 'three';
import { COIL_Z, CHIP as READER_CHIP } from './reader-size.js';
import { HOVER } from './cinema.js';

const LANES = 30, SAMPLES = 150, DROPS = 1800, BITS = 48;
const WARM = new THREE.Color('#ff7d1f'), COOL = new THREE.Color('#4a93ff'), GHOST = new THREE.Color('#ffd9b0');
const TAU = Math.PI * 2;
// Light added over whatever is behind (the dark, or the page while the lights fade), with
// the canvas's own transparency left as it is, so nothing here can darken the page.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const smooth = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

// The same random numbers on every visit, so the river always has the same shape.
function random(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// A point on the card lying over the reader (cinema.js HOVER), in the reader's frame.
function onCard(x, y, z) {
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  return new THREE.Vector3(HOVER.x + x * c - y * s, HOVER.y + x * s + y * c, z);
}

// One thread, from the reader's chip (0) to the card's chip (1). `u` is its place across
// the river (-1 to 1), `h` which turn of each coil it meets. The river is narrow at both
// chips and wide where it crosses between the coils, where it bows out round the card's edge.
function thread(u, h, cardZ) {
  const gap = cardZ - COIL_Z, middle = 1 - Math.abs(u);
  return [
    new THREE.Vector3(READER_CHIP.x - .003, READER_CHIP.y + .003, READER_CHIP.z + .0011),
    new THREE.Vector3(.004 + u * .002, -.011 + u * .004, -.0006),
    new THREE.Vector3(-.019, -.002 + u * .015, COIL_Z - .0005),
    new THREE.Vector3(-.0355 + .011 * h, u * .026, COIL_Z),                 // the reader's coil
    new THREE.Vector3(-.054 - .004 * middle, u * .028, COIL_Z + .36 * gap),
    new THREE.Vector3(-.0555 - .004 * middle, u * .025, COIL_Z + .84 * gap),
    onCard(-.0405 + .0035 * h, u * .021, cardZ - .0003),                     // the card's coil
    onCard(-.0345, .0031 + u * .0085, cardZ + .0001),
    onCard(-.0277, .0031, cardZ + .0004),                                    // the card's chip
  ];
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
  const lanes = Array.from({ length: LANES }, (_, k) => ({
    u: (k / (LANES - 1)) * 2 - 1 + (rand() - .5) * .05,
    h: rand(),
    phase: rand() * TAU,
    points: new Float32Array(SAMPLES * 3),
  }));
  const middle = lanes.length >> 1;

  // Where every thread runs. Rebuilt only when the card's height changes.
  let builtFor = NaN;
  function build(cardZ) {
    if (Math.abs(cardZ - builtFor) < 2e-5) return false;
    builtFor = cardZ;
    for (const lane of lanes) {
      const curve = new THREE.CatmullRomCurve3(thread(lane.u, lane.h, cardZ), false, 'centripetal');
      const spaced = curve.getSpacedPoints(SAMPLES - 1);
      spaced.forEach((p, i) => {
        // The threads braid: each weaves across the river and a little up and down.
        const s = i / (SAMPLES - 1), swell = Math.sin(Math.PI * s) ** .7, a = s * TAU * 1.7 + lane.phase;
        lane.points.set([p.x + Math.cos(a) * .0006 * swell, p.y + Math.sin(a) * .0016 * swell, p.z + Math.cos(a * 1.3) * .0005 * swell], i * 3);
      });
    }
    return true;
  }

  // A point `p` of the way along a thread (0 at the reader's chip, 1 at the card's).
  function at(lane, p, out) {
    const x = Math.min(1, Math.max(0, p)) * (SAMPLES - 1), i = Math.min(SAMPLES - 2, Math.floor(x)), f = x - i;
    const a = lane.points;
    return out.set(a[i * 3] + (a[i * 3 + 3] - a[i * 3]) * f, a[i * 3 + 1] + (a[i * 3 + 4] - a[i * 3 + 1]) * f,
      a[i * 3 + 2] + (a[i * 3 + 5] - a[i * 3 + 2]) * f);
  }

  // The threads: one set of line segments, each knowing how far along the river it is.
  const segments = LANES * (SAMPLES - 1);
  const threadGeometry = new THREE.BufferGeometry();
  const threadPosition = new THREE.BufferAttribute(new Float32Array(segments * 6), 3);
  const along = new Float32Array(segments * 2), seed = new Float32Array(segments * 2);
  lanes.forEach((lane, k) => {
    for (let i = 0; i < SAMPLES - 1; i++) {
      const n = (k * (SAMPLES - 1) + i) * 2;
      along[n] = i / (SAMPLES - 1);
      along[n + 1] = (i + 1) / (SAMPLES - 1);
      seed[n] = seed[n + 1] = lane.phase / TAU;
    }
  });
  threadGeometry.setAttribute('position', threadPosition);
  threadGeometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  threadGeometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const threadUniforms = {
    uColor: { value: WARM.clone() }, uGhost: { value: GHOST.clone() }, uHead: { value: 0 }, uTail: { value: 0 },
    uAmount: { value: 0 }, uLit: { value: 0 }, uTime: { value: 0 }, uDir: { value: 1 },
  };
  const threads = new THREE.LineSegments(threadGeometry, new THREE.ShaderMaterial({
    uniforms: threadUniforms,
    vertexShader: `attribute float along; attribute float seed; varying float vAlong; varying float vSeed;
      void main() { vAlong = along; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uGhost; uniform float uHead; uniform float uTail; uniform float uAmount;
      uniform float uLit; uniform float uTime; uniform float uDir; varying float vAlong; varying float vSeed;
      void main() {
        float s = uDir > 0. ? vAlong : 1. - vAlong;          // how far from the sender
        float lit = uLit * smoothstep(uTail - .14, uTail, s) * (1. - smoothstep(uHead, uHead + .012, s));
        float front = lit * smoothstep(uHead - .16, uHead, s);
        float pulse = pow(fract(s * 6. - uTime * 1.9 + vSeed), 7.);
        float ends = smoothstep(0., .04, vAlong) * smoothstep(1., .96, vAlong);
        vec3 color = mix(uGhost * .55, uColor, lit) + vec3(1.) * front * .5;
        float alpha = uAmount * ends * (.13 + .16 * pulse + lit * (.3 + .5 * pulse) + front * .7);
        gl_FragColor = vec4(color, clamp(alpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  threads.renderOrder = 12;
  threads.frustumCulled = false;
  group.add(threads);

  // The drops: specks flowing along the threads, all the time, thick where the message is.
  const drops = Array.from({ length: DROPS }, () => ({
    lane: lanes[Math.floor(rand() * LANES)], offset: rand(), speed: .8 + rand() * .45,
    lift: (rand() - .5) * .0011, size: .00045 + rand() ** 3 * .0009,
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
  // Where the message's front is, for the label that rides on it (card-scene.js anchor).
  const head = new THREE.Vector3();
  let showing = false;

  // `amount`: the river as a whole (0 to 1). `message`: what is flowing (cinema.js
  // `message`), or nothing, when the river only glows faintly, waiting. `clock`: seconds.
  // `pixels`: the canvas's height in device pixels.
  function update({ amount, message, clock, cardZ, pixels }) {
    group.visible = amount > .003;
    showing = group.visible && Boolean(message) && message.head > .005 && message.head < 1.04;
    if (!group.visible) return;
    if (build(cardZ)) {
      const array = threadPosition.array;
      lanes.forEach((lane, k) => {
        for (let i = 0; i < SAMPLES - 1; i++) {
          const n = (k * (SAMPLES - 1) + i) * 6;
          array.set(lane.points.subarray(i * 3, i * 3 + 6), n);
        }
      });
      threadPosition.needsUpdate = true;
    }
    const dir = message?.dir ?? 1;
    const color = dir > 0 ? WARM : COOL;
    const headAt = message ? message.head : 0, tailAt = message ? message.tail : 0;
    const lit = message ? 1 - message.landed : 0;
    const place = s => (dir > 0 ? s : 1 - s);   // how far from the sender, to where on the river

    threadUniforms.uColor.value.copy(color);
    threadUniforms.uHead.value = headAt;
    threadUniforms.uTail.value = tailAt;
    threadUniforms.uAmount.value = amount;
    threadUniforms.uLit.value = lit;
    threadUniforms.uTime.value = clock;
    threadUniforms.uDir.value = dir;

    // Drops flow from the sender, a little faster than the message, so the front stays packed.
    dropUniforms.uColor.value.copy(color);
    dropUniforms.uPixels.value = pixels;
    const position = dropPosition.array, alpha = dropAlpha.array;
    drops.forEach((drop, i) => {
      const s = (drop.offset + clock * .52 * drop.speed) % 1;
      at(drop.lane, place(s), point);
      position[i * 3] = point.x;
      position[i * 3 + 1] = point.y;
      position[i * 3 + 2] = point.z + drop.lift * Math.sin(Math.PI * s);
      const inMessage = lit * smooth(tailAt - .12, tailAt, s) * (1 - smooth(headAt, headAt + .015, s));
      const ends = smooth(0, .03, s) * smooth(1, .97, s);
      alpha[i] = amount * ends * (.11 + inMessage * (.75 + .6 * smooth(headAt - .12, headAt, s)));
    });
    dropPosition.needsUpdate = dropAlpha.needsUpdate = true;

    // The bits, in the order they are sent, along the middle of the river.
    const sent = message?.bits ?? [];
    bits.forEach((sprite, j) => {
      const s = j < sent.length ? headAt - .02 - j * message.spacing : -1;
      sprite.visible = s > 0 && s < 1;
      if (!sprite.visible) return;
      const lane = lanes[middle + ((j % 3) - 1) * 3];
      at(lane, place(s), sprite.position);
      sprite.position.z += .0011 * Math.sin(j * 1.9 + clock * 2);
      sprite.material.map = digits[dir][sent[j]];
      sprite.material.opacity = amount * smooth(0, .035, s) * (1 - smooth(.965, 1, s));
      sprite.scale.setScalar(.0034 * (1 + .25 * smooth(.9, 1, s)));
    });

    // A glow at the front, and a flash at the far chip while the bits arrive.
    const frontAt = Math.min(1, headAt);
    at(lanes[middle], place(frontAt), front.position);
    front.material.color.copy(color);
    front.material.opacity = message ? amount * smooth(0, .03, headAt) * (1 - smooth(1, 1.03, headAt)) * .95 : 0;
    front.scale.setScalar(.0085);
    at(lanes[middle], place(1), flash.position);
    flash.material.color.copy(color);
    const arriving = message ? smooth(.97, 1, headAt) * (1 - message.landed) : 0;
    flash.material.opacity = amount * arriving * (.7 + .3 * Math.sin(clock * 22));
    flash.scale.setScalar(.011 + .006 * arriving);
    head.copy(front.position);
  }

  return { group, update, head, showing: () => showing };
}
