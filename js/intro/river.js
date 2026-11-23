// The conversation between the reader and the card, drawn as light (the `ask` and `answer`
// steps in cinema.js). A message goes chip, coil, radio waves, coil, chip (cinema.js `LEGS`),
// and the answer comes back the same way:
// - the reader's side: current runs out of the reader's chip, up its wire, and round every
//   turn of its coil, from the inner end out, on the coil's own copper;
// - the gap: the coil sends it out as radio waves, rings that rise from the reader's coil
//   and change shape on the way into the card's coil;
// - the card's side: current runs round every turn of the card's coil, from the outside in,
//   through the small loop that couples it to the chip module, round the module's coil and
//   along its wire into the card's chip.
// What runs is the real signal (cinema.js `message`): the reader's question is its field
// with its real gaps cut in; the card's answer is its load switching, in bursts. The bits
// ride their own stretch of it. Between the two, the card's chip works on the question.
// In life the trip takes no time at all (the gap is crossed in 50 picoseconds); here the
// trip is slowed far more than the bits, so you can follow each part of it.
// Everything is in the reader's frame (metres). The lights are down while it shows, so it
// is all drawn as added light.
import * as THREE from 'three';
import { TOP, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP, squarePoint } from './reader-size.js';
import { rectPoint, ringGeometry } from './effects.js';
import { HOVER, LEG, TALK_GAP } from './cinema.js';

const CABLE = 4, SPARKS = 1400, AIR = 520, BITS = 48, WAVES = 16;
const SAMPLES = { reader: 700, card: 700 };   // points along each side's wire
const WARM = new THREE.Color('#ff7d1f'), COOL = new THREE.Color('#4a93ff');
const TAU = Math.PI * 2;
// Light added over whatever is behind (the dark, or the page while the lights fade), with
// the canvas's own transparency left as it is, so nothing here can darken the page.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const smooth = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CARD_Z = TOP + TALK_GAP + .0004 + .00034;   // the card's copper, lying on the reader
const DIE = [-.0277, .0031];                       // the card's chip, on the card

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

// The reader's side: from its chip up the wire to the coil's inner end, then round all five
// turns of the coil the way reader-model.js winds it, from the inner end out to the outer.
function readerWay() {
  const lead = smoothLine([
    V(READER_CHIP.x, READER_CHIP.y, READER_CHIP.z + .0011),
    V(READER_CHIP.x + .0055, READER_CHIP.y + .0035, READER_CHIP.z + .0009),
    V(.0225, -.013, READER_CHIP.z + .0009),
    V(.0245, -.004, COIL_Z - .0012),
    V(.0245, 0, COIL_Z),
  ], 40);
  const coil = [];
  for (let i = 1; i <= 900; i++) {
    const s = 1 - i / 900;   // 1 at the inner end, 0 at the outer
    const [x, y] = squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, s * 5);
    coil.push(V(x, y, COIL_Z + .0002));
  }
  return resample([...lead, ...coil], SAMPLES.reader);
}

// The card's side: round all four turns of the card's coil from the outside in (on the traces
// effects.js draws over its copper), then through the small coupling loop to the chip module,
// once round the module's coil, and along its wire into the chip.
function cardWay() {
  const z = CARD_Z, points = [];
  for (let i = 0; i <= 800; i++) {
    const turn = i / 200;   // 0 to 4
    const [x, y] = rectPoint(.0402 - turn * .0008, .024 - turn * .0008, .0028, .5 + turn);
    points.push(onCard(-.0003 + x, y, z));
  }
  points.push(onCard(-.0375, .0018, z), onCard(-.0345, .003, z));
  for (let i = 0; i <= 60; i++) {
    const [x, y] = rectPoint(.006, .0054, .0012, .5 + i / 60);
    points.push(onCard(DIE[0] + x, DIE[1] + y, z));
  }
  for (const [x, y] of [[-.0322, .0042], [-.0306, .0041], [-.0294, .0038], DIE]) points.push(onCard(x, y, z + .00006));
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

// Where a radio wave is on its way across: `q` from 0 (the reader's coil) to 1 (the card's
// coil), `f` how far round it (as squarePoint). It starts in the reader coil's shape and
// lands in the card coil's.
function airPoint(q, f, out) {
  const [rx, ry] = squarePoint(COIL_HALF - .006, COIL_RADIUS - .003, f);
  const [cx, cy] = rectPoint(.0392, .0232, .0028, f);
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  const kx = HOVER.x + (cx - .0003) * c - cy * s, ky = HOVER.y + (cx - .0003) * s + cy * c;
  const e = q * q * (3 - 2 * q), bulge = Math.sin(Math.PI * q) * .1;
  return out.set((rx + (kx - rx) * e) * (1 + bulge), (ry + (ky - ry) * e) * (1 + bulge), COIL_Z + (CARD_Z - COIL_Z) * q);
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
// the wire can look up what the sender was doing when the current now there left it.
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

  // The wires: a twisted cable on each side, every point knowing how far along the whole way
  // it is (0 at the reader's chip, 1 at the card's).
  const readerLine = readerWay(), cardLine = cardWay();
  const flat = line => { const array = new Float32Array(line.length * 3); line.forEach((p, i) => array.set([p.x, p.y, p.z], i * 3)); return array; };
  const spine = { reader: flat(readerLine), card: flat(cardLine) };
  const threads = [];
  for (const [leg, line, radius, twist] of [['reader', readerLine, .0004, 160], ['card', cardLine, .00038, 170]]) {
    for (let k = 0; k < CABLE; k++) threads.push({ leg, from: LEG[leg][0], to: LEG[leg][1], line: cable(line, k, radius, twist), seed: rand() });
  }

  // A point `p` of the way along an array of points (0 at its start, 1 at its end).
  function along(array, count, p, out) {
    const x = Math.min(1, Math.max(0, p)) * (count - 1), i = Math.min(count - 2, Math.floor(x)), f = x - i;
    return out.set(array[i * 3] + (array[i * 3 + 3] - array[i * 3]) * f, array[i * 3 + 1] + (array[i * 3 + 4] - array[i * 3 + 1]) * f,
      array[i * 3 + 2] + (array[i * 3 + 5] - array[i * 3 + 2]) * f);
  }
  // Which leg a place along the whole way is on, and how far along that leg.
  const legAt = w => (w < LEG.gap[0] ? 'reader' : w < LEG.card[0] ? 'gap' : 'card');
  const share = (leg, w) => (w - LEG[leg][0]) / (LEG[leg][1] - LEG[leg][0]);
  const wirePoint = (w, out) => { const leg = legAt(w) === 'card' ? 'card' : 'reader'; return along(spine[leg], SAMPLES[leg], share(leg, w), out); };

  const segments = threads.reduce((sum, t) => sum + t.line.length - 1, 0);
  const threadGeometry = new THREE.BufferGeometry();
  const threadPosition = new Float32Array(segments * 6);
  const wayAttr = new Float32Array(segments * 2), seedAttr = new Float32Array(segments * 2);
  {
    let n = 0, v = 0;
    for (const t of threads) {
      const count = t.line.length;
      for (let i = 0; i < count - 1; i++, n += 2, v += 6) {
        const a = t.line[i], b = t.line[i + 1];
        threadPosition.set([a.x, a.y, a.z, b.x, b.y, b.z], v);
        wayAttr[n] = t.from + (t.to - t.from) * i / (count - 1);
        wayAttr[n + 1] = t.from + (t.to - t.from) * (i + 1) / (count - 1);
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
        float ends = smoothstep(0., .006, vAlong) * smoothstep(1., .994, vAlong);
        // How far from the sender, and what left the sender when the current here did.
        float s = uDir < 0. ? 1. - vAlong : vAlong;
        float n = uNow - s * uRun;
        float lit = uDir == 0. ? 0. : step(0., n) * step(n, uLength);
        float level = uDir > 0. ? signalAt(n, 1.) : signalAt(n, 0.);
        // Ripples running the way the current runs, at its speed.
        float ripple = pow(fract(s * 140. - uTime * uSpeed * 140. + vSeed), 5.);
        // The copper, faintly, while nothing runs; the current, bright, where the message is.
        float current = lit * level * (.45 + .55 * ripple) + lit * exp(-n / 10.) * .8;
        float a = (.05 + current) * uAmount * ends;
        vec3 color = mix(uWarm, uCool, step(uDir, -.5)) + vec3(1.) * current * .12;
        gl_FragColor = vec4(color, clamp(a, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  threadLines.renderOrder = 12;
  threadLines.frustumCulled = false;
  group.add(threadLines);

  // Sparks: specks riding with the current on the wires, and in the gap, rising (or in the
  // answer, falling) with the radio waves. They only show where the message is.
  const sparks = Array.from({ length: SPARKS + AIR }, (_, i) => {
    const air = i >= SPARKS, wire = air ? null : threads[Math.floor(rand() * threads.length)];
    return { air, wire, offset: rand(), around: rand(), size: .00035 + rand() ** 3 * .0007, jitter: (rand() - .5) * .0012 };
  });
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPosition = new THREE.BufferAttribute(new Float32Array(sparks.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sparkAlpha = new THREE.BufferAttribute(new Float32Array(sparks.length), 1).setUsage(THREE.DynamicDrawUsage);
  sparkGeometry.setAttribute('position', sparkPosition);
  sparkGeometry.setAttribute('alpha', sparkAlpha);
  sparkGeometry.setAttribute('size', new THREE.BufferAttribute(Float32Array.from(sparks, d => d.size), 1));
  const sparkUniforms = { uColor: { value: WARM.clone() }, uPixels: { value: 800 } };
  const sparkPoints = new THREE.Points(sparkGeometry, new THREE.ShaderMaterial({
    uniforms: sparkUniforms,
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
        gl_FragColor = vec4(mix(uColor, vec3(1.), core * .7), clamp((glow * .75 + core) * vAlpha, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  sparkPoints.renderOrder = 13;
  sparkPoints.frustumCulled = false;
  group.add(sparkPoints);

  // The radio waves: rings that leave one coil in its shape and arrive at the other in its.
  // Each is one slot of the signal, so it is dark where the reader made a gap, or lit where
  // the card's switch was closed.
  const ring = ringGeometry();
  const waves = Array.from({ length: WAVES }, () => {
    const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: WARM.clone(), transparent: true, opacity: 0, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...ADD }));
    mesh.renderOrder = 11;
    group.add(mesh);
    return mesh;
  });

  // The bits, the glows at the message's front and where it lands, and the card's chip at work.
  const digits = { 1: { 0: digitTexture('0', WARM), 1: digitTexture('1', WARM) }, [-1]: { 0: digitTexture('0', COOL), 1: digitTexture('1', COOL) } };
  const bits = Array.from({ length: BITS }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 }));
    sprite.renderOrder = 15;
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });
  const glow = glowTexture();
  const makeGlow = color => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, opacity: 0, ...ADD }));
    sprite.renderOrder = 14;
    group.add(sprite);
    return sprite;
  };
  const front = makeGlow(WARM.clone()), flash = makeGlow(WARM.clone());
  // The chip working: a glow that beats over the die and sparks circling it.
  const die = onCard(DIE[0], DIE[1], CARD_Z + .0006);
  const work = makeGlow(new THREE.Color('#ffd08a'));
  const orbit = Array.from({ length: 6 }, () => makeGlow(new THREE.Color('#ffe2b8')));

  const textures = new Map();
  const point = new THREE.Vector3();
  // Where the message's front is, and the middle of its bits on their way (for the camera).
  const head = new THREE.Vector3(), focus = new THREE.Vector3();
  let showing = false;

  // `amount`: the river as a whole (0 to 1). `message`: what is on its way (cinema.js
  // `message`), or nothing. `process`: how hard the card's chip is working (0 to 1).
  // `clock`: seconds. `pixels`: the canvas's height in device pixels. `run`: seconds for
  // the current to run the whole way (cinema.js), so everything moves together.
  function update({ amount, message, process = 0, clock, pixels, run }) {
    group.visible = amount > .003;
    const said = message?.started ? message : null;
    showing = group.visible && Boolean(said) && said.landed < 1;
    if (!group.visible) return;
    const dir = said ? said.dir : 0, color = dir < 0 ? COOL : WARM;
    if (said && !textures.has(said.name)) textures.set(said.name, signalTexture(said.signal));

    threadUniforms.uSignal.value = said ? textures.get(said.name) : blank;
    threadUniforms.uLength.value = said ? said.length : 1;
    threadUniforms.uNow.value = said ? said.n : 0;
    threadUniforms.uRun.value = said ? said.run : 1;
    threadUniforms.uDir.value = dir;
    threadUniforms.uAmount.value = amount;
    threadUniforms.uTime.value = clock;
    threadUniforms.uSpeed.value = 1 / run;

    // The message at a place along the way now: how strong (1 where the current or the wave
    // is on, 0 in a gap or between bursts), and 0 wherever the message isn't.
    const fromSender = w => (dir > 0 ? w : 1 - w);
    const here = w => {
      if (!said) return 0;
      const n = said.n - fromSender(w) * said.run;
      return n >= 0 && n < said.length ? said.levelAt(w) : 0;
    };

    sparkUniforms.uColor.value.copy(color);
    sparkUniforms.uPixels.value = pixels;
    const position = sparkPosition.array, alpha = sparkAlpha.array;
    const gapSpan = LEG.gap[1] - LEG.gap[0];
    sparks.forEach((spark, i) => {
      if (spark.air) {
        // Rising with the waves (falling in the answer), round the whole coil.
        const q = (((spark.offset + clock / (gapSpan * run) * (dir < 0 ? -1 : 1)) % 1) + 1) % 1;
        airPoint(q, spark.around, point);
        point.z += spark.jitter * Math.sin(Math.PI * q);
        alpha[i] = amount * here(LEG.gap[0] + q * gapSpan) * Math.sin(Math.PI * q) * .7;
      } else {
        // Riding with the current along the wire.
        const t = spark.wire, span = t.to - t.from;
        const p = (((spark.offset + (dir < 0 ? -1 : 1) * clock / run / span) % 1) + 1) % 1;
        along(spine[t.leg], SAMPLES[t.leg], p, point);
        point.z += spark.jitter * .3;
        alpha[i] = amount * here(t.from + span * p) * .75;
      }
      position[i * 3] = point.x;
      position[i * 3 + 1] = point.y;
      position[i * 3 + 2] = point.z;
    });
    sparkPosition.needsUpdate = sparkAlpha.needsUpdate = true;

    // The radio waves: ring j is `q` of the way across, carrying the slot of the signal that
    // left the sender when it did. Faint between messages: the reader's field powering the card.
    const slot = said ? gapSpan * said.run / WAVES : 1;
    const slotLevel = w => {
      let best = 0, worst = 1;
      for (let k = -2; k <= 2; k++) {
        const v = here(w + k * slot / 4 / said.run * (dir > 0 ? 1 : -1));
        best = Math.max(best, v); worst = Math.min(worst, v);
      }
      return dir > 0 ? (best > 0 ? worst : 0) : best;   // the question's ring is dark if a gap fell in it
    };
    const flow = clock / (gapSpan * run);
    waves.forEach((mesh, j) => {
      const step = (((flow + j / WAVES) % 1) + 1) % 1, q = dir < 0 ? 1 - step : step;
      const e = q * q * (3 - 2 * q), bulge = 1 + Math.sin(Math.PI * q) * .1;
      // In the reader coil's shape at the reader's coil, in the card coil's at the card's.
      mesh.position.set(HOVER.x * e, HOVER.y * e, COIL_Z + (CARD_Z - COIL_Z) * q);
      mesh.rotation.z = HOVER.spin * e;
      mesh.scale.set((1 + .2 * e) * bulge, (1 - .29 * e) * bulge, 1);
      const level = said ? slotLevel(LEG.gap[0] + q * gapSpan) : 0;
      const fade = Math.sin(Math.PI * step) ** .8;
      mesh.material.color.copy(color);
      mesh.material.opacity = amount * fade * (.035 + level * .5);
      mesh.visible = mesh.material.opacity > .003;
    });

    // The bits, each riding the stretch of signal that carries it (bit k is the frame's bit
    // time k + 1, the first being the start of frame): on the wires, then up (or down) with
    // the waves, spread round the coil.
    const sent = said ? said.bits : [];
    let seen = 0;
    focus.set(0, 0, 0);
    bits.forEach((sprite, j) => {
      const s = j < sent.length ? (said.n - (j + 1.5) * said.bit) / said.run : -1;
      sprite.visible = s > 0 && s < 1;
      if (!sprite.visible) return;
      const w = dir > 0 ? s : 1 - s, leg = legAt(w);
      if (leg === 'gap') airPoint(share('gap', w), (j * .382) % 1, sprite.position);
      else wirePoint(w, sprite.position);
      sprite.position.z += .0006 + .0003 * Math.sin(j * 1.9 + clock * 2);
      sprite.material.map = digits[dir][sent[j]];
      sprite.material.opacity = amount * smooth(0, .01, s) * (1 - smooth(.99, 1, s));
      sprite.scale.setScalar(.0027 * (1 + .25 * smooth(.97, 1, s)));
      focus.add(sprite.position);
      seen++;
    });

    // A glow at the front while it runs along a wire, and a flash at the far chip as it lands.
    const reach = said ? said.n / said.run : 0, frontW = fromSender(Math.min(1, Math.max(0, reach)));
    if (legAt(frontW) !== 'gap') wirePoint(frontW, front.position);
    front.material.color.copy(color);
    front.material.opacity = said && legAt(frontW) !== 'gap' ? amount * smooth(0, .01, reach) * (1 - smooth(1, 1.01, reach)) * .9 : 0;
    front.scale.setScalar(.006);
    wirePoint(fromSender(1), flash.position);
    flash.material.color.copy(color);
    const arriving = said ? smooth(.99, 1, reach) * (1 - said.landed) : 0;
    flash.material.opacity = amount * arriving * .85;
    flash.scale.setScalar(.01 + .006 * arriving);
    head.copy(front.position);
    if (seen) focus.divideScalar(seen); else focus.copy(said && dir < 0 ? die : front.position);

    // The card's chip at work: a beating glow over its die and six sparks circling it.
    const beat = .5 + .5 * Math.sin(clock * TAU * 2.2);
    work.position.copy(die);
    work.material.opacity = amount * process * (.45 + .4 * beat);
    work.scale.setScalar(.007 + .004 * process * beat);
    orbit.forEach((spark, k) => {
      const a = clock * 3.4 + k / orbit.length * TAU;
      spark.position.set(die.x + Math.cos(a) * .0042, die.y + Math.sin(a) * .0037, die.z + .0002 * Math.sin(a * 2));
      spark.material.opacity = amount * process * (.55 + .45 * Math.sin(clock * 9 + k));
      spark.scale.setScalar(.0016);
    });
  }

  return { group, update, head, focus, showing: () => showing };
}
