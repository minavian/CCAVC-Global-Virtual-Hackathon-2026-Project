/**
 * Payment and transit card 3D assets for the continuous #taps sequence:
 *   - Countertop contactless POS terminal (2.5x scale, dynamic IPS CanvasTexture,
 *     4 recessed status LEDs, upper NFC tap dome, halo glow, expanding ripples)
 *   - Bank card (models/contactless-card.glb at 2.5x with procedural fallback)
 *   - Station card (bespoke 0.214m x 0.135m x 0.0024m transit pass with 1024x646 texture)
 */
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  COLORS,
  paintCanvas,
  makeContactShadow,
  createRipples,
  drawContactlessIcon,
  drawCheckmark,
  outCubic,
  smoothstep
} from './easing.js';

const CARD_W = 0.214;
const CARD_H = 0.135;
const CARD_RADIUS = 0.008;

const SEALED_CARD_PARTS = [
  'perimeter-and-coupling-antenna',
  'die-pocket-floor',
  'module-substrate',
  'die-underfill',
  'silicon-die',
  'module-antenna'
];

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Tracks base material opacity/transparency/depthWrite on a root group so fading
 * never breaks solid rendering when opacity === 1 or overwrites clear film layers.
 */
function createOpacityController(THREE, rootGroup, shouldIgnore = () => false) {
  const clonedMap = new Map();
  const entries = [];

  rootGroup.traverse(obj => {
    if (!obj.isMesh || !obj.material || shouldIgnore(obj)) return;
    const rawMats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const nextMats = rawMats.map(mat => {
      let entry = clonedMap.get(mat);
      if (!entry) {
        const cloned = mat.clone();
        entry = {
          mat: cloned,
          baseOpacity: cloned.opacity ?? 1,
          baseTransparent: Boolean(cloned.transparent),
          baseDepthWrite: cloned.depthWrite !== undefined ? cloned.depthWrite : true
        };
        clonedMap.set(mat, entry);
        entries.push(entry);
      }
      return entry.mat;
    });
    obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
  });

  let lastAlpha = -1;

  return {
    entries,
    apply(opacity = 1) {
      const a = clamp01(opacity);
      if (Math.abs(a - lastAlpha) < 1e-4) return;
      lastAlpha = a;

      rootGroup.visible = a > 0.002;
      const isOpaqueFull = a >= 0.999;

      for (const entry of entries) {
        const { mat, baseOpacity, baseTransparent, baseDepthWrite } = entry;
        const nextTransparent = baseTransparent || !isOpaqueFull;
        if (mat.transparent !== nextTransparent) {
          mat.transparent = nextTransparent;
          mat.needsUpdate = true;
        }
        mat.opacity = baseOpacity * a;
        mat.depthWrite = isOpaqueFull ? baseDepthWrite : (baseDepthWrite && a > 0.25);
      }
    }
  };
}

/**
 * Builds a centered rounded-rectangle Shape in the XY plane.
 */
function createRoundedRectShape(THREE, width, height, radius) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

/**
 * Builds a rounded-rectangle ShapeGeometry with normalized [0..1] planar UVs.
 */
function makeRoundedPlaneGeometry(THREE, width, height, radius, curveSegments = 24) {
  const shape = createRoundedRectShape(THREE, width, height, radius);
  const geom = new THREE.ShapeGeometry(shape, curveSegments);
  const pos = geom.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + width / 2) / width;
    uv[i * 2 + 1] = (pos.getY(i) + height / 2) / height;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geom;
}

/**
 * Builds a clean rounded-rectangle cutout Path (clockwise) for ExtrudeGeometry holes.
 */
function createRoundedRectHole(THREE, width, height, radius) {
  const path = new THREE.Path();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  path.moveTo(-hw + r, -hh);
  path.lineTo(-hw, -hh + r);
  path.lineTo(-hw, hh - r);
  path.quadraticCurveTo(-hw, hh, -hw + r, hh);
  path.lineTo(hw - r, hh);
  path.quadraticCurveTo(hw, hh, hw, hh - r);
  path.lineTo(hw, -hh + r);
  path.quadraticCurveTo(hw, -hh, hw - r, -hh);
  path.lineTo(-hw + r, -hh);
  return path;
}

/**
 * Collects all geometries, materials, and textures under a root for safe cleanup.
 */
function registerDisposables(root, textures, disposables) {
  for (const tex of textures) disposables.textures.add(tex);
  root.traverse(obj => {
    if (obj.geometry) disposables.geometries.add(obj.geometry);
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        disposables.materials.add(m);
        if (m.map) disposables.textures.add(m.map);
        if (m.roughnessMap) disposables.textures.add(m.roughnessMap);
        if (m.bumpMap) disposables.textures.add(m.bumpMap);
        if (m.emissiveMap) disposables.textures.add(m.emissiveMap);
      }
    }
  });
}

/**
 * Builds the 2.5x scale modern countertop contactless POS terminal resting on y = 0.
 */
function buildTerminal(THREE, disposables) {
  const group = new THREE.Group();
  group.name = 'pos-terminal';
  const localTextures = [];

  // Grounding contact shadow at y = 0.002
  const shadow = makeContactShadow(THREE, 0.36, 0.36, 0.30);
  shadow.position.set(0, 0.002, 0.01);
  shadow.userData.ignoreOpacity = true;
  group.add(shadow);

  // Subtle matte rubber base pad resting cleanly at y = 0
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x141618,
    roughness: 0.88,
    metalness: 0.04
  });
  const baseFoot = new THREE.Mesh(
    new RoundedBoxGeometry(0.184, 0.008, 0.256, 3, 0.004),
    rubberMat
  );
  baseFoot.position.set(0, 0.004, -0.020);
  group.add(baseFoot);

  // Sculpted angled pedestal wedge supporting the slanted deck
  const charcoalShellMat = new THREE.MeshPhysicalMaterial({
    color: 0x202328,
    roughness: 0.44,
    metalness: 0.18,
    clearcoat: 0.16,
    clearcoatRoughness: 0.52
  });
  const aluminumMat = new THREE.MeshPhysicalMaterial({
    color: 0xc2c6cc,
    metalness: 0.88,
    roughness: 0.27,
    clearcoat: 0.26,
    clearcoatRoughness: 0.24
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x101215,
    roughness: 0.58,
    metalness: 0.16
  });

  // Side profile drawn in (-z, y) and rotated +PI/2 around Y so it extrudes symmetrically along X.
  // Base Y starts at 0.012 so with bevelSize 0.008 the bottom sits at y = 0.004 inside baseFoot (y = 0..0.008).
  const cradleProfile = new THREE.Shape();
  cradleProfile.moveTo(0.136, 0.012);
  cradleProfile.lineTo(-0.098, 0.012);
  cradleProfile.quadraticCurveTo(-0.072, 0.042, -0.046, 0.068);
  cradleProfile.lineTo(-0.066, 0.122);
  cradleProfile.lineTo(0.126, 0.246);
  cradleProfile.quadraticCurveTo(0.146, 0.140, 0.136, 0.012);
  const cradleWidth = 0.156;
  const cradleGeom = new THREE.ExtrudeGeometry(cradleProfile, {
    depth: cradleWidth,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 4,
    curveSegments: 20
  });
  cradleGeom.translate(0, 0, -cradleWidth / 2);
  const cradleMesh = new THREE.Mesh(cradleGeom, charcoalShellMat);
  cradleMesh.rotation.y = Math.PI / 2;
  group.add(cradleMesh);

  // Rear subtle cable strain-relief collar
  const cableCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.013, 0.024, 20),
    darkTrimMat
  );
  cableCollar.rotation.x = Math.PI / 2;
  cableCollar.position.set(0, 0.022, -0.146);
  group.add(cableCollar);

  // Slanted ergonomic upper deck facing +Z/+Y (-0.98 rad around X)
  const TILT_X = -0.98;
  const deckGroup = new THREE.Group();
  deckGroup.position.set(0, 0.172, 0.012);
  deckGroup.rotation.x = TILT_X;
  group.add(deckGroup);

  // Main upper beveled dark-charcoal housing (~0.214m W x 0.404m L x 0.042m D)
  const deckW = 0.214;
  const deckL = 0.404;
  const deckD = 0.042;
  const mainBody = new THREE.Mesh(
    new RoundedBoxGeometry(deckW, deckL, deckD, 6, 0.014),
    charcoalShellMat
  );
  deckGroup.add(mainBody);

  // Contoured underside housing belly for thermal-printer/battery volume
  const underBelly = new THREE.Mesh(
    new RoundedBoxGeometry(0.184, 0.240, 0.032, 5, 0.014),
    darkTrimMat
  );
  underBelly.position.set(0, 0.035, -0.020);
  deckGroup.add(underBelly);

  // Satin anodized aluminum side trim rails
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(0.014, 0.388, 0.034, 4, 0.0055),
      aluminumMat
    );
    rail.position.set(side * 0.107, 0, 0.001);
    deckGroup.add(rail);
  }

  // Top & bottom subtle aluminum chamfer accents
  const topTrim = new THREE.Mesh(
    new RoundedBoxGeometry(0.186, 0.008, 0.022, 3, 0.003),
    aluminumMat
  );
  topTrim.position.set(0, 0.200, 0.001);
  const bottomTrim = new THREE.Mesh(
    new RoundedBoxGeometry(0.186, 0.008, 0.022, 3, 0.003),
    aluminumMat
  );
  bottomTrim.position.set(0, -0.200, 0.001);
  deckGroup.add(topTrim, bottomTrim);

  // Manufacturing seam grooves (recessed parting line between screen bezel and NFC crown)
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x0b0c0e,
    roughness: 0.72,
    metalness: 0.12
  });
  const horizontalSeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.198, 0.0024, 0.003),
    seamMat
  );
  horizontalSeam.position.set(0, 0.080, 0.0204);
  deckGroup.add(horizontalSeam);

  for (const side of [-1, 1]) {
    const sideSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.0018, 0.372, 0.003),
      seamMat
    );
    sideSeam.position.set(side * 0.098, 0, 0.0204);
    deckGroup.add(sideSeam);
  }

  // Raised protective bezel with true recessed IPS aperture (ExtrudeGeometry with hole)
  const bezelCenterY = -0.056;
  const bezelOuterW = 0.192;
  const bezelOuterH = 0.242;
  const screenW = 0.176;
  const screenH = 0.220; // exact 4:5 (512x640) aspect ratio

  const bezelShape = createRoundedRectShape(THREE, bezelOuterW, bezelOuterH, 0.011);
  bezelShape.holes.push(createRoundedRectHole(THREE, screenW, screenH, 0.006));
  const bezelGeom = new THREE.ExtrudeGeometry(bezelShape, {
    depth: 0.0044,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 3,
    curveSegments: 16
  });
  const bezelMat = new THREE.MeshPhysicalMaterial({
    color: 0x16181b,
    roughness: 0.30,
    metalness: 0.14,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25
  });
  const bezelMesh = new THREE.Mesh(bezelGeom, bezelMat);
  bezelMesh.position.set(0, bezelCenterY, 0.0200); // front face reaches z_deck = +0.0256
  deckGroup.add(bezelMesh);

  // Dark inner well behind recessed IPS screen
  const screenWell = new THREE.Mesh(
    new THREE.PlaneGeometry(screenW + 0.002, screenH + 0.002),
    new THREE.MeshBasicMaterial({ color: 0x090b0d })
  );
  screenWell.position.set(0, bezelCenterY, 0.0212);
  deckGroup.add(screenWell);

  // Dynamic 512x640 IPS screen CanvasTexture (redrawn only on quantized state change)
  const screenPaint = paintCanvas(THREE, 512, 640, () => {});
  screenPaint.texture.anisotropy = 8;
  localTextures.push(screenPaint.texture);

  const screenMesh = new THREE.Mesh(
    makeRoundedPlaneGeometry(THREE, screenW, screenH, 0.006, 16),
    new THREE.MeshBasicMaterial({
      map: screenPaint.texture,
      toneMapped: false
    })
  );
  screenMesh.position.set(0, bezelCenterY, 0.0218);
  deckGroup.add(screenMesh);

  // Glossy protective screen glass cover (MeshPhysicalMaterial clearcoat: 1)
  const screenGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x111519,
    roughness: 0.04,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.9,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });
  const screenGlass = new THREE.Mesh(
    makeRoundedPlaneGeometry(THREE, screenW + 0.002, screenH + 0.002, 0.006, 16),
    screenGlassMat
  );
  screenGlass.position.set(0, bezelCenterY, 0.0238);
  screenGlass.renderOrder = 2;
  deckGroup.add(screenGlass);

  // Four recessed status LED pips integrated cleanly in dark bar right above screen
  const ledBar = new THREE.Mesh(
    new RoundedBoxGeometry(0.098, 0.013, 0.0032, 3, 0.0014),
    darkTrimMat
  );
  ledBar.position.set(0, 0.070, 0.0215);
  deckGroup.add(ledBar);

  const ledSockets = [];
  const ledDots = [];
  const ledSocketMat = new THREE.MeshBasicMaterial({ color: 0x090b0c });
  const ledSocketGeom = new THREE.CircleGeometry(0.0044, 24);
  const ledDotGeom = new THREE.CircleGeometry(0.0032, 24);

  for (const offsetIndex of [-1.5, -0.5, 0.5, 1.5]) {
    const lx = offsetIndex * 0.022;
    const socket = new THREE.Mesh(ledSocketGeom, ledSocketMat);
    socket.position.set(lx, 0.070, 0.0232);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x2a3035,
      toneMapped: false
    });
    const dot = new THREE.Mesh(ledDotGeom, dotMat);
    dot.position.set(lx, 0.070, 0.0235);
    deckGroup.add(socket, dot);
    ledSockets.push(socket);
    ledDots.push(dot);
  }

  // Upper contactless NFC tap dome/pad (proud of screen bezel so tapping card never clips)
  const PAD_CENTER_Y = 0.142;
  const padW = 0.184;
  const padH = 0.098;
  const padBaseMat = new THREE.MeshPhysicalMaterial({
    color: 0x16191e,
    roughness: 0.24,
    metalness: 0.10,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16
  });
  const tapDome = new THREE.Mesh(
    new RoundedBoxGeometry(padW, padH, 0.011, 5, 0.0046),
    padBaseMat
  );
  // Positioned at z = 0.0250 -> top surface sits at z_deck = +0.0305 (higher than bezel +0.0256)
  tapDome.position.set(0, PAD_CENTER_Y, 0.0250);
  deckGroup.add(tapDome);

  // Subtle illumination ring/halo nestled cleanly around the base shoulder of the tap dome
  const haloPaint = paintCanvas(THREE, 512, 280, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(24, 22, w - 48, h - 44, 30);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(24, 22, w - 48, h - 44, 30);
    ctx.stroke();
  });
  haloPaint.texture.anisotropy = 4;
  localTextures.push(haloPaint.texture);

  const haloMat = new THREE.MeshBasicMaterial({
    map: haloPaint.texture,
    color: COLORS.COPPER,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false
  });
  const haloMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(padW + 0.020, padH + 0.020),
    haloMat
  );
  haloMesh.position.set(0, PAD_CENTER_Y, 0.0222);
  haloMesh.renderOrder = 3;
  haloMesh.userData.ignoreOpacity = true;
  deckGroup.add(haloMesh);

  // Crisp printed contactless NFC symbol centered optically on the dome face
  const nfcDecalPaint = paintCanvas(THREE, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    const iconSize = w * 0.56;
    drawContactlessIcon(ctx, w / 2 + iconSize * 0.08, h / 2, iconSize, 15);
  });
  nfcDecalPaint.texture.anisotropy = 8;
  localTextures.push(nfcDecalPaint.texture);

  const nfcIconMat = new THREE.MeshBasicMaterial({
    map: nfcDecalPaint.texture,
    color: 0xaab1b8,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    toneMapped: false
  });
  const nfcIcon = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.068), nfcIconMat);
  nfcIcon.position.set(0, PAD_CENTER_Y, 0.0308);
  nfcIcon.renderOrder = 4;
  deckGroup.add(nfcIcon);

  // Expanding NFC field ripples emitted just above the reader surface
  const ripples = createRipples(THREE, {
    count: 3,
    inner: 0.92,
    color: COLORS.COPPER,
    accentColor: COLORS.GREEN_BRIGHT
  });
  ripples.group.position.set(0, PAD_CENTER_Y, 0.0322);
  ripples.group.traverse(child => {
    child.userData.ignoreOpacity = true;
  });
  deckGroup.add(ripples.group);

  // Exact readerAnchor & readerNormal in terminal.group local space
  deckGroup.updateMatrix();
  const readerAnchor = new THREE.Vector3(0, PAD_CENTER_Y, 0.0320).applyMatrix4(deckGroup.matrix);
  const readerNormal = new THREE.Vector3(0, 0, 1).transformDirection(deckGroup.matrix).normalize();

  // Opacity controller (excludes shadow, haloMesh, and ripples which manage opacity explicitly)
  const opacityCtrl = createOpacityController(THREE, group, obj => Boolean(obj.userData.ignoreOpacity));
  const shadowMat = shadow.material;
  const shadowBaseOpacity = shadowMat.opacity;

  // Color scratch objects for zero-GC frame updates
  const ledOffColor = new THREE.Color(0x2a3035);
  const ledReadColor = new THREE.Color(COLORS.AMBER);
  const ledOkColor = new THREE.Color(COLORS.GREEN_BRIGHT);
  const haloIdleColor = new THREE.Color(COLORS.COPPER);
  const haloOkColor = new THREE.Color(COLORS.GREEN_BRIGHT);
  const iconIdleColor = new THREE.Color(0x9ca4ac);
  const iconGlowColor = new THREE.Color(0xf6f1e6);
  const iconOkColor = new THREE.Color(COLORS.GREEN_BRIGHT);

  // Dynamic POS display redraw (quantized so CanvasTexture uploads only on change)
  let lastScreenKey = '';
  function drawScreen(readProgress, success) {
    const readQ = Math.round(readProgress * 20);
    const okQ = Math.round(success * 60);
    const key = `${readQ}|${okQ}`;
    if (key === lastScreenKey) return;
    lastScreenKey = key;

    const { ctx, canvas, texture } = screenPaint;
    const w = canvas.width;
    const h = canvas.height;

    // Deep OLED slate background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#161a1e');
    bgGrad.addColorStop(1, '#0d1013');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Top status header
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(235, 232, 224, 0.52)';
    ctx.font = '600 20px "Inter Tight", Arial, sans-serif';
    ctx.fillText('CHECKOUT', 42, 54);

    // Subtle status pill dot top-right
    ctx.fillStyle = success > 0.5 ? '#22b46a' : readProgress > 0.05 ? '#ffb347' : '#6c747c';
    ctx.beginPath();
    ctx.arc(w - 46, 46, 7, 0, Math.PI * 2);
    ctx.fill();

    // Merchant / Amount block
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238, 235, 228, 0.58)';
    ctx.font = '600 26px "Inter Tight", Arial, sans-serif';
    ctx.fillText(success > 0.55 ? 'Paid' : 'Total due', w / 2, 114);

    ctx.fillStyle = '#f6f4ef';
    ctx.font = '700 84px "Inter Tight", Arial, sans-serif';
    ctx.fillText('$14.50', w / 2, 198);

    // Hairline divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(46, 240);
    ctx.lineTo(w - 46, 240);
    ctx.stroke();

    // Idle / reading prompt ("Tap card") fades out completely before success badge appears
    const waitAlpha = clamp01(1 - success / 0.38);
    if (waitAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = waitAlpha;

      // Subtle circular contactless guide ring
      ctx.strokeStyle = readProgress > 0.05
        ? `rgba(255, 200, 130, ${0.18 + 0.28 * readProgress})`
        : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, 390, 92, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = readProgress > 0.05 ? '#f5ead6' : '#d2cec4';
      const screenIconSize = 126;
      drawContactlessIcon(ctx, w / 2 + screenIconSize * 0.08, 390, screenIconSize, 9);

      ctx.fillStyle = 'rgba(244, 240, 232, 0.78)';
      ctx.font = '600 32px "Inter Tight", Arial, sans-serif';
      ctx.fillText(readProgress > 0.05 ? 'Processing…' : 'Tap your card', w / 2, 552);
      ctx.restore();
    }

    // Success confirmation ("Payment successful." + #22b46a checkmark badge) appears only after wait state clears
    const okAlpha = success > 0.42 ? smoothstep(clamp01((success - 0.42) / 0.58)) : 0;
    if (okAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = okAlpha;
      const pop = 0.80 + 0.20 * outCubic(okAlpha);

      // Soft emerald outer halo
      ctx.fillStyle = 'rgba(34, 180, 106, 0.20)';
      ctx.beginPath();
      ctx.arc(w / 2, 390, 102 * pop, 0, Math.PI * 2);
      ctx.fill();

      // Solid emerald badge
      ctx.fillStyle = '#22b46a';
      ctx.beginPath();
      ctx.arc(w / 2, 390, 76 * pop, 0, Math.PI * 2);
      ctx.fill();

      // Crisp checkmark
      ctx.strokeStyle = '#ffffff';
      drawCheckmark(ctx, w / 2, 392, 82 * pop, 12);

      ctx.fillStyle = '#f6f4ef';
      ctx.font = '700 31px "Inter Tight", Arial, sans-serif';
      ctx.fillText('Payment successful.', w / 2, 552);
      ctx.restore();
    }

    texture.needsUpdate = true;
  }

  // Paint initial screen immediately
  drawScreen(0, 0);

  function setState({
    readProgress = 0,
    success = 0,
    pulse = 0,
    glow = 0,
    opacity = 1
  } = {}) {
    const rp = clamp01(readProgress);
    const ok = clamp01(success);
    const pl = clamp01(pulse);
    const gl = clamp01(glow);
    const op = clamp01(opacity);

    opacityCtrl.apply(op);
    shadowMat.opacity = shadowBaseOpacity * op;

    // 4 recessed status LED pips: light sequentially with readProgress, lock emerald on success
    for (let k = 0; k < ledDots.length; k++) {
      const pipRead = clamp01((rp - k * 0.20) / 0.25);
      const col = ledDots[k].material.color;
      col.copy(ledOffColor).lerp(ledReadColor, pipRead);
      col.lerp(ledOkColor, ok);
    }

    // Pad perimeter halo & NFC icon tint
    const haloStrength = Math.max(gl * 0.85, ok * 0.92);
    haloMat.color.copy(haloIdleColor).lerp(haloOkColor, ok);
    haloMat.opacity = haloStrength * op;
    haloMesh.visible = haloMat.opacity > 0.005 && op > 0.002;

    nfcIconMat.color.copy(iconIdleColor).lerp(iconGlowColor, gl).lerp(iconOkColor, ok);

    // Expanding NFC field ripples
    ripples.update(pl, 0.044, 0.138, 0.72 * op, ok);

    // Quantized CanvasTexture UI update
    drawScreen(rp, ok);
  }

  // Ensure initial state is clean
  setState({ readProgress: 0, success: 0, pulse: 0, glow: 0, opacity: 1 });
  registerDisposables(group, localTextures, disposables);

  return {
    group,
    readerAnchor,
    readerNormal,
    setState
  };
}

/**
 * Procedural fallback bank card in case models/contactless-card.glb fails to load.
 */
function buildProceduralBankCard(THREE, localTextures) {
  const cardGroup = new THREE.Group();
  const bevel = 0.0004;
  const coreW = CARD_W - 2 * bevel;
  const coreH = CARD_H - 2 * bevel;
  const coreR = CARD_RADIUS - bevel;
  const thickness = 0.0020;
  const coreDepth = thickness - 2 * bevel;

  const coreShape = createRoundedRectShape(THREE, coreW, coreH, coreR);
  const coreGeom = new THREE.ExtrudeGeometry(coreShape, {
    depth: coreDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24
  });
  coreGeom.translate(0, 0, -coreDepth / 2);

  const core = new THREE.Mesh(
    coreGeom,
    new THREE.MeshPhysicalMaterial({
      color: 0x1e2530,
      roughness: 0.34,
      metalness: 0.12,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28
    })
  );
  cardGroup.add(core);

  const frontPaint = paintCanvas(THREE, 1024, 646, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#222a36');
    grad.addColorStop(1, '#141922');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle geometric metallic arc accent
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.25, 310, 0, Math.PI * 2);
    ctx.stroke();

    // Issuer name
    ctx.fillStyle = '#f2efe8';
    ctx.font = '700 38px "Inter Tight", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('BANK CARD', 72, 106);

    // Contactless symbol
    ctx.strokeStyle = 'rgba(242, 239, 232, 0.82)';
    drawContactlessIcon(ctx, 278, 294, 66, 6);

    // Gold EMV chip plate
    const chipX = 96;
    const chipY = 236;
    const chipW = 122;
    const chipH = 94;
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH);
    chipGrad.addColorStop(0, '#e3c47a');
    chipGrad.addColorStop(1, '#b68d3e');
    ctx.fillStyle = chipGrad;
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, chipW, chipH, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(65, 44, 12, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(chipX + 36, chipY + 14, 50, 66);
    ctx.beginPath();
    ctx.moveTo(chipX, chipY + 47);
    ctx.lineTo(chipX + 36, chipY + 47);
    ctx.moveTo(chipX + 86, chipY + 47);
    ctx.lineTo(chipX + chipW, chipY + 47);
    ctx.stroke();

    // Card number & holder micro-details
    ctx.fillStyle = 'rgba(242, 239, 232, 0.86)';
    ctx.font = '600 34px "JetBrains Mono", Consolas, monospace';
    ctx.fillText('••••  ••••  ••••  4821', 72, 466);

    ctx.fillStyle = 'rgba(242, 239, 232, 0.56)';
    ctx.font = '600 22px "Inter Tight", Arial, sans-serif';
    ctx.fillText('VALID THRU  09/29', 72, 540);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2efe8';
    ctx.font = '700 34px "Inter Tight", Arial, sans-serif';
    ctx.fillText('DEBIT', w - 72, 540);
  });
  frontPaint.texture.anisotropy = 8;
  localTextures.push(frontPaint.texture);

  const frontFace = new THREE.Mesh(
    makeRoundedPlaneGeometry(THREE, CARD_W - 0.001, CARD_H - 0.001, CARD_RADIUS - 0.0005),
    new THREE.MeshPhysicalMaterial({
      map: frontPaint.texture,
      roughness: 0.30,
      metalness: 0.08,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    })
  );
  frontFace.position.z = thickness / 2 + 0.00004;

  const rearFace = new THREE.Mesh(
    makeRoundedPlaneGeometry(THREE, CARD_W - 0.001, CARD_H - 0.001, CARD_RADIUS - 0.0005),
    new THREE.MeshStandardMaterial({
      color: 0x161b23,
      roughness: 0.45,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    })
  );
  rearFace.rotation.y = Math.PI;
  rearFace.position.z = -thickness / 2 - 0.00004;

  cardGroup.add(frontFace, rearFace);
  return cardGroup;
}

/**
 * Loads models/contactless-card.glb, hides sealed internals, applies polygonOffset to flat decals,
 * centers bounds, scales 2.5x (~0.214m x 0.135m), and exposes clean opacity control.
 */
async function buildBankCard(THREE, gltfLoader, disposables) {
  const group = new THREE.Group();
  group.name = 'bank-card';
  const localTextures = [];

  try {
    if (!gltfLoader) throw new Error('GLTFLoader not provided');
    const gltf = await gltfLoader.loadAsync('models/contactless-card.glb');
    const shell = gltf.scene;

    for (const partName of SEALED_CARD_PARTS) {
      const part = shell.getObjectByName(partName);
      if (part) part.visible = false;
    }

    const size = new THREE.Vector3();
    shell.traverse(part => {
      if (!part.isMesh || !part.material) return;
      part.material = part.material.clone();

      const geometry = part.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      geometry.boundingBox.getSize(size);

      // Lift truly flat decal sheets in depth buffer only to eliminate z-fighting
      if (size.z <= Math.max(size.x, size.y) * 1e-5) {
        part.material.polygonOffset = true;
        part.material.polygonOffsetFactor = -1;
        part.material.polygonOffsetUnits = -4;
      }

      // Subtle sheen polish for studio reflections on chip contacts and printed PVC
      if (part.material.name === 'Brushed gold-plated contacts') {
        part.material.metalness = Math.max(part.material.metalness ?? 0.8, 0.88);
        part.material.roughness = Math.min(part.material.roughness ?? 0.35, 0.28);
        part.material.envMapIntensity = 1.15;
      } else if (
        part.material.name === 'front-printed-artwork' ||
        part.material.name === 'rear-printed-artwork'
      ) {
        part.material.roughness = Math.min(part.material.roughness ?? 0.45, 0.36);
        part.material.envMapIntensity = 1.05;
      }
    });

    const box = new THREE.Box3().setFromObject(shell);
    shell.position.sub(box.getCenter(new THREE.Vector3()));

    const scaledWrap = new THREE.Group();
    scaledWrap.scale.setScalar(2.5);
    scaledWrap.add(shell);
    group.add(scaledWrap);
  } catch (err) {
    console.warn('Could not load models/contactless-card.glb; using procedural fallback bank card.', err);
    group.add(buildProceduralBankCard(THREE, localTextures));
  }

  const opacityCtrl = createOpacityController(THREE, group);
  registerDisposables(group, localTextures, disposables);

  return {
    group,
    setOpacity(a = 1) {
      opacityCtrl.apply(a);
    }
  };
}

/**
 * Builds the bespoke public-transit STATION CARD (0.214m W x 0.135m H x 0.0024m D,
 * 0.008m corner radius) with high-contrast 1024x646 CanvasTexture front & rear artwork.
 */
function buildStationCard(THREE, disposables) {
  const group = new THREE.Group();
  group.name = 'station-card';
  const localTextures = [];

  // Beveled satin PVC core (outer dimensions exact 0.214m x 0.135m x 0.0024m)
  const bevel = 0.00045;
  const coreW = CARD_W - 2 * bevel;
  const coreH = CARD_H - 2 * bevel;
  const coreR = CARD_RADIUS - bevel;
  const coreDepth = 0.0024 - 2 * bevel; // 0.0015m + 2*0.00045m = 0.0024m

  const coreShape = createRoundedRectShape(THREE, coreW, coreH, coreR);
  const coreGeom = new THREE.ExtrudeGeometry(coreShape, {
    depth: coreDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24
  });
  coreGeom.translate(0, 0, -coreDepth / 2);

  const edgeMat = new THREE.MeshPhysicalMaterial({
    color: 0xeae6dc,
    roughness: 0.36,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.32
  });
  const coreMesh = new THREE.Mesh(coreGeom, edgeMat);
  group.add(coreMesh);

  // Front artwork (1024x646, anisotropy = 8)
  const frontPaint = paintCanvas(THREE, 1024, 646, (ctx, w, h) => {
    // Warm pearl off-white base (#f7f5f0)
    ctx.fillStyle = '#f7f5f0';
    ctx.fillRect(0, 0, w, h);

    // Subtle matte border hairline
    ctx.strokeStyle = 'rgba(29, 32, 36, 0.08)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Top slate charcoal band (#1d2024)
    const bandH = 148;
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(0, 0, w, bandH);

    // Subtle metallic divider rule beneath charcoal band
    const ruleGrad = ctx.createLinearGradient(0, 0, w, 0);
    ruleGrad.addColorStop(0, '#787d84');
    ruleGrad.addColorStop(0.5, '#c8ccd2');
    ruleGrad.addColorStop(1, '#787d84');
    ctx.fillStyle = ruleGrad;
    ctx.fillRect(0, bandH, w, 4);

    // Minimalist metro emblem inside top-left charcoal band
    ctx.strokeStyle = '#f7f5f0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(82, 74, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(64, 74);
    ctx.lineTo(100, 74);
    ctx.stroke();
    ctx.fillStyle = '#f7f5f0';
    ctx.beginPath();
    ctx.arc(82, 74, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f7f5f0';
    ctx.font = '600 24px "Inter Tight", Arial, sans-serif';
    ctx.fillText('METRO TRANSIT', 124, 82);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(247, 245, 240, 0.68)';
    ctx.font = '600 22px "Inter Tight", Arial, sans-serif';
    ctx.fillText('ALL ZONES', w - 64, 82);

    // Centered high-contrast STATION CARD headline
    ctx.textAlign = 'center';
    ctx.fillStyle = '#17191c';
    ctx.font = '700 84px "Inter Tight", Arial, sans-serif';
    ctx.fillText('STATION CARD', w / 2, 320);

    // Subtle metallic transit line graphic beneath title
    const lineY = 408;
    const lineX0 = 180;
    const lineX1 = w - 180;
    const lineGrad = ctx.createLinearGradient(lineX0, lineY, lineX1, lineY);
    lineGrad.addColorStop(0, 'rgba(29, 32, 36, 0.14)');
    lineGrad.addColorStop(0.5, 'rgba(29, 32, 36, 0.42)');
    lineGrad.addColorStop(1, 'rgba(29, 32, 36, 0.14)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lineX0, lineY);
    ctx.lineTo(lineX1, lineY);
    ctx.stroke();

    // Minimalist station nodes along transit line
    for (const [nx, active] of [[280, false], [w / 2, true], [w - 280, false]]) {
      ctx.fillStyle = '#f7f5f0';
      ctx.beginPath();
      ctx.arc(nx, lineY, active ? 13 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = active ? '#1d2024' : '#7b8088';
      ctx.lineWidth = active ? 5 : 4;
      ctx.stroke();
      if (active) {
        ctx.fillStyle = '#1d2024';
        ctx.beginPath();
        ctx.arc(nx, lineY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bottom clean serial/zone micro-details (left) & contactless symbol (right)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5a5850';
    ctx.font = '600 22px "JetBrains Mono", Consolas, monospace';
    ctx.fillText('PASS NO.  04 · 7B · 21 · 9E', 64, 540);
    ctx.fillStyle = 'rgba(29, 32, 36, 0.56)';
    ctx.font = '600 20px "Inter Tight", Arial, sans-serif';
    ctx.fillText('CONTACTLESS SMART PASS  ·  13.56 MHz', 64, 578);

    ctx.strokeStyle = '#1d2024';
    drawContactlessIcon(ctx, w - 98, 550, 68, 6);
  });
  frontPaint.texture.anisotropy = 8;
  localTextures.push(frontPaint.texture);

  const faceGeom = makeRoundedPlaneGeometry(THREE, coreW, coreH, coreR, 24);
  const frontMesh = new THREE.Mesh(
    faceGeom,
    new THREE.MeshPhysicalMaterial({
      map: frontPaint.texture,
      roughness: 0.28,
      metalness: 0.03,
      clearcoat: 0.58,
      clearcoatRoughness: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    })
  );
  frontMesh.position.z = 0.001205;
  group.add(frontMesh);

  // Rear artwork (1024x646 matte/clearcoat rear face)
  const rearPaint = paintCanvas(THREE, 1024, 646, (ctx, w, h) => {
    ctx.fillStyle = '#f2efe8';
    ctx.fillRect(0, 0, w, h);

    // Charcoal reference stripe
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(0, 74, w, 92);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#59574f';
    ctx.font = '600 24px "Inter Tight", Arial, sans-serif';
    ctx.fillText('Tap flat against the reader at any station gate.', 64, 250);
    ctx.fillStyle = 'rgba(29, 32, 36, 0.54)';
    ctx.font = '500 20px "Inter Tight", Arial, sans-serif';
    ctx.fillText('Powered wirelessly by the gate field — no battery inside.', 64, 290);

    // Minimalist signature/code strip
    ctx.fillStyle = '#e4dfd4';
    ctx.fillRect(64, 356, 520, 68);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4f4d46';
    ctx.font = '600 22px "JetBrains Mono", Consolas, monospace';
    ctx.fillText('SN 8402-1940-A', w - 64, 578);
  });
  rearPaint.texture.anisotropy = 8;
  localTextures.push(rearPaint.texture);

  const rearMesh = new THREE.Mesh(
    faceGeom,
    new THREE.MeshPhysicalMaterial({
      map: rearPaint.texture,
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.24,
      clearcoatRoughness: 0.36,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    })
  );
  rearMesh.rotation.y = Math.PI;
  rearMesh.position.z = -0.001205;
  group.add(rearMesh);

  const opacityCtrl = createOpacityController(THREE, group);
  registerDisposables(group, localTextures, disposables);

  return {
    group,
    setOpacity(a = 1) {
      opacityCtrl.apply(a);
    }
  };
}

/**
 * Creates all payment and card assets for the #taps sequence.
 */
export async function createPaymentAssets(THREE, gltfLoader) {
  const disposables = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set()
  };

  const [terminal, bankCard, stationCard] = await Promise.all([
    Promise.resolve(buildTerminal(THREE, disposables)),
    buildBankCard(THREE, gltfLoader, disposables),
    Promise.resolve(buildStationCard(THREE, disposables)),
  ]);

  const counter = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9d0c3, roughness: 0.69 });
  const base = new THREE.MeshStandardMaterial({ color: 0xc0b6a8, roughness: 0.83 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.44, 0.069, 1.02, 3, 0.019), stone);
  top.position.set(0.08, -0.0345, -0.055);
  const front = new THREE.Mesh(new RoundedBoxGeometry(1.38, 0.81, 0.81, 3, 0.02), base);
  front.position.set(0.08, -0.47, -0.072);
  const stationCardShadow = makeContactShadow(THREE, 0.28, 0.19, 0.48);
  stationCardShadow.position.y = 0.0005;
  counter.add(top, front, stationCardShadow);
  registerDisposables(counter, [], disposables);
  counter.add(terminal.group, bankCard.group);

  function dispose() {
    for (const g of disposables.geometries) g.dispose();
    for (const m of disposables.materials) m.dispose();
    for (const t of disposables.textures) t.dispose();
    disposables.geometries.clear();
    disposables.materials.clear();
    disposables.textures.clear();
  }

  return {
    counter,
    terminal,
    bankCard,
    stationCard,
    stationCardShadow,
    dispose
  };
}
