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
    'Phone': ['nfc-antenna', 'wireless-charging-coil', 'silicon-carbon-battery', 'mainboard-and-midframe',
      'rear-camera-modules'],
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
    rebuildIsland(T, shell);
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

  // The camera island, laid out like the real phone: four lenses in a diamond (round at top
  // and bottom, cushion-shaped housings left and right), a bold Hasselblad-style H in the
  // middle, a white sensor with a dark pair beside it, a small sensor low right, and fine
  // markings around the rim. The model keeps its own black glass and silver ring; its
  // lenses, dot and printed layer are replaced.
  const ISLAND = { x: 0, y: .04221, r: .0288, face: -.01016 };   // model units (meters)
  function rebuildIsland(T, shell) {
    const cover = shell.getObjectByName('glacier-white-rear-cover');
    if (!cover) return;
    const size = new T.Vector3(), center = new T.Vector3(), drop = [];
    let lensMaterial = null;
    cover.traverse(part => {
      if (!part.isMesh) return;
      const box = part.geometry.boundingBox || (part.geometry.computeBoundingBox(), part.geometry.boundingBox);
      box.getSize(size); box.getCenter(center);
      const inside = Math.hypot(center.x - ISLAND.x, center.y - ISLAND.y) < ISLAND.r
        && size.x < 2.1 * ISLAND.r && size.y < 2.1 * ISLAND.r;
      if (!inside) return;
      const printed = part.material.isMeshBasicMaterial;          // the old H and markings
      const raised = box.min.z < ISLAND.face - .00012;            // lens housings and glass
      const dot = size.x < .003 && size.y < .003;                 // the old sensor dot
      if (raised && part.material.map && !printed) lensMaterial = part.material;
      if (printed || raised || dot) drop.push(part);
    });
    if (!drop.length) return;
    for (const part of drop) { part.removeFromParent(); part.geometry.dispose(); }

    // Built facing the viewer (+z out of the island, x to the right as seen from behind),
    // then turned around to face out of the phone's back.
    const R = ISLAND.r, island = new T.Group();
    island.rotation.y = Math.PI;
    island.position.set(ISLAND.x, ISLAND.y, ISLAND.face);
    cover.add(island);
    const housing = new T.MeshStandardMaterial({ color: 0x232427, metalness: .75, roughness: .32 });
    const rim = new T.MeshStandardMaterial({ color: 0x5f6268, metalness: .9, roughness: .3 });
    const glass = lensMaterial || new T.MeshPhysicalMaterial({ color: 0x0b0d14, roughness: .1, clearcoat: 1 });
    const depth = .00045;
    const add = (geometry, material, x, y, z) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x * R, y * R, z);
      island.add(mesh);
      return mesh;
    };
    function lens([x, y], shape, outer, inner) {
      if (shape === 'round') {
        const barrel = add(new T.CylinderGeometry(outer * R, outer * R * 1.02, depth, 56), housing, x, y, depth / 2);
        barrel.rotation.x = Math.PI / 2;
      } else {
        const a = outer * R, r = a * .44, s = new T.Shape();
        s.moveTo(-a + r, -a); s.lineTo(a - r, -a); s.quadraticCurveTo(a, -a, a, -a + r);
        s.lineTo(a, a - r); s.quadraticCurveTo(a, a, a - r, a); s.lineTo(-a + r, a);
        s.quadraticCurveTo(-a, a, -a, a - r); s.lineTo(-a, -a + r); s.quadraticCurveTo(-a, -a, -a + r, -a);
        const bevel = .00008;
        add(new T.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
          bevelSegments: 3, curveSegments: 10 }), housing, x, y, bevel);
      }
      add(new T.CircleGeometry(inner * R, 56), glass, x, y, depth + .00002);
      add(new T.TorusGeometry(inner * R + .00016, .00014, 10, 64), rim, x, y, depth);   // a lens barrel edge
    }
    lens([0, .66], 'round', .25, .19);       // top
    lens([0, -.66], 'round', .23, .17);      // bottom
    lens([-.66, 0], 'cushion', .22, .165);   // left
    lens([.66, 0], 'cushion', .22, .165);    // right

    const face = new T.Mesh(new T.CircleGeometry(R * .99, 72), new T.MeshStandardMaterial({
      map: islandFace(T), transparent: true, depthWrite: false, metalness: .55, roughness: .35,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
    }));
    face.position.z = .00002;
    island.add(face);
  }

  // The printed side of the island, drawn as seen from behind the phone: the H, the
  // sensors and the rim markings. The canvas spans the island's diameter.
  function islandFace(T) {
    const size = 1024, half = size / 2, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d');
    const at = (x, y) => [half + x * half, half - y * half];   // island units → canvas

    // The H: two slanted stems and a heavy crossbar that reaches past the left stem.
    const h = 140, slant = .2, stem = 32, gap = 50;
    const left = -(stem + gap / 2), right = gap / 2;
    const quad = (x0, x1, y0, y1) => {                           // a slanted bar from y0 (top) to y1
      c.moveTo(x0 + slant * -y0, y0); c.lineTo(x1 + slant * -y0, y0);
      c.lineTo(x1 + slant * -y1, y1); c.lineTo(x0 + slant * -y1, y1); c.closePath();
    };
    c.save();
    c.translate(...at(-.01, .01));
    const metal = c.createLinearGradient(0, -h / 2, 0, h / 2);
    metal.addColorStop(0, '#f4f5f6'); metal.addColorStop(.5, '#c9cbce'); metal.addColorStop(1, '#a3a6aa');
    c.fillStyle = metal;
    c.beginPath();
    quad(left, left + stem, -h / 2, h / 2);
    quad(right, right + stem, -h / 2, h / 2);
    quad(left - 18, right + stem, -13, 13);
    c.fill();
    c.restore();

    // Sensors: a white one with a dark pair beside it, and a small dark one low right.
    const [wx, wy] = at(.45, .47);
    const white = c.createRadialGradient(wx - 4, wy - 4, 2, wx, wy, 19);
    white.addColorStop(0, '#ffffff'); white.addColorStop(.7, '#e9e9e7'); white.addColorStop(1, '#9d9e9f');
    c.fillStyle = white; c.beginPath(); c.arc(wx, wy, 18, 0, Math.PI * 2); c.fill();
    for (const dy of [-13, 13]) {
      c.beginPath(); c.arc(wx + 40, wy + dy, 9, 0, Math.PI * 2);
      c.fillStyle = '#17191c'; c.fill(); c.strokeStyle = '#3d4045'; c.lineWidth = 2; c.stroke();
    }
    const [sx, sy] = at(.45, -.45);
    c.beginPath(); c.arc(sx, sy, 15, 0, Math.PI * 2);
    c.fillStyle = '#121417'; c.fill(); c.strokeStyle = '#41454b'; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.arc(sx - 4, sy - 4, 3, 0, Math.PI * 2); c.fillStyle = 'rgba(160, 175, 200, .5)'; c.fill();

    // Fine markings around the rim.
    c.fillStyle = '#7b7e83';
    c.font = '500 26px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = '3px';
    for (const [text, angle] of [['F1.5-3.5', 135], ['LUMO', 45], ['14-230mm', 225], ['CAMERA SYSTEM', 315]]) {
      const a = angle * Math.PI / 180, [x, y] = at(Math.cos(a) * .86, Math.sin(a) * .86);
      c.save(); c.translate(x, y);
      c.rotate(-a + (Math.sin(a) > 0 ? Math.PI / 2 : -Math.PI / 2));   // follow the rim, reading upright
      c.fillText(text, 0, 0);
      c.restore();
    }

    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
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
      if (part.material.map && size.y > .1) deepenCover(T, part);   // the whole back, not the island
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
