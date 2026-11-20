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
