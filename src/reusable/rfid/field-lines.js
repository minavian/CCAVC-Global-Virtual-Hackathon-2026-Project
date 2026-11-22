export function traceField(loopField, coils, seeds, limit) {
  const field = (rho, z) => {
    let hr = 0, hz = 0;
    for (const [a, current, z0] of coils) { const [r1, z1] = loopField(a, current, z0, rho, z); hr += r1; hz += z1; }
    return [hr, hz];
  };
  return seeds.map(start => {
    const pts = [start];
    let [rho, z] = start, crossed = 0;
    for (let n = 0; n < 700; n++) {
      const [hr, hz] = field(rho, z), m = Math.hypot(hr, hz) || 1, st = .0014;
      const [hr2, hz2] = field(rho + hr / m * st / 2, z + hz / m * st / 2), m2 = Math.hypot(hr2, hz2) || 1;
      const nz = z + hz2 / m2 * st;
      if (z > 0 && nz <= 0 || z < 0 && nz >= 0) crossed++;
      rho += hr2 / m2 * st; z = nz;
      pts.push([rho, z]);
      if (crossed >= 2 || !limit(rho, z)) break;
    }
    return pts;
  });
}
