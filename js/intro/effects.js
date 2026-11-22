// What the close-up shows moving between the reader and the card (see cinema.js):
// - field rings rising from the reader's coil to the card (the reader's signal),
// - reply rings and bits going back down from the card's coil to the reader,
// - electric sparks from the card's big coil across to the chip, and the chip's glow,
// - a glow on the reader's chip while it checks the answer.
// The rings and bits live in the reader's frame; the sparks and the chip's glow live in
// the card's frame, so they move with it. Units are metres.
import * as THREE from 'three';
import { squarePoint, COIL_Z, COIL_HALF, CHIP as READER_CHIP } from './reader-model.js';

const WARM = new THREE.Color('#ffc46b');   // the reader's signal and the power it brings
const COOL = new THREE.Color('#7fdcff');   // the card's answer
const MODULE = new THREE.Vector2(-.0277, .0031);   // the chip module's centre on the card

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function digitTexture(digit) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.font = '600 96px "JetBrains Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(127,220,255,.9)';
  g.shadowBlur = 18;
  g.fillStyle = '#e9fbff';
  g.fillText(digit, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A thin band in the shape of a rounded square, 72 mm across: one wave front.
function ringGeometry() {
  const outer = new THREE.Shape(), inner = new THREE.Path();
  const steps = 160, half = COIL_HALF - .003, band = .0011;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = squarePoint(half, .011, i / steps);
    if (i) outer.lineTo(x, y); else outer.moveTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = squarePoint(half - band, .011 - band, i / steps);
    if (i === steps) inner.moveTo(x, y); else inner.lineTo(x, y);
  }
  outer.holes.push(inner);
  return new THREE.ShapeGeometry(outer, 1);
}

const glowMaterial = (map, color) => new THREE.SpriteMaterial({
  map, color, transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
});

// A tiny repeatable random source, so a frame always looks the same when replayed.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEffects() {
  const table = new THREE.Group();   // in the reader's frame
  const onCard = new THREE.Group();  // in the card's frame
  const glow = glowTexture();

  // Wave fronts: six going up (the signal) and six coming down (the answer).
  const ring = ringGeometry();
  const makeRings = color => Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    mesh.renderOrder = 5;
    table.add(mesh);
    return mesh;
  });
  const up = makeRings(WARM), down = makeRings(COOL);

  // The answer's bits: the start of the card's reply to the reader's first question
  // (ATQA 0x0044), in the order they are sent, lowest bit of each byte first.
  const pattern = '0010001000'.split('');
  const digits = { 0: digitTexture('0'), 1: digitTexture('1') };
  const bits = pattern.map(d => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: digits[d], transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0,
    }));
    sprite.renderOrder = 7;
    table.add(sprite);
    return sprite;
  });

  // The reader's chip, glowing while it checks the answer.
  const think = new THREE.Sprite(glowMaterial(glow, COOL));
  think.position.copy(READER_CHIP).setZ(READER_CHIP.z + .002);
  think.renderOrder = 8;
  table.add(think);

  // Sparks: jagged arcs from the big coil's coupling loop across to the chip's own little
  // coil, plus flying specks. Redrawn 24 times a second, like a film.
  const ARCS = 7, POINTS = 14;
  const arcs = Array.from({ length: ARCS }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS * 3), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0xdff4ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    line.renderOrder = 9;
    line.frustumCulled = false;
    onCard.add(line);
    return line;
  });
  const SPECKS = 48;
  const speckGeometry = new THREE.BufferGeometry();
  speckGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPECKS * 3), 3));
  speckGeometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(SPECKS), 1));
  const specks = new THREE.Points(speckGeometry, new THREE.ShaderMaterial({
    uniforms: { map: { value: glow }, size: { value: 7 }, color: { value: new THREE.Color(0xe6f6ff) } },
    vertexShader: `attribute float alpha; varying float vAlpha; uniform float size;
      void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = size; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vAlpha;
      void main() { gl_FragColor = vec4(color, texture2D(map, gl_PointCoord).a * vAlpha); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  specks.renderOrder = 10;
  specks.frustumCulled = false;
  onCard.add(specks);
  const speckSeeds = Array.from({ length: SPECKS }, (_, i) => {
    const r = random(i * 977 + 13);
    return { angle: r() * Math.PI * 2, speed: .5 + r() * .9, phase: r(), drift: (r() - .5) * 2 };
  });

  // The chip's glow, over the silicon die.
  const die = new THREE.Sprite(glowMaterial(glow, new THREE.Color(0xfff4dc)));
  die.position.set(MODULE.x, MODULE.y, .0012);
  die.renderOrder = 11;
  onCard.add(die);

  let arcFrame = -1;
  const point = new THREE.Vector3();

  // Called every frame with the shot's beats (cinema.js) and how high the card floats.
  function update(b, cardZ, spin) {
    table.visible = onCard.visible = b.c > 0 && b.c < 24.8;
    if (!table.visible) return;

    // The reader's signal rises from its coil and spreads as it climbs to the card.
    up.forEach((mesh, i) => {
      const p = ((b.c * .55 + i / up.length) % 1 + 1) % 1;
      mesh.position.set(0, 0, COIL_Z + (cardZ - COIL_Z - .0012) * p);
      mesh.scale.setScalar(.9 + .24 * p);
      mesh.material.opacity = b.rings * Math.sin(Math.PI * p) ** 1.6 * .7;
      mesh.visible = mesh.material.opacity > .004;
    });
    // The answer leaves in the card's shape and lands in the reader's.
    down.forEach((mesh, i) => {
      const p = ((b.c * .7 + i / down.length) % 1 + 1) % 1;
      mesh.position.set(.002 * (1 - p), -.003 * (1 - p), cardZ - .0012 - (cardZ - COIL_Z - .0012) * p);
      mesh.rotation.z = spin * (1 - p);
      mesh.scale.set(1.13 - .13 * p, .7 + .3 * p, 1);
      mesh.material.opacity = b.reply * Math.sin(Math.PI * p) ** 1.6 * .75;
      mesh.visible = mesh.material.opacity > .004;
    });

    // Bits fall one after another, through the gap, onto the reader.
    bits.forEach((sprite, j) => {
      const p = Math.min(1, Math.max(0, (b.c - 17.6 - j * .2) / 1.25));
      const across = (j / (bits.length - 1) - .5) * .066;
      point.set(across, .004 * Math.sin(j * 2.3), cardZ - .002 - (cardZ - COIL_Z - .003) * (p * p * (3 - 2 * p)));
      point.applyAxisAngle(new THREE.Vector3(0, 0, 1), spin * (1 - p));
      sprite.position.copy(point);
      sprite.scale.setScalar(.0044);
      sprite.material.opacity = Math.sin(Math.PI * p) * Math.min(1, b.reply * 1.6);
    });

    think.material.opacity = Math.min(1, b.thinking * 1.1 + b.read * .25);
    think.scale.setScalar(.016 + .01 * b.thinking);

    // Sparks across the gap between the big coil and the chip's little coil.
    const frame = Math.floor(b.c * 24);
    if (b.sparks > .003 && frame !== arcFrame) {
      arcFrame = frame;
      arcs.forEach((line, k) => {
        const r = random(frame * 131 + k * 7919);
        const angle = (k / ARCS) * Math.PI * 2 + r() * .7;
        const from = [MODULE.x + Math.cos(angle) * .0105, MODULE.y + Math.sin(angle) * .0092];
        const to = [MODULE.x + Math.cos(angle + (r() - .5) * .5) * .0052, MODULE.y + Math.sin(angle + (r() - .5) * .5) * .0047];
        const positions = line.geometry.attributes.position.array;
        const nx = -(to[1] - from[1]), ny = to[0] - from[0], length = Math.hypot(nx, ny) || 1;
        for (let i = 0; i < POINTS; i++) {
          const u = i / (POINTS - 1), taper = Math.sin(Math.PI * u);
          const jitter = (r() - .5) * .0016 * taper;
          positions[i * 3] = from[0] + (to[0] - from[0]) * u + nx / length * jitter;
          positions[i * 3 + 1] = from[1] + (to[1] - from[1]) * u + ny / length * jitter;
          positions[i * 3 + 2] = .0009 + taper * .0009;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.userData.flicker = .45 + .55 * r();
      });
    }
    arcs.forEach(line => { line.material.opacity = b.sparks * (line.userData.flicker ?? 1); line.visible = b.sparks > .003; });

    const positions = speckGeometry.attributes.position.array, alphas = speckGeometry.attributes.alpha.array;
    speckSeeds.forEach((s, i) => {
      const life = ((b.c * s.speed * 1.6 + s.phase) % 1 + 1) % 1;
      const radius = .0098 - life * .0045;
      const angle = s.angle + s.drift * life * .6;
      positions[i * 3] = MODULE.x + Math.cos(angle) * radius * 1.08;
      positions[i * 3 + 1] = MODULE.y + Math.sin(angle) * radius;
      positions[i * 3 + 2] = .001 + life * .0012;
      alphas[i] = b.sparks * (1 - life) * .9;
    });
    speckGeometry.attributes.position.needsUpdate = true;
    speckGeometry.attributes.alpha.needsUpdate = true;
    specks.visible = b.sparks > .003;

    // The chip lights up once it has power, and blinks while it works out its answer.
    die.material.opacity = Math.min(1, b.power * .35 + b.blink * .95 + b.sparks * .3);
    die.scale.setScalar(.0085 + .007 * b.blink);
  }

  return { table, onCard, update, WARM, COOL };
}
