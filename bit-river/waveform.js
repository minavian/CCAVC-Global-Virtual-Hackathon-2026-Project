import { clamp, ease, mix } from './river.js';

const TAU = Math.PI * 2;
const ID_BYTE = 0xa2;
const BITS = Array.from({ length: 8 }, (_, index) => (ID_BYTE >> index) & 1);

// Type A at 106 kbit/s gates eight subcarrier cycles per bit. A 1 enables
// the first half; a 0 enables the second. The trace shows one byte, LSB first.
export function subcarrierSample(bitPosition) {
  const slot = Math.min(BITS.length - 1, Math.floor(bitPosition));
  const fraction = bitPosition - slot;
  const active = BITS[slot] ? fraction < .5 : fraction >= .5;
  return active ? Math.sin(TAU * 8 * fraction) : 0;
}

export function createWaveform(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let w = 0, h = 0, lastRatio = 0;

  return function draw({ progress, time, strength, noise, received, reduced }) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    if (width !== w || height !== h || ratio !== lastRatio) {
      w = width;
      h = height;
      lastRatio = ratio;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);
    if (progress <= .135) return;

    const activity = ease(.135, .24, progress);
    const reply = ease(.28, .47, progress);
    const reveal = ease(.29, .70, progress);
    const visibleBits = BITS.length * reveal;
    const clock = reduced ? 0 : time;
    const focus = reduced ? 0 : (clock * .82) % BITS.length;
    const signal = clamp(strength);
    const staticLevel = clamp(noise);
    const lock = clamp(received);
    const halfHeight = h * .28;
    const center = h * mix(.53, .40, reply);
    const inset = 3;
    const span = w - inset * 2;
    const bitWidth = span / BITS.length;

    ctx.globalAlpha = activity;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#f1ede52c';
    ctx.beginPath();
    ctx.moveTo(inset, center);
    ctx.lineTo(w - inset, center);
    ctx.stroke();

    if (reply < 1) {
      ctx.globalAlpha = activity * (1 - reply);
      drawTrace(mix(.05, 1, activity), x => {
        const phase = TAU * (x * 11 - clock * 1.18);
        return Math.sin(phase) * halfHeight * .65;
      }, '#e5ddd0');
    }

    if (reply > 0) {
      ctx.globalAlpha = reply;
      ctx.strokeStyle = '#eadfc923';
      ctx.beginPath();
      for (let i = 0; i <= visibleBits; i++) {
        const x = inset + i * bitWidth;
        ctx.moveTo(x, center - halfHeight);
        ctx.lineTo(x, center + halfHeight);
      }
      ctx.stroke();

      const tint = ctx.createLinearGradient(inset, 0, w - inset, 0);
      tint.addColorStop(0, '#cb845b');
      if (!reduced) {
        const peak = clamp(focus / BITS.length);
        tint.addColorStop(Math.max(0, peak - .18), '#df9871');
        tint.addColorStop(peak, '#ffe0ba');
        tint.addColorStop(Math.min(1, peak + .21), '#f0a46f');
      }
      tint.addColorStop(1, lock > .55 ? '#ffe1b9' : '#d99163');
      const trace = x => {
        const t = x * BITS.length;
        const interference = (Math.sin(t * 57 - clock * 8) * .62
          + Math.sin(t * 117 + clock * 11) * .26 + Math.sin(t * 29 + clock * 5) * .12);
        return halfHeight * (subcarrierSample(t) * signal + interference * staticLevel);
      };
      ctx.globalAlpha = reply * (.38 + lock * .12);
      ctx.lineWidth = 3;
      drawTrace(reveal, trace, tint);
      ctx.globalAlpha = reply * .91;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const clarity = reply * ease(.06, .42, signal - staticLevel);
      if (clarity > 0) {
        ctx.globalAlpha = clarity;
        ctx.font = '10px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        BITS.forEach((bit, i) => {
          if (visibleBits < i + .85) return;
          ctx.fillStyle = !reduced && Math.floor(focus) === i ? '#ffe0ba' : '#c6bbae';
          ctx.fillText(bit, inset + (i + .5) * bitWidth, h - 2);
        });
      }
    }
    ctx.globalAlpha = 1;

    function drawTrace(end, wave, paint) {
      const steps = Math.max(2, Math.ceil(span * end * 1.9));
      ctx.strokeStyle = paint;
      ctx.beginPath();
      ctx.moveTo(inset, center + wave(0));
      for (let i = 1; i <= steps; i++) {
        const x = i / steps * end;
        ctx.lineTo(inset + span * x, center + wave(x));
      }
      ctx.stroke();
    }
  };
}
