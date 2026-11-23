/*
 * charts.js — a tiny canvas plotting helper (no library): axes, log scales,
 * lines, bands, markers and labels, crisp on high-DPI screens.
 */
(function (root) {
  'use strict';

  const INK = '#18202f', MUTED = '#646d7e', GRID = '#ece7dc', AXIS = '#c9c1b0';

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  function scale(ax, a, b) {
    if (ax.log) {
      const l0 = Math.log10(ax.min), l1 = Math.log10(ax.max);
      return (v) => a + ((Math.log10(Math.max(v, ax.min * 1e-3)) - l0) / (l1 - l0)) * (b - a);
    }
    return (v) => a + ((v - ax.min) / (ax.max - ax.min)) * (b - a);
  }

  function niceTicks(min, max, n) {
    const span = max - min, raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || mag * 10;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function logTicks(min, max) {
    const out = [];
    for (let e = Math.ceil(Math.log10(min) - 1e-9); e <= Math.floor(Math.log10(max) + 1e-9); e++) out.push(Math.pow(10, e));
    return out;
  }

  // spec: { x:{min,max,log,label,fmt,ticks}, y:{...}, series:[{pts,color,width,dash,alpha,fill}],
  //         bands:[{x0,x1,color,label}], hlines:[{y,color,label,dash}], vlines:[{x,color,label,dash}],
  //         markers:[{x,y,color,r,label,ring}], pad:{l,r,t,b}, notes:[{x,y,text,color,align}] }
  function plot(canvas, spec) {
    const { ctx, w, h } = fit(canvas);
    const pad = Object.assign({ l: 54, r: 16, t: 14, b: 40 }, spec.pad || {});
    const X = scale(spec.x, pad.l, w - pad.r), Y = scale(spec.y, h - pad.b, pad.t);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // vertical bands
    (spec.bands || []).forEach((b) => {
      const x0 = Math.max(pad.l, X(b.x0)), x1 = Math.min(w - pad.r, X(b.x1));
      if (x1 <= x0) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(x0, pad.t, x1 - x0, h - pad.t - pad.b);
      if (b.label) {
        ctx.fillStyle = b.labelColor || MUTED; ctx.textAlign = 'center';
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        if (x1 - x0 > 40) ctx.fillText(b.label, (x0 + x1) / 2, pad.t + 10);
        ctx.font = '12px Inter, system-ui, sans-serif';
      }
    });

    // grid + tick labels
    const xt = spec.x.ticks || (spec.x.log ? logTicks(spec.x.min, spec.x.max) : niceTicks(spec.x.min, spec.x.max, Math.max(3, Math.floor((w - pad.l - pad.r) / 70))));
    const yt = spec.y.ticks || (spec.y.log ? logTicks(spec.y.min, spec.y.max) : niceTicks(spec.y.min, spec.y.max, Math.max(3, Math.floor((h - pad.t - pad.b) / 46))));
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    xt.forEach((v) => {
      const x = Math.round(X(v)) + 0.5;
      if (x < pad.l - 1 || x > w - pad.r + 1) return;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      ctx.fillText(spec.x.fmt ? spec.x.fmt(v) : String(v), x, h - pad.b + 14);
    });
    ctx.textAlign = 'right';
    yt.forEach((v) => {
      const y = Math.round(Y(v)) + 0.5;
      if (y < pad.t - 1 || y > h - pad.b + 1) return;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(spec.y.fmt ? spec.y.fmt(v) : String(v), pad.l - 7, y);
    });
    ctx.strokeStyle = AXIS;
    ctx.beginPath(); ctx.moveTo(pad.l + 0.5, pad.t); ctx.lineTo(pad.l + 0.5, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5); ctx.stroke();

    // axis labels
    ctx.fillStyle = INK; ctx.font = '600 12px Inter, system-ui, sans-serif';
    if (spec.x.label) { ctx.textAlign = 'center'; ctx.fillText(spec.x.label, pad.l + (w - pad.l - pad.r) / 2, h - 9); }
    if (spec.y.label) {
      ctx.save(); ctx.translate(13, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText(spec.y.label, 0, 0); ctx.restore();
    }
    ctx.font = '12px Inter, system-ui, sans-serif';

    // clip to plot area for data
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, w - pad.l - pad.r, h - pad.t - pad.b + 4); ctx.clip();

    (spec.hlines || []).forEach((l) => {
      const y = Y(l.y);
      ctx.strokeStyle = l.color || INK; ctx.lineWidth = l.width || 1.5; ctx.setLineDash(l.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.setLineDash([]);
      if (l.label) { ctx.fillStyle = l.color || INK; ctx.textAlign = l.align || 'right'; ctx.font = '700 11.5px Inter, system-ui, sans-serif'; ctx.fillText(l.label, l.align === 'left' ? pad.l + 6 : w - pad.r - 4, y - 9); ctx.font = '12px Inter, system-ui, sans-serif'; }
    });
    (spec.vlines || []).forEach((l) => {
      const x = X(l.x);
      ctx.strokeStyle = l.color || INK; ctx.lineWidth = l.width || 1.5; ctx.setLineDash(l.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
      if (l.label) { ctx.fillStyle = l.color || INK; ctx.textAlign = x > w * 0.7 ? 'right' : 'left'; ctx.font = '700 11.5px Inter, system-ui, sans-serif'; ctx.fillText(l.label, x + (x > w * 0.7 ? -6 : 6), l.dy < 0 ? h - pad.b + l.dy : pad.t + (l.dy || 10)); ctx.font = '12px Inter, system-ui, sans-serif'; }
    });

    (spec.series || []).forEach((s) => {
      if (!s.pts || s.pts.length < 2) return;
      ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
      if (s.fill) {
        ctx.beginPath();
        ctx.moveTo(X(s.pts[0][0]), h - pad.b);
        s.pts.forEach((p) => ctx.lineTo(X(p[0]), Y(p[1])));
        ctx.lineTo(X(s.pts[s.pts.length - 1][0]), h - pad.b);
        ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill();
      }
      ctx.strokeStyle = s.color || INK; ctx.lineWidth = s.width || 2.5; ctx.setLineDash(s.dash || []);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      s.pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      if (s.label) {
        const p = s.labelAt != null ? s.pts[s.labelAt] : s.pts[s.pts.length - 1];
        ctx.fillStyle = s.color; ctx.textAlign = 'right'; ctx.font = '600 11.5px Inter, system-ui, sans-serif';
        ctx.fillText(s.label, Math.min(X(p[0]), w - pad.r - 2), Math.max(pad.t + 8, Math.min(h - pad.b - 8, Y(p[1]) - 10)));
        ctx.font = '12px Inter, system-ui, sans-serif';
      }
      ctx.globalAlpha = 1;
    });

    (spec.markers || []).forEach((m) => {
      const x = X(m.x), y = Y(m.y);
      if (m.ring) { ctx.beginPath(); ctx.arc(x, y, (m.r || 6) + 6, 0, Math.PI * 2); ctx.fillStyle = m.ring; ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, y, m.r || 6, 0, Math.PI * 2);
      ctx.fillStyle = m.color || INK; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    ctx.restore();

    // marker labels drawn unclipped so they stay readable at the edges
    (spec.markers || []).forEach((m) => {
      if (!m.label) return;
      const x = X(m.x), y = Y(m.y);
      ctx.font = '700 12.5px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(m.label).width + 14;
      let bx = x + 12, by = y - 24;
      if (bx + tw > w - 4) bx = x - 12 - tw;
      if (by < 2) by = y + 10;
      ctx.fillStyle = m.color || INK;
      roundRect(ctx, bx, by, tw, 22, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(m.label, bx + 7, by + 11.5);
    });
    (spec.notes || []).forEach((n) => {
      ctx.fillStyle = n.color || MUTED; ctx.textAlign = n.align || 'left'; ctx.font = (n.bold ? '700 ' : '') + '12px Inter, system-ui, sans-serif';
      ctx.fillText(n.text, X(n.x), Y(n.y));
    });
    return { X, Y, w, h, pad };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  root.Charts = { fit, plot, scale, niceTicks, logTicks, roundRect };
})(window);
