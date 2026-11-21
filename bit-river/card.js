import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// This scene needs only the card from the landing carousel.
export async function loadCard(canvas, signal) {
  const url = new URL('../models/contactless-card.glb', import.meta.url);
  const { scene } = await new GLTFLoader().loadAsync(url.href);
  function releaseModel() {
    scene.traverse(part => {
      if (!part.isMesh) return;
      part.geometry.dispose();
      for (const value of Object.values(part.material)) {
        if (value?.isTexture) value.dispose();
      }
      part.material.dispose();
    });
  }
  if (signal.aborted) { releaseModel(); return; }
  signal.addEventListener('abort', releaseModel, { once: true });
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const width = Math.min(1200, Math.max(720, Math.ceil(canvas.clientWidth * devicePixelRatio * 1.5)));
  renderer.setSize(width, Math.round(width * .8), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .76;
  const room = new RoomEnvironment();
  const studio = new THREE.PMREMGenerator(renderer);
  const lighting = studio.fromScene(room, .04);
  room.dispose();
  studio.dispose();
  const world = new THREE.Scene();
  world.environment = lighting.texture;
  world.environmentIntensity = .67;
  world.add(scene, new THREE.HemisphereLight(0xfff7ed, 0xa6a6b5, .82));
  const key = new THREE.DirectionalLight(0xfff9ee, 1.6);
  key.position.set(-4, 6, 5);
  world.add(key);
  scene.traverse(part => {
    if (!part.isMesh) return;
    if (part.material.map) part.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    part.geometry.computeBoundingBox();
    const size = part.geometry.boundingBox.getSize(new THREE.Vector3());
    if (size.z < .000001) {
      // The printed artwork and the gold contacts sit flush against the card stock.
      part.material.polygonOffset = true;
      part.material.polygonOffsetFactor = -1;
      part.material.polygonOffsetUnits = -2;
    }
  });
  const camera = new THREE.OrthographicCamera(-.05, .05, .04, -.04, .01, 2);
  camera.position.z = .5;
  signal.addEventListener('abort', () => {
    lighting.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }, { once: true });
  let lastView;
  return view => {
    if (lastView === view) return;
    lastView = view;
    scene.rotation.set(-.82 + view * .16, -.20 + view * .09, .21 - view * .08, 'ZXY');
    renderer.render(world, camera);
  };
}
