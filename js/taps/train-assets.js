import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lerp, smoothstep } from './easing.js';

export const TRACK_Z = -13.5;
export const RAIL_TOP_Y = -0.65;
export const HALF_GAUGE = 0.7175;

const WHEEL_RADIUS = 0.42;
const FLOOR = 0.94;
const DOOR_TOP = 3.0;
const DOOR_WIDTH = 1.34;
const HALF_BODY = 1.40;

// Longitudinal loft with a shared vertex at every measured section boundary.
function surface(T, columns, rows, point, reverse = false) {
  const vertices = [];
  const faces = [];
  const stride = rows.length;
  for (const x of columns) for (const v of rows) vertices.push(...point(x, v));
  for (let i = 0; i < columns.length - 1; i++) {
    for (let j = 0; j < stride - 1; j++) {
      const a = i * stride + j;
      const b = a + stride;
      faces.push(...(reverse ? [a, b + 1, b, a, a + 1, b + 1] : [a, b, b + 1, a, b + 1, a + 1]));
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

const samples = (start, end, count) => Array.from({ length: count + 1 }, (_, i) => lerp(start, end, i / count));

export function buildTrain(T) {
  const group = new T.Group();
  group.name = 'regional-electric-train';
  group.position.set(0, RAIL_TOP_Y, TRACK_Z);

  const coat = new T.MeshPhysicalMaterial({ color: 0xdad8d2, metalness: 0.29, roughness: 0.31, clearcoat: 0.43 });
  const lower = new T.MeshStandardMaterial({ color: 0x313630, metalness: 0.42, roughness: 0.53 });
  const trim = new T.MeshStandardMaterial({ color: 0x666f65, metalness: 0.34, roughness: 0.35 });
  const rubber = new T.MeshStandardMaterial({ color: 0x20221f, roughness: 0.86 });
  const glass = new T.MeshPhysicalMaterial({
    color: 0x2b3537, metalness: 0.14, roughness: 0.14, clearcoat: 0.68, side: T.DoubleSide,
  });
  const cabin = new T.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.77 });
  const steps = new T.MeshStandardMaterial({ color: 0x9f9c8c, metalness: 0.33, roughness: 0.6 });
  const steel = new T.MeshStandardMaterial({ color: 0x737876, metalness: 0.77, roughness: 0.37 });
  const lamp = new T.MeshStandardMaterial({ color: 0xdee4d9, emissive: 0xffefce, emissiveIntensity: 0.9, roughness: 0.25 });
  const tail = new T.MeshStandardMaterial({ color: 0x94392b, emissive: 0xb81008, emissiveIntensity: 0.55 });
  const lightStrip = new T.MeshStandardMaterial({ color: 0xe4dac2, emissive: 0xffddb2, emissiveIntensity: 0.15 });
  const boxes = new Map();
  const box = (parent, mat, size, pos, radius = 0) => {
    const key = [...size, radius].join(',');
    if (!boxes.has(key)) {
      boxes.set(key, radius ? new RoundedBoxGeometry(...size, 2, radius) : new T.BoxGeometry(...size));
    }
    const geometry = boxes.get(key);
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  };

  const windows = [];
  const doors = [];
  function addCoach(start, end, doorXs) {
    const coach = new T.Group();
    group.add(coach);
    const roof = surface(T, [start, end], samples(0, Math.PI, 36),
      (x, angle) => [x, DOOR_TOP + 0.47 * Math.sin(angle), HALF_BODY * Math.cos(angle)]);
    coach.add(new T.Mesh(roof, coat));
    box(coach, lower, [end - start, 0.22, 2.58], [(start + end) / 2, FLOOR - 0.12, 0], 0.08);
    box(coach, cabin, [end - start, 0.07, 2.76], [(start + end) / 2, FLOOR + 0.005, 0]);
    box(coach, cabin, [end - start - 0.2, 0.06, 1.30], [(start + end) / 2, 2.94, 0], 0.02);
    box(coach, trim, [2.8, 0.12, 1.10], [(start + end) / 2, 3.47, 0], 0.06);
    const ranges = [];
    let bandStart = start;
    for (const center of doorXs) {
      ranges.push([bandStart, center - DOOR_WIDTH / 2]);
      bandStart = center + DOOR_WIDTH / 2;
    }
    ranges.push([bandStart, end]);

    for (const sign of [-1, 1]) {
      for (const [from, to] of ranges) {
        const length = to - from;
        const x = (from + to) / 2;
        const z = sign * (HALF_BODY - 0.055);
        // Side panel spans end at the jambs, leaving real openings for inset sliding leaves.
        box(coach, coat, [length, 2.06, 0.1], [x, (FLOOR + DOOR_TOP) / 2, z], 0.045);
        box(coach, lower, [length - 0.08, 0.58, 0.09], [x, 0.81, sign * 1.27], 0.095);
        box(coach, trim, [length - 0.10, 0.055, 0.025], [x, 1.63, sign * HALF_BODY]);
        const available = length - 1.1;
        const count = Math.max(0, Math.floor(available / 1.85));
        if (count) box(coach, rubber, [available, 0.91, 0.022], [x, 2.30, sign * 1.397], 0.009);
        for (let i = 0; i < count; i++) {
          const position = from + 0.55 + (i + 0.5) * available / count;
          const width = available / count - 0.075;
          windows.push({ x: position, z: sign * (HALF_BODY + 0.008), width });
        }
      }
      for (const center of doorXs) {
        box(coach, rubber, [0.046, DOOR_TOP - FLOOR, 0.12], [center - DOOR_WIDTH / 2, 1.97, sign * 1.34]);
        box(coach, rubber, [0.046, DOOR_TOP - FLOOR, 0.12], [center + DOOR_WIDTH / 2, 1.97, sign * 1.34]);
        box(coach, steps, [DOOR_WIDTH, 0.042, 0.24], [center, FLOOR + 0.035, sign * 1.35], 0.013);
        box(coach, lightStrip, [0.54, 0.033, 0.038], [center, 2.89, sign * 1.06], 0.012);
        for (const leaf of [-1, 1]) {
          const panel = new T.Group();
          const home = center + leaf * (DOOR_WIDTH / 4 - 0.018);
          box(panel, coat, [DOOR_WIDTH / 2 - 0.044, 1.92, 0.051], [0, 1.949, 0], 0.024);
          box(panel, glass, [0.38, 0.74, 0.026], [0, 2.32, sign * 0.025], 0.012);
          box(panel, trim, [0.03, 0.17, 0.027], [leaf * -0.22, 1.74, sign * 0.024], 0.012);
          coach.add(panel);
          doors.push({ panel, home, leaf, sign });
        }
      }
      box(coach, steps, [0.42, 1.2, 0.67], [start + 0.46, 1.58, sign * 0.72], 0.06);
    }
    box(coach, rubber, [0.075, 2.15, 2.48], [start, 1.98, 0], 0.14);
    box(coach, rubber, [0.075, 2.15, 2.48], [end, 1.98, 0], 0.14);
  }

  const carriages = [
    { start: -17.8, end: 2.1, doors: [-13.65, -1.0] },
    { start: -38.7, end: -18.25, doors: [-34.6, -22.5] },
    { start: -59.25, end: -39.15, doors: [-54.0, -43.1] },
  ];
  for (const car of carriages) addCoach(car.start, car.end, car.doors);

  const scratch = new T.Object3D();
  for (const [material, height, depth] of [[rubber, 0.86, 0.038], [glass, 0.78, 0.044]]) {
    const geometry = new RoundedBoxGeometry(1, height, depth, 3, depth / 2);
    const instances = new T.InstancedMesh(geometry, material, windows.length);
    windows.forEach(({ x, z, width }, index) => {
      scratch.position.set(x, 2.30, z);
      scratch.scale.set(width, 1, 1);
      scratch.updateMatrix();
      instances.setMatrixAt(index, scratch.matrix);
    });
    group.add(instances);
  }

  // Shoulder and windscreen share the cab surface coordinates. The nose stays
  // broad across the headlights, with the upper body tapering into the cab mask.
  const cabPoint = (u, theta) => {
    const wall = 0.31;
    const angle = Math.asin(Math.sin(theta));
    const sign = Math.sign(Math.cos(theta));
    const archAngle = Math.PI / 2 * Math.max(0, (Math.abs(angle) - wall) / (Math.PI / 2 - wall));
    const wallY = lerp(FLOOR, DOOR_TOP, (Math.min(wall, Math.max(-wall, angle)) + wall) / (2 * wall));
    const rootY = wallY + (angle > 0 ? 0.47 : -0.13) * Math.sin(archAngle);
    const rootZ = sign * (HALF_BODY - 0.005) * Math.cos(archAngle);
    const top = 3.47 - 1.82 * u ** 1.55;
    const bottom = FLOOR - 0.15 * u;
    const faceY = lerp(bottom, top, (1 + Math.sin(theta)) / 2);
    const faceZ = HALF_BODY * (1 - 0.45 * u ** 2.7) * sign * Math.abs(Math.cos(theta)) ** 0.73;
    const blend = smoothstep(u * 2);
    const y = lerp(rootY, faceY, blend);
    const z = lerp(rootZ, faceZ, blend);
    return [u * 2.72, y, z];
  };
  const cabAngles = samples(-Math.PI / 2, 3 * Math.PI / 2, 70);
  const shellGeo = surface(T, samples(0, 1, 40), cabAngles, cabPoint);
  const faceGeo = surface(T, samples(0, 1, 12), cabAngles, (v, theta) => {
    const [x, y, z] = cabPoint(1, theta);
    return [x + 0.13 * Math.sin(v * Math.PI / 2), lerp(y, 1.19, v), lerp(z, 0, v)];
  });
  const shieldGeo = surface(T, samples(0.21, 0.78, 22), samples(0.39, Math.PI - 0.39, 26), (u, theta) => {
    const [x, y, z] = cabPoint(u, theta);
    return [x + 0.012, y + 0.022, z * 1.013];
  });
  for (const front of [true, false]) {
    const cab = new T.Group();
    cab.position.x = front ? carriages[0].end : carriages.at(-1).start;
    if (!front) cab.rotation.y = Math.PI;
    cab.add(new T.Mesh(shellGeo, coat), new T.Mesh(shieldGeo, glass), new T.Mesh(faceGeo, coat));
    const apron = box(cab, lower, [2.29, 0.19, 1.51], [1.18, 0.79, 0], 0.08);
    apron.rotation.z = -0.07;
    for (const sign of [-1, 1]) {
      const points = [0.80, 0.87, 0.95, 1.025].map((u, i) => {
        const [, y, z] = cabPoint(Math.min(u, 1), 0.04);
        return new T.Vector3(u * 2.72, y + 0.018 * i, (Math.abs(z) + 0.015 - 0.021 * i) * sign);
      });
      const curve = new T.CatmullRomCurve3(points);
      cab.add(new T.Mesh(new T.TubeGeometry(curve, 16, 0.048, 8, false), rubber));
      cab.add(new T.Mesh(new T.TubeGeometry(curve, 16, 0.062, 8, false), front ? lamp : tail));
    }
    group.add(cab);
  }

  for (const x of [-18.025, -38.925]) {
    for (let i = -2; i <= 2; i++) {
      box(group, rubber, [0.11, 2.13, 2.51], [x + i * 0.09, 1.98, 0], 0.047);
    }
  }

  const wheelShape = [
    [0, -0.10], [0.24, -0.10], [0.255, -0.073], [0.386, -0.073], [0.416, -0.066],
    [0.42, 0.062], [0.44, 0.073], [0.44, 0.092], [0.29, 0.092], [0, 0.092],
  ].map(([r, z]) => new T.Vector2(r, z));
  const wheelGeo = new T.LatheGeometry(wheelShape, 42);
  wheelGeo.rotateX(Math.PI / 2);
  const capGeo = new T.CylinderGeometry(0.133, 0.133, 0.11, 24);
  capGeo.rotateX(Math.PI / 2);
  const wheelsets = [];
  for (const x of [-2.7, -12.8, -23.0, -34.2, -44.2, -55.3]) {
    box(group, lower, [2.39, 0.27, 1.91], [x, 0.61, 0], 0.09);
    for (const offset of [-0.83, 0.83]) {
      const axle = new T.Group();
      axle.position.set(x + offset, WHEEL_RADIUS, 0);
      for (const sign of [-1, 1]) {
        const tire = new T.Mesh(wheelGeo, steel);
        tire.position.z = sign * HALF_GAUGE;
        if (sign < 0) tire.rotation.y = Math.PI;
        const cap = new T.Mesh(capGeo, lower);
        cap.position.z = sign * (HALF_GAUGE + 0.08);
        axle.add(tire, cap);
      }
      group.add(axle);
      wheelsets.push(axle);
    }
  }

  // Batch repeated fixed fittings. Door leaves and wheelsets keep their own transforms.
  const animatedGroups = new Set([...doors.map(({ panel }) => panel), ...wheelsets]);
  const fixedMeshes = new Map();
  group.updateMatrixWorld(true);
  const worldToTrain = group.matrixWorld.clone().invert();
  group.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || animatedGroups.has(mesh.parent)) return;
    const key = `${mesh.geometry.id}/${mesh.material.id}`;
    if (!fixedMeshes.has(key)) fixedMeshes.set(key, []);
    fixedMeshes.get(key).push(mesh);
  });
  const matrix = new T.Matrix4();
  for (const meshes of fixedMeshes.values()) {
    if (meshes.length < 3) continue;
    const [{ geometry, material }] = meshes;
    const instances = new T.InstancedMesh(geometry, material, meshes.length);
    meshes.forEach((mesh, index) => {
      instances.setMatrixAt(index, matrix.multiplyMatrices(worldToTrain, mesh.matrixWorld));
      mesh.removeFromParent();
    });
    instances.computeBoundingSphere();
    group.add(instances);
  }

  let lastOpening;
  function setState({ xOffset = 0, headlights = 1, wheelAngle = 0, doorOpen = 1, visible = true } = {}) {
    group.visible = visible;
    if (!visible) return;
    group.position.x = xOffset;
    lamp.emissiveIntensity = headlights * 0.95;
    for (const axle of wheelsets) axle.rotation.z = wheelAngle;
    if (doorOpen === lastOpening) return;
    lastOpening = doorOpen;
    for (const { panel, home, leaf, sign } of doors) {
      const opening = sign === 1 ? doorOpen : 0;
      panel.position.set(home + leaf * 0.655 * opening, 0, sign * (1.367 - Math.min(opening * 3, 1) * 0.103));
    }
  }

  setState();
  return { group, wheelRadius: WHEEL_RADIUS, setState };
}
