/*
 * The three everyday RFID objects, loaded from the team's GLB models in /models.
 * Each GLB is centered, in meters, Y up, front facing +Z, with named parts.
 *
 * window.RFIDModels.load(THREE, GLTFLoader, reduceMotion) resolves to three objects
 * in carousel order, each { name, model, span, open, part, action }:
 *   model  a THREE.Group to place in a scene
 *   span   the model's larger side (width or height), for scaling it to a pixel size
 *   open   open(e, push) opens the model (0 = closed, 1 = exploded) with its own animation;
 *          push (0–1) moves the outer shells further out of the way
 *   part   part(name) finds a named part, for example to label it
 *   action { arrive?(t), activate(t), present?(), update(t, dt, model) }
 *     arrive   the object has settled at the front
 *     activate the visitor tapped it (or pressed Enter) while it is at the front
 *     present  it is leaving the front
 *
 * The carousel's card also exposes open(progress) for the scan story. If the carousel
 * hasn't loaded, loadObject(THREE, loader, reduceMotion, index) provides a fallback model.
 * open(progress) scrubs the built-in Explode clip from closed (0) to open (1).
 */
(function () {
  'use strict';

  const FILES = [
    ['Key fob', 'models/rfid-fob.glb', keyFob],
    ['Phone', 'models/oppo-find-x9-ultra.glb', phone],
    ['Contactless card', 'models/subway-card.glb', card]
  ];
  const CARD_COIL = ['antenna-turn-1', 'antenna-turn-2', 'antenna-turn-3', 'antenna-turn-4', 'antenna-turn-5',
    'module-connection--1', 'module-connection-1'];
  const CARD_INTERNALS = [...CARD_COIL, 'rfid-chip-module'];
  // Parts sealed inside each object. They stay hidden (about half the triangles and draw
  // calls, none of them visible) until the object is opened with `open(e)`.
  const SEALED = {
    'Key fob': ['rfid-chip', 'antenna-coil', 'protective-encapsulation', 'key-mat-pins-and-guide-mount',
      'indicator-light-pipe-foot', 'inner-guide-rib-1', 'inner-stop-1', 'inner-guide-rib-2', 'inner-stop-2',
      'pcb-alignment-bosses-and-indexing-pins', 'molded-support-ribs-and-hollow-standoffs', 'dielectric-cushion-strips'],
    'Phone': ['nfc-antenna', 'wireless-charging-coil', 'silicon-carbon-battery', 'mainboard-and-midframe'],
    'Contactless card': CARD_INTERNALS
  };
  // Sealed parts that stay hidden even when the object opens. The fob's resin potting is a
  // see-through blob: it writes no depth, so the background blur smears it into a grey
  // square, and it would cover the chip anyway.
  const STAY_HIDDEN = ['protective-encapsulation'];

  // Where `open(e, push)` sends the outer shells (meters, at push = 1): the front shell
  // lifts up and out of frame, the rear one drops down, leaving the inside on its own.
  // (The front shell also moves right, so it never crosses the story's words on the left.)
  const PUSH = { 'front-housing': [.05, .16, .03], 'rear-housing': [-.01, -.16, -.02] };
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // The RFID part of each object: its coil and its chip. They glow copper in the film, and
  // stay solid while everything else turns to glass. Labels point at `coil` and `chip`.
  const RFID_PARTS = {
    'Key fob': { coil: 'copper-winding-and-leads', chip: 'rfid-ic-package', parts: ['antenna-coil', 'rfid-chip'] },
    'Phone': { coil: 'nfc-antenna', chip: 'nfc-chip', parts: ['nfc-antenna', 'nfc-chip'] },
    'Contactless card': { coil: 'antenna-turn-1', chip: 'silicon-die', coilParts: CARD_COIL,
      parts: CARD_INTERNALS }
  };
  const COPPER = 0xd08040;

  function load(T, GLTFLoader, reduceMotion) {
    const loader = new GLTFLoader();
    return Promise.all(FILES.map((_, index) => loadObject(T, loader, reduceMotion, index)));
  }

  async function loadObject(T, loader, reduceMotion, index) {
    const [name, url, behave] = FILES[index];
    const gltf = await loader.loadAsync(url);
    const model = new T.Group(), shell = gltf.scene;
    if (name === 'Phone') addNfcChip(T, shell);
    if (name === 'Key fob') addCoinBattery(T, shell);
    const sealed = SEALED[name].map(n => shell.getObjectByName(n)).filter(Boolean);
    for (const part of sealed) part.visible = false;
    const revealed = sealed.filter(part => !STAY_HIDDEN.includes(part.name));
    liftDecals(T, shell);
    const box = new T.Box3().setFromObject(shell);
    shell.position.sub(box.getCenter(new T.Vector3()));
    const size = box.getSize(new T.Vector3());
    model.add(shell);
    // Nothing inside the model moves on its own except what the behaviours below animate,
    // so skip recomputing those transforms every frame.
    shell.traverse(part => { part.updateMatrix(); part.matrixAutoUpdate = false; });
    const open = opener(gltf.animations.find(clip => clip.name === 'Explode'), shell, revealed);
    // The behaviours replace some materials, so the glass look is set up after them.
    const action = behave(T, shell, model, reduceMotion);
    const look = looker(T, name, shell, open, revealed);
    return { name, model, span: Math.max(size.x, size.y), open, look, rfid: RFID_PARTS[name],
      part: n => shell.getObjectByName(n), action };
  }

  /*
   * look(state) sets how an object appears, all at once:
   *   open, push   as for open()
   *   glass        0–1: the shell turns to glass, and the coil and chip show through it
   *   glow         0–1: the coil and chip glow copper
   *   chip         0–1: the chip lights up (awake)
   *   battery      the key's coin battery: { out (0–1, pulled out), x, y (drag offset, m) }
   *   power        0–1: the key's buttons are lit (its battery is in)
   * Only what changed is touched, so calling it every frame is cheap.
   */
  function looker(T, name, shell, open, revealed) {
    const rfid = RFID_PARTS[name];
    const inRfid = new Set(), coil = new Set(), chipParts = new Set();
    for (const n of rfid.parts) shell.getObjectByName(n)?.traverse(o => inRfid.add(o));
    for (const n of rfid.coilParts || [rfid.coil]) shell.getObjectByName(n)?.traverse(o => coil.add(o));
    shell.getObjectByName(rfid.chip)?.traverse(o => chipParts.add(o));
    // The parts shown through the glass: the RFID parts, and the key's battery.
    const throughGlass = [...rfid.parts, 'coin-battery'].map(n => shell.getObjectByName(n)).filter(Boolean);
    const glassy = [], glowing = [];
    shell.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const m = o.material;
      if (coil.has(o) || chipParts.has(o)) glowing.push({ m, chip: chipParts.has(o), base: m.emissive ? m.emissive.clone() : null,
        color: m.color ? m.color.clone() : null });
      if (!inRfid.has(o) && o.name !== 'coin-battery-cell' && o.name !== 'coin-battery-face')
        glassy.push({ m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
    });
    const battery = shell.getObjectByName('coin-battery');
    const batteryHome = battery ? battery.position.clone() : null;
    const inlays = ['lock-button-inlay', 'unlock-button-inlay'].map(n => shell.getObjectByName(n)).filter(Boolean)
      .map(o => ({ m: o.material, base: o.material.emissive ? o.material.emissive.clone() : null }));
    const copper = new T.Color(COPPER), white = new T.Color(0xfff3dd);
    let last = '';
    return (s = {}) => {
      const glass = s.glass || 0, glow = s.glow || 0, chip = s.chip || 0, power = s.power ?? 1;
      const b = s.battery || { out: 0, x: 0, y: 0 };
      const key = [s.open || 0, s.push || 0, glass, glow, chip, power, b.out, b.x, b.y].map(v => (+v).toFixed(4)).join('|');
      if (key === last) return;
      last = key;
      open(s.open || 0, s.push || 0);
      for (const g of glassy) {
        const see = glass > .001;
        if (g.m.transparent !== (see || g.transparent)) { g.m.transparent = see || g.transparent; g.m.needsUpdate = true; }
        // Glass still writes depth: the composite's depth of field reads it, and a shell with
        // no depth would be blurred as if it were far away.
        g.m.opacity = g.opacity * (1 - .86 * glass);
      }
      // The RFID parts (and battery) show through the glass even while the object is closed.
      if (glass > .001) for (const part of throughGlass) part.visible = true;
      else for (const part of throughGlass) part.visible = (s.open || 0) > 0 && revealed.includes(part) || part.name === 'coin-battery' && (s.open || 0) > 0;
      for (const g of glowing) {
        if (!g.base) continue;
        const amount = g.chip ? Math.max(glow * .55, chip) : glow;
        g.m.emissive.copy(g.base).lerp(g.chip && chip > glow * .55 ? white : copper, Math.min(1, amount) * .9);
        g.m.emissiveIntensity = 1 + amount * (g.chip ? 2.2 : 2.4);
        if (g.color && !g.chip) g.m.color.copy(g.color).lerp(copper, Math.min(1, amount) * .7);
      }
      for (const g of inlays) {
        if (!g.base) continue;
        g.m.emissive.copy(g.base).lerp(new T.Color(0xcfe6ff), power * .55);
      }
      if (battery) {
        battery.position.set(batteryHome.x + b.x - b.out * .05, batteryHome.y + b.y - b.out * .02, batteryHome.z - .004 * (s.open || 0) - b.out * .01);
        battery.updateMatrix();
        battery.traverse(o => { if (o.material) { o.material.transparent = b.out > 0; o.material.opacity = 1 - Math.max(0, b.out - .6) / .4; } });
        if (b.out >= 1) battery.visible = false;
      }
      shell.updateMatrixWorld(true);
    };
  }

  // The phone's NFC chip: a small dark package on the main board, beside the antenna's feed.
  // (The model has the antenna but no separate chip, so the film can point at a real object.)
  function addNfcChip(T, shell) {
    const chip = new T.Mesh(new T.BoxGeometry(.004, .004, .0009),
      new T.MeshStandardMaterial({ color: 0x1c1d20, roughness: .45, metalness: .2, emissive: 0x000000 }));
    chip.name = 'nfc-chip';
    chip.position.set(-.021, .058, -.0012);
    shell.add(chip);
  }

  // A coin battery inside the key (the model has none, and a real key has one): 18 mm across,
  // steel, with its + face, in the bottom of the case behind the coil.
  function addCoinBattery(T, shell) {
    const group = new T.Group();
    group.name = 'coin-battery';
    const steel = new T.MeshStandardMaterial({ color: 0xbfc2c7, metalness: .95, roughness: .28 });
    const cell = new T.Mesh(new T.CylinderGeometry(.009, .009, .0032, 64), steel);
    cell.name = 'coin-battery-cell';
    cell.rotation.x = Math.PI / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d');
    const shine = c.createRadialGradient(100, 90, 10, 128, 128, 128);
    shine.addColorStop(0, '#eef0f3'); shine.addColorStop(1, '#a9adb3');
    c.fillStyle = shine; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(40, 44, 52, .35)'; c.lineWidth = 6; c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(30, 34, 40, .7)';
    c.font = '700 92px "Inter Tight", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('+', 128, 112);
    c.font = '600 30px "Inter Tight", Arial, sans-serif';
    c.fillText('3V', 128, 182);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    const face = new T.Mesh(new T.CircleGeometry(.0089, 64), new T.MeshStandardMaterial({ map, metalness: .8, roughness: .3 }));
    face.name = 'coin-battery-face';
    face.position.z = -.0017;
    face.rotation.y = Math.PI;
    group.add(cell, face);
    group.position.set(0, -.0195, -.0029);
    shell.add(group);
  }

  // ---------- Things the film adds around the objects ----------
  // A reader pad: a brushed metal puck with a copper coil under a smoked glass top. It looks
  // like no particular brand, because it stands for every reader. Lies flat: its axis is +Y.
  function readerPad(T) {
    const model = new T.Group(), shell = new T.Group();
    const metal = new T.MeshPhysicalMaterial({ color: 0xc9c6c0, metalness: .92, roughness: .34, clearcoat: .4 });
    const base = new T.Mesh(new T.CylinderGeometry(.045, .047, .008, 96), metal);
    const glass = new T.Mesh(new T.CylinderGeometry(.0415, .0415, .0012, 96),
      new T.MeshPhysicalMaterial({ color: 0x1b1c1f, roughness: .12, metalness: 0, clearcoat: 1, transparent: true, opacity: .74 }));
    glass.position.y = .0046;
    const copper = new T.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: .3, emissive: 0x000000 });
    const coil = new T.Group();
    coil.name = 'reader-coil';
    for (const r of [.0335, .0350, .0365]) {
      const ring = new T.Mesh(new T.TorusGeometry(r, .00055, 8, 160), copper);
      ring.rotation.x = Math.PI / 2;
      coil.add(ring);
    }
    coil.position.y = .0036;
    shell.add(base, coil, glass);
    model.add(shell);
    const base3 = new T.Color(0x000000), glowColor = new T.Color(COPPER);
    let last = -1;
    return {
      name: 'Reader', model, span: .094, part: n => shell.getObjectByName(n),
      look(s = {}) {
        const g = s.glow || 0;
        if (g === last) return;
        last = g;
        copper.emissive.copy(base3).lerp(glowColor, g * .8);
        copper.emissiveIntensity = 1 + g;
      },
      action: { update() {} }
    };
  }

  // A metal plate, to slide behind the tag. Lies flat.
  function metalPlate(T) {
    const model = new T.Group();
    // Half see-through, so the tag stays visible under it.
    const plate = new T.Mesh(new T.BoxGeometry(.07, .0016, .05),
      new T.MeshPhysicalMaterial({ color: 0xa9adb3, metalness: 1, roughness: .38, clearcoat: .2, transparent: true, opacity: .5 }));
    model.add(plate);
    return { name: 'Metal plate', model, span: .07, part: () => null, look() {}, action: { update() {} } };
  }

  // `open(e, push)` poses the model's own "Explode" animation at e (0 = closed, 1 = fully
  // open), sampled directly from its keyframes so scrubbing backwards and forwards is exact.
  // `push` (0–1) carries the outer shells further out, clearing the frame for the inside.
  // The sealed parts appear as soon as it starts to open and hide again once it closes.
  function opener(clip, shell, sealed) {
    const tracks = (clip?.tracks || []).map(track => {
      const dot = track.name.lastIndexOf('.');
      const node = shell.getObjectByName(track.name.slice(0, dot));
      return node && { node, property: track.name.slice(dot + 1), sample: track.createInterpolant(),
        away: PUSH[node.name] };
    }).filter(Boolean);
    let current = '';
    return (e, push = 0) => {
      e = clamp01(e); push = clamp01(push);
      const key = e + '|' + push;
      if (key === current || !tracks.length) return;
      current = key;
      const t = e * clip.duration;
      for (const { node, property, sample, away } of tracks) {
        const value = sample.evaluate(t);
        if (property === 'position') {
          node.position.fromArray(value);
          if (away) node.position.set(node.position.x + away[0] * push, node.position.y + away[1] * push, node.position.z + away[2] * push);
        }
        else if (property === 'quaternion') node.quaternion.fromArray(value);
        else if (property === 'scale') node.scale.fromArray(value);
        node.updateMatrix();
      }
      for (const part of sealed) part.visible = e > 0;
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

  window.RFIDModels = { load, loadObject, readerPad, metalPlate, RFID_PARTS };
})();
