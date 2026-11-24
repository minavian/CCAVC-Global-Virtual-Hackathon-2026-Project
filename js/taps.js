/*
 * Continuous 12-second 3D #taps demonstration:
 *   Contactless Payment -> Station Card Handoff -> Station Gate -> Enter Station
 *   -> Electric Train -> Downward Camera Reveal -> Vehicle Unlock.
 *
 * Single Three.js WebGLRenderer, PerspectiveCamera, RoomEnvironment IBL, horizon fog,
 * adaptive DPR, Direct3D offscreen shader pre-warm, and pure timeline evaluation.
 */

import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS, clamp01 } from './taps/easing.js';
import { TOTAL_DURATION, COUNTER_ORIGIN, PHASE_MARKS, evaluateTimeline } from './taps/timeline.js';
import { createPaymentAssets } from './taps/payment-assets.js';
import { createGateAndTrainAssets } from './taps/gate-train-assets.js';
import { createVehicleAssets, createVehicleReflection } from './taps/vehicle-assets.js';

const section = document.getElementById('taps');

// Wait until the landing opening settles (or visitor scrolls) so 3D loading never stutters it.
function afterOpening(fallbackMs = 11000) {
  return new Promise(resolve => {
    if (window.__openingDone) {
      resolve();
      return;
    }
    let settled = false;
    let timerId = 0;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      document.removeEventListener('rfid:opening-done', done);
      removeEventListener('scroll', onScroll);
      resolve();
    };
    const onScroll = () => {
      if (scrollY > 40) done();
    };
    document.addEventListener('rfid:opening-done', done, { once: true });
    addEventListener('scroll', onScroll, { passive: true });
    timerId = setTimeout(done, fallbackMs);
  });
}

function waitFonts() {
  if (!document.fonts?.load) return Promise.resolve();
  const load = Promise.all([
    document.fonts.load('700 40px "Inter Tight"'),
    document.fonts.load('600 40px "Inter Tight"'),
  ]);
  return Promise.race([load, new Promise(resolve => setTimeout(resolve, 2000))]).catch(() => {});
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.min(TOTAL_DURATION, Math.floor(seconds)));
  const minutes = Math.floor(whole / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

if (section) {
  if (location.protocol === 'file:') {
    section.classList.add('is-static');
  } else {
    init();
  }
}

function init() {
  const stage = section.querySelector('.taps-stage');
  const canvas = section.querySelector('.taps-canvas');
  const badge = section.querySelector('.taps-badge');
  const captionEl = section.querySelector('.taps-caption');
  const seekEl = section.querySelector('.taps-seek');
  const fillEl = section.querySelector('.taps-fill');
  const timeEl = section.querySelector('.taps-time');
  const toggleBtn = section.querySelector('.taps-toggle');
  const replayBtn = section.querySelector('.taps-replay');
  const skipLink = section.querySelector('.taps-skip');
  const chaptersEl = section.querySelector('.taps-chapters');
  const chapterBtns = chaptersEl ? [...chaptersEl.querySelectorAll('button[data-time]')] : [];
  if (seekEl) seekEl.max = String(TOTAL_DURATION);

  if (!stage || !canvas) {
    section.classList.add('is-static');
    return;
  }

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  const minDpr = Math.max(0.75, maxDpr * 0.5);

  let dpr = maxDpr;
  let renderer = null;
  let scene = null;
  let camera = null;
  let envRT = null;
  let vehicleEnvRT = null;
  let payment = null;
  let gateTrain = null;
  let vehicle = null;
  let anchors = null;

  let loadingPromise = null;
  let disposed = false;
  let ready = false;
  let visible = false;
  let inView = false;
  let paused = false;
  let ended = false;
  let hasStarted = false;
  let scrubbing = false;

  let clock = motion.matches ? TOTAL_DURATION : 0;
  let lastNow = null;
  let frameId = 0;
  let width = 0;
  let height = 0;
  let lastAppliedFov = 0;
  let lastAppliedAspect = 0;

  let activeMs = 0;
  let slowMs = 0;
  let fastMs = 0;

  let lastCaptionText = '';
  let lastBadgeText = '';
  let lastBadgeState = '';
  let lastTimeLabel = '';
  let lastChapterIndex = -1;
  let lastEvaluated = null;

  // ---------- Observers ----------
  const approach = new IntersectionObserver(
    entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      approach.disconnect();
      afterOpening(11000).then(load);
    },
    { rootMargin: '140% 0px' }
  );
  approach.observe(section);

  const watch = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.target !== section) continue;
        visible = entry.isIntersecting;
        inView = entry.intersectionRatio >= 0.22;
      }
      if (ready && inView && !hasStarted && !paused && !motion.matches) {
        hasStarted = true;
      }
      wake();
    },
    { threshold: [0, 0.22] }
  );
  watch.observe(section);

  const resizeObserver = new ResizeObserver(() => {
    applySize();
    if (ready) draw();
    wake();
  });
  resizeObserver.observe(stage);

  // ---------- Controls & Listeners ----------
  const onToggle = () => {
    if (motion.matches) return;
    if (ended || clock >= TOTAL_DURATION - 1e-4) {
      restart();
      return;
    }
    hasStarted = true;
    paused = !paused;
    lastNow = null;
    syncControls();
    if (!paused) wake();
  };

  const onReplay = () => {
    if (motion.matches) {
      clock = TOTAL_DURATION;
      if (ready) draw();
      return;
    }
    restart();
  };

  const onSkip = () => {
    hasStarted = true;
    paused = true;
    ended = true;
    clock = TOTAL_DURATION;
    lastNow = null;
    cancelFrame();
    if (ready) draw();
    else syncControls();
  };

  const onSeekStart = () => {
    scrubbing = true;
  };

  const onSeekInput = () => {
    const target = Math.max(0, Math.min(TOTAL_DURATION, Number(seekEl.value) || 0));
    hasStarted = true;
    paused = true;
    ended = target >= TOTAL_DURATION - 1e-4;
    clock = target;
    lastNow = null;
    if (ready) draw();
    else syncControls();
  };

  const onSeekEnd = () => {
    scrubbing = false;
  };

  const onChapterClick = event => {
    const btn = event.currentTarget;
    const t = parseFloat(btn.dataset.time);
    if (!Number.isFinite(t)) return;
    hasStarted = true;
    paused = true;
    ended = t >= TOTAL_DURATION - 1e-4;
    clock = Math.max(0, Math.min(TOTAL_DURATION, t));
    lastNow = null;
    if (ready) draw();
    else syncControls();
  };

  const onMotionChange = () => {
    syncMotion();
    if (motion.matches) {
      paused = false;
      ended = false;
      clock = TOTAL_DURATION;
      lastNow = null;
    }
    if (ready) draw();
    wake();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      lastNow = null;
    } else {
      wake();
    }
  };

  const onContextLost = event => {
    event.preventDefault();
    cancelFrame();
    ready = false;
    section.classList.remove('is-ready');
    section.classList.add('is-static');
    if (toggleBtn) toggleBtn.hidden = true;
    if (replayBtn) replayBtn.hidden = true;
  };

  toggleBtn?.addEventListener('click', onToggle);
  replayBtn?.addEventListener('click', onReplay);
  skipLink?.addEventListener('click', onSkip);
  seekEl?.addEventListener('pointerdown', onSeekStart);
  seekEl?.addEventListener('input', onSeekInput);
  seekEl?.addEventListener('change', onSeekEnd);
  seekEl?.addEventListener('pointerup', onSeekEnd);
  chapterBtns.forEach(btn => btn.addEventListener('click', onChapterClick));
  motion.addEventListener('change', onMotionChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  window.addEventListener('pagehide', dispose);

  syncMotion();
  syncControls();

  // Optional ?debug console API for frame-accurate inspection.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__taps = {
      duration: TOTAL_DURATION,
      marks: PHASE_MARKS,
      seek(seconds) {
        const target = Math.max(0, Math.min(TOTAL_DURATION, Number(seconds) || 0));
        hasStarted = true;
        paused = true;
        ended = target >= TOTAL_DURATION - 1e-4;
        clock = target;
        lastNow = null;
        if (ready) draw();
        else syncControls();
        return this.state();
      },
      play() {
        if (clock >= TOTAL_DURATION - 1e-4) clock = 0;
        hasStarted = true;
        paused = false;
        ended = false;
        lastNow = null;
        wake();
        return this.state();
      },
      pause() {
        paused = true;
        lastNow = null;
        if (ready) draw();
        else syncControls();
        return this.state();
      },
      replay() {
        restart();
        return this.state();
      },
      state() {
        return {
          ready,
          visible,
          inView,
          paused,
          ended,
          clock,
          duration: TOTAL_DURATION,
          dpr,
          timeline: lastEvaluated,
          render: renderer ? { ...renderer.info.render, ...renderer.info.memory } : null,
        };
      },
    };
  }

  function restart() {
    hasStarted = true;
    paused = false;
    ended = false;
    clock = 0;
    lastNow = null;
    activeMs = 0;
    slowMs = 0;
    fastMs = 0;
    if (ready) draw();
    wake();
  }

  function syncMotion() {
    const reduced = motion.matches;
    section.classList.toggle('is-still', reduced);
    if (toggleBtn) toggleBtn.hidden = reduced;
    if (replayBtn) replayBtn.hidden = reduced;
    if (chaptersEl) chaptersEl.hidden = !reduced;
  }

  function applySize() {
    if (!renderer) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    width = w;
    height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  }

  async function load() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        renderer = new T.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(dpr);
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.83;

        scene = new T.Scene();
        scene.fog = new T.Fog(COLORS.PAPER, 28, 78);
        camera = new T.PerspectiveCamera(32, 1, 0.08, 110);

        const pmrem = new T.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        envRT = pmrem.fromScene(room, 0.04);
        vehicleEnvRT = createVehicleReflection(T, pmrem);
        scene.environment = envRT.texture;
        scene.environmentIntensity = 0.9;
        pmrem.dispose();
        room.dispose();

        scene.add(new T.HemisphereLight(0xfffcf6, 0x928f86, 0.58));
        const keyLight = new T.DirectionalLight(0xfffaf0, 2.0);
        keyLight.position.set(-4, 7, 6);
        const fillLight = new T.DirectionalLight(0xf6f8ff, 1.15);
        fillLight.position.set(6, 4, -3);
        const rimLight = new T.DirectionalLight(0xfff7ec, 0.75);
        rimLight.position.set(3, 5, 8);
        const lowerFill = new T.DirectionalLight(0xfffaf0, 0.55);
        lowerFill.position.set(-6, -2, -5);
        scene.add(keyLight, fillLight, rimLight, lowerFill);

        const loader = new GLTFLoader();
        const [payBundle, transitBundle, vehicleBundle] = await Promise.all([
          createPaymentAssets(T, loader),
          createGateAndTrainAssets(T),
          createVehicleAssets(T, vehicleEnvRT.texture, loader),
          waitFonts(),
        ]);

        if (disposed) {
          payBundle.dispose();
          transitBundle.dispose();
          vehicleBundle.dispose();
          return;
        }

        payment = payBundle;
        gateTrain = transitBundle;
        vehicle = vehicleBundle;

        payment.counter.position.set(COUNTER_ORIGIN.x, COUNTER_ORIGIN.y, COUNTER_ORIGIN.z);
        scene.add(
          payment.counter,
          payment.stationCard.group,
          gateTrain.gate.group,
          gateTrain.railway.group,
          gateTrain.train.group,
          vehicle.deck.group,
          vehicle.car.group,
          vehicle.fob.group
        );

        anchors = {
          terminalReaderAnchor: payment.terminal.readerAnchor,
          terminalReaderNormal: payment.terminal.readerNormal,
          gateReaderAnchor: gateTrain.gate.readerAnchor,
          gateReaderNormal: gateTrain.gate.readerNormal,
          wheelRadius: gateTrain.train.wheelRadius,
        };

        applySize();
        prewarmShaders();

        ready = true;
        if (motion.matches && !hasStarted) clock = TOTAL_DURATION;
        if (inView && !hasStarted && !paused && !motion.matches) {
          hasStarted = true;
        }
        draw();
        section.classList.add('is-ready');
        wake();
      } catch (error) {
        console.warn('The 3D #taps demonstration could not initialize; showing static fallback.', error);
        section.classList.add('is-static');
        if (toggleBtn) toggleBtn.hidden = true;
        if (replayBtn) replayBtn.hidden = true;
      }
    })();
    return loadingPromise;
  }

  // Force Chrome/Direct3D to compile every material shader offscreen before reveal.
  function prewarmShaders() {
    const kept = [];
    scene.traverse(obj => {
      kept.push([obj, obj.visible, obj.frustumCulled]);
      obj.visible = true;
      obj.frustumCulled = false;
    });

    for (const time of [1.5, 3.9, 9.98]) {
      applySceneState(evaluateTimeline(time, anchors));
      renderer.render(scene, camera);
    }

    for (const [obj, vis, culled] of kept) {
      obj.visible = vis;
      obj.frustumCulled = culled;
    }
    renderer.clear();
  }

  function moving() {
    return (
      ready &&
      !disposed &&
      visible &&
      !document.hidden &&
      !motion.matches &&
      hasStarted &&
      !paused &&
      !ended
    );
  }

  function wake() {
    if (frameId || !ready || disposed || !visible || document.hidden) return;
    if (!moving() && lastEvaluated) return;
    frameId = requestAnimationFrame(frame);
  }

  function cancelFrame() {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function frame(now) {
    frameId = 0;
    if (disposed || !ready) return;

    const rawDtMs = lastNow === null ? 0 : now - lastNow;
    const dt = rawDtMs / 1000;

    if (moving()) {
      clock = Math.min(TOTAL_DURATION, clock + dt);
      if (clock >= TOTAL_DURATION) {
        clock = TOTAL_DURATION;
        ended = true;
      }
      if (lastNow !== null) tuneDpr(rawDtMs);
      lastNow = now;
    } else {
      lastNow = null;
    }

    draw();

    if (moving()) {
      frameId = requestAnimationFrame(frame);
    }
  }

  function tuneDpr(frameMs) {
    activeMs += frameMs;
    if (activeMs < 1200) return;

    if (frameMs > 23) {
      slowMs += frameMs;
      fastMs = 0;
      if (slowMs > 750 && dpr > minDpr) {
        dpr = Math.max(minDpr, +(dpr - 0.25).toFixed(2));
        slowMs = 0;
        applySize();
      }
    } else if (frameMs < 16.5 && dpr < maxDpr) {
      fastMs += frameMs;
      slowMs = 0;
      if (fastMs > 4000) {
        dpr = Math.min(maxDpr, +(dpr + 0.25).toFixed(2));
        fastMs = 0;
        applySize();
      }
    } else {
      slowMs = Math.max(0, slowMs - frameMs * 0.5);
    }
  }

  function applySceneState(state) {
    lastEvaluated = state;

    // Camera framing with subtle narrow-aspect FOV compensation for mobile widths.
    const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
    let fov = state.camera.fov;
    if (aspect < 1.35) {
      const ratio = Math.min(1.42, 1.35 / Math.max(0.65, aspect));
      const half = T.MathUtils.degToRad(fov * 0.5);
      fov = T.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) * (1 + 0.52 * (ratio - 1))));
    }
    if (Math.abs(fov - lastAppliedFov) > 1e-4 || Math.abs(aspect - lastAppliedAspect) > 1e-4) {
      lastAppliedFov = fov;
      lastAppliedAspect = aspect;
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.position.set(state.camera.pos.x, state.camera.pos.y, state.camera.pos.z);
    camera.lookAt(state.camera.target.x, state.camera.target.y, state.camera.target.z);

    // Terminal & cards
    const term = state.terminal;
    payment.counter.visible = term.visible;
    payment.terminal.group.position.set(term.pos.x, term.pos.y, term.pos.z);
    payment.terminal.group.scale.setScalar(term.scale);
    if (term.visible) {
      payment.terminal.setState({
        readProgress: term.readProgress,
        success: term.success,
        pulse: term.pulse,
        glow: term.glow,
        opacity: term.opacity,
      });
    }

    const bank = state.bankCard;
    payment.bankCard.group.visible = bank.visible;
    payment.bankCard.group.position.set(bank.pos.x, bank.pos.y, bank.pos.z);
    payment.bankCard.group.quaternion.set(bank.quat.x, bank.quat.y, bank.quat.z, bank.quat.w);
    payment.bankCard.group.scale.setScalar(bank.scale);
    if (bank.visible) payment.bankCard.setOpacity(bank.opacity);

    const station = state.stationCard;
    payment.stationCard.group.visible = station.visible;
    payment.stationCard.group.position.set(station.pos.x, station.pos.y, station.pos.z);
    payment.stationCard.group.quaternion.set(station.quat.x, station.quat.y, station.quat.z, station.quat.w);
    payment.stationCard.group.scale.setScalar(station.scale);
    if (station.visible) payment.stationCard.setOpacity(station.opacity);
    const shadow = payment.stationCardShadow;
    shadow.visible = station.counterShadow > 0;
    shadow.material.opacity = shadow.userData.baseOpacity * station.counterShadow;
    shadow.position.x = station.pos.x - COUNTER_ORIGIN.x;
    shadow.position.z = station.pos.z - COUNTER_ORIGIN.z;

    // Station gate, railway & electric train
    const gate = state.gate;
    gateTrain.gate.group.visible = gate.visible;
    gateTrain.gate.group.position.set(gate.pos.x, gate.pos.y, gate.pos.z);
    gateTrain.gate.group.scale.setScalar(gate.scale);
    if (gate.visible) {
      gateTrain.gate.setState({
        readProgress: gate.readProgress,
        authorized: gate.authorized,
        pulse: gate.pulse,
        barrierOpen: gate.barrierOpen,
        passageClear: gate.passageClear,
        opacity: gate.opacity,
      });
    }

    const rail = state.railway;
    gateTrain.railway.group.visible = rail.visible;
    if (rail.visible) gateTrain.railway.setOpacity(rail.opacity);

    const train = state.train;
    gateTrain.train.setState({
      xOffset: train.xOffset,
      headlights: train.headlights,
      wheelAngle: train.wheelAngle,
      doorOpen: train.doorOpen,
      visible: train.visible,
    });

    // Lower-level car and remote key
    const car = state.vehicle;
    vehicle.deck.group.visible = car.visible;
    vehicle.car.group.position.set(car.pos.x, car.pos.y, car.pos.z);
    vehicle.deck.group.position.copy(vehicle.car.group.position);
    vehicle.car.setState({
      lightFlash: car.lightFlash,
      doorOpen: car.doorOpen,
      visible: car.visible,
    });

    const fob = state.fob;
    vehicle.fob.group.position.set(fob.pos.x, fob.pos.y, fob.pos.z);
    vehicle.fob.group.quaternion.set(fob.quat.x, fob.quat.y, fob.quat.z, fob.quat.w);
    vehicle.fob.group.scale.setScalar(fob.scale);
    vehicle.fob.setState({
      press: fob.press,
      rfPulse: fob.rfPulse,
      opacity: fob.opacity,
      visible: fob.visible,
    });

  }

  function syncControls(captions = null) {
    const progress = clamp01(clock / TOTAL_DURATION);
    if (fillEl) fillEl.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (seekEl && !scrubbing) seekEl.value = clock.toFixed(2);

    const label = `${formatClock(clock)} / ${formatClock(TOTAL_DURATION)}`;
    if (timeEl && label !== lastTimeLabel) {
      lastTimeLabel = label;
      timeEl.textContent = label;
    }

    const isEnded = !motion.matches && (ended || clock >= TOTAL_DURATION - 1e-4);
    section.classList.toggle('is-ended', isEnded);

    if (toggleBtn) {
      const showPlay = paused || isEnded;
      toggleBtn.setAttribute('aria-pressed', String(showPlay));
      const textSpan = toggleBtn.querySelector('span');
      if (textSpan) textSpan.textContent = showPlay ? 'Play' : 'Pause';
    }

    if (chapterBtns.length) {
      let bestIdx = 0;
      let bestDist = Infinity;
      chapterBtns.forEach((btn, idx) => {
        const target = parseFloat(btn.dataset.time);
        const dist = Number.isFinite(target) ? Math.abs(clock - target) : Infinity;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      if (bestIdx !== lastChapterIndex) {
        lastChapterIndex = bestIdx;
        chapterBtns.forEach((btn, idx) => {
          const active = idx === bestIdx;
          btn.classList.toggle('is-active', active);
          if (active) btn.setAttribute('aria-current', 'true');
          else btn.removeAttribute('aria-current');
        });
      }
    }

    if (!captions) return;

    if (captionEl && captions.text !== lastCaptionText) {
      lastCaptionText = captions.text;
      captionEl.textContent = captions.text;
    }

    if (badge && (captions.badgeText !== lastBadgeText || captions.badgeState !== lastBadgeState)) {
      lastBadgeText = captions.badgeText;
      lastBadgeState = captions.badgeState;
      badge.hidden = !captions.badgeText;
      badge.classList.toggle('is-success', captions.badgeState === 'success');
      badge.textContent = captions.badgeText;
    }
  }

  function draw() {
    if (!ready || disposed) return;
    const state = evaluateTimeline(clock, anchors);
    applySceneState(state);
    syncControls(state.captions);
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    approach.disconnect();
    watch.disconnect();
    resizeObserver.disconnect();
    toggleBtn?.removeEventListener('click', onToggle);
    replayBtn?.removeEventListener('click', onReplay);
    skipLink?.removeEventListener('click', onSkip);
    seekEl?.removeEventListener('pointerdown', onSeekStart);
    seekEl?.removeEventListener('input', onSeekInput);
    seekEl?.removeEventListener('change', onSeekEnd);
    seekEl?.removeEventListener('pointerup', onSeekEnd);
    chapterBtns.forEach(btn => btn.removeEventListener('click', onChapterClick));
    motion.removeEventListener('change', onMotionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    window.removeEventListener('pagehide', dispose);

    payment?.dispose();
    gateTrain?.dispose();
    vehicle?.dispose();
    envRT?.dispose();
    vehicleEnvRT?.dispose();
    renderer?.dispose();
    renderer = null;
    scene = null;
    camera = null;
  }
}
