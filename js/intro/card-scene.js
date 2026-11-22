import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const cardURL = new URL('../../models/contactless-card.glb', import.meta.url);
const brass = new THREE.Color('#624725');

// The mouth (see `bendSheet`). At full open, the front layers rise HINGE radians in a soft
// crease by the right edge, and their free edge rolls CURL radians more.
const HINGE = .17;
const CURL = .40;
const CREASE = .16;   // the crease's width, as a share of the card's width
const SLICES = 72;    // strips the front layers are cut into, so they can bend smoothly
const STEPS = 16;     // Simpson steps when the shader follows the bent sheet

function getShellLayers(card) {
  const fades = [
    ['front-protective-overlay', .07], ['front-printed-pvc', .065],
    ['rear-protective-overlay', .24], ['rear-printed-pvc', .095],
    ['contact-plate', .045], ['module-substrate', .13], ['die-underfill', .24], ['inlay-carrier', .35],
    ['inlay-pocket-collar', .32], ['die-pocket-floor', .32],
  ];
  const layers = [];
  for (const [name, end] of fades) {
    card.getObjectByName(name).traverse(part => {
      if (!part.isMesh) return;
      const material = part.material = part.material.clone();
      layers.push({ material, end, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
    });
  }
  return layers;
}

// The model's front layers are flat slabs with vertices only round their outline, so
// a bend along the card would have nothing to bend. This cuts every triangle into strips
// across the card's width (at each x in `cuts`), copying and blending all its attributes.
function sliceAlongX(source, cuts) {
  const geometry = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(geometry.attributes);
  const attributes = names.map(name => geometry.attributes[name]);
  const stride = attributes.reduce((sum, a) => sum + a.itemSize, 0);
  const px = names.slice(0, names.indexOf('position')).reduce((sum, name) => sum + geometry.attributes[name].itemSize, 0);
  const read = index => {
    const vertex = new Float32Array(stride);
    let o = 0;
    for (const a of attributes) for (let k = 0; k < a.itemSize; k++) vertex[o++] = a.getComponent(index, k);
    return vertex;
  };
  const between = (a, b, t) => a.map((value, k) => value + (b[k] - value) * t);
  // Keep the part of a polygon on one side of the plane x = at (Sutherland-Hodgman).
  const clip = (polygon, at, above) => {
    const kept = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = above ? a[px] - at : at - a[px];
      const db = above ? b[px] - at : at - b[px];
      if (da >= 0) kept.push(a);
      if ((da >= 0) !== (db >= 0)) kept.push(between(a, b, da / (da - db)));
    }
    return kept;
  };
  const out = [];
  const count = geometry.attributes.position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const triangle = [read(i), read(i + 1), read(i + 2)];
    const xs = triangle.map(v => v[px]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const inside = cuts.filter(x => x > lo + 1e-7 && x < hi - 1e-7);
    if (!inside.length) { out.push(...triangle); continue; }
    const edges = [-Infinity, ...inside, Infinity];
    for (let s = 0; s + 1 < edges.length; s++) {
      let piece = triangle;
      if (edges[s] > -Infinity) piece = clip(piece, edges[s], true);
      if (edges[s + 1] < Infinity) piece = clip(piece, edges[s + 1], false);
      for (let k = 1; k + 1 < piece.length; k++) out.push(piece[0], piece[k], piece[k + 1]);
    }
  }
  const sliced = new THREE.BufferGeometry();
  let offset = 0;
  attributes.forEach((a, n) => {
    const size = a.itemSize, array = new Float32Array(out.length * size);
    out.forEach((vertex, i) => { for (let k = 0; k < size; k++) array[i * size + k] = vertex[offset + k]; });
    sliced.setAttribute(names[n], new THREE.BufferAttribute(array, size));
    offset += size;
  });
  return sliced;
}

// The mouth bends the front layers as one sheet that cannot stretch. Measured from the
// glued right edge, the sheet's angle grows smoothly: a soft crease near the edge (HINGE)
// plus a curl that grows toward the free edge (CURL). The shader walks along the sheet,
// adding up its direction (Simpson's rule), so every point keeps its distance along the
// card, and turns each normal by the same angle so the light follows the curve.
function bendSheet(meshes, card, frame, bend) {
  const { hingeX, width, pivotZ } = frame;
  const cuts = Array.from({ length: SLICES - 1 }, (_, i) => hingeX - width * (i + 1) / SLICES);
  const glsl = n => n.toFixed(7);
  const common = `
    uniform float uHinge;
    uniform float uCurl;
    uniform vec3 uLayer;
    float bendAngle(float u) {
      float s = clamp(u / ${glsl(width)}, 0.0, 1.0);
      return uHinge * smoothstep(0.0, ${glsl(CREASE)}, s) + uCurl * s * s;
    }
    vec2 bendPath(float u) {
      float h = u / ${STEPS}.0;
      vec2 sum = vec2(0.0);
      for (int i = 0; i <= ${STEPS}; i++) {
        float w = (i == 0 || i == ${STEPS}) ? 1.0 : (i - i / 2 * 2 == 1 ? 4.0 : 2.0);
        float a = bendAngle(h * float(i));
        sum += w * vec2(cos(a), sin(a));
      }
      return sum * h / 3.0;
    }`;
  card.updateWorldMatrix(true, true);
  for (const mesh of meshes) {
    mesh.geometry = sliceAlongX(mesh.geometry, cuts);
    mesh.frustumCulled = false;
    // Where this mesh sits inside the card, so all layers bend around the same line.
    const layer = card.worldToLocal(mesh.getWorldPosition(new THREE.Vector3()));
    mesh.material.onBeforeCompile = shader => {
      shader.uniforms.uHinge = bend.hinge;
      shader.uniforms.uCurl = bend.curl;
      shader.uniforms.uLayer = { value: layer };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + common)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec3 bendCard = position + uLayer;
          float bendU = max(${glsl(hingeX)} - bendCard.x, 0.0);
          float bendPhi = bendAngle(bendU);
          float bendC = cos(bendPhi), bendS = sin(bendPhi);
          objectNormal = vec3(objectNormal.x * bendC + objectNormal.z * bendS, objectNormal.y,
            objectNormal.z * bendC - objectNormal.x * bendS);
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 bendAt = bendPath(bendU);
          float bendD = bendCard.z - ${glsl(pivotZ)};
          transformed = vec3(${glsl(hingeX)} - bendAt.x + bendD * bendS, bendCard.y,
            ${glsl(pivotZ)} + bendAt.y + bendD * bendC) - uLayer;
        `);
    };
    mesh.material.needsUpdate = true;
  }
}

// The same sheet on the CPU: where a point `u` from the glued edge ends up, as
// [distance back toward the left, height above the pivot].
function sheetPoint(u, hinge, curl, width) {
  const angle = v => {
    const s = Math.min(1, Math.max(0, v / width));
    const t = Math.min(1, s / CREASE);
    return hinge * t * t * (3 - 2 * t) + curl * s * s;
  };
  const h = u / STEPS;
  let along = 0, up = 0;
  for (let i = 0; i <= STEPS; i++) {
    const w = i === 0 || i === STEPS ? 1 : i % 2 ? 4 : 2;
    const a = angle(h * i);
    along += w * Math.cos(a);
    up += w * Math.sin(a);
  }
  return [along * h / 3, up * h / 3];
}

export async function createCardScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;

  const world = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3500);
  camera.position.z = 1700;
  let asset;
  try {
    asset = await new GLTFLoader().loadAsync(cardURL.href);
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  const studio = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  world.environment = studio.fromScene(room, .04).texture;
  world.environmentIntensity = .82;
  room.dispose();
  studio.dispose();
  world.add(new THREE.HemisphereLight(0xfffcf5, 0x93938e, 1.2));
  for (const [x, y, z, color, intensity] of [
    [-5, 8, 6, 0xfffbf3, 2.25], [6, 2, -6, 0xe4e4e0, 2.8],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    world.add(light);
  }

  const card = asset.scene.getObjectByName('contactless-card');
  const box = new THREE.Box3().setFromObject(card);
  const widthInMeters = box.max.x - box.min.x;
  const rig = new THREE.Group();
  rig.add(card);
  world.add(rig);
  card.position.sub(box.getCenter(new THREE.Vector3()));
  card.updateWorldMatrix(true, true);

  const layers = getShellLayers(card);
  const face = card.getObjectByName('front-printed-artwork');
  // The X-ray outline, taken before the face is cut into strips. It shows only while the
  // card is shut, so it never needs to bend.
  const outline = new THREE.EdgesGeometry(face.geometry);

  // The front laminate opens from its right edge. The backing, the antenna and the chip stay put.
  const front = [];
  for (const name of ['front-protective-overlay', 'front-printed-pvc'])
    card.getObjectByName(name).traverse(part => { if (part.isMesh) front.push(part); });
  const local = new THREE.Box3();
  for (const mesh of front) local.union(new THREE.Box3().setFromObject(mesh));
  const toCard = new THREE.Matrix4().copy(card.matrixWorld).invert();
  local.applyMatrix4(toCard);
  const sheet = { hingeX: local.max.x, width: local.max.x - local.min.x, pivotZ: local.min.z };
  const bend = { hinge: { value: 0 }, curl: { value: 0 } };
  bendSheet(front, card, sheet, bend);

  for (const mesh of [face, card.getObjectByName('rear-printed-artwork')]) {
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -2;
    mesh.material.polygonOffsetUnits = -2;
    mesh.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  const edge = new THREE.LineSegments(
    outline,
    new THREE.LineBasicMaterial({ color: 0x514b42, transparent: true, depthTest: false, depthWrite: false }),
  );
  edge.renderOrder = 10;
  face.add(edge);

  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(.0012, .046),
    new THREE.MeshBasicMaterial({ color: 0xdcc9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scan.position.z = .0011;
  scan.renderOrder = 11;
  card.add(scan);

  const copper = ['perimeter-and-coupling-antenna', 'module-antenna'].map(name => {
    const mesh = card.getObjectByName(name);
    const material = mesh.material = mesh.material.clone();
    return { material, original: material.color.clone(), metalness: material.metalness };
  });

  let width, height, glass = -1;
  const point = new THREE.Vector3();

  function resize(w, h) {
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  function draw(pose) {
    rig.position.set(pose.x - width / 2, height / 2 - pose.y, 0);
    rig.scale.setScalar(pose.width / widthInMeters);
    rig.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    bend.hinge.value = pose.mouth * HINGE;
    bend.curl.value = (pose.curl ?? pose.mouth) * CURL;

    if (pose.xray !== glass) {
      glass = pose.xray;
      for (const layer of layers) {
        const { material } = layer;
        const transparent = layer.transparent || glass > 0;
        if (transparent !== material.transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
        material.depthWrite = glass > 0 ? false : layer.depthWrite;
        material.opacity = THREE.MathUtils.lerp(layer.opacity, layer.opacity * layer.end, glass);
      }
      for (const { material, original, metalness } of copper) {
        material.color.copy(original).lerp(brass, glass * .83);
        material.emissive.copy(brass);
        material.emissiveIntensity = glass * .04;
        material.metalness = metalness * (1 - glass * .71);
      }
      edge.visible = glass > 0;
      edge.material.opacity = glass * .82;
      scan.visible = glass > .025 && glass < .975;
      scan.position.x = THREE.MathUtils.lerp(-.037, .037, glass);
      scan.material.opacity = Math.sin(Math.PI * glass) * .5;
    }
    renderer.render(world, camera);
  }

  function project(x, y, z) {
    point.set(x, y, z);
    card.localToWorld(point).project(camera);
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
  }

  // The middle of the open mouth, near the free edge: halfway between the lifted lip and
  // the layer under it. The letters fly out from here, so they always leave the gap itself.
  function mouth() {
    const u = sheet.width - .0035;
    const [along, up] = sheetPoint(u, bend.hinge.value, bend.curl.value, sheet.width);
    const lipX = sheet.hingeX - along, lipZ = sheet.pivotZ + up;
    return project((lipX + sheet.hingeX - u) / 2, .002, (lipZ + sheet.pivotZ) / 2 + .0006);
  }

  return { resize, draw, project, mouth };
}
