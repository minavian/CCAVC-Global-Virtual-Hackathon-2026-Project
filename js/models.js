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
 */
(function () {
  'use strict';

  const FILES = [
    ['Key fob', 'models/rfid-fob.glb', keyFob],
    ['Phone', 'models/oppo-find-x9-ultra.glb', phone],
    ['Contactless card', 'models/contactless-card.glb', card]
  ];
  // Parts sealed inside each object. The landing page never opens the objects, so these
  // are dropped at load: about half the triangles and draw calls, none of them visible.
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
    return Promise.all(FILES.map(async ([name, url, behave]) => {
      const gltf = await loader.loadAsync(url);
      const model = new T.Group(), shell = gltf.scene;
      for (const part of SEALED[name].map(n => shell.getObjectByName(n)).filter(Boolean)) {
        part.removeFromParent();
        part.traverse(piece => piece.geometry?.dispose());
      }
      liftDecals(T, shell);
      const box = new T.Box3().setFromObject(shell);
      shell.position.sub(box.getCenter(new T.Vector3()));
      const size = box.getSize(new T.Vector3());
      model.add(shell);
      // Nothing inside the model moves on its own except what the behaviours below animate,
      // so skip recomputing those transforms every frame.
      shell.traverse(part => { part.updateMatrix(); part.matrixAutoUpdate = false; });
      return { name, model, span: Math.max(size.x, size.y), action: behave(T, shell, model, reduceMotion) };
    }));
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
      if (part.material.map && size.x > .05) deepenCover(T, part);
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

  window.RFIDModels = { load };
})();
