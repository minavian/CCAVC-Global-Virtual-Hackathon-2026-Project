const TAU = Math.PI * 2;
export const clamp = value => Math.max(0, Math.min(1, value));
export const mix = (a, b, t) => a + (b - a) * t;
export function ease(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// t = 0 is the tag, t = 1 is the reader. The same curve drives the strands,
// particles, camera and capsules, including the ripple from a missing packet.
export const replyFront = progress => ease(.18, .79, progress);

export const linkConditions = [
  { name: 'Aligned coils', gap: .48, tilt: .09, noise: .04 },
  { name: 'More distance', gap: 1.44, tilt: .09, noise: .04 },
  { name: 'Edge-on card', gap: .48, tilt: 1.43, noise: .04 },
  { name: 'Interference', gap: .48, tilt: .09, noise: .72 }
];

export function linkAt(progress, mode, amount = 1, from = linkConditions[0]) {
  const approach = ease(.035, .23, progress);
  const condition = linkConditions[mode];
  const gap = mix(from.gap, condition.gap, amount) + .88 * (1 - approach);
  const tilt = mix(from.tilt, condition.tilt, amount) + .40 * (1 - approach);
  const noise = mix(from.noise, condition.noise, amount);
  // A dimensionless near-field illustration. Gap and coil angle reduce mutual
  // coupling, and detection also needs a usable response above the noise.
  const strength = Math.abs(Math.cos(tilt)) / (1 + gap * gap) ** 1.5;
  return { gap, tilt, noise, strength, readable: strength > .26 && strength / (noise + .16) > 1.2 };
}

export function riverPoint(t, lane, out, field, depth = 0) {
  const { tag, reader, front, time, ripple, width } = field;
  if (t <= 0) return out.set(tag.x, tag.y, tag.z);
  if (t >= 1) return out.set(reader.x, reader.y, reader.z);
  const envelope = Math.sin(Math.PI * t);
  const open = ease(.01, .27, front - t) * ease(.01, .46, front);
  const interference = Math.sin(TAU * (t * 1.65 - time * .22) + lane * 1.8);
  const twist = t * TAU * .85 + .35;
  const cross = envelope * open * width;
  const age = time - ripple.time;
  const distance = t - ripple.at;
  const pulse = age >= 0 && age < 1.4
    ? ripple.strength * Math.exp(-Math.abs(Math.abs(distance) - age * .28) * 42 - age * 2) * Math.sin(distance * 66 - age * 16)
    : 0;

  return out.set(
    mix(tag.x, reader.x, t) + cross * .14 * (depth - lane * Math.sin(twist)),
    mix(tag.y, reader.y, t) - Math.sin(TAU * t) * field.bend
      + envelope * .012 * Math.sin(TAU * (t * 9 - time * .6))
      + cross * (lane * (.72 + .23 * Math.cos(twist)) + depth * .23 * Math.sin(twist)
        + .085 * interference + pulse),
    mix(tag.z, reader.z, t) + cross * (depth * .81 + lane * .44 * Math.sin(twist)
      + .36 * Math.sin(t * TAU - time * .35) + pulse * .24)
  );
}
