// CSS-equivalent cubic-bezier easing.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = t => ((ax * t + bx) * t + cx) * t;
  const y = t => ((ay * t + by) * t + cy) * t;
  return p => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1, t = p;
    for (let i = 0; i < 24; i++) {
      if (x(t) < p) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
}

// An underdamped spring from 0 to 1: a gentle overshoot that settles by p = 1.
export function springProgress(p) {
  if (p >= 1) return 1;
  const zeta = .45, omega = 9.5, wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * p) * (Math.cos(wd * p) + zeta * omega / wd * Math.sin(wd * p));
}

// Sample a cubic Hermite curve with a starting velocity and zero ending velocity.
// Duration must be positive and use the same units as elapsed.
export function sampleGlide(start, end, startVelocity, duration, elapsed) {
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const delta = end - start;
  const tangent = startVelocity * duration;
  const rest = 1 - progress;
  return {
    position: start + delta * progress ** 2 * (3 - 2 * progress) + tangent * progress * rest ** 2,
    velocity: (6 * delta * progress * rest + tangent * rest * (1 - 3 * progress)) / duration
  };
}
