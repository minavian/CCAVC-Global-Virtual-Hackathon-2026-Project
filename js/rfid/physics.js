/*
 * The physics of a reader powering a tag, in real units (SI: meters, amperes, volts, henries,
 * farads, ohms, hertz).
 *
 *   1. The reader's coil carries an alternating current. Its magnetic field reaches the tag.
 *   2. The field through the tag's coil induces a voltage (Faraday's law): V = ω · M · I.
 *   3. The tag's coil and capacitor form a tuned circuit. Its voltage reaches the chip, which
 *      wakes once it has enough.
 *   4. When the chip switches a resistor across its coil (load modulation), the tag draws more
 *      from the field, and the reader's coil current dips a little. That dip is the answer.
 *
 * Coils are modelled as coaxial circular loops (exact formulas with elliptic integrals). A metal
 * plate behind the tag is modelled as a perfect conductor, using mirror images: the plate acts
 * like a second reader coil, mirrored behind it, carrying the opposite current. It also mirrors
 * the tag's own coil, which lowers its inductance and pushes its tuning up.
 *
 * window.RFID.physics (browser) or require('./physics.js') (Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.RFID = root.RFID || {}).physics = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MU0 = 4e-7 * Math.PI;
  const TAU = 2 * Math.PI;

  // ---------- Complex numbers, as [re, im] ----------
  const cx = (re, im = 0) => [re, im];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const abs = a => Math.hypot(a[0], a[1]);
  const parallel = (a, b) => div(mul(a, b), add(a, b));

  // ---------- Elliptic integrals K(k) and E(k), by the arithmetic-geometric mean ----------
  function ellipticKE(k) {
    let a = 1, b = Math.sqrt(Math.max(0, 1 - k * k)), c = k, sum = c * c / 2, power = .5;
    for (let n = 0; n < 30 && Math.abs(c) > 1e-15; n++) {
      const an = (a + b) / 2;
      c = (a - b) / 2;
      b = Math.sqrt(a * b);
      a = an;
      power *= 2;
      sum += power * c * c;
    }
    const K = Math.PI / (2 * a);
    return { K, E: K * (1 - sum) };
  }

  // Mutual inductance of two coaxial circular loops (one turn each), radii a and b, distance d
  // apart (Maxwell's formula). Multiply by both turn counts for real coils.
  function loopMutual(a, b, d) {
    const k2 = 4 * a * b / ((a + b) ** 2 + d * d), k = Math.sqrt(k2);
    const { K, E } = ellipticKE(k);
    return MU0 * Math.sqrt(a * b) * ((2 / k - k) * K - 2 / k * E);
  }

  // Self-inductance of an N-turn circular coil of radius a, wound with wire of radius w.
  const coilInductance = (n, a, w) => n * n * MU0 * a * (Math.log(8 * a / w) - 2);

  // Magnetic field strength H (A/m) on the axis of a coil, distance d from its centre.
  const axialH = (n, current, a, d) => n * current * a * a / (2 * (a * a + d * d) ** 1.5);

  // The field of one circular loop (radius a, current I, in the plane z = z0) at a point
  // (ρ, z) in the plane that contains the axis. Returns [Hρ, Hz] in A/m.
  function loopField(a, current, z0, rho, z) {
    const zz = z - z0, r = Math.abs(rho), sign = rho < 0 ? -1 : 1;
    if (r < 1e-9) return [0, axialH(1, current, a, zz)];
    const q = (a + r) ** 2 + zz * zz, k = Math.sqrt(4 * a * r / q), { K, E } = ellipticKE(Math.min(k, 1 - 1e-12));
    const s = (a - r) ** 2 + zz * zz, f = current / (2 * Math.PI * Math.sqrt(q));
    const hz = f * (K + (a * a - r * r - zz * zz) / s * E);
    const hr = f * zz / r * (-K + (a * a + r * r + zz * zz) / s * E);
    return [sign * hr, hz];
  }

  // ---------- The two halves ----------
  // Readers and tags. Coil sizes are the real parts' sizes (as circles of the same area).
  const TAGS = {
    key: {
      name: 'Car key', frequency: 125e3,
      turns: 226, radius: .0134, wire: 5e-5, resistance: 28,
      wake: 3, clamp: 5.5,           // the chip wakes at 3 V and limits itself to 5.5 V (peak)
      chipLoad: 6e4,                 // the chip seen as a resistor while it runs (ohms)
      modulation: 2.2e4              // the resistor its switch adds when it answers
    },
    card: {
      name: 'Bank card', frequency: 13.56e6,
      turns: 4, radius: .0357, wire: 1e-4, resistance: 2.2,
      wake: 2, clamp: 3.3,
      chipLoad: null,                // set below, so the card wakes exactly at the standard's 1.5 A/m
      modulation: null
    }
  };
  const READERS = {
    // The coil around a car's start button.
    key: { name: 'Start button reader', frequency: 125e3, turns: 40, radius: .016, current: null, q: 18 },
    // A payment terminal's reader pad.
    pad: { name: 'Card reader', frequency: 13.56e6, turns: 1, radius: .035, current: .525, q: 20 },
    // A phone: smaller coil, weaker field.
    phone: { name: 'Phone', frequency: 13.56e6, turns: 2, radius: .021, current: .21, q: 16 }
  };
  const H_MIN = 1.5, H_MAX = 7.5;        // ISO/IEC 14443-2: a card must work from 1.5 to 7.5 A/m

  for (const tag of Object.values(TAGS)) {
    tag.inductance = coilInductance(tag.turns, tag.radius, tag.wire);
    tag.capacitance = 1 / ((TAU * tag.frequency) ** 2 * tag.inductance);   // tuned to its reader
  }
  for (const reader of Object.values(READERS)) {
    reader.inductance = coilInductance(reader.turns, reader.radius, 4e-4);
    reader.resistance = TAU * reader.frequency * reader.inductance / reader.q;
  }

  /*
   * Solve the coupled circuits for one situation. Everything optional has a default.
   *   tag, reader      keys of TAGS and READERS
   *   distance         meters between the coils' centres, along the axis
   *   angle            radians between the two coils' axes (0 = facing each other)
   *   metal            null, or the gap (m) from the tag's coil to a metal plate behind it
   *   frequency        the reader's frequency, Hz (default: the tag's own)
   *   capacitance      the tag's tuning capacitor, F (0 = removed)
   *   switchOn         the chip's answer switch is closed (more load)
   *   drive            multiplies the reader's current (1 = normal)
   * Returns the field, the voltages, whether the chip is awake, and the answer's dip depth.
   */
  function solve(options = {}) {
    let tag = TAGS[options.tag || 'card'];
    // A different coil size (radius, m): the same turns, so a new inductance, retuned.
    if (options.radius) {
      const inductance = coilInductance(tag.turns, options.radius, tag.wire);
      tag = { ...tag, radius: options.radius, inductance, capacitance: 1 / ((TAU * tag.frequency) ** 2 * inductance) };
    }
    const reader = READERS[options.reader || (options.tag === 'key' ? 'key' : 'pad')];
    const d = Math.max(1e-4, options.distance ?? .02);
    const angle = options.angle || 0;
    const f = options.frequency ?? reader.frequency;
    const w = TAU * f;
    const C = options.capacitance ?? tag.capacitance;
    const metal = options.metal ?? null;
    const drive = (options.drive ?? 1) * reader.current;

    // How strongly the coils are linked: Maxwell's formula, minus the mirror image of the
    // reader coil behind a metal plate, then the angle between them.
    let M = tag.turns * reader.turns * loopMutual(reader.radius, tag.radius, d);
    let L = tag.inductance;
    if (metal !== null) {
      const g = Math.max(1e-4, metal);
      M -= tag.turns * reader.turns * loopMutual(reader.radius, tag.radius, d + 2 * g);
      L -= tag.turns * tag.turns * loopMutual(tag.radius, tag.radius, 2 * g);   // its own image
      L = Math.max(L, tag.inductance * .05);
    }
    M *= Math.cos(angle);

    // The tag: an induced voltage in series with its coil, driving the capacitor and the chip.
    const series = cx(tag.resistance, w * L);
    const load = R => {
      const chip = cx(R);
      return C > 0 ? parallel(chip, cx(0, -1 / (w * C))) : chip;
    };
    // How much of the induced voltage reaches the chip, for a chip that looks like resistor R.
    const share = R => { const z = load(R); return abs(div(z, add(series, z))); };
    const emf = w * Math.abs(M) * drive;
    // The chip's limiter: given more than it can use, it soaks up the extra, which looks like
    // a smaller resistor. Find the resistor that holds the chip at its limit.
    let R = tag.chipLoad;
    const unlimited = emf * share(R);
    if (unlimited > tag.clamp) {
      let lo = 1e-3, hi = R;
      for (let i = 0; i < 50; i++) { const mid = Math.sqrt(lo * hi); if (emf * share(mid) > tag.clamp) hi = mid; else lo = mid; }
      R = Math.sqrt(lo * hi);
    }
    const idle = load(R), answering = load(1 / (1 / R + 1 / tag.modulation));
    const tagZ = switchOn => add(series, switchOn ? answering : idle);

    // The reader: a tuned coil. It holds its current steady (readers regulate their output),
    // so the field depends only on where the tag is. The tag's circuit still reflects an
    // impedance (ωM)² / Z into the reader's coil; when the chip flips its switch, that changes,
    // and the reader's coil current changes with it. That change is the answer.
    const readerZ = cx(reader.resistance, 0);
    const reflected = switchOn => div(cx((w * M) ** 2), tagZ(switchOn));
    const readerCurrent = switchOn => abs(div(mul(cx(drive), readerZ), add(readerZ, reflected(switchOn))));
    const I = drive;

    const raw = unlimited;
    const chipVolts = Math.min(raw, tag.clamp);
    const H = axialH(reader.turns, I, reader.radius, d) * (metal === null ? 1
      : 1 - axialH(1, 1, reader.radius, d + 2 * Math.max(1e-4, metal)) / axialH(1, 1, reader.radius, d));

    // The size of the change, whichever way it goes, as a fraction of the reader's current.
    const I0 = readerCurrent(false), I1 = readerCurrent(true);
    const awake = raw >= tag.wake;
    return {
      tag: tag.name, reader: reader.name,
      frequency: f, resonance: 1 / (TAU * Math.sqrt(L * Math.max(C, 1e-18))),
      field: H * Math.abs(Math.cos(angle)),   // A/m through the tag's coil (centre)
      fieldOnAxis: H,
      mutual: M, inductance: L,
      readerCurrent: I,
      emf,                                    // volts induced in the coil (peak)
      chipVolts,                              // volts at the chip (peak), after its limiter
      rawVolts: raw,                          // what the chip would get without its limiter
      limited: raw > tag.clamp,
      wake: tag.wake, clamp: tag.clamp,
      awake,
      // The answer as the reader sees it: its coil current drops by this fraction while the
      // chip's switch is closed. Only an awake chip can answer.
      dip: awake ? Math.abs(I0 - I1) / I0 : 0
    };
  }

  // A frequency sweep of the chip's voltage, for a resonance curve.
  function sweep(options, from, to, steps = 160) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const f = from * (to / from) ** (i / steps);
      const r = solve({ ...options, frequency: f });
      out.push([f, r.rawVolts]);
    }
    return out;
  }

  // The farthest distance (m) at which the chip still wakes, by bisection.
  function range(options = {}, max = .2) {
    const awakeAt = d => solve({ ...options, distance: d }).awake;
    if (!awakeAt(1e-3)) return 0;
    if (awakeAt(max)) return max;
    let lo = 1e-3, hi = max;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (awakeAt(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  // The distance at which the pad's field on its axis falls to the standard's minimum.
  function distanceForField(readerKey, target) {
    const reader = READERS[readerKey];
    let lo = 0, hi = .5;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (axialH(reader.turns, reader.current, reader.radius, mid) > target) lo = mid; else hi = mid;
    }
    return lo;
  }

  // ---------- Calibration (runs once) ----------
  // The card's chip load is set so it wakes exactly where the pad's field falls to the
  // standard's 1.5 A/m. Its answer switch halves that load.
  (function calibrate() {
    const card = TAGS.card, edge = distanceForField('pad', H_MIN);
    let lo = 10, hi = 1e5;
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi);
      card.chipLoad = mid; card.modulation = mid;
      if (solve({ tag: 'card', reader: 'pad', distance: edge }).rawVolts > card.wake) hi = mid; else lo = mid;
    }
    card.chipLoad = card.modulation = Math.sqrt(lo * hi);
    // The start button's reader is set so the key wakes up to 4 cm away.
    const reader = READERS.key;
    lo = 1e-3; hi = 50;
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi);
      reader.current = mid;
      if (solve({ tag: 'key', reader: 'key', distance: .04 }).rawVolts > TAGS.key.wake) hi = mid; else lo = mid;
    }
    reader.current = Math.sqrt(lo * hi);
  })();

  // Typical active RFID beacon (2.45 GHz ISO/IEC 18000-4 band, 1 mW / 0 dBm coin-cell radio,
  // -90 dBm receiver sensitivity, free-space Friis path loss).
  const ACTIVE_TAG = {
    name: 'Active tag',
    frequency: 2.45e9,
    txDbm: 0,
    sensitivityDbm: -90,
    batteryVolts: 3.0,
    batteryYears: 4,
  };

  // Free-space radio link for a battery-powered active RFID beacon (Friis equation, 1/d²).
  // Independent of any reader magnetic field; depends only on distance and the tag's own battery.
  function activeLink(distance = .02, options = {}) {
    const c = 299792458;
    const d = Math.max(.01, distance);
    const f = options.frequency ?? ACTIVE_TAG.frequency;
    const txDbm = options.txDbm ?? ACTIVE_TAG.txDbm;
    const sensitivityDbm = options.sensitivityDbm ?? ACTIVE_TAG.sensitivityDbm;
    const batteryOn = options.batteryOn ?? true;
    const pathLossDb = Math.max(0, 20 * Math.log10(4 * Math.PI * d * f / c));
    const rxDbm = batteryOn ? txDbm - pathLossDb : -Infinity;
    const marginDb = batteryOn ? rxDbm - sensitivityDbm : -Infinity;
    return {
      name: ACTIVE_TAG.name,
      frequency: f,
      distance: d,
      batteryOn,
      batteryVolts: batteryOn ? ACTIVE_TAG.batteryVolts : 0,
      txDbm: batteryOn ? txDbm : -Infinity,
      pathLossDb,
      rxDbm,
      sensitivityDbm,
      marginDb,
      readable: batteryOn && rxDbm >= sensitivityDbm,
    };
  }

  return { MU0, TAGS, READERS, H_MIN, H_MAX, ACTIVE_TAG, ellipticKE, loopMutual, coilInductance, axialH, loopField,
    solve, sweep, range, distanceForField, activeLink };
}));
