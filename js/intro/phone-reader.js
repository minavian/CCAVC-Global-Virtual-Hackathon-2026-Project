// The phone as the lab's second reader (lab-model.js `reader: 'phone'`): the team's phone model
// (models/oppo-find-x9-ultra.glb), lying screen down with its back up, the way you hold a card
// to the back of a phone. Its NFC antenna is a ring round the camera island, so the phone is
// placed with that ring exactly where the card reader's coil is (the reader's frame: the coil's
// centre at x = y = 0, at COIL_Z), and the card hovers over it just as over the pad.
// Like the pad (reader-model.js) it goes see-through to show its coil and chip; its coil lights
// with its current; its chip glows while it reads; its screen, under it, glows blue while it takes
// the answer in and green once the card is read. Units are metres.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COIL_Z } from './reader-size.js';

const URL_ = new URL('../../models/oppo-find-x9-ultra.glb', import.meta.url);

// Where the model's parts are (its own frame: centred, screen toward +z, top toward +y). Read
// from the model: the NFC antenna is a ring 59.8 mm across round the camera island, 42.3 mm up
// from the middle, just under the back glass (z -0.5 mm); the back's flat surface is at
// z -1.15 mm and the camera island stands 6.5 mm proud of it.
const MODEL_COIL = new THREE.Vector3(0, .0423, -.0005);
// The phone's NFC chip, beside the antenna's feed (the model has none; as on the landing).
const MODEL_CHIP = new THREE.Vector3(-.021, .058, -.0012);
// Turned over (half a turn about its width), its back faces up (+z) and its top, with the
// cameras, comes toward the viewer: its body runs away from the viewer, behind the card.
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const toReader = v => v.clone().applyQuaternion(FLIP);
const OFFSET = new THREE.Vector3(0, 0, COIL_Z).sub(toReader(MODEL_COIL));

// The phone's coil and chip in the reader's frame (effects.js draws the field and the current
// from these): a round coil, its outer turn 29.4 mm in radius.
export const PHONE_COIL = Object.freeze({ radius: .0294, inner: .0262, z: COIL_Z });
export const PHONE_CHIP = Object.freeze(toReader(MODEL_CHIP).add(OFFSET));
// How far proud of the coil the camera island stands, once turned over: a card can't come
// closer than this (lab-model.js keeps the phone's distance at 0.8 cm or more).
export const ISLAND_TOP = COIL_Z + .0071;

// Parts that keep their look in the x-ray: the NFC antenna and its chip. Everything else turns
// to glass with the body, as the pad's shell does.
const KEEP = ['nfc-antenna', 'nfc-chip'];
const COPPER = new THREE.Color(0xc07a3a), DARK = new THREE.Color(0x3a2618);

export function buildPhone() {
  const group = new THREE.Group();
  group.visible = false;
  let ready = null, model = null;
  const shell = [], antenna = [], screens = [];
  let chipMaterial = null;

  // Loaded on first use (the lab's Phone button), so the page never pays for it otherwise.
  function load() {
    ready ??= new GLTFLoader().loadAsync(URL_.href).then(gltf => {
      model = gltf.scene;
      // The same back as on the landing (js/models.js `refinePhone`): its H redrawn from a photo
      // of the real phone, its back and flash refined. (Loaded by then: models.js comes first.)
      window.RFIDModels?.refinePhone?.(THREE, model);
      // The NFC chip, so the close-up can point at a real part.
      const chip = new THREE.Mesh(new THREE.BoxGeometry(.004, .004, .0009),
        new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: .45, metalness: .2, emissive: 0x3f8cff, emissiveIntensity: 0 }));
      chip.name = 'nfc-chip';
      chip.position.copy(MODEL_CHIP);
      model.add(chip);
      model.quaternion.copy(FLIP);
      model.position.copy(OFFSET);
      model.traverse(part => {
        if (!part.isMesh) return;
        let node = part, keep = false, screen = false;
        while (node && node !== model) {
          if (KEEP.includes(node.name)) keep = true;
          if (node.name === 'oled-display-assembly') screen = true;
          node = node.parent;
        }
        part.visible = true;
        const material = part.material = part.material.clone();
        material.userData.base = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite };
        if (keep && part.name !== 'nfc-chip') {
          // The antenna: copper, with a glow that follows its current.
          material.color?.copy(COPPER);
          if (material.emissive) material.emissive.setRGB(0, 0, 0);
          antenna.push(material);
        } else if (!keep) {
          shell.push(material);
          if (screen && material.emissive) screens.push(material);
        }
        part.renderOrder = keep ? 3 : 1;
      });
      // (Its own copy, made above, is the one drawn.)
      chipMaterial = chip.material;
      group.add(model);
      return group;
    });
    return ready;
  }

  const last = { opacity: -1, shell: -1 };
  const glowColor = new THREE.Color(), screenColor = new THREE.Color();
  // opacity: the whole phone. shellOpacity: the body only, so the coil and chip show. glow,
  // color: the current in its coil (a tint; effects.js draws the light running round it). dim:
  // the copper darkens in the dark close-up. screen: [color, strength], the screen's glow under
  // it. thinking: the chip's light.
  function set({ opacity = 0, shellOpacity = 1, glow = 0, color, dim = 0, screen, thinking = 0 }) {
    group.visible = Boolean(model) && opacity > .002;
    if (!model || !group.visible) return;
    if (opacity !== last.opacity || shellOpacity !== last.shell) {
      last.opacity = opacity;
      last.shell = shellOpacity;
      const apply = (material, value) => {
        const see = value < .999;
        const transparent = material.userData.base.transparent || see;
        if (transparent !== material.transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.depthWrite = see ? false : material.userData.base.depthWrite;
        material.opacity = value * material.userData.base.opacity;
      };
      for (const material of shell) apply(material, opacity * shellOpacity);
      for (const material of antenna) apply(material, opacity);
      if (chipMaterial) apply(chipMaterial, opacity);
    }
    if (color) glowColor.copy(color);
    for (const material of antenna) {
      material.color?.copy(COPPER).lerp(DARK, dim * .7);
      if (material.emissive) {
        material.emissive.copy(glowColor);
        material.emissiveIntensity = glow * 1.6;
      }
    }
    if (chipMaterial) chipMaterial.emissiveIntensity = thinking * 3.2;
    if (screen) screenColor.copy(screen[0]);
    for (const material of screens) {
      material.emissive.copy(screenColor);
      material.emissiveIntensity = screen ? screen[1] : 0;
    }
  }

  return { group, load, set, loaded: () => Boolean(model) };
}
