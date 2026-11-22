// Motion curves for the card intro (js/intro/).

export const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const mix = (a, b, t) => a + (b - a) * t;

// 0 before `start`, 1 after `end`, an S-curve in between.
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// An underdamped spring from 0 to 1: a gentle overshoot that settles by p = 1.
export function springProgress(p) {
  if (p >= 1) return 1;
  const zeta = .45, omega = 9.5, wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * p) * (Math.cos(wd * p) + zeta * omega / wd * Math.sin(wd * p));
}
