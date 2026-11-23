// The card reader in 3D: one rounded slab, like a modern payment pad. A soft-edged
// graphite body with "squircle" corners, a flush black glass top with the contactless
// mark, and a slim light bar. Inside, under the glass, are the parts the close-up shows:
// the reader's copper coil (the antenna that makes the field), its circuit board and the
// reader's own chip. Units are metres. The reader's centre is at the origin, its top faces +z.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { SIZE, HEIGHT, TOP, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP, squarePoint } from './reader-size.js';

export { SIZE, HEIGHT, TOP, COIL_Z, COIL_HALF, COIL_RADIUS, CHIP, squarePoint };

const EDGE = .0048;   // how round the slab's edge is (its bevel radius)
const SQUIRCLE = 5;   // the plan's superellipse power: 2 is a circle, higher is squarer
const GLASS = .0034;  // how far the glass top sits in from the edge
const COPPER = new THREE.Color(0xb87333), DARK_COPPER = new THREE.Color(0x3a2618);

// Current in a copper coil, drawn as pulses of colour running along it. `coilT` is how far
// along the coil each vertex is (0 to 1), so the pulses follow the wire round every turn.
// Each pulse is a comet: a bright head with a tail fading out behind it, so you can see
// which way the current runs. `uDir` is +1 toward the reader's chip, -1 away from it.
export function flowShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float coilT;\nvarying float vCoilT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoilT = coilT;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGlow; uniform float uFlow; uniform float uPulses; uniform float uDir; uniform float uNeutral; uniform vec3 uGlowColor;
        varying float vCoilT;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float cometAt = fract(uDir * vCoilT * uPulses - uFlow);
        float comet = pow(cometAt, 2.6) * (1. - smoothstep(.95, 1., cometAt));
        totalEmissiveRadiance += uGlowColor * uGlow * .15;`)
      // The colour goes on after tone mapping, so the light page can't wash it out. Under
      // a blue current the copper first turns grey (uNeutral), or blue over orange would
      // read as purple.
      .replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722))), clamp(uNeutral, 0., 1.) * .9);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlowColor, clamp(uGlow * (.05 + .95 * comet), 0., 1.));`);
  };
}

// The slab's outline seen from above: a superellipse, which rounds the corners off with
// no visible join between the curve and the straight sides.
function squircle(half, power = SQUIRCLE, steps = 240) {
  const shape = new THREE.Shape();
  for (let i = 0; i < steps; i++) {
    const t = i / steps * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = half * Math.sign(c) * Math.abs(c) ** (2 / power);
    const y = half * Math.sign(s) * Math.abs(s) ** (2 / power);
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  return shape;
}

// A rounded slab: the outline extruded with a round bevel all round its edge. The
// extrusion comes out faceted, so the vertices are merged and the normals averaged, which
// shades the edge as one smooth curve.
function slab(half, height, edge, power = SQUIRCLE) {
  const geometry = new THREE.ExtrudeGeometry(squircle(half - edge, power), {
    depth: Math.max(1e-5, height - 2 * edge), bevelEnabled: true, bevelThickness: edge,
    bevelSize: edge, bevelSegments: 10, curveSegments: 1, steps: 1,
  });
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const smooth = mergeVertices(geometry, 1e-7);
  smooth.computeVertexNormals();
  smooth.translate(0, 0, -height / 2 + edge);
  geometry.dispose();
  return smooth;
}

function iconTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = '#eef1f5';
  g.lineCap = 'round';
  g.lineWidth = 13;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(76, 128, 30 + i * 30, -.66, .66);
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

  // The body: one piece of satin graphite with a soft clear coat.
  add(slab(SIZE / 2, HEIGHT, EDGE), new THREE.MeshPhysicalMaterial({
    color: 0x3b3e44, roughness: .48, metalness: 0, clearcoat: .4, clearcoatRoughness: .35, envMapIntensity: .8,
  }), 0, shell);
  // The glass top: set into the body, a hair proud of it, glossy black.
  add(slab(SIZE / 2 - GLASS, .0009, .00042, SQUIRCLE + .3), new THREE.MeshPhysicalMaterial({
    color: 0x020203, roughness: .34, metalness: 0, clearcoat: .32, clearcoatRoughness: .22, envMapIntensity: .18,
  }), TOP - .00032, shell);
  const icon = add(new THREE.PlaneGeometry(.019, .019),
    new THREE.MeshBasicMaterial({ map: iconTexture(), transparent: true, opacity: .78, depthWrite: false }), TOP + .00016, shell, .0035, -.003);
  icon.renderOrder = 2;
  icon.material.userData.opacity = .78;

  // The light bar: a slim pill under the glass, near the far edge.
  const led = new THREE.Mesh(new THREE.CapsuleGeometry(.0007, .013, 4, 12).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, emissive: 0xd8e6ff, emissiveIntensity: 1.1, roughness: .3 }));
  led.scale.z = .35;
  led.position.set(0, .0318, TOP + .00005);
  group.add(led);

  // Inside: the board, the reader's chip with a light on it, and the coil.
  add(slab(SIZE / 2 - .008, .0012, .0005, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x18241f, roughness: .7, metalness: .1 }), -TOP + .0035, inside);
  add(new THREE.BoxGeometry(.011, .011, .0018), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .5 }),
    CHIP.z, inside, CHIP.x, CHIP.y);
  const think = new THREE.MeshStandardMaterial({ color: 0x0c1a1c, emissive: 0x3f8cff, emissiveIntensity: 0, roughness: .3 });
  add(new THREE.PlaneGeometry(.0042, .0042), think, CHIP.z + .00092, inside, CHIP.x, CHIP.y);

  // The coil: five turns of copper wound as a rounded square, from the outside in.
  const turns = 5, steps = turns * 180, points = [];
  for (let k = 0; k <= steps; k++) {
    const s = k / steps;
    const [x, y] = squarePoint(COIL_HALF - s * .0115, COIL_RADIUS - s * .0055, s * turns);
    points.push(new THREE.Vector3(x, y, COIL_Z));
  }
  // The wire's inner end drops to the board and runs to the reader's chip.
  points.push(new THREE.Vector3(.0245, -.004, COIL_Z - .0012), new THREE.Vector3(.0225, -.013, CHIP.z + .0009),
    new THREE.Vector3(CHIP.x + .0055, CHIP.y + .0035, CHIP.z + .0009));
  const coilGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', .2),
    steps * 2, .00042, 6, false);
  const uv = coilGeometry.attributes.uv, along = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) along[i] = uv.getX(i);
  coilGeometry.setAttribute('coilT', new THREE.BufferAttribute(along, 1));
  const copper = new THREE.MeshStandardMaterial({ color: COPPER, metalness: .85, roughness: .3 });
  const flow = { uGlow: { value: 0 }, uFlow: { value: 0 }, uPulses: { value: 14 }, uDir: { value: 1 }, uNeutral: { value: 0 }, uGlowColor: { value: new THREE.Color() } };
  flowShader(copper, flow);
  add(coilGeometry, copper, 0, inside);

  for (const material of [...shell, ...inside]) {
    material.userData.base = { transparent: material.transparent, depthWrite: material.depthWrite, opacity: material.userData.opacity ?? 1 };
  }
  const last = { opacity: -1, shell: -1 };
  const ledColor = new THREE.Color();

  // opacity: the whole reader. shell: the body only, so the inside shows through.
  // glow, flow, direction, color: the current in the coil; neutral greys the copper under
  // a blue current; dim darkens the copper (in the dark close-up, so the current's light
  // stands out on it). led: [color, strength]. thinking: the chip's light.
  function set({ opacity = 1, shellOpacity = 1, glow = 0, flow: phase = 0, direction = 1, neutral = 0, dim = 0, color, led: light, thinking = 0 }) {
    group.visible = opacity > .002;
    if (opacity !== last.opacity || shellOpacity !== last.shell) {
      last.opacity = opacity;
      last.shell = shellOpacity;
      const apply = (material, value) => {
        const see = value < .999;
        const transparent = material.userData.base.transparent || see;
        if (transparent !== material.transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.depthWrite = see ? false : material.userData.base.depthWrite;
        material.opacity = value * material.userData.base.opacity;
      };
      for (const material of shell) apply(material, opacity * shellOpacity);
      for (const material of inside) apply(material, opacity);
      // The light fades with the reader, a little less than the shell, so it still reads
      // as the reader's light when the body is see-through.
      const glowing = opacity * Math.sqrt(shellOpacity);
      if ((glowing < .999) !== led.material.transparent) { led.material.transparent = glowing < .999; led.material.needsUpdate = true; }
      led.material.opacity = glowing;
      led.visible = glowing > .05;
    }
    flow.uGlow.value = glow;
    copper.color.copy(COPPER).lerp(DARK_COPPER, dim * .7);
    flow.uFlow.value = phase;
    flow.uDir.value = direction;
    flow.uNeutral.value = neutral;
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
