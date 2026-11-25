/*
 * scene3d.js — the 3D view. three.js only draws; all physics comes from
 * physics.js through window.App (field lines are traced there, glow levels
 * follow the computed currents and chip voltage).
 *
 * World units are metres. The reader's coil lies in the y = 0 plane, centred
 * on the origin; the tag hovers above it. The camera looks along -z, so the
 * x–y plane (where the field lines are traced) faces the viewer.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const App = window.App;
const R = window.RFID;

main().catch((err) => {
  console.error('3D view failed:', err);
  App.sceneStatus('failed');
});

async function main() {
  const canvas = document.getElementById('scene');
  const stage = document.getElementById('stage');
  const labelsEl = document.getElementById('labels');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    App.sceneStatus('failed');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.005, 5);
  const target = new THREE.Vector3(-0.004, 0.045, 0);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2238, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.15, 0.4, 0.3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fd8ff, 0.7);
  rim.position.set(-0.3, 0.1, -0.3);
  scene.add(rim);

  // ------------------------------------------------------------ helpers
  const COPPER = new THREE.Color('#ff9a3c');
  const ENERGY = new THREE.Color('#ffb627');
  const TALK = new THREE.Color('#ff4f93');
  const AWAKE = new THREE.Color('#3be38d');
  const FIELD = new THREE.Color('#3fd0f0');

  function basisQuat(xImg, yImg, zImg) {
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...xImg), new THREE.Vector3(...yImg), new THREE.Vector3(...zImg));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  function softTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const dotTex = softTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  // Prepare a loaded model: clone materials so each mesh can be faded/glowed on its own.
  function prepareModel(root, glowNames, chipNames) {
    const glow = [], chip = [], shell = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const m = o.material;
      let isGlow = false, isChip = false;
      for (let p = o; p; p = p.parent) {
        if (glowNames.includes(p.name)) isGlow = true;
        if (chipNames.includes(p.name)) isChip = true;
      }
      const rec = { mesh: o, mat: m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
      if (isGlow) { m.emissive = new THREE.Color(0, 0, 0); glow.push(rec); }
      else if (isChip) { m.emissive = new THREE.Color(0, 0, 0); chip.push(rec); }
      else shell.push(rec);
    });
    return { glow, chip, shell };
  }

  function setXray(parts, on, level) {
    parts.shell.forEach((r) => {
      r.mat.transparent = on ? true : r.transparent;
      r.mat.opacity = on ? Math.min(r.opacity, level) : r.opacity;
      r.mat.depthWrite = on ? false : r.depthWrite;
      r.mat.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------ reader: shop terminal (procedural)
  function makeTerminal() {
    const g = new THREE.Group();
    const spec = R.READERS.terminal;
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#2b3244', roughness: 0.55, metalness: 0.2 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.112, 0.026, 0.112, 6, 0.008), bodyMat);
    body.position.y = spec.surface - 0.013 - 0.0015;
    g.add(body);
    // top glass with the contactless symbol
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#1b2233'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(220,230,250,.85)'; x.lineWidth = 16; x.lineCap = 'round';
    [70, 120, 170].forEach((r) => { x.beginPath(); x.arc(150, 256, r, -0.62, 0.62); x.stroke(); });
    x.fillStyle = 'rgba(220,230,250,.85)'; x.beginPath(); x.arc(150, 256, 18, 0, Math.PI * 2); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const glassMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.096), glassMat);
    glass.rotation.x = -Math.PI / 2;
    glass.rotation.z = -Math.PI / 2;
    glass.position.y = spec.surface - 0.0014;
    g.add(glass);
    // the coil itself, from the same turn sizes the physics uses
    const coilMat = new THREE.MeshStandardMaterial({ color: '#c46a2a', metalness: 0.85, roughness: 0.35, emissive: new THREE.Color(0, 0, 0) });
    R.coilTurns(spec.coil).forEach((t) => {
      const path = new THREE.CurvePath();
      const pts = [[t.hw, t.hh], [-t.hw, t.hh], [-t.hw, -t.hh], [t.hw, -t.hh]];
      for (let i = 0; i < 4; i++) {
        const a = pts[i], b = pts[(i + 1) % 4];
        path.add(new THREE.LineCurve3(new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1])));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.0006, 6, true), coilMat);
      g.add(tube);
    });
    // status LEDs (front edge)
    const leds = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#2a3550', emissive: new THREE.Color(0, 0, 0), roughness: 0.4 });
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 16), m);
      led.position.set(-0.0135 + i * 0.009, spec.surface - 0.0008, 0.046);
      g.add(led); leds.push(m);
    }
    const parts = { glow: [{ mat: coilMat }], chip: [], shell: [bodyMat, glassMat].map((m) => ({ mat: m, opacity: 1, transparent: false, depthWrite: true })) };
    return { group: g, parts, leds, xrayLevel: 0.22 };
  }

  // ------------------------------------------------------------ models
  const loader = new GLTFLoader();
  const loadModel = (url) => new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));

  const readers = { terminal: makeTerminal() };
  scene.add(readers.terminal.group);
  const tags = {};
  const tagRoot = new THREE.Group();      // positioned at the tag's coil centre
  scene.add(tagRoot);

  const pending = [
    loadModel('models/card.glb').then((m) => {
      // card: local z (front) -> world +y, local x stays along x
      m.quaternion.copy(basisQuat([1, 0, 0], [0, 0, -1], [0, 1, 0]));
      m.position.set(0.0003, 0, 0);
      const g = new THREE.Group(); g.add(m);
      const parts = prepareModel(m, ['perimeter-and-coupling-antenna', 'module-antenna'], ['silicon-die']);
      tags.card = { group: g, parts, xrayLevel: 0.2, chipLocal: new THREE.Vector3(-0.0277 + 0.0003, 0.0004, -0.0031), coilCorner: new THREE.Vector3(0.0407, 0, 0.0246), lblTag: [30, -16], lblChip: [-10, -26] };
    }),
    loadModel('models/fob.glb').then((m) => {
      // fob: long side (local y) -> world x, front (local z) -> world +y
      m.quaternion.copy(basisQuat([0, 0, 1], [1, 0, 0], [0, 1, 0]));
      m.position.set(-0.0038, 0.001, 0);
      const g = new THREE.Group(); g.add(m);
      const parts = prepareModel(m, ['antenna-coil'], ['rfid-ic-package']);
      tags.fob = { group: g, parts, xrayLevel: 0.16, chipLocal: new THREE.Vector3(-0.0023 - 0.0038, 0.0006, 0.0046), coilCorner: new THREE.Vector3(0.0145, 0, 0.0097), lblTag: [64, 16], lblChip: [-56, -18] };
    }),
    loadModel('models/phone.glb').then((m) => {
      // phone: back (local -z) -> world +y, long side (local y) -> world x
      m.quaternion.copy(basisQuat([0, 0, -1], [1, 0, 0], [0, -1, 0]));
      m.position.set(-0.0423, -0.0005, 0);
      const g = new THREE.Group(); g.add(m);
      const parts = prepareModel(m, ['nfc-antenna'], []);
      readers.phone = { group: g, parts, leds: [], xrayLevel: 0.12 };
      g.visible = false;
      scene.add(g);
    }),
  ];

  // ------------------------------------------------------------ field lines (traced by physics.js)
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);
  const lineMats = [];
  let particles = null, fieldFor = null;

  function buildField(readerId) {
    fieldGroup.clear();
    lineMats.length = 0;
    const lines = R.fieldLines(readerId, { count: 10 });
    const rd = R.readerModel(readerId);
    const Bref = Math.hypot(...R.bField(rd.segs, 0, 0.06, 0, [0, 0, 0]));
    const tracks = [];
    [0, Math.PI / 2].forEach((rot, plane) => {
      lines.forEach((ln) => {
        const pos = [], col = [];
        const cosr = Math.cos(rot), sinr = Math.sin(rot);
        ln.pts.forEach((p, i) => {
          const x = p[0] * cosr, z = -p[0] * sinr, y = p[1];
          pos.push(x, y, z);
          const s = ln.strength[Math.min(i, ln.strength.length - 1)] || Bref;
          let b = 0.42 + 0.22 * Math.log10(s / Bref);
          b = Math.min(1, Math.max(0.12, b));
          if (y < 0) b *= 0.3;
          if (plane === 1) b *= 0.45;
          col.push(FIELD.r * b, FIELD.g * b, FIELD.b * b);
        });
        const geo = new LineGeometry();
        geo.setPositions(pos);
        geo.setColors(col);
        const mat = new LineMaterial({ vertexColors: true, linewidth: plane === 0 ? 2.2 : 1.4, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        lineMats.push(mat);
        const l = new Line2(geo, mat);
        l.computeLineDistances();
        fieldGroup.add(l);
        // resample at even spacing for the moving dots
        const pts = ln.pts.map((p) => new THREE.Vector3(p[0] * cosr, p[1], -p[0] * sinr));
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
        const L = cum[cum.length - 1];
        const step = 0.001, even = [];
        let j = 1;
        for (let s = 0; s <= L; s += step) {
          while (j < cum.length - 1 && cum[j] < s) j++;
          const t = (s - cum[j - 1]) / Math.max(cum[j] - cum[j - 1], 1e-9);
          even.push(new THREE.Vector3().lerpVectors(pts[j - 1], pts[j], t));
        }
        const n = Math.max(3, Math.round(L / (plane === 0 ? 0.013 : 0.02)));
        tracks.push({ even, L, n, plane, closed: ln.closed });
      });
    });
    const count = tracks.reduce((a, t) => a + t.n, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.0042, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    particles = { pts: new THREE.Points(geo, mat), tracks, count, phase: 0 };
    fieldGroup.add(particles.pts);
    fieldFor = readerId;
    resize();
  }

  // ------------------------------------------------------------ distance ruler + shadow
  const rulerMat = new THREE.LineDashedMaterial({ color: 0x3fd0f0, dashSize: 0.002, gapSize: 0.0015, transparent: true, opacity: 0.9 });
  const rulerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
  const ruler = new THREE.Line(rulerGeo, rulerMat);
  scene.add(ruler);
  const tickGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.004, 0, 0), new THREE.Vector3(0.004, 0, 0)]);
  const tickA = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0x3fd0f0 }));
  const tickB = tickA.clone();
  scene.add(tickA, tickB);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // ------------------------------------------------------------ labels
  function mkLabel(cls, text) {
    const d = document.createElement('div');
    d.className = 'lbl ' + cls; d.textContent = text;
    labelsEl.appendChild(d);
    return d;
  }
  const lbl = {
    reader: mkLabel('field', 'Reader’s coil'),
    tag: mkLabel('energy', 'Card’s antenna'),
    chip: mkLabel('', 'Chip'),
    dist: mkLabel('dist', ''),
  };
  const hint = document.getElementById('dragHint');
  const tmp = new THREE.Vector3();
  function place(div, v, dx, dy) {
    tmp.copy(v).project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const x = (tmp.x * 0.5 + 0.5) * w + (dx || 0), y = (-tmp.y * 0.5 + 0.5) * h + (dy || 0);
    div.style.left = x + 'px'; div.style.top = y + 'px';
    div.style.opacity = tmp.z < 1 && x > -40 && x < w + 40 && y > -20 && y < h + 20 ? '' : '0';
    return { x, y };
  }

  // ------------------------------------------------------------ camera framing
  function frameCamera() {
    const w = stage.clientWidth || 800, h = stage.clientHeight || 520;
    camera.aspect = w / h;
    const narrow = camera.aspect < 1.25;                // phones: leave room for the overlays
    target.set(-0.004, narrow ? 0.03 : 0.045, 0);
    const vh = narrow ? 0.25 : 0.205, vw = narrow ? 0.25 : 0.27;   // region we want to see (m)
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(vh / (2 * t), vw / (2 * t * camera.aspect));
    const dir = new THREE.Vector3(0.18, 0.42, 1).normalize();
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    frameCamera();
    lineMats.forEach((m) => m.resolution.set(w, h));
  }
  new ResizeObserver(resize).observe(stage);

  // ------------------------------------------------------------ dragging
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let drag = null;
  function pointerHit(e) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = pointerHit(e);
    if (!p) return;
    const st = App.state, ph = App.phys;
    drag = { id: e.pointerId, dx: st.offset - p.x, dy: ph.height - p.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
    App.hideHint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointerHit(e);
    if (!p) return;
    let x = p.x + drag.dx;
    if (Math.abs(x) < 0.006) x = 0;                     // gentle snap to the centre
    App.set({ dist: p.y + drag.dy, offset: x }, 'drag');
  });
  const endDrag = () => { drag = null; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    const st = App.state, step = e.shiftKey ? 0.01 : 0.002;
    const k = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[e.key];
    if (!k) return;
    e.preventDefault();
    App.hideHint();
    App.set({ dist: App.phys.height + k[0], offset: st.offset + k[1] }, 'key');
  });

  // ------------------------------------------------------------ state -> scene
  let current = { reader: null, tag: null, xray: null };
  const shown = { x: App.state.offset, y: App.phys.height, tilt: App.state.tilt };
  let readFlash = 0;
  App.on('read', (r) => { if (r && r.heard) readFlash = 1; });

  function applyChoice() {
    const st = App.state;
    if (current.reader !== st.reader && readers[st.reader]) {
      Object.entries(readers).forEach(([id, r]) => { r.group.visible = id === st.reader; });
      current.reader = st.reader;
      lbl.reader.textContent = st.reader === 'phone' ? 'Phone’s NFC coil' : 'Reader’s coil';
      current.xray = null;
    }
    if (current.tag !== st.tag && tags[st.tag]) {
      tagRoot.clear();
      tagRoot.add(tags[st.tag].group);
      current.tag = st.tag;
      lbl.tag.textContent = st.tag === 'fob' ? 'Fob’s antenna coil' : 'Card’s antenna';
      current.xray = null;
    }
    if (current.xray !== st.xray) {
      Object.values(readers).forEach((r) => setXray(r.parts, st.xray, r.xrayLevel));
      Object.values(tags).forEach((t) => setXray(t.parts, st.xray, t.xrayLevel));
      current.xray = st.xray;
    }
    if (fieldFor !== st.reader) buildField(st.reader);
    fieldGroup.visible = st.fieldLines;
  }

  // ------------------------------------------------------------ animation
  let visibleStage = true;
  new IntersectionObserver((en) => { visibleStage = en[0].isIntersecting; }, { rootMargin: '100px' }).observe(stage);
  const clock = new THREE.Clock();
  let t = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visibleStage || document.hidden) return;
    t += dt;
    applyChoice();
    const st = App.state, ph = App.phys;

    // smooth the tag towards the physics pose (instant while dragging)
    const k = drag ? 1 : 1 - Math.pow(0.0005, dt);
    shown.x += (ph.pose.x - shown.x) * k;
    shown.y += (ph.pose.y - shown.y) * k;
    shown.tilt += (ph.pose.tilt - shown.tilt) * k;
    tagRoot.position.set(shown.x, shown.y, 0);
    tagRoot.rotation.set(0, 0, shown.tilt);

    // glow levels from the computed physics
    const energy = Math.min(1, Math.max(0, (Math.log10(Math.max(ph.ratio, 1e-4)) + 2) / 2.6));
    const talking = st.hold && ph.awake;
    readFlash = Math.max(0, readFlash - dt * 3.2);
    const flick = readFlash > 0 ? (Math.sin(t * 90) > 0 ? 1 : 0.25) * readFlash : 0;
    const tag = tags[current.tag];
    if (tag) {
      tag.parts.glow.forEach((r) => {
        r.mat.emissive.copy(talking ? TALK : COPPER).multiplyScalar(talking ? 1.4 : 0.15 + energy * 1.6 + flick * 0.8);
      });
      tag.parts.chip.forEach((r) => {
        r.mat.emissive.copy(talking ? TALK : AWAKE).multiplyScalar(ph.awake ? 1.6 + 0.5 * Math.sin(t * 6) : 0);
      });
    }
    const rd = readers[current.reader];
    if (rd) {
      const base = 0.25 + 0.25 * Math.sin(t * 2.1);
      rd.parts.glow.forEach((r) => {
        r.mat.emissive.copy(talking || flick > 0.3 ? TALK : FIELD).multiplyScalar(talking ? 0.9 : base + flick * 1.2);
      });
      const lastOk = App.lastRead && App.lastRead.heard && App.lastRead.chk && App.lastRead.chk.passed && !App.lastRead.brownout && ph.awake;
      rd.leds.forEach((m, i) => { m.emissive.set(lastOk ? '#3be38d' : i === 0 ? '#1d6b4a' : '#000000').multiplyScalar(lastOk ? 2.2 : 0.6); });
    }

    // moving dots along the field lines: they drift one way, slow, and reverse,
    // because the real field flips direction (13.56 million times a second)
    if (particles && st.fieldLines) {
      const swing = Math.sin((t * Math.PI * 2) / 3.2);
      particles.phase += dt * 0.03 * swing;
      const pos = particles.pts.geometry.attributes.position.array;
      const col = particles.pts.geometry.attributes.color.array;
      const bright = 0.35 + 0.65 * Math.abs(swing);
      let i = 0;
      particles.tracks.forEach((tr) => {
        for (let j = 0; j < tr.n; j++) {
          let s = ((j / tr.n) * tr.L + particles.phase) % tr.L;
          if (s < 0) s += tr.L;
          const p = tr.even[Math.min(tr.even.length - 1, Math.floor(s / 0.001))];
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          const b = (tr.plane === 0 ? 1 : 0.4) * bright * (p.y < 0 ? 0.25 : 1);
          col[i * 3] = 0.55 * b; col[i * 3 + 1] = 0.92 * b; col[i * 3 + 2] = 1.0 * b;
          i++;
        }
      });
      particles.pts.geometry.attributes.position.needsUpdate = true;
      particles.pts.geometry.attributes.color.needsUpdate = true;
      lineMats.forEach((m) => { m.opacity = 0.55 + 0.35 * Math.abs(swing); });
    }

    // ruler from the reader coil plane up to the tag coil
    const spec = R.TAGS[current.tag || st.tag];
    const rx = shown.x + (spec.halfLen + 0.012) * Math.cos(shown.tilt) * (shown.x < -0.03 ? -1 : 1);
    ruler.position.set(rx, 0, 0);
    ruler.scale.set(1, Math.max(shown.y, 1e-4), 1);
    ruler.computeLineDistances();
    rulerMat.scale = 1;
    tickA.position.set(rx, 0, 0);
    tickB.position.set(rx, shown.y, 0);
    const surface = R.READERS[current.reader || st.reader].surface;
    shadow.position.set(shown.x, surface + 0.0003, 0);
    const sh = Math.max(0.0, Math.min(1, 1 - (shown.y - surface) / 0.12));
    shadow.scale.set(spec.halfLen * 2.6 * (1 + (shown.y - surface) * 4), spec.halfLen * 2.0, 1);
    shadow.material.opacity = 0.65 * sh;

    renderer.render(scene, camera);

    // HTML labels follow the 3D anchors
    const rspec = R.coilTurns(R.READERS[current.reader || st.reader].coil)[0];
    place(lbl.reader, new THREE.Vector3(-(rspec.hw + 0.004), 0, rspec.hh), -40, 14);
    if (tag) {
      const corner = tag.coilCorner.clone().applyMatrix4(tagRoot.matrixWorld);
      place(lbl.tag, corner, tag.lblTag[0], tag.lblTag[1]);
      const chipPos = tag.chipLocal.clone().applyMatrix4(tagRoot.matrixWorld);
      place(lbl.chip, chipPos, tag.lblChip[0], tag.lblChip[1]);
      lbl.chip.textContent = ph.awake ? (talking ? 'Chip: switch closed' : 'Chip: awake') : 'Chip: asleep';
      lbl.chip.className = 'lbl ' + (ph.awake ? 'chip-on' : '');
    }
    lbl.dist.textContent = (ph.height * 100).toFixed(1) + ' cm';
    place(lbl.dist, new THREE.Vector3(rx, shown.y / 2, 0), 0, 0);
    if (hint && !hint.classList.contains('gone')) {
      const hp = place(hint, new THREE.Vector3(shown.x, shown.y + 0.018, 0), 0, -18);
      hint.style.left = hp.x + 'px'; hint.style.top = hp.y + 'px';
    }
  }

  // show the scene once the default tag is ready; the rest keep loading
  await Promise.race([pending[0], new Promise((r) => setTimeout(r, 8000))]);
  applyChoice();
  resize();
  App.sceneStatus('ready');
  animate();
  const results = await Promise.allSettled(pending);
  results.forEach((r) => { if (r.status === 'rejected') console.warn('A 3D model failed to load:', r.reason); });
}
