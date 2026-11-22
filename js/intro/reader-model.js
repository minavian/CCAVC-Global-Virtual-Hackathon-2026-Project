// The card reader in 3D, built from simple shapes to match images/intro/reader.webp: a
// two-tier charcoal body, a glossy black top with the contactless mark and an amber light.
// Inside, under the top, are the parts the close-up shows: the reader's copper coil (the
// antenna that makes the field), its circuit board and the reader's own chip.
// Units are metres. The reader's centre is at the origin, its top faces +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SIZE = .092;          // 92 mm square
export const HEIGHT = .0264;       // 26 mm tall
export const TOP = HEIGHT / 2;     // the top surface, measured from the centre
export const COIL_Z = TOP - .0029; // the coil sits just under the top
export const COIL_HALF = .039;     // the coil's outer turn, half its width
export const CHIP = new THREE.Vector3(.019, -.021, -TOP + .0154); // the reader's chip

// A point `f` of the way round a rounded square (half-width `half`, corner radius `r`),
// counter-clockwise from the middle of the right edge.
export function squarePoint(half, r, f) {
  const s = 2 * (half - r), a = Math.PI * r / 2, c = half - r;
  let d = (((f % 1) + 1) % 1) * 4 * (s + a);
  if (d < s / 2) return [half, d];
  d -= s / 2;
  const parts = [
    [c, c, 0], [c, half, -1, 0, s], [-c, c, Math.PI / 2], [-half, c, 0, -1, s],
    [-c, -c, Math.PI], [-c, -half, 1, 0, s], [c, -c, 1.5 * Math.PI], [half, -c, 0, 1, s / 2],
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
  return [half, 0];
}

// Current in a copper coil, drawn as bright pulses running along it. `coilT` is how far
// along the coil each vertex is (0 to 1), so the pulses follow the wire round every turn.
export function flowShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float coilT;\nvarying float vCoilT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoilT = coilT;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGlow; uniform float uFlow; uniform float uPulses; uniform vec3 uGlowColor;
        varying float vCoilT;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pulse = pow(.5 + .5 * cos(6.2831853 * (vCoilT * uPulses - uFlow)), 10.);
        totalEmissiveRadiance += uGlowColor * uGlow * (.35 + 2.6 * pulse);`);
  };
}

function iconTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = '#f1efe9';
  g.lineCap = 'round';
  g.lineWidth = 15;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(70, 128, 34 + i * 30, -.62, .62);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildReader() {
  const group = new THREE.Group();
  const shell = [], inside = [];
  const add = (geometry, material, z, list, x = 0, y = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    list.push(material);
    return mesh;
  };
  const plastic = color => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .05, envMapIntensity: .55 });
  const box = (w, d, h, r) => new RoundedBoxGeometry(w, d, h, 5, r);

  // The body: a lower tier, a hairline groove, an upper tier, a lighter rim and the glossy top.
  add(box(SIZE, SIZE, .0125, .011), plastic(0x242527), -TOP + .00625, shell);
  add(box(SIZE - .0024, SIZE - .0024, .0118, .0098), plastic(0x2b2c2f), -TOP + .0129 + .0059, shell);
  add(box(SIZE - .0072, SIZE - .0072, .0012, .0055),
    new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: .3, metalness: .3, envMapIntensity: .8 }), TOP - .0011, shell);
  add(box(SIZE - .0104, SIZE - .0104, .0010, .0045),
    new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: .42, metalness: 0, envMapIntensity: .16 }), TOP - .0004, shell);
  const icon = add(new THREE.PlaneGeometry(.017, .017),
    new THREE.MeshBasicMaterial({ map: iconTexture(), transparent: true, depthWrite: false }), TOP + .00012, shell, .004, -.002);
  icon.renderOrder = 2;

  // The status light: amber at rest, as in the picture.
  const led = new THREE.Mesh(box(.011, .0015, .0005, .00025),
    new THREE.MeshStandardMaterial({ color: 0x2a1a0c, emissive: 0xff8a2a, emissiveIntensity: 1.6, roughness: .4 }));
  led.position.set(0, .0305, TOP + .00005);
  group.add(led);

  // Inside: the board, the reader's chip with a light on it, and the coil.
  add(box(SIZE - .016, SIZE - .016, .0012, .004),
    new THREE.MeshStandardMaterial({ color: 0x1c3a2b, roughness: .62, metalness: .1 }), -TOP + .0136, inside);
  add(box(.011, .011, .0018, .0006), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .5 }),
    CHIP.z, inside, CHIP.x, CHIP.y);
  const think = new THREE.MeshStandardMaterial({ color: 0x0c1a1c, emissive: 0x7fe0ff, emissiveIntensity: 0, roughness: .3 });
  add(new THREE.PlaneGeometry(.0042, .0042), think, CHIP.z + .00092, inside, CHIP.x, CHIP.y);

  // The coil: five turns of copper wound as a rounded square, from the outside in.
  const turns = 5, steps = turns * 180, points = [];
  for (let k = 0; k <= steps; k++) {
    const s = k / steps;
    const [x, y] = squarePoint(COIL_HALF - s * .0125, .010 - s * .004, s * turns);
    points.push(new THREE.Vector3(x, y, COIL_Z));
  }
  // The wire's inner end drops to the board and runs to the reader's chip.
  points.push(new THREE.Vector3(.0262, -.004, COIL_Z - .0015), new THREE.Vector3(.024, -.016, CHIP.z + .0009),
    new THREE.Vector3(CHIP.x + .0055, CHIP.y + .0035, CHIP.z + .0009));
  const coilGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', .2),
    steps * 2, .00042, 6, false);
  const uv = coilGeometry.attributes.uv, along = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) along[i] = uv.getX(i);
  coilGeometry.setAttribute('coilT', new THREE.BufferAttribute(along, 1));
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: .85, roughness: .3 });
  const flow = { uGlow: { value: 0 }, uFlow: { value: 0 }, uPulses: { value: 9 }, uGlowColor: { value: new THREE.Color() } };
  flowShader(copper, flow);
  add(coilGeometry, copper, 0, inside);

  for (const material of [...shell, ...inside]) material.userData.base = { transparent: material.transparent, depthWrite: material.depthWrite };
  const last = { opacity: -1, shell: -1 };
  const ledColor = new THREE.Color();

  // opacity: the whole reader. shell: the body only, so the inside shows through.
  // glow, flow, color: the current in the coil. led: [color, strength]. thinking: the chip's light.
  function set({ opacity = 1, shellOpacity = 1, glow = 0, flow: phase = 0, color, led: light, thinking = 0 }) {
    group.visible = opacity > .002;
    if (opacity !== last.opacity || shellOpacity !== last.shell) {
      last.opacity = opacity;
      last.shell = shellOpacity;
      const apply = (material, value) => {
        const see = value < .999;
        const transparent = material.userData.base.transparent || see;
        if (transparent !== material.transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.depthWrite = see ? false : material.userData.base.depthWrite;
        material.opacity = value;
      };
      for (const material of shell) apply(material, opacity * shellOpacity);
      for (const material of inside) apply(material, opacity);
      // The light fades with the reader, a little less than the shell, so it still reads
      // as the reader's light during the close-up.
      const light = opacity * Math.sqrt(shellOpacity);
      if ((light < .999) !== led.material.transparent) { led.material.transparent = light < .999; led.material.needsUpdate = true; }
      led.material.opacity = light;
      led.visible = light > .05;
    }
    flow.uGlow.value = glow;
    flow.uFlow.value = phase;
    if (color) flow.uGlowColor.value.copy(color);
    if (light) {
      ledColor.copy(light[0]);
      led.material.emissive.copy(ledColor);
      led.material.emissiveIntensity = light[1];
    }
    think.emissiveIntensity = thinking * 3.2;
  }

  return { group, set };
}
