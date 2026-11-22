// Volts, amperes and hertz with a sensible prefix.
export function si(value, unit, digits = 2) {
  const a = Math.abs(value);
  const [k, p] = a >= 1e6 ? [1e-6, 'M'] : a >= 1e3 ? [1e-3, 'k'] : a >= 1 || a === 0 ? [1, ''] : a >= 1e-3 ? [1e3, 'm'] : a >= 1e-6 ? [1e6, 'µ'] : [1e9, 'n'];
  return (value * k).toPrecision(digits).replace(/\.?0+$/, m => m.includes('.') ? '' : m) + ' ' + p + unit;
}
