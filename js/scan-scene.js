import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createScanHand } from './scan-hand.js';
import { SCAN_TIMING as time } from './scan-timing.js';

const sizes = [3.6, 7.7, 5.3];
const revealSizes = [6.5, 6.9, 5.6];
const cutawaySizes = [5.1, 8.05, 9.5];
const deviceAspects = [.56, .49, 1.58];
const reach = new T.Vector3(2.75, 1.9, 2.6);
const tap = new T.Vector3(-2.25, .35, 2.35);
const contact = new T.Vector3(-3.25, -.7, 1.7);
const gripAnchor = new T.Vector3(11.4, 3.15, -4.7);
const clamp = value => T.MathUtils.clamp(value, 0, 1);
const cue = (seconds, start, end) => clamp((seconds - start) / (end - start));
const ease = progress => progress * progress * (3 - 2 * progress);

function paintedTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function makeReader() {
  const body = new T.Group();
  body.position.set(-3.65, -1.05, .1);
  body.rotation.set(-.28, .32, -.13);

  function caseLayer(width, height, thickness, radius, z, surface) {
    const geometry = new RoundedBoxGeometry(width, height, thickness, 4, radius);
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial(surface));
    mesh.position.z = z;
    body.add(mesh);
  }
  caseLayer(4.5, 6.3, .8, .21, 0, { color: 0x4b5050, metalness: .45, roughness: .38 });
  caseLayer(4.39, 6.19, .36, .16, .37, { color: 0x151a1d, metalness: .22, roughness: .28 });
  caseLayer(3.92, 4.7, .11, .055, .54, { color: 0x202828, metalness: .24, roughness: .3 });

  const print = paintedTexture(384, 460, (ctx, width, height) => {
    ctx.translate(width / 2, height * .52);
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d6e0da';
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      ctx.arc(-30, 0, ring * 18 + 5, -.57, .57);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#a7b6af';
    ctx.fillText('CONTACTLESS', 0, 92);
  });
  const face = new T.Mesh(new T.PlaneGeometry(3.92, 4.7), new T.MeshBasicMaterial({ map: print, transparent: true }));
  face.position.z = .6;
  body.add(face);

  const indicator = new T.MeshBasicMaterial({ color: 0x767e77, toneMapped: false });
  const lamp = new T.Mesh(new RoundedBoxGeometry(.63, .095, .08, 3, .04), indicator);
  lamp.position.set(-1.3, -2.62, .56);
  body.add(lamp);
  return { body, indicator };
}

export async function createScanScene(viewport, redraw) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;

  const scene = new T.Scene();
  const room = new RoomEnvironment();
  const studio = new T.PMREMGenerator(renderer);
  scene.environment = studio.fromScene(room, .04).texture;
  scene.environmentIntensity = .75;
  studio.dispose();
  room.dispose();
  scene.add(new T.HemisphereLight(0xfff5e5, 0x9d9f96, 1.2));
  const key = new T.DirectionalLight(0xfff6ec, 2.35);
  key.position.set(-5, 8, 12);
  scene.add(key);

  const camera = new T.OrthographicCamera(0, 0, 0, 0, .1, 100);
  camera.position.z = 42;
  const device = new T.Group();
  scene.add(device);

  const reader = makeReader();
  scene.add(reader.body);
  const shadowMap = paintedTexture(96, 96, (ctx, width) => {
    const radius = width / 2;
    const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, 'rgba(48, 40, 29, .55)');
    gradient.addColorStop(.46, 'rgba(48, 40, 29, .18)');
    gradient.addColorStop(1, 'rgba(48, 40, 29, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, width);
  });
  const readerShadow = new T.Sprite(new T.SpriteMaterial({ map: shadowMap, depthWrite: false, opacity: .76 }));
  readerShadow.position.set(-3.4, -4.32, -.7);
  readerShadow.scale.set(6.1, 1.15, 1);
  scene.add(readerShadow);
  const productShadow = new T.Sprite(new T.SpriteMaterial({ map: shadowMap, depthWrite: false, opacity: .48 }));
  productShadow.scale.set(7, 1.4, 1);
  scene.add(productShadow);

  const waves = [0, 1, 2].map(i => {
    const ring = new T.Mesh(new T.RingGeometry(i ? .985 : .954, 1, 100), new T.MeshBasicMaterial({
      color: i ? 0x69cda1 : 0x25aa77, transparent: true, depthWrite: false, depthTest: false, toneMapped: false
    }));
    ring.position.set(-3.53, -.89, 8);
    ring.rotation.set(-.31, .17, 0);
    ring.renderOrder = 2;
    scene.add(ring);
    return ring;
  });

  const loader = new GLTFLoader();
  const hand = await createScanHand(T, loader).catch(error => {
    renderer.dispose();
    throw error;
  });
  hand.group.scale.setScalar(.55);
  scene.add(hand.group);
  viewport.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    renderer.domElement.hidden = true;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    renderer.domElement.hidden = false;
    redraw();
  });

  const models = new Map();
  const offset = new T.Vector3();
  const handOffset = new T.Vector3();
  const pointer = new T.Vector3();
  const landingRotation = new T.Euler(0, 0, 0, 'YXZ');
  const landingQuaternion = new T.Quaternion();
  let current, index, width, height;
  let pixelsPerUnit;

  async function showObject(nextIndex) {
    if (index === nextIndex) return;
    let model = models.get(nextIndex);
    if (!model) {
      model = await window.RFIDModels.loadObject(T, loader, { matches: true }, nextIndex);
      models.set(nextIndex, model);
    }
    current = model;
    index = nextIndex;
    device.clear();
    device.add(current.model);
  }

  function fitCamera(zoom = 1, y = 0) {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return false;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
    }
    const aspect = w / h;
    const vertical = Math.max(16.2, 15.2 / aspect, 6800 / h) / zoom;
    pixelsPerUnit = h / vertical;
    camera.left = -vertical * aspect / 2;
    camera.right = -camera.left;
    camera.top = vertical / 2;
    camera.bottom = -camera.top;
    camera.position.y = y;
    camera.updateProjectionMatrix();
    return true;
  }

  function toScenePoint(point, z) {
    return pointer.set((point.x - width / 2) / pixelsPerUnit,
      (height / 2 - point.y) / pixelsPerUnit + camera.position.y, z);
  }

  function screenBounds(position, w, h) {
    return {
      x: width / 2 + position.x * pixelsPerUnit,
      y: height / 2 - (position.y - camera.position.y) * pixelsPerUnit,
      width: w * pixelsPerUnit,
      height: h * pixelsPerUnit
    };
  }

  function getTargets() {
    if (!current || !pixelsPerUnit) return null;
    const size = device.scale.x * current.span;
    const aspect = deviceAspects[index];
    // A little room around the angled edges keeps both a card corner and a fob ring grabbable.
    const faceWidth = Math.min(size * aspect, size);
    const faceHeight = Math.min(size / aspect, size);
    const sin = Math.abs(Math.sin(device.rotation.z));
    const cos = Math.abs(Math.cos(device.rotation.z));
    const w = faceWidth * cos + faceHeight * sin + .2;
    const h = faceHeight * cos + faceWidth * sin + .2;
    const { x, y } = screenBounds(reach, 0, 0);
    return {
      device: screenBounds(device.position, w, h),
      reader: screenBounds(waves[0].position, 4.2, 5.9),
      home: { x, y }
    };
  }

  function updateScan(seconds, reduced, dragPosition, manual) {
    const scanComplete = seconds >= time.contact;
    const departure = reduced ? 0 : cue(seconds, time.burst, time.end) ** 1.35;
    const acquisition = reduced ? Number(scanComplete) : ease(cue(seconds, time.grasp, time.contact));
    const approach = ease(cue(seconds, 0, time.reach));
    const closing = reduced ? Number(scanComplete) : ease(cue(seconds, time.reach, time.grasp));

    current.open(0);
    device.position.copy(reach).lerp(tap, acquisition);
    device.position.y += .65 * Math.sin(Math.PI * acquisition);
    device.position.z += .75 * Math.sin(Math.PI * acquisition);
    device.position.lerp(contact, acquisition * .22);
    if (dragPosition) {
      const settle = scanComplete ? (reduced ? 1 : ease(cue(seconds, time.contact, time.contact + .22))) : 0;
      device.position.lerp(toScenePoint(dragPosition, reach.z), 1 - settle);
    }
    device.position.x += departure * 38;
    device.position.y -= departure * 9;
    const tilt = dragPosition && !reduced
      ? ease(cue(seconds, time.contact, time.contact + .22))
      : acquisition;
    device.rotation.set(.14 - .25 * tilt, -.21 + .52 * tilt + departure, -.3 + .27 * tilt - departure);
    device.scale.setScalar(sizes[index] / current.span);
    productShadow.visible = !departure;
    productShadow.material.opacity = .48;
    productShadow.position.set(device.position.x, device.position.y - (index === 1 ? 3.8 : 2.5), -.5);

    hand.group.visible = seconds > 0 && !manual;
    if (hand.group.visible) {
      hand.grip(closing);
      hand.group.rotation.set(-.24 + .32 * acquisition, .16 * acquisition, 2.48 + acquisition * .24 - departure * .62);
      handOffset.copy(gripAnchor).multiplyScalar(hand.group.scale.x).applyEuler(hand.group.rotation);
      offset.set(index === 2 ? 1.65 : index === 1 ? 1.45 : .76, index === 1 ? -1.9 : -.5, .13).applyEuler(device.rotation);
      hand.group.position.copy(device.position).add(offset).sub(handOffset);
      hand.group.position.x += (1 - approach) * 18;
      hand.group.position.y -= (1 - approach) * 12;
    }

    reader.body.visible = readerShadow.visible = true;
    reader.indicator.color.setHex(scanComplete ? 0x4af9a1 : 0x767e77);
    waves.forEach((ring, i) => {
      const start = time.burst + i * .075;
      const p = cue(seconds, start, time.end);
      ring.visible = !reduced && seconds > start && p < 1;
      if (!ring.visible) return;
      ring.scale.setScalar(.5 + (1 - (1 - p) ** 2) * 39);
      ring.material.opacity = (i ? .55 : .9) * (1 - p) ** 1.7;
    });
  }

  function drawScan(seconds, reduced, dragPosition, manual = false) {
    if (!current || !fitCamera()) return;
    updateScan(seconds, reduced, dragPosition, manual);
    renderer.render(scene, camera);
  }

  function drawHandoff(origin, progress) {
    if (!current || !fitCamera()) return;
    updateScan(0, false);
    device.position.lerp(toScenePoint(origin, reach.z), 1 - progress);
    landingRotation.set(origin.pitch, origin.yaw, origin.roll);
    device.quaternion.slerp(landingQuaternion.setFromEuler(landingRotation), 1 - progress);
    const size = T.MathUtils.lerp(origin.size / pixelsPerUnit, sizes[index], progress);
    device.scale.setScalar(size / current.span);
    productShadow.visible = progress > .5;
    productShadow.material.opacity *= clamp((progress - .5) * 2);
    const readerSlide = (1 - ease(cue(progress, .35, 1))) * width / pixelsPerUnit;
    reader.body.position.x -= readerSlide;
    readerShadow.position.x -= readerSlide;
    renderer.render(scene, camera);
    reader.body.position.x += readerSlide;
    readerShadow.position.x += readerSlide;
  }

  function drawInside(progress) {
    if (!current) return;
    const push = ease(progress);
    reader.body.visible = readerShadow.visible = hand.group.visible = false;
    for (const wave of waves) wave.visible = false;
    current.open(ease(cue(progress, .14, 1)));
    device.position.set(.14 + .22 * push, .14 + .8 * push, 1.9);
    device.rotation.set(.13 + push * .24, -.26 - push * .55, T.MathUtils.lerp(.34, -.08, push));
    const size = T.MathUtils.lerp(revealSizes[index], cutawaySizes[index], push);
    device.scale.setScalar(size / current.span);
    productShadow.visible = true;
    productShadow.position.set(.6, -2.9 - push * 1.65, -.5);
    productShadow.material.opacity = .48 - push * .18;
    if (fitCamera(1 + .12 * push, -.1 + .32 * push)) renderer.render(scene, camera);
  }

  return { showObject, drawScan, drawInside, drawHandoff, getTargets };
}
