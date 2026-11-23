// The power the reader sends the card, drawn as a river of light (the `ask` and `answer`
// steps in cinema.js), along the path it really takes: out of the reader's chip, up its wire
// and round every turn of its coil; across the gap, through the field the coils share; round
// every turn of the card's coil, through the small loop to the chip module, and into the
// card's chip. While the reader's field is on, power flows along all of it, all the time.
//
// The message is a change in that flow, and it happens everywhere at once, as in life (the
// whole path is a few centimetres; the 13.56 MHz wave is 22 m long):
// - the reader's question: in each of its gaps (cinema.js `message`, `amp` 0) the flow stops
//   everywhere together, and starts again;
// - the card's answer: each time the card closes its load switch (`load` 1), it draws more
//   from the field, and the whole flow swells, in blue.
// The speed the specks move at is only a picture of the flow (power has no speed to show);
// they stop when it stops. The receiving chip pulses as it reads each bit, and the card's
// chip glows while it works out its answer.
// Everything is in the reader's frame (metres). The lights are down while it shows, so it
// is all drawn as added light.
import * as THREE from 'three';
import { TOP, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP as READER_CHIP, squarePoint } from './reader-size.js';
import { rectPoint } from './effects.js';
import { HOVER, TALK_GAP } from './cinema.js';

const CABLE = 3, SPECKS = 1300, AIR = 420;
const SAMPLES = { reader: 700, card: 700 };   // points along each side's wire
// The way, from the reader's chip (0) to the card's (1): the reader's wire and coil, the gap,
// the card's coil and wire. Only for drawing the flow.
const WAY = { reader: [0, .42], gap: [.42, .58], card: [.58, 1] };
const FLOW = 2.6;   // seconds for a speck to go the whole way while power flows
const WARM = new THREE.Color('#ff7d1f'), COOL = new THREE.Color('#4a93ff');
const TAU = Math.PI * 2;
// Light added over whatever is behind, with the canvas's own transparency left as it is, so
// nothing here can darken the page.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
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
// turns of the coil the way reader-model.js winds it, from the inner end out.
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

// Across the gap: from the reader's coil up to the card's, `q` of the way, `f` round the coil.
// It leaves in the reader coil's shape and arrives in the card coil's.
function airPoint(q, f, out) {
  const [rx, ry] = squarePoint(COIL_HALF - .006, COIL_RADIUS - .003, f);
  const [cx, cy] = rectPoint(.0392, .0232, .0028, f);
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  const kx = HOVER.x + (cx - .0003) * c - cy * s, ky = HOVER.y + (cx - .0003) * s + cy * c;
  const e = q * q * (3 - 2 * q), bulge = 1 + Math.sin(Math.PI * q) * .08;
  return out.set((rx + (kx - rx) * e) * bulge, (ry + (ky - ry) * e) * bulge, COIL_Z + (CARD_Z - COIL_Z) * q);
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

export function buildRiver() {
  const group = new THREE.Group();
  group.visible = false;
  const rand = random(1356);

  // The wires: a twisted cable on each side, every point knowing how far along the way it is.
  const readerLine = readerWay(), cardLine = cardWay();
  const flat = line => { const array = new Float32Array(line.length * 3); line.forEach((p, i) => array.set([p.x, p.y, p.z], i * 3)); return array; };
  const spine = { reader: flat(readerLine), card: flat(cardLine) };
  const threads = [];
  for (const [leg, line, radius, twist] of [['reader', readerLine, .0004, 160], ['card', cardLine, .00038, 170]]) {
    for (let k = 0; k < CABLE; k++) threads.push({ leg, line: cable(line, k, radius, twist), seed: rand() });
  }
  function along(array, count, p, out) {
    const x = Math.min(1, Math.max(0, p)) * (count - 1), i = Math.min(count - 2, Math.floor(x)), f = x - i;
    return out.set(array[i * 3] + (array[i * 3 + 3] - array[i * 3]) * f, array[i * 3 + 1] + (array[i * 3 + 4] - array[i * 3 + 1]) * f,
      array[i * 3 + 2] + (array[i * 3 + 5] - array[i * 3 + 2]) * f);
  }

  const segments = threads.reduce((sum, t) => sum + t.line.length - 1, 0);
  const position = new Float32Array(segments * 6), wayAttr = new Float32Array(segments * 2), seedAttr = new Float32Array(segments * 2);
  {
    let n = 0, v = 0;
    for (const t of threads) {
      const [from, to] = WAY[t.leg], count = t.line.length;
      for (let i = 0; i < count - 1; i++, n += 2, v += 6) {
        const a = t.line[i], b = t.line[i + 1];
        position.set([a.x, a.y, a.z, b.x, b.y, b.z], v);
        wayAttr[n] = from + (to - from) * i / (count - 1);
        wayAttr[n + 1] = from + (to - from) * (i + 1) / (count - 1);
        seedAttr[n] = seedAttr[n + 1] = t.seed;
      }
    }
  }
  const threadGeometry = new THREE.BufferGeometry();
  threadGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  threadGeometry.setAttribute('along', new THREE.BufferAttribute(wayAttr, 1));
  threadGeometry.setAttribute('seed', new THREE.BufferAttribute(seedAttr, 1));
  const threadUniforms = {
    uWarm: { value: WARM.clone() }, uCool: { value: COOL.clone() }, uAmount: { value: 0 }, uPower: { value: 1 },
    uBlue: { value: 0 }, uPhase: { value: 0 },
  };
  const threadLines = new THREE.LineSegments(threadGeometry, new THREE.ShaderMaterial({
    uniforms: threadUniforms,
    vertexShader: `attribute float along; attribute float seed; varying float vAlong; varying float vSeed;
      void main() { vAlong = along; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uWarm; uniform vec3 uCool; uniform float uAmount; uniform float uPower; uniform float uBlue; uniform float uPhase;
      varying float vAlong; varying float vSeed;
      void main() {
        float ends = smoothstep(0., .006, vAlong) * smoothstep(1., .994, vAlong);
        // Ripples that move only while power flows (uPhase stands still in a gap).
        float ripple = pow(fract(vAlong * 90. - uPhase * 90. + vSeed), 5.);
        float lit = uPower * (.3 + .7 * ripple);
        float a = (.05 + lit) * uAmount * ends;
        vec3 color = mix(uWarm, uCool, uBlue) + vec3(1.) * lit * .1;
        gl_FragColor = vec4(color, clamp(a, 0., 1.));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, ...ADD,
  }));
  threadLines.renderOrder = 12;
  threadLines.frustumCulled = false;
  group.add(threadLines);

  // Specks riding the flow: on the wires, and across the gap all the way round the coils.
  const specks = Array.from({ length: SPECKS + AIR }, (_, i) => {
    const air = i >= SPECKS;
    return { air, leg: air ? 'gap' : rand() < .5 ? 'reader' : 'card', offset: rand(), around: rand(),
      size: .00035 + rand() ** 3 * .0007, lift: (rand() - .5) * .0016, speed: .9 + rand() * .2 };
  });
  const speckGeometry = new THREE.BufferGeometry();
  const speckPosition = new THREE.BufferAttribute(new Float32Array(specks.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const speckAlpha = new THREE.BufferAttribute(new Float32Array(specks.length), 1).setUsage(THREE.DynamicDrawUsage);
  speckGeometry.setAttribute('position', speckPosition);
  speckGeometry.setAttribute('alpha', speckAlpha);
  speckGeometry.setAttribute('size', new THREE.BufferAttribute(Float32Array.from(specks, d => d.size), 1));
  const speckUniforms = { uColor: { value: WARM.clone() }, uPixels: { value: 800 } };
  const speckPoints = new THREE.Points(speckGeometry, new THREE.ShaderMaterial({
    uniforms: speckUniforms,
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
  speckPoints.renderOrder = 13;
  speckPoints.frustumCulled = false;
  group.add(speckPoints);

  // The chips: a pulse as the receiving chip reads each bit, and the card's chip at work.
  const glow = glowTexture();
  const makeGlow = color => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, opacity: 0, ...ADD }));
    sprite.renderOrder = 14;
    group.add(sprite);
    return sprite;
  };
  const die = onCard(DIE[0], DIE[1], CARD_Z + .0006), readerChip = V(READER_CHIP.x, READER_CHIP.y, READER_CHIP.z + .0016);
  const read = makeGlow(WARM.clone()), work = makeGlow(new THREE.Color('#ffd08a'));
  const orbit = Array.from({ length: 6 }, () => makeGlow(new THREE.Color('#ffe2b8')));

  const point = new THREE.Vector3(), focus = new THREE.Vector3();
  let phase = 0, last = null, color = new THREE.Color();

  // `amount`: the river as a whole (0 to 1). `amp`: the reader's field now (0 in a gap).
  // `load`: the card's switch now (1 closed). `answer`: how far the answer is under way (0
  // to 1). `reading`: where a bit is being read, { at: 'card' | 'reader', beat: 0 to 1 }.
  // `process`: how hard the card's chip is working. `clock`: seconds. `pixels`: the canvas's
  // height in device pixels.
  function update({ amount, amp = 1, load = 0, answer = 0, reading = null, process = 0, clock, pixels }) {
    group.visible = amount > .003;
    const dt = last === null ? 0 : Math.min(.1, Math.max(0, clock - last));
    last = clock;
    if (!group.visible) return;
    // Power flows while the field is on; the card draws more while its switch is closed.
    const power = amp * (1 + .45 * load * answer);
    phase += dt * amp / FLOW;
    const blue = load * answer;
    color.copy(WARM).lerp(COOL, blue);

    threadUniforms.uAmount.value = amount;
    threadUniforms.uPower.value = power * .7;
    threadUniforms.uBlue.value = blue;
    threadUniforms.uPhase.value = phase;

    speckUniforms.uColor.value.copy(color);
    speckUniforms.uPixels.value = pixels;
    const positions = speckPosition.array, alpha = speckAlpha.array;
    specks.forEach((speck, i) => {
      const [from, to] = WAY[speck.leg], span = to - from;
      const p = ((speck.offset + phase * speck.speed / span) % 1 + 1) % 1;
      if (speck.air) {
        airPoint(p, speck.around, point);
        point.z += speck.lift * Math.sin(Math.PI * p);
        alpha[i] = amount * power * Math.sin(Math.PI * p) * .6;
      } else {
        along(spine[speck.leg], SAMPLES[speck.leg], p, point);
        point.z += speck.lift * .25;
        alpha[i] = amount * power * .55;
      }
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    });
    speckPosition.needsUpdate = speckAlpha.needsUpdate = true;

    // The receiving chip reading a bit: a short flash at the end of each bit time.
    read.position.copy(reading?.at === 'reader' ? readerChip : die);
    read.material.color.copy(reading?.at === 'reader' ? COOL : WARM);
    read.material.opacity = reading ? amount * reading.beat * .9 : 0;
    read.scale.setScalar(.006 + .004 * (reading?.beat ?? 0));
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
    focus.copy(process > .5 ? die : point.set(0, 0, (COIL_Z + CARD_Z) / 2));
  }

  // How far the power has flowed (it stands still in a gap), for the field and the copper.
  return { group, update, focus, phase: () => phase };
}
