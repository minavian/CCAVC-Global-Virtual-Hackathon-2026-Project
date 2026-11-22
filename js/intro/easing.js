// Motion curves for the card intro (js/intro/). Everything here is smooth in speed as
// well as position: nothing starts, stops or turns with a jolt.

export const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const mix = (a, b, t) => a + (b - a) * t;

// 0 before `start`, 1 after `end`, an S-curve in between (smoothstep).
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// Like `ease`, but its acceleration is also zero at both ends (smootherstep), so a
// motion built from it fades in and out of speed with no kick.
export function smoother(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// A smooth curve through [x, y] points: a monotone cubic ("PCHIP", Fritsch and Butland).
// It passes through every point, never overshoots between them, is flat wherever two
// neighbours are equal (a hold), and its slope is continuous. So a pose built from it
// glides through each point instead of stopping there. Both ends start and stop at rest.
export function monotone(points) {
  const n = points.length;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const h = [], slope = [], tangent = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    slope[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) continue;   // a peak, a dip or a hold: flat here
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * tangent[lo] +
      (3 * t2 - 2 * t3) * ys[hi] + (t3 - t2) * h[lo] * tangent[hi];
  };
}

// A critically damped spring that chases a moving target: the fastest follow that never
// overshoots. Its speed carries over from frame to frame, so a scroll that starts or stops
// suddenly still starts and stops the motion softly. Exact for any frame time.
export function spring(value = 0) {
  return { value, velocity: 0 };
}

export function follow(state, target, omega, dt) {
  const away = state.value - target;
  const push = (state.velocity + omega * away) * dt;
  const decay = Math.exp(-omega * dt);
  state.velocity = (state.velocity - omega * push) * decay;
  state.value = target + (away + push) * decay;
  return state.value;
}

// From 0 to 1 like a soft spring: one small overshoot (about 4%), then it lands on
// exactly 1 with no speed left, so nothing snaps into place at the end.
export function settle(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const zeta = .72, omega = 10, wd = omega * Math.sqrt(1 - zeta * zeta);
  const swing = 1 - Math.exp(-zeta * omega * p) * (Math.cos(wd * p) + zeta * omega / wd * Math.sin(wd * p));
  return mix(swing, 1, smoother(.6, 1, p));
}
