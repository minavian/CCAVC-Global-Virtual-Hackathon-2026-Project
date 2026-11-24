/*
 * Shared math curves, color tokens, procedural canvas painters, contact shadow
 * factory, and NFC/RF ripple rings for the continuous #taps 3D sequence.
 */

export const COLORS = Object.freeze({
  PAPER: 0xf5f2ec,
  INK: 0x0d0d0c,
  COPPER: 0xd08040,
  GREEN: 0x22b46a,
  GREEN_BRIGHT: 0x38d07f,
  AMBER: 0xffb347,
  RED: 0xd6453a,
});

export function clamp01(v) {
  if (!(v > 0)) return 0;
  if (v >= 1) return 1;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function cue(t, a, b) {
  if (b === a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

export function smoothstep(p) {
  const t = clamp01(p);
  return t * t * (3 - 2 * t);
}

export function smootherstep(p) {
  const t = clamp01(p);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function inQuad(p) {
  const t = clamp01(p);
  return t * t;
}

export function outQuad(p) {
  const t = clamp01(p);
  return 1 - (1 - t) * (1 - t);
}

export function inCubic(p) {
  const t = clamp01(p);
  return t * t * t;
}

export function outCubic(p) {
  const t = clamp01(p);
  return 1 - (1 - t) ** 3;
}

export function inOutCubic(p) {
  const t = clamp01(p);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function outQuint(p) {
  const t = clamp01(p);
  return 1 - (1 - t) ** 5;
}

export function inOutQuint(p) {
  const t = clamp01(p);
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - ((-2 * t + 2) ** 5) / 2;
}

export function pulse(t, a, b) {
  const p = cue(t, a, b);
  return p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
}

/**
 * Create an offscreen 2D canvas, invoke `drawFn(ctx, width, height)`, and wrap it
 * as an sRGB Three.js CanvasTexture.
 */
export function paintCanvas(THREE, width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (drawFn) drawFn(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, canvas, ctx };
}

let cachedShadowCanvas = null;

function getShadowCanvas() {
  if (cachedShadowCanvas) return cachedShadowCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = 'rgba(28, 22, 14, 1)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetX = 1000;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(-1000 + 52, 52, 152, 152, 60);
  ctx.fill();
  cachedShadowCanvas = canvas;
  return canvas;
}

/**
 * Create a soft blurred contact shadow plane lying horizontally on XZ.
 */
export function makeContactShadow(THREE, width, depth, opacity = 0.32) {
  const texture = new THREE.CanvasTexture(getShadowCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(width, depth, 1);
  mesh.renderOrder = -1;
  mesh.userData.baseOpacity = opacity;
  return mesh;
}

/**
 * Create expanding concentric RF/NFC ripple rings driven purely by `progress01`.
 */
export function createRipples(THREE, opts = {}) {
  const {
    count = 3,
    inner = 0.9,
    color = COLORS.COPPER,
    accentColor = COLORS.GREEN_BRIGHT,
  } = opts;

  const baseColor = new THREE.Color(color);
  const targetColor = new THREE.Color(accentColor);
  const geometry = new THREE.RingGeometry(inner, 1, 96);
  const rings = [];
  const group = new THREE.Group();

  for (let k = 0; k < count; k++) {
    const material = new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    rings.push(mesh);
  }

  const span = count > 1 ? Math.max(0.38, 1 - (count - 1) * 0.16) : 1;

  return {
    group,
    update(progress01, fromRadius, toRadius, strength = 0.7, greenMix = 0) {
      const t = clamp01(progress01);
      const mixAmt = clamp01(greenMix);
      if (t <= 0 || t >= 1) {
        for (const ring of rings) {
          ring.visible = false;
          ring.material.opacity = 0;
        }
        return;
      }

      for (let k = 0; k < rings.length; k++) {
        const ring = rings[k];
        const start = count > 1 ? (k / (count - 1)) * (1 - span) : 0;
        const p = cue(t, start, start + span);
        const active = p > 0 && p < 1;
        ring.visible = active;
        if (!active) {
          ring.material.opacity = 0;
          continue;
        }
        const radius = lerp(fromRadius, toRadius, outCubic(p));
        ring.scale.setScalar(radius);
        ring.material.opacity = strength * Math.pow(1 - p, 1.55) * smoothstep(cue(p, 0, 0.14));
        ring.material.color.copy(baseColor).lerp(targetColor, mixAmt);
      }
    },
  };
}

/**
 * Draw the standard four-arc contactless/NFC icon centered at (cx, cy).
 */
export function drawContactlessIcon(ctx, cx, cy, size, lw = size * 0.08) {
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(cx - size * 0.42, cy, size * (0.2 + k * 0.16), -0.62, 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a crisp rounded checkmark centered at (cx, cy).
 */
export function drawCheckmark(ctx, cx, cy, size, lw = size * 0.11) {
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.12, cy + size * 0.3);
  ctx.lineTo(cx + size * 0.44, cy - size * 0.3);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a minimalist right-pointing directional arrow centered at (cx, cy).
 */
export function drawArrowRight(ctx, cx, cy, size, lw = size * 0.1) {
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.36, cy);
  ctx.lineTo(cx + size * 0.34, cy);
  ctx.moveTo(cx + size * 0.06, cy - size * 0.28);
  ctx.lineTo(cx + size * 0.36, cy);
  ctx.lineTo(cx + size * 0.06, cy + size * 0.28);
  ctx.stroke();
  ctx.restore();
}
