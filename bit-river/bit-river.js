import { CARD_MODEL_WIDTH, CARD_VIEW_WIDTH, cardPose, clamp, ease, replyFront, riverGeometry, sizeCanvas, drawField, drawTraffic } from './river.js';

const file = name => new URL(name, import.meta.url).href;
const chapters = [
  { name: 'Approach', at: 0, title: 'Inside a tap.', copy: 'This contactless card has no battery. The reader’s field gives its chip enough energy to answer.' },
  { name: 'Reveal', at: .22, title: 'Look closer.', copy: "You're not supposed to see this... But just this once, we'll make an exception. 👀" },
  { name: 'Connect', at: .55, title: 'A quiet reply.', copy: 'The chip changes the electrical load on its antenna. The reader detects tiny changes in its field and reads them as bits.' },
  { name: 'Transmit', at: .77, title: 'Read the river.', copy: 'An ID, an authentication reply, a gallery pass. These simulated packets let you see what a tag might send back.' }
];
const packets = [
  { label: 'ID', value: '04 7B 21 9E', meaning: 'An example identifier for this tag.' },
  { label: 'Auth', value: '8A 2F', meaning: 'A fictional authentication response.' },
  { label: 'Data', value: 'Gallery pass', meaning: 'An example entry stored on the tag.' }
];
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
        <div class="identity">${icon('brand')}<strong>Bit River</strong><span>RFID field guide</span></div>
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
          <span class="device-label tag-label">Passive tag</span>
          <span class="device-label reader-label">RFID reader <span class="connected" hidden>Connected</span></span>
          <div class="packets" role="group" aria-label="Simulated packets" hidden>
            ${packets.map(p => `<button type="button" class="packet" aria-label="Inspect ${p.label} packet"
                aria-pressed="false" aria-controls="reading" aria-keyshortcuts="Delete">
              <span class="packet-sparks" aria-hidden="true">${sparks}</span>
              <span class="packet-face"><i aria-hidden="true"></i>${p.label}</span>
              <span class="packet-value" aria-hidden="true">${p.value}</span>
            </button>`).join('')}
          </div>
        </div>
        <aside class="readout" id="reading" tabindex="-1">
          <div class="direction"><span class="legend-stroke" aria-hidden="true"></span><span class="legend-name"></span></div>
          <div class="route"></div>
          <p class="help" hidden></p>
          <button class="lift" type="button" hidden>Lift this packet</button>
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
  const phases = [.22, .51, .80];
  let geometry, ink, bits, drawCard, audio, drag, replacement, returning;
  let chapter = -1, selected = -1, missing = -1;
  let progress = 0, clock = 0, lastTime, raf = 0;
  let visible = false, paused = false, sound = false, dirty = true, loadStarted = false;
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
    if (chapter >= 2 && sound) tone(1100, 1600, .24);
  });

  function showReading() {
    const packet = packets[selected];
    const inspecting = chapter === 3 && packet && missing < 0;
    $('.readout').classList.toggle('warning', missing >= 0);
    $('.lift').hidden = !inspecting;
    $('.help').hidden = chapter !== 3;
    if (missing >= 0) {
      $('.legend-name').textContent = 'Packet lost';
      $('.route').textContent = 'WARNING: Data packet missing! 🚨';
      $('.help').textContent = 'In this demo the tag sends a replacement.';
    } else if (inspecting) {
      $('.legend-name').textContent = packet.label + ' · Simulated value';
      $('.route').textContent = packet.value;
      $('.help').textContent = packet.meaning;
    } else {
      $('.legend-name').textContent = ['Power field', 'Signal path', 'Reply signal', 'Packet inspector'][chapter];
      $('.route').textContent = ['Reader → tag', 'Across the air gap', 'Tag → reader', 'Select a packet'][chapter];
      $('.help').textContent = 'Inspect a packet or drag it out of the river.';
    }
  }
  function inspect(index) {
    if (missing >= 0 || selected === index) return;
    selected = index;
    nodes.forEach((n, i) => n.classList.toggle('selected', i === index));
    showReading();
    $('.announcement').textContent = packets[index].label + '. ' + packets[index].value + '. ' + packets[index].meaning;
  }
  function resetPackets() {
    clearTimeout(replacement);
    drag = returning = null;
    missing = selected = -1;
    phases.splice(0, 3, .22, .51, .80);
    for (const node of nodes) {
      node.classList.remove('missing', 'selected', 'held', 'peek');
      node.setAttribute('aria-pressed', 'false');
    }
    $('.announcement').textContent = '';
  }
  function setChapter(index) {
    if (chapter === index) return;
    if (chapter >= 0 && chapter < 2 && index >= 2) tone(1100, 1600, .34);
    if (chapter === 3) resetPackets();
    chapter = index;
    frame.dataset.chapter = index;
    $('.copy h2').textContent = chapters[index].title;
    $('.copy p').textContent = chapters[index].copy;
    $('.connected').hidden = index < 2;
    $('.packets').hidden = index !== 3;
    stops.forEach((stop, i) => {
      if (i === index) stop.setAttribute('aria-current', 'step');
      else stop.removeAttribute('aria-current');
    });
    const last = index === chapters.length - 1;
    const label = last ? 'Replay' : index === 0 ? 'Scroll to explore' : 'Next chapter';
    const shortLabel = last ? 'Replay' : index === 0 ? 'Explore' : 'Next';
    $('.advance').innerHTML = `<span class="advance-full">${label}</span><span class="advance-short">${shortLabel}</span>` + icon(last ? 'replay' : 'down');
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

  function measure(scroll, step = chapters.findLastIndex(c => scroll >= c.at)) {
    const w = plot.clientWidth, h = plot.clientHeight;
    if (!w || !h) return null;
    const compact = w <= 520 || (w <= 680 && frame.clientHeight > 450);
    const zoom = motion.matches ? [0, .45, 1, 1][step] : ease(.03, .69, scroll);
    const push = motion.matches ? 0 : ease(.01, .22, scroll) * (1 - ease(.26, .55, scroll));
    const cardWidth = Math.min(w * (compact ? .62 : .39), h * (compact ? .99 : .95), 640) * (1 - .40 * zoom + push * .42);
    return { geometry: riverGeometry(w, h, zoom, compact), zoom, cardWidth };
  }

  function getCardTarget({ atEntry = false } = {}) {
    const view = measure(atEntry ? 0 : scrollProgress());
    if (!view) return null;
    const { tag } = view.geometry;
    const { left, top, right, bottom } = plot.getBoundingClientRect();
    const offset = atEntry ? frame.getBoundingClientRect().top : 0;
    return {
      x: left + tag.x, y: top + tag.y - offset,
      size: view.cardWidth * CARD_MODEL_WIDTH / CARD_VIEW_WIDTH,
      ...cardPose(view.zoom),
      clip: { left, top: top - offset, right, bottom: bottom - offset }
    };
  }

  function layout() {
    progress = scrollProgress();
    const step = chapters.findLastIndex(c => progress >= c.at);
    $('.pause').hidden = !replyFront(progress) || motion.matches;
    setChapter(step);
    const view = measure(progress, step);
    if (!view) return;
    const { w, h, compact, reader, tag } = view.geometry;
    if (!geometry || w !== geometry.w || h !== geometry.h || compact !== geometry.compact) {
      ink = sizeCanvas($('.field'), w, h, compact);
      bits = sizeCanvas($('.traffic'), w, h, compact);
    }
    const { zoom, cardWidth } = view;
    geometry = view.geometry;
    const readerWidth = Math.min(w * (compact ? .36 : .245), h * .56, 350) * (1 - .24 * zoom);
    for (const [name, center, width] of [['tag', tag, cardWidth], ['reader', reader, readerWidth]]) {
      plot.style.setProperty('--' + name + '-x', center.x + 'px');
      plot.style.setProperty('--' + name + '-y', center.y + 'px');
      plot.style.setProperty('--' + name + '-w', width + 'px');
    }
    if (drawCard && !host.hasAttribute('data-external-card')) drawCard(zoom);
    drawField(ink, geometry, zoom, progress);
    if (host.hasAttribute('data-external-card')) host.dispatchEvent(new Event('bit-river-card-layout'));
  }
  function positionPacket(i) {
    const phase = geometry.compact ? .12 + phases[i] * .76 : phases[i];
    const t = returning?.i === i ? phase * ease(0, 1.1, clock - returning.start) : phase;
    return geometry.point(t, (i - 1) * .88);
  }
  function tick(now) {
    raf = 0;
    if (dirty) { dirty = false; layout(); }
    if (!geometry || !visible || document.hidden) { lastTime = undefined; return; }
    const moving = !motion.matches && !paused && replyFront(progress) > 0;
    const dt = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, .05);
    lastTime = moving ? now : undefined;
    if (moving) clock += dt;
    drawTraffic(bits, geometry, progress, clock);
    if (returning && (clock - returning.start >= 1.1 || motion.matches)) returning = null;
    if (chapter === 3) nodes.forEach((node, i) => {
      if (drag?.i === i) return;
      if (moving) phases[i] = (phases[i] + dt * .034) % 1;
      place(node, positionPacket(i));
    });
    if (moving) wake();
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
  on(motion, 'change', refresh);
  on(window, 'focus', refresh);
  const resize = new ResizeObserver(refresh);
  resize.observe(plot);
  resize.observe(host);
  function loadCardVisual() {
    if (!visible || loadStarted || host.hasAttribute('data-external-card')) return;
    loadStarted = true;
    import('./card.js').then(module => {
      if (host.hasAttribute('data-external-card')) {
        loadStarted = false;
        return;
      }
      return module.loadCard(model, signal);
    }).then(render => {
      if (!render || signal.aborted) return;
      drawCard = render;
      layout();
      $('.card').classList.add('live');
    }).catch(() => { /* The stills show the same card when WebGL or the CDN is unavailable. */ });
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
    missing = i;
    selected = -1;
    nodes[i].classList.remove('selected', 'peek');
    nodes[i].setAttribute('aria-pressed', 'false');
    nodes[i].classList.add('missing');
    showReading();
    $('.announcement').textContent = 'WARNING: Data packet missing! The tag is sending a replacement.';
    tone(420, 180, .23);
    replacement = setTimeout(() => {
      missing = -1;
      // Rejoin the original slot so a replacement cannot drift on top of another packet forever.
      if (!motion.matches && !paused && !restoreFocus) returning = { i, start: clock };
      nodes[i].classList.remove('missing');
      showReading();
      $('.route').textContent = 'Transmission restored';
      if (restoreFocus && root.activeElement === $('.readout')) nodes[i].focus({ preventScroll: true });
      $('.announcement').textContent = packets[i].label + ' packet replaced. Transmission restored.';
      wake();
    }, 1500);
    wake();
  }
  on($('.lift'), 'click', () => steal(selected));
  nodes.forEach((node, i) => {
    let dragged = false;
    on(node, 'pointerenter', event => {
      if (event.pointerType === 'mouse' && !drag && missing < 0) {
        node.classList.add('peek');
        inspect(i);
      }
    });
    on(node, 'pointerleave', () => node.classList.remove('peek'));
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
      if (drag?.id !== event.pointerId || drag.i !== i) return;
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
      if (event.type === 'pointerup' && position && !geometry.contains(position.x, position.y)) steal(i);
      wake();
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) on(node, event, release);
  });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    clearTimeout(replacement);
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
  disconnectedCallback() { this.controller.abort(); this.cardView = null; }
  getCardTarget(options) { return this.cardView?.getCardTarget(options) ?? null; }
  setExternalCard(active) {
    this.toggleAttribute('data-external-card', active);
    this.cardView?.updateCardMode();
  }
}
customElements.define('rfid-bit-river', RFIDBitRiver);
