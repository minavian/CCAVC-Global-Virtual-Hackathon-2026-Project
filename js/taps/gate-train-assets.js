import { buildTrain, TRACK_Z, RAIL_TOP_Y, HALF_GAUGE } from './train-assets.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  COLORS,
  paintCanvas,
  makeContactShadow,
  createRipples,
  drawContactlessIcon,
  drawCheckmark,
  drawArrowRight
} from './easing.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Tracks materials inside an asset group so group-wide fade (0..1)
 * preserves original transparent/depthWrite flags when restored to 1.
 */
function createOpacityTracker() {
  const entries = [];
  const seen = new Set();

  function trackMaterial(mat) {
    if (!mat || seen.has(mat)) return;
    seen.add(mat);
    entries.push({
      mat,
      baseOpacity: mat.opacity ?? 1,
      baseTransparent: Boolean(mat.transparent),
      baseDepthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true
    });
  }

  function trackTree(root, excludeSet = null) {
    root.traverse(obj => {
      if (excludeSet && excludeSet.has(obj)) return;
      if (!obj.isMesh || !obj.material) return;
      if (Array.isArray(obj.material)) obj.material.forEach(trackMaterial);
      else trackMaterial(obj.material);
    });
  }

  function apply(opacity) {
    const a = clamp01(opacity);
    const solid = a >= 0.999;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (solid) {
        e.mat.opacity = e.baseOpacity;
        e.mat.transparent = e.baseTransparent;
        e.mat.depthWrite = e.baseDepthWrite;
      } else {
        e.mat.opacity = e.baseOpacity * a;
        e.mat.transparent = true;
        e.mat.depthWrite = e.baseTransparent ? e.baseDepthWrite : false;
      }
    }
    return a;
  }

  return { trackMaterial, trackTree, apply };
}

/**
 * Deterministic pseudo-random helper for repeatable procedural textures.
 */
function hash1D(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Generates paired horizontal brushed stainless-steel albedo and bump textures.
 */
function createBrushedMetalTextures(THREE) {
  const colorPainted = paintCanvas(THREE, 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#d5d8dd');
    grad.addColorStop(0.5, '#c8ccd2');
    grad.addColorStop(1, '#cfd3d8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < h; y++) {
      const n = hash1D(y * 1.7);
      const alpha = 0.03 + n * 0.05;
      ctx.fillStyle = n > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(55,62,70,${alpha})`;
      ctx.fillRect(0, y, w, 1);
      if (y % 3 === 0) {
        const sx = hash1D(y * 5.3) * w;
        const sw = 40 + hash1D(y * 9.1) * 180;
        ctx.fillStyle = `rgba(255,255,255,${0.04 + hash1D(y * 2.1) * 0.04})`;
        ctx.fillRect(sx, y, sw, 1);
      }
    }

    // Subtle architectural panel seam lines
    ctx.fillStyle = 'rgba(42, 46, 52, 0.22)';
    ctx.fillRect(0, 170, w, 2);
    ctx.fillRect(0, 342, w, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(0, 172, w, 1);
    ctx.fillRect(0, 344, w, 1);
  });

  const bumpPainted = paintCanvas(THREE, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = Math.round(118 + hash1D(y * 3.1) * 20);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = '#383838';
    ctx.fillRect(0, 170, w, 2);
    ctx.fillRect(0, 342, w, 2);
  });

  for (const tex of [colorPainted.texture, bumpPainted.texture]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 4;
  }
  bumpPainted.texture.colorSpace = THREE.NoColorSpace;

  return { map: colorPainted.texture, bumpMap: bumpPainted.texture };
}

/**
 * Generates warm architectural stone/terrazzo concourse deck texture with subtle expansion joints.
 */
function createStoneDeckTexture(THREE) {
  const painted = paintCanvas(THREE, 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efeae1';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 3800; i++) {
      const x = hash1D(i * 1.13) * w;
      const y = hash1D(i * 2.71) * h;
      const r = 0.6 + hash1D(i * 4.19) * 1.2;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(130, 122, 110, 0.045)' : 'rgba(255, 252, 246, 0.09)';
      ctx.fillRect(x, y, r, r);
    }

    ctx.strokeStyle = 'rgba(128, 120, 108, 0.09)';
    ctx.lineWidth = 1.5;
    for (let gx = 0; gx <= w; gx += 128) {
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, h);
      ctx.stroke();
    }
    for (let gy = 0; gy <= h; gy += 128) {
      ctx.beginPath();
      ctx.moveTo(0, gy + 0.5);
      ctx.lineTo(w, gy + 0.5);
      ctx.stroke();
    }
  });
  painted.texture.wrapS = THREE.RepeatWrapping;
  painted.texture.wrapT = THREE.RepeatWrapping;
  painted.texture.repeat.set(4, 2);
  painted.texture.anisotropy = 4;
  return painted.texture;
}

/**
 * Generates fine crushed granite ballast texture for the railway bed.
 */
function createBallastTexture(THREE) {
  const painted = paintCanvas(THREE, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#97938c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const x = hash1D(i * 1.91) * w;
      const y = hash1D(i * 3.37) * h;
      const s = 1.5 + hash1D(i * 5.73) * 3.2;
      const shade = Math.round(115 + hash1D(i * 7.11) * 65);
      ctx.fillStyle = `rgba(${shade},${shade - 2},${shade - 6},0.55)`;
      ctx.fillRect(x, y, s, s * 0.8);
    }
  });
  painted.texture.wrapS = THREE.RepeatWrapping;
  painted.texture.wrapT = THREE.RepeatWrapping;
  painted.texture.repeat.set(28, 2);
  painted.texture.anisotropy = 4;
  return painted.texture;
}

/**
 * Generates a full-perimeter concourse alpha mask: solid inside the core platform zone
 * (x in [-5.2, +5.2], z in [-4.0, +0.6]) and smoothly feathered to 0 at x=+/-14 and z=+3.6.
 */
function createConcourseAlphaMap(THREE) {
  const painted = paintCanvas(THREE, 512, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let py = 0; py < h; py++) {
      const zWorld = lerp(-4.0, 3.6, py / (h - 1));
      const zAtten = zWorld <= 0.6 ? 1 : 1 - smooth01((zWorld - 0.6) / 3.0);
      for (let px = 0; px < w; px++) {
        const xAbs = Math.abs(lerp(-14.0, 14.0, px / (w - 1)));
        const xAtten = xAbs <= 5.2 ? 1 : 1 - smooth01((xAbs - 5.2) / 8.8);
        const a = Math.round(255 * zAtten * xAtten);
        const idx = (py * w + px) * 4;
        data[idx] = a;
        data[idx + 1] = a;
        data[idx + 2] = a;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  painted.texture.colorSpace = THREE.NoColorSpace;
  painted.texture.wrapS = THREE.ClampToEdgeWrapping;
  painted.texture.wrapT = THREE.ClampToEdgeWrapping;
  return painted.texture;
}

/**
 * Generates a 1D symmetric X-feather alpha mask (1 inside [-solidHalf, +solidHalf], 0 at +/-14m).
 */
function createStripFeatherAlphaMap(THREE, solidHalf = 5.2, invertU = false) {
  const painted = paintCanvas(THREE, 256, 16, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let px = 0; px < w; px++) {
      const u = px / (w - 1);
      const xAbs = Math.abs(lerp(-14.0, 14.0, invertU ? 1 - u : u));
      const a = Math.round(255 * (xAbs <= solidHalf ? 1 : 1 - smooth01((xAbs - solidHalf) / (14.0 - solidHalf))));
      for (let py = 0; py < h; py++) {
        const idx = (py * w + px) * 4;
        data[idx] = a;
        data[idx + 1] = a;
        data[idx + 2] = a;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  painted.texture.colorSpace = THREE.NoColorSpace;
  painted.texture.wrapS = THREE.ClampToEdgeWrapping;
  painted.texture.wrapT = THREE.ClampToEdgeWrapping;
  return painted.texture;
}

/**
 * Generates a soft radial headlight halo texture for additive LED lens glow.
 */
function smooth01(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function addFareLineRailings(THREE, group) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x858a8a, metalness: 0.76, roughness: 0.34 });
  const infill = new THREE.MeshStandardMaterial({ color: 0x717573, metalness: 0.61, roughness: 0.43 });
  const postGeo = new RoundedBoxGeometry(0.052, 0.965, 0.055, 2, 0.008);
  const footGeo = new RoundedBoxGeometry(0.102, 0.012, 0.116, 2, 0.004);
  const picketGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.66, 10);
  const matrix = new THREE.Matrix4();
  const z = -0.065;
  for (const [start, end] of [[-2.98, -0.59], [0.59, 2.0]]) {
    const length = end - start;
    const sections = Math.ceil(length / 1.15);
    const spacing = length / sections;
    const railGeo = new RoundedBoxGeometry(length, 0.036, 0.042, 2, 0.007);
    for (const y of [0.23, 0.91]) {
      const rail = new THREE.Mesh(railGeo, steel);
      rail.position.set((start + end) / 2, y, z);
      group.add(rail);
    }
    for (let i = 0; i <= sections; i++) {
      if ((i === 0 && start > 0) || (i === sections && end < 0)) continue;
      const x = start + i * spacing;
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(x, 0.483, z);
      const foot = new THREE.Mesh(footGeo, infill);
      foot.position.set(x, 0.007, z);
      group.add(post, foot);
    }
    const picketsPerSection = Math.ceil(spacing / 0.16) - 1;
    const pickets = new THREE.InstancedMesh(picketGeo, infill, sections * picketsPerSection);
    for (let section = 0; section < sections; section++) {
      for (let i = 0; i < picketsPerSection; i++) {
        const x = start + spacing * (section + (i + 1) / (picketsPerSection + 1));
        matrix.makeTranslation(x, 0.57, z);
        pickets.setMatrixAt(section * picketsPerSection + i, matrix);
      }
    }
    group.add(pickets);
  }
}

/**
 * Builds the modern metro/railway fare collection gate resting on y = 0.
 * Entry faces +Z, exit faces -Z, leaving a 0.72m center aisle (x in [-0.36, +0.36]).
 */
function buildGate(THREE, metalTextures) {
  const group = new THREE.Group();
  const tracker = createOpacityTracker();
  const dynamicTextures = [];

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: metalTextures.map,
    bumpMap: metalTextures.bumpMap,
    bumpScale: 0.0011,
    metalness: 0.78,
    roughness: 0.28,
    envMapIntensity: 1.05
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x1c1f23,
    roughness: 0.48,
    metalness: 0.35
  });
  const topDeckMat = new THREE.MeshPhysicalMaterial({
    color: 0x16181b,
    roughness: 0.32,
    metalness: 0.22,
    clearcoat: 0.4,
    clearcoatRoughness: 0.22
  });
  const slotMat = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.5,
    metalness: 0.35
  });
  const clampMat = new THREE.MeshStandardMaterial({
    color: 0xd0d4da,
    metalness: 0.85,
    roughness: 0.22
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa7c9c5,
    roughness: 0.15,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    reflectivity: 0.55,
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  });
  const glassEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x5c8984, roughness: 0.26, transparent: true, opacity: 0.76, depthWrite: false,
  });
  const readerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f1215,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  });

  // Cabinet layout: centers at x = +/-0.48m, width = 0.24m, height = 1.04m, depth = 1.32m
  const plinthGeo = new RoundedBoxGeometry(0.21, 0.068, 1.24, 3, 0.014);
  const outerShellGeo = new RoundedBoxGeometry(0.224, 0.935, 1.32, 5, 0.022);
  const foreInnerCladGeo = new RoundedBoxGeometry(0.018, 0.925, 0.625, 3, 0.008);
  const aftInnerCladGeo = new RoundedBoxGeometry(0.018, 0.925, 0.505, 3, 0.008);
  const slotBackGeo = new THREE.BoxGeometry(0.008, 0.78, 0.21);
  const topDeckGeo = new RoundedBoxGeometry(0.242, 0.052, 1.322, 4, 0.016);
  const stripGeo = new RoundedBoxGeometry(0.010, 0.015, 1.06, 2, 0.004);
  const endLedGeo = new RoundedBoxGeometry(0.072, 0.012, 0.010, 2, 0.004);

  const aisleStrips = [];
  const endLeds = [];

  for (const side of [-1, 1]) {
    const cx = side * 0.48;

    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(cx, 0.034, 0);

    // Main brushed stainless body shifted 8mm outward so inner aisle cladding leaves a genuine recessed hinge slot
    const body = new THREE.Mesh(outerShellGeo, steelMat);
    body.position.set(side * 0.488, 0.528, 0);

    // Inner-aisle brushed stainless panels fore (z in [+0.035, +0.66]) and aft (z in [-0.66, -0.155])
    // keeping inner face cleanly at x = +/-0.360m (0.72m clear aisle)
    const foreClad = new THREE.Mesh(foreInnerCladGeo, steelMat);
    foreClad.position.set(side * 0.369, 0.528, 0.345);

    const aftClad = new THREE.Mesh(aftInnerCladGeo, steelMat);
    aftClad.position.set(side * 0.369, 0.528, -0.405);

    // Recessed slot pocket at z in [-0.155, +0.035] behind hinge pivot at x = +/-0.355m
    const slotBack = new THREE.Mesh(slotBackGeo, slotMat);
    slotBack.position.set(side * 0.374, 0.60, -0.06);

    // Satin black chamfered upper deck plate
    const deck = new THREE.Mesh(topDeckGeo, topDeckMat);
    deck.position.set(cx, 1.014, 0);

    // Inner-aisle directional LED strip
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xb98d4c, toneMapped: false });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(side * 0.364, 0.978, 0);
    aisleStrips.push(stripMat);

    // Entry-facing corner status LED bar
    const ledMat = new THREE.MeshBasicMaterial({ color: COLORS.AMBER, toneMapped: false });
    const endLed = new THREE.Mesh(endLedGeo, ledMat);
    endLed.position.set(cx, 0.985, 0.659);
    endLeds.push(ledMat);

    const footShadow = makeContactShadow(THREE, 0.54, 1.66, 0.30);
    footShadow.position.set(cx, 0.002, 0);

    group.add(plinth, body, foreClad, aftClad, slotBack, deck, strip, endLed, footShadow);
  }

  addFareLineRailings(THREE, group);

  // Right cabinet angled contactless reader module
  const readerAnchor = new THREE.Vector3(0.48, 1.06, 0.42);
  const readerNormal = new THREE.Vector3(0, 0.94, 0.34).normalize();
  const readerGroup = new THREE.Group();
  readerGroup.position.copy(readerAnchor);
  readerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), readerNormal);

  const readerBezel = new THREE.Mesh(new RoundedBoxGeometry(0.184, 0.032, 0.214, 3, 0.008), plinthMat);
  readerBezel.position.set(0, -0.017, 0);

  const readerGlass = new THREE.Mesh(new RoundedBoxGeometry(0.168, 0.008, 0.198, 3, 0.004), readerGlassMat);
  readerGlass.position.set(0, -0.004, 0);

  const nfcIconPainted = paintCanvas(THREE, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    drawContactlessIcon(ctx, w / 2, h / 2, w * 0.62, 15);
  });
  dynamicTextures.push(nfcIconPainted.texture);
  const readerIconMat = new THREE.MeshBasicMaterial({
    map: nfcIconPainted.texture,
    transparent: true,
    color: 0xd0ccc2,
    depthWrite: false,
    toneMapped: false
  });
  const readerIcon = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.105), readerIconMat);
  readerIcon.rotation.x = -Math.PI / 2;
  readerIcon.position.set(0, 0.0008, 0);

  // Subtle illuminated ring perimeter on reader glass
  const ringHaloMat = new THREE.MeshBasicMaterial({
    color: COLORS.AMBER,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    toneMapped: false
  });
  const ringHalo = new THREE.Mesh(new THREE.RingGeometry(0.068, 0.075, 48), ringHaloMat);
  ringHalo.rotation.x = -Math.PI / 2;
  ringHalo.position.set(0, 0.001, 0);

  const ripples = createRipples(THREE, {
    count: 3,
    inner: 0.88,
    color: COLORS.COPPER,
    accentColor: COLORS.GREEN_BRIGHT
  });
  ripples.group.rotation.x = -Math.PI / 2;
  ripples.group.position.set(0, 0.0025, 0);

  readerGroup.add(readerBezel, readerGlass, readerIcon, ringHalo, ripples.group);
  group.add(readerGroup);

  // Entry-facing vertical front status display on right cabinet (z ~ 0.665, y ~ 0.78)
  const frontDisplayBezel = new THREE.Mesh(new RoundedBoxGeometry(0.158, 0.168, 0.014, 3, 0.012), plinthMat);
  frontDisplayBezel.position.set(0.48, 0.78, 0.661);

  const displayCanvas = paintCanvas(THREE, 512, 512, () => {});
  const displayCtx = displayCanvas.ctx ?? displayCanvas.c;
  dynamicTextures.push(displayCanvas.texture);
  const frontDisplayMat = new THREE.MeshBasicMaterial({
    map: displayCanvas.texture,
    toneMapped: false
  });
  const frontDisplayScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.136, 0.146), frontDisplayMat);
  frontDisplayScreen.position.set(0.48, 0.78, 0.669);

  const frontDisplayGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.144, 0.154),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.05,
      clearcoat: 1.0,
      depthWrite: false
    })
  );
  frontDisplayGlass.position.set(0.48, 0.78, 0.6705);
  group.add(frontDisplayBezel, frontDisplayScreen, frontDisplayGlass);

  let lastDisplayKey = '';
  function updateFrontDisplay(readProg, auth, passageClear) {
    const rq = Math.round(clamp01(readProg) * 16);
    const aq = Math.round(clamp01(auth) * 32);
    const key = `${rq}:${aq}:${passageClear}`;
    if (key === lastDisplayKey) return;
    lastDisplayKey = key;

    const w = displayCanvas.canvas.width;
    const h = displayCanvas.canvas.height;
    const a = aq / 32;
    const r = rq / 16;

    displayCtx.fillStyle = '#111417';
    displayCtx.fillRect(0, 0, w, h);

    // Subtle recessed header bar & standby/active status pill
    displayCtx.fillStyle = '#1b2025';
    displayCtx.fillRect(28, 28, w - 56, 68);

    // Top-right standby/ready indicator dot
    displayCtx.beginPath();
    displayCtx.arc(w - 64, 62, 12, 0, Math.PI * 2);
    if (a > 0.25) {
      displayCtx.fillStyle = '#22b46a';
    } else if (r > 0.08) {
      displayCtx.fillStyle = '#ffb347';
    } else {
      displayCtx.fillStyle = '#d6453a';
    }
    displayCtx.fill();

    displayCtx.textAlign = 'left';
    displayCtx.fillStyle = a > 0.5 ? '#7fe6ad' : '#9ca3aa';
    displayCtx.font = '600 24px "Inter Tight", Arial, sans-serif';
    displayCtx.fillText(a > 0.5 ? 'AUTHORIZED' : 'STANDBY', 50, 70);

    // Idle NFC symbol fading out as authorized rises
    if (a < 0.99) {
      displayCtx.save();
      displayCtx.globalAlpha = 1 - a;
      displayCtx.strokeStyle = r > 0.08 ? '#ffb347' : '#d2cec4';
      drawContactlessIcon(displayCtx, w / 2, 260, 170, 13);
      displayCtx.fillStyle = 'rgba(235, 232, 224, 0.72)';
      displayCtx.font = '600 28px "Inter Tight", Arial, sans-serif';
      displayCtx.textAlign = 'center';
      displayCtx.fillText('TAP CARD', w / 2, 428);
      displayCtx.restore();
    }

    // Authorized green badge + checkmark + directional arrow
    if (a > 0.01) {
      displayCtx.save();
      displayCtx.globalAlpha = a;
      const scale = 0.86 + 0.14 * a;
      displayCtx.fillStyle = '#22b46a';
      displayCtx.beginPath();
      displayCtx.arc(w / 2, 245, 92 * scale, 0, Math.PI * 2);
      displayCtx.fill();

      displayCtx.strokeStyle = '#ffffff';
      if (passageClear) {
        displayCtx.save();
        displayCtx.translate(w / 2, 245);
        displayCtx.rotate(-Math.PI / 2);
        drawArrowRight(displayCtx, 0, 0, 111 * scale, 15);
        displayCtx.restore();
      } else {
        drawCheckmark(displayCtx, w / 2, 245, 103 * scale, 14);
      }

      displayCtx.fillStyle = '#e7f8ef';
      displayCtx.font = '700 30px "Inter Tight", Arial, sans-serif';
      displayCtx.textAlign = 'center';
      displayCtx.fillText(passageClear ? 'ENTER' : 'OPENING', w / 2, 428);
      displayCtx.restore();
    }

    displayCanvas.texture.needsUpdate = true;
  }

  // Architectural glass barriers (0.014m thick) mounted in brushed-steel hinge clamps at x = +/-0.355m, z = -0.05m
  // Reach: 0.345m (+ 0.0025m bevel = 0.3475m -> 15mm center gap when closed)
  function createBarrierGeometry(dir) {
    const shape = new THREE.Shape();
    const xStart = dir * 0.005;
    const xEnd = dir * 0.345;
    const Hh = 0.68; // y = 0.26..0.94
    const R = 0.039;
    if (dir > 0) {
      shape.moveTo(xStart, 0);
      shape.lineTo(xEnd - R, 0);
      shape.quadraticCurveTo(xEnd, 0, xEnd, R);
      shape.lineTo(xEnd, Hh - R);
      shape.quadraticCurveTo(xEnd, Hh, xEnd - R, Hh);
      shape.lineTo(xStart, Hh);
      shape.closePath();
    } else {
      shape.moveTo(xStart, 0);
      shape.lineTo(xStart, Hh);
      shape.lineTo(xEnd + R, Hh);
      shape.quadraticCurveTo(xEnd, Hh, xEnd, Hh - R);
      shape.lineTo(xEnd, R);
      shape.quadraticCurveTo(xEnd, 0, xEnd + R, 0);
      shape.closePath();
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.009,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.0025,
      bevelSegments: 4,
      curveSegments: 24
    });
    // Center thickness (0.009 + 2 * 0.0025 = 0.014m) symmetrically on z = 0
    geo.translate(0, 0, -0.0045);
    return geo;
  }

  const leftBarrierGeo = createBarrierGeometry(1);
  const rightBarrierGeo = createBarrierGeometry(-1);
  const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.72, 20);
  const clampGeo = new RoundedBoxGeometry(0.063, 0.064, 0.043, 3, 0.007);
  const collarGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.029, 24);
  const bumperGeo = new RoundedBoxGeometry(0.011, 0.58, 0.016, 2, 0.005);
  const markingGeo = new THREE.CircleGeometry(0.008, 16);
  const markingMat = new THREE.MeshBasicMaterial({
    color: 0xf2f5ef, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  });

  function createHingedBarrier(side, geo) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.355, 0.26, -0.05);

    const shaft = new THREE.Mesh(shaftGeo, clampMat);
    shaft.position.set(0, 0.34, 0);

    const clampLow = new THREE.Mesh(clampGeo, clampMat);
    clampLow.position.set(-side * 0.020, 0.13, 0);

    const clampHigh = new THREE.Mesh(clampGeo, clampMat);
    clampHigh.position.set(-side * 0.020, 0.55, 0);

    const barrier = new THREE.Mesh(geo, [glassMat, glassEdgeMat]);
    barrier.renderOrder = 2;

    const bumper = new THREE.Mesh(bumperGeo, slotMat);
    bumper.position.set(-side * 0.341, 0.34, 0);
    hinge.add(shaft, clampLow, clampHigh, barrier, bumper);
    for (let i = 0; i < 6; i++) {
      const marking = new THREE.Mesh(markingGeo, markingMat);
      marking.position.set(-side * (0.089 + i * 0.041), 0.449, 0.008);
      marking.renderOrder = 3;
      hinge.add(marking);
    }
    for (const y of [0.26, 0.945]) {
      const collar = new THREE.Mesh(collarGeo, clampMat);
      collar.position.set(side * 0.355, y, -0.05);
      group.add(collar);
    }
    group.add(hinge);
    return hinge;
  }

  const leftHinge = createHingedBarrier(-1, leftBarrierGeo);
  const rightHinge = createHingedBarrier(1, rightBarrierGeo);

  // Register all gate materials for clean Morph opacity control, excluding ripple rings (controlled by ripples.update)
  tracker.trackTree(group, new Set([ripples.group]));

  const standbyStripColor = new THREE.Color(0x6b675f);
  const readAmberColor = new THREE.Color(COLORS.AMBER);
  const greenColor = new THREE.Color(COLORS.GREEN);
  const greenBrightColor = new THREE.Color(COLORS.GREEN_BRIGHT);
  const iconIdleColor = new THREE.Color(0xc8c4ba);
  const ledIdleColor = new THREE.Color(COLORS.RED);

  let lastOpacity = -1;

  function setState({
    readProgress = 0,
    authorized = 0,
    pulse = 0,
    barrierOpen = 0,
    passageClear = false,
    opacity = 1
  } = {}) {
    const rp = clamp01(readProgress);
    const auth = clamp01(authorized);
    const pl = clamp01(pulse);
    const bo = clamp01(barrierOpen);
    const op = clamp01(opacity);

    group.visible = op > 0.002;
    if (Math.abs(op - lastOpacity) > 1e-4) {
      tracker.apply(op);
      lastOpacity = op;
    }
    if (!group.visible) return;

    // Hinge swing toward -Z exit: left +Y, right -Y (~88 deg = 1.535 rad)
    leftHinge.rotation.y = +bo * 1.535;
    rightHinge.rotation.y = -bo * 1.535;

    // Reader ring & NFC icon colors: standby -> amber reading -> emerald green
    const readMix = clamp01(rp * (1 - auth));
    ringHaloMat.color.copy(standbyStripColor).lerp(readAmberColor, readMix).lerp(greenBrightColor, auth);
    ringHaloMat.opacity = (0.32 + 0.45 * rp + 0.58 * auth) * op;
    readerIconMat.color.copy(iconIdleColor).lerp(readAmberColor, readMix * 0.65).lerp(greenBrightColor, auth);

    // Keep the aisle signal amber while the leaves are crossing the passage.
    const busy = Math.max(auth, readMix);
    const clear = Number(passageClear);
    for (const strip of aisleStrips) strip.color.copy(standbyStripColor).lerp(readAmberColor, busy * 0.7).lerp(greenColor, clear);
    for (const led of endLeds) led.color.copy(ledIdleColor).lerp(readAmberColor, busy).lerp(greenBrightColor, clear);

    ripples.update(pl, 0.055, 0.155, 0.52 * op, auth);
    updateFrontDisplay(rp, auth, passageClear);
  }

  setState({ readProgress: 0, authorized: 0, pulse: 0, barrierOpen: 0, opacity: 1 });

  return {
    group,
    readerAnchor,
    readerNormal,
    setState,
    dynamicTextures
  };
}

/**
 * Builds the minimalist concourse platform deck (terminating cleanly at z = -4.0)
 * and the elevated viaduct railway track bed at z = -13.5, rail top y = -0.65m.
 */
function buildRailway(THREE) {
  const group = new THREE.Group();
  const tracker = createOpacityTracker();
  const dynamicTextures = [];

  const deckTex = createStoneDeckTexture(THREE);
  const ballastTex = createBallastTexture(THREE);
  const concourseAlpha = createConcourseAlphaMap(THREE);
  const stripAlpha = createStripFeatherAlphaMap(THREE, 5.2, false);
  const fasciaAlpha = createStripFeatherAlphaMap(THREE, 5.2, true);
  dynamicTextures.push(deckTex, ballastTex, concourseAlpha, stripAlpha, fasciaAlpha);

  // 1. Concourse platform deck: x in [-14, +14], z in [-4.0, +3.6], y in [-0.45, 0]
  const concourseGroup = new THREE.Group();

  const coreSlabMat = new THREE.MeshStandardMaterial({
    color: 0xe6e1d7,
    roughness: 0.88,
    metalness: 0.02
  });
  const topSurfaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: deckTex,
    alphaMap: concourseAlpha,
    transparent: true,
    depthWrite: false,
    roughness: 0.86,
    metalness: 0.02
  });
  const concreteEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xe2ddd3,
    roughness: 0.84,
    metalness: 0.04
  });
  const revealGrooveMat = new THREE.MeshStandardMaterial({
    color: 0xb6b0a6,
    roughness: 0.72,
    metalness: 0.08
  });
  const safetyMetalMat = new THREE.MeshStandardMaterial({
    color: 0xc7cbd0,
    roughness: 0.34,
    metalness: 0.72
  });

  // Solid center under-slab (x in [-5.2, +5.2], z in [-4.0, +0.6], y in [-0.45, -0.002]) for true platform occlusion
  const coreSlab = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.448, 4.6), coreSlabMat);
  coreSlab.position.set(0, -0.226, -1.7);
  concourseGroup.add(coreSlab);

  // Single continuous seamless concourse top surface (x in [-14, +14], z in [-4.0, +3.6]) feathered on perimeter
  const concourseTop = new THREE.Mesh(new THREE.PlaneGeometry(28.0, 7.6), topSurfaceMat);
  concourseTop.rotation.x = -Math.PI / 2;
  concourseTop.position.set(0, 0.0005, -0.2);
  concourseTop.renderOrder = -2;
  concourseGroup.add(concourseTop);

  // Architectural edge coping & shadow reveal along z = -4.0 (solid in center, feathered across outer flanks)
  const edgeFascia = new THREE.Mesh(
    new THREE.PlaneGeometry(28.0, 0.042),
    new THREE.MeshStandardMaterial({
      color: 0xc7cbd0,
      roughness: 0.34,
      metalness: 0.72,
      alphaMap: fasciaAlpha,
      transparent: true,
      depthWrite: false
    })
  );
  edgeFascia.rotation.y = Math.PI;
  edgeFascia.position.set(0, -0.02, -4.005);
  edgeFascia.renderOrder = -1;

  const edgeGroove = new THREE.Mesh(
    new THREE.PlaneGeometry(28.0, 0.018),
    new THREE.MeshStandardMaterial({
      color: 0xb6b0a6,
      roughness: 0.72,
      metalness: 0.08,
      alphaMap: fasciaAlpha,
      transparent: true,
      depthWrite: false
    })
  );
  edgeGroove.rotation.y = Math.PI;
  edgeGroove.position.set(0, -0.049, -4.004);
  edgeGroove.renderOrder = -1;

  const outerSlabSkirt = new THREE.Mesh(
    new THREE.PlaneGeometry(28.0, 0.44),
    new THREE.MeshStandardMaterial({
      color: 0xe2ddd3,
      roughness: 0.86,
      metalness: 0.03,
      alphaMap: fasciaAlpha,
      transparent: true,
      depthWrite: false
    })
  );
  outerSlabSkirt.rotation.y = Math.PI;
  outerSlabSkirt.position.set(0, -0.225, -4.002);
  outerSlabSkirt.renderOrder = -2;

  // Brushed-metal safety tactile strip along z = -3.9 across full width with feathered X wings
  const safetyStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(28.0, 0.10),
    new THREE.MeshStandardMaterial({
      color: 0xc7cbd0,
      roughness: 0.34,
      metalness: 0.72,
      alphaMap: stripAlpha,
      transparent: true,
      depthWrite: false
    })
  );
  safetyStrip.rotation.x = -Math.PI / 2;
  safetyStrip.position.set(0, 0.002, -3.9);
  safetyStrip.renderOrder = -1;

  concourseGroup.add(edgeFascia, edgeGroove, outerSlabSkirt, safetyStrip);
  group.add(concourseGroup);

  // 2. Elevated rail bed and boarding platform.
  const CORE_MIN = -67;
  const CORE_MAX = 64;
  const CORE_LEN = CORE_MAX - CORE_MIN;
  const CORE_CX = (CORE_MIN + CORE_MAX) * 0.5;

  const viaductGroup = new THREE.Group();
  viaductGroup.position.set(0, 0, TRACK_Z);

  // Sculpted concrete box-girder viaduct slab (y in [-1.65, -1.10])
  const girderShape = new THREE.Shape();
  girderShape.moveTo(-2.15, -1.10);
  girderShape.lineTo(2.15, -1.10);
  girderShape.lineTo(2.15, -1.24);
  girderShape.lineTo(1.35, -1.65);
  girderShape.lineTo(-1.35, -1.65);
  girderShape.lineTo(-2.15, -1.24);
  girderShape.closePath();

  function makeExtrudedX(shape, startX, len) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(startX, 0, 0);
    return geo;
  }

  const girderMesh = new THREE.Mesh(makeExtrudedX(girderShape, CORE_MIN, CORE_LEN), concreteEdgeMat);
  viaductGroup.add(girderMesh);

  // The low boarding edge meets the train's floor with a visible gap between them.
  const platform = new THREE.Mesh(new RoundedBoxGeometry(59, 0.22, 0.98, 2, 0.035), coreSlabMat);
  platform.position.set(0, 0.16, 2.03);
  const platformFascia = new THREE.Mesh(new THREE.BoxGeometry(59, 0.71, 0.43), concreteEdgeMat);
  platformFascia.position.set(0, -0.38, 1.83);
  const tactileLine = new THREE.Mesh(new THREE.BoxGeometry(59, 0.008, 0.16), revealGrooveMat);
  tactileLine.position.set(0, 0.274, 1.88);
  viaductGroup.add(platform, platformFascia, tactileLine);
  const pierGeo = new RoundedBoxGeometry(0.66, 4.94, 1.14, 2, 0.035);
  for (const x of [-23, -9, 10, 24]) {
    const pier = new THREE.Mesh(pierGeo, concreteEdgeMat);
    pier.position.set(x, -4.04, 0.18);
    viaductGroup.add(pier);
  }

  // Minimal sleek edge curbs along z_local = +/-2.04m (world z = -15.54, -11.46)
  const curbGeo = new RoundedBoxGeometry(CORE_LEN, 0.34, 0.22, 2, 0.03);
  const curbInst = new THREE.InstancedMesh(curbGeo, concreteEdgeMat, 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 2; i++) {
    dummy.position.set(CORE_CX, -0.94, i === 0 ? -2.04 : 2.04);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    curbInst.setMatrixAt(i, dummy.matrix);
  }
  curbInst.instanceMatrix.needsUpdate = true;
  curbInst.computeBoundingSphere();
  viaductGroup.add(curbInst);

  // Trapezoidal stone/concrete ballast bed (world z in [-15.2, -11.8], i.e. local z in [-1.7, +1.7])
  const ballastShape = new THREE.Shape();
  ballastShape.moveTo(-1.70, -1.10);
  ballastShape.lineTo(1.70, -1.10);
  ballastShape.lineTo(1.35, -0.88);
  ballastShape.lineTo(-1.35, -0.88);
  ballastShape.closePath();
  const ballastMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ballastTex,
    roughness: 0.94,
    metalness: 0.02
  });
  const ballastMesh = new THREE.Mesh(makeExtrudedX(ballastShape, CORE_MIN, CORE_LEN), ballastMat);
  viaductGroup.add(ballastMesh);

  // Evenly spaced concrete sleepers (InstancedMesh for ultra-low draw call)
  const SLEEPER_STEP = 0.65;
  const sleeperCount = Math.floor((CORE_LEN - 1.0) / SLEEPER_STEP) + 1;
  const sleeperGeo = new RoundedBoxGeometry(0.24, 0.17, 2.46, 2, 0.02);
  const sleeperMat = new THREE.MeshStandardMaterial({
    color: 0xc2bdb4,
    roughness: 0.88,
    metalness: 0.04
  });
  const sleeperInst = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);

  // Steel rail fastening clips/baseplates (InstancedMesh)
  const clipGeo = new THREE.BoxGeometry(0.18, 0.022, 0.22);
  const clipMat = new THREE.MeshStandardMaterial({
    color: 0x3b3e42,
    roughness: 0.45,
    metalness: 0.7
  });
  const clipInst = new THREE.InstancedMesh(clipGeo, clipMat, sleeperCount * 2);

  let clipIdx = 0;
  for (let i = 0; i < sleeperCount; i++) {
    const sx = CORE_MIN + 0.5 + i * SLEEPER_STEP;
    dummy.position.set(sx, RAIL_TOP_Y - 0.15 - 0.085, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    sleeperInst.setMatrixAt(i, dummy.matrix);

    for (const side of [-1, 1]) {
      dummy.position.set(sx, RAIL_TOP_Y - 0.15 + 0.008, side * HALF_GAUGE);
      dummy.updateMatrix();
      clipInst.setMatrixAt(clipIdx++, dummy.matrix);
    }
  }
  sleeperInst.instanceMatrix.needsUpdate = true;
  clipInst.instanceMatrix.needsUpdate = true;
  sleeperInst.computeBoundingSphere();
  clipInst.computeBoundingSphere();
  viaductGroup.add(sleeperInst, clipInst);

  // Dual realistic I-profile steel rails (height 0.15m: foot y = -0.80m, head top y = -0.65m exact)
  const railProfile = new THREE.Shape();
  railProfile.moveTo(-0.065, -0.150);
  railProfile.lineTo(0.065, -0.150);
  railProfile.lineTo(0.065, -0.132);
  railProfile.lineTo(0.014, -0.118);
  railProfile.lineTo(0.012, -0.042);
  railProfile.lineTo(0.034, -0.032);
  railProfile.lineTo(0.034, -0.005);
  railProfile.quadraticCurveTo(0.034, 0, 0.026, 0);
  railProfile.lineTo(-0.026, 0);
  railProfile.quadraticCurveTo(-0.034, 0, -0.034, -0.005);
  railProfile.lineTo(-0.034, -0.032);
  railProfile.lineTo(-0.012, -0.042);
  railProfile.lineTo(-0.014, -0.118);
  railProfile.lineTo(-0.065, -0.132);
  railProfile.closePath();

  const railGeo = new THREE.ExtrudeGeometry(railProfile, {
    depth: CORE_LEN,
    bevelEnabled: false,
    curveSegments: 6
  });
  railGeo.rotateY(Math.PI / 2);
  railGeo.translate(CORE_MIN, RAIL_TOP_Y, 0);

  const railMat = new THREE.MeshStandardMaterial({
    color: 0x5c6168,
    metalness: 0.86,
    roughness: 0.30
  });
  const railInst = new THREE.InstancedMesh(railGeo, railMat, 2);
  for (let i = 0; i < 2; i++) {
    dummy.position.set(0, 0, i === 0 ? -HALF_GAUGE : HALF_GAUGE);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    railInst.setMatrixAt(i, dummy.matrix);
  }
  railInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();

  // Polished steel running-top sheen along rail crown
  const crownGeo = new THREE.BoxGeometry(CORE_LEN, 0.003, 0.052);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xcbd0d6,
    metalness: 0.94,
    roughness: 0.16
  });
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, 2);
  for (let i = 0; i < 2; i++) {
    dummy.position.set(CORE_CX, RAIL_TOP_Y - 0.0005, i === 0 ? -HALF_GAUGE : HALF_GAUGE);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);
  }
  crownInst.instanceMatrix.needsUpdate = true;
  crownInst.computeBoundingSphere();
  viaductGroup.add(railInst, crownInst);

  // Smoothly alpha-feathered outer viaduct extension wings ([-36, -20] and [+36, +52])
  const END_SEG_LEN = 4.0;
  const endAlphas = [0.76, 0.50, 0.25, 0.08];
  const segGirderGeo = makeExtrudedX(girderShape, 0, END_SEG_LEN);
  const segBallastGeo = makeExtrudedX(ballastShape, 0, END_SEG_LEN);
  const segCurbGeo = new RoundedBoxGeometry(END_SEG_LEN, 0.34, 0.22, 2, 0.03);
  const segRailGeo = new THREE.ExtrudeGeometry(railProfile, { depth: END_SEG_LEN, bevelEnabled: false, curveSegments: 6 });
  segRailGeo.rotateY(Math.PI / 2);
  segRailGeo.translate(0, RAIL_TOP_Y, 0);

  endAlphas.forEach((alphaVal, idx) => {
    const gMat = new THREE.MeshStandardMaterial({
      color: 0xe2ddd3,
      roughness: 0.84,
      metalness: 0.04,
      transparent: true,
      opacity: alphaVal,
      depthWrite: false
    });
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x9c9891,
      roughness: 0.94,
      metalness: 0.02,
      transparent: true,
      opacity: alphaVal,
      depthWrite: false
    });
    const rMat = new THREE.MeshStandardMaterial({
      color: 0x686d74,
      metalness: 0.84,
      roughness: 0.30,
      transparent: true,
      opacity: alphaVal,
      depthWrite: false
    });

    const leftStart = CORE_MIN - (idx + 1) * END_SEG_LEN;
    const rightStart = CORE_MAX + idx * END_SEG_LEN;
    for (const segStart of [leftStart, rightStart]) {
      const segG = new THREE.Mesh(segGirderGeo, gMat);
      segG.position.x = segStart;
      const segB = new THREE.Mesh(segBallastGeo, bMat);
      segB.position.x = segStart;
      viaductGroup.add(segG, segB);

      for (const side of [-1, 1]) {
        const segC = new THREE.Mesh(segCurbGeo, gMat);
        segC.position.set(segStart + END_SEG_LEN * 0.5, -0.94, side * 2.04);
        const segR = new THREE.Mesh(segRailGeo, rMat);
        segR.position.set(segStart, 0, side * HALF_GAUGE);
        viaductGroup.add(segC, segR);
      }
    }
  });

  group.add(viaductGroup);

  tracker.trackTree(group);
  let lastOpacity = -1;

  function setOpacity(a) {
    const op = clamp01(a);
    group.visible = op > 0.002;
    if (Math.abs(op - lastOpacity) > 1e-4) {
      tracker.apply(op);
      lastOpacity = op;
    }
  }

  return {
    group,
    deckHeight: 0,
    trackZ: TRACK_Z,
    setOpacity,
    dynamicTextures
  };
}

/**
 * Creates the fare collection gate, architectural concourse + elevated railway viaduct,
 * and three-car regional electric passenger train assets for the `#taps` sequence.
 */
export function createGateAndTrainAssets(THREE) {
  const metalTextures = createBrushedMetalTextures(THREE);
  const gateBuilt = buildGate(THREE, metalTextures);
  const railwayBuilt = buildRailway(THREE);
  const trainBuilt = buildTrain(THREE);

  function dispose() {
    const geos = new Set();
    const mats = new Set();
    const texs = new Set([metalTextures.map, metalTextures.bumpMap]);

    for (const tex of [...gateBuilt.dynamicTextures, ...railwayBuilt.dynamicTextures]) {
      if (tex) texs.add(tex);
    }

    const collectMaterial = mat => {
      if (!mat || mats.has(mat)) return;
      mats.add(mat);
      for (const key of ['map', 'bumpMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        if (mat[key]) texs.add(mat[key]);
      }
    };

    for (const root of [gateBuilt.group, railwayBuilt.group, trainBuilt.group]) {
      root.traverse(obj => {
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.geometry) geos.add(obj.geometry);
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(collectMaterial);
          else collectMaterial(obj.material);
        }
      });
    }

    geos.forEach(g => g.dispose());
    mats.forEach(m => m.dispose());
    texs.forEach(t => t.dispose());
  }

  return {
    gate: {
      group: gateBuilt.group,
      readerAnchor: gateBuilt.readerAnchor,
      readerNormal: gateBuilt.readerNormal,
      setState: gateBuilt.setState
    },
    railway: {
      group: railwayBuilt.group,
      deckHeight: railwayBuilt.deckHeight,
      trackZ: railwayBuilt.trackZ,
      setOpacity: railwayBuilt.setOpacity
    },
    train: {
      group: trainBuilt.group,
      wheelRadius: trainBuilt.wheelRadius,
      setState: trainBuilt.setState
    },
    dispose
  };
}
