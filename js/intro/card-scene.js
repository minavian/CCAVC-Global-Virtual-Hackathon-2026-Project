import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildReader, SIZE, TOP, CHIP as READER_CHIP } from './reader-model.js';
import { buildEffects } from './effects.js';
import { buildField } from './field.js';
import { HOVER } from './cinema.js';

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
// in the X-ray; parts that are not shell keep all of theirs. The coils are marked, so the
// close-up can dim them on their own.
const COILS = ['perimeter-and-coupling-antenna', 'module-antenna'];
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
    layers.push({ material, end, shell: end < 1, copper: COILS.includes(part.name),
      opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
  });
  return layers;
}

// Current in the card's coils, as comets of colour running round them: a solid head with
// a tail fading out behind, so the direction of the current is plain to see. In the
// conversation the current is shown steady instead (`uSteady`): it is an alternating
// current, and there what matters is how strong it is from moment to moment. The coils are
// drawn by the model's own copper, so the glow follows the real traces. Each point works
// out how far round its loop it is from where it sits: which side of the loop's rectangle
// it is nearest (`uLoop`: centre and half size), and how far along that side. Each turn
// further in starts a little further round, as on one wire wound inward. The big coil
// also has a small coupling loop round the chip module (`uInner`); points inside it use that.
function currentShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCoil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoil = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCurrent; uniform float uPhase; uniform float uDir; uniform float uCount; uniform float uStagger; uniform float uNeutral; uniform float uSteady;
        uniform vec3 uCurrentColor; uniform vec4 uLoop; uniform vec4 uInner;
        varying vec2 vCoil;
        // How far round the loop a point is (0 to 1, counter-clockwise from the middle of
        // the right side), plus a little more for each turn in.
        float loopAlong(vec2 p, vec4 loop) {
          vec2 q = p - loop.xy, h = loop.zw;
          float right = h.x - q.x, top = h.y - q.y, left = h.x + q.x, bottom = h.y + q.y;
          float inset = min(min(right, top), min(left, bottom));
          float t = q.y;                                                   // right side
          if (inset == top) t = h.y + (h.x - q.x);
          else if (inset == left) t = h.y + 2. * h.x + (h.y - q.y);
          else if (inset == bottom) t = 3. * h.y + 2. * h.x + (q.x + h.x);
          return t / (4. * (h.x + h.y)) + inset * uStagger;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec4 loop = uLoop;
        if (uInner.z > 0. && abs(vCoil.x - uInner.x) < uInner.z + .0011 && abs(vCoil.y - uInner.y) < uInner.w + .0011) loop = uInner;
        float cometAt = fract(uDir * loopAlong(vCoil, loop) * uCount - uPhase);
        float comet = mix(pow(cometAt, 2.6) * (1. - smoothstep(.95, 1., cometAt)), .55, uSteady);`)
      // The colour goes on after tone mapping, so the light page can't wash it out. Under
      // a blue current the copper first turns grey (uNeutral), or blue over orange would
      // read as purple.
      .replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722))), clamp(uNeutral, 0., 1.) * .9);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uCurrentColor, clamp(uCurrent * (.06 + .94 * comet), 0., 1.));`);
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
  // Two lenses. A flat one (no perspective, like a plan drawing) for the drag and most of the
  // close-up, and a real one for the shots with a `fov` (cinema.js), whose depth opens up
  // as the camera moves in. `lens` is the one drawing this frame.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3500);
  camera.position.z = 1700;
  const deep = new THREE.PerspectiveCamera(30, 1, 1, 10000);
  let lens = camera, depth = 0;
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
  const sky = new THREE.HemisphereLight(0xfffcf5, 0x93938e, 1.2);
  world.add(sky);
  const keys = [[-5, 8, 6, 0xfffbf3, 2.25], [6, 2, -6, 0xe4e4e0, 2.8]].map(([x, y, z, color, intensity]) => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    world.add(light);
    return { light, intensity };
  });
  // With the lights down (the conversation), a cool light from behind picks out the edges.
  const rim = new THREE.DirectionalLight(0x9dbdff, 0);
  rim.position.set(-6, 5, -9);
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

  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(.0012, .046),
    new THREE.MeshBasicMaterial({ color: 0xdcc9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scan.position.z = .0011;
  scan.renderOrder = 11;
  card.add(scan);

  // The card's two coils: the big one round the edge (with its small coupling loop round
  // the chip module), and the chip module's little one. Each can carry a current (see
  // `currentShader`). Their loops are the coils' outer turns, in each mesh's own frame.
  const coils = [
    ['perimeter-and-coupling-antenna', [-.0003, 0, .0408, .0246], [-.0278, .0031, .006, .0054], 6, 100],
    ['module-antenna', [0, 0, .0061, .0054], [0, 0, 0, 0], 2, 220],
  ];
  const copper = coils.map(([name, loop, inner, count, stagger]) => {
    const material = card.getObjectByName(name).material;
    const uniforms = {
      uCurrent: { value: 0 }, uPhase: { value: 0 }, uDir: { value: 1 }, uCount: { value: count },
      uStagger: { value: stagger }, uNeutral: { value: 0 }, uSteady: { value: 0 }, uCurrentColor: { value: new THREE.Color() },
      uLoop: { value: new THREE.Vector4(...loop) }, uInner: { value: new THREE.Vector4(...inner) },
    };
    currentShader(material, uniforms);
    material.needsUpdate = true;
    return { material, uniforms, original: material.color.clone(), metalness: material.metalness };
  });
  const die = card.getObjectByName('silicon-die').material;
  const dieGlow = new THREE.Color('#ff9a2e');

  // The reader and what moves between it and the card. The reader's frame (`table`) is
  // the stage for the close-up: the camera turns it, and the card docks onto it.
  const reader = buildReader();
  const table = new THREE.Group();
  table.add(reader.group);
  world.add(table);
  const fx = buildEffects();
  table.add(fx.table);
  card.add(fx.onCard);
  const field = buildField();
  table.add(field.group);
  const warm = fx.WARM, cool = fx.COOL;
  // The reader's light: cool white at rest, blue while it reads, green once it has checked.
  const idle = new THREE.Color(0xd8e6ff), reading = new THREE.Color(0x3f8cff), green = new THREE.Color(0x22c55e);
  const mixColor = new THREE.Color(), ledMix = new THREE.Color();

  let width, height, glass = -1, fade = -1, copperFade = -1;
  let readerRest = { x: 0, y: 0, width: 1, opacity: 0 };
  const point = new THREE.Vector3();

  // The card's place: free (following the drag on screen), lying over the reader, and the
  // blend of the two that is shown.
  const free = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const docked = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const shown = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const camera2D = { x: 0, y: 0, zoom: 1 };
  const hover = new THREE.Matrix4(), dockMatrix = new THREE.Matrix4(), hoverQuaternion = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1), tmpScale = new THREE.Vector3(), euler = new THREE.Euler();
  // While the card is dragged, the camera pushes in a little and the card grows with it, up
  // to this much. Beyond it (the close-ups after the drop) the free card keeps its size.
  const GROW = 1.3;

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

  // The card where the drag puts it: locked to its place on the screen, whatever the camera
  // does, so it stays under the finger.
  function freePose(pose, out) {
    const { x, y, zoom } = camera2D;
    out.position.set(x + (pose.x - width / 2) / zoom, y + (height / 2 - pose.y) / zoom, 0);
    out.quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll, 'YXZ'));
    out.scale = pose.width / widthInMeters * Math.min(zoom, GROW) / zoom;
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

  // Fades the card as a whole (`amount`), its shell for the X-ray (`see`) and its coils
  // on their own (`coil`), so the close-up can show one part and dim the rest. In the
  // close-up's X-ray (`clear`) every shell layer goes down to a fifth or less, so the
  // copper and the chip are what you see.
  let clearness = -1;
  function shade(see, amount, coil, clear) {
    if (see === glass && amount === fade && coil === copperFade && clear === clearness) return;
    const glassChanged = see !== glass;
    glass = see;
    fade = amount;
    copperFade = coil;
    clearness = clear;
    for (const layer of layers) {
      const { material } = layer;
      const shellSee = layer.shell ? glass : 0;
      const value = amount * (layer.copper ? coil : 1);
      const faded = value < .999;
      const transparent = layer.transparent || shellSee > 0 || faded;
      if (transparent !== material.transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = (layer.shell && glass > 0) || faded ? false : layer.depthWrite;
      const end = Math.min(layer.end, THREE.MathUtils.lerp(layer.end, .18, clear));
      material.opacity = THREE.MathUtils.lerp(layer.opacity, layer.opacity * end, shellSee) * value;
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

  // `pose` is the card on the screen (main.js: the scroll, the drag). `b` is what the
  // close-up shows (cinema.js levels, glided), with its camera in `b.view` and its live
  // clock in `b.clock`.
  function draw(pose, b) {
    bend.hinge.value = pose.mouth * HINGE;
    bend.curl.value = (pose.curl ?? pose.mouth) * CURL;

    // The camera: its angle on the reader, its zoom, and the point it keeps in place.
    const view = b.view;
    placeTable(view);
    point.set(...view.focus);
    table.localToWorld(point);
    camera2D.zoom = view.zoom;
    camera2D.x = point.x - (view.at[0] - .5) * width / view.zoom;
    camera2D.y = point.y - (.5 - view.at[1]) * height / view.zoom;
    camera.zoom = view.zoom;
    camera.position.set(camera2D.x, camera2D.y, 1700);
    camera.updateProjectionMatrix();
    // With a field of view, the real lens: as far back as keeps the focus point the same
    // size on screen, so widening the view while moving in keeps the framing (a dolly zoom).
    const fov = view.fov || 0;
    if (fov > .35) {
      depth = height / view.zoom / 2 / Math.tan(fov * Math.PI / 360);
      deep.fov = fov;
      deep.aspect = width / height;
      deep.position.set(camera2D.x, camera2D.y, point.z + depth);
      deep.near = Math.max(.5, depth * .02);
      deep.far = depth + 6000;
      deep.updateProjectionMatrix();
      lens = deep;
    } else {
      lens = camera;
      depth = 0;
    }

    // The card: free, lying on the reader, or on its way between the two.
    freePose(pose, free);
    if (depth) {
      // The free card is placed as on the flat lens. With depth it stands a little in front
      // of the focus, scaled back so it still looks the same size and in the same place.
      const ahead = Math.min(400, depth * .5), k = (depth - ahead) / depth;
      free.position.set(camera2D.x + (free.position.x - camera2D.x) * k, camera2D.y + (free.position.y - camera2D.y) * k, point.z + ahead);
      free.scale *= k;
    }
    dockPose(b.gap, docked);
    blend(free, docked, b.dock, shown);
    rig.position.copy(shown.position);
    rig.quaternion.copy(shown.quaternion);
    rig.scale.setScalar(shown.scale);

    shade(Math.max(pose.xray, b.xray), b.card, b.copper, b.xray);

    // Current in the card's coils: the reader's power coming in (warm, one way round), the
    // answer going out (cool, the other way).
    const clock = b.clock;
    const [perimeter, module] = copper;
    // In the conversation (cinema.js `message`): `amp` is the reader's field right now, and
    // the card's coil current follows it at once (it stops in each gap); `load` is the card's
    // switch, which changes that current while it answers (blue).
    const said = b.message?.started ? b.message : null;
    const amp = said ? said.amp : 1, load = said ? said.load * (b.echo || 0) : 0;
    const steady = b.lines || 0;
    // Orange and blue would mix to purple, so the colour switches over quickly.
    const share = Math.max(load, b.reply / Math.max(.001, b.reply + Math.max(b.receive, b.power)));
    const answering = share > .5, tint = THREE.MathUtils.smoothstep(share, .4, .6);
    perimeter.uniforms.uCurrent.value = Math.max(b.receive * amp, b.reply, load * .9);
    perimeter.uniforms.uDir.value = answering ? -1 : 1;
    perimeter.uniforms.uPhase.value = clock * 1.1;
    perimeter.uniforms.uSteady.value = steady;
    perimeter.uniforms.uCurrentColor.value.copy(warm).lerp(cool, tint);
    perimeter.uniforms.uNeutral.value = tint * Math.min(1, Math.max(b.reply, load) * 1.5);
    module.uniforms.uCurrent.value = Math.max(b.power * (steady ? amp : 1), b.receive * .6 * amp, b.reply, load * .9);
    module.uniforms.uDir.value = answering ? -1 : 1;
    module.uniforms.uPhase.value = clock * 1.4;
    module.uniforms.uSteady.value = steady;
    module.uniforms.uCurrentColor.value.copy(warm).lerp(cool, tint);
    module.uniforms.uNeutral.value = tint * Math.min(1, Math.max(b.reply, load) * 1.5);
    const work = b.blink * (.5 + .5 * Math.sin(clock * Math.PI * 2 * 1.8)) ** 2;
    die.emissive.copy(dieGlow);
    die.emissiveIntensity = b.power * .6 + work * 2.4;

    // The reader: its body goes see-through to show its coil, and the coil carries the
    // signal out (warm), then the answer in toward the reader's chip (cool). In the
    // conversation its coil carries the field's current all along: it goes out in each gap,
    // and dips a little each time the card's switch closes, as the reader feels the answer.
    const sending = said ? b.emit * amp * (1 - .3 * load) : Math.max(b.emit, b.read);
    const reading = said ? 0 : THREE.MathUtils.smoothstep(b.read / Math.max(.001, b.read + b.emit), .4, .6);
    let led = [idle, 1.1];
    if (b.check > .01) led = [ledMix.copy(idle).lerp(green, b.check), 1.1 + b.check * 1.6];
    else if (b.read > .05) led = [ledMix.copy(idle).lerp(reading, b.read), 1.1 + b.read * 1.2];
    reader.set({
      opacity: readerRest.opacity * b.reader,
      shellOpacity: b.shell,
      glow: sending,
      flow: clock * (b.read > b.emit ? 1.1 : .9),
      direction: b.read > b.emit ? 1 : -1,
      steady,
      color: mixColor.copy(warm).lerp(cool, reading),
      neutral: said ? 0 : reading * Math.min(1, b.read * 1.5),
      led,
      thinking: b.thinking * (.6 + .4 * Math.sin(clock * Math.PI * 2 * 1.4)),
    });

    fx.update(b, TOP + b.gap + .0004, HOVER.spin, { amp, load, steady });
    field.update({ lines: b.lines || 0, amp, echo: b.echo || 0, load: said ? said.load : 0 });

    // The lights go down for the conversation: less room light, more rim.
    const dark = b.dark || 0;
    world.environmentIntensity = .82 * (1 - .58 * dark);
    sky.intensity = 1.2 * (1 - .62 * dark);
    for (const { light, intensity } of keys) light.intensity = intensity * (1 - .45 * dark);
    rim.intensity = 3.4 * dark;
    renderer.render(world, lens);
  }

  function toScreen(v) {
    v.project(lens);
    return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 };
  }

  function project(x, y, z) {
    point.set(x, y, z);
    return toScreen(card.localToWorld(point));
  }

  // Points the close-up's marks are placed by, on screen.
  function anchor(name) {
    if (name === 'chip') return project(-.0277, .0031, .0004);
    if (name === 'readerChip') return toScreen(table.localToWorld(point.set(READER_CHIP.x, READER_CHIP.y, READER_CHIP.z + .002)));
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

  return { resize, draw, project, mouth, anchor, setReader, parts: { copper, die, reader, renderer, table, card, rig, camera, world } };
}
