/*
 * Every day: three taps under the landing page, played one after another.
 *   1. A metro ticket taps the gate's reader, and the gate opens.
 *   2. A bank card taps a payment terminal, and the payment goes through.
 *   3. A car key's button is pressed, and the car opens.
 *
 * One WebGL canvas covers the row. Each panel is drawn into its own rectangle of it
 * (a scissor box) with its own camera, so the three scenes share one context, one set of
 * lights and one frame loop.
 *
 * Every pose is a pure function of the panel's time `t` (0 to PLAY seconds) and of the
 * reset amount `r` (0 to 1), so pausing, looping and reduced motion can never leave a
 * scene half-way. Wide screens play the panels in turn; stacked (phone) layouts play
 * each panel on its own while it is on screen.
 */
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const section = document.getElementById('taps');

// ---------- Timing (seconds). Everything about pacing lives here. ----------
const PLAY = 3.4;      // one panel, from rest to done
const LEAD = .5;       // stillness before the first panel
const HOLD = 1.8;      // all done, before everything resets
const RESET = 1.1;     // gates close, screen clears, door shuts
const REST = .6;       // stillness after the reset
const LOOP_ALL = LEAD + 3 * PLAY + HOLD + RESET + REST;
const LOOP_ONE = LEAD + PLAY + HOLD + RESET + REST;

// Inside one panel.
const ARRIVE = [.15, 1.05];   // the card glides onto the reader
const LEAVE = [1.95, 2.95];   // and back to where it floated

// ---------- Colours ----------
const COPPER = new T.Color(0xd08040);
const GREEN = new T.Color(0x38d07f);
const AMBER = new T.Color(0xffb347);

// ---------- Math ----------
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const cue = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = p => p * p * (3 - 2 * p);
const inOut = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const outCubic = p => 1 - (1 - p) ** 3;
const pulse = (t, a, b) => { const p = cue(t, a, b); return p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0; };

if (section && location.protocol !== 'file:') init();

function init() {
  const row = section.querySelector('.taps-row');
  const canvas = section.querySelector('.taps-canvas');
  const panels = [...section.querySelectorAll('.tap')];
  const views = panels.map(panel => panel.querySelector('.tap-view'));
  const bars = panels.map(panel => panel.querySelector('.tap-bar i'));
  const pauseButton = section.querySelector('.taps-pause');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stacked = matchMedia('(max-width: 760px)');

  let renderer = null, scene = null, sets = null, ready = false, loading = null;
  let visible = false, paused = false;
  let cycle = 0, clock = 0, last = null, frameId = 0;
  const own = [0, 0, 0];                  // each panel's own clock, for stacked layouts
  const shown = [false, false, false];    // panel at least half on screen

  // ---------- When to run ----------
  const watch = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target === section) {
        visible = entry.isIntersecting;
      } else {
        const i = views.indexOf(entry.target);
        if (i >= 0) shown[i] = entry.intersectionRatio >= .5;
      }
    }
    wake();
  }, { threshold: [0, .5] });
  watch.observe(section);
  views.forEach(view => watch.observe(view));

  // Load a little before the section scrolls in, so the models are ready when it arrives.
  const approach = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    approach.disconnect();
    load();
  }, { rootMargin: '120% 0px' });
  approach.observe(section);

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.querySelector('span').textContent = paused ? 'Play' : 'Pause';
    wake();
  });
  document.addEventListener('visibilitychange', wake);
  // Still (paused or reduced motion): draw once more when scrolling brings a panel in.
  addEventListener('scroll', () => { if (!moving()) wake(); }, { passive: true });
  motion.addEventListener('change', () => { syncMotion(); wake(); });
  stacked.addEventListener('change', wake);
  new ResizeObserver(() => { resize(); wake(); }).observe(row);
  syncMotion();

  // Dev aid (?debug): __taps.seek(seconds) freezes the loop at that moment.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__taps = {
      seek(seconds) { paused = true; cycle = seconds; own.fill(seconds); draw(); },
      play() { paused = false; wake(); }
    };
  }

  function syncMotion() {
    section.classList.toggle('is-still', motion.matches);
    pauseButton.hidden = motion.matches;
  }

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .84;
        renderer.autoClear = false;

        scene = new T.Scene();
        const studio = new T.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        scene.environment = studio.fromScene(room, .04).texture;
        scene.environmentIntensity = .9;
        studio.dispose();
        room.dispose();
        scene.add(new T.HemisphereLight(0xfffcf6, 0x928f86, .55));
        for (const [x, y, z, power] of [[-4, 6, 5, 2.1], [4, 3, -3, 1.2], [3, 5, 6, .7]]) {
          const lamp = new T.DirectionalLight(0xfffaf0, power);
          lamp.position.set(x, y, z);
          scene.add(lamp);
        }

        const loader = new GLTFLoader();
        const [ticket, card, fob] = await Promise.all([
          loadModel(loader, 'models/subway-card.glb', ['antenna-inlay', 'rfid-chip-module']),
          loadModel(loader, 'models/contactless-card.glb', ['perimeter-and-coupling-antenna', 'die-pocket-floor',
            'module-substrate', 'die-underfill', 'silicon-die', 'module-antenna']),
          loadModel(loader, 'models/rfid-fob.glb', ['protective-encapsulation', 'rfid-chip', 'antenna-coil'])
        ]);
        await fontsReady();
        sets = [gateSet(ticket.model), terminalSet(card.model), carSet(fob)];
        sets.forEach((set, i) => { set.group.position.x = (i - 1) * 60; scene.add(set.group); set.place(); });

        resize();
        // Draw every set once, hidden, so no shader compiles in the middle of a motion.
        for (const set of sets) set.apply(PLAY, 0, 0);
        renderer.compile(scene, sets[0].camera);
        ready = true;
        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault();
          ready = false;
          section.classList.remove('is-ready');
          section.classList.add('is-static');
        });
        draw();
        section.classList.add('is-ready');
        wake();
      } catch (error) {
        console.warn('The everyday taps could not start 3D; showing the words only.', error);
        section.classList.add('is-static');
        pauseButton.hidden = true;
      }
    })();
    return loading;
  }

  function resize() {
    if (!renderer) return;
    const w = row.clientWidth, h = row.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
  }

  // ---------- Frame loop ----------
  function moving() { return ready && visible && !document.hidden && !paused && !motion.matches; }

  function wake() {
    if (frameId || !ready || !visible || document.hidden) return;
    frameId = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameId = 0;
    const dt = last === null ? 0 : Math.min(.05, (now - last) / 1000);
    if (moving()) {
      advance(dt);
      last = now;
    } else last = null;
    draw();
    if (moving()) frameId = requestAnimationFrame(frame);
  }

  function advance(dt) {
    clock += dt;
    if (stacked.matches) {
      for (let i = 0; i < 3; i++) if (shown[i]) own[i] = (own[i] + dt) % LOOP_ONE;
    } else if (visible) {
      cycle = (cycle + dt) % LOOP_ALL;
    }
  }

  // Where each panel is in its own story: { t, r, fill }.
  function timeOf(i) {
    if (motion.matches) return { t: PLAY, r: 0, fill: 1 };
    if (stacked.matches) {
      const s = own[i];
      const r = smooth(cue(s, LEAD + PLAY + HOLD, LEAD + PLAY + HOLD + RESET));
      return { t: Math.min(PLAY, Math.max(0, s - LEAD)), r, fill: cue(s, LEAD, LEAD + PLAY) * (1 - r) };
    }
    const end = LEAD + 3 * PLAY;
    const r = smooth(cue(cycle, end + HOLD, end + HOLD + RESET));
    const start = LEAD + i * PLAY;
    return { t: Math.min(PLAY, Math.max(0, cycle - start)), r, fill: cue(cycle, start, start + PLAY) * (1 - r) };
  }

  function draw() {
    if (!ready) return;
    const box = row.getBoundingClientRect();
    const H = row.clientHeight;
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    sets.forEach((set, i) => {
      const { t, r, fill } = timeOf(i);
      panels[i].classList.toggle('is-on', t > .05 && r < .5);
      bars[i].style.transform = `scaleX(${fill.toFixed(4)})`;
      const v = views[i].getBoundingClientRect();
      const x = v.left - box.left, y = v.top - box.top, w = v.width, h = v.height;
      // Skip panels that are off screen (stacked layouts).
      if (!w || !h || v.bottom < 0 || v.top > innerHeight) return;
      set.apply(t, r, clock);
      set.frame(w / h);
      renderer.setViewport(x, H - y - h, w, h);
      renderer.setScissor(x, H - y - h, w, h);
      renderer.render(scene, set.camera);
    });
  }
}

// ---------- Loading ----------
// Load one of the team's models, centred. `sealed` names parts closed inside the object:
// they can never be seen here, so they are not drawn.
async function loadModel(loader, url, sealed) {
  const gltf = await loader.loadAsync(url);
  const shell = gltf.scene;
  for (const name of sealed) {
    const part = shell.getObjectByName(name);
    if (part) part.visible = false;
  }
  liftDecals(shell);
  const box = new T.Box3().setFromObject(shell);
  shell.position.sub(box.getCenter(new T.Vector3()));
  const model = new T.Group();
  model.add(shell);
  return { model, part: name => shell.getObjectByName(name) };
}

// Printed artwork lies exactly on the plastic under it, and two surfaces at one depth
// flicker. Truly flat sheets are nudged toward the viewer in depth only (as in models.js).
function liftDecals(shell) {
  const size = new T.Vector3();
  shell.traverse(part => {
    if (!part.isMesh) return;
    const geometry = part.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getSize(size);
    if (size.z > Math.max(size.x, size.y) * 1e-5) return;
    part.material = part.material.clone();
    part.material.polygonOffset = true;
    part.material.polygonOffsetFactor = -1;
    part.material.polygonOffsetUnits = -4;
  });
}

function fontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  const load = Promise.all([document.fonts.load('700 40px "Inter Tight"'), document.fonts.load('600 40px "Inter Tight"')]);
  return Promise.race([load, new Promise(resolve => setTimeout(resolve, 2000))]).catch(() => {});
}

// ---------- Shared pieces ----------
function paint(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  draw(c, width, height);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, canvas, c };
}

// A soft contact shadow: a rounded rectangle blurred by the canvas's own shadow, drawn
// off to the side so only the blur lands on the texture.
let shadowTexture = null;
function shadow(width, depth, opacity = .32) {
  shadowTexture ??= paint(256, 256, (c, w) => {
    c.shadowColor = 'rgba(28, 22, 14, 1)';
    c.shadowBlur = 34;
    c.shadowOffsetX = 1000;
    c.fillStyle = '#000';
    c.beginPath();
    c.roundRect(-1000 + 52, 52, w - 104, w - 104, 60);
    c.fill();
  }).texture;
  const mesh = new T.Mesh(new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(width, depth, 1);
  mesh.renderOrder = -1;
  return mesh;
}

// The contactless sign: four arcs.
function contactless(c, cx, cy, size, width) {
  c.lineWidth = width;
  c.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    c.beginPath();
    c.arc(cx - size * .42, cy, size * (.2 + k * .16), -.62, .62);
    c.stroke();
  }
}

function tick(c, cx, cy, size, width) {
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(cx - size * .42, cy + size * .02);
  c.lineTo(cx - size * .12, cy + size * .3);
  c.lineTo(cx + size * .44, cy - size * .3);
  c.stroke();
}

function icon(draw) {
  return paint(256, 256, (c, w) => { c.strokeStyle = '#fff'; c.fillStyle = '#fff'; draw(c, w); }).texture;
}

function light(color) {
  return new T.MeshBasicMaterial({ color, toneMapped: false });
}

// Expanding rings that fade as they grow: the reader's field, made visible.
function ripples(count, inner = .9) {
  const geometry = new T.RingGeometry(inner, 1, 96);
  const rings = [];
  const group = new T.Group();
  for (let k = 0; k < count; k++) {
    const material = new T.MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0, depthWrite: false,
      side: T.DoubleSide, toneMapped: false });
    const mesh = new T.Mesh(geometry, material);
    mesh.visible = false;
    group.add(mesh);
    rings.push(mesh);
  }
  return {
    group,
    // Ring k starts at `start + k * gap` and grows from `from` to `to` over `life` seconds.
    update(t, start, from, to, gap = .2, life = .95, strength = .7) {
      rings.forEach((ring, k) => {
        const p = cue(t, start + k * gap, start + k * gap + life);
        ring.visible = p > 0 && p < 1;
        if (!ring.visible) return;
        ring.scale.setScalar(from + (to - from) * outCubic(p));
        ring.material.opacity = strength * (1 - p) ** 1.6 * smooth(cue(p, 0, .12));
      });
    }
  };
}

// A rotation whose front (+z) faces `normal` and whose top (+y) leans toward `up`.
function facing(normal, up) {
  const z = normal.clone().normalize();
  const x = new T.Vector3().crossVectors(up, z).normalize();
  const y = new T.Vector3().crossVectors(z, x);
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}

/*
 * A card that floats at `rest`, glides onto a reader at `tap` (landing along the reader's
 * normal), presses it once, and floats back. Returns how close it is to the reader (0–1).
 */
function glider(object, rest, tap, { normal, arc, hover, press, bob, phase = 0 }) {
  const c1 = new T.Vector3(), c2 = new T.Vector3(), at = new T.Vector3(), q = new T.Quaternion();
  const wobble = new T.Quaternion(), euler = new T.Euler();
  return (t, clock) => {
    const k = inOut(cue(t, ARRIVE[0], ARRIVE[1])) * (1 - inOut(cue(t, LEAVE[0], LEAVE[1])));
    // A cubic path: out of the rest pose with a little lift, then straight down onto the reader.
    c1.copy(rest.position).lerp(tap.position, .3).y += arc;
    c2.copy(tap.position).addScaledVector(normal, hover);
    const u = 1 - k;
    at.copy(rest.position).multiplyScalar(u * u * u)
      .addScaledVector(c1, 3 * u * u * k).addScaledVector(c2, 3 * u * k * k).addScaledVector(tap.position, k * k * k);
    // The tap itself: a small press toward the reader, then back.
    at.addScaledVector(normal, -press * pulse(t, ARRIVE[1] - .05, ARRIVE[1] + .38));
    // Floating: a slow bob and sway that fades out on the way to the reader.
    const still = 1 - smooth(cue(k, 0, .35));
    at.y += Math.sin(clock * 1.25 + phase) * bob * still;
    object.position.copy(at);
    q.copy(rest.quaternion).slerp(tap.quaternion, smooth(cue(k, 0, .82)));
    euler.set(Math.sin(clock * .9 + phase) * .05 * still, Math.sin(clock * .7 + phase + 1) * .07 * still, 0);
    object.quaternion.copy(q).multiply(wobble.setFromEuler(euler));
    return k;
  };
}

// Fit a camera so a sphere of `radius` around `target` fills the panel.
function framer(camera, target, direction, radius, fov) {
  const dir = direction.clone().normalize();
  let lastAspect = 0;
  return aspect => {
    if (Math.abs(aspect - lastAspect) < 1e-4) return;
    lastAspect = aspect;
    camera.fov = fov;
    camera.aspect = aspect;
    const v = T.MathUtils.degToRad(fov) / 2, h = Math.atan(Math.tan(v) * aspect);
    const distance = radius / Math.sin(Math.min(v, h));
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.near = distance / 20;
    camera.far = distance * 4;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };
}

// ---------- 1. The metro gate ----------
function gateSet(ticket) {
  const group = new T.Group();
  const clay = new T.MeshStandardMaterial({ color: 0xdcd6cc, roughness: .5, metalness: 0 });
  const graphite = new T.MeshStandardMaterial({ color: 0x23272a, roughness: .38, metalness: .25 });
  const glass = new T.MeshPhysicalMaterial({ color: 0xc8dcd6, roughness: .06, metalness: 0, clearcoat: 1,
    clearcoatRoughness: .04, transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false });

  const CAB = { x: .43, w: .24, h: 1.02, d: 1.0 };
  const body = new RoundedBoxGeometry(CAB.w, CAB.h, CAB.d, 5, .05);
  const cap = new RoundedBoxGeometry(CAB.w + .006, .036, CAB.d + .006, 4, .016);
  const strips = [];
  for (const side of [-1, 1]) {
    const cabinet = new T.Mesh(body, clay);
    cabinet.position.set(side * CAB.x, CAB.h / 2, 0);
    const top = new T.Mesh(cap, graphite);
    top.position.set(side * CAB.x, CAB.h + .006, 0);
    // A thin light along the aisle side of each cabinet's top.
    const strip = new T.Mesh(new RoundedBoxGeometry(.012, .014, CAB.d * .78, 2, .005), light(0xd9d4ca));
    strip.position.set(side * (CAB.x - CAB.w / 2 - .002), CAB.h - .035, 0);
    strips.push(strip);
    const foot = shadow(CAB.w + .3, CAB.d + .34, .34);
    foot.position.set(side * CAB.x, .002, 0);
    group.add(cabinet, top, strip, foot);
  }

  // The reader: a dark glass pad on the near cabinet's top, at the entry end.
  const PAD = new T.Vector3(CAB.x, CAB.h + .03, .28);
  const pad = new T.Mesh(new RoundedBoxGeometry(.18, .014, .21, 3, .006), graphite);
  pad.position.copy(PAD).y -= .006;
  const sign = new T.Mesh(new T.PlaneGeometry(.12, .12),
    new T.MeshBasicMaterial({ map: icon((c, w) => contactless(c, w / 2, w / 2, w * .72, 14)), transparent: true,
      color: 0x8d9692, toneMapped: false, depthWrite: false }));
  sign.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  sign.position.copy(PAD).y += .002;
  const field = ripples(3);
  field.group.rotation.x = -Math.PI / 2;
  field.group.position.copy(PAD).y += .004;
  group.add(pad, sign, field.group);

  // A small display on the entry face of the same cabinet: contactless sign, then a tick.
  const face = new T.Mesh(new RoundedBoxGeometry(.16, .1, .01, 3, .012), graphite);
  face.position.set(CAB.x, .82, CAB.d / 2 + .002);
  const idleIcon = new T.Mesh(new T.PlaneGeometry(.07, .07), new T.MeshBasicMaterial({
    map: icon((c, w) => contactless(c, w / 2, w / 2, w * .72, 14)), transparent: true, color: 0x7d8683,
    toneMapped: false, depthWrite: false }));
  const okIcon = new T.Mesh(new T.PlaneGeometry(.08, .08), new T.MeshBasicMaterial({
    map: icon((c, w) => tick(c, w / 2, w / 2, w * .7, 20)), transparent: true, color: GREEN, opacity: 0,
    toneMapped: false, depthWrite: false }));
  for (const m of [idleIcon, okIcon]) { m.position.set(CAB.x, .82, CAB.d / 2 + .009); m.renderOrder = 2; }
  group.add(face, idleIcon, okIcon);

  // Two glass flaps meet in the middle of the aisle and swing open toward the exit.
  const FLAP = { reach: CAB.x - CAB.w / 2 - .012, low: .36, high: .88 };
  const shape = new T.Shape();
  const L = FLAP.reach, Hh = FLAP.high - FLAP.low, R = .14;
  shape.moveTo(0, 0);
  shape.lineTo(L - R, 0);
  shape.quadraticCurveTo(L, 0, L, R);
  shape.lineTo(L, Hh - R);
  shape.quadraticCurveTo(L, Hh, L - R, Hh);
  shape.lineTo(0, Hh);
  shape.closePath();
  const flapGeometry = new T.ExtrudeGeometry(shape, { depth: .01, bevelEnabled: true, bevelThickness: .004,
    bevelSize: .004, bevelSegments: 3, curveSegments: 24 });
  flapGeometry.translate(0, 0, -.005);
  const flaps = [-1, 1].map(side => {
    const hinge = new T.Group();
    hinge.position.set(side * (CAB.x - CAB.w / 2), FLAP.low, -.02);
    const flap = new T.Mesh(flapGeometry, glass);
    flap.renderOrder = 1;
    hinge.add(flap);
    group.add(hinge);
    return hinge;
  });

  // The ticket, a little larger than life so it reads next to a full-size gate.
  ticket.scale.setScalar(3.6);
  group.add(ticket);
  const camDir = new T.Vector3(.62, .74, 1.6);
  const rest = {
    position: new T.Vector3(.84, 1.76, .78),
    quaternion: facing(camDir.clone().add(new T.Vector3(-.2, .35, 0)), new T.Vector3(.12, 1, 0))
  };
  const tap = { position: PAD.clone().add(new T.Vector3(0, .012, 0)),
    quaternion: facing(new T.Vector3(0, 1, 0), new T.Vector3(-1, 0, 0)) };
  const move = glider(ticket, rest, tap, { normal: new T.Vector3(0, 1, 0), arc: .12, hover: .16, press: .012, bob: .02 });

  const camera = new T.PerspectiveCamera(22, 1, .1, 50);
  let frame = null;
  const idleStrip = new T.Color(0xd9d4ca), idleSign = new T.Color(0x8d9692);
  return {
    group, camera,
    place() { frame = framer(camera, new T.Vector3(.14, .8, .1).add(group.position), camDir, .98, 22); },
    frame: aspect => frame(aspect),
    apply(t, r, clock) {
      move(t, clock);
      field.update(t, ARRIVE[1] - .02, .085, .3);
      const ok = smooth(cue(t, 1.5, 1.8)) * (1 - r);
      const open = inOut(cue(t, 1.75, 2.75)) * (1 - r);
      for (const strip of strips) strip.material.color.copy(idleStrip).lerp(GREEN, ok);
      sign.material.color.copy(idleSign).lerp(GREEN, ok);
      okIcon.material.opacity = ok;
      okIcon.scale.setScalar(.75 + .25 * outCubic(ok));
      idleIcon.material.opacity = 1 - ok;
      flaps[0].rotation.y = Math.PI / 2 * open;
      flaps[1].rotation.y = Math.PI - Math.PI / 2 * open;
    }
  };
}

// ---------- 2. The payment terminal ----------
function terminalSet(card) {
  const group = new T.Group();
  const graphite = new T.MeshStandardMaterial({ color: 0x24282b, roughness: .42, metalness: .2 });
  const bezel = new T.MeshPhysicalMaterial({ color: 0x0d0f10, roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .05 });

  // Lying back on the counter, its screen turned up toward the viewer.
  const terminal = new T.Group();
  terminal.position.set(0, .07, 0);
  terminal.rotation.x = -1.12;
  const body = new T.Mesh(new RoundedBoxGeometry(.088, .172, .024, 6, .01), graphite);
  const front = new T.Mesh(new RoundedBoxGeometry(.08, .162, .004, 4, .007), bezel);
  front.position.z = .011;
  terminal.add(body, front);

  // The screen, redrawn only when what it shows changes.
  const screen = paint(320, 420, () => {});
  const display = new T.Mesh(new T.PlaneGeometry(.068, .0893), new T.MeshBasicMaterial({ map: screen.texture, toneMapped: false }));
  display.position.set(0, -.012, .0132);
  terminal.add(display);
  let drawn = -1;
  function drawScreen(ok) {
    const key = Math.round(ok * 60);
    if (key === drawn) return;
    drawn = key;
    const { c, canvas } = screen, w = canvas.width, h = canvas.height;
    c.fillStyle = '#111416';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = 'rgba(236, 232, 224, .55)';
    c.font = '600 26px "Inter Tight", Arial, sans-serif';
    c.fillText('Total', w / 2, 66);
    c.fillStyle = '#f2eee6';
    c.font = '700 58px "Inter Tight", Arial, sans-serif';
    c.fillText('4.50', w / 2, 128);
    // Waiting: the contactless sign. Done: a green tick in a circle.
    c.globalAlpha = 1 - ok;
    c.strokeStyle = '#cfcac0';
    contactless(c, w / 2, 248, 120, 9);
    c.fillStyle = 'rgba(236, 232, 224, .6)';
    c.font = '600 26px "Inter Tight", Arial, sans-serif';
    c.fillText('Tap card', w / 2, 370);
    c.globalAlpha = ok;
    const s = .8 + .2 * outCubic(ok);
    c.fillStyle = '#22b46a';
    c.beginPath();
    c.arc(w / 2, 246, 66 * s, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    tick(c, w / 2, 248, 72 * s, 11);
    c.fillStyle = '#f2eee6';
    c.font = '700 30px "Inter Tight", Arial, sans-serif';
    c.fillText('Approved', w / 2, 370);
    c.globalAlpha = 1;
    screen.texture.needsUpdate = true;
  }

  // Four status lights above the screen, lit one after another as the card is read.
  const leds = [-1.5, -.5, .5, 1.5].map(k => {
    const dot = new T.Mesh(new T.CircleGeometry(.0024, 32), light(0x30363a));
    dot.position.set(k * .011, .062, .0132);
    terminal.add(dot);
    return dot;
  });
  const field = ripples(3, .94);
  field.group.position.set(0, -.012, .0136);
  terminal.add(field.group);
  group.add(terminal);
  const foot = shadow(.16, .14, .3);
  foot.position.set(0, .001, .01);
  group.add(foot);

  // The card, at its true size.
  card.scale.setScalar(1);
  group.add(card);
  terminal.updateMatrixWorld(true);
  const normal = new T.Vector3(0, 0, 1).applyQuaternion(terminal.quaternion);
  const camDir = new T.Vector3(.32, 1, 1.25);
  const rest = {
    position: new T.Vector3(-.064, .19, .1),
    quaternion: facing(camDir.clone().add(new T.Vector3(.25, .1, 0)), new T.Vector3(-.15, 1, 0))
  };
  const tapRotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), .14);
  const tap = {
    position: new T.Vector3(.004, -.018, .026).applyMatrix4(terminal.matrix),
    quaternion: terminal.quaternion.clone().multiply(tapRotation)
  };
  const move = glider(card, rest, tap, { normal, arc: .03, hover: .05, press: .004, bob: .004, phase: 2 });

  const camera = new T.PerspectiveCamera(22, 1, .01, 10);
  let frame = null;
  const off = new T.Color(0x30363a);
  return {
    group, camera,
    place() { frame = framer(camera, new T.Vector3(-.012, .1, .02).add(group.position), camDir, .158, 22); },
    frame: aspect => frame(aspect),
    apply(t, r, clock) {
      move(t, clock);
      field.update(t, ARRIVE[1] - .02, .052, .1, .2, .9, .6);
      leds.forEach((dot, k) => dot.material.color.copy(off).lerp(GREEN, smooth(cue(t, 1.12 + k * .16, 1.2 + k * .16)) * (1 - r)));
      drawScreen(smooth(cue(t, 1.78, 2.08)) * (1 - r));
    }
  };
}

// ---------- 3. The key and the car ----------
function carSet(fob) {
  const group = new T.Group();
  const paintMat = new T.MeshPhysicalMaterial({ color: 0xd6d0c6, roughness: .4, metalness: .02, clearcoat: .55, clearcoatRoughness: .22,
    envMapIntensity: .75 });
  const glass = new T.MeshPhysicalMaterial({ color: 0x15191c, roughness: .08, metalness: .1, clearcoat: 1, clearcoatRoughness: .04 });
  const rubber = new T.MeshStandardMaterial({ color: 0x1c1d1f, roughness: .86 });
  const alloy = new T.MeshStandardMaterial({ color: 0xc4c7ca, roughness: .3, metalness: .85 });
  const dark = new T.MeshStandardMaterial({ color: 0x2a2d30, roughness: .5, metalness: .2 });

  // The body: one side outline (front at +x), extruded across the car with soft edges.
  const W = 1.78, BEVEL = .08, BT = .1;
  const profile = new T.Shape();
  profile.moveTo(-2.02, .3);
  profile.bezierCurveTo(-2.12, .42, -2.12, .78, -2.02, .86);
  profile.lineTo(-1.64, .93);
  profile.bezierCurveTo(-1.36, 1.05, -1.06, 1.36, -.8, 1.4);
  profile.lineTo(.2, 1.42);
  const windshield = new T.CubicBezierCurve(new T.Vector2(.2, 1.42), new T.Vector2(.5, 1.4), new T.Vector2(.84, 1.12), new T.Vector2(1.12, .97));
  profile.bezierCurveTo(.5, 1.4, .84, 1.12, 1.12, .97);
  profile.bezierCurveTo(1.5, .92, 1.88, .86, 2.02, .76);
  profile.bezierCurveTo(2.12, .66, 2.12, .4, 2.04, .3);
  profile.lineTo(1.72, .3);
  profile.absarc(1.3, .3, .42, 0, Math.PI, false);
  profile.lineTo(-.88, .3);
  profile.absarc(-1.3, .3, .42, 0, Math.PI, false);
  profile.lineTo(-2.02, .3);
  const depth = W - 2 * BT;
  const bodyGeometry = new T.ExtrudeGeometry(profile, { depth, bevelEnabled: true, bevelThickness: BT, bevelSize: BEVEL,
    bevelSegments: 8, curveSegments: 40 });
  bodyGeometry.translate(0, 0, -depth / 2);
  const car = new T.Group();
  car.add(new T.Mesh(bodyGeometry, paintMat));

  // Glass that follows a curve of the outline, lifted just off the paint.
  function ribbon(curve, from, to, half, lift) {
    const points = [], normals = [];
    for (let k = 0; k <= 24; k++) {
      const u = from + (to - from) * k / 24;
      const p = curve.getPoint(u), d = curve.getTangent(u);
      points.push(p);
      normals.push(new T.Vector2(-d.y, d.x));   // pointing out of the body
    }
    const position = [], index = [];
    points.forEach((p, k) => {
      const n = normals[k];
      position.push(p.x + n.x * lift, p.y + n.y * lift, -half, p.x + n.x * lift, p.y + n.y * lift, half);
      if (k) { const a = (k - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return new T.Mesh(geometry, glass);
  }
  const shield = ribbon(windshield, .08, .9, depth / 2 - .06, BEVEL + .004);
  shield.material = glass.clone();
  shield.material.side = T.DoubleSide;
  const rearCurve = new T.CubicBezierCurve(new T.Vector2(-1.64, .93), new T.Vector2(-1.36, 1.05), new T.Vector2(-1.06, 1.36), new T.Vector2(-.8, 1.4));
  const rearGlass = ribbon(rearCurve, .12, .88, depth / 2 - .06, BEVEL + .004);
  rearGlass.material = shield.material;
  car.add(shield, rearGlass);

  // Side windows, flush with the flat sides.
  function flat(points, z, material, thickness = .006) {
    const s = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
    const g = new T.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
    const mesh = new T.Mesh(g, material);
    mesh.position.z = z;
    return mesh;
  }
  const FRONT_WINDOW = [[.04, 1.02], [.86, 1.02], [.32, 1.33], [.04, 1.34]];
  const REAR_WINDOW = [[-.06, 1.02], [-.06, 1.34], [-.78, 1.33], [-1.3, 1.03]];
  car.add(flat(REAR_WINDOW, W / 2 + .001, glass));
  car.add(flat(FRONT_WINDOW.map(([x, y]) => [x, y]), -W / 2 - .007, glass), flat(REAR_WINDOW, -W / 2 - .007, glass));

  // The near front door: the panel and its window turn on a hinge at the front edge.
  // Behind it, a dark opening (with a warm light inside) waits to be seen.
  const DOOR = [[.04, .4], [.84, .4], [.84, 1.0], [.04, 1.0]];
  const interior = new T.MeshStandardMaterial({ color: 0x23201d, roughness: .9, emissive: 0x000000 });
  const opening = flat([[.04, .4], [.84, .4], [.84, 1.02], [.32, 1.33], [.04, 1.34]], W / 2 - .002, interior, .004);
  car.add(opening);
  const hinge = new T.Group();
  hinge.position.set(.84, 0, W / 2 + .006);
  const doorShape = new T.Shape(DOOR.map(([x, y]) => new T.Vector2(x - .84, y)));
  const doorGeometry = new T.ExtrudeGeometry(doorShape, { depth: .03, bevelEnabled: true, bevelThickness: .012, bevelSize: .012,
    bevelSegments: 4, curveSegments: 8 });
  doorGeometry.translate(0, 0, -.042);
  const door = new T.Mesh(doorGeometry, paintMat);
  const doorWindow = flat(FRONT_WINDOW.map(([x, y]) => [x - .84, y]), -.004, glass);
  const handle = new T.Mesh(new RoundedBoxGeometry(.16, .028, .02, 2, .009), dark);
  handle.position.set(-.62, .86, .006);
  hinge.add(door, doorWindow, handle);
  car.add(hinge);

  // Mirrors, and a slim light bar across the front.
  for (const side of [-1, 1]) {
    const mirror = new T.Mesh(new RoundedBoxGeometry(.16, .09, .1, 3, .03), dark);
    mirror.position.set(.9, 1.05, side * (W / 2 + .06));
    car.add(mirror);
  }
  const lamp = light(0x2b2e31);
  const frontBar = new T.Mesh(new RoundedBoxGeometry(.03, .045, 1.36, 3, .014), lamp);
  frontBar.position.set(2.162, .66, 0);
  frontBar.rotation.z = .5;
  const rearBar = new T.Mesh(new RoundedBoxGeometry(.03, .05, 1.36, 3, .014), light(0x6e2019));
  rearBar.position.set(-2.168, .74, 0);
  car.add(frontBar, rearBar);

  // Wheels: a rounded tyre turned on a lathe, and an alloy rim.
  const tyreProfile = [];
  const RO = .34, RI = .21, HW = .12, RC = .07;
  tyreProfile.push(new T.Vector2(RI, -HW));
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI / 2; tyreProfile.push(new T.Vector2(RO - RC + Math.cos(a) * RC, -HW + RC + Math.sin(a) * RC)); }
  for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI / 2; tyreProfile.push(new T.Vector2(RO - RC + Math.cos(a) * RC, HW - RC + Math.sin(a) * RC)); }
  tyreProfile.push(new T.Vector2(RI, HW));
  const tyreGeometry = new T.LatheGeometry(tyreProfile, 56);
  tyreGeometry.rotateX(Math.PI / 2);
  const rimGeometry = new T.CylinderGeometry(.215, .215, .2, 48);
  rimGeometry.rotateX(Math.PI / 2);
  const hubGeometry = new T.CylinderGeometry(.075, .075, .21, 32);
  hubGeometry.rotateX(Math.PI / 2);
  for (const x of [-1.3, 1.3]) for (const side of [-1, 1]) {
    const wheel = new T.Group();
    wheel.position.set(x, .34, side * (W / 2 - .15));
    wheel.add(new T.Mesh(tyreGeometry, rubber), new T.Mesh(rimGeometry, alloy), new T.Mesh(hubGeometry, dark));
    car.add(wheel);
  }
  const ground = shadow(5.2, 2.5, .38);
  ground.position.y = .002;
  car.add(ground);
  group.add(car);

  // The key, floating large above the car, buttons toward the viewer.
  const camDir = new T.Vector3(1.0, .5, 1.3);
  const key = fob.model;
  const SCALE = 19;
  key.scale.setScalar(SCALE);
  const holder = new T.Group();
  holder.position.set(-.5, 2.62, 1.3);
  holder.quaternion.copy(facing(camDir.clone().add(new T.Vector3(-.3, .1, 0)), new T.Vector3(-.2, 1, 0)));
  holder.add(key);
  group.add(holder);
  const unlock = fob.part('unlock-button');
  const unlockRest = unlock ? unlock.position.z : 0;
  let lampMaterial = null, lampBase = null;
  fob.part('indicator-light-guide')?.traverse(o => {
    if (!lampMaterial && o.isMesh && o.material?.emissive) {
      o.material = lampMaterial = o.material.clone();
      lampBase = lampMaterial.emissive.clone();
    }
  });
  const signal = ripples(3, .93);
  group.add(signal.group);

  const camera = new T.PerspectiveCamera(22, 1, .1, 100);
  let frame = null;
  const lampIdle = new T.Color(0x2b2e31), warm = new T.Color(0x5a3f22);
  const holderRest = holder.position.clone(), restQuaternion = holder.quaternion.clone();
  const nod = new T.Quaternion(), axis = new T.Vector3(1, 0, 0);
  return {
    group, camera,
    place() {
      frame = framer(camera, new T.Vector3(.05, 1.12, .3).add(group.position), camDir, 2.55, 22);
    },
    frame: aspect => frame(aspect),
    apply(t, r, clock) {
      // The key floats, leans in for the press, and settles back.
      const lean = inOut(cue(t, .1, .7)) * (1 - inOut(cue(t, 2.0, 2.9)));
      const still = 1 - lean;
      holder.position.copy(holderRest);
      holder.position.y += Math.sin(clock * 1.2 + 4) * .05 * still;
      holder.quaternion.copy(restQuaternion).multiply(nod.setFromAxisAngle(axis, -.16 * lean + Math.sin(clock * .8) * .04 * still));
      const press = pulse(t, .72, 1.0);
      key.scale.setScalar(SCALE * (1 - .02 * press));
      if (unlock) { unlock.position.z = unlockRest - .0009 * press; unlock.updateMatrix(); }
      const glow = smooth(cue(t, .74, .84)) * (1 - smooth(cue(t, 1.2, 2.2)));
      if (lampMaterial) lampMaterial.emissive.setRGB(lampBase.r + .25 * glow, lampBase.g + 1.5 * glow, lampBase.b + .7 * glow);

      // The signal leaves the key toward the car.
      signal.group.position.copy(holder.position);
      signal.group.lookAt(camera.position);
      signal.update(t, .8, .25, 1.25, .17, 1.0, .5);

      // Lights blink twice, then the door swings open and the cabin light comes on.
      const blink = Math.max(pulse(t, 1.3, 1.62), pulse(t, 1.7, 2.02)) ** 1.5;
      lamp.color.copy(lampIdle).lerp(AMBER, blink);
      rearBar.material.color.setHex(0x6e2019).lerp(AMBER, blink);
      const open = inOut(cue(t, 1.95, 2.95)) * (1 - r);
      hinge.rotation.y = 1.0 * open;
      interior.emissive.copy(warm).multiplyScalar(open * .5);
    }
  };
}
