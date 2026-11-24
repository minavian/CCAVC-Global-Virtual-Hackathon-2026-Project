/*
 * Pure deterministic 12-second choreography for the #taps 3D sequence.
 * Every object pose, camera spline state, caption, and badge is derived solely from
 * playhead time `t` in [0, TOTAL_DURATION] and asset anchors.
 */

import {
  clamp01,
  lerp,
  cue,
  smoothstep,
  outCubic,
  inOutCubic,
  pulse,
} from './easing.js';

export const TOTAL_DURATION = 12;
export const COUNTER_ORIGIN = Object.freeze({ x: 2.70, y: 0.88, z: 0.2 });

const CARD_SLIDE = 1.18;
const TURN_LEFT = 2.08;
const SCAN = 3.16;
const TRAIN_DOORS_CLOSE = 5.46;
const DEPART = 6.20;
const FOB_REVEAL = 8.90;
const CAR_DOOR_OPEN = 10.52;
const FINAL_FRAME = 11.55;

export const PHASE_MARKS = Object.freeze([
  { id: 'payment', label: 'Payment', time: 0 },
  { id: 'handoff', label: 'Card handoff', time: CARD_SLIDE },
  { id: 'turn', label: 'Turn left', time: TURN_LEFT },
  { id: 'gate', label: 'Gate', time: SCAN },
  { id: 'enter', label: 'Enter', time: 4.45 },
  { id: 'train', label: 'Doors close', time: TRAIN_DOORS_CLOSE },
  { id: 'depart', label: 'Departure', time: DEPART },
  { id: 'reveal', label: 'Reveal', time: 7.65 },
  { id: 'unlock', label: 'Unlock', time: 9.55 },
]);

const DEFAULT_ANCHORS = {
  terminalReaderAnchor: { x: 0, y: 0.277673, z: -0.088106 },
  terminalReaderNormal: { x: 0, y: 0.830497, z: 0.557023 },
  gateReaderAnchor: { x: 0.48, y: 1.06, z: 0.42 },
  gateReaderNormal: { x: 0, y: 0.94, z: 0.34 },
  wheelRadius: 0.42,
};

// ---------- Vector & Quaternion Math (Three.js-free for deterministic testing) ----------

function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function addScaled3(a, b, s) {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function lerp3(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 1 };
  const inv = 1 / len;
  return { x: v.x * inv, y: v.y * inv, z: v.z * inv };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function bezier3(p0, c1, c2, p3, u) {
  const k = clamp01(u);
  const m = 1 - k;
  const m2 = m * m;
  const k2 = k * k;
  const w0 = m2 * m;
  const w1 = 3 * m2 * k;
  const w2 = 3 * m * k2;
  const w3 = k2 * k;
  return {
    x: p0.x * w0 + c1.x * w1 + c2.x * w2 + p3.x * w3,
    y: p0.y * w0 + c1.y * w1 + c2.y * w2 + p3.y * w3,
    z: p0.z * w0 + c1.z * w1 + c2.z * w2 + p3.z * w3,
  };
}

function quatFromBasis(x, y, z) {
  const m00 = x.x, m01 = y.x, m02 = z.x;
  const m10 = x.y, m11 = y.y, m12 = z.y;
  const m20 = x.z, m21 = y.z, m22 = z.z;
  const trace = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return normalizeQuat({ x: qx, y: qy, z: qz, w: qw });
}

function normalizeQuat(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len < 1e-8) return { x: 0, y: 0, z: 0, w: 1 };
  const inv = 1 / len;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

function facingQuat(normal, upHint) {
  const z = normalize3(normal);
  let x = cross3(upHint, z);
  if (x.x * x.x + x.y * x.y + x.z * x.z < 1e-6) {
    const fallback = Math.abs(z.y) > 0.9 ? vec3(0, 0, -1) : vec3(0, 1, 0);
    x = cross3(fallback, z);
  }
  x = normalize3(x);
  const y = cross3(z, x);
  return quatFromBasis(x, y, z);
}

function quatFromAxisAngle(axis, angle) {
  const n = normalize3(axis);
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
}

function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function slerpQuat(qa, qb, u) {
  const t = clamp01(u);
  if (t <= 0) return qa;
  if (t >= 1) return qb;
  let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
  let cosHalf = qa.x * bx + qa.y * by + qa.z * bz + qa.w * bw;
  if (cosHalf < 0) {
    cosHalf = -cosHalf;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (cosHalf >= 0.9995) {
    return normalizeQuat({
      x: lerp(qa.x, bx, t),
      y: lerp(qa.y, by, t),
      z: lerp(qa.z, bz, t),
      w: lerp(qa.w, bw, t),
    });
  }
  const halfTheta = Math.acos(Math.min(1, cosHalf));
  const sinHalf = Math.sqrt(1 - cosHalf * cosHalf);
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalf;
  const ratioB = Math.sin(t * halfTheta) / sinHalf;
  return {
    x: qa.x * ratioA + bx * ratioB,
    y: qa.y * ratioA + by * ratioB,
    z: qa.z * ratioA + bz * ratioB,
    w: qa.w * ratioA + bw * ratioB,
  };
}

// ---------- C1 Monotone Cubic Hermite Spline (Fritsch-Butland PCHIP) ----------

function monotone(points) {
  const n = points.length;
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const h = new Array(n - 1);
  const slope = new Array(n - 1);
  const tangent = new Array(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    slope[i] = h[i] > 0 ? (ys[i + 1] - ys[i]) / h[i] : 0;
  }

  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }

  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = h[lo];
    if (span <= 0) return ys[lo];
    const u = (x - xs[lo]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * ys[lo] +
      (u3 - 2 * u2 + u) * span * tangent[lo] +
      (3 * u2 - 2 * u3) * ys[hi] +
      (u3 - u2) * span * tangent[hi]
    );
  };
}

function vec3Spline(rows) {
  const sx = monotone(rows.map(r => [r[0], r[1]]));
  const sy = monotone(rows.map(r => [r[0], r[2]]));
  const sz = monotone(rows.map(r => [r[0], r[3]]));
  return t => ({ x: sx(t), y: sy(t), z: sz(t) });
}

// The counter stays to the right of the gate. The camera yaws left first, then
// translates toward the scanner and follows the center of the open aisle.
const evalCamPos = vec3Spline([
  [0,     2.92, 1.52,  1.37],
  [0.95,  2.85, 1.43,  1.17],
  [1.85,  2.80, 1.48,  1.37],
  [TURN_LEFT, 2.80, 1.48, 1.39],
  [2.57,  2.15, 1.49,  1.75],
  [SCAN,  0.83, 1.46,  2.38],
  [3.85,  0.78, 1.44,  2.35],
  [4.45,  0.20, 1.26,  2.10],
  [4.63,  0,    1.20,  1.66],
  [5.04,  0,    1.18, -0.35],
  [5.38,  0,    1.23, -2.60],
  [5.72,  0.15, 1.44, -4.68],
  [6.75,  0.38, 1.51, -4.85],
  [7.65,  0.95, 1.53, -5.03],
  [8.20, -0.38, -0.80, -4.85],
  [8.65, -2.18, -3.65, -5.55],
  [9.10, -4.88, -4.90, -6.50],
  [10.18,-4.67, -4.84, -6.49],
  [10.56,-3.05, -4.38, -6.07],
  [FINAL_FRAME, -0.88, -4.32, -5.95],
]);

const evalCamTarget = vec3Spline([
  [0,    2.68, 1.04,  0.23],
  [1.12, 2.67, 1.05,  0.26],
  [1.85, 2.59, 1.05,  0.37],
  [TURN_LEFT, 2.55, 1.06, 0.38],
  [2.53, 0.18, 0.87,  0.20],
  [SCAN, 0.12, 0.84,  0.05],
  [3.85, 0.13, 0.84,  0.03],
  [4.63, 0,    0.96, -2.30],
  [5.38, 0,    0.95, -13.50],
  [DEPART, 0.20, 0.91, -13.50],
  [7.10, 1.30, 0.90, -13.50],
  [7.65, 1.35, 0.74, -13.45],
  [8.20, 1.32, -2.20, -13.30],
  [8.65, 1.19, -5.17, -13.20],
  [9.10, 1.12, -5.72, -13.20],
  [FINAL_FRAME, 1.15, -5.72, -13.20],
]);

const evalCamFov = monotone([
  [0, 33], [1.05, 33], [TURN_LEFT, 37], [2.68, 42], [3.44, 38], [5.28, 42],
  [5.85, 41], [7.65, 42], [8.20, 55], [8.59, 46], [9.10, 33], [FINAL_FRAME, 35],
]);

function cameraBasis(pos, target) {
  const forward = normalize3(sub3(target, pos));
  const right = normalize3(cross3(forward, vec3(0, 1, 0)));
  return { forward, right, up: cross3(right, forward) };
}

function resolveAnchors(anchors) {
  return {
    terminalReaderAnchor: anchors?.terminalReaderAnchor || DEFAULT_ANCHORS.terminalReaderAnchor,
    terminalReaderNormal: normalize3(anchors?.terminalReaderNormal || DEFAULT_ANCHORS.terminalReaderNormal),
    gateReaderAnchor: anchors?.gateReaderAnchor || DEFAULT_ANCHORS.gateReaderAnchor,
    gateReaderNormal: normalize3(anchors?.gateReaderNormal || DEFAULT_ANCHORS.gateReaderNormal),
    wheelRadius: anchors?.wheelRadius > 0 ? anchors.wheelRadius : DEFAULT_ANCHORS.wheelRadius,
  };
}

function evaluateCaptions(t) {
  let text;
  if (t < CARD_SLIDE) text = 'Tap to pay.';
  else if (t < TURN_LEFT) text = 'Collect your station card.';
  else if (t < 3.73) text = 'Tap your station card at the gate.';
  else if (t < TRAIN_DOORS_CLOSE) text = 'The gate opens.';
  else if (t < FOB_REVEAL) text = 'Doors close. The train departs.';
  else if (t < CAR_DOOR_OPEN) text = 'Press the key fob.';
  else if (t < FINAL_FRAME) text = 'Open the driver’s door.';
  else text = 'Wireless identification. Everyday convenience.';

  let badgeText = '';
  if (t >= 1.02 && t < TURN_LEFT) badgeText = 'Payment successful.';
  else if (t >= 3.73 && t < 4.85) badgeText = 'Access granted.';
  else if (t >= 9.96) badgeText = 'Vehicle unlocked.';
  return { text, badgeText, badgeState: badgeText ? 'success' : '' };
}

function evaluateBankCard(t, a) {
  const opacity = 1 - smoothstep(cue(t, 1.42, 1.72));
  const visible = opacity > 0.002;
  if (!visible) {
    return {
      pos: vec3(-0.56, 0.26, 0.44),
      quat: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1,
      opacity: 0,
      visible: false,
    };
  }

  const restPos = vec3(-0.18, 0.34, 0.22);
  const liftPos = vec3(-0.22, 0.37, 0.25);
  const exitPos = vec3(-0.56, 0.26, 0.44);
  const tapPos = addScaled3(a.terminalReaderAnchor, a.terminalReaderNormal, 0.011);

  const restQuat = facingQuat(vec3(0.24, 0.38, 0.89), vec3(-0.08, 1, 0));
  const tapQuat = quatMul(
    facingQuat(a.terminalReaderNormal, vec3(0, 1, 0)),
    quatFromAxisAngle(vec3(0, 0, 1), 0.12)
  );
  const exitQuat = facingQuat(vec3(0.10, 0.30, 0.95), vec3(-0.14, 1, 0));

  const arrive = inOutCubic(cue(t, 0.06, 0.60));
  const leave = inOutCubic(cue(t, 1.10, 1.42));
  const exit = inOutCubic(cue(t, 1.42, 1.73));

  let pos;
  let quat;
  if (t < 1.10) {
    const c1 = add3(lerp3(restPos, tapPos, 0.32), vec3(0, 0.055, 0.025));
    const c2 = addScaled3(tapPos, a.terminalReaderNormal, 0.075);
    pos = bezier3(restPos, c1, c2, tapPos, arrive);
    quat = slerpQuat(restQuat, tapQuat, smoothstep(cue(t, 0.06, 0.56)));
  } else if (t < 1.42) {
    const c1 = addScaled3(tapPos, a.terminalReaderNormal, 0.065);
    const c2 = add3(lerp3(tapPos, liftPos, 0.68), vec3(0, 0.045, 0.02));
    pos = bezier3(tapPos, c1, c2, liftPos, leave);
    quat = slerpQuat(tapQuat, restQuat, smoothstep(cue(t, 1.10, 1.42)));
  } else {
    pos = lerp3(liftPos, exitPos, exit);
    quat = slerpQuat(restQuat, exitQuat, exit);
  }

  // Gentle tactile press on read without intersecting the reader dome.
  const press = pulse(t, 0.60, 0.78);
  pos = addScaled3(pos, a.terminalReaderNormal, -0.0035 * press);

  // Living hover motion at rest that dampens cleanly as the card approaches the pad.
  const nearPad = arrive * (1 - leave);
  const hoverAmt = 1 - smoothstep(cue(nearPad, 0, 0.35));
  pos = add3(pos, vec3(0, Math.sin(t * 2.1) * 0.0035 * hoverAmt, Math.cos(t * 1.6) * 0.002 * hoverAmt));

  return { pos, quat, scale: 1, opacity, visible };
}

function evaluateStationCard(t, a, camPos, camTarget) {
  const origin = add3(COUNTER_ORIGIN, vec3(-0.26, 0.0018, -0.47));
  const flat = facingQuat(vec3(0, 1, 0), vec3(0, 0, -1));
  const pickup = add3(COUNTER_ORIGIN, vec3(-0.26, 0.0018, 0.36));
  const tapPos = addScaled3(a.gateReaderAnchor, a.gateReaderNormal, 0.018);
  const tapQuat = facingQuat(a.gateReaderNormal, vec3(0, 1, -0.25));
  const { forward, right, up } = cameraBasis(camPos, camTarget);
  const carry = addScaled3(addScaled3(addScaled3(camPos, forward, 0.61), right, -0.13), up, -0.16);
  const carryQuat = facingQuat(addScaled3(scale3(forward, -1), up, 0.40), up);

  let pos;
  let quat;
  if (t < TURN_LEFT) {
    const delivery = smoothstep(cue(t, CARD_SLIDE, 2.02));
    pos = lerp3(origin, pickup, delivery);
    quat = flat;
  } else if (t < SCAN) {
    const turn = smoothstep(cue(t, TURN_LEFT, 2.46));
    pos = lerp3(pickup, carry, turn);
    quat = slerpQuat(flat, carryQuat, turn);
  } else if (t < 3.83) {
    const aim = smoothstep(cue(t, SCAN, 3.46));
    const hover = addScaled3(tapPos, a.gateReaderNormal, 0.16);
    pos = lerp3(lerp3(carry, hover, aim), tapPos, smoothstep(cue(t, 3.46, 3.63)));
    quat = slerpQuat(carryQuat, tapQuat, aim);
  } else {
    const pocket = addScaled3(carry, up, -0.42);
    const lower = smoothstep(cue(t, 3.83, 4.43));
    pos = bezier3(tapPos, addScaled3(tapPos, a.gateReaderNormal, 0.21), carry, pocket, lower);
    quat = slerpQuat(tapQuat, carryQuat, lower);
  }

  return {
    pos, quat, scale: 1, opacity: 1, visible: t < 4.45,
    counterShadow: 1 - smoothstep(cue(t, TURN_LEFT, 2.29)),
  };
}

function evaluateTerminal(t) {
  return {
    pos: vec3(), scale: 1, opacity: 1, visible: t < 3.42,
    readProgress: smoothstep(cue(t, 0.62, 0.97)),
    success: smoothstep(cue(t, 0.89, 1.12)),
    pulse: cue(t, 0.65, 1.24),
    glow: smoothstep(cue(t, 0.62, 0.81)),
  };
}

function evaluateGate(t) {
  const barrierOpen = inOutCubic(cue(t, 3.79, 4.45));
  return {
    pos: vec3(), scale: 1, visible: t < 6.75, opacity: 1,
    readProgress: smoothstep(cue(t, 3.53, 3.74)),
    authorized: smoothstep(cue(t, 3.67, 3.79)),
    pulse: cue(t, 3.57, 4.05),
    barrierOpen,
    passageClear: barrierOpen >= 0.97,
  };
}

function evaluateRailway(t) {
  return { opacity: 1, visible: t < 9.10 };
}

function evaluateTrain(t, a) {
  // Integrate acceleration over playhead time. Velocity reaches 11.2m/s and
  // stays there during the downward shot; wheel rotation uses the same distance.
  const elapsed = Math.max(0, t - DEPART);
  const accelerating = Math.min(elapsed, 2);
  const xOffset = 2.8 * accelerating ** 2 + 11.2 * (elapsed - accelerating);
  return {
    xOffset,
    doorOpen: 1 - smoothstep(cue(t, TRAIN_DOORS_CLOSE, 6.18)),
    headlights: 1,
    wheelAngle: -xOffset / a.wheelRadius,
    visible: t < 9.10,
  };
}

function evaluateVehicle(t) {
  return {
    pos: vec3(1.18, -6.52, -13.35),
    lightFlash: Math.max(pulse(t, 9.90, 10.12), pulse(t, 10.19, 10.41)),
    doorOpen: inOutCubic(cue(t, CAR_DOOR_OPEN, FINAL_FRAME)),
    visible: t >= 7.69,
  };
}

function evaluateFob(t, camPos, camTarget) {
  const enter = outCubic(cue(t, FOB_REVEAL, 9.47));
  const lower = smoothstep(cue(t, 10.36, 10.89));
  const { forward, right, up } = cameraBasis(camPos, camTarget);
  const pos = addScaled3(addScaled3(addScaled3(camPos, forward, 0.60), right, lerp(-0.31, -0.12, enter)),
    up, lerp(-0.32, -0.093, enter) - lower * 0.30);
  const press = pulse(t, 9.55, 9.86);
  const quat = facingQuat(addScaled3(scale3(forward, -1), up, 0.36), up);
  return {
    pos, quat, press, scale: 0.89,
    rfPulse: cue(t, 9.76, 10.20),
    opacity: 1,
    visible: t >= FOB_REVEAL && t < 10.89,
  };
}

/**
 * Evaluate the entire 3D scene state at time `t` in [0, TOTAL_DURATION].
 */
export function evaluateTimeline(t, anchors) {
  const time = Number.isFinite(t) ? Math.max(0, Math.min(TOTAL_DURATION, t)) : 0;
  const resolved = resolveAnchors(anchors);

  const camPos = evalCamPos(time);
  const camTarget = evalCamTarget(time);
  const camFov = evalCamFov(time);

  return {
    time,
    camera: {
      pos: camPos,
      target: camTarget,
      fov: camFov,
    },
    captions: evaluateCaptions(time),
    terminal: evaluateTerminal(time),
    bankCard: evaluateBankCard(time, resolved),
    stationCard: evaluateStationCard(time, resolved, camPos, camTarget),
    gate: evaluateGate(time),
    railway: evaluateRailway(time),
    train: evaluateTrain(time, resolved),
    vehicle: evaluateVehicle(time),
    fob: evaluateFob(time, camPos, camTarget),
  };
}
