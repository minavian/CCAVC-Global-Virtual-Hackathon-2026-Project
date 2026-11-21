import { renderInterface } from './interface.js';
import { clamp, ease, linkAt, linkConditions } from './river.js';
import { createWaveform } from './waveform.js';

const chapters = [
  { at: 0, title: 'The Invisible Current', caption: 'An RFID transmission' },
  { at: .135, title: 'The reader calls.', caption: 'The reader’s magnetic field powers the card.' },
  { at: .30, title: 'The antenna answers.', caption: 'The chip switches the load on its coil.' },
  { at: .57, title: 'A river of signals.', caption: 'The timing of the changes encodes each bit.' },
  { at: .86, title: 'The reply arrives.', caption: 'A simulated RFID exchange.' }
];

function mount(host, root, signal) {
  renderInterface(root);
  const $ = selector => root.querySelector(selector);
  const scene = $('.scene'), canvas = $('.world'), advance = $('.advance'), pause = $('.flow-toggle');
  const compare = $('.link-toggle'), title = $('.headline'), caption = $('.caption'), scopeLabel = $('.scope-label');
  const drawScope = createWaveform($('.scope'));
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const graphics = new AbortController();
  let world, visible = false, loading = false, paused = false;
  let raf = 0, lastTime, progress, target = 0, chapter = -1;
  let measurements = true, scrolled = true, width = 0, height = 0;
  let mode = 0, linkBlend = 1, compared = false, time = 0, detectedAt = -10;
  let currentLink = linkConditions[0], previousLink = currentLink;
  const on = (node, event, handler, options) => node.addEventListener(event, handler, { ...options, signal });

  function wake() {
    if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    if (measurements) {
      width = scene.clientWidth;
      height = scene.clientHeight;
      measurements = false;
    }
    if (!width || !height || !visible || document.hidden) return;
    if (scrolled) {
      target = clamp(-host.getBoundingClientRect().top / Math.max(1, host.offsetHeight - height));
      scrolled = false;
    }
    const dt = lastTime === undefined ? 0 : Math.min(.06, (now - lastTime) / 1000);
    lastTime = now;
    const reduced = preference.matches;
    const previous = progress;
    progress = progress === undefined || reduced ? target : progress + (target - progress) * (1 - Math.exp(-16 * Math.max(dt, .016)));
    const settling = Math.abs(target - progress) > .0006;
    if (!settling) progress = target;

    const next = chapters.findLastIndex(step => progress >= step.at);
    if (next !== chapter) {
      chapter = next;
      scene.dataset.chapter = chapter;
      const last = chapter === chapters.length - 1;
      advance.dataset.replay = String(last);
      $('[data-advance-label]').textContent = last ? 'Replay' : chapter === 0 ? 'Scroll to follow' : 'Continue';
      scopeLabel.textContent = chapter < 2 ? 'Reader carrier · 13.56 MHz' : 'Load modulation · 847.5 kHz subcarrier';
      compare.hidden = !last;
      if (!last) {
        $('.live-status').textContent = '';
        if (mode) {
          previousLink = currentLink;
          linkBlend = 0;
        }
        mode = 0;
        compared = false;
      }
    }
    if (progress !== previous) {
      scene.style.setProperty('--progress', progress.toFixed(4));
      scene.style.setProperty('--depth', ease(.20, .75, progress).toFixed(4));
    }
    const motion = !reduced && !paused;
    if (motion) time += dt;
    linkBlend = reduced ? 1 : Math.min(1, linkBlend + Math.max(dt, .016) * 3.2);
    const link = currentLink = linkAt(progress, mode, ease(0, 1, linkBlend), previousLink);
    const stage = chapters[chapter];
    const comparing = chapter === 4 && compared;
    const sceneTitle = comparing && !link.readable ? 'The reader misses.' : stage.title;
    const sceneCaption = comparing ? linkConditions[mode].name + (linkBlend < 1 ? '' : link.readable ? ' · Readable' : ' · No read') : stage.caption;
    if (title.textContent !== sceneTitle) title.textContent = sceneTitle;
    if (caption.textContent !== sceneCaption) caption.textContent = sceneCaption;
    pause.hidden = reduced || (!world && !chapter);
    const received = chapter === 4 && link.readable
      ? Math.max(ease(.86, .95, progress) * .62, 1 - ease(0, .8, time - detectedAt)) : 0;
    if (!world) {
      scene.style.setProperty('--gap', link.gap - .48);
      scene.style.setProperty('--foreshortening', Math.cos(link.tilt));
      scene.style.setProperty('--coupling', link.strength);
    }
    if (chapter > 0) drawScope({ progress, time, strength: link.strength, noise: link.noise, received, reduced });
    const needsFrame = world?.frame({ width, height, progress, dt, motion, reduced, link });
    if (world && scene.dataset.ready !== 'true') scene.dataset.ready = 'true';
    if (settling || linkBlend < 1 || needsFrame || (motion && (world || chapter > 0))) wake();
    else lastTime = undefined;
  }

  on(advance, 'click', () => {
    const next = chapter < 0 ? 1 : (chapter + 1) % chapters.length;
    const travel = host.offsetHeight - scene.clientHeight;
    const top = window.scrollY + host.getBoundingClientRect().top + travel * (chapters[next].at + (next ? .045 : 0));
    window.scrollTo({ top, behavior: preference.matches ? 'instant' : 'smooth' });
  });
  on(pause, 'click', () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    $('[data-flow-label]').textContent = paused ? 'Resume flow' : 'Pause flow';
    wake();
  });
  on(compare, 'click', () => {
    previousLink = currentLink;
    mode = (mode + 1) % linkConditions.length;
    linkBlend = 0;
    compared = true;
    wake();
  });
  function onScroll() { scrolled = true; wake(); }
  on(window, 'scroll', onScroll, { passive: true });
  on(preference, 'change', wake);
  on(document, 'visibilitychange', () => { lastTime = undefined; wake(); });
  on(root, 'keydown', event => {
    if (event.key.startsWith('Arrow')) event.stopPropagation();
  });
  function fallback() {
    graphics.abort();
    world = null;
    delete scene.dataset.ready;
    $('.inspection').hidden = true;
    $('.notice').textContent = '';
    for (const button of root.querySelectorAll('.packet')) button.hidden = true;
    wake();
  }
  on(canvas, 'webglcontextlost', fallback);

  const size = new ResizeObserver(() => { measurements = true; onScroll(); });
  size.observe(scene);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    lastTime = undefined;
    wake();
    if (!visible || loading) return;
    loading = true;
    import('./scene.js').then(({ createScene }) => createScene({
      canvas, surface: scene,
      controls: $('.packets'), notice: $('.notice'), readout: $('.inspection'),
      signal: graphics.signal, wake,
      onArrival() {
        detectedAt = time;
        if (chapter === 4) $('.live-status').textContent = 'Reader confirmed the simulated reply.';
      }
    })).then(result => {
      if (!result || graphics.signal.aborted) return;
      world = result;
      wake();
    }).catch(error => {
      if (!graphics.signal.aborted) console.warn('Bit River is using its still scene.', error);
      fallback();
    });
  }, { rootMargin: '0px 0px 180px' });
  observer.observe(host);
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    graphics.abort();
    size.disconnect();
    observer.disconnect();
  }, { once: true });
}

class RFIDBitRiver extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    mount(this, this.shadowRoot || this.attachShadow({ mode: 'open' }), this.controller.signal);
  }

  disconnectedCallback() {
    this.controller.abort();
  }
}

customElements.define('rfid-bit-river', RFIDBitRiver);
