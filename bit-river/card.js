import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function disposeWorld(root) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of [object.material].flat()) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function loop(width, height, radius, color) {
  const outline = new THREE.Shape();
  const x = width / 2, y = height / 2;
  outline.moveTo(-x + radius, -y);
  outline.lineTo(x - radius, -y);
  outline.quadraticCurveTo(x, -y, x, -y + radius);
  outline.lineTo(x, y - radius);
  outline.quadraticCurveTo(x, y, x - radius, y);
  outline.lineTo(-x + radius, y);
  outline.quadraticCurveTo(-x, y, -x, y - radius);
  outline.lineTo(-x, -y + radius);
  outline.quadraticCurveTo(-x, -y, -x + radius, -y);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline.getPoints(10)), material);
}

export async function loadCard(signal) {
  const url = new URL('../models/contactless-card.glb', import.meta.url);
  const { scene: model } = await new GLTFLoader().loadAsync(url.href);
  if (signal.aborted) { disposeWorld(model); return null; }

  const card = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = 1 / (bounds.max.x - bounds.min.x);
  model.scale.setScalar(scale);
  model.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
  model.traverse(part => {
    if (!part.isMesh) return;
    if (part.material.name.includes('protective film')) part.visible = false;
    const name = part.material.name;
    // Printed faces and the inset contacts share the surface of the plastic.
    if (name.includes('artwork') || name.includes('contacts')) {
      part.material.polygonOffset = true;
      part.material.polygonOffsetFactor = -2;
      part.material.polygonOffsetUnits = -4;
    }
  });
  card.add(model);

  const traces = Array.from({ length: 4 }, (_, index) => {
    const trace = loop(.94 - index * .026, .565 - index * .026, .057, 0xff9b55);
    trace.position.z = .011 + index * .0003;
    card.add(trace);
    return trace;
  });
  const source = new THREE.Object3D();
  source.position.set(-.405, -.205, .016);
  card.add(source);
  return { card, traces, source };
}

export function createReader() {
  const reader = new THREE.Group();
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x111216, roughness: .38, metalness: .36 }),
    new THREE.MeshStandardMaterial({ color: 0x333536, roughness: .29, metalness: .58 }),
    new THREE.MeshStandardMaterial({ color: 0x202225, roughness: .49, metalness: .2 })
  ];
  function slab(width, height, depth, z, material) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, .065), material);
    mesh.position.z = z;
    reader.add(mesh);
  }
  slab(1.14, .86, .175, 0, materials[0]);
  slab(1.13, .85, .05, .086, materials[1]);
  slab(1.09, .81, .045, .11, materials[2]);

  const glyph = new THREE.LineBasicMaterial({ color: 0xc1c4c8, transparent: true, opacity: .75 });
  for (let i = 0; i < 4; i++) {
    const radius = .052 + i * .036;
    const arc = new THREE.EllipseCurve(-.075, 0, radius, radius, -.72, .72);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.getPoints(24)), glyph);
    line.position.z = .139;
    reader.add(line);
  }
  const indicator = new THREE.MeshBasicMaterial({ color: 0x56504a });
  const bar = new THREE.Mesh(new RoundedBoxGeometry(.17, .021, .013, 2, .006), indicator);
  bar.position.set(.31, .28, .138);
  reader.add(bar);
  const source = new THREE.Object3D();
  source.position.set(0, 0, .22);
  reader.add(source);
  return { reader, indicator, source };
}
