import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, createRipples, lerp, makeContactShadow, paintCanvas, smoothstep } from './easing.js';

// Geely's stated overall dimensions are 4.615 × 1.901 × 1.670 m with a 2.750m wheelbase.
// The longitudinal profiles below trace the short nose, tall cabin and rear spoiler.
const FRONT = -2.3075;
const REAR = 2.3075;
const AXLES = [-1.39, 1.36];
const TIRE = 0.367;
const DOOR = [-0.87, 0.28];
const SHOULDER = [
  [FRONT, 0.699, 0.885], [-2.15, 0.825, 0.973], [-1.77, 0.917, 1.026],
  [-1.39, 0.9505, 1.035], [-0.87, 0.932, 1.046], [0.28, 0.927, 1.060],
  [0.98, 0.941, 1.085], [1.36, 0.9505, 1.105], [1.92, 0.913, 1.120],
  [2.16, 0.865, 1.119], [REAR, 0.747, 1.075],
];
const CABIN = [
  [-0.98, 1.047, 0.822], [-0.78, 1.19, 0.818], [-0.46, 1.52, 0.767],
  [-0.16, 1.626, 0.742], [0.32, 1.646, 0.737], [0.96, 1.635, 0.737],
  [1.53, 1.585, 0.722], [1.77, 1.514, 0.714], [2.02, 1.348, 0.748],
  [2.19, 1.119, 0.799],
];

function profile(table, x, column) {
  const i = table.findIndex(row => row[0] > x);
  if (i === 0) return table[0][column];
  if (i < 0) return table.at(-1)[column];
  const a = table[i - 1], b = table[i];
  const before = table[Math.max(i - 2, 0)], after = table[Math.min(i + 1, table.length - 1)];
  const span = b[0] - a[0];
  const t = (x - a[0]) / span;
  const change = b[column] - a[column];
  const tangent = (u, v) => {
    const slope = change * (v[column] - u[column]) <= 0 ? 0 : (v[column] - u[column]) / (v[0] - u[0]);
    return Math.sign(change) * Math.min(Math.abs(slope * span), Math.abs(change) * 2.4);
  };
  const y = lerp(a[column], b[column], smoothstep(t));
  return y + t * (1 - t) * ((1 - t) * tangent(before, b) - t * tangent(a, after));
}

const samples = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
const belt = x => profile(SHOULDER, x, 2);
const width = x => profile(SHOULDER, x, 1);
const rocker = x => 0.235 + 0.07 * Math.abs(x / REAR) ** 5;
const roof = x => profile(CABIN, x, 1);
const roofWidth = x => profile(CABIN, x, 2);

function bodyX(x, y, z) {
  if (x < FRONT + 0.42) {
    const edge = 1 - (x - FRONT) / 0.42;
    const upperRoll = 0.105 * smoothstep((y - 0.70) / 0.23);
    const lowerRoll = 0.10 * (1 - smoothstep((y - 0.30) / 0.31));
    return x + edge ** 2 * (upperRoll + lowerRoll + 0.14 * (z / 0.75) ** 2);
  }
  if (x > REAR - 0.29) {
    const edge = 1 - (REAR - x) / 0.29;
    return x - edge ** 2 * (0.055 + 0.085 * (z / 0.76) ** 2);
  }
  return x;
}

function arch(x) {
  const distance = Math.min(...AXLES.map(axle => Math.abs(x - axle)));
  const radius = 0.401;
  if (distance > radius) return rocker(x);
  return Math.max(rocker(x), TIRE + Math.sqrt(Math.max(0, radius ** 2 - distance ** 2)));
}

function sideSurface(x, v, sign, offset = 0) {
  const floor = arch(x);
  const y = lerp(floor, belt(x), v);
  const height = (y - rocker(x)) / (belt(x) - rocker(x));
  const longitudinal = Math.sin(Math.PI * smoothstep((x + 1.27) / 2.73)) ** 2;
  const characterLine = 0.29 + 0.22 * smoothstep((x + 0.85) / 2.43);
  const scallop = 0.063 * longitudinal * Math.exp(-(((height - characterLine - 0.11) / 0.22) ** 2));
  const lowerCrest = 0.018 * longitudinal * Math.exp(-(((height - characterLine) / 0.09) ** 2));
  const shoulder = 0.013 * Math.exp(-(((height - 0.84) / 0.14) ** 2));
  const z = width(x) * (0.87 + 0.13 * Math.sin(height * 2.04)) - scallop + lowerCrest + shoulder;
  return [bodyX(x, y, z), y, sign * (z + offset)];
}

function skin(T, xs, vs, point, reverse = false) {
  const vertices = [];
  const indices = [];
  for (const x of xs) for (const v of vs) vertices.push(...point(x, v));
  const stride = vs.length;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < stride - 1; j++) {
      const a = i * stride + j, b = a + stride;
      indices.push(...(reverse ? [a, b + 1, b, a, a + 1, b + 1] : [a, b, b + 1, a, b + 1, a + 1]));
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function builder(T) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    geometries.add(geometry);
    materials.add(material);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, mat, [w, h, d], [x, y, z], r) =>
    add(parent, new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);
  const line = (parent, mat, points, radius) => add(parent,
    new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), Math.max(12, points.length * 2), radius, 6, false), mat);
  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  }
  return { add, box, line, textures, dispose };
}

export function createVehicleReflection(T, pmrem) {
  const studio = new T.Scene();
  studio.background = new T.Color(0x55595f);
  const panels = [
    { at: [-3.7, 5.5, 4.2], size: [7.8, 2.9], level: 3.4 },
    { at: [0.5, 1.85, 5.4], size: [8, 0.85], level: 2.6 },
    { at: [1.45, 0.15, 5.1], size: [7.8, 1.55], level: 1.55 },
    { at: [2.6, 4.7, -3.8], size: [6.2, 2.1], level: 2.7 },
    { at: [-6, 1.5, 0], size: [2.8, 2], level: 1.55 },
  ];
  for (const { at, size, level } of panels) {
    const geometry = new T.PlaneGeometry(...size);
    const material = new T.MeshBasicMaterial({
      color: new T.Color().setRGB(level, level, level), toneMapped: false,
    });
    const panel = new T.Mesh(geometry, material);
    panel.position.set(...at);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  const reflections = pmrem.fromScene(studio, 0.055);
  for (const panel of studio.children) {
    panel.geometry.dispose();
    panel.material.dispose();
  }
  return reflections;
}

function buildCar(T, { add, box, line, textures }, reflections) {
  const group = new T.Group();
  group.name = 'geely-ex5-black';
  const paint = new T.MeshPhysicalMaterial({
    color: 0x26292e, metalness: 0.34, roughness: 0.225, clearcoat: 0.96, clearcoatRoughness: 0.14,
    envMap: reflections, envMapIntensity: 0.92, side: T.DoubleSide,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: 0x172126, metalness: 0.13, roughness: 0.17, clearcoat: 0.76, clearcoatRoughness: 0.15,
    transparent: true, opacity: 0.88, side: T.DoubleSide, envMap: reflections, envMapIntensity: 0.68,
  });
  const black = new T.MeshStandardMaterial({ color: 0x111313, roughness: 0.72, side: T.DoubleSide });
  const brushed = new T.MeshStandardMaterial({ color: 0x8b9295, metalness: 0.76, roughness: 0.36 });
  const graphite = new T.MeshStandardMaterial({ color: 0x292d2f, metalness: 0.52, roughness: 0.41 });
  const rubber = new T.MeshStandardMaterial({ color: 0x1b1c1c, roughness: 0.88 });
  const upholstery = new T.MeshStandardMaterial({ color: 0x93877a, roughness: 0.84 });
  const cabinTrim = new T.MeshStandardMaterial({ color: 0x2c2926, roughness: 0.72 });
  const drl = new T.MeshStandardMaterial({ color: 0xd0d9de, emissive: 0xc9ddff, emissiveIntensity: 0.26, roughness: 0.2 });
  const indicators = new T.MeshStandardMaterial({ color: 0x693b21, emissive: 0xff8127, emissiveIntensity: 0, roughness: 0.26 });
  const tail = new T.MeshStandardMaterial({ color: 0x70231e, emissive: 0xff241c, emissiveIntensity: 0.28, roughness: 0.24 });
  const lampLens = new T.MeshPhysicalMaterial({
    color: 0x242831, roughness: 0.16, metalness: 0.25, clearcoat: 0.95,
    envMap: reflections, envMapIntensity: 0.76, side: T.DoubleSide,
  });

  const drawSide = (parent, from, to, sign, offsetX = 0, offsetZ = 0) => {
    const xs = [...new Set([...samples(from, to, 80), ...AXLES.flatMap(axle => [axle - 0.401, axle + 0.401])
      .filter(x => x > from && x < to)])].sort((a, b) => a - b);
    add(parent, skin(T, xs, samples(0, 1, 20), (x, v) => {
      const [body, y, z] = sideSurface(x, v, sign);
      return [body - offsetX, y, z - offsetZ];
    }, sign < 0), paint);
  };

  const hinge = new T.Group();
  const pivotZ = sideSurface(DOOR[0], 0.7, 1)[2];
  hinge.position.set(DOOR[0], 0, pivotZ);
  group.add(hinge);
  drawSide(group, FRONT, DOOR[0], 1);
  drawSide(hinge, DOOR[0] + 0.007, DOOR[1] - 0.008, 1, DOOR[0], pivotZ);
  drawSide(group, DOOR[1], REAR, 1);
  drawSide(group, FRONT, REAR, -1);

  for (const x of [FRONT, REAR]) {
    add(group, skin(T, samples(-1, 1, 25), samples(0, 1, 16), (u, v) => {
      const [, y, z] = sideSurface(x, v, 1);
      return [bodyX(x, y, z * u), y, z * u];
    }, x > 0), paint);
  }

  const topPoint = (from, to, y, halfWidth, sculptHood = false) => (x, v) => {
    const edge = y(x);
    const taper = Math.sin(Math.PI * (x - from) / (to - from));
    const channels = sculptHood ? 0.019 * Math.exp(-(((Math.abs(v) - 0.73) / 0.105) ** 2)) : 0;
    const crown = (0.044 * (1 - v * v) + channels) * taper;
    const z = v * halfWidth(x);
    return [bodyX(x, edge + crown, z), edge + crown, z];
  };
  const drawTop = (from, to, y, halfWidth, material) =>
    add(group, skin(T, samples(from, to, 46), samples(-1, 1, 28), topPoint(from, to, y, halfWidth), true), material);

  const hoodPoint = topPoint(FRONT, -0.98, belt, x => sideSurface(x, 1, 1)[2], true);
  add(group, skin(T, samples(FRONT, -0.98, 46), samples(-1, 1, 34), hoodPoint, true), paint);
  const hoodShutline = [
    ...samples(-1.04, -2.20, 20).map(x => hoodPoint(x, -0.88)),
    ...samples(-0.88, 0.88, 22).slice(1,-1).map(v => hoodPoint(-2.20 - 0.042 * (1 - v * v), v)),
    ...samples(-2.20, -1.04, 20).map(x => hoodPoint(x, 0.88)),
  ].map(([x, y, z]) => [x, y + 0.002, z]);
  line(group, black, hoodShutline, 0.004);
  drawTop(2.19, REAR, belt, x => sideSurface(x, 1, 1)[2], paint);
  drawTop(-0.98, -0.28, roof, roofWidth, glass);
  drawTop(-0.28, 1.72, roof, roofWidth, paint);
  drawTop(1.72, 2.19, roof, roofWidth, glass);

  const cabinPoint = (x, v, sign) => {
    const [, bottom, z] = sideSurface(x, 1, sign);
    return [x, lerp(bottom, Math.max(bottom, roof(x)), v), lerp(z, sign * roofWidth(x), v)];
  };
  const windowBand = (parent, from, to, sign, low, high, mat, moving = false) => {
    add(parent, skin(T, samples(from, to, 25), [low, high], (x, v) => {
      const [, y, z] = cabinPoint(x, v, sign);
      return [x - (moving ? DOOR[0] : 0), y, z - (moving ? pivotZ : 0)];
    }, sign < 0), mat);
  };

  for (const sign of [-1, 1]) {
    const parent = sign > 0 ? hinge : group;
    const moving = sign > 0;
    windowBand(group, -0.98, DOOR[0], sign, 0, 1, paint);
    windowBand(parent, DOOR[0] + 0.007, DOOR[1] - 0.008, sign, 0, 0.07, paint, moving);
    windowBand(parent, DOOR[0] + 0.018, DOOR[1] - 0.027, sign, 0.07, 0.92, glass, moving);
    windowBand(parent, DOOR[0] + 0.007, DOOR[1] - 0.008, sign, 0.92, 1, paint, moving);
    windowBand(parent, DOOR[1] - 0.044, DOOR[1] - 0.008, sign, 0.07, 0.92, black, moving);
    windowBand(group, DOOR[1], 1.88, sign, 0, 0.07, paint);
    windowBand(group, DOOR[1] + 0.045, 1.88, sign, 0.07, 0.94, glass);
    windowBand(group, DOOR[1], DOOR[1] + 0.045, sign, 0.07, 1, black);
    windowBand(group, DOOR[1] + 0.045, 1.88, sign, 0.94, 1, paint);
    windowBand(group, 1.88, 2.19, sign, 0, 1, paint);
    const brightEdge = (x, v) => {
      const [, y, z] = cabinPoint(x, v, sign);
      return [x, y, z + sign * 0.010];
    };
    const rearContour = [
      ...samples(DOOR[1] + 0.012, 1.69, 20).map(x => brightEdge(x, 0.06)),
      brightEdge(1.80, 0.11), brightEdge(1.88, 0.26), brightEdge(1.88, 0.49),
      brightEdge(1.86, 0.73), brightEdge(1.77, 0.89), brightEdge(1.67, 0.96),
      ...samples(1.60, DOOR[1] + 0.012, 20).map(x => brightEdge(x, 0.96)),
    ];
    line(group, brushed, rearContour, 0.008);
    line(group, black, samples(0.07, 0.9, 10).map(v => brightEdge(lerp(1.34, 1.18, v), v)), 0.011);
    line(group, black, samples(0.05, 0.98, 20).map(v => {
      const x = lerp(0.935, 1.21, smoothstep((v - 0.22) / 0.76));
      return sideSurface(x, v, sign, 0.001);
    }), 0.0033);
    const frontContour = [
      ...samples(DOOR[1] - 0.016, -0.85, 18).map(x => brightEdge(x, 0.06)),
      ...samples(-0.85, DOOR[1] - 0.016, 18).map(x => brightEdge(x, 0.96)),
    ];
    line(parent, brushed, frontContour.map(([x, y, z]) => [
      x - (moving ? DOOR[0] : 0), y, z - (moving ? pivotZ : 0),
    ]), 0.008);
    line(group, brushed, samples(-0.40, 1.61, 20).map(x => [
      x, roof(x) + 0.027, sign * 0.64,
    ]), 0.019);

    for (const x of [0.06, 1.01]) {
      const onDoor = sign > 0 && x < DOOR[1];
      const [, y, z] = sideSurface(x, 0.87, sign, 0.011);
      box(onDoor ? hinge : group, graphite, [0.166, 0.03, 0.022],
        [x - (onDoor ? DOOR[0] : 0), y, z - (onDoor ? pivotZ : 0)], 0.012);
    }

    const [, y, z] = sideSurface(-0.73, 1, sign);
    const mirrorShift = moving ? pivotZ : 0;
    const mirrorX = -0.73 - (moving ? DOOR[0] : 0);
    box(parent, black, [0.12, 0.045, 0.14], [mirrorX, y + 0.036, z + sign * 0.045 - mirrorShift], 0.023);
    box(parent, paint, [0.24, 0.092, 0.139], [mirrorX + 0.015, y + 0.085, z + sign * 0.137 - mirrorShift], 0.045);
    box(parent, indicators, [0.12, 0.014, 0.025], [mirrorX - 0.035, y + 0.081, z + sign * 0.199 - mirrorShift], 0.007);

    for (const axle of AXLES) {
      const edge = samples(axle - 0.401, axle + 0.401, 32).map(x => sideSurface(x, 0, sign, 0.007));
      line(group, black, edge, 0.029);
    }
    box(group, black, [1.93, 0.057, 0.085], [-0.01, 0.26, sign * 0.84], 0.023);
    box(group, graphite, [1.87, 0.018, 0.041], [-0.01, 0.285, sign * 0.882], 0.008);
  }

  // Curved fascia pieces follow the nose, including its wide lower mouth and
  // the tall outer air curtains. Their outlines follow the reference photograph.
  const nosePoint = (z, y, depth = 0.012) => [bodyX(FRONT, y, z) - depth, y, z];
  function fascia(mat, outline, depth = 0.012) {
    const shape = new T.Shape();
    shape.moveTo(...outline[0]);
    for (const [z, y] of outline.slice(1)) shape.lineTo(z, y);
    shape.closePath();
    const geometry = new T.ShapeGeometry(shape, 16);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(i, ...nosePoint(positions.getX(i), positions.getY(i), depth));
    }
    geometry.computeVertexNormals();
    add(group, geometry, mat);
  }

  const grilleTop = samples(-0.59, 0.59, 12).map(z => [z, 0.395 + 0.065 * (1 - (z / 0.59) ** 2)]);
  const grilleBottom = samples(0.61, -0.61, 12).map(z => [z, 0.315 + 0.012 * (z / 0.61) ** 2]);
  fascia(black, [...grilleTop, ...grilleBottom], 0.026);
  for (const [y, from, to] of [[0.343, -0.56, 0.56], [0.368, -0.52, 0.52], [0.396, -0.46, 0.46], [0.422, -0.34, 0.34]]) {
    line(group, graphite, samples(from, to, 12).map(z => nosePoint(z, y, 0.031)), 0.008);
  }

  // The EX5 uses slim swept lamps, a dark shield and upright side intakes.
  for (const sign of [-1, 1]) {
    const lampPoints = [
      ...[[0.38, 0.821], [0.51, 0.830], [0.60, 0.847], [0.65, 0.866]].map(([z, y]) => nosePoint(sign * z, y, 0.017)),
      ...[-2.248, -2.15, -2.07].map(x => sideSurface(x, 0.85, sign, 0.018)),
    ];
    const lampCurve = new T.CatmullRomCurve3(lampPoints.map(([x, y, z]) => new T.Vector3(x - 0.012, y, z + sign * 0.012)));
    const lampPoint = (u, v) => {
      const center = lampCurve.getPoint(u);
      const outer = smoothstep((u - 0.28) / 0.48);
      const thickness = Math.sin(Math.PI * u) ** 0.76 * lerp(0.031, 0.071, outer);
      return [center.x - 0.014 * Math.sin(Math.PI * v), center.y - thickness * v, center.z + sign * 0.011 * v];
    };
    add(group, skin(T, samples(0, 1, 28), samples(0, 1, 5), lampPoint), lampLens);
    line(group, drl, samples(0.025, 0.96, 26).map(u => lampPoint(u, 0.07)), 0.0055);
    line(group, indicators, samples(0.22, 0.66, 12).map(u => lampPoint(u, 0.72)), 0.005);
    for (const u of [0.53, 0.64, 0.73]) {
      const [x, y, z] = lampPoint(u, 0.57);
      const projector = box(group, brushed, [0.013, 0.016, 0.025], [x - 0.010, y, z + sign * 0.008], 0.004);
      projector.rotation.y = sign * 0.56;
    }
    const curtain = [[0.574, 0.679], [0.637, 0.654], [0.676, 0.584], [0.699, 0.417],
      [0.665, 0.365], [0.534, 0.354], [0.494, 0.378], [0.574, 0.416],
      [0.618, 0.484], [0.610, 0.584], [0.574, 0.646]].map(([z, y]) => [sign * z, y]);
    fascia(black, curtain, 0.019);
    line(group, graphite, curtain.map(([z, y]) => nosePoint(z, y, 0.025)), 0.008);
    line(group, brushed, [[0.40, 0.393], [0.492, 0.365], [0.55, 0.355], [0.622, 0.365]]
      .map(([z, y]) => nosePoint(sign * z, y, 0.030)), 0.009);
    line(group, tail, [[bodyX(REAR, 1.027, 0.65) + 0.027, 1.027, sign * 0.65],
      sideSurface(2.18, 0.94, sign, 0.017), sideSurface(2.08, 0.95, sign, 0.019)], 0.021);
    box(group, indicators, [0.027, 0.017, 0.18], [2.246, 0.986, sign * 0.49], 0.008);
  }
  line(group, graphite, samples(-0.64, 0.64, 16).map(z => nosePoint(z, 0.310 + 0.024 * (z / 0.64) ** 2, 0.026)), 0.016);
  const shieldTile = new RoundedBoxGeometry(0.010, 0.022, 0.027, 2, 0.003);
  for (const z of [-0.031, 0, 0.031]) for (const y of [0.707, 0.731]) {
    add(group, shieldTile, brushed, ...nosePoint(z, y, 0.016));
  }
  line(group, tail, samples(-0.65, 0.65, 15).map(z => [bodyX(REAR, 1.027, z) + 0.025, 1.027, z]), 0.014);
  box(group, paint, [0.25, 0.057, 1.49], [1.80, 1.576, 0], 0.027);
  const plate = paintCanvas(T, 256, 72, ctx => {
    ctx.fillStyle = '#181b1c';
    ctx.beginPath();
    ctx.roundRect(1, 1, 254, 70, 7);
    ctx.fill();
    ctx.fillStyle = '#f1eee6';
    ctx.font = '600 35px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GEELY EX5', 128, 38);
  }).texture;
  textures.add(plate);
  const plateFace = add(group, new T.PlaneGeometry(0.43, 0.12),
    new T.MeshStandardMaterial({ map: plate, alphaTest: 0.5, roughness: 0.68 }), -2.320, 0.51, 0);
  plateFace.rotation.y = -Math.PI / 2;

  const floor = box(group, black, [3.02, 0.12, 1.55], [0.16, 0.30, 0], 0.039);
  floor.receiveShadow = true;
  box(group, upholstery, [1.78, 0.09, 1.52], [0.25, 0.39, 0], 0.035);
  box(group, cabinTrim, [0.43, 0.34, 1.53], [-0.76, 0.845, 0], 0.095);
  box(group, graphite, [0.021, 0.196, 0.309], [-0.51, 1.005, 0], 0.012);
  box(group, cabinTrim, [1.11, 0.18, 0.29], [0.04, 0.60, 0], 0.05);
  box(group, upholstery, [0.51, 0.46, 1.38], [1.06, 0.62, 0], 0.095);
  box(group, upholstery, [0.22, 0.51, 1.40], [1.29, 0.91, 0], 0.080);
  for (const z of [-0.42, 0.42]) {
    box(group, upholstery, [0.50, 0.17, 0.45], [0.00, 0.53, z], 0.076);
    const back = box(group, upholstery, [0.19, 0.52, 0.46], [0.26, 0.805, z], 0.080);
    back.rotation.z = 0.19;
    box(group, upholstery, [0.127, 0.17, 0.21], [0.31, 1.125, z], 0.058);
  }
  const steering = add(group, new T.TorusGeometry(0.148, 0.018, 12, 32), black, -0.53, 0.94, 0.42);
  steering.rotation.y = Math.PI / 2.4;
  box(group, cabinTrim, [0.06, 0.07, 0.21], [-0.53, 0.94, 0.42], 0.027);
  box(group, black, [0.042, 0.65, 0.084], [DOOR[1] + 0.008, 0.66, pivotZ - 0.139], 0.018);
  box(hinge, cabinTrim, [1.09, 0.58, 0.075], [0.575, 0.642, -0.135], 0.037);
  box(hinge, upholstery, [0.84, 0.12, 0.045], [0.60, 0.84, -0.16], 0.022);
  box(hinge, graphite, [0.41, 0.072, 0.047], [0.54, 0.75, -0.17], 0.023);

  const tireProfile = [[0.244, -0.111], [0.292, -0.117], [0.334, -0.106], [0.357, -0.085],
    [TIRE, -0.059], [TIRE, 0.059], [0.357, 0.085], [0.334, 0.106], [0.292, 0.117],
    [0.244, 0.112], [0.244, -0.111]];
  const tireGeo = new T.LatheGeometry(tireProfile.map(([r, z]) => new T.Vector2(r, z)), 64);
  tireGeo.rotateX(Math.PI / 2);
  const disk = new T.CylinderGeometry(0.215, 0.215, 0.026, 48);
  disk.rotateX(Math.PI / 2);
  const rim = new T.TorusGeometry(0.247, 0.014, 12, 56);
  const spokeShape = new T.Shape();
  spokeShape.moveTo(-0.026, 0.047);
  spokeShape.lineTo(-0.037, 0.141);
  spokeShape.lineTo(-0.084, 0.224);
  spokeShape.lineTo(-0.018, 0.246);
  spokeShape.lineTo(0.030, 0.159);
  spokeShape.lineTo(0.019, 0.051);
  spokeShape.closePath();
  const spoke = new T.ExtrudeGeometry(spokeShape, { depth: 0.015, bevelEnabled: true, bevelSegments: 2, bevelThickness: 0.004, bevelSize: 0.004 });
  for (const x of AXLES) for (const sign of [-1, 1]) {
    const wheel = new T.Group();
    wheel.position.set(x, TIRE, sign * 0.807);
    if (sign < 0) wheel.rotation.y = Math.PI;
    group.add(wheel);
    add(wheel, tireGeo, rubber);
    add(wheel, disk, graphite, 0, 0, 0.048);
    add(wheel, rim, graphite, 0, 0, 0.107);
    add(wheel, rim, brushed, 0, 0, 0.115).scale.setScalar(0.986);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      add(wheel, spoke, brushed, 0, 0, 0.101).rotation.z = angle;
      add(wheel, spoke, graphite, 0, 0, 0.097).rotation.z = angle + 0.23;
    }
    add(wheel, disk, graphite, 0, 0, 0.118).scale.set(0.29, 0.29, 0.49);
  }

  function setState({ lightFlash, doorOpen, visible }) {
    group.visible = visible;
    if (!visible) return;
    indicators.emissiveIntensity = lightFlash * 3.1;
    hinge.rotation.y = -doorOpen * 0.94;
  }
  return { group, setState };
}

function buildFob(T, { add, box, textures }) {
  const group = new T.Group();
  group.name = 'geely-ex5-smart-key';
  const casing = new T.MeshPhysicalMaterial({ color: 0x191a1b, roughness: 0.38, clearcoat: 0.32 });
  const trim = new T.MeshStandardMaterial({ color: 0x8a9090, metalness: 0.65, roughness: 0.32 });
  const rubber = new T.MeshStandardMaterial({ color: 0x242626, roughness: 0.73 });
  box(group, trim, [0.052, 0.091, 0.015], [0, 0, 0], 0.007);
  box(group, casing, [0.049, 0.087, 0.014], [0, 0, 0.007], 0.006);
  const buttons = [-1, 0, 1].map(index => {
    const button = new T.Group();
    button.position.set(0, index * 0.022, 0.015);
    box(button, rubber, [0.034, 0.018, 0.005], [0, 0, 0], 0.002);
    const { texture } = paintCanvas(T, 64, 64, ctx => {
      ctx.strokeStyle = '#dedbd4';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (index >= 0) {
        ctx.roundRect(19, 30, 26, 20, 4);
        ctx.moveTo(index ? 25 : 27, index ? 30 : 25);
        if (index) ctx.lineTo(25, 24);
        ctx.bezierCurveTo(25, 12, 40, 12, 40, 24);
        ctx.lineTo(40, 30);
      } else {
        ctx.moveTo(13, 39);
        ctx.lineTo(21, 30);
        ctx.lineTo(37, 30);
        ctx.lineTo(48, 37);
        ctx.lineTo(49, 44);
        ctx.lineTo(14, 44);
        ctx.closePath();
        ctx.moveTo(39, 26);
        ctx.lineTo(48, 17);
      }
      ctx.stroke();
    });
    textures.add(texture);
    const ink = new T.MeshBasicMaterial({ map: texture, alphaTest: 0.4, toneMapped: false });
    add(button, new T.PlaneGeometry(0.014, 0.014), ink, 0, 0, 0.0027);
    group.add(button);
    return button;
  });
  const waves = createRipples(T, { count: 2, inner: 0.94, color: COLORS.GREEN, accentColor: COLORS.GREEN_BRIGHT });
  group.add(waves.group);
  function setState({ press, rfPulse, visible }) {
    group.visible = visible;
    if (!visible) return;
    buttons[1].position.z = 0.015 - 0.003 * press;
    waves.group.visible = rfPulse > 0 && rfPulse < 1;
    if (waves.group.visible) {
      waves.group.position.set(0.022 * rfPulse, 0.015 * rfPulse, -0.018);
      waves.update(rfPulse, 0.017, 0.087, 0.38, 0.7);
    }
  }
  function dispose() {
    waves.group.children[0].geometry.dispose();
    for (const mesh of waves.group.children) mesh.material.dispose();
  }
  return { group, setState, dispose };
}

export function createVehicleAssets(T, reflections) {
  const meshes = builder(T);
  const car = buildCar(T, meshes, reflections);
  const fob = buildFob(T, meshes);
  const deck = new T.Group();
  const shadows = [makeContactShadow(T, 6.7, 4.1, 0.33), makeContactShadow(T, 4.8, 2.75, 0.54)];
  shadows[1].position.y = 0.003;
  for (const axle of AXLES) for (const sign of [-1, 1]) {
    const contact = makeContactShadow(T, 0.86, 0.49, 0.62);
    contact.position.set(axle, 0.006, sign * 0.807);
    shadows.push(contact);
  }
  deck.add(...shadows);
  function dispose() {
    meshes.dispose();
    fob.dispose();
    for (const shadow of shadows) {
      shadow.geometry.dispose();
      shadow.material.map.dispose();
      shadow.material.dispose();
    }
  }
  return { deck: { group: deck }, car, fob, dispose };
}
