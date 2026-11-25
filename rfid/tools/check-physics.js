/*
 * Quick checks of the physics engine, outside the browser.
 * Run:  node tools/check-physics.js
 */
const R = require('../js/physics.js');

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failed++;
};

// 1. Numerical mutual inductance vs Maxwell's exact formula for coaxial circles
const t = R.selfTest();
check('mutual inductance matches exact formula', t.errorPct < 0.5, `${(t.numeric * 1e9).toFixed(3)} nH vs ${(t.exact * 1e9).toFixed(3)} nH, ${t.errorPct.toFixed(2)}%`);

// 2. Reading ranges (distance where the chip stops waking up)
const base = { offset: 0, tilt: 0, tuneMHz: 13.56, rmod: 5000 };
function edge(reader, tag) {
  let last = null;
  for (let d = 0.001; d < 0.2; d += 0.0005) {
    const c = R.compute(Object.assign({}, base, { reader, tag, dist: d }));
    if (c.awake) last = c.height;
  }
  return last;
}
const ranges = {
  'terminal+card': [edge('terminal', 'card'), 0.05, 0.08],
  'terminal+fob': [edge('terminal', 'fob'), 0.025, 0.05],
  'phone+card': [edge('phone', 'card'), 0.03, 0.05],
  'phone+fob': [edge('phone', 'fob'), 0.013, 0.03],
};
Object.entries(ranges).forEach(([k, [v, lo, hi]]) => check(`range ${k}`, v !== null && v >= lo && v <= hi, v === null ? 'never wakes' : (v * 100).toFixed(2) + ' cm'));

// 3. Every combination works when touching
['terminal', 'phone'].forEach((r) => ['card', 'fob'].forEach((g) => {
  const c = R.compute(Object.assign({}, base, { reader: r, tag: g, dist: 0 }));
  check(`${r}+${g} wakes when touching`, c.awake, `${c.Vchip.toFixed(2)} V`);
}));

// 4. Energy falls steeply far away (approaching 1/d^6)
const far1 = R.compute(Object.assign({}, base, { reader: 'terminal', tag: 'card', dist: 0.2 })).ratio;
const far2 = R.compute(Object.assign({}, base, { reader: 'terminal', tag: 'card', dist: 0.4 })).ratio;
check('doubling a large distance cuts energy by roughly 64x', far1 / far2 > 40 && far1 / far2 < 70, `x${(far1 / far2).toFixed(1)}`);

// 5. A clean read decodes perfectly; heavy noise is caught by the checks
const frame = R.encodeFrame('HELLO');
const phys = R.compute(Object.assign({}, base, { reader: 'terminal', tag: 'card', dist: 0.04 }));
const clean = R.successRate(frame, phys, { hiss: 0.001, wobble: 0 }, 'sub', 50, 1);
check('clean reads all succeed', clean.ok === 50, JSON.stringify(clean));
const noisy = R.successRate(frame, phys, { hiss: 0.5, wobble: 0 }, 'sub', 50, 2);
check('very noisy reads are rejected, not accepted', noisy.ok < 5, JSON.stringify(noisy));

// 6. The subcarrier rejects slow wobble that breaks plain on/off coding
const sub = R.successRate(frame, phys, { hiss: 0.003, wobble: 0.4 }, 'sub', 100, 3);
const plain = R.successRate(frame, phys, { hiss: 0.003, wobble: 0.4 }, 'plain', 100, 3);
check('subcarrier survives slow wobble better than plain coding', sub.ok > plain.ok + 50, `sub ${sub.ok}/100, plain ${plain.ok}/100`);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
