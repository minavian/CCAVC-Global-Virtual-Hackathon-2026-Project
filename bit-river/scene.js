import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCard, createReader, disposeWorld } from './card.js';
import { createCapsules } from './capsules.js';
import { clamp, ease, mix, replyFront, riverPoint } from './river.js';

const white = new THREE.Color(0xf4ede2);
const copper = new THREE.Color(0xffa561);
const standby = new THREE.Color(0x51443b);

function stream(segments, strands) {
  const count = (segments + 1) * strands;
  const coordinates = new Float32Array(count * 3);
  const travel = new Float32Array(count);
  const rail = new Float32Array(count);
  const indices = [];
  for (let i = 0; i < strands; i++) {
    for (let j = 0; j <= segments; j++) {
      const index = i * (segments + 1) + j;
      travel[index] = j / segments;
      rail[index] = i;
      if (j) indices.push(index - 1, index);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(coordinates, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('travel', new THREE.BufferAttribute(travel, 1));
  geometry.setAttribute('rail', new THREE.BufferAttribute(rail, 1));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { front: { value: 0 }, clock: { value: 0 }, sweep: { value: 0 },
      strength: { value: 1 }, noise: { value: 0 } },
    vertexShader: `
      attribute float travel, rail;
      varying float t, lane, nearCamera;
      void main() {
        t = travel;
        lane = rail;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        nearCamera = clamp((p.z + 14.0) * .18, .0, 1.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform float front, clock, sweep, strength, noise;
      varying float t, lane, nearCamera;
      void main() {
        if (lane < 4.5) {
          float head = 1.0 - sweep * 1.04;
          float pulse = exp(-pow((t - head) * 13.0, 2.0));
          float field = smoothstep(head - .1, head + .1, t) * sweep * (1.0 - .15 * lane);
          float dim = 1.0 - smoothstep(.03, .60, front);
          gl_FragColor = vec4(.90, .87, .81, (pulse * .31 + field * .20) * dim);
          return;
        }
        float appear = smoothstep(.0, .036, front - t);
        float seed = fract(lane * .6180339);
        float layer = lane < 5.5 ? 1.0 : smoothstep(.04 + seed * .38, .18 + seed * .58, front);
        float signal = fract(t * 1.35 - clock * .08) * 8.0;
        float cell = floor(signal);
        float bit = float(cell == 1.0 || cell == 5.0 || cell == 7.0);
        float gate = 1.0 - abs(bit - (1.0 - step(.5, fract(signal))));
        float subcarrier = .5 + .5 * sin(signal * 50.26548);
        float interference = .5 + .5 * sin(211.0 * t + lane * 1.4 - clock * 10.0);
        float current = mix(gate * subcarrier, interference, noise * .72);
        float tip = exp(-pow((front - t) * 34.0, 2.0));
        float edges = smoothstep(.0, .075, t) * (1.0 - smoothstep(.92, 1.01, t));
        vec3 amber = mix(vec3(.83, .26, .09), vec3(1.0, .74, .43), seed * .7 + current * .3);
        float alpha = (.16 + .24 * seed + .17 * current + .36 * tip) * (.57 + .43 * nearCamera);
        if (lane < 5.5) alpha += .21 * (1.0 - front);
        gl_FragColor = vec4(amber, alpha * appear * layer * edges * (.14 + strength * 1.15));
      }`
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return { lines, material, positions, segments, strands };
}

function motes(capacity) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const light = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('light', light);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      uniform float pixelRatio;
      attribute float light;
      varying float brightness;
      void main() {
        brightness = light;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_PointSize = clamp(65.0 / -p.z, 2.0, 8.0) * pixelRatio;
      }`,
    fragmentShader: `
      varying float brightness;
      void main() {
        float r = length(gl_PointCoord - .5);
        float core = 1.0 - smoothstep(.04, .23, r);
        float glow = (1.0 - smoothstep(.06, .50, r)) * .23;
        gl_FragColor = vec4(1.0, .62 + core * .2, .32 + core * .23, (core + glow) * brightness);
      }`
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, positions, light, material, capacity };
}

function readerField(reader) {
  return Array.from({ length: 4 }, () => {
    const curve = new THREE.EllipseCurve(0, 0, 1, .58);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
    const material = new THREE.LineBasicMaterial({ color: white, transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Line(geometry, material);
    ring.position.z = .16;
    reader.add(ring);
    return ring;
  });
}

export async function createScene({ canvas, surface, controls, notice, readout, signal, wake, onArrival }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .86;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, .1, 45);
  const studio = new RoomEnvironment();
  const reflections = new THREE.PMREMGenerator(renderer);
  const environment = reflections.fromScene(studio, .06);
  studio.dispose();
  reflections.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = .78;
  const key = new THREE.DirectionalLight(0xf5f1eb, 2.0);
  key.position.set(-4, 6, 7);
  const rim = new THREE.DirectionalLight(0xd8dce7, 1.25);
  rim.position.set(6, -5, 0);
  scene.add(key, rim, new THREE.HemisphereLight(0xf5f1e9, 0x77767c, .7));
  signal.addEventListener('abort', () => {
    disposeWorld(scene);
    environment.dispose();
    renderer.dispose();
  }, { once: true });

  const tag = await loadCard(signal);
  if (!tag) return null;
  const rx = createReader();
  const rings = readerField(rx.reader);
  const high = stream(96, 63), low = stream(60, 29);
  const flecks = motes(470);
  scene.add(tag.card, rx.reader, high.lines, low.lines, flecks.points);

  let time = 0, arrival = -10, reduced = false, ratio = 0;
  let frames = 0, frameTime = 0, quality = 1;
  const rect = { width: 0, height: 0 };
  const field = {
    tag: new THREE.Vector3(), reader: new THREE.Vector3(),
    front: 0, time: 0, width: 1, bend: 1,
    ripple: { time: -10, at: 0, strength: 0 }
  };
  const point = (t, lane, out) => riverPoint(t, lane, out, field);
  const sample = new THREE.Vector3(), target = new THREE.Vector3();
  const lens = new THREE.Vector3(), cameraTarget = new THREE.Vector3(), inspectionOffset = new THREE.Vector3();
  function disturb(at, strength) {
    field.ripple.at = at;
    field.ripple.time = time;
    field.ripple.strength = strength;
  }
  const capsules = createCapsules({
    THREE, scene, surface, controls, notice, readout, signal, wake,
    onDisturb: at => disturb(at, .95),
    onReceive: () => {
      arrival = time;
      disturb(.94, .38);
      onArrival();
    }
  });

  function setResolution(width, height) {
    const fit = Math.min(window.devicePixelRatio || 1, width < 680 ? 1.25 : 1.7, Math.sqrt(2900000 / (width * height)));
    const next = Math.max(.65, fit * quality);
    if (width === rect.width && height === rect.height && next === ratio) return;
    rect.width = width;
    rect.height = height;
    ratio = next;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    flecks.material.uniforms.pixelRatio.value = ratio;
  }

  function frame({ width, height, progress, dt, motion, reduced: calm, link }) {
    reduced = calm;
    if (motion && dt && width === rect.width && height === rect.height) {
      frames++;
      frameTime += dt;
      if (frames >= 45) {
        const mean = frameTime / frames;
        if (mean > .026) quality = Math.max(.58, quality - .18);
        else if (mean < .0175) quality = Math.min(1, quality + .06);
        frames = frameTime = 0;
      }
    }
    const aspect = width / height;
    const narrow = ease(.40, 1.21, aspect);
    const half = Math.min(10, 4.38 * aspect);
    const small = width < 720 || aspect < .72 || quality < .82;
    const opening = ease(.00, .29, progress);
    const reveal = ease(.21, .68, progress);
    const finish = ease(.68, 1, progress);
    const front = replyFront(progress) * (.55 + .45 * ease(.16, .45, link.strength));
    if (motion) time += dt;
    field.time = reduced ? 0 : time;
    field.front = front;
    field.width = mix(.76, 1.20, narrow) * mix(.45, 1.03, reveal);
    field.bend = mix(.66, 1.23, narrow) * mix(.75, 1, reveal);
    setResolution(width, height);

    // One scene: the origin is attached to the real card and the destination to the reader.
    const separation = (link.gap - .48);
    tag.card.position.set(half * mix(.43, .68, reveal) - (1 - narrow) * .28 + separation * .18,
      mix(.72, 1.20, narrow) + reveal * .52 + separation * .32, -.28 - reveal * .25 - separation * .72);
    tag.card.rotation.set(-.58 + .05 * opening - .14 * reveal,
      -.09 + .20 * reveal - (link.tilt - .09) * .87, .28 - .10 * opening + .15 * reveal, 'ZXY');
    tag.card.scale.setScalar(mix(1.98, 4.46, narrow) * (1 + .12 * opening - .34 * reveal));
    rx.reader.position.set(-half * mix(.57, .64, reveal) + (1 - narrow) * .17, -1.72 - .12 * narrow + .1 * finish, -.78 + finish * .42);
    rx.reader.rotation.set(-.64, .16, -.30 + finish * .1, 'ZXY');
    rx.reader.scale.setScalar(mix(1.00, 1.95, narrow) * mix(.87, 1.05, reveal));
    tag.source.getWorldPosition(field.tag);
    rx.source.getWorldPosition(field.reader);

    const charge = ease(.065, .27, progress) * (1 - ease(.46, .76, progress)) * ease(.10, .73, link.strength);
    tag.traces.forEach((trace, i) => {
      trace.material.opacity = charge * (.62 - i * .10) * (.87 + .13 * Math.cos(time * 2.8 - i));
    });
    rings.forEach((ring, i) => {
      const pulse = (i * .21 + progress * .9 + (reduced ? 0 : time * .13)) % 1;
      const expanding = ease(.05, .23, progress);
      ring.scale.setScalar(.52 + pulse * (1.18 + expanding * .78));
      ring.material.opacity = Math.sin(pulse * Math.PI) * .28 * (1 - ease(.30, .60, progress));
    });
    const received = link.readable
      ? Math.max(ease(.77, .92, progress) * (reduced ? .78 : .30), 1 - ease(0, 1.05, time - arrival)) : 0;
    rx.indicator.color.copy(standby).lerp(copper, Math.max(charge * .6, received));

    const journey = Math.max(0, front - .12);
    point(journey, 0, target);
    const following = ease(.25, .43, progress) * (1 - ease(.61, .80, progress));
    lens.set(half * .12 * opening - half * .36 * finish, .12 + opening * .52 - finish * .62, 12.2 - 1.7 * opening + 2.8 * reveal - .67 * finish);
    cameraTarget.set(half * .10 * opening - half * .12 * finish, .27 * opening - .32 * finish, 0);
    cameraTarget.lerp(target, following * .26 * narrow);
    if (capsules.focus) sample.copy(capsules.focus).sub(cameraTarget).multiplyScalar(.08 * narrow);
    else sample.set(0, 0, 0);
    inspectionOffset.lerp(sample, 1 - Math.exp(-dt * 6));
    cameraTarget.add(inspectionOffset);
    if (reduced) {
      lens.set(0, 0, 13);
      cameraTarget.set(0, 0, 0);
    }
    camera.position.copy(lens);
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();

    const active = small ? low : high;
    low.lines.visible = small;
    high.lines.visible = !small;
    const { positions, segments, strands, material } = active;
    const visibleStrands = front ? strands : 5;
    active.lines.geometry.setDrawRange(0, visibleStrands * segments * 2);
    for (let i = 0; i < visibleStrands; i++) {
      // A folded cross section gives the bundle actual depth without drawing a mesh per strand.
      const offset = i < 6 ? 0 : ((i - 6) % (small ? 9 : 15)) / (small ? 4 : 7) - 1;
      const depth = i < 6 ? 0 : Math.sin(i * 2.4) * Math.sqrt(1 - offset * offset);
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        riverPoint(t, offset, sample, field, depth);
        if (i < 5) {
          const arch = Math.sin(Math.PI * t);
          sample.x = mix(field.tag.x, field.reader.x, t);
          sample.y = mix(field.tag.y, field.reader.y, t) + arch * (i - 2) * .31;
          sample.z = mix(field.tag.z, field.reader.z, t) + arch * (3 - i) * .22;
        }
        positions.setXYZ(i * (segments + 1) + j, sample.x, sample.y, sample.z);
      }
    }
    positions.needsUpdate = true;
    material.uniforms.front.value = front;
    material.uniforms.clock.value = field.time;
    material.uniforms.sweep.value = ease(.012, .24, progress);
    material.uniforms.strength.value = link.strength;
    material.uniforms.noise.value = link.noise;

    const num = front < .03 ? 0 : small ? 175 : flecks.capacity;
    flecks.points.geometry.setDrawRange(0, num);
    for (let i = 0; i < num; i++) {
      const seed = (i * .618033989) % 1;
      const t = (seed + field.time * (.049 + (i % 7) * .009)) % 1;
      const spread = ((i * .31199) % 1 * 2 - 1);
      riverPoint(t, spread, sample, field, Math.sin(i * 2.4) * 1.23);
      sample.z += Math.sin(i * 1.9) * .23;
      flecks.positions.setXYZ(i, sample.x, sample.y, sample.z);
      const flash = link.readable && arrival > -5 && i < 40 ? (1 - ease(.04, .63, time - arrival)) * .78 : 0;
      if (flash) {
        sample.copy(field.reader);
        const radius = ease(0, .63, time - arrival) * .58;
        flecks.positions.setXYZ(i, sample.x + Math.cos(i * 2.4) * radius, sample.y + Math.sin(i * 2.4) * radius * .65, sample.z + (i % 7) * .026);
      }
      const spark = ease(.03, .18, front) * ease(0, .10, front - t) * ease(0, .08, t) * ease(0, .07, 1 - t);
      flecks.light.setX(i, flash + spark * (.23 + seed * .75) * link.strength);
    }
    flecks.positions.needsUpdate = flecks.light.needsUpdate = true;

    const moving = capsules.update({ time, dt, front, progress: link.readable ? progress : 0, motion, reduced, camera, point, projectRect: rect });
    renderer.render(scene, camera);
    return moving;
  }

  // Compile pipelines before the scroll reaches the reply and packet transitions.
  renderer.compile(scene, camera);
  return { frame };
}
