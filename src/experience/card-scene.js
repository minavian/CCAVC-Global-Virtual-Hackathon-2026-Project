import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const cardURL = new URL('../assets/models/contactless-card.glb', import.meta.url);
const brass = new THREE.Color('#624725');

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

function curlLaminate(hinge, width, amount) {
  hinge.traverse(part => {
    if (!part.isMesh) return;
    part.material.onBeforeCompile = shader => {
      shader.uniforms.mouthCurl = amount;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float mouthCurl;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float lip = clamp(0.5 - position.x / ${width.toFixed(6)}, 0.0, 1.0);
          objectNormal.x += 3.0 * mouthCurl * lip * lip / ${width.toFixed(6)} * objectNormal.z;
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.z += mouthCurl * lip * lip * lip;
          transformed.x += mouthCurl * lip * lip * 0.18;
        `);
    };
  });
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

  // The front laminate pivots around its right edge. The backing and chip stay in place.
  const hinge = new THREE.Group();
  hinge.position.x = box.max.x;
  card.add(hinge);
  hinge.attach(card.getObjectByName('front-protective-overlay'));
  hinge.attach(card.getObjectByName('front-printed-pvc'));
  const layers = getShellLayers(card);
  const curl = { value: 0 };
  curlLaminate(hinge, widthInMeters, curl);

  const face = card.getObjectByName('front-printed-artwork');
  for (const mesh of [face, card.getObjectByName('rear-printed-artwork')]) {
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -2;
    mesh.material.polygonOffsetUnits = -2;
    mesh.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(face.geometry),
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
    hinge.rotation.y = pose.mouth * .168;
    curl.value = pose.mouth * .012;

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

  return { resize, draw, project };
}
