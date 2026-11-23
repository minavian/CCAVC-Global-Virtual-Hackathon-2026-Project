/*
 * app.js — page logic: one shared state, live physics (physics.js), the guided
 * steps, the reader's read loop, and every chart and readout on the page.
 * The 3D view (scene3d.js) talks to this file through window.App.
 */
(function () {
  'use strict';
  const R = window.RFID;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------ formatting
  const cm = (m, d) => (m * 100).toFixed(d == null ? 1 : d) + ' cm';
  const fmtV = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' V';
  const fmtmV = (v) => {
    const a = Math.abs(v) * 1000;
    if (a >= 1000) return (a / 1000).toFixed(2) + ' V';
    return (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a >= 1 ? a.toFixed(2) : a.toFixed(3)) + ' mV';
  };
  const signed = (v, f) => (v >= 0 ? '+' : '−') + f(Math.abs(v));
  const pct = (r) => {
    const p = r * 100;
    if (p >= 1000) return Math.round(p).toLocaleString('en') + '%';
    if (p >= 10) return p.toFixed(0) + '%';
    if (p >= 1) return p.toFixed(1) + '%';
    if (p >= 0.1) return p.toFixed(2) + '%';
    return p.toFixed(3) + '%';
  };
  const pctAbs = (r) => pct(Math.abs(r));
  const fmtPower = (w) => (w >= 1e-3 ? (w * 1e3).toFixed(w >= 1e-2 ? 1 : 2) + ' mW' : (w * 1e6).toFixed(w >= 1e-5 ? 0 : 1) + ' µW');
  const fmtOhm = (r) => (r >= 1000 ? (r / 1000).toFixed(r >= 10000 ? 0 : 1) + ' kΩ' : Math.round(r) + ' Ω');
  const fmtBig = (x) => {
    if (x < 10) return x.toFixed(1);
    if (x < 1e6) return Math.round(x).toLocaleString('en');
    if (x < 1e9) return (x / 1e6).toFixed(x < 1e7 ? 1 : 0) + ' million';
    return (x / 1e9).toFixed(1) + ' billion';
  };
  const lengthAnalogy = (rel) => {
    const mm = Math.abs(rel) * 1800;            // a 1.8 m tall person
    return mm >= 10 ? (mm / 10).toFixed(1) + ' cm' : mm >= 1 ? mm.toFixed(1) + ' mm' : (mm * 1000).toFixed(0) + ' micrometres';
  };

  // ------------------------------------------------------------ state
  const state = {
    reader: 'terminal', tag: 'card', dist: 0.09, offset: 0, tilt: 0, tuneMHz: 13.56, rmod: 5000,
    hiss: 0.005, wobble: 0.03, mode: 'sub', message: 'HELLO',
    hold: false, xray: true, fieldLines: true, sound: true, trueScale: false, paused: false,
  };
  try { if (localStorage.getItem('rfid.sound') === 'off') state.sound = false; } catch (e) { /* storage unavailable */ }

  let phys = R.compute(state);
  let frame = R.encodeFrame(state.message);
  const listeners = {};
  const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  const emit = (evt, data) => { (listeners[evt] || []).forEach((fn) => fn(data)); };

  const touchingDist = () => R.READERS[state.reader].surface + R.TAGS[state.tag].bottom;

  function set(patch, source) {
    Object.assign(state, patch);
    state.dist = clamp(state.dist, touchingDist(), 0.15);
    state.offset = clamp(state.offset, -0.09, 0.09);
    if ('message' in patch) frame = R.encodeFrame(state.message || ' ');
    phys = R.compute(state);
    if (state.hold && !phys.awake) state.hold = false;   // a sleeping chip can't hold its switch
    emit('change', { state, phys, source: source || 'ui', patch });
    if (source !== 'slider') syncInputs();
    missionTick(performance.now());
    updateLab();
    scheduleUI();
  }

  // ------------------------------------------------------------ visibility
  const visible = {};
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { visible[e.target.id] = e.isIntersecting; if (e.isIntersecting) scheduleUI(); });
  }, { rootMargin: '120px 0px' });
  ['lab', 'how', 'power', 'tuning', 'switch', 'data', 'questions', 'hood'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  visible.lab = true;

  // ------------------------------------------------------------ inputs
  const el = {
    dist: $('#dist'), tilt: $('#tilt'), off: $('#off'), tune: $('#tune'), rmod: $('#rmod'), hiss: $('#hiss'), wob: $('#wob'),
    distOut: $('#distOut'), tiltOut: $('#tiltOut'), offOut: $('#offOut'), tuneOut: $('#tuneOut'), rmodOut: $('#rmodOut'),
    hissOut: $('#hissOut'), wobOut: $('#wobOut'), msg: $('#msg'), sub: $('#subToggle'),
  };
  // slider position <-> physical value
  const rmodFromPos = (p) => 50000 * Math.pow(300 / 50000, p / 100);
  const posFromRmod = (r) => (100 * Math.log(r / 50000)) / Math.log(300 / 50000);
  const hissFromPos = (p) => (p <= 0 ? 0 : 0.0005 * Math.pow(400, p / 100));
  const posFromHiss = (h) => (h <= 0 ? 0 : (100 * Math.log(h / 0.0005)) / Math.log(400));
  const wobFromPos = (p) => (p <= 0 ? 0 : 0.001 * Math.pow(600, p / 100));
  const posFromWob = (w) => (w <= 0 ? 0 : (100 * Math.log(w / 0.001)) / Math.log(600));
  const rmodWord = (r) => (r > 20000 ? 'very gentle' : r > 8000 ? 'gentle' : r > 2500 ? 'medium' : r > 900 ? 'strong' : 'very strong');

  function paintRange(input) {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--p', p + '%');
  }
  function syncInputs() {
    const t = touchingDist() * 100;
    el.dist.min = (Math.ceil(t * 20) / 20).toFixed(2);
    el.dist.value = (state.dist * 100).toFixed(2);
    el.tilt.value = Math.round(state.tilt / DEG);
    el.off.value = (state.offset * 100).toFixed(1);
    el.tune.value = state.tuneMHz;
    el.rmod.value = posFromRmod(state.rmod);
    el.hiss.value = posFromHiss(state.hiss);
    el.wob.value = posFromWob(state.wobble);
    if (el.msg.value !== state.message) el.msg.value = state.message;
    el.sub.checked = state.mode === 'sub';
    [el.dist, el.tilt, el.off, el.tune, el.rmod, el.hiss, el.wob].forEach(paintRange);
    $$('.seg[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === state.tag)));
    $$('.seg[data-reader]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.reader === state.reader)));
    $('#xrayBtn').setAttribute('aria-pressed', String(state.xray));
    $('#fieldBtn').setAttribute('aria-pressed', String(state.fieldLines));
    $('#soundBtn').setAttribute('aria-pressed', String(state.sound));
    $('#scaleBtn').setAttribute('aria-pressed', String(state.trueScale));
    $('#scaleBtn').textContent = state.trueScale ? 'zoom in on the wiggle' : 'show true scale';
    $('#pauseBtn').setAttribute('aria-pressed', String(state.paused));
    updateOutputs();
  }
  function updateOutputs() {
    const touching = phys.height <= touchingDist() + 1e-4;
    el.distOut.textContent = (phys.height * 100).toFixed(1) + ' cm' + (touching ? ' · touching' : '');
    el.tiltOut.textContent = Math.round(state.tilt / DEG) + '°';
    el.offOut.textContent = (state.offset >= 0 ? '' : '−') + Math.abs(state.offset * 100).toFixed(1) + ' cm';
    el.tuneOut.textContent = state.tuneMHz.toFixed(2) + ' MHz';
    el.rmodOut.textContent = rmodWord(state.rmod) + ' · ' + fmtOhm(state.rmod);
    el.hissOut.textContent = state.hiss ? fmtmV(state.hiss) : 'none';
    el.wobOut.textContent = state.wobble ? fmtmV(state.wobble) : 'none';
  }

  const hideHint = () => { const h = $('#dragHint'); if (h) h.classList.add('gone'); };
  el.dist.addEventListener('input', () => { hideHint(); set({ dist: el.dist.value / 100 }, 'slider'); paintRange(el.dist); });
  el.tilt.addEventListener('input', () => { set({ tilt: el.tilt.value * DEG }, 'slider'); paintRange(el.tilt); });
  el.off.addEventListener('input', () => { set({ offset: el.off.value / 100 }, 'slider'); paintRange(el.off); });
  el.tune.addEventListener('input', () => { set({ tuneMHz: +el.tune.value }, 'slider'); paintRange(el.tune); });
  el.rmod.addEventListener('input', () => { set({ rmod: rmodFromPos(+el.rmod.value) }, 'slider'); paintRange(el.rmod); });
  el.hiss.addEventListener('input', () => { set({ hiss: hissFromPos(+el.hiss.value) }, 'slider'); paintRange(el.hiss); newScopeRead(); });
  el.wob.addEventListener('input', () => { set({ wobble: wobFromPos(+el.wob.value) }, 'slider'); paintRange(el.wob); newScopeRead(); });
  el.msg.addEventListener('input', () => {
    const clean = el.msg.value.toUpperCase().replace(/[^A-Z0-9 !?.\-]/g, '').slice(0, 6);
    if (clean !== el.msg.value) el.msg.value = clean;
    set({ message: clean || ' ' }, 'slider');
    newScopeRead();
  });
  el.sub.addEventListener('change', () => { set({ mode: el.sub.checked ? 'sub' : 'plain' }, 'slider'); newScopeRead(); });

  $$('.seg[data-tag]').forEach((b) => b.addEventListener('click', () => { set({ tag: b.dataset.tag }); newScopeRead(); }));
  $$('.seg[data-reader]').forEach((b) => b.addEventListener('click', () => { set({ reader: b.dataset.reader }); newScopeRead(); }));
  $('#xrayBtn').addEventListener('click', () => set({ xray: !state.xray }));
  $('#fieldBtn').addEventListener('click', () => set({ fieldLines: !state.fieldLines }));
  $('#scaleBtn').addEventListener('click', () => set({ trueScale: !state.trueScale }));
  $('#soundBtn').addEventListener('click', () => {
    set({ sound: !state.sound });
    try { localStorage.setItem('rfid.sound', state.sound ? 'on' : 'off'); } catch (e) { /* ignore */ }
  });

  // hold-to-switch buttons
  function bindHold(btn) {
    const down = (e) => {
      if (!phys.awake) return;
      e.preventDefault();
      unlockAudio();
      if (e.pointerId != null && btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      setHold(true);
    };
    const up = () => setHold(false);
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setHold(true); } });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setHold(false); });
    btn.addEventListener('blur', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function setHold(v) {
    if (state.hold === v) return;
    set({ hold: v && phys.awake });
    if (state.hold) setTimeout(() => missionTick(performance.now()), 700);
  }
  bindHold($('#holdBtn'));
  bindHold($('#holdBtn2'));

  // ------------------------------------------------------------ audio
  let audio = null;
  function unlockAudio() {
    if (audio || !state.sound) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  function beep(ok) {
    if (!state.sound || !audio) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = ok ? 1760 : 330;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.16 : 0.22));
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 0.25);
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ edge finding
  function findEdge(st) {
    const s = Object.assign({}, st);
    const t0 = R.READERS[s.reader].surface + R.TAGS[s.tag].bottom;
    let last = null;
    for (let d = t0; d <= 0.22; d += 0.002) {
      const c = R.compute(Object.assign(s, { dist: d }));
      if (c.awake) last = c.height; else if (last !== null && d > last + 0.03) break;
    }
    if (last === null) return null;
    let lo = last, hi = last + 0.002;
    for (let i = 0; i < 14; i++) {
      const mid = 0.5 * (lo + hi);
      if (R.compute(Object.assign(s, { dist: mid })).awake) lo = mid; else hi = mid;
    }
    return lo;
  }

  // ------------------------------------------------------------ missions
  const mission = { step: 1, wakeAt: null, delta: null, edge: null, holdStart: 0, wasAwake: false, lastAwake: null, finished: false };
  const missionEls = $$('#missions li');
  const missionMsg = $('#missionMsg');
  function markMission(n) {
    missionEls.forEach((li) => {
      const m = +li.dataset.m;
      li.classList.toggle('done', m < n || (n > 3));
      li.classList.toggle('active', m === n);
    });
  }
  function missionTick(now) {
    if (mission.finished) return;
    if (mission.step === 1 && phys.awake) {
      mission.wakeAt = phys.height;
      mission.step = 2; markMission(2);
      missionMsg.innerHTML = `<b>It woke up at ${cm(phys.height)}.</b> No battery: that energy came through the air from the reader’s magnetic field. Now hold the yellow button.`;
      $('#holdBtn').classList.add('pulse');
    }
    if (mission.step === 2) {
      if (state.hold && phys.awake) {
        if (!mission.holdStart) mission.holdStart = now;
        if (now - mission.holdStart > 600) {
          mission.delta = { dV: phys.dV, rel: phys.dVrel };
          mission.step = 3; markMission(3);
          $('#holdBtn').classList.remove('pulse');
          missionMsg.innerHTML = `<b>See that?</b> The reader’s own coil voltage moved by just <b>${signed(phys.dV, fmtmV)}</b> (${pctAbs(phys.dVrel)}). That tiny change is the card talking. Now slowly pull the card away.`;
        }
      } else mission.holdStart = 0;
    }
    if (mission.step === 3) {
      if (phys.awake) mission.lastAwake = phys.height;
      if (mission.wasAwake && !phys.awake && mission.lastAwake !== null && phys.height > mission.lastAwake - 1e-4) {
        mission.edge = mission.lastAwake;
        finishMissions();
      }
    }
    mission.wasAwake = phys.awake;
  }
  function finishMissions(skipped) {
    mission.finished = true; markMission(4);
    $('#holdBtn').classList.remove('pulse');
    const edge = mission.edge || findEdge(state) || 0.05;
    const far = R.compute(Object.assign({}, state, { dist: 2 * edge }));
    const delta = mission.delta || (() => { const c = R.compute(Object.assign({}, state, { dist: Math.max(touchingDist(), edge * 0.7) })); return { dV: c.dV, rel: c.dVrel }; })();
    $('#inWake').textContent = cm(mission.wakeAt || edge);
    $('#inDelta').textContent = `${signed(delta.dV, fmtmV)} (${pctAbs(delta.rel)})`;
    $('#inCliff').textContent = pct(far.ratio);
    missionMsg.innerHTML = skipped
      ? `Here is the short version. Keep playing: every control on this page still changes the physics.`
      : `<b>The reader lost the card at ${cm(edge)}.</b> At ${cm(2 * edge)} the chip would get just ${pct(far.ratio)} of what it needs.`;
    const box = $('#insight');
    box.hidden = false;
    $('.skip-tour').hidden = true;
    const r = box.getBoundingClientRect();
    if (r.top > window.innerHeight - 80) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#skipTour').addEventListener('click', () => {
    mission.wakeAt = mission.wakeAt || findEdge(state);
    finishMissions(true);
  });

  // ------------------------------------------------------------ reader loop
  let rand = R.rng(Date.now() & 0xffffffff);
  let lastRead = null, scopeRead = null, readStats = { tries: 0, ok: 0 }, lastOk = false;
  const strip = { buf: new Float32Array(260).fill(NaN), burst: 0 };
  function nz() { return { hiss: state.hiss, wobble: state.wobble }; }

  function readTick() {
    if (document.hidden) return;
    if (!(visible.lab || visible.data || visible.how)) return;
    if (state.hold) { renderScreen(); return; }
    const r = R.readAttempt(frame, phys, nz(), state.mode, rand);
    lastRead = r;
    if (r.heard) {
      readStats.tries++;
      strip.burst = r.brownout ? 3 : 14;
      const ok = r.chk.passed && !r.brownout;
      if (ok && r.chk.correct) readStats.ok++;
      if (ok && !lastOk) beep(true);
      lastOk = ok;
    } else lastOk = false;
    if (!state.paused) { scopeRead = r.heard ? r : scopeRead && scopeRead.heard && phys.awake ? scopeRead : r; }
    emit('read', r);
    renderScreen();
    if (visible.data && !state.paused) drawData();
  }
  setInterval(readTick, 420);

  function newScopeRead() {
    if (!phys.awake) { scopeRead = { heard: false }; scheduleUI(); return; }
    scopeRead = R.readAttempt(frame, phys, nz(), state.mode, rand);
    scheduleUI();
  }

  function renderScreen() {
    const msg = $('#screenMsg'), sub = $('#screenSub'), leds = $('#leds');
    $('#screenName').textContent = state.reader === 'phone' ? 'Phone · NFC reader' : 'Shop reader';
    leds.className = 'leds';
    msg.classList.remove('err');
    const r = lastRead;
    if (state.hold) {
      msg.textContent = 'The card is holding its switch…';
      sub.textContent = 'Not a message, just one long “click”.';
      leds.classList.add('busy');
      return;
    }
    if (!phys.awake || !r || !r.heard) {
      msg.textContent = phys.ratio > 0.25 ? 'Something is there… too weak to wake.' : 'Waiting for a card…';
      sub.textContent = phys.ratio > 0.25 ? `The chip gets ${pct(phys.ratio)} of the energy it needs.` : 'No reply. Bring a card closer.';
      return;
    }
    if (r.brownout) {
      msg.textContent = 'Reply cut off!'; msg.classList.add('err');
      sub.textContent = 'The chip ran out of energy while its switch was closed.';
      return;
    }
    if (r.chk.passed) {
      msg.innerHTML = (r.chk.correct ? '✓ Read: ' : '⚠ Read: ') + `<span class="read">${escapeHtml(r.chk.text)}</span>`;
      leds.classList.add('ok');
      sub.textContent = r.chk.correct ? `Tries: ${readStats.tries} · successful: ${readStats.ok}` : 'An error slipped past the checks!';
    } else {
      msg.textContent = '✗ Garbled reply, asking again…'; msg.classList.add('err');
      sub.textContent = `${r.chk.bitErrors} bit${r.chk.bitErrors === 1 ? '' : 's'} arrived wrong. The checks caught it.`;
    }
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ lab dashboard
  const energyFill = $('#energyFill');
  $('.bar-need').style.left = (200 / 3) + '%';
  function updateLab() {
    const st = phys;
    const pos = clamp((Math.log10(Math.max(st.ratio, 1e-4)) + 2) / 3, 0, 1);
    energyFill.style.width = (pos * 100).toFixed(1) + '%';
    energyFill.classList.toggle('ok', st.awake);
    $('#stageEnergyPct').textContent = pct(st.ratio);
    $('#energyPct').textContent = st.ratio * 100 >= 10 ? Math.round(st.ratio * 100).toLocaleString('en') : (st.ratio * 100).toFixed(st.ratio * 100 >= 1 ? 1 : 2);
    const badge = $('#chipState');
    badge.className = 'badge';
    if (!st.awake) badge.textContent = 'asleep';
    else if (st.brownout) { badge.textContent = 'barely'; badge.classList.add('warn'); }
    else if (state.hold) { badge.textContent = 'switch closed'; badge.classList.add('awake'); }
    else { badge.textContent = 'awake'; badge.classList.add('awake'); }
    let note;
    if (!st.awake && st.ratio < 0.05) note = 'Too far: the chip gets almost nothing. Bring the card closer.';
    else if (!st.awake) note = `Not enough yet: ${pct(st.ratio)} of what it needs (${fmtPower(st.Ptaken)} of ${fmtPower(st.Pneed)}). Closer…`;
    else if (st.brownout) note = 'Awake, but only just. Talking (closing the switch) would make it drop out.';
    else if (st.clamped) note = `More than enough. A protection circuit in the chip safely burns off the extra as heat. The chip is running on the reader’s field alone.`;
    else note = `Awake! ${fmtPower(st.Ptaken)} is arriving through the air, and the chip needs ${fmtPower(st.Pneed)}. No battery involved.`;
    $('#energyNote').textContent = note;

    const vant = state.hold && st.awake ? st.VantOn : st.VantOff;
    $('#vant').textContent = vant.toFixed(vant >= 10 ? 2 : 3);
    $('#vantDelta').innerHTML = st.awake
      ? `The card’s switch moves this by <b>${signed(st.dV, fmtmV)}</b> (${signed(st.dVrel, pctAbs)})`
      : 'The chip is asleep, so it can’t move this yet.';
    const hb = $('#holdBtn'), hb2 = $('#holdBtn2');
    [hb, hb2].forEach((b) => { b.disabled = !st.awake; b.classList.toggle('pressed', state.hold); });
    $('.hold-icon .lever').setAttribute('d', state.hold ? 'M8.6 12 L31 12' : 'M8.6 10.4 L30 3');
    $('#holdNote').innerHTML = st.awake
      ? 'This is the <b>only</b> way the chip can talk: it connects an extra load across its own antenna. Watch the reader’s number below while you hold.'
      : 'The chip is asleep: it has <b>no energy to flip its switch</b>. Bring the card closer first.';
    updateOutputs();
  }

  // rolling strip chart of the reader's coil voltage
  function stripPush() {
    let v = phys.VantOff;
    if (phys.awake && state.hold) v = phys.VantOn;
    else if (phys.awake && strip.burst > 0) { v = strip.burst % 2 ? phys.VantOn : phys.VantOff; strip.burst--; }
    strip.buf.copyWithin(0, 1);
    strip.buf[strip.buf.length - 1] = v;
  }
  function drawStrip() {
    const cv = $('#strip');
    const { ctx, w, h } = Charts.fit(cv);
    ctx.fillStyle = '#0f1628'; ctx.fillRect(0, 0, w, h);
    const base = phys.VantOff, onV = phys.VantOn;
    let lo, hi;
    if (state.trueScale) { lo = 0; hi = Math.max(phys.VantFree, base, onV) * 1.15; }
    else {
      const half = Math.max(Math.abs(onV - base) * 1.7, base * 0.0004, 1e-5);
      lo = base - half; hi = base + half;
    }
    const Y = (v) => h - 8 - ((v - lo) / (hi - lo)) * (h - 16);
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(160,175,205,.45)';
    ctx.beginPath(); ctx.moveTo(0, Y(base)); ctx.lineTo(w, Y(base)); ctx.stroke();
    if (phys.awake && !state.trueScale) {
      ctx.strokeStyle = 'rgba(255,111,163,.5)';
      ctx.beginPath(); ctx.moveTo(0, Y(onV)); ctx.lineTo(w, Y(onV)); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '600 10.5px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(190,200,225,.8)';
    ctx.fillText(state.trueScale ? '0 V at the bottom' : 'switch open', 6, clamp(Y(base) + (onV > base ? 9 : -9), 8, h - 8));
    if (phys.awake && !state.trueScale) { ctx.fillStyle = 'rgba(255,140,180,.9)'; ctx.fillText('switch closed', 6, clamp(Y(onV) + (onV > base ? -9 : 9), 8, h - 8)); }
    ctx.strokeStyle = '#ff6fa3'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = strip.buf.length;
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = strip.buf[i];
      if (Number.isNaN(v)) continue;
      const x = (i / (n - 1)) * w, y = clamp(Y(v), 2, h - 2);
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    }
    ctx.stroke();
    $('#stripNote').textContent = state.trueScale
      ? `True scale: bottom is 0 V, top is ${fmtV(hi)}. At this scale the card’s reply is invisible.`
      : `Zoomed in: top to bottom spans only ${fmtmV(hi - lo)}. Each burst is one reply from the card.`;
  }

  // ------------------------------------------------------------ "how" live text
  function updateHow() {
    const p = phys;
    $('#howPower').innerHTML = p.awake
      ? `Right now the card is <b>${cm(p.height)}</b> away and the chip is getting <b>${fmtPower(p.Ptaken)}</b>. It needs ${fmtPower(p.Pneed)}${p.clamped ? ', so the extra is burned off safely' : ''}.`
      : `Right now the card is <b>${cm(p.height)}</b> away and the chip gets only <b>${pct(p.ratio)}</b> of what it needs, so it stays asleep.`;
    $('#howTalk').innerHTML = p.awake
      ? `Right now: switch open, the chip sits at <b>${fmtV(p.Vchip)}</b>. Each time it closes, the chip drops to <b>${fmtV(p.VchipOn)}</b> for an instant and must keep working through the dips.`
      : 'Right now the chip is asleep, so it cannot flip its switch. Move the card closer in the experiment above.';
    $('#howListen').innerHTML = p.awake
      ? `Right now the reader’s coil runs at <b>${fmtV(p.VantOff)}</b> and each reply moves it by <b>${signed(p.dV, fmtmV)}</b> (${pctAbs(p.dVrel)}). That’s like noticing a 1.8 m tall person grow by ${lengthAnalogy(p.dVrel)}.`
      : `Right now the reader’s coil runs at <b>${fmtV(p.VantOff)}</b> and hears nothing: a sleeping chip can’t reply.`;
  }

  // ------------------------------------------------------------ deep dive 1: distance
  const COLORS = { main: '#e89a0c', ghostTag: '#8f97a8', ghostReader: '#1aa7cc', talk: '#d6457a', field: '#1aa7cc', ok: '#1d9a68', bad: '#d44848' };
  const curveCache = {};
  function distCurve(reader, tag, step) {
    const key = [reader, tag, state.offset.toFixed(4), state.tilt.toFixed(4), state.tuneMHz.toFixed(3), step || 0].join('|');
    if (curveCache[key]) return curveCache[key];
    const ds = [];
    const t0 = R.READERS[reader].surface + R.TAGS[tag].bottom;
    for (let d = t0; d <= 0.15; d += step || 0.0025) ds.push(d);
    const pts = R.ratioVsDistance({ reader, tag, offset: state.offset, tilt: state.tilt, tuneMHz: state.tuneMHz }, ds).map((p) => [p.y * 100, p.ratio]);
    const keys = Object.keys(curveCache); if (keys.length > 24) delete curveCache[keys[0]];
    return (curveCache[key] = pts);
  }
  const name = { terminal: 'shop reader', phone: 'phone', card: 'card', fob: 'fob' };
  function drawDistance() {
    const main = distCurve(state.reader, state.tag);
    const otherTag = state.tag === 'card' ? 'fob' : 'card', otherReader = state.reader === 'terminal' ? 'phone' : 'terminal';
    const g1 = distCurve(state.reader, otherTag, 0.005), g2 = distCurve(otherReader, state.tag, 0.005);
    const awakeBand = [];
    let start = null;
    main.forEach((p, i) => { if (p[1] >= 1 && start === null) start = p[0]; if ((p[1] < 1 || i === main.length - 1) && start !== null) { awakeBand.push({ x0: start, x1: p[0], color: 'rgba(29,154,104,.08)', label: 'chip awake', labelColor: '#1d9a68' }); start = null; } });
    Charts.plot($('#chartDist'), {
      pad: { l: 76 },
      x: { min: 0, max: 15, label: 'distance between coils (cm)' },
      y: { min: 0.001, max: 100, log: true, label: '% of what the chip needs', fmt: (v) => pct(v) },
      bands: awakeBand,
      hlines: [{ y: 1, color: COLORS.ok, label: 'what the chip needs', align: 'left' }],
      series: [
        { pts: g2, color: COLORS.ghostReader, width: 1.6, dash: [6, 5], alpha: 0.75, label: `${name.card === name[state.tag] ? 'card' : 'fob'} + ${name[otherReader]}`, labelAt: Math.floor(g2.length * 0.82) },
        { pts: g1, color: COLORS.ghostTag, width: 1.6, dash: [2, 4], alpha: 0.9, label: `${name[otherTag]} + ${name[state.reader]}`, labelAt: Math.floor(g1.length * 0.6) },
        { pts: main, color: COLORS.main, width: 3.2, fill: 'rgba(255,182,39,.10)' },
      ],
      markers: [{ x: phys.height * 100, y: Math.max(phys.ratio, 0.0011), color: '#18202f', ring: 'rgba(255,182,39,.35)', label: 'now: ' + pct(phys.ratio) }],
    });
    const h = phys.height, far = R.compute(Object.assign({}, state, { dist: 2 * h }));
    const factor = phys.ratio / Math.max(far.ratio, 1e-12);
    const fx = (f) => (f >= 10 ? Math.round(f).toLocaleString('en') : f.toFixed(1));
    let cliff = `At <b>${cm(h)}</b> the chip gets <b>${pct(phys.ratio)}</b> of what it needs. At <b>${cm(2 * h)}</b>: <b>${pct(far.ratio)}</b>. `;
    if (factor >= 1.05) {
      cliff += `Doubling the distance cut the energy by <b>×${fx(factor)}</b>.`;
      if (h < 0.03) cliff += ' (Close up the drop is gentler: the card is not yet “far” compared with the size of the coils.)';
    } else if (factor <= 0.95) {
      cliff += `Strange but true: here, moving <i>away</i> gives the chip <b>×${fx(1 / factor)}</b> more energy. ` +
        (Math.abs(state.offset) > 0.03 ? 'The card is sitting in a dead spot off to the side, and from higher up it escapes it.' : 'The card is so close that it over-couples with the reader (see Tuning).');
    } else cliff += 'Here the energy barely changes with distance.';
    $('#cliffCallout').innerHTML = cliff;
  }
  function drawOffset() {
    const xs = []; for (let x = -0.1; x <= 0.1001; x += 0.0025) xs.push(x);
    const key = [state.reader, state.tag, state.dist.toFixed(4), state.tilt.toFixed(4), state.tuneMHz.toFixed(3)].join('|');
    if (drawOffset.key !== key) { drawOffset.key = key; drawOffset.pts = R.ratioVsOffset(state, xs).map((p) => [p.x * 100, p.ratio]); }
    const pts = drawOffset.pts;
    const ymax = Math.max(10, Math.pow(10, Math.ceil(Math.log10(Math.max.apply(null, pts.map((p) => p[1])) * 1.3))));
    Charts.plot($('#chartOff'), {
      pad: { l: 76 },
      x: { min: -10, max: 10, label: 'sideways from the centre (cm)' },
      y: { min: 0.001, max: ymax, log: true, label: '% needed', fmt: (v) => pct(v) },
      hlines: [{ y: 1, color: COLORS.ok, label: 'needed', align: 'left' }],
      series: [{ pts, color: COLORS.main, width: 3, fill: 'rgba(255,182,39,.10)' }],
      markers: [{ x: state.offset * 100, y: Math.max(phys.ratio, 0.0011), color: '#18202f', ring: 'rgba(255,182,39,.35)', label: pct(phys.ratio) }],
    });
    const flat = R.compute(Object.assign({}, state, { tilt: 0 }));
    const deg = Math.round(state.tilt / DEG);
    $('#tiltLive').innerHTML = deg === 0
      ? `Lying flat at ${cm(phys.height)}, ${(state.offset * 100).toFixed(1)} cm off-centre: <b>${pct(phys.ratio)}</b> of what the chip needs. Try the <i>Tilt</i> slider.`
      : `Tilted ${deg}°: <b>${pct(phys.ratio)}</b> of what the chip needs, compared with <b>${pct(flat.ratio)}</b> lying flat${phys.liftedByTilt ? '. A tilted card also can’t get as close, so it was lifted to ' + cm(phys.height) : ''}.`;
  }
  $('#doubleBtn').addEventListener('click', () => set({ dist: Math.min(0.15, phys.height * 2) }));
  $('#halveBtn').addEventListener('click', () => set({ dist: phys.height / 2 }));
  // find the deepest dip beyond the reader coil's edge, 1 cm above the reader
  $('#deadBtn').addEventListener('click', () => {
    const d = Math.max(0.01, touchingDist());
    const xs = []; for (let x = 0.02; x <= 0.09; x += 0.001) xs.push(x);
    const pts = R.ratioVsOffset(Object.assign({}, state, { dist: d, tilt: 0 }), xs);
    let best = pts[0];
    pts.forEach((p) => { if (p.ratio < best.ratio) best = p; });
    set({ dist: d, tilt: 0, offset: best.x });
  });
  $('#tiltBtn').addEventListener('click', () => set({ tilt: 80 * DEG }));
  $('#flatBtn').addEventListener('click', () => set({ tilt: 0, offset: 0 }));

  // ------------------------------------------------------------ deep dive 2: tuning
  function drawFreq() {
    const fs = []; for (let f = 10e6; f <= 18e6; f += 0.04e6) fs.push(f);
    const pts = R.chipVsFrequency(state, fs).map((p) => [p.f / 1e6, p.v]);
    const at = R.chipVsFrequency(state, [R.F0])[0].v;
    const ymax = Math.max(6, Math.max.apply(null, pts.map((p) => p[1])) * 1.15);
    const tg = R.TAGS[state.tag];
    Charts.plot($('#chartFreq'), {
      x: { min: 10, max: 18, label: 'how fast the reader pushes (MHz)' },
      y: { min: 0, max: ymax, label: 'chip voltage (V)' },
      bands: [{ x0: 10, x1: 18, color: 'rgba(0,0,0,0)' }],
      hlines: [{ y: tg.Von, color: COLORS.ok, label: 'wakes up', align: 'left' }, { y: tg.Vclamp, color: COLORS.bad, label: 'protection limit', align: 'left', dash: [2, 4] }],
      vlines: [{ x: 13.56, color: '#18202f', label: 'reader: 13.56', dash: [3, 3] }, { x: state.tuneMHz, color: COLORS.talk, label: 'card tuned to ' + state.tuneMHz.toFixed(2), dash: [6, 4], dy: -12 }],
      series: [{ pts, color: COLORS.main, width: 3, fill: 'rgba(255,182,39,.12)' }],
      markers: [{ x: 13.56, y: at, color: '#18202f', ring: 'rgba(255,182,39,.35)', label: fmtV(at) + (at > tg.Vclamp ? ' → clipped to 4.5' : '') }],
    });
    const w = 2 * Math.PI * R.F0;
    const emf = w * Math.abs(phys.M) * phys.I1;
    const free = R.chipVsFrequency(Object.assign({}, state, { tuneMHz: 13.56 }), [R.F0])[0].v;
    let txt = `On its own, the card’s coil would make <b>${fmtV(emf)}</b>. Resonance builds that up to <b>${fmtV(at)}</b> at the chip (<b>×${(at / Math.max(emf, 1e-9)).toFixed(1)}</b>).`;
    if (Math.abs(state.tuneMHz - 13.56) > 0.3) txt += ` Tuned to 13.56 MHz it would get ${fmtV(free)}.`;
    $('#tuneLive').innerHTML = txt;
  }
  $('#closeBtn').addEventListener('click', () => set({ dist: 0, offset: 0, tilt: 0 }));
  $('#tuneReset').addEventListener('click', () => set({ tuneMHz: 13.56 }));

  // ------------------------------------------------------------ deep dive 3: switch
  function drawSwitch() {
    const p = phys, tg = R.TAGS[state.tag];
    const svg = $('#circuit');
    svg.classList.toggle('closed', state.hold);
    $('#swLever').setAttribute('d', state.hold ? 'M350 100 L 350 70' : 'M350 100 L 372 76');
    $('#cChip').classList.toggle('on', p.awake);
    $('#cV').textContent = `chip: ${fmtV(state.hold ? p.VchipOn : p.Vchip)} ${p.awake ? '(awake)' : '(asleep)'}`;
    $('#cI').textContent = `current in the card’s coil: ${(p.I2 * 1000).toFixed(1)} mA`;
    $('#switchLive').innerHTML = p.awake
      ? `Switch open: reader coil at <b>${fmtV(p.VantOff)}</b>. Closed: <b>${fmtV(p.VantOn)}</b>. The reply is <b>${signed(p.dV, fmtmV)}</b> (${pctAbs(p.dVrel)}). While talking the chip averages <b>${fmtV(p.Vtalk)}</b> and needs at least ${fmtV(0.85 * tg.Von)} to keep going${p.brownout ? '. <b style="color:#d44848">It starves!</b>' : '.'}`
      : `The chip is asleep at ${cm(p.height)}, so there is no reply at all. Move the card closer.`;
    // reply size vs distance
    const key = [state.reader, state.tag, state.offset.toFixed(4), state.tilt.toFixed(4), state.tuneMHz.toFixed(3), Math.round(state.rmod)].join('|');
    if (drawSwitch.key !== key) {
      drawSwitch.key = key;
      const pts = [], bands = [];
      const t0 = touchingDist();
      let bandStart = null, kind = null;
      for (let d = t0; d <= 0.15; d += 0.0025) {
        const c = R.compute(Object.assign({}, state, { dist: d }));
        const k = !c.awake ? 'sleep' : c.brownout ? 'brown' : 'ok';
        if (k !== kind) {
          if (kind && kind !== 'ok') bands.push({ x0: bandStart, x1: c.height * 100, kind });
          bandStart = c.height * 100; kind = k;
        }
        if (c.awake) pts.push([c.height * 100, Math.max(Math.abs(c.dV) * 1000, 1e-3)]);
      }
      if (kind && kind !== 'ok') bands.push({ x0: bandStart, x1: 15, kind });
      drawSwitch.pts = pts;
      drawSwitch.bands = bands.map((b) => ({ x0: b.x0, x1: b.x1, color: b.kind === 'brown' ? 'rgba(212,72,72,.14)' : 'rgba(100,109,126,.08)', label: b.kind === 'brown' ? 'chip starves' : 'asleep: no reply', labelColor: b.kind === 'brown' ? '#d44848' : '#646d7e' }));
    }
    Charts.plot($('#chartReply'), {
      pad: { l: 64 },
      x: { min: 0, max: 15, label: 'distance between coils (cm)' },
      y: { min: 1, max: 2000, log: true, label: 'reply size (mV)', fmt: (v) => (v >= 1000 ? v / 1000 + ' V' : v + '') },
      bands: drawSwitch.bands,
      series: [{ pts: drawSwitch.pts, color: COLORS.talk, width: 3 }],
      markers: p.awake ? [{ x: p.height * 100, y: Math.abs(p.dV) * 1000, color: '#18202f', ring: 'rgba(214,69,122,.3)', label: fmtmV(p.dV) }] : [],
    });
  }

  // ------------------------------------------------------------ deep dive 4: data
  let detailCenter = 3;   // bit index the magnifier is centred on
  function drawBits(read) {
    const errs = new Set(read && read.heard && read.chk ? read.chk.errorsAt : []);
    const box = $('#bitTable');
    const parts = [];
    frame.bytes.forEach((b, bi) => {
      const isBcc = bi === frame.bytes.length - 1;
      let bits = '';
      for (let i = 0; i < 8; i++) {
        const idx = 1 + bi * 9 + i;
        bits += errs.has(idx) ? `<span class="err">${(b >> i) & 1}</span>` : String((b >> i) & 1);
      }
      const pIdx = 1 + bi * 9 + 8;
      const pv = R.parityOdd(b);
      const ch = isBcc ? 'check byte' : (String.fromCharCode(b) === ' ' ? '␣' : escapeHtml(String.fromCharCode(b)));
      parts.push(`<div class="byte${isBcc ? ' bcc' : ''}"><div class="b-top"><span class="b-ch">${ch}</span><span class="b-num">= ${b}</span></div><div class="b-bits">${bits}<span class="p${errs.has(pIdx) ? ' err' : ''}">${pv}</span></div></div>`);
    });
    box.innerHTML = parts.join('');
  }

  function drawScope(read) {
    const cv = $('#scope');
    const { ctx, w, h } = Charts.fit(cv);
    ctx.fillStyle = '#0f1628'; ctx.fillRect(0, 0, w, h);
    ctx.font = '600 11px Inter, sans-serif'; ctx.textBaseline = 'middle';
    if (!read || !read.heard) {
      ctx.fillStyle = '#c9d4ea'; ctx.textAlign = 'center'; ctx.font = '600 15px Inter, sans-serif';
      ctx.fillText('No reply: the chip is asleep at this distance.', w / 2, h / 2 - 12);
      ctx.font = '13px Inter, sans-serif'; ctx.fillStyle = '#8f9bb6';
      ctx.fillText('Use the button below, or move the card closer in the experiment at the top.', w / 2, h / 2 + 12);
      return;
    }
    const sig = read.sig, nb = frame.bits.length, HALF = R.HALF;
    const bitStart = (b) => (R.IDLE_BEFORE + b) * 2 * HALF;
    const total = sig.total;
    const L = 46, Rr = 10;
    const overviewH = Math.round(h * 0.52), detailTop = overviewH + 18;
    const lanes = { sw: [16, 34], v: [40, overviewH - 34], d: [overviewH - 28, overviewH - 6] };
    // level range for the reader voltage (robust: from the actual samples)
    let vmin = Infinity, vmax = -Infinity;
    for (let i = 0; i < total; i++) { const v = sig.v[i]; if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    const padv = (vmax - vmin) * 0.08 + 1e-9; vmin -= padv; vmax += padv;
    const xOf = (n) => L + (n / total) * (w - L - Rr);

    // bit boundaries + letter labels
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let b = 0; b <= nb; b++) { const x = Math.round(xOf(bitStart(b))) + 0.5; ctx.beginPath(); ctx.moveTo(x, lanes.sw[0]); ctx.lineTo(x, overviewH - 4); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.fillStyle = '#8f9bb6';
    frame.bytes.forEach((byte, bi) => {
      const x0 = xOf(bitStart(1 + bi * 9)), x1 = xOf(bitStart(1 + bi * 9 + 9));
      const isBcc = bi === frame.bytes.length - 1;
      ctx.fillStyle = isBcc ? '#9cc3ea' : '#e8eefb';
      ctx.fillText(isBcc ? 'check' : String.fromCharCode(byte), (x0 + x1) / 2, 7);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.moveTo(x0, 13); ctx.lineTo(x1 - 2, 13); ctx.stroke();
    });
    // lane labels
    ctx.textAlign = 'left'; ctx.fillStyle = '#8f9bb6'; ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('switch', 4, (lanes.sw[0] + lanes.sw[1]) / 2);
    ctx.fillText('reader', 4, (lanes.v[0] + lanes.v[1]) / 2 - 6); ctx.fillText('voltage', 4, (lanes.v[0] + lanes.v[1]) / 2 + 6);
    ctx.fillText('decoded', 4, (lanes.d[0] + lanes.d[1]) / 2);

    // switch lane + voltage lane as per-pixel min/max columns
    const cols = Math.floor(w - L - Rr);
    const Yv = (v) => lanes.v[1] - ((v - vmin) / (vmax - vmin)) * (lanes.v[1] - lanes.v[0]);
    ctx.fillStyle = '#ff6fa3';
    ctx.strokeStyle = '#7fd8f2'; ctx.lineWidth = 1;
    for (let c = 0; c < cols; c++) {
      const n0 = Math.floor((c / cols) * total), n1 = Math.max(n0 + 1, Math.floor(((c + 1) / cols) * total));
      let swOn = 0, mn = Infinity, mx = -Infinity;
      for (let n = n0; n < n1; n++) { swOn += sig.sw[n]; const v = sig.v[n]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const frac = swOn / (n1 - n0);
      if (frac > 0) { ctx.globalAlpha = 0.35 + 0.65 * frac; ctx.fillRect(L + c, lanes.sw[0], 1, lanes.sw[1] - lanes.sw[0]); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.moveTo(L + c + 0.5, Yv(mx)); ctx.lineTo(L + c + 0.5, Yv(mn) + 0.5); ctx.stroke();
    }
    // decoded lane
    for (let b = 0; b < nb; b++) {
      const x0 = xOf(bitStart(b)) + 1, x1 = xOf(bitStart(b + 1)) - 1;
      const sent = frame.bits[b], got = read.dec[b];
      const wrong = got.v !== sent.v;
      ctx.fillStyle = wrong ? '#d44848' : sent.kind === 'parity' ? 'rgba(255,111,163,.28)' : sent.kind === 'sof' ? 'rgba(63,208,240,.3)' : 'rgba(255,255,255,.09)';
      ctx.fillRect(x0, lanes.d[0], Math.max(1, x1 - x0), lanes.d[1] - lanes.d[0]);
      if (x1 - x0 > 9) { ctx.fillStyle = wrong ? '#fff' : '#dce5f7'; ctx.textAlign = 'center'; ctx.font = '700 11px JetBrains Mono, monospace'; ctx.fillText(String(got.v), (x0 + x1) / 2, (lanes.d[0] + lanes.d[1]) / 2 + 0.5); }
    }
    // magnifier window
    const span = 4;
    detailCenter = clamp(detailCenter, 0, nb - 1);
    const b0 = clamp(Math.round(detailCenter - span / 2), 0, Math.max(0, nb - span)), b1 = Math.min(nb, b0 + span);
    const s0 = bitStart(b0), s1 = bitStart(b1);
    ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 2;
    ctx.strokeRect(xOf(s0), lanes.sw[0] - 3, xOf(s1) - xOf(s0), overviewH - lanes.sw[0]);
    // detail view
    const dTop = detailTop, dBot = h - 22, dswB = dTop + 20, dvT = dTop + 28;
    const xD = (n) => L + ((n - s0) / (s1 - s0)) * (w - L - Rr);
    ctx.fillStyle = 'rgba(255,182,39,.07)'; ctx.fillRect(L, dTop - 6, w - L - Rr, h - dTop);
    ctx.fillStyle = '#ffd479'; ctx.textAlign = 'left'; ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(`magnified: bits ${b0 + 1}–${b1} of ${nb}`, L + 4, dTop - 0);
    // detail: half-bit guides with labels
    for (let b = b0; b < b1; b++) {
      const xa = xD(bitStart(b)), xm = xD(bitStart(b) + HALF), xb = xD(bitStart(b + 1));
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(xa) + 0.5, dTop + 6); ctx.lineTo(Math.round(xa) + 0.5, dBot); ctx.stroke();
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(Math.round(xm) + 0.5, dTop + 6); ctx.lineTo(Math.round(xm) + 0.5, dBot); ctx.stroke(); ctx.setLineDash([]);
      const sent = frame.bits[b], got = read.dec[b];
      ctx.textAlign = 'center'; ctx.font = '700 12px JetBrains Mono, monospace';
      ctx.fillStyle = got.v !== sent.v ? '#ff8f8f' : '#dce5f7';
      const kindTxt = sent.kind === 'sof' ? 'start' : sent.kind === 'parity' ? 'check bit' : 'bit';
      ctx.fillText(`${kindTxt} ${sent.v}${got.v !== sent.v ? ' → read ' + got.v : ''}`, (xa + xb) / 2, dBot + 11);
    }
    // detail traces
    ctx.fillStyle = '#ff6fa3';
    for (let n = s0; n < s1; n++) if (sig.sw[n]) ctx.fillRect(xD(n), dTop + 8, Math.max(1, xD(n + 1) - xD(n)), dswB - dTop - 8);
    const YvD = (v) => dBot - 6 - ((v - vmin) / (vmax - vmin)) * (dBot - 6 - dvT);
    ctx.strokeStyle = '#7fd8f2'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let n = s0; n < s1; n++) { const x = xD(n + 0.5), y = YvD(sig.v[n]); if (n === s0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    // volts scale note
    ctx.textAlign = 'right'; ctx.fillStyle = '#8f9bb6'; ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText(`height of the voltage lane = ${fmtmV(vmax - vmin)}`, w - Rr, overviewH + 4);
  }

  function drawVerdict(read) {
    const v = $('#verdict');
    if (!read || !read.heard) {
      v.innerHTML = `<span class="v-main bad">No reply</span><span>The chip is asleep at ${cm(phys.height)}.</span><button type="button" class="btn small" id="goodDist">Move the card to 3 cm</button>`;
      $('#goodDist').addEventListener('click', () => { set({ dist: 0.03, tilt: 0, offset: 0 }); newScopeRead(); });
      return;
    }
    if (read.brownout) {
      v.innerHTML = `<span class="v-main bad">✗ Reply cut off</span><span>The chip ran out of energy while its switch was closed. Weaken the switch (Deep dive 3) or move closer.</span>`;
      return;
    }
    const c = read.chk;
    const badBytes = c.parityOk.map((ok, i) => (ok ? null : i === frame.bytes.length - 1 ? 'check byte' : `“${String.fromCharCode(frame.bytes[i])}”`)).filter(Boolean);
    const parts = [];
    if (c.passed && c.correct) parts.push('<span class="v-main ok">✓ Accepted</span>');
    else if (c.passed) parts.push('<span class="v-main warn">⚠ Accepted, but wrong!</span>');
    else parts.push('<span class="v-main bad">✗ Rejected</span>');
    parts.push(`<span>Read as <span class="v-text">${escapeHtml(c.text)}</span></span>`);
    parts.push(`<span><b>${c.bitErrors}</b> of ${frame.bits.length} bits wrong</span>`);
    if (!c.passed) {
      const why = [];
      if (!c.sofOk) why.push('the start bit was wrong');
      if (badBytes.length) why.push('check bits failed for ' + badBytes.join(', '));
      if (!c.bccOk) why.push('the check byte did not match');
      parts.push(`<span>Caught because ${why.join('; ')}. The reader just asks again.</span>`);
    } else if (!c.correct) parts.push('<span>Two errors cancelled out in the checks. Real cards add a stronger check (CRC) for longer messages.</span>');
    v.innerHTML = parts.join('');
  }

  function drawData() {
    const read = state.paused ? scopeRead : (phys.awake ? scopeRead || lastRead : { heard: false });
    if (read && read.heard && read.sig && read.dec.length !== frame.bits.length) { newScopeRead(); return; }
    drawBits(read);
    drawScope(read);
    drawVerdict(read);
  }
  $('#pauseBtn').addEventListener('click', () => { set({ paused: !state.paused }); });
  $('#nextBtn').addEventListener('click', () => { newScopeRead(); drawData(); });
  $('#mcBtn').addEventListener('click', () => {
    const out = $('#mcOut');
    if (!phys.awake) { out.innerHTML = 'The chip is asleep at this distance, so nothing can be read.'; return; }
    const s = R.successRate(frame, phys, nz(), state.mode, 500, (Math.random() * 1e9) | 0);
    const heard = s.ok + s.caught + s.undetected;
    out.innerHTML = phys.brownout
      ? 'Every reply was cut off: the chip starves while talking.'
      : `<b>${s.ok}</b> accepted ✓ · <b>${s.caught}</b> rejected and asked again · <b>${s.undetected}</b> slipped through wrong · bit error rate <b>${(s.ber * 100).toFixed(s.ber < 0.001 ? 3 : 2)}%</b>` + (heard < 500 ? '' : '');
  });
  const scopeEl = $('#scope');
  const moveMagnifier = (e) => {
    const r = scopeEl.getBoundingClientRect();
    if (e.clientY - r.top > r.height * 0.55) return;
    const L = 46, Rr = 10;
    const frac = clamp((e.clientX - r.left - L) / (r.width - L - Rr), 0, 1);
    const total = (frame.bits.length + R.IDLE_BEFORE + R.IDLE_AFTER) * 2 * R.HALF;
    detailCenter = (frac * total) / (2 * R.HALF) - R.IDLE_BEFORE;
    drawData();
  };
  scopeEl.addEventListener('pointermove', moveMagnifier);
  scopeEl.addEventListener('pointerdown', moveMagnifier);

  // ------------------------------------------------------------ questions
  function updateQuestions() {
    if (!updateQuestions.done) {
      const ePhone = findEdge({ reader: 'phone', tag: 'card', offset: 0, tilt: 0, tuneMHz: 13.56, rmod: state.rmod });
      const eShop = findEdge({ reader: 'terminal', tag: 'card', offset: 0, tilt: 0, tuneMHz: 13.56, rmod: state.rmod });
      $('#qPhone').textContent = ePhone ? cm(ePhone) : '—';
      $('#qShop').textContent = eShop ? cm(eShop) : '—';
      updateQuestions.done = true;
    }
    const d = +$('#spy').value / 100;
    $('#spyOut').textContent = d >= 1 ? d.toFixed(2) + ' m' : Math.round(d * 100) + ' cm';
    const need = R.currentNeeded({ reader: 'terminal', tag: 'card', tuneMHz: 13.56 }, d).scale;
    $('#spyLive').innerHTML = `…<b>${d >= 1 ? d.toFixed(2) + ' m' : Math.round(d * 100) + ' cm'}</b> away needs about <b>${fmtBig(need)}×</b> the current in its coil, which means about <b>${fmtBig(need * need)}×</b> the power.`;
    paintRange($('#spy'));
  }
  $('#spy').addEventListener('input', updateQuestions);
  $$('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.show;
    if (k === 'phone') set({ reader: 'phone', tag: 'card', tilt: 0, offset: 0, dist: 0.03 });
    if (k === 'tilt') set({ reader: 'terminal', tag: 'card', tilt: 75 * DEG, offset: 0, dist: 0.04 });
    if (k === 'fob') set({ reader: 'terminal', tag: 'fob', tilt: 0, offset: 0, dist: 0.045 });
    $('#lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ------------------------------------------------------------ under the hood
  function buildHood() {
    const w0 = 2 * Math.PI * R.F0;
    const rows = [];
    rows.push('<tr><th>Device</th><th>Coil</th><th>Turns</th><th>Inductance</th><th>Tuning capacitor</th><th>Quality factor Q</th><th>Notes</th></tr>');
    ['terminal', 'phone'].forEach((id) => {
      const m = R.readerModel(id), s = R.READERS[id];
      const size = s.coil.shape === 'circle' ? `ring ⌀ ${(s.coil.w * 1000).toFixed(0)} mm` : `${(s.coil.w * 1000).toFixed(0)} × ${(s.coil.h * 1000).toFixed(0)} mm`;
      rows.push(`<tr><td>${s.name}</td><td class="num">${size}</td><td class="num">${s.coil.turns}</td><td class="num">${(m.L * 1e6).toFixed(2)} µH</td><td class="num">${(m.C * 1e12).toFixed(0)} pF</td><td class="num">${s.Q}</td><td>drive ${(s.Inom * 1000).toFixed(0)} mA</td></tr>`);
    });
    ['card', 'fob'].forEach((id) => {
      const m = R.tagModel(id), s = R.TAGS[id];
      const C = 1 / (w0 * w0 * m.L);
      rows.push(`<tr><td>${s.name}</td><td class="num">${(s.coil.w * 1000).toFixed(1)} × ${(s.coil.h * 1000).toFixed(1)} mm</td><td class="num">${s.coil.turns}</td><td class="num">${(m.L * 1e6).toFixed(2)} µH</td><td class="num">${C * 1e12 >= 10 ? (C * 1e12).toFixed(0) : (C * 1e12).toFixed(1)} pF</td><td class="num">${(s.RL / (w0 * m.L)).toFixed(1)}</td><td>chip ${fmtOhm(s.RL)}</td></tr>`);
    });
    $('#paramTable').innerHTML = rows.join('');
    const t = R.selfTest();
    $('#selfTest').innerHTML = `Self-check, run just now in your browser: for two coaxial test loops (radii 33 and 30 mm, 30 mm apart) the method above gives <b>${(t.numeric * 1e9).toFixed(3)} nH</b>. James Clerk Maxwell’s exact formula gives <b>${(t.exact * 1e9).toFixed(3)} nH</b>, a difference of ${t.errorPct.toFixed(2)}% (the test loops are 72-sided polygons, not perfect circles).`;
  }

  // ------------------------------------------------------------ tooltips
  const tip = $('#tip');
  function showTip(t) {
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const r = t.getBoundingClientRect(), tw = Math.min(300, window.innerWidth - 24);
    tip.style.maxWidth = tw + 'px';
    const x = clamp(r.left + r.width / 2 - tw / 2, 12, window.innerWidth - tw - 12);
    tip.style.left = x + 'px';
    const below = r.bottom + 10, th = tip.offsetHeight;
    tip.style.top = (below + th > window.innerHeight - 8 ? r.top - th - 10 : below) + 'px';
  }
  $$('.term').forEach((t) => {
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', t.textContent + ': ' + t.dataset.tip);
    t.addEventListener('mouseenter', () => showTip(t));
    t.addEventListener('mouseleave', () => { tip.hidden = true; });
    t.addEventListener('focus', () => showTip(t));
    t.addEventListener('blur', () => { tip.hidden = true; });
    t.addEventListener('click', (e) => { e.preventDefault(); if (tip.hidden) showTip(t); else tip.hidden = true; });
  });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  // ------------------------------------------------------------ render scheduling
  let uiQueued = false, lastHeavy = 0, heavyTimer = 0;
  function scheduleUI() { if (!uiQueued) { uiQueued = true; requestAnimationFrame(renderUI); } }
  function renderUI() {
    uiQueued = false;
    updateLab();
    if (visible.how) updateHow();
    // heavier charts: at most ~8 times a second while dragging, plus a final redraw
    const now = performance.now();
    const heavy = () => {
      lastHeavy = performance.now();
      if (visible.power) { drawDistance(); drawOffset(); }
      if (visible.tuning) drawFreq();
      if (visible.switch) drawSwitch();
      if (visible.data) drawData();
      if (visible.questions) updateQuestions();
    };
    clearTimeout(heavyTimer);
    if (now - lastHeavy > 120) heavy(); else heavyTimer = setTimeout(heavy, 130);
  }

  // continuous loop for the strip chart and missions
  function loop(t) {
    if (visible.lab && !document.hidden) {
      stripPush();
      drawStrip();
      missionTick(t);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { drawOffset.key = null; scheduleUI(); });

  // ------------------------------------------------------------ public API (for the 3D view)
  window.App = {
    get state() { return state; }, get phys() { return phys; }, get lastRead() { return lastRead; },
    set, on, touchingDist, hideHint,
    sceneStatus(s) {
      $('#stageLoading').hidden = true;
      if (s === 'failed') $('#stageFallback').hidden = false;
    },
  };

  // start
  syncInputs();
  buildHood();
  renderScreen();
  scheduleUI();
  requestAnimationFrame(loop);
  // if the 3D module never reports back (blocked network, very old browser)
  setTimeout(() => { if (!$('#stageLoading').hidden) { $('#stageLoading').hidden = true; $('#stageFallback').hidden = false; } }, 20000);
})();
