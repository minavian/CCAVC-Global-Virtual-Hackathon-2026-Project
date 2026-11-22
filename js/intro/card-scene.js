import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { smoother } from './easing.js';
import { buildReader, SIZE, TOP, COIL_Z, COIL_HALF } from './reader-model.js';
import { buildEffects } from './effects.js';
import { HOVER, REST } from './cinema.js';

const cardURL = new URL('../../models/contactless-card.glb', import.meta.url);
const brass = new THREE.Color('#624725');

// The mouth (see `bendSheet`). At full open, the front layers rise HINGE radians in a soft
// crease by the right edge, and their free edge rolls CURL radians more.
const HINGE = .17;
const CURL = .40;
const CREASE = .16;   // the crease's width, as a share of the card's width
const SLICES = 72;    // strips the front layers are cut into, so they can bend smoothly
const STEPS = 16;     // Simpson steps when the shader follows the bent sheet

// Every material on the card gets its own copy, so the card can fade as a whole (the
// close-up) and the X-ray can fade the shell. `end` is how much of a shell layer stays
// in the X-ray; parts that are not shell keep all of theirs.
function getCardMaterials(card) {
  const fades = new Map([
    ['front-protective-overlay', .07], ['front-printed-pvc', .065],
    ['rear-protective-overlay', .24], ['rear-printed-pvc', .095],
    ['contact-plate', .045], ['module-substrate', .13], ['die-underfill', .24], ['inlay-carrier', .35],
    ['inlay-pocket-collar', .32], ['die-pocket-floor', .32],
  ]);
  const layers = [];
  card.traverse(part => {
    if (!part.isMesh) return;
    let end = 1, node = part;
    while (node && node !== card) {
      if (fades.has(node.name)) { end = fades.get(node.name); break; }
      node = node.parent;
    }
    const material = part.material = part.material.clone();
    layers.push({ material, end, shell: end < 1, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
  });
  return layers;
}

// Current in the card's coils, as pulses of light running round them. The coils are
// drawn by the model's own copper, so the glow follows the real traces: the angle round
// `uCenter` tells each point how far round the loop it is.
function currentShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCoil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoil = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCurrent; uniform float uPhase; uniform vec3 uCurrentColor; uniform vec2 uCenter;
        varying vec2 vCoil;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float around = atan(vCoil.y - uCenter.y, vCoil.x - uCenter.x) / 6.2831853;
        float pulse = pow(.5 + .5 * cos(6.2831853 * (around * 4. - uPhase)), 6.);
        totalEmissiveRadiance += uCurrentColor * uCurrent * (.2 + 4.2 * pulse);`);
  };
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
  // A cool light from behind, only in the close-up, so the dark reader keeps its edges
  // against the dark backdrop.
  const rim = new THREE.DirectionalLight(0xcfe4ff, 0);
  rim.position.set(-2, 5, -7);
  world.add(rim);

  const card = asset.scene.getObjectByName('contactless-card');
  const box = new THREE.Box3().setFromObject(card);
  const widthInMeters = box.max.x - box.min.x;
  const rig = new THREE.Group();
  rig.add(card);
  world.add(rig);
  card.position.sub(box.getCenter(new THREE.Vector3()));
  card.updateWorldMatrix(true, true);

  const layers = getCardMaterials(card);
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
  const edgeInk = new THREE.Color(0x514b42), edgeLight = new THREE.Color(0xd9d3c7);

  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(.0012, .046),
    new THREE.MeshBasicMaterial({ color: 0xdcc9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scan.position.z = .0011;
  scan.renderOrder = 11;
  card.add(scan);

  // The card's two coils: the big one round the edge, and the chip module's little one.
  // Each can carry a glowing current (see `currentShader`).
  const copper = [['perimeter-and-coupling-antenna', [0, 0]], ['module-antenna', [0, 0]]].map(([name, center]) => {
    const material = card.getObjectByName(name).material;
    const uniforms = {
      uCurrent: { value: 0 }, uPhase: { value: 0 },
      uCurrentColor: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector2(...center) },
    };
    currentShader(material, uniforms);
    material.needsUpdate = true;
    return { material, uniforms, original: material.color.clone(), metalness: material.metalness };
  });
  const die = card.getObjectByName('silicon-die').material;
  const dieGlow = new THREE.Color(0xfff1d6);

  // The reader and what moves between it and the card. The reader's frame (`table`) is
  // the stage for the close-up: the camera turns it, and the card docks onto it.
  const reader = buildReader();
  const table = new THREE.Group();
  table.add(reader.group);
  world.add(table);
  const fx = buildEffects();
  table.add(fx.table);
  card.add(fx.onCard);
  const warm = fx.WARM, cool = fx.COOL;
  const amber = new THREE.Color(0xff8a2a), green = new THREE.Color(0x3ee08f), mixColor = new THREE.Color(), ledMix = new THREE.Color();

  let width, height, glass = -1, fade = -1;
  let readerRest = { x: 0, y: 0, width: 1, opacity: 0 };
  const point = new THREE.Vector3();

  // The card's shown place, and where it was when it last changed course (`from`), so a
  // change of course is a blend, never a jump.
  const shown = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const goal = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const view = { zoom: 1, x: 0, y: 0, tilt: REST.tilt, spin: REST.spin, yaw: REST.yaw };
  const viewFrom = { ...view };
  let docking = false, releasedAt = -1;
  const RELEASE = 900;   // ms to undock and pull the camera back when the close-up is cancelled
  const hover = new THREE.Matrix4(), dockMatrix = new THREE.Matrix4(), hoverQuaternion = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1), tmpScale = new THREE.Vector3(), euler = new THREE.Euler();

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

  // Where the reader stands at rest: in place of the reader picture, behind the card.
  function setReader(rest) { readerRest = rest; }

  function placeTable(angles) {
    const scale = readerRest.width * .8 / (SIZE * 1.13);
    table.position.set(readerRest.x - width / 2, height / 2 - readerRest.y, -900);
    table.scale.setScalar(scale);
    table.rotation.set(-angles.tilt, angles.yaw, angles.spin, 'YXZ');
    table.updateMatrixWorld(true);
  }

  // How the card would stand from its scroll pose alone.
  function freePose(pose, out) {
    out.position.set(pose.x - width / 2, height / 2 - pose.y, 0);
    out.quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll, 'YXZ'));
    out.scale = pose.width / widthInMeters;
  }

  // Lying flat over the reader, `gap` metres above its top.
  function dockPose(gap, out) {
    hoverQuaternion.setFromAxisAngle(point.set(0, 0, 1), HOVER.spin);
    hover.compose(point.set(HOVER.x, HOVER.y, TOP + gap + .0004), hoverQuaternion, unitScale);
    dockMatrix.multiplyMatrices(table.matrixWorld, hover);
    dockMatrix.decompose(out.position, out.quaternion, tmpScale);
    out.scale = tmpScale.x;
  }

  function blend(a, b, k, out) {
    out.position.lerpVectors(a.position, b.position, k);
    out.quaternion.slerpQuaternions(a.quaternion, b.quaternion, k);
    out.scale = a.scale + (b.scale - a.scale) * k;
  }

  const copy = (a, b) => { b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale = a.scale; };

  // The close-up starts (or replays): the card sets off from where it is shown now.
  function capture() {
    copy(shown, from);
    docking = true;
    releasedAt = -1;
  }

  // The close-up is cancelled: the card and the camera glide back from where they are.
  function release() {
    if (!docking) return;
    copy(shown, from);
    Object.assign(viewFrom, view);
    docking = false;
    releasedAt = performance.now();
  }

  const releasing = () => releasedAt >= 0 && performance.now() - releasedAt < RELEASE;

  // Fades the card as a whole (`amount`) and its shell for the X-ray (`see`). In the dark
  // of the close-up (`clear`), the shell goes clearer still, so the copper stands out.
  let clearness = -1;
  function shade(see, amount, clear = 0) {
    if (see === glass && amount === fade && clear === clearness) return;
    const glassChanged = see !== glass;
    glass = see;
    fade = amount;
    clearness = clear;
    const faded = amount < .999;
    for (const layer of layers) {
      const { material } = layer;
      const shellSee = layer.shell ? glass : 0;
      const transparent = layer.transparent || shellSee > 0 || faded;
      if (transparent !== material.transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = (layer.shell && glass > 0) || faded ? false : layer.depthWrite;
      const end = layer.end * (1 - .6 * clear);
      material.opacity = THREE.MathUtils.lerp(layer.opacity, layer.opacity * end, shellSee) * amount;
    }
    if (glassChanged) {
      for (const { material, original, metalness } of copper) {
        material.color.copy(original).lerp(brass, glass * .83);
        material.emissive.copy(brass);
        material.emissiveIntensity = glass * .04;
        material.metalness = metalness * (1 - glass * .71);
      }
      scan.visible = glass > .025 && glass < .975;
      scan.position.x = THREE.MathUtils.lerp(-.037, .037, glass);
      scan.material.opacity = Math.sin(Math.PI * glass) * .5;
    }
    edge.visible = glass > 0;
    edge.material.opacity = glass * .82 * amount;
  }

  // `pose` comes from the scroll (main.js). `shot` is the close-up's beats (cinema.js)
  // with its camera in `shot.view`, or null when there is no close-up.
  function draw(pose, shot = null) {
    const now = performance.now();
    bend.hinge.value = pose.mouth * HINGE;
    bend.curl.value = (pose.curl ?? pose.mouth) * CURL;

    // The camera's angle on the reader, and its zoom.
    const back = releasing() ? smoother(0, RELEASE, now - releasedAt) : 1;
    if (shot) {
      Object.assign(view, { zoom: shot.view.zoom, tilt: shot.view.tilt, spin: shot.view.spin, yaw: shot.view.yaw });
    } else if (releasedAt >= 0) {
      view.zoom = Math.exp(Math.log(viewFrom.zoom) * (1 - back));
      view.tilt = viewFrom.tilt + (REST.tilt - viewFrom.tilt) * back;
      view.spin = viewFrom.spin + (REST.spin - viewFrom.spin) * back;
      view.yaw = viewFrom.yaw + (REST.yaw - viewFrom.yaw) * back;
      view.x = viewFrom.x * (1 - back);
      view.y = viewFrom.y * (1 - back);
    } else {
      Object.assign(view, { zoom: 1, x: 0, y: 0, tilt: REST.tilt, spin: REST.spin, yaw: REST.yaw });
    }
    placeTable(view);

    // The card: free, docking onto the reader, or gliding back after a cancel.
    freePose(pose, goal);
    if (shot) {
      dockPose(shot.gap, goal);
      blend(from, goal, shot.dock, shown);
    } else if (releasing()) {
      blend(from, goal, back, shown);
    } else {
      copy(goal, shown);
    }
    rig.position.copy(shown.position);
    rig.quaternion.copy(shown.quaternion);
    rig.scale.setScalar(shown.scale);

    if (shot) {
      // Keep the point being looked at where the shot wants it on screen.
      point.set(...shot.view.focus);
      table.localToWorld(point);
      view.x = point.x - (shot.view.anchor[0] - .5) * width / view.zoom;
      view.y = point.y - (.5 - shot.view.anchor[1]) * height / view.zoom;
    }
    camera.zoom = view.zoom;
    camera.position.set(view.x, view.y, 1700);
    camera.updateProjectionMatrix();

    const dark = shot ? shot.dark : 0;
    rim.intensity = 2.4 * dark;
    shade(shot ? shot.xray : pose.xray, shot ? shot.cardFade : 1, dark);
    edge.material.color.copy(edgeInk).lerp(edgeLight, dark);

    // Current in the card's coils: the reader's power coming in (warm), the answer going out (cool).
    const b = shot ?? {};
    const [perimeter, module] = copper;
    const incoming = b.receive ?? 0, outgoing = b.reply ?? 0;
    perimeter.uniforms.uCurrent.value = Math.max(incoming * .9 + outgoing * 1.1, (b.hint ?? 0) * .5);
    perimeter.uniforms.uPhase.value = b.cardFlow ?? 0;
    perimeter.uniforms.uCurrentColor.value.copy(warm).lerp(cool, outgoing / Math.max(.001, incoming + outgoing));
    module.uniforms.uCurrent.value = Math.max((b.sparks ?? 0) * 1.4, (b.power ?? 0) * .45, outgoing);
    module.uniforms.uPhase.value = (b.cardFlow ?? 0) * 1.6;
    module.uniforms.uCurrentColor.value.copy(warm).lerp(cool, outgoing);
    die.emissive.copy(dieGlow);
    die.emissiveIntensity = (b.power ?? 0) * .5 + (b.blink ?? 0) * 3.2;

    // The reader: the shell goes see-through to show its coil, and the coil carries the
    // signal out (warm), then the answer in (cool).
    const read = b.read ?? 0, emit = b.emit ?? 0;
    let led = [amber, 1.6];
    if (shot && shot.check > 0) led = [ledMix.copy(amber).lerp(green, shot.check), 1.6 + shot.check * 1.4];
    else if (read > .05) led = [ledMix.copy(amber).lerp(cool, b.thinking), 1.6 + b.thinking * 1.6];
    reader.set({
      opacity: readerRest.opacity * (shot ? shot.readerFade : 1),
      shellOpacity: shot ? shot.readerShell : 1,
      glow: Math.max(emit, read * 1.15),
      flow: shot ? (read > emit ? -shot.flow * 1.3 : shot.flow) : 0,
      color: mixColor.copy(warm).lerp(cool, read / Math.max(.001, read + emit)),
      led,
      thinking: b.thinking ?? 0,
    });

    if (shot) fx.update(shot, TOP + shot.gap + .0004, HOVER.spin);
    else fx.table.visible = fx.onCard.visible = false;
    renderer.toneMappingExposure = .98 + dark * .12;
    renderer.render(world, camera);
  }

  function toScreen(v) {
    v.project(camera);
    return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 };
  }

  function project(x, y, z) {
    point.set(x, y, z);
    return toScreen(card.localToWorld(point));
  }

  // Points the close-up's notes point at, on screen.
  function anchor(name) {
    if (name === 'chip') return project(-.0277, .0031, .0004);
    if (name === 'cardCoil') return project(.0352, -.0205, .0002);
    if (name === 'readerCoil') return toScreen(table.localToWorld(point.set(COIL_HALF - .001, -.016, COIL_Z)));
    return toScreen(table.localToWorld(point.set(0, .006, TOP)));   // the reader's top
  }

  // The middle of the open mouth, near the free edge: halfway between the lifted lip and
  // the layer under it. The letters fly out from here, so they always leave the gap itself.
  function mouth() {
    const u = sheet.width - .0035;
    const [along, up] = sheetPoint(u, bend.hinge.value, bend.curl.value, sheet.width);
    const lipX = sheet.hingeX - along, lipZ = sheet.pivotZ + up;
    return project((lipX + sheet.hingeX - u) / 2, .002, (lipZ + sheet.pivotZ) / 2 + .0006);
  }

  return { resize, draw, project, mouth, anchor, setReader, capture, release, busy: releasing, parts: { copper, die, reader, renderer } };
}
