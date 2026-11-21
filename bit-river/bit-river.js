import { CARD_MODEL_WIDTH, CARD_VIEW_WIDTH, cardPose, clamp, ease, replyFront, riverGeometry, sizeCanvas, drawField, drawTraffic } from './river.js';

const file = name => new URL(name, import.meta.url).href;
const chapters = [
  { name: 'Approach', at: 0, title: 'Inside a tap.', route: 'Reader → card' },
  { name: 'Reveal', at: .22, title: 'The field forms.', route: 'Inductive coupling' },
  { name: 'Connect', at: .55, title: 'A quiet reply.', route: 'Card → reader', copy: 'The card changes its antenna load.' },
  { name: 'Transmit', at: .77, title: 'Read the river.', route: 'Inspect a packet' }
];
const packets = [
  { label: 'ID', value: '04 7B 21 9E' },
  { label: 'Auth', value: '8A 2F' },
  { label: 'Data', value: 'Gallery pass' }
];
const startingPhases = [.22, .51, .80];
const packetSpeed = .034;
const sparks = Array.from({ length: 10 }, (_, i) =>
  `<i style="--angle:${i * 36}deg;--delay:${i % 3 * 35}ms"></i>`).join('');
const icons = {
  brand: '<path d="M2 19C10 19 8 5 16 5s6 18 16 18M2 14C9 14 9 2 16 2s9 16 16 16M2 24c10 0 8-14 14-14s5 18 16 18"/>',
  sound: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path class="mute" d="m16 9 5 6m0-6-5 6"/><path class="waves" d="M15.5 8a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/>',
  down: '<path d="M12 4v15m-6-6 6 6 6-6"/>',
  replay: '<path d="M5 10a7 7 0 1 1 1 7m-1-7V5m0 5h5"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>'
};
function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 ${name === 'brand' ? '34 30' : '24 24'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

function mount(host, root, signal) {
  root.innerHTML = `
    <link rel="stylesheet" href="${file('bit-river.css')}">
    <section class="frame" aria-label="Bit River interactive RFID transmission">
      <header class="mast">
        <div class="identity">${icon('brand')}<strong>Bit River</strong></div>
        <div class="tools">
          <button class="pause" type="button" hidden>${icon('pause')}<span>Pause flow</span></button>
          <button class="sound" type="button" aria-pressed="false">${icon('sound')}<span>Sound off</span></button>
        </div>
      </header>
      <div class="scene">
        <div class="copy" aria-live="polite" aria-atomic="true"><h2></h2><p></p></div>
        <div class="plot">
          <canvas class="field" aria-hidden="true"></canvas>
          <canvas class="traffic" aria-hidden="true"></canvas>
          <div class="device card" aria-hidden="true">
            <img class="poster" src="${file('assets/card.webp')}" alt="">
            <canvas class="model"></canvas>
          </div>
          <div class="device reader" aria-hidden="true"><img src="${file('assets/reader.webp')}" alt=""></div>
          <span class="device-label tag-label">Card</span>
          <span class="device-label reader-label">Reader <span class="connected" hidden>Connected</span></span>
          <div class="packets" role="group" aria-label="Simulated packets" inert>
            ${packets.map(p => `<button type="button" class="packet" aria-label="Inspect ${p.label} packet"
                aria-pressed="false" aria-controls="reading" aria-keyshortcuts="Delete" style="opacity:0" inert>
              <span class="packet-surface" aria-hidden="true"></span>
              <span class="packet-sparks" aria-hidden="true">${sparks}</span>
              <span class="packet-face"><i aria-hidden="true"></i>${p.label}</span>
              <span class="packet-value" aria-hidden="true">${p.value}</span>
            </button>`).join('')}
          </div>
        </div>
        <aside class="readout" id="reading" tabindex="-1" aria-label="Packet readout">
          <div class="direction"><span class="legend-stroke" aria-hidden="true"></span><span class="legend-name"></span></div>
          <div class="route"></div>
          <button class="lift" type="button" hidden>Lift packet</button>
        </aside>
        <span class="sr announcement" role="status"></span>
      </div>
      <footer class="navigation">
        <nav aria-label="Transmission chapters">
          ${chapters.map((c, i) => `<button type="button" data-chapter="${i}"><span>0${i + 1}</span><b>${c.name}</b></button>`).join('')}
        </nav>
        <button type="button" class="advance"></button>
      </footer>
    </section>`;

  const $ = s => root.querySelector(s);
  const frame = $('.frame'), plot = $('.plot'), model = $('.model');
  const nodes = [...root.querySelectorAll('.packet')];
  const stops = [...root.querySelectorAll('[data-chapter]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fades = new Map();
  let reduced = motion.matches;
  const phases = [...startingPhases];
  const arrivals = [0, 0, 0];
  const glints = nodes.map(() => ({ x: 50, y: 50, targetX: 50, targetY: 50 }));
  let geometry, ink, bits, drawCard, audio, drag, replacement, returning, noticeTimer;
  let chapter = -1, selected = -1, missing = -1;
  let restored = false;
  let progress = 0, zoom = 0, clock = 0, lastTime, raf = 0;
  let visible = false, paused = false, sound = false, dirty = true, loadStarted = false, connected = false;
  const on = (target, event, fn, options = {}) => target.addEventListener(event, fn, { ...options, signal });

  function tone(frequency, end, seconds) {
    if (!sound || audio?.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + seconds);
    gain.gain.setValueAtTime(.065, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + seconds);
  }
  on($('.sound'), 'click', async () => {
    sound = !sound;
    if (sound) {
      try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        await audio.resume();
      } catch { sound = false; }
    }
    if (signal.aborted) return;
    $('.sound').setAttribute('aria-pressed', String(sound));
    $('.sound span').textContent = sound ? 'Sound on' : 'Sound off';
    if (connected && sound) tone(1100, 1600, .24);
  });

  // Retarget the same fade when scroll or pointer input changes the next line.
  function fadeText(node, value) {
    const running = fades.get(node);
    if ((running?.value ?? node.textContent) === value) return;
    const opacity = running ? Number(getComputedStyle(node).opacity) : 1;
    running?.animation.cancel();
    fades.delete(node);
    if (!visible || motion.matches || !node.animate) {
      node.textContent = value;
      return;
    }

    function enter(from) {
      node.textContent = value;
      if (!value) return;
      const animation = node.animate([{ opacity: from }, { opacity: 1 }], {
        duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)'
      });
      fades.set(node, { animation, value });
      animation.onfinish = () => {
        if (fades.get(node)?.animation === animation) fades.delete(node);
      };
    }

    if (!node.textContent || node.textContent === value) {
      enter(node.textContent ? opacity : 0);
      return;
    }
    const animation = node.animate([{ opacity }, { opacity: 0 }], {
      duration: 85, easing: 'ease-in', fill: 'forwards'
    });
    fades.set(node, { animation, value });
    animation.onfinish = () => {
      if (fades.get(node)?.animation !== animation) return;
      fades.delete(node);
      animation.cancel();
      enter(0);
    };
  }

  function clearRestored() {
    clearTimeout(noticeTimer);
    restored = false;
  }

  function showReading() {
    const notice = missing >= 0 ? 'Packet missing' : restored ? 'Packet replaced' : '';
    const packet = chapter === 3 && !notice ? packets[selected] : undefined;
    $('.readout').classList.toggle('warning', missing >= 0);
    $('.lift').hidden = !packet;
    fadeText($('.legend-name'), packet ? packet.label + ' · Simulated' : '');
    fadeText($('.route'), notice || packet?.value || chapters[chapter].route);
  }
  function inspect(index) {
    if (missing >= 0 || selected === index) return;
    clearRestored();
    selected = index;
    nodes.forEach((n, i) => n.classList.toggle('selected', i === index));
    showReading();
    $('.announcement').textContent = packets[index].label + '. Simulated value ' + packets[index].value + '.';
  }
  function resetPackets() {
    clearTimeout(replacement);
    clearRestored();
    drag = returning = null;
    missing = selected = -1;
    nodes.forEach((node, i) => {
      node.classList.remove('missing', 'selected', 'held', 'peek');
      node.setAttribute('aria-pressed', 'false');
      glints[i].targetX = glints[i].targetY = 50;
    });
    $('.announcement').textContent = '';
  }
  function setChapter(index) {
    if (chapter === index) return;
    if (chapter === 3) resetPackets();
    chapter = index;
    frame.dataset.chapter = index;
    fadeText($('.copy h2'), chapters[index].title);
    fadeText($('.copy p'), chapters[index].copy ?? '');
    $('.packets').inert = index !== 3;
    stops.forEach((stop, i) => {
      if (i === index) stop.setAttribute('aria-current', 'step');
      else stop.removeAttribute('aria-current');
    });
    const last = index === chapters.length - 1;
    const label = last ? 'Replay' : index === 0 ? 'Explore' : 'Next';
    $('.advance').innerHTML = `<span>${label}</span>` + icon(last ? 'replay' : 'down');
    showReading();
  }
  function go(index) {
    const travel = host.offsetHeight - frame.offsetHeight;
    const top = window.scrollY + host.getBoundingClientRect().top + travel * (chapters[index].at + (index ? .025 : 0));
    window.scrollTo({ top, behavior: motion.matches ? 'instant' : 'smooth' });
  }
  stops.forEach((stop, i) => on(stop, 'click', () => go(i)));
  on($('.advance'), 'click', () => go((chapter + 1) % chapters.length));
  on($('.pause'), 'click', () => {
    paused = !paused;
    $('.pause').innerHTML = icon(paused ? 'play' : 'pause') + '<span>' + (paused ? 'Resume flow' : 'Pause flow') + '</span>';
    wake();
  });

  function scrollProgress() {
    const travel = Math.max(1, host.offsetHeight - frame.offsetHeight);
    return clamp(-host.getBoundingClientRect().top / travel);
  }

  function chapterAt(scroll) {
    return chapters.findLastIndex(chapter => scroll >= chapter.at);
  }

  function measure(scroll) {
    const w = plot.clientWidth, h = plot.clientHeight;
    if (!w || !h) return null;
    const compact = w <= 520 || (w <= 680 && frame.clientHeight > 450);
    const zoom = motion.matches ? [0, .45, 1, 1][chapterAt(scroll)] : ease(.03, .69, scroll);
    const push = motion.matches ? 0 : ease(.01, .22, scroll) * (1 - ease(.26, .55, scroll));
    const cardWidth = Math.min(w * (compact ? .62 : .39), h * (compact ? .99 : .95), 640) * (1 - .40 * zoom + push * .42);
    return { geometry: riverGeometry(w, h, zoom, compact), zoom, cardWidth };
  }

  function getCardTarget({ atEntry = false } = {}) {
    const scene = measure(atEntry ? 0 : scrollProgress());
    if (!scene) return null;
    const { tag } = scene.geometry;
    const { left, top, right, bottom } = plot.getBoundingClientRect();
    const offset = atEntry ? frame.getBoundingClientRect().top : 0;
    return {
      x: left + tag.x, y: top + tag.y - offset,
      size: scene.cardWidth * CARD_MODEL_WIDTH / CARD_VIEW_WIDTH,
      ...cardPose(scene.zoom),
      clip: { left, top: top - offset, right, bottom: bottom - offset }
    };
  }

  function layout() {
    progress = scrollProgress();
    $('.pause').hidden = progress <= .06 || motion.matches;
    setChapter(chapterAt(progress));
    const received = replyFront(progress) === 1;
    if (received && !connected) tone(1100, 1600, .34);
    connected = received;
    $('.connected').hidden = !connected;
    const scene = measure(progress);
    if (!scene) return;
    const { w, h, compact, reader, tag } = scene.geometry;
    if (!geometry || w !== geometry.w || h !== geometry.h || compact !== geometry.compact) {
      ink = sizeCanvas($('.field'), w, h, compact);
      bits = sizeCanvas($('.traffic'), w, h, compact);
    }
    zoom = scene.zoom;
    geometry = scene.geometry;
    const readerWidth = Math.min(w * (compact ? .36 : .245), h * .56, 350) * (1 - .24 * zoom);
    for (const [name, center, width] of [['tag', tag, scene.cardWidth], ['reader', reader, readerWidth]]) {
      plot.style.setProperty('--' + name + '-x', center.x + 'px');
      plot.style.setProperty('--' + name + '-y', center.y + 'px');
      plot.style.setProperty('--' + name + '-w', width + 'px');
    }
    if (host.hasAttribute('data-external-card')) host.dispatchEvent(new Event('bit-river-card-layout'));
    else drawCard?.(zoom);
  }
  function packetPhase(i) {
    if (returning?.i !== i) return phases[i];
    const elapsed = clock - returning.start;
    return ((returning.phase + elapsed * packetSpeed) * ease(0, 1.1, elapsed)) % 1;
  }
  function positionPacket(i, phase = packetPhase(i)) {
    const t = geometry.compact ? .12 + phase * .76 : phase;
    return geometry.point(t, (i - 1) * .88, reduced ? 0 : clock);
  }
  function updateGlint(node, light, dt) {
    const { x, y } = light;
    const blend = 1 - Math.exp(-dt * 20);
    const goalX = reduced ? 50 : light.targetX;
    const goalY = reduced ? 50 : light.targetY;
    light.x = reduced || Math.abs(goalX - x) < .25 ? goalX : x + (goalX - x) * blend;
    light.y = reduced || Math.abs(goalY - y) < .25 ? goalY : y + (goalY - y) * blend;
    if (x !== light.x || y !== light.y) {
      node.style.setProperty('--glint-x', light.x.toFixed(1) + '%');
      node.style.setProperty('--glint-y', light.y.toFixed(1) + '%');
      node.style.setProperty('--pitch', ((50 - light.y) * .13).toFixed(2) + 'deg');
      node.style.setProperty('--yaw', ((light.x - 50) * .15).toFixed(2) + 'deg');
    }
    return light.x !== goalX || light.y !== goalY;
  }
  function updatePackets(dt, moving) {
    let settling = false;
    const blend = 1 - Math.exp(-dt * 12);
    nodes.forEach((node, i) => {
      const focused = root.activeElement === node && node.matches(':focus-visible');
      const held = drag?.i === i;
      const target = missing === i ? 0 : ease(.63 + i * .021, .82 + i * .024, progress);
      const difference = target - arrivals[i];
      arrivals[i] = reduced || missing === i || Math.abs(difference) < .004
        ? target : arrivals[i] + difference * blend;
      if (progress < .58 && !arrivals[i]) phases[i] = startingPhases[i];
      if (moving && progress > .63 && !focused) {
        phases[i] = (phases[i] + dt * packetSpeed) % 1;
      }
      const phase = packetPhase(i);
      const envelope = focused || held || reduced ? 1 : ease(.03, .17, phase) * (1 - ease(.86, .99, phase));
      const presence = arrivals[i] * envelope;
      node.style.opacity = presence.toFixed(3);
      node.style.setProperty('--arrival', presence.toFixed(3));
      node.inert = missing === i || (!focused && !held && presence < .18);
      if (presence && !held) place(node, positionPacket(i, phase));
      if (updateGlint(node, glints[i], dt) || arrivals[i] !== target) settling = true;
    });
    return settling;
  }
  function tick(now) {
    raf = 0;
    if (motion.matches !== reduced) {
      reduced = motion.matches;
      dirty = true;
      lastTime = undefined;
    }
    const redraw = dirty;
    if (redraw) { dirty = false; layout(); }
    if (!geometry || !visible || document.hidden) { lastTime = undefined; return; }
    const moving = !motion.matches && !paused && progress > .06;
    const dt = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, .05);
    if (moving) clock += dt;
    const fieldClock = reduced ? 0 : clock;
    if (redraw || (moving && replyFront(progress))) drawField(ink, geometry, zoom, progress, fieldClock);
    if (redraw || moving) drawTraffic(bits, geometry, progress, fieldClock);
    if (returning && (clock - returning.start >= 1.1 || reduced)) returning = null;
    const settling = updatePackets(dt, moving);
    lastTime = moving || settling ? now : undefined;
    if (lastTime !== undefined) wake();
  }
  function place(node, { x, y }) {
    node.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
  }
  function wake() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function refresh() { dirty = true; wake(); }
  on(window, 'scroll', refresh, { passive: true });
  // The existing hero listens for arrow keys on window. Keep native scrolling
  // available when a visitor has moved focus into this chapter.
  on(root, 'keydown', event => { if (event.key.startsWith('Arrow')) event.stopPropagation(); });
  on(document, 'visibilitychange', () => { lastTime = undefined; refresh(); });
  on(motion, 'change', () => {
    if (motion.matches) {
      for (const [node, { animation, value }] of fades) {
        animation.cancel();
        node.textContent = value;
      }
      fades.clear();
    }
    refresh();
  });
  on(window, 'focus', refresh);
  const resize = new ResizeObserver(refresh);
  resize.observe(plot);
  resize.observe(host);
  function loadCardVisual() {
    if (!visible || loadStarted || host.hasAttribute('data-external-card')) return;
    loadStarted = true;
    import('./card.js').then(module => module.loadCard(model, signal)).then(render => {
      if (!render || signal.aborted) return;
      drawCard = render;
      drawCard(zoom);
      $('.card').classList.add('live');
    }).catch(() => { /* The poster stays visible when WebGL is unavailable. */ });
  }
  const view = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    lastTime = undefined;
    refresh();
    loadCardVisual();
  });
  view.observe(host);
  on(model, 'webglcontextlost', () => { drawCard = null; $('.card').classList.remove('live'); });

  function steal(i) {
    if (chapter !== 3 || missing >= 0 || i < 0) return;
    const restoreFocus = (root.activeElement === nodes[i] || root.activeElement === $('.lift')) &&
      root.activeElement.matches(':focus-visible');
    if (restoreFocus) $('.readout').focus({ preventScroll: true });
    clearRestored();
    missing = i;
    selected = -1;
    nodes[i].classList.remove('selected', 'peek');
    nodes[i].setAttribute('aria-pressed', 'false');
    nodes[i].classList.add('missing');
    showReading();
    $('.announcement').textContent = 'Packet missing. Sending a replacement.';
    tone(420, 180, .23);
    replacement = setTimeout(() => {
      missing = -1;
      // Rejoin the original slot so a replacement cannot drift on top of another packet forever.
      if (!motion.matches && !paused && !restoreFocus) returning = { i, start: clock, phase: phases[i] };
      nodes[i].classList.remove('missing');
      if (restoreFocus && root.activeElement === $('.readout')) {
        selected = i;
        nodes[i].classList.add('selected');
        nodes[i].inert = false;
        nodes[i].focus({ preventScroll: true });
      }
      restored = true;
      showReading();
      $('.announcement').textContent = packets[i].label + ' packet replaced.';
      noticeTimer = setTimeout(() => {
        restored = false;
        showReading();
      }, 1100);
      wake();
    }, 1500);
    wake();
  }
  on($('.lift'), 'click', () => steal(selected));
  nodes.forEach((node, i) => {
    let dragged = false;
    const light = glints[i];
    function aimLight(event) {
      if (event.pointerType !== 'mouse' || reduced || drag) return;
      const rect = node.getBoundingClientRect();
      light.targetX = clamp((event.clientX - rect.left) / rect.width) * 100;
      light.targetY = clamp((event.clientY - rect.top) / rect.height) * 100;
      wake();
    }
    on(node, 'pointerenter', event => {
      if (event.pointerType === 'mouse' && !drag && missing < 0) {
        node.classList.add('peek');
        aimLight(event);
        inspect(i);
      }
    });
    on(node, 'pointerleave', () => {
      node.classList.remove('peek');
      light.targetX = light.targetY = 50;
      wake();
    });
    on(node, 'focus', () => inspect(i));
    on(node, 'click', event => {
      if (missing >= 0 || (dragged && event.detail)) return;
      const pin = node.getAttribute('aria-pressed') === 'false';
      nodes.forEach((packet, index) => packet.setAttribute('aria-pressed', String(pin && index === i)));
      inspect(i);
    });
    on(node, 'keydown', event => {
      if (event.key === 'Delete') { event.preventDefault(); steal(i); }
    });
    on(node, 'pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || missing >= 0 || drag) return;
      dragged = false;
      inspect(i);
      drag = { i, id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: positionPacket(i) };
      node.setPointerCapture(event.pointerId);
    });
    on(node, 'pointermove', event => {
      if (!drag) { aimLight(event); return; }
      if (drag.id !== event.pointerId || drag.i !== i) return;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 5 && !drag.position) return;
      drag.position = { x: drag.origin.x + dx, y: drag.origin.y + dy };
      node.classList.add('held');
      place(node, drag.position);
    });
    function release(event) {
      if (drag?.id !== event.pointerId || drag.i !== i) return;
      const { position } = drag;
      drag = null;
      dragged = Boolean(position);
      node.classList.remove('held');
      if (event.type === 'pointerup' && position && !geometry.contains(position.x, position.y, reduced ? 0 : clock)) steal(i);
      wake();
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) on(node, event, release);
  });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    clearTimeout(replacement);
    clearRestored();
    for (const { animation } of fades.values()) animation.cancel();
    fades.clear();
    view.disconnect();
    resize.disconnect();
    audio?.close();
  }, { once: true });
  setChapter(0);
  return { getCardTarget, updateCardMode() { refresh(); loadCardVisual(); } };
}

class RFIDBitRiver extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    this.cardView = mount(this, this.shadowRoot || this.attachShadow({ mode: 'open' }), this.controller.signal);
  }
  disconnectedCallback() { this.controller.abort(); }
  getCardTarget(options) { return this.cardView?.getCardTarget(options) ?? null; }
  setExternalCard(active) {
    this.toggleAttribute('data-external-card', active);
    this.cardView?.updateCardMode();
  }
}
customElements.define('rfid-bit-river', RFIDBitRiver);
