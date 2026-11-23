// The magnetic field in the conversation (steps 4 and 5 of the close-up), drawn from the
// physics rather than as a picture of data flying across.
//
// - The reader's coil carries a 13.56 MHz current. Its magnetic field fills the gap and
//   passes through the card's coil: that is how the card gets its power and hears the
//   reader. The lines here are the field lines of the reader's five-turn coil, traced from
//   the Biot–Savart law for its real shape, and each is brightest where the field is
//   strongest.
// - The field flips direction 13.56 million times a second, far too fast to see, so the
//   lines show how strong it is, not which way it points.
// - The reader speaks by switching its field off for 2.36 µs at a time (cinema.js, from
//   `millerPauses` in js/rfid/iso14443a.js). Every line goes dark at once: the gap is 15 mm
//   and the wavelength is 22 m, so the field changes everywhere at the same moment.
//   Nothing travels from one coil to the other.
// - The card answers by switching a load across its coil (`manchesterSwitch`). That changes
//   the current in its coil, and so the small field its own coil makes, which reaches back
//   through the reader's coil. Those lines are traced from the card's coil the same way.
// Everything is in the reader's frame (metres), with the card lying where cinema.js docks it.
import * as THREE from 'three';
import { COIL_Z, COIL_HALF, COIL_RADIUS, TOP } from './reader-size.js';
import { squarePoint } from './reader-model.js';
import { rectPoint } from './effects.js';
import { HOVER, TALK_GAP } from './cinema.js';

const WARM = new THREE.Color('#ff8a3d');   // the reader's field
const COOL = new THREE.Color('#5aa7ff');   // the card's answer
// Light added over the dark, with the canvas's own transparency left as it is, so nothing
// here can darken the page while the lights fade.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const CARD_Z = TOP + TALK_GAP + .0004 + .00034;   // the card's copper, over the reader
const SOFT = .0005 ** 2;                          // a wire's thickness, so the sum stays finite on it
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// A point on the card lying over the reader, in the reader's frame.
function onCard(x, y) {
  const c = Math.cos(HOVER.spin), s = Math.sin(HOVER.spin);
  return [HOVER.x + x * c - y * s, HOVER.y + x * s + y * c];
}

// A wire, cut into short straight pieces for the Biot–Savart sum: each piece's middle and
// its length as a vector, six numbers a piece.
function wire(loops) {
  const out = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      out.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
  }
  return new Float64Array(out);
}

// The reader's coil: five turns wound as a rounded square (reader-model.js winds the same
// turns as one spiral; as five closed turns the field is the same to within a line's width).
const READER_WIRE = wire(Array.from({ length: 5 }, (_, k) => {
  const s = (k + .5) / 5;
  return Array.from({ length: 72 }, (_, i) => [...squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, i / 72), COIL_Z]);
}));
// The card's coil: four turns round the card's edge, as the model's copper runs (effects.js
// traces the same rectangle).
const CARD_WIRE = wire(Array.from({ length: 4 }, (_, k) => Array.from({ length: 96 }, (_, i) => {
  const [x, y] = rectPoint(.0402 - k * .0008, .024 - k * .0008, .0028, i / 96);
  return [...onCard(x - .0003, y), CARD_Z];
})));

// The Biot–Savart law: each piece of wire adds dl × r / |r|³ to the field at a point. The
// constant and the current only scale the field, and a field line follows its direction,
// so they are left out. `out` gets the field and the distance to the nearest piece of wire.
function fieldAt(pieces, x, y, z, out) {
  let bx = 0, by = 0, bz = 0, near = Infinity;
  for (let i = 0; i < pieces.length; i += 6) {
    const rx = x - pieces[i], ry = y - pieces[i + 1], rz = z - pieces[i + 2];
    const r2 = rx * rx + ry * ry + rz * rz;
    if (r2 < near) near = r2;
    const k = 1 / ((r2 + SOFT) * Math.sqrt(r2 + SOFT));
    const dx = pieces[i + 3], dy = pieces[i + 4], dz = pieces[i + 5];
    bx += (dy * rz - dz * ry) * k;
    by += (dz * rx - dx * rz) * k;
    bz += (dx * ry - dy * rx) * k;
  }
  out[0] = bx; out[1] = by; out[2] = bz; out[3] = Math.sqrt(near);
  return out;
}

// One field line through `seed`: small steps along the field's direction (Runge–Kutta,
// fourth order), shorter near the wire where the line bends hardest, until it comes back
// round to where it started. A line that leaves the box is traced the other way from the
// seed too, and the two halves joined. Returns the points and where the seed sits along them.
function traceLine(pieces, seed) {
  const f = new Float64Array(4), k = [0, 1, 2, 3].map(() => new Float64Array(3));
  const along = (x, y, z, out) => {
    fieldAt(pieces, x, y, z, f);
    const m = Math.hypot(f[0], f[1], f[2]) || 1;
    out[0] = f[0] / m; out[1] = f[1] / m; out[2] = f[2] / m;
  };
  const walk = sign => {
    const points = [seed.slice()];
    let [x, y, z] = seed;
    for (let n = 0; n < 4000; n++) {
      along(x, y, z, k[0]);
      const h = sign * clamp(f[3] * .16, .00022, .0022);   // f[3]: how near the wire this point is
      along(x + k[0][0] * h / 2, y + k[0][1] * h / 2, z + k[0][2] * h / 2, k[1]);
      along(x + k[1][0] * h / 2, y + k[1][1] * h / 2, z + k[1][2] * h / 2, k[2]);
      along(x + k[2][0] * h, y + k[2][1] * h, z + k[2][2] * h, k[3]);
      x += h / 6 * (k[0][0] + 2 * k[1][0] + 2 * k[2][0] + k[3][0]);
      y += h / 6 * (k[0][1] + 2 * k[1][1] + 2 * k[2][1] + k[3][1]);
      z += h / 6 * (k[0][2] + 2 * k[1][2] + 2 * k[2][2] + k[3][2]);
      points.push([x, y, z]);
      if (n > 30 && Math.hypot(x - seed[0], y - seed[1], z - seed[2]) < Math.abs(h) * 1.5) return { points, closed: true };
      if (Math.abs(x) > .25 || Math.abs(y) > .25 || Math.abs(z - COIL_Z) > .25) return { points, closed: false };
    }
    return { points, closed: false };
  };
  const forward = walk(1);
  if (forward.closed) return { points: forward.points, closed: true, seedAt: 0 };
  const back = walk(-1).points.reverse();
  return { points: [...back, ...forward.points.slice(1)], closed: false, seedAt: back.length - 1 };
}

// Seeds for the lines, in the plane of a coil and inside it: `toward` gives the directions
// out from the coil's middle, `reach` how far its turns are in each, `shares` how far in.
function seeds(center, toward, reach, shares, z) {
  const out = [];
  toward.forEach((angle, i) => {
    for (const share of shares) {
      for (const side of [1, -1]) {
        out.push([center[0] + side * Math.cos(angle) * reach[i] * share, center[1] + side * Math.sin(angle) * reach[i] * share, z]);
      }
    }
  });
  return out;
}

// Each line becomes a thin tube. Along it, every ring of the tube knows how strong the field
// is there (on a log scale, against the other lines of the same coil), whether it is inside
// or under the reader, and how far it is along the line from its seed (for drawing it in).
function tubes(pieces, lines, { radius, segments }) {
  const f = new Float64Array(4), all = [];
  const built = lines.map(({ points, closed, seedAt }) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, closed);
    const rings = segments + 1, strength = new Float32Array(rings), hidden = new Float32Array(rings), from = new Float32Array(rings);
    const total = points.length - 1, seedShare = seedAt / Math.max(1, total), length = curve.getLength();
    const p = new THREE.Vector3();
    for (let j = 0; j < rings; j++) {
      const u = j / segments;
      curve.getPointAt(Math.min(u, 1), p);
      fieldAt(pieces, p.x, p.y, p.z, f);
      strength[j] = Math.log(Math.hypot(f[0], f[1], f[2]));
      all.push(strength[j]);
      // Inside the reader's body or under it, the field is still there (plastic and glass
      // don't stop it), but it is drawn faintly, so the space between the coils stands out.
      hidden[j] = 1 - THREE.MathUtils.smoothstep(p.z, TOP - .003, TOP);
      from[j] = closed ? Math.min(u, 1 - u) * 2 : Math.abs(u - seedShare) / Math.max(seedShare, 1 - seedShare);
    }
    return { geometry, strength, hidden, from, length };
  });
  // The field's strength, from faint (the weakest 4%) to full (the strongest 2%).
  all.sort((a, b) => a - b);
  const lo = all[Math.floor(all.length * .04)], hi = all[Math.floor(all.length * .98)];
  return built.map(({ geometry, strength, hidden, from, length }) => {
    const count = geometry.attributes.position.count, perRing = count / strength.length;
    const s = new Float32Array(count), h = new Float32Array(count), r = new Float32Array(count), d = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const j = Math.min(strength.length - 1, Math.floor(v / perRing));
      s[v] = clamp((strength[j] - lo) / (hi - lo), 0, 1);
      h[v] = hidden[j];
      r[v] = from[j];
      d[v] = j / (strength.length - 1) * length;   // metres along the line, the way the field points
    }
    geometry.setAttribute('aStrength', new THREE.BufferAttribute(s, 1));
    geometry.setAttribute('aHidden', new THREE.BufferAttribute(h, 1));
    geometry.setAttribute('aFrom', new THREE.BufferAttribute(r, 1));
    geometry.setAttribute('aDist', new THREE.BufferAttribute(d, 1));
    return geometry;
  });
}

// The field's direction: soft comets of light glide round each line the way the field
// points (`uDir`), with a long tail behind each, one every `uSpacing` metres. `uFlow` moves
// them; it only advances while the field is on, so they slow in each gap.
function lineMaterial(color, floor, { dir = 1, glow = .65 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uAmount: { value: 0 }, uReveal: { value: 0 }, uFloor: { value: floor },
      uFlow: { value: 0 }, uDir: { value: dir }, uSpacing: { value: .011 }, uGlow: { value: glow } },
    vertexShader: `attribute float aStrength; attribute float aHidden; attribute float aFrom; attribute float aDist;
      uniform float uAmount; uniform float uReveal; uniform float uFloor;
      varying float vAlpha; varying float vDist;
      void main() {
        // Drawn in from the seed both ways as the field comes up, then held.
        float shown = 1. - smoothstep(uReveal - .12, uReveal, aFrom);
        vAlpha = uAmount * mix(uFloor, 1., pow(aStrength, .85)) * (1. - .86 * aHidden) * shown;
        vDist = aDist;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uFlow; uniform float uDir; uniform float uSpacing; uniform float uGlow;
      varying float vAlpha; varying float vDist;
      void main() {
        float k = fract(uDir * vDist / uSpacing - uFlow);
        float comet = pow(k, 3.) * (1. - smoothstep(.9, 1., k));
        gl_FragColor = vec4(uColor + vec3(.35) * comet, vAlpha * ((1. - uGlow) + uGlow * comet));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, ...ADD,
  });
}

export function buildField() {
  const group = new THREE.Group();
  group.visible = false;
  // Few lines, so the field reads at a glance: the reader's in two planes at right angles
  // through its middle, turned so the camera never sees one edge-on, two lines each side;
  // the card's along its length and across it, one each side. Any seed gives a true field
  // line; these are chosen so the lines sit round the copper and stay in the frame.
  const readerLines = seeds([0, 0], [Math.PI / 8, 5 * Math.PI / 8], [.0278, .0278], [.66, .86], COIL_Z)   // .0278: the inner turn
    .map(seed => traceLine(READER_WIRE, seed));
  const [cx, cy] = onCard(-.0003, 0);
  const cardLines = seeds([cx, cy], [HOVER.spin, HOVER.spin + Math.PI / 2], [.0394, .0232], [.66], CARD_Z)
    .map(seed => traceLine(CARD_WIRE, seed));

  // The reader's current is drawn running clockwise seen from above (river.js, the coil's
  // copper), and READER_WIRE is wound the other way, so its lines run backwards (right-hand
  // rule: down through the reader's coil, up round the outside). The card's current is drawn
  // the other way round its coil, opposing the reader's (Lenz's law), as CARD_WIRE is wound.
  const reader = lineMaterial(WARM, .1, { dir: -1 }), halo = lineMaterial(WARM, .1, { dir: -1, glow: .4 });
  const card = lineMaterial(COOL, .14, { dir: 1 });
  const add = (geometry, material, order) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  for (const geometry of tubes(READER_WIRE, readerLines, { radius: .00016, segments: 260 })) add(geometry, reader, 7);
  // A soft glow round the reader's lines: the same lines, wider and faint.
  for (const geometry of tubes(READER_WIRE, readerLines, { radius: .00075, segments: 130 })) add(geometry, halo, 6);
  for (const geometry of tubes(CARD_WIRE, cardLines, { radius: .00014, segments: 220 })) add(geometry, card, 8);

  // Every frame. `lines`: how much the reader's field shows (a level, so it draws in and
  // fades out smoothly). `amp`: the reader's field right now (0 in a pause). `echo`: how
  // much the card's own field shows in the answer, and `load`: the card's switch right now.
  // `flow`: how far the field has run (it advances while the field is on, cinema.js).
  function update({ lines = 0, amp = 1, echo = 0, load = 0, flow = 0 }) {
    group.visible = lines > .003 || echo > .003;
    if (!group.visible) return;
    const reveal = 1.15 * THREE.MathUtils.smoothstep(lines, .04, .96);
    // While the card answers, the reader's lines step back so the card's stand out; each time
    // the card's switch closes they dip a little, as the reader's coil feels it.
    const strength = lines * amp * (1 - .4 * echo) * (1 - .12 * load * echo);
    reader.uniforms.uAmount.value = strength;
    halo.uniforms.uAmount.value = strength * .16;
    reader.uniforms.uReveal.value = halo.uniforms.uReveal.value = reveal;
    card.uniforms.uAmount.value = echo * (.08 + .72 * load);
    card.uniforms.uReveal.value = 1.15 * THREE.MathUtils.smoothstep(echo, .04, .96);
    reader.uniforms.uFlow.value = halo.uniforms.uFlow.value = card.uniforms.uFlow.value = flow * 5;
  }

  return { group, update };
}
