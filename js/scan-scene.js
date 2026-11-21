import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createScanHand } from './scan-hand.js';
import { SCAN_TIMING as time } from './scan-timing.js';

const sizes = [3.6, 7.7, 6.05];
const revealSizes = [6.5, 6.9, 5.6];
const cutawaySizes = [5.1, 8.05, 9.5];
const deviceAspects = [.56, .49, 1.58];
const reach = new T.Vector3(3.2, 1.35, 2.6);
const tap = new T.Vector3(-2.35, .05, 2.35);
const contact = new T.Vector3(-3.56, -.35, 8);
const revealPosition = new T.Vector3(0, .05, 1.9);
const revealRotation = new T.Euler(.13, -.26, .25);
const revealQuaternion = new T.Quaternion().setFromEuler(revealRotation);
const revealShadow = new T.Vector3(.3, -2.75, -.5);
const revealCameraY = -.1;
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
  body.position.set(-3.65, -.53, .1);
  body.rotation.set(-.26, .25, -.1);

  function caseLayer(width, height, thickness, radius, z, surface) {
    const geometry = new RoundedBoxGeometry(width, height, thickness, 4, radius);
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial(surface));
    mesh.position.z = z;
    body.add(mesh);
  }
  caseLayer(4.5, 6.3, .8, .21, 0, { color: 0x4b5050, metalness: .45, roughness: .38 });
  caseLayer(4.39, 6.19, .36, .16, .37, { color: 0x151a1d, metalness: .22, roughness: .28 });
  caseLayer(3.92, 4.7, .11, .055, .54, { color: 0x202828, metalness: .24, roughness: .3 });

  function paintContactless(ctx, width, height) {
    ctx.translate(width / 2, height * .52);
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      ctx.arc(-30, 0, ring * 18 + 5, -.57, .57);
      ctx.stroke();
    }
  }

  const print = paintedTexture(384, 460, (ctx, width, height) => {
    ctx.strokeStyle = '#aab8b3';
    paintContactless(ctx, width, height);
    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#a7b6af';
    ctx.fillText('CONTACTLESS', 0, 92);
  });
  const face = new T.Mesh(new T.PlaneGeometry(3.92, 4.7), new T.MeshBasicMaterial({ map: print, transparent: true }));
  face.position.z = .6;
  body.add(face);

  const glow = new T.MeshBasicMaterial({
    map: paintedTexture(384, 460, (ctx, width, height) => {
      ctx.strokeStyle = ctx.shadowColor = '#ffe6c4';
      ctx.shadowBlur = 10;
      paintContactless(ctx, width, height);
    }),
    blending: T.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false
  });
  const illumination = new T.Mesh(face.geometry, glow);
  illumination.position.z = .603;
  body.add(illumination);

  const indicator = new T.MeshBasicMaterial({ color: 0x767e77, toneMapped: false });
  const lamp = new T.Mesh(new RoundedBoxGeometry(.63, .095, .08, 3, .04), indicator);
  lamp.position.set(-1.3, -2.62, .56);
  body.add(lamp);
  return { body, glow, indicator, idleLight: new T.Color(0x767e77), readyLight: new T.Color(0xffd99f) };
}

export async function createScanScene(viewport, redraw) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .82;

  const scene = new T.Scene();
  const room = new RoomEnvironment();
  const studio = new T.PMREMGenerator(renderer);
  scene.environment = studio.fromScene(room, .04).texture;
  scene.environmentIntensity = .95;
  studio.dispose();
  room.dispose();
  scene.add(new T.HemisphereLight(0xfffcf6, 0x928f86, .95));
  for (const [x, y, z, intensity] of [[-4, 6, 5, 1.85], [4, 3, -3, 1.4]]) {
    const light = new T.DirectionalLight(0xfffaf0, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }

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
  readerShadow.position.set(-3.4, -3.82, -.7);
  readerShadow.scale.set(6.1, 1.15, 1);
  scene.add(readerShadow);
  const productShadow = new T.Sprite(new T.SpriteMaterial({ map: shadowMap, depthWrite: false, opacity: .48 }));
  productShadow.scale.set(7, 1.4, 1);
  scene.add(productShadow);

  const waves = [0, 1, 2].map(i => {
    const ring = new T.Mesh(new T.RingGeometry(i ? .985 : .954, 1, 100), new T.MeshBasicMaterial({
      color: i ? 0x69cda1 : 0x25aa77, transparent: true, depthWrite: false, depthTest: false, toneMapped: false
    }));
    ring.position.copy(contact);
    ring.rotation.set(-.31, .17, 0);
    ring.renderOrder = 2;
    scene.add(ring);
    return ring;
  });

  const loader = new GLTFLoader();
  let hand;
  createScanHand(T, loader).then(model => {
    hand = model;
    hand.group.visible = false;
    hand.group.scale.setScalar(.55);
    scene.add(hand.group);
  }).catch(() => { /* The card can still follow the keyboard scan without the hand. */ });
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
  const readerOrigin = reader.body.position.clone();
  const readerShadowOrigin = readerShadow.position.clone();
  const readerRoll = reader.body.rotation.z;
  let current, index, width, height;
  let pixelsPerUnit, openProgress = 0;

  async function showObject(nextIndex, sharedObject) {
    if (index === nextIndex && (!sharedObject || sharedObject === current)) return;
    let model = sharedObject || models.get(nextIndex);
    if (!model) {
      model = await window.RFIDModels.loadObject(T, loader, { matches: true }, nextIndex);
      models.set(nextIndex, model);
    }
    current = model;
    index = nextIndex;
    device.clear();
    device.add(current.model);
  }

  function releaseObject() {
    if (!current) return null;
    const model = current;
    if (models.get(index) === model) models.delete(index);
    device.remove(model.model);
    current = index = undefined;
    return model;
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

  function getDevicePose() {
    if (!current || !pixelsPerUnit) return null;
    const bounds = viewport.getBoundingClientRect();
    const { x, y } = screenBounds(device.position, 0, 0);
    const { x: pitch, y: yaw, z: roll } = landingRotation.setFromQuaternion(device.quaternion, 'YXZ');
    return { x: bounds.left + x, y: bounds.top + y, size: device.scale.x * current.span * pixelsPerUnit, pitch, yaw, roll, open: openProgress };
  }

  function openDevice(progress) {
    current.open(progress);
    openProgress = progress;
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

  function updateScan(seconds, reduced, dragPosition, manual, sweep = 0, guidance) {
    const scanComplete = seconds >= time.contact;
    const acquisition = reduced ? Number(scanComplete) : ease(cue(seconds, time.grasp, time.contact));
    const approach = ease(cue(seconds, 0, time.reach));
    const closing = reduced ? Number(scanComplete) : ease(cue(seconds, time.reach, time.grasp));

    device.position.copy(reach).lerp(tap, acquisition);
    device.position.y += .65 * Math.sin(Math.PI * acquisition);
    device.position.z += .75 * Math.sin(Math.PI * acquisition);
    device.position.x = T.MathUtils.lerp(device.position.x, contact.x, acquisition * .22);
    if (dragPosition) {
      const settle = scanComplete ? (reduced ? 1 : ease(cue(seconds, time.contact, time.contact + .22))) : 0;
      device.position.lerp(toScenePoint(dragPosition, reach.z), 1 - settle);
    }
    const tilt = dragPosition && !reduced
      ? ease(cue(seconds, time.contact, time.contact + .22))
      : acquisition;
    device.rotation.set(.14 - .25 * tilt, -.21 + .52 * tilt, -.3 + .27 * tilt);
    const { attention = 0, proximity = 0, inviting = 0, hoverX = 0, hoverY = 0, hoverWave = 0 } = guidance ?? {};
    const poised = !reduced && seconds === 0 ? clamp(attention) : 0;
    const lean = !reduced && seconds === 0 ? clamp(inviting) : 0;
    device.position.z += .52 * poised + .12 * lean;
    device.rotation.x += (.12 - .13 * hoverY + .025 * hoverWave) * poised;
    device.rotation.y += (.17 * hoverX - .10) * poised - .12 * lean;
    device.rotation.z += .035 * hoverWave * poised - .025 * lean;
    productShadow.visible = true;
    productShadow.material.opacity = .48 - .10 * poised - .04 * lean;
    productShadow.position.set(device.position.x, device.position.y - (index === 1 ? 3.8 : 2.5), -.5);

    const readerExit = reduced ? 0 : ease(cue(seconds, time.burst + .025, time.reveal - .035));
    const handExit = reduced ? 0 : ease(cue(seconds, time.burst, time.reveal - .02));
    const edge = width / (pixelsPerUnit * 2);
    if (hand) hand.group.visible = seconds > 0 && !manual && handExit < 1;
    if (hand?.group.visible) {
      hand.grip(closing);
      hand.group.rotation.set(-.24 + .32 * acquisition, .16 * acquisition, 2.48 + acquisition * .24 - handExit * .45);
      handOffset.copy(gripAnchor).multiplyScalar(hand.group.scale.x).applyEuler(hand.group.rotation);
      offset.set(index === 2 ? 1.65 : index === 1 ? 1.45 : .76, index === 1 ? -1.9 : -.5, .13).applyEuler(device.rotation);
      hand.group.position.copy(device.position).add(offset).sub(handOffset);
      hand.group.position.x += (1 - approach) * 18;
      hand.group.position.y -= (1 - approach) * 12;
      hand.group.position.x += (edge + 16) * handExit;
      hand.group.position.y -= 9 * handExit;
    }

    // The wave carries the card towards the center while it pushes the reader offscreen.
    const carry = ease(sweep);
    const lift = 4 * carry * (1 - carry);
    device.position.lerp(revealPosition, carry);
    device.position.x += .62 * lift;
    device.position.y += 1.16 * lift;
    device.position.z += .45 * lift;
    device.quaternion.slerp(revealQuaternion, carry);
    device.scale.setScalar(T.MathUtils.lerp(sizes[index], revealSizes[index], carry) / current.span);
    productShadow.position.lerp(revealShadow, carry);
    reader.body.visible = readerShadow.visible = readerExit < 1;
    reader.body.position.copy(readerOrigin);
    readerShadow.position.copy(readerShadowOrigin);
    reader.body.position.x -= (edge + 5) * readerExit;
    reader.body.position.y -= 5 * readerExit;
    readerShadow.position.x -= (edge + 5) * readerExit;
    readerShadow.position.y -= 5 * readerExit;
    reader.body.rotation.z = readerRoll + .42 * readerExit;
    readerShadow.material.opacity = .76 * (1 - readerExit);
    const ready = clamp(Math.max(proximity, inviting * .26));
    const lit = scanComplete && dragPosition ? 1 - readerExit : ready;
    reader.glow.opacity = .9 * lit;
    reader.glow.visible = lit > 0;
    if (scanComplete) reader.indicator.color.setHex(0x4af9a1);
    else reader.indicator.color.lerpColors(reader.idleLight, reader.readyLight, ready);
    const sweepRadius = Math.hypot(edge + Math.abs(contact.x), camera.top + Math.abs(contact.y)) + 4;
    waves.forEach((ring, i) => {
      const start = time.burst + i * .075;
      const p = cue(seconds, start, time.end);
      ring.visible = !reduced && seconds > start && p < 1;
      if (!ring.visible) return;
      ring.scale.setScalar(.5 + (1 - (1 - p) ** 1.6) * sweepRadius);
      ring.material.opacity = (i ? .55 : .9) * (1 - p) ** 1.7;
    });
  }

  function drawScan(seconds, reduced, dragPosition, manual = false, guidance) {
    const sweep = reduced ? 0 : cue(seconds, time.burst, time.end);
    if (!current || !fitCamera(1, revealCameraY * ease(sweep))) return;
    openDevice(0);
    updateScan(seconds, reduced, dragPosition, manual, sweep, guidance);
    renderer.render(scene, camera);
  }

  function drawHandoff(origin, progress) {
    if (!current || !fitCamera()) return;
    openDevice((origin.open ?? 0) * (1 - progress));
    updateScan(0, false);
    device.position.lerp(toScenePoint(origin, reach.z), 1 - progress);
    landingRotation.set(origin.pitch, origin.yaw, origin.roll, 'YXZ');
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

  function setInsidePose(push) {
    reader.body.visible = readerShadow.visible = false;
    if (hand) hand.group.visible = false;
    for (const wave of waves) wave.visible = false;
    device.position.copy(revealPosition);
    device.position.x += .22 * push;
    device.position.y += .8 * push;
    device.rotation.set(revealRotation.x + push * .24, revealRotation.y - push * .55, T.MathUtils.lerp(revealRotation.z, -.08, push));
    const size = T.MathUtils.lerp(revealSizes[index], cutawaySizes[index], push);
    device.scale.setScalar(size / current.span);
    productShadow.visible = true;
    productShadow.position.copy(revealShadow);
    productShadow.position.y -= push * 1.65;
    productShadow.material.opacity = .48 - push * .18;
  }

  function drawInside(progress) {
    const push = ease(progress);
    if (!current || !fitCamera(1 + .12 * push, revealCameraY + .32 * push)) return;
    setInsidePose(push);
    openDevice(ease(cue(progress, .14, 1)));
    renderer.render(scene, camera);
  }

  function drawRiver(progress, target) {
    const amount = ease(progress);
    const cutaway = 1 - amount;
    if (!current || !fitCamera(1 + .12 * cutaway, (revealCameraY + .32) * cutaway)) return;
    setInsidePose(1);
    openDevice(1 - ease(cue(progress, 0, .78)));
    device.position.lerp(toScenePoint(target, revealPosition.z), amount);
    landingRotation.set(target.pitch, target.yaw, target.roll, target.order ?? 'YXZ');
    device.quaternion.slerp(landingQuaternion.setFromEuler(landingRotation), amount);
    device.scale.setScalar(T.MathUtils.lerp(cutawaySizes[index], target.size / pixelsPerUnit, amount) / current.span);
    productShadow.material.opacity *= cutaway;
    renderer.render(scene, camera);
  }

  return { showObject, releaseObject, drawScan, drawInside, drawHandoff, drawRiver, getDevicePose, getTargets };
}
