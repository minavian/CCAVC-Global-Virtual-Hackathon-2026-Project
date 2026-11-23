/*
 * physics.js — the RFID engine behind every number on the page.
 *
 * Chain of calculation (all done here, live, in the browser):
 *   1. Coil geometry  -> wire segments in 3D.
 *   2. Magnetic coupling: mutual inductance M between reader coil and tag coil,
 *      from the closed-form vector potential of straight wire segments
 *      integrated around the tag's wire loops (Stokes: flux = loop integral of A).
 *   3. Coupled resonant circuits (complex phasors at the drive frequency):
 *      reader = series RLC driven by a source, tag = coil + tuning capacitor + chip.
 *      Gives chip voltage, chip power, reader coil voltage.
 *   4. Load modulation: the chip switches a resistor across its coil; we solve the
 *      circuit for both switch states and get the tiny change at the reader.
 *   5. Data: letters -> bytes -> bits (+parity, +check byte) -> Manchester code on an
 *      847.5 kHz subcarrier -> sampled reader signal with noise -> decoder -> checks.
 *
 * Works in the browser (window.RFID) and in Node (module.exports) for testing.
 */
(function (root) {
  'use strict';

  const MU0 = 4e-7 * Math.PI;           // magnetic constant (H/m)
  const F0 = 13.56e6;                   // HF RFID / NFC carrier (Hz)
  const FSUB = F0 / 16;                 // tag subcarrier, 847.5 kHz
  const BITRATE = F0 / 128;             // 105.9 kbit/s
  const SAMPLES_PER_SUB = 8;            // simulation samples per subcarrier cycle
  const SUB_PER_HALFBIT = 4;            // 4 subcarrier cycles per half bit
  const HALF = SAMPLES_PER_SUB * SUB_PER_HALFBIT;   // 32 samples per half bit
  const FS = FSUB * SAMPLES_PER_SUB;    // simulation sample rate (6.78 MHz)

  // ------------------------------------------------------------------ complex
  const cx = (re, im) => ({ re: re, im: im || 0 });
  const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
  const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  };
  const cabs = (a) => Math.hypot(a.re, a.im);
  const cinv = (a) => cdiv(cx(1, 0), a);

  // 4-point Gauss–Legendre on [0,1]
  const GL_X = [0.0694318442029737, 0.3300094782075719, 0.6699905217924281, 0.9305681557970263];
  const GL_W = [0.1739274225687269, 0.3260725774312731, 0.3260725774312731, 0.1739274225687269];

  // ------------------------------------------------------------------ devices
  // Sizes come from the 3D models (antenna parts measured in metres).
  const READERS = {
    terminal: {
      id: 'terminal', name: 'Shop / door reader',
      coil: { w: 0.066, h: 0.066, turns: 3, pitch: 0.002, rho: 0.00025 },
      Q: 10,             // reader antenna quality factor
      Inom: 0.1044,      // coil current amplitude with no card nearby (A, peak)
      surface: 0.002,    // top surface is 2 mm above the coil
    },
    phone: {
      id: 'phone', name: 'Phone',
      coil: { shape: 'circle', w: 0.0598, h: 0.0598, turns: 2, pitch: 0.0012, rho: 0.00015 },   // ring around the camera
      Q: 8,
      Inom: 0.0863,      // a phone runs on a battery, so it drives its coil gently
      surface: 0.0076,   // the camera bump keeps the card ~7.6 mm above the coil
    },
  };

  const TAGS = {
    card: {
      id: 'card', name: 'Bank card',
      coil: { w: 0.0815, h: 0.0493, turns: 4, pitch: 0.0011, rho: 0.00006 },
      R2: 2.5,           // copper loss of the antenna (ohm)
      RL: 1000,          // the chip, seen as a resistor (ohm)
      Von: 2.0,          // chip wakes up above this voltage (V, peak)
      Vclamp: 4.5,       // chip's protection clamp (V, peak)
      bottom: 0.0004,    // coil sits 0.4 mm above the card's lower face
      halfLen: 0.0428,   // half length, for tilt clearance
    },
    fob: {
      id: 'fob', name: 'Key fob',
      coil: { w: 0.0291, h: 0.0195, turns: 8, stacked: true, rho: 0.0006 },   // long side along the view
      R2: 3.0,
      RL: 1000,
      Von: 2.0,
      Vclamp: 4.5,
      bottom: 0.0044,
      halfLen: 0.0295,
    },
  };

  // ------------------------------------------------------------------ geometry
  // Turns of a rectangular coil, as half-widths in the coil's own plane.
  function coilTurns(spec) {
    if (spec.stacked) return [{ hw: spec.w / 2 - spec.rho, hh: spec.h / 2 - spec.rho, weight: spec.turns }];
    const out = [];
    for (let i = 0; i < spec.turns; i++) {
      out.push({ hw: spec.w / 2 - spec.pitch * (i + 0.5), hh: spec.h / 2 - spec.pitch * (i + 0.5), weight: 1 });
    }
    return out;
  }

  // Corners of a rectangle placed in 3D by centre c and in-plane unit axes u, v.
  function rectCorners(c, u, v, hw, hh) {
    const p = (a, b) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, c[2] + u[2] * a + v[2] * b];
    return [p(hw, hh), p(-hw, hh), p(-hw, -hh), p(hw, -hh)];
  }

  // Corners of one turn: a rectangle, or a 24-sided polygon (same area as the
  // circle) for round coils.
  function turnCorners(spec, t, c, u, v, shrink) {
    const s = shrink || 0;
    if (spec.shape === 'circle') {
      const n = 24, r = (t.hw - s) * Math.sqrt(Math.PI / ((n / 2) * Math.sin((2 * Math.PI) / n)));
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        pts.push([c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa]);
      }
      return pts;
    }
    return rectCorners(c, u, v, t.hw - s, t.hh - s);
  }

  // Flattened segment list: [ax, ay, az, bx, by, bz, weight, length] * n
  function loopsToSegments(loops) {
    const out = [];
    loops.forEach((lp) => {
      const pts = lp.corners;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        out.push(a[0], a[1], a[2], b[0], b[1], b[2], lp.weight, L);
      }
    });
    return new Float64Array(out);
  }

  // Reader coil lies flat in the y = 0 plane, centred on the origin.
  function readerLoops(reader) {
    return coilTurns(reader.coil).map((t) => ({
      weight: t.weight,
      corners: turnCorners(reader.coil, t, [0, 0, 0], [1, 0, 0], [0, 0, 1]),
    }));
  }

  // Tag pose: coil centre at (x, y, 0); tilted by `tilt` (rad) about the z axis.
  function tagFrame(pose) {
    const c = [pose.x, pose.y, 0];
    const u = [Math.cos(pose.tilt), Math.sin(pose.tilt), 0];
    const v = [0, 0, 1];
    const n = [Math.sin(pose.tilt), -Math.cos(pose.tilt), 0];
    return { c, u, v, n };
  }
  function tagLoops(tag, pose) {
    const f = tagFrame(pose);
    return coilTurns(tag.coil).map((t) => ({ weight: t.weight, corners: turnCorners(tag.coil, t, f.c, f.u, f.v) }));
  }

  // ------------------------------------------------------------------ fields
  // Vector potential (per amp) of all segments at point p. Closed form for a straight
  // segment: A = mu0/(4 pi) * dir * ln((r1 + r2 + L) / (r1 + r2 - L)).
  function vecPot(segs, px, py, pz, out) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < segs.length; k += 8) {
      const x1 = segs[k], y1 = segs[k + 1], z1 = segs[k + 2];
      const x2 = segs[k + 3], y2 = segs[k + 4], z2 = segs[k + 5];
      const w = segs[k + 6], L = segs[k + 7];
      const r1 = Math.hypot(px - x1, py - y1, pz - z1);
      const r2 = Math.hypot(px - x2, py - y2, pz - z2);
      const s = r1 + r2;
      const f = (w * Math.log((s + L) / Math.max(s - L, 1e-15))) / L;
      ax += f * (x2 - x1); ay += f * (y2 - y1); az += f * (z2 - z1);
    }
    const m = MU0 / (4 * Math.PI);
    out[0] = ax * m; out[1] = ay * m; out[2] = az * m;
    return out;
  }

  // Magnetic flux density (per amp) at p — Biot–Savart, closed form per segment.
  function bField(segs, px, py, pz, out) {
    let bx = 0, by = 0, bz = 0;
    for (let k = 0; k < segs.length; k += 8) {
      const ax = px - segs[k], ay = py - segs[k + 1], az = pz - segs[k + 2];
      const bxv = px - segs[k + 3], byv = py - segs[k + 4], bzv = pz - segs[k + 5];
      const w = segs[k + 6];
      const ra = Math.hypot(ax, ay, az), rb = Math.hypot(bxv, byv, bzv);
      const dot = ax * bxv + ay * byv + az * bzv;
      const den = ra * rb * (ra * rb + dot);
      if (den < 1e-30) continue;
      const f = (w * (ra + rb)) / den;
      bx += f * (ay * bzv - az * byv);
      by += f * (az * bxv - ax * bzv);
      bz += f * (ax * byv - ay * bxv);
    }
    const m = MU0 / (4 * Math.PI);
    out[0] = bx * m; out[1] = by * m; out[2] = bz * m;
    return out;
  }

  // Mutual inductance: loop integral of the source's vector potential along each
  // target loop (composite Gauss–Legendre, nsub sub-intervals per straight side).
  function mutualFromLoops(srcSegs, loops, nsub) {
    const A = [0, 0, 0];
    let M = 0;
    loops.forEach((lp) => {
      const pts = lp.corners;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let side = 0;
        for (let j = 0; j < nsub; j++) {
          for (let q = 0; q < 4; q++) {
            const t = (j + GL_X[q]) / nsub;
            vecPot(srcSegs, a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t, A);
            side += GL_W[q] * (A[0] * d[0] + A[1] * d[1] + A[2] * d[2]);
          }
        }
        M += (lp.weight * side) / nsub;
      }
    });
    return M;
  }

  // Self-inductance of a flat rectangular coil: sum of mutual inductances between
  // every pair of turns; a turn's own term uses a path pulled in by the wire radius.
  function selfInductance(spec) {
    const turns = coilTurns(spec);
    const c = [0, 0, 0], u = [1, 0, 0], v = [0, 1, 0];
    let L = 0;
    for (let i = 0; i < turns.length; i++) {
      for (let j = 0; j < turns.length; j++) {
        const src = loopsToSegments([{ weight: 1, corners: turnCorners(spec, turns[j], c, u, v) }]);
        const shrink = i === j ? spec.rho : 0;
        const path = [{ weight: 1, corners: turnCorners(spec, turns[i], c, u, v, shrink) }];
        L += mutualFromLoops(src, path, 48) * turns[i].weight * turns[j].weight;
      }
    }
    return L;
  }

  // ------------------------------------------------------------------ circuits
  const cache = {};
  function readerModel(id) {
    const key = 'r:' + id;
    if (cache[key]) return cache[key];
    const r = READERS[id];
    const L = selfInductance(r.coil);
    const w0 = 2 * Math.PI * F0;
    const R = (w0 * L) / r.Q;                    // total series resistance (source + coil)
    const model = {
      spec: r, L, R, R1: R * 0.15, C: 1 / (w0 * w0 * L), Vs: r.Inom * R,
      segs: loopsToSegments(readerLoops(r)),
    };
    cache[key] = model;
    return model;
  }
  function tagModel(id) {
    const key = 't:' + id;
    if (cache[key]) return cache[key];
    const t = TAGS[id];
    cache[key] = { spec: t, L: selfInductance(t.coil) };
    return cache[key];
  }

  // Solve the two coupled circuits at frequency f.
  //   reader: Vs = (R + jwL1 + 1/(jwC1)) I1 + jwM I2
  //   tag:    0  = (R2 + jwL2 + ZL) I2 + jwM I1,   ZL = chip resistance || tuning capacitor
  function solveCircuit(rd, tg, M, f, RL, C2) {
    const w = 2 * Math.PI * f;
    const Z1 = cx(rd.R, w * rd.L - 1 / (w * rd.C));
    const ZL = cinv(cx(1 / RL, w * C2));
    const Z2 = cx(tg.spec.R2 + ZL.re, w * tg.L + ZL.im);
    const ZT = cdiv(cx(w * w * M * M, 0), Z2);         // tag impedance "reflected" into the reader
    const I1 = cdiv(cx(rd.Vs, 0), cadd(Z1, ZT));
    const I2 = cmul(cx(0, -w * M), cdiv(I1, Z2));
    const Vchip = cmul(I2, ZL);
    const Vant = cadd(cmul(cx(rd.R1, w * rd.L), I1), cmul(cx(0, w * M), I2));
    return { I1: cabs(I1), I2: cabs(I2), Vchip: cabs(Vchip), Vant: cabs(Vant), ZT: ZT, RL: RL };
  }

  // Chip with protection clamp: if the voltage would exceed Vclamp, the clamp acts as
  // an extra load (lower effective resistance) until the voltage sits at Vclamp.
  // The clamp starts at the chip's own resistance and only ever adds load, so we walk
  // the effective resistance downwards until the voltage first drops to Vclamp.
  function solveTag(rd, tg, M, f, C2) {
    const RL0 = tg.spec.RL, Vc = tg.spec.Vclamp;
    let s = solveCircuit(rd, tg, M, f, RL0, C2);
    if (s.Vchip <= Vc) return { s, RLeff: RL0, clamped: false };
    const steps = 48, lmin = Math.log(2);
    let hiR = RL0, loR = RL0;
    for (let i = 1; i <= steps; i++) {
      const R = Math.exp(Math.log(RL0) + ((lmin - Math.log(RL0)) * i) / steps);
      if (solveCircuit(rd, tg, M, f, R, C2).Vchip <= Vc) { loR = R; break; }
      hiR = R; loR = R;
    }
    let lo = Math.log(loR), hi = Math.log(hiR);
    for (let i = 0; i < 30; i++) {
      const mid = 0.5 * (lo + hi);
      if (solveCircuit(rd, tg, M, f, Math.exp(mid), C2).Vchip > Vc) hi = mid; else lo = mid;
    }
    const RLeff = Math.exp(lo);
    s = solveCircuit(rd, tg, M, f, RLeff, C2);
    return { s, RLeff, clamped: true };
  }

  function invalidate() { Object.keys(cache).forEach((k) => delete cache[k]); }

  const par = (a, b) => (a * b) / (a + b);

  // Effective distance after keeping a tilted tag from passing through the reader.
  function effectiveHeight(readerId, tagId, dist, tilt) {
    const r = READERS[readerId], t = TAGS[tagId];
    const touching = r.surface + t.bottom;
    const tiltMin = r.surface + t.halfLen * Math.abs(Math.sin(tilt)) + t.bottom * Math.abs(Math.cos(tilt));
    return { y: Math.max(dist, touching, tiltMin), touching, tiltMin };
  }

  function mutual(readerId, tagId, pose, nsub) {
    const rd = readerModel(readerId);
    return mutualFromLoops(rd.segs, tagLoops(TAGS[tagId], pose), nsub || 6);
  }

  // Everything the page shows for one setting of the controls.
  // st = { reader, tag, dist, offset, tilt, tuneMHz, rmod }
  function compute(st) {
    const rd = readerModel(st.reader), tg = tagModel(st.tag);
    const h = effectiveHeight(st.reader, st.tag, st.dist, st.tilt);
    const pose = { x: st.offset, y: h.y, tilt: st.tilt };
    const M = mutual(st.reader, st.tag, pose, 8);
    const k = Math.abs(M) / Math.sqrt(rd.L * tg.L);
    const C2 = 1 / Math.pow(2 * Math.PI * st.tuneMHz * 1e6, 2) / tg.L;
    const off = solveTag(rd, tg, M, F0, C2);
    const on = solveCircuit(rd, tg, M, F0, par(off.RLeff, st.rmod), C2);
    const free = solveCircuit(rd, tg, 0, F0, tg.spec.RL, C2);    // no tag at all
    // field strength at the tag centre (A/m, peak) from the actual reader current
    const B = bField(rd.segs, pose.x, pose.y, 0, [0, 0, 0]);
    const H = (Math.hypot(B[0], B[1], B[2]) * off.s.I1) / MU0;
    const f = tagFrame(pose);
    const Hn = (Math.abs(B[0] * f.n[0] + B[1] * f.n[1] + B[2] * f.n[2]) * off.s.I1) / MU0;
    const Vchip = off.s.Vchip;
    const Pneed = (tg.spec.Von * tg.spec.Von) / (2 * tg.spec.RL);
    const Pchip = (Vchip * Vchip) / (2 * tg.spec.RL);            // power the chip itself uses
    const Ptaken = (Vchip * Vchip) / (2 * off.RLeff);             // chip + clamp together
    const awake = Vchip >= tg.spec.Von;
    // While the chip talks, its switch flickers at 847.5 kHz with 50% duty; a small
    // storage capacitor smooths that, so the chip sees roughly the average voltage.
    const Vtalk = 0.5 * (Vchip + on.Vchip);
    const dV = on.Vant - off.s.Vant;
    return {
      reader: rd, tag: tg, pose, height: h.y, touching: h.touching, liftedByTilt: h.tiltMin > Math.max(st.dist, h.touching) + 1e-6,
      M, k, C2, H, Hn, RLeff: off.RLeff,
      Vchip, clamped: off.clamped, VchipOn: on.Vchip, Vtalk,
      Pchip, Ptaken, Pneed, Pburn: Math.max(0, Ptaken - Pchip), ratio: Ptaken / Pneed, awake,
      brownout: awake && Vtalk < 0.85 * tg.spec.Von,
      VantOff: off.s.Vant, VantOn: on.Vant, VantFree: free.Vant, dV, dVrel: dV / off.s.Vant,
      I1: off.s.I1, I1free: free.I1, I2: off.s.I2,
      reflectedOhm: off.s.ZT.re,
    };
  }

  // Energy ratio (taken / needed) for one pose, used by the curves.
  function ratioAt(rd, tg, M, C2) {
    const sol = solveTag(rd, tg, M, F0, C2);
    const Pneed = (tg.spec.Von * tg.spec.Von) / (2 * tg.spec.RL);
    return (sol.s.Vchip * sol.s.Vchip) / (2 * sol.RLeff) / Pneed;
  }

  // Chip "power ratio" (available power / needed power) for a list of distances.
  function ratioVsDistance(st, dists) {
    const rd = readerModel(st.reader), tg = tagModel(st.tag);
    const C2 = 1 / Math.pow(2 * Math.PI * st.tuneMHz * 1e6, 2) / tg.L;
    return dists.map((d) => {
      const h = effectiveHeight(st.reader, st.tag, d, st.tilt);
      const M = mutual(st.reader, st.tag, { x: st.offset, y: h.y, tilt: st.tilt }, 5);
      return { d, y: h.y, M, ratio: ratioAt(rd, tg, M, C2) };
    });
  }

  function ratioVsOffset(st, offsets) {
    const rd = readerModel(st.reader), tg = tagModel(st.tag);
    const C2 = 1 / Math.pow(2 * Math.PI * st.tuneMHz * 1e6, 2) / tg.L;
    const h = effectiveHeight(st.reader, st.tag, st.dist, st.tilt);
    return offsets.map((x) => {
      const M = mutual(st.reader, st.tag, { x, y: h.y, tilt: st.tilt }, 5);
      return { x, M, ratio: ratioAt(rd, tg, M, C2) };
    });
  }

  // Chip voltage if the reader pushed at other frequencies (resonance curve).
  function chipVsFrequency(st, freqs) {
    const rd = readerModel(st.reader), tg = tagModel(st.tag);
    const h = effectiveHeight(st.reader, st.tag, st.dist, st.tilt);
    const M = mutual(st.reader, st.tag, { x: st.offset, y: h.y, tilt: st.tilt }, 8);
    const C2 = 1 / Math.pow(2 * Math.PI * st.tuneMHz * 1e6, 2) / tg.L;
    return freqs.map((f) => ({ f, v: solveCircuit(rd, tg, M, f, tg.spec.RL, C2).Vchip }));
  }

  // Reader current needed to wake the tag at a given distance (for the "spy" question).
  function currentNeeded(st, dist) {
    const rd = readerModel(st.reader), tg = tagModel(st.tag);
    const C2 = 1 / Math.pow(2 * Math.PI * st.tuneMHz * 1e6, 2) / tg.L;
    const M = mutual(st.reader, st.tag, { x: 0, y: dist, tilt: 0 }, 5);
    const v = solveCircuit(rd, tg, M, F0, tg.spec.RL, C2).Vchip;   // linear in drive
    return { scale: tg.spec.Von / v, M };
  }

  // ------------------------------------------------------------------ field lines
  // Traces magnetic field lines of the reader coil in the x–y plane (z = 0), which
  // is a symmetry plane, so lines stay in it. Seeds are spaced by equal flux.
  function fieldLines(readerId, opts) {
    const o = Object.assign({ count: 9, xmax: 0.2, ymin: -0.12, ymax: 0.22, maxSteps: 4000 }, opts || {});
    const rd = readerModel(readerId);
    const turns = coilTurns(READERS[readerId].coil);
    const inner = Math.min.apply(null, turns.map((t) => t.hw));
    const wires = [];
    turns.forEach((t) => { wires.push(t.hw, -t.hw); });
    const B = [0, 0, 0];
    // cumulative flux (per unit depth) along the coil plane, just inside the inner turn
    const n = 400, xs = [], cum = [0];
    for (let i = 0; i <= n; i++) xs.push((-inner * 0.985) + (2 * inner * 0.985 * i) / n);
    for (let i = 1; i <= n; i++) {
      bField(rd.segs, 0.5 * (xs[i] + xs[i - 1]), 0, 0, B);
      cum.push(cum[i - 1] + Math.abs(B[1]) * (xs[i] - xs[i - 1]));
    }
    const total = cum[n];
    const seeds = [];
    for (let s = 0; s < o.count; s++) {
      const target = (total * (s + 0.5)) / o.count;
      let i = 1;
      while (i < n && cum[i] < target) i++;
      const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
      seeds.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
    const dir = (x, y, out) => {
      bField(rd.segs, x, y, 0, B);
      const m = Math.hypot(B[0], B[1]) || 1e-30;
      out[0] = B[0] / m; out[1] = B[1] / m; out[2] = m;
      return out;
    };
    const nearestWire = (x, y) => {
      let d = Infinity;
      for (let i = 0; i < wires.length; i++) d = Math.min(d, Math.hypot(x - wires[i], y));
      return d;
    };
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
    const lines = seeds.map((x0) => {
      const pts = [[x0, 0, 0]];
      const strength = [];
      let x = x0, y = 0, travelled = 0;
      for (let s = 0; s < o.maxSteps; s++) {
        const h = Math.min(0.004, Math.max(0.00025, 0.2 * nearestWire(x, y)));
        dir(x, y, k1);
        dir(x + 0.5 * h * k1[0], y + 0.5 * h * k1[1], k2);
        dir(x + 0.5 * h * k2[0], y + 0.5 * h * k2[1], k3);
        dir(x + h * k3[0], y + h * k3[1], k4);
        x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        travelled += h;
        pts.push([x, y, 0]);
        strength.push(k1[2]);
        if (Math.abs(x) > o.xmax || y > o.ymax || y < o.ymin) break;
        if (travelled > 0.01 && Math.hypot(x - x0, y) < h * 1.5) { pts.push([x0, 0, 0]); break; }
      }
      strength.push(strength[strength.length - 1] || 0);
      return { pts, strength, closed: Math.hypot(x - x0, y) < 0.01 };
    });
    return lines;
  }

  // ------------------------------------------------------------------ data link
  function parityOdd(byte) {
    let ones = 0;
    for (let i = 0; i < 8; i++) ones += (byte >> i) & 1;
    return ones % 2 === 0 ? 1 : 0;      // extra bit makes the count of 1s odd
  }

  // Letters -> bytes (+ check byte) -> bits in the order they are sent.
  function encodeFrame(text) {
    const bytes = [];
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      bytes.push(c >= 32 && c < 127 ? c : 63);
    }
    let bcc = 0;
    bytes.forEach((b) => { bcc ^= b; });
    const all = bytes.concat([bcc]);
    const bits = [{ v: 1, kind: 'sof', byte: -1 }];
    all.forEach((b, bi) => {
      for (let i = 0; i < 8; i++) bits.push({ v: (b >> i) & 1, kind: 'data', byte: bi, idx: i });   // smallest bit first
      bits.push({ v: parityOdd(b), kind: 'parity', byte: bi });
    });
    return { text, bytes: all, nData: bytes.length, bits };
  }

  // Simple seedable random numbers (so a run can be repeated).
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    const next = () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    let spare = null;
    next.gauss = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0;
      while (u < 1e-12) u = next();
      v = next();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    };
    return next;
  }

  const IDLE_BEFORE = 2, IDLE_AFTER = 1;   // quiet bits around each reply

  // The reader's antenna voltage, sample by sample, while the tag sends a frame.
  //   lv = { off: V with switch open, on: V with switch closed }
  //   nz = { hiss: random noise (V rms), wobble: slow drift amplitude (V) }
  //   mode = 'sub' (Manchester on 847.5 kHz subcarrier, as in ISO 14443-A) or 'plain'
  function synthesize(frame, lv, nz, mode, rand, cutAfterBit) {
    const nb = frame.bits.length;
    const total = (nb + IDLE_BEFORE + IDLE_AFTER) * 2 * HALF;
    const v = new Float32Array(total);
    const sw = new Uint8Array(total);
    const fw = 15e3 + rand() * 35e3, ph = rand() * 2 * Math.PI;
    for (let b = 0; b < nb; b++) {
      if (cutAfterBit !== undefined && b > cutAfterBit) break;
      const bit = frame.bits[b].v;
      const modHalf = bit === 1 ? 0 : 1;                  // Manchester: 1 = first half, 0 = second half
      const start = (IDLE_BEFORE + b) * 2 * HALF + modHalf * HALF;
      for (let i = 0; i < HALF; i++) {
        const on = mode === 'sub' ? ((i % SAMPLES_PER_SUB) < SAMPLES_PER_SUB / 2 ? 1 : 0) : 1;
        sw[start + i] = on;
      }
    }
    for (let n = 0; n < total; n++) {
      const t = n / FS;
      v[n] = (sw[n] ? lv.on : lv.off) + nz.hiss * rand.gauss() + nz.wobble * Math.sin(2 * Math.PI * fw * t + ph);
    }
    return { v, sw, total, nb, wobbleHz: fw };
  }

  // Reader's decoder. 'sub': measures how strongly each half-bit flickers at the
  // subcarrier (I/Q correlation). 'plain': compares the average level of the halves.
  function decode(sig, nb, mode) {
    const out = [];
    const halfScore = (start) => {
      if (mode === 'sub') {
        let I = 0, Q = 0;
        for (let i = 0; i < HALF; i++) {
          const s = sig.v[start + i];
          const ph = i % SAMPLES_PER_SUB;
          I += s * (ph < 4 ? 1 : -1);
          Q += s * (ph >= 2 && ph < 6 ? 1 : -1);
        }
        return I * I + Q * Q;                              // flicker energy
      }
      let m = 0;
      for (let i = 0; i < HALF; i++) m += sig.v[start + i];
      return m / HALF;                                      // average level of this half
    };
    // In plain mode the reader learns which way the level moves from the start bit,
    // which is always a 1 (first half switched).
    let sign = 1;
    if (mode !== 'sub') {
      const s0 = IDLE_BEFORE * 2 * HALF;
      sign = halfScore(s0) - halfScore(s0 + HALF) >= 0 ? 1 : -1;
    }
    for (let b = 0; b < nb; b++) {
      const s0 = (IDLE_BEFORE + b) * 2 * HALF;
      const a = halfScore(s0), c = halfScore(s0 + HALF);
      const score = mode === 'sub' ? a - c : sign * (a - c);
      out.push({ v: score > 0 ? 1 : 0, a, c });
    }
    return out;
  }

  // Turn decoded bits back into bytes and run the checks the reader would run.
  function checkFrame(frame, dec) {
    const res = { sofOk: dec[0].v === 1, bytes: [], parityOk: [], bitErrors: 0, errorsAt: [] };
    frame.bits.forEach((b, i) => { if (dec[i].v !== b.v) { res.bitErrors++; res.errorsAt.push(i); } });
    const nBytes = frame.bytes.length;
    for (let bi = 0; bi < nBytes; bi++) {
      let byte = 0;
      for (let i = 0; i < 8; i++) byte |= dec[1 + bi * 9 + i].v << i;
      const p = dec[1 + bi * 9 + 8].v;
      res.bytes.push(byte);
      res.parityOk.push(p === parityOdd(byte));
    }
    let bcc = 0;
    for (let bi = 0; bi < nBytes - 1; bi++) bcc ^= res.bytes[bi];
    res.bccOk = bcc === res.bytes[nBytes - 1];
    res.passed = res.sofOk && res.parityOk.every(Boolean) && res.bccOk;
    res.text = res.bytes.slice(0, nBytes - 1).map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : '?')).join('');
    res.correct = res.bitErrors === 0;
    res.undetected = res.passed && !res.correct;
    return res;
  }

  // One complete read attempt.
  function readAttempt(frame, phys, nz, mode, rand) {
    if (!phys.awake) return { heard: false, reason: 'asleep' };
    const cut = phys.brownout ? 2 : undefined;               // chip resets after a few bits
    const sig = synthesize(frame, { off: phys.VantOff, on: phys.VantOn }, nz, mode, rand, cut);
    const dec = decode(sig, frame.bits.length, mode);
    const chk = checkFrame(frame, dec);
    return { heard: true, sig, dec, chk, brownout: phys.brownout };
  }

  function successRate(frame, phys, nz, mode, tries, seed) {
    const rand = rng(seed || 12345);
    let ok = 0, caught = 0, undetected = 0, bitErr = 0, bits = 0;
    for (let i = 0; i < tries; i++) {
      const r = readAttempt(frame, phys, nz, mode, rand);
      if (!r.heard) continue;
      bits += frame.bits.length; bitErr += r.chk.bitErrors;
      if (r.chk.passed && r.chk.correct) ok++;
      else if (r.chk.undetected) undetected++;
      else caught++;
    }
    return { ok, caught, undetected, tries, ber: bits ? bitErr / bits : 1 };
  }

  // ------------------------------------------------------------------ self-check
  // Exact mutual inductance of two coaxial circles (Maxwell), via elliptic integrals,
  // used to check the numerical method (circles approximated by many-sided polygons).
  function ellipticKE(m) {
    let a = 1, b = Math.sqrt(1 - m), sum = m / 2, pow = 0.5, c;
    for (let i = 0; i < 30; i++) {
      c = (a - b) / 2;
      const an = (a + b) / 2;
      b = Math.sqrt(a * b);
      a = an;
      pow *= 2;
      sum += pow * c * c;
      if (Math.abs(c) < 1e-16) break;
    }
    const K = Math.PI / (2 * a);
    return { K, E: K * (1 - sum) };
  }
  function maxwellCoaxial(r1, r2, d) {
    const m = (4 * r1 * r2) / ((r1 + r2) * (r1 + r2) + d * d);
    const k = Math.sqrt(m);
    const ke = ellipticKE(m);
    return MU0 * Math.sqrt(r1 * r2) * ((2 / k - k) * ke.K - (2 / k) * ke.E);
  }
  function polygon(r, n, y) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; pts.push([r * Math.cos(a), y, r * Math.sin(a)]); }
    return pts;
  }
  function selfTest() {
    const r1 = 0.033, r2 = 0.03, d = 0.03, n = 72;
    const src = loopsToSegments([{ weight: 1, corners: polygon(r1, n, 0) }]);
    const numeric = mutualFromLoops(src, [{ weight: 1, corners: polygon(r2, n, d) }], 3);
    const exact = maxwellCoaxial(r1, r2, d);
    return { numeric, exact, errorPct: (100 * Math.abs(numeric - exact)) / exact };
  }

  const api = {
    MU0, F0, FSUB, BITRATE, HALF, FS, SAMPLES_PER_SUB, IDLE_BEFORE, IDLE_AFTER,
    READERS, TAGS, readerModel, tagModel, effectiveHeight, invalidate,
    compute, ratioVsDistance, ratioVsOffset, chipVsFrequency, currentNeeded, fieldLines,
    bField, mutual, selfInductance, coilTurns,
    encodeFrame, parityOdd, synthesize, decode, checkFrame, readAttempt, successRate, rng,
    maxwellCoaxial, selfTest,
  };
  root.RFID = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
