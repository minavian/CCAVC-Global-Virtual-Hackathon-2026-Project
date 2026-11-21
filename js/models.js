/*
 * The three everyday RFID objects, loaded from the team's GLB models in /models.
 * Each GLB is centered, in meters, Y up, front facing +Z, with named parts.
 *
 * window.RFIDModels.load(THREE, GLTFLoader, reduceMotion) resolves to three objects
 * in carousel order, each { name, model, span, action }:
 *   model  a THREE.Group to place in a scene
 *   span   the model's larger side (width or height), for scaling it to a pixel size
 *   action { arrive?(t), activate(t), present?(), update(t, dt, model) }
 *     arrive   the object has settled at the front
 *     activate the visitor tapped it (or pressed Enter) while it is at the front
 *     present  it is leaving the front
 *
 * loadObject(THREE, loader, reduceMotion, index) loads a separate copy for the scan story.
 * Pass an existing GLTFLoader and the carousel index. The returned object also has
 * open(progress), which scrubs the built-in Explode clip from closed (0) to open (1).
 */
(function () {
  'use strict';

  const FILES = [
    ['Key fob', 'models/rfid-fob.glb', keyFob],
    ['Phone', 'models/oppo-find-x9-ultra.glb', phone],
    ['Contactless card', 'models/contactless-card.glb', card]
  ];
  // The carousel drops these sealed parts to avoid drawing geometry it never shows.
  const SEALED = {
    'Key fob': ['rfid-chip', 'antenna-coil', 'protective-encapsulation', 'key-mat-pins-and-guide-mount',
      'indicator-light-pipe-foot', 'inner-guide-rib-1', 'inner-stop-1', 'inner-guide-rib-2', 'inner-stop-2',
      'pcb-alignment-bosses-and-indexing-pins', 'molded-support-ribs-and-hollow-standoffs', 'dielectric-cushion-strips'],
    'Phone': ['nfc-antenna', 'wireless-charging-coil', 'silicon-carbon-battery', 'mainboard-and-midframe'],
    'Contactless card': ['perimeter-and-coupling-antenna', 'die-pocket-floor', 'module-substrate', 'die-underfill',
      'silicon-die', 'module-antenna']
  };
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function load(T, GLTFLoader, reduceMotion) {
    const loader = new GLTFLoader();
    return Promise.all(FILES.map((_, index) => loadModel(T, loader, reduceMotion, index, false)));
  }

  function loadObject(T, loader, reduceMotion, index) {
    return loadModel(T, loader, reduceMotion, index, true);
  }

  async function loadModel(T, loader, reduceMotion, index, canOpen) {
    const [name, url, behave] = FILES[index];
    const gltf = await loader.loadAsync(url);
    const model = new T.Group(), shell = gltf.scene;
    const sealed = SEALED[name].map(part => shell.getObjectByName(part)).filter(Boolean);
    const parents = sealed.map(part => part.parent);
    for (const part of sealed) {
      part.removeFromParent();
      if (!canOpen) part.traverse(piece => piece.geometry?.dispose());
    }
    // Size the closed shell before restoring the hidden parts. Box3 includes hidden meshes.
    const box = new T.Box3().setFromObject(shell);
    if (canOpen) {
      sealed.forEach((part, i) => {
        part.visible = false;
        parents[i].add(part);
      });
    }
    liftDecals(T, shell);
    shell.position.sub(box.getCenter(new T.Vector3()));
    const size = box.getSize(new T.Vector3());
    model.add(shell);
    // Static meshes keep their matrices until a behavior or an Explode keyframe moves them.
    shell.traverse(part => { part.updateMatrix(); part.matrixAutoUpdate = false; });
    const object = { name, model, span: Math.max(size.x, size.y), action: behave(T, shell, model, reduceMotion) };
    if (canOpen) object.open = opener(gltf.animations.find(clip => clip.name === 'Explode'), shell, sealed);
    return object;
  }

  function opener(clip, shell, sealed) {
    const tracks = (clip?.tracks || []).map(track => {
      const dot = track.name.lastIndexOf('.');
      const node = shell.getObjectByName(track.name.slice(0, dot));
      const target = node?.[track.name.slice(dot + 1)];
      return target && { node, target, sample: track.createInterpolant(), closed: target.toArray() };
    }).filter(Boolean);
    // The fob's transparent resin obscures the actual chip in the cutaway.
    const revealed = sealed.filter(part => part.name !== 'protective-encapsulation');
    let lastProgress = 0;
    return progress => {
      progress = clamp01(progress);
      if (progress === lastProgress || !tracks.length) return;
      lastProgress = progress;
      for (const { node, target, sample, closed } of tracks) {
        target.fromArray(progress ? sample.evaluate(progress * clip.duration) : closed);
        node.updateMatrix();
      }
      for (const part of revealed) part.visible = progress > 0;
    };
  }

  // Printed artwork and contact pads are flat sheets lying exactly on another surface
  // (the card's ink on its plastic, the pads level with the clear film). Two surfaces at
  // the same depth flicker as the GPU picks a different winner each frame, so the flat
  // sheet is nudged toward the viewer in depth only. Nothing moves on screen.
  function liftDecals(T, shell) {
    const size = new T.Vector3();
    shell.traverse(part => {
      if (!part.isMesh) return;
      const geometry = part.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      geometry.boundingBox.getSize(size);
      if (size.z > Math.max(size.x, size.y) * 1e-5) return;   // only truly flat sheets
      part.material = part.material.clone();
      part.material.polygonOffset = true;
      part.material.polygonOffsetFactor = -1;
      part.material.polygonOffsetUnits = -4;
    });
  }

  function firstMesh(object) {
    let found = null;
    object?.traverse(part => { if (!found && part.isMesh) found = part; });
    return found;
  }

  // Press the lock key and light the status lamp.
  function keyFob(T, shell) {
    const key = shell.getObjectByName('lock-button');
    const lampMesh = firstMesh(shell.getObjectByName('indicator-light-guide'));
    const rest = key ? key.position.z : 0, travel = .0009;   // about 1 mm of key travel
    if (key) key.matrixAutoUpdate = true;                     // the one part that moves
    let lamp = null, base = null;
    if (lampMesh?.material?.emissive) {
      lamp = lampMesh.material = lampMesh.material.clone();
      base = lamp.emissive.clone();
    }
    let since = -10;
    return {
      arrive(t) { since = t; },
      activate(t) { since = t; },
      update(t) {
        const p = (t - since) / .46;
        const push = p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
        const glow = t >= since ? clamp01(1 - (t - since - .46) / 1.6) : 0;
        if (key) key.position.z = rest - travel * push;
        if (lamp) lamp.emissive.setRGB(base.r + .21 * glow, base.g + 1.45 * glow, base.b + .64 * glow);
      }
    };
  }

  // Away from the front the phone shows its cameras, like the sketch. Brought to the front
  // it turns around and its screen comes on by itself, waking from the always-on display
  // into the lock screen. A tap flips it between screen and cameras.
  function phone(T, shell, model, reduceMotion) {
    refineBack(T, shell);
    redrawH(T, shell);
    const screen = window.RFIDLockScreen.create(T, reduceMotion, { width: .0752, height: .1612, radius: .0086 });
    const display = shell.getObjectByName('oled-display-assembly') || shell;
    screen.mesh.position.z = display === shell ? .0077 : .00103;   // just above the cover glass
    display.add(screen.mesh);
    model.rotation.y = Math.PI;
    let facing = false, wakeAt = Infinity;
    const face = t => { facing = true; wakeAt = t + .35; };
    const turnAway = () => { facing = false; wakeAt = Infinity; screen.sleep(); };
    return {
      arrive(t) { if (!facing) face(t); },
      activate(t) { if (facing) turnAway(); else face(t); },
      present: turnAway,
      update(t, dt, object) {
        if (t >= wakeAt) { wakeAt = Infinity; screen.wake(t); }
        const target = facing ? 0 : Math.PI;
        object.rotation.y = reduceMotion.matches ? target : T.MathUtils.damp(object.rotation.y, target, 4.2, dt);
        // The screen only needs drawing while it faces the viewer.
        screen.update(t, dt, Math.cos(object.rotation.y) > -.2);
      }
    };
  }

  // The H on the camera island, traced from a 1500 px product photo of the real phone:
  // photo pixel coordinates, with the island's black glass centred at (459.31, 365.09)
  // and 265.3 px in radius. Two strokes leaning right and a crossbar that reaches past
  // the left stroke into the right one.
  const H_PHOTO = {
    centre: [459.31, 365.09], radius: 265.3,
    outline: [
      [448.27, 335], [464.36, 335], [455.42, 361], [473.98, 361], [481.54, 335], [496.68, 335],
      [478.81, 391], [465.26, 391], [471.95, 368], [453.01, 368], [445.10, 391], [430.73, 391],
      [437.93, 368], [425.20, 368], [425.20, 361], [440.13, 361]
    ],
    // Its shading in the photo, from the top of the strokes to the bottom, brightened so it
    // reads as polished metal against the black glass.
    shade: [[0, '#c4c6cb'], [.25, '#adafb5'], [.5, '#a2a4ab'], [.75, '#8d8f97'], [1, '#83858c']]
  };
  const ISLAND_GLASS = { y: .04221, r: .0288 };   // the island's black glass, in model units

  // Replace the model's H with the traced one. The island's printed layer shows its
  // texture upside down (not mirrored), so the H is drawn flipped to read upright.
  function redrawH(T, shell) {
    const cover = shell.getObjectByName('glacier-white-rear-cover');
    let print = null;
    cover?.traverse(part => { if (part.isMesh && part.material.isMeshBasicMaterial && part.material.map) print = part; });
    const image = print?.material.map.image;
    if (!image?.width) return;
    const box = print.geometry.boundingBox || (print.geometry.computeBoundingBox(), print.geometry.boundingBox);
    const scale = image.width / (box.max.x - box.min.x);                  // texture pixels per meter
    const cx = image.width / 2, cy = (ISLAND_GLASS.y - box.min.y) * scale, R = ISLAND_GLASS.r * scale;

    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const c = canvas.getContext('2d');
    c.drawImage(image, 0, 0);
    c.clearRect(cx - .17 * R, cy - .14 * R, .34 * R, .28 * R);            // the model's own H

    // Photo pixels → island units (y down as seen) → texture pixels (flipped vertically).
    const [px, py] = H_PHOTO.centre, k = R / H_PHOTO.radius;
    const toTexture = ([x, y]) => [cx + (x - px) * k, cy - (y - py) * k];
    const tops = H_PHOTO.outline.map(([, y]) => y), top = Math.min(...tops), bottom = Math.max(...tops);
    const [, gy0] = toTexture([0, top]), [, gy1] = toTexture([0, bottom]);
    const shade = c.createLinearGradient(0, gy0, 0, gy1);
    for (const [at, colour] of H_PHOTO.shade) shade.addColorStop(at, colour);
    c.fillStyle = shade;
    c.beginPath();
    H_PHOTO.outline.forEach((point, i) => { const [x, y] = toTexture(point); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.closePath();
    c.fill();

    const original = print.material.map, map = new T.CanvasTexture(canvas);
    for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'channel', 'magFilter', 'minFilter']) map[key] = original[key];
    map.anisotropy = 8;
    print.material = print.material.clone();
    print.material.map = map;
  }

  // The phone's white back loses its detail under the studio light, and its flash is a plain
  // cream disc that reads as an empty hole. Give both something to show.
  function refineBack(T, shell) {
    const cover = shell.getObjectByName('glacier-white-rear-cover');
    if (!cover) return;
    const size = new T.Vector3(), center = new T.Vector3(), flash = [];
    cover.traverse(part => {
      if (!part.isMesh) return;
      const geometry = part.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      geometry.boundingBox.getSize(size); geometry.boundingBox.getCenter(center);
      if (part.material.map && size.y > .1) deepenCover(T, part);   // the whole back, not the island's print
      // The flash sits in the corner opposite the camera island: a lens and its surround.
      else if (size.x < .01 && size.y < .01 && center.x > .02 && center.y > .06) flash.push(part);
    });
    const thickness = part => part.geometry.boundingBox.max.z - part.geometry.boundingBox.min.z;
    const lens = flash.find(part => thickness(part) < 1e-6), ring = flash.find(part => part !== lens);
    if (lens) {
      const old = lens.material, box = lens.geometry.boundingBox, position = lens.geometry.attributes.position;
      const uv = new Float32Array(position.count * 2);
      for (let i = 0; i < position.count; i++) {
        uv[i * 2] = (position.getX(i) - box.min.x) / (box.max.x - box.min.x);
        uv[i * 2 + 1] = (position.getY(i) - box.min.y) / (box.max.y - box.min.y);
      }
      lens.geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
      lens.material = new T.MeshPhysicalMaterial({
        map: flashFace(T), roughness: .3, metalness: 0, clearcoat: 1, clearcoatRoughness: .06,
        polygonOffset: old.polygonOffset, polygonOffsetFactor: old.polygonOffsetFactor, polygonOffsetUnits: old.polygonOffsetUnits
      });
    }
    if (ring) {
      ring.material = ring.material.clone();
      ring.material.color.setHex(0x8f8a80);
      ring.material.metalness = .9;
      ring.material.roughness = .24;
    }
  }

  // Bring out the back's brushed swirl and engraved logo. They are faint lines on top of
  // broad soft shading, so the fine detail (image minus a blurred copy) is amplified a lot
  // and the broad shading only a little. The white also comes down a touch.
  function deepenCover(T, mesh) {
    const original = mesh.material.map, image = original.image;
    if (!image?.width) return;
    const w = image.width, h = image.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0, 0, w, h), d = pixels.data;
    const soft = document.createElement('canvas');
    soft.width = w; soft.height = h;
    const s = soft.getContext('2d', { willReadFrequently: true });
    if ('filter' in s) s.filter = `blur(${Math.round(w / 90)}px)`;
    s.drawImage(image, 0, 0);
    const blur = 'filter' in s ? s.getImageData(0, 0, w, h).data : null;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const v = d[i + k], b = blur ? blur[i + k] : 238;
        d[i + k] = 236 + (b - 236) * 1.4 + (v - b) * 4.5;
      }
    }
    c.putImageData(pixels, 0, 0);
    const map = new T.CanvasTexture(canvas);
    for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'channel', 'magFilter', 'minFilter']) map[key] = original[key];
    map.offset.copy(original.offset); map.repeat.copy(original.repeat); map.rotation = original.rotation;
    map.anisotropy = 4;
    mesh.material = mesh.material.clone();
    mesh.material.map = map;
    mesh.material.color.setScalar(.93);
    mesh.material.envMapIntensity = .8;
  }

  // A frosted flash lens: fine Fresnel rings over a warm and a cool LED.
  function flashFace(T) {
    const size = 256, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d'), mid = size / 2;
    const glass = c.createRadialGradient(mid * .8, mid * .75, 4, mid, mid, mid);
    glass.addColorStop(0, '#f3ecd8'); glass.addColorStop(.6, '#ddd2b4'); glass.addColorStop(1, '#b9ad8c');
    c.fillStyle = glass; c.fillRect(0, 0, size, size);
    c.strokeStyle = 'rgba(96, 82, 52, .32)'; c.lineWidth = 2;
    for (let r = 12; r < mid; r += 9) { c.beginPath(); c.arc(mid, mid, r, 0, Math.PI * 2); c.stroke(); }
    const led = (x, fill) => {
      c.beginPath(); c.roundRect(x - 26, mid - 26, 52, 52, 8);
      c.fillStyle = 'rgba(70, 58, 34, .85)'; c.fill();                      // the LED package
      c.beginPath(); c.roundRect(x - 19, mid - 19, 38, 38, 5);
      c.fillStyle = fill; c.fill();                                          // the phosphor
      c.fillStyle = 'rgba(70, 58, 34, .5)'; c.fillRect(x - 3, mid - 13, 6, 26);
    };
    led(mid - 34, '#e8ab4f');   // warm
    led(mid + 34, '#f8f1dc');   // cool
    c.strokeStyle = 'rgba(58, 48, 30, .6)'; c.lineWidth = 8;
    c.beginPath(); c.arc(mid, mid, mid - 5, 0, Math.PI * 2); c.stroke();
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }

  // Flip the card over.
  function card(T, shell, model, reduceMotion) {
    const TAU = Math.PI * 2;
    let target = 0;
    return {
      activate() { target += Math.PI; },
      present() { target = Math.round(target / TAU) * TAU; },
      update(t, dt, object) {
        object.rotation.y = reduceMotion.matches ? target : T.MathUtils.damp(object.rotation.y, target, 5, dt);
      }
    };
  }

  window.RFIDModels = { load, loadObject };
})();
