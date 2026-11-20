/*
 * The three everyday RFID objects: a car key fob, a phone and a contactless card.
 * Procedural Three.js models ported from the RFID field lab prototype.
 *
 * window.RFIDModels.build(THREE, addons, renderer, reduceMotion) returns three
 * objects in carousel order, each { name, model, action }:
 *   model  a THREE.Group to place in a scene
 *   action { activate(t), present?(), update(t, dt, model) }
 */
(function () {
  'use strict';

  function build(T, addons, renderer, reduceMotion) {
    const { RoundedBoxGeometry, toCreasedNormals } = addons;
    const PI = Math.PI, TAU = 2 * PI, clamp = T.MathUtils.clamp;

    const material = (color, metalness = 0, roughness = .45) => new T.MeshStandardMaterial({ color, metalness, roughness });
    const faces = (edge, front, back = edge) => [edge, edge, edge, edge, front, back];
    function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
      const part = new T.Mesh(geometry, mat);
      part.position.set(x, y, z);
      parent.add(part);
      return part;
    }
    function box(parent, w, h, d, r, mat, x = 0, y = 0, z = 0) {
      const thick = Math.max(d, 2 * r);
      const geometry = new RoundedBoxGeometry(w, h, thick, 3, r);
      geometry.scale(1, 1, d / thick);
      return mesh(parent, geometry, mat, x, y, z);
    }
    function texture(w, h, draw) {
      const surface = document.createElement('canvas');
      surface.width = w;
      surface.height = h;
      draw(surface.getContext('2d'), w, h);
      const map = new T.CanvasTexture(surface);
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return map;
    }
    function printed(map) {
      return new T.MeshStandardMaterial({ map, roughness: .56 });
    }
    function signal(ctx, x, y, size, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = size * .13;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y, size * i / 3, -.68, .68);
        ctx.stroke();
      }
    }

    // Local studio reflections give curved metal and lens glass readable highlights.
    const studio = texture(512, 256, c => {
      const ceiling = c.createLinearGradient(0, 0, 0, 256);
      for (const [at, color] of [[0, '#adb4c0'], [.33, '#dce4e7'], [.54, '#444a4e'], [.78, '#22292e'], [1, '#757d7c']])
        ceiling.addColorStop(at, color);
      c.fillStyle = ceiling; c.fillRect(0, 0, 512, 256);
      for (const [x, y, w, h] of [[18, 37, 100, 68], [244, 55, 23, 121], [383, 38, 79, 90]]) {
        c.fillStyle = '#f6f8f7'; c.fillRect(x, y, w, h);
      }
    });
    studio.mapping = T.EquirectangularReflectionMapping;
    function finish(color, metalness, roughness, reflection = .75) {
      const mat = material(color, metalness, roughness);
      mat.envMap = studio; mat.envMapIntensity = reflection;
      return mat;
    }
    function roundedOutline(w, h, top, bottom = top, centerY = 0) {
      const p = new T.Shape(), x = w / 2, hi = centerY + h / 2, lo = centerY - h / 2;
      p.moveTo(-x + bottom, lo);
      p.absarc(x - bottom, lo + bottom, bottom, -PI / 2, 0);
      p.absarc(x - top, hi - top, top, 0, PI / 2);
      p.absarc(-x + top, hi - top, top, PI / 2, PI);
      p.absarc(-x + bottom, lo + bottom, bottom, PI, 1.5 * PI);
      p.closePath();
      return p;
    }
    function casting(parent, outline, depth, bevel, mat, x = 0, y = 0, z = 0) {
      const geo = new T.ExtrudeGeometry(outline, {
        depth: depth - 2 * bevel, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 12
      });
      geo.translate(0, 0, bevel - depth / 2);
      return mesh(parent, toCreasedNormals(geo, PI / 4), mat, x, y, z);
    }
    function plate(parent, w, h, d, radius, bevel, mat, x = 0, y = 0, z = 0) {
      return casting(parent, roundedOutline(w - 2 * bevel, h - 2 * bevel, radius - bevel), d, bevel, mat, x, y, z);
    }

    // A tapered metal frame with a through-slot and two flush rocker keys.
    function createKeyFob(shell) {
      const titanium = finish(0x919797, .87, .27, 1.15);
      const graphite = finish(0x273232, .34, .43), rubber = finish(0x25302f, .12, .54);
      const seam = material(0x111817), nickel = finish(0x899591, .65, .32);
      const grain = texture(128, 128, (c, w, h) => {
        const pixels = c.createImageData(w, h), data = pixels.data;
        let seed = 701;
        for (let j = 0; j < data.length; j += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[j] = data[j + 1] = data[j + 2] = 165 + (seed >>> 26);
          data[j + 3] = 255;
        }
        c.putImageData(pixels, 0, 0);
      });
      grain.colorSpace = T.NoColorSpace; grain.wrapS = grain.wrapT = T.RepeatWrapping;
      graphite.bumpMap = rubber.bumpMap = titanium.roughnessMap = grain;
      graphite.bumpScale = .0025; rubber.bumpScale = .004;
      function silhouette() {
        const p = new T.Shape();
        p.moveTo(0, 1.01);
        p.bezierCurveTo(.35, 1.01, .525, .86, .537, .51);
        p.bezierCurveTo(.552, .09, .465, -.55, .377, -.84);
        p.bezierCurveTo(.334, -.99, .22, -1.055, 0, -1.055);
        p.bezierCurveTo(-.22, -1.055, -.334, -.99, -.377, -.84);
        p.bezierCurveTo(-.465, -.55, -.552, .09, -.537, .51);
        p.bezierCurveTo(-.525, .86, -.35, 1.01, 0, 1.01);
        return p;
      }
      const frame = silhouette();
      frame.holes.push(roundedOutline(.56, .205, .098, .098, -.849));
      casting(shell, frame, .245, .042, titanium);
      const gasket = casting(shell, silhouette(), .048, .017, seam, 0, .147, .12);
      gasket.scale.set(.985, .841, 1);
      const face = casting(shell, silhouette(), .088, .039, graphite, 0, .148, .124);
      face.scale.set(.95, .819, 1);
      const back = casting(shell, silhouette(), .079, .035, graphite, 0, .148, -.125);
      back.scale.copy(face.scale);
      plate(shell, .741, 1.147, .024, .268, .008, seam, 0, .115, .164);

      const keys = [false, true].map((open, i) => {
        const profile = roundedOutline(.687, .512, open ? .025 : .235, open ? .235 : .025);
        const key = casting(shell, profile, .062, .017, rubber, 0, .397 - i * .564, .190);
        const engraving = texture(192, 192, c => {
          c.strokeStyle = '#d8e1dc'; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.roundRect(51, 88, 90, 64, 13); c.stroke();
          const y = open ? 55 : 69;
          c.beginPath(); c.moveTo(69, 87); c.arc(96, y, 27, PI, TAU); c.lineTo(123, open ? 61 : 87); c.stroke();
          c.lineWidth = 6; c.beginPath(); c.moveTo(96, 114); c.lineTo(96, 126); c.stroke();
        });
        const ink = printed(engraving); ink.alphaTest = .25;
        mesh(key, new T.PlaneGeometry(.34, .34), ink, 0, 0, .0315);
        return key;
      });
      const lamp = material(0x77988a);
      plate(shell, .217, .044, .012, .021, .004, seam, 0, .808, .166);
      plate(shell, .169, .017, .007, .008, .002, lamp, 0, .808, .173);
      // The key-release slider is tucked into the underside of the grip.
      plate(shell, .36, .13, .025, .062, .009, seam, 0, -.474, -.161);
      for (const x of [-.069, 0, .069])
        box(shell, .018, .074, .015, .008, nickel, x, -.474, -.176);
      let since = -10;
      return {
        // Press the lock key and light the status lamp.
        activate(t) { since = t; },
        update(t) {
          const push = Math.sin(PI * clamp((t - since) / .46, 0, 1));
          const glow = Math.max(push, clamp(1 - (t - since - .46) / 1.6, 0, 1) * (t > since ? 1 : 0));
          keys[0].position.z = .190 - .036 * push;
          keys[1].position.z = .190;
          lamp.emissive.setRGB(.21 * glow, 1.45 * glow, .64 * glow);
        }
      };
    }

    // Phone exterior in millimeters, scaled once for the scene.
    function createPhone(shell) {
      const phone = new T.Group(), rear = new T.Group();
      phone.scale.setScalar(.019); shell.add(phone);
      rear.rotation.y = PI; rear.position.z = -4.21; phone.add(rear);
      const burgundy = finish(0x633340, .77, .32, 1.15);
      const enamel = finish(0x613440, .30, .39);
      const cutEdge = finish(0xb0838b, .89, .19, 1.15);
      const gasket = material(0x19141a), glass = finish(0x100f15, .20, .16, .32);
      plate(phone, 71.85, 150.01, 8.45, 13.8, 1.25, burgundy);
      plate(phone, 69.45, 147.61, .55, 12.6, .20, glass, 0, 0, 4.10);
      plate(rear, 64.0, 97.1, .48, 9.6, .19, enamel, 0, -22.6, .10);
      plate(rear, 64.1, 39.4, 4.82, 10.15, 2.16, burgundy, 0, 51.0, .37);

      // A polished inlay on the satin back glass.
      const inlay = finish(0x44222e, .65, .22);
      const fruit = new T.Shape();
      fruit.moveTo(0, .30);
      fruit.bezierCurveTo(.16, .33, .29, .47, .45, .25);
      fruit.bezierCurveTo(.23, .11, .28, -.09, .46, -.15);
      fruit.bezierCurveTo(.39, -.32, .27, -.54, .13, -.48);
      fruit.bezierCurveTo(.02, -.43, -.02, -.42, -.13, -.47);
      fruit.bezierCurveTo(-.29, -.55, -.48, -.20, -.48, .014);
      fruit.bezierCurveTo(-.49, .25, -.33, .42, -.17, .36);
      fruit.bezierCurveTo(-.09, .35, -.06, .31, 0, .30);
      const leaf = new T.Shape();
      leaf.moveTo(.015, .37); leaf.bezierCurveTo(-.015, .52, .13, .68, .285, .68);
      leaf.bezierCurveTo(.30, .53, .16, .37, .015, .37);
      mesh(rear, new T.ShapeGeometry([fruit, leaf], 14), inlay, 0, -17.7, .348).scale.setScalar(17.4);

      function disk(parent, r, mat, x, y, z) {
        return mesh(parent, new T.CircleGeometry(r, 48), mat, x, y, z);
      }
      function bezel(radius, tube, mat, x, y, z) {
        return mesh(rear, new T.TorusGeometry(radius, tube, 8, 56), mat, x, y, z);
      }
      // Separate barrels, machined rims and coated optics catch the light.
      for (const [i, [left, top]] of [[14.37, 14.37], [14.37, 33.61], [32.49, 23.99]].entries()) {
        const x = left - 35.925, y = 75 - top;
        const wall = mesh(rear, new T.CylinderGeometry(8.03, 8.29, 1.93, 56), burgundy, x, y, 3.70);
        wall.rotation.x = PI / 2;
        bezel(8.01, .25, cutEdge, x, y, 4.65);
        disk(rear, 7.88, gasket, x, y, 4.68);
        const lensMap = texture(256, 256, c => {
          const pupil = [32, 39, 30][i];
          const coating = c.createRadialGradient(128, 127, pupil * .55, 128, 128, 128);
          for (const [stop, tint] of [[0, '#060810'], [.21, '#152132'], [.38, '#243041'],
            [.46, '#0a1018'], [.61, '#292e37'], [.74, '#10141e'], [.94, '#1d2027'], [1, '#06090e']])
            coating.addColorStop(stop, tint);
          c.fillStyle = coating; c.fillRect(0, 0, 256, 256);
          c.fillStyle = '#050811'; c.beginPath();
          if (i === 1) {
            for (let j = 0; j < 6; j++) {
              const a = .20 + j * TAU / 6;
              c.lineTo(128 + pupil * Math.cos(a), 128 + pupil * Math.sin(a));
            }
            c.closePath(); c.fill(); c.strokeStyle = '#767188'; c.lineWidth = 1.4;
            for (let j = 0; j < 6; j++) {
              const a = .20 + j * TAU / 6;
              c.beginPath(); c.moveTo(128 + pupil * Math.cos(a), 128 + pupil * Math.sin(a));
              c.lineTo(128 + 61 * Math.cos(a + .36), 128 + 61 * Math.sin(a + .36)); c.stroke();
            }
          } else {
            c.arc(128, 128, pupil, 0, TAU); c.fill();
          }
          const glint = c.createRadialGradient(91, 80, 1, 91, 80, 30);
          glint.addColorStop(0, '#e3edff'); glint.addColorStop(.23, '#a1bdd5a6'); glint.addColorStop(1, '#829cdc00');
          c.fillStyle = glint; c.fillRect(0, 0, 256, 256);
          c.strokeStyle = '#8b98af'; c.lineWidth = 2; c.beginPath(); c.arc(128, 128, 104, 3.58, 4.68); c.stroke();
        });
        const optic = finish(0xffffff, .13, .14, .14); optic.map = lensMap;
        disk(rear, 7.28, optic, x, y, 4.79);
        bezel(7.37, .11, glass, x, y, 4.83);
      }
      const sensorX = 58.03 - 35.925;
      const flash = texture(128, 128, c => {
        c.fillStyle = '#ede7d5'; c.fillRect(0, 0, 128, 128);
        for (const x of [48, 80]) for (const y of [48, 80]) {
          c.fillStyle = x === y ? '#efc68d' : '#f6f5e9';
          c.beginPath(); c.arc(x, y, 16, 0, TAU); c.fill();
        }
        c.strokeStyle = '#bcb9ad'; c.lineWidth = 1.8;
        for (let r = 10; r < 64; r += 6) { c.beginPath(); c.arc(64, 64, r, 0, TAU); c.stroke(); }
      });
      disk(rear, 3.45, printed(flash), sensorX, 75 - 13.82, 2.84);
      bezel(3.49, .15, cutEdge, sensorX, 75 - 13.82, 2.85);
      disk(rear, 3.45, glass, sensorX, 75 - 34.16, 2.85);
      disk(rear, 1.08, finish(0x20232f, .18, .22), sensorX, 75 - 34.16, 2.87);
      disk(rear, .59, gasket, sensorX, 75 - 23.99, 2.85);

      for (const sign of [-1, 1]) {
        const rail = new T.Group(); phone.add(rail);
        rail.rotation.y = sign * PI / 2; rail.position.x = sign * 35.925;
        const buttons = sign < 0 ? [[34.28, 6.9], [48.43, 11.2], [62.63, 11.2]] : [[55.53, 17.7], [98.4, 17.1]];
        for (const [fromTop, length] of buttons) {
          const cameraControl = fromTop === 98.4;
          plate(rail, 3.13, length + .5, .27, 1.55, .09, gasket, 0, 75 - fromTop, .01);
          plate(rail, 2.66, length, cameraControl ? .35 : .85, 1.30, .13,
            cameraControl ? enamel : burgundy, 0, 75 - fromTop, cameraControl ? .055 : .18);
        }
        const band = material(0x4c2b37);
        for (const y of [-57.8, 59.4]) box(rail, 6.18, .88, .09, .15, band, 0, y, .018);
      }
      const bottom = new T.Group(); bottom.position.y = -75.01; bottom.rotation.x = PI / 2; phone.add(bottom);
      plate(bottom, 9.3, 3.42, .22, 1.62, .08, cutEdge, 0, 0, .035);
      plate(bottom, 8.85, 3.02, .15, 1.48, .05, gasket, 0, 0, .16);
      box(bottom, 6.9, .52, .13, .20, cutEdge, 0, 0, .25);
      for (const sign of [-1, 1]) {
        for (let n = 0; n < 5; n++) disk(bottom, .77, gasket, sign * (11.6 + n * 2.5), 0, .09);
        disk(bottom, .78, cutEdge, sign * 6.85, 0, .09);
        disk(bottom, .32, gasket, sign * 6.85, 0, .11);
      }

      // Original lock-screen artwork, drawn at the display's aspect ratio.
      const wallpaper = texture(540, 1174, c => {
        const base = c.createLinearGradient(0, 0, 540, 1174);
        base.addColorStop(0, '#2b1127'); base.addColorStop(.48, '#743945'); base.addColorStop(1, '#240e1c');
        c.fillStyle = base; c.fillRect(0, 0, 540, 1174);
        const silk = c.createLinearGradient(25, 330, 507, 720);
        for (const [at, tint] of [[0, '#38192d'], [.31, '#824658'], [.54, '#c77d83'], [.70, '#e7aa99'], [.80, '#8a4658'], [1, '#35192e']])
          silk.addColorStop(at, tint);
        c.fillStyle = silk; c.beginPath(); c.moveTo(584, 182);
        c.bezierCurveTo(547, 501, 33, 452, -87, 858);
        c.bezierCurveTo(19, 1031, 402, 777, 615, 464); c.closePath(); c.fill();
        const fold = c.createLinearGradient(50, 535, 415, 1060);
        for (const [at, tint] of [[0, '#491e36'], [.39, '#99546a'], [.56, '#e3a0a0'], [.61, '#8b4658'], [.79, '#38152b'], [1, '#57243a']])
          fold.addColorStop(at, tint);
        c.fillStyle = fold; c.beginPath(); c.moveTo(-45, 552);
        c.bezierCurveTo(134, 742, 318, 905, 580, 636); c.lineTo(585, 841);
        c.bezierCurveTo(360, 1120, 56, 888, -45, 711); c.closePath(); c.fill();
        c.fillStyle = '#08090c'; c.beginPath(); c.roundRect(206, 18, 128, 49, 24); c.fill();
        c.fillStyle = '#233242'; c.beginPath(); c.arc(307, 41, 8, 0, TAU); c.fill();
        c.fillStyle = '#516278'; c.beginPath(); c.arc(305, 39, 2.4, 0, TAU); c.fill();
        c.fillStyle = '#f8ebe9';
        for (let i = 0; i < 4; i++) c.fillRect(423 + i * 9, 53 - i * 4.5, 6, 6 + i * 4.5);
        c.strokeStyle = '#f8ebe9'; c.lineWidth = 2.5; c.strokeRect(469, 41, 32, 15);
        c.fillRect(473, 45, 22, 7); c.fillRect(503, 45, 3, 7);
        c.textAlign = 'center'; c.font = '500 23px "Segoe UI", sans-serif'; c.fillText('Friday, September 18', 270, 169);
        c.font = '500 129px "Segoe UI", sans-serif'; c.fillText('9:41', 270, 291);
        for (const x of [78, 462]) {
          c.fillStyle = '#ffffff22'; c.beginPath(); c.arc(x, 1059, 30, 0, TAU); c.fill();
        }
        c.lineWidth = 3.1; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(69, 1047); c.lineTo(87, 1047); c.lineTo(82, 1059);
        c.lineTo(82, 1072); c.lineTo(74, 1072); c.lineTo(74, 1059); c.closePath(); c.stroke();
        c.beginPath(); c.roundRect(447, 1050, 30, 19, 4); c.stroke();
        c.beginPath(); c.arc(462, 1059, 6, 0, TAU); c.stroke();
        c.fillStyle = '#fff4ef'; c.beginPath(); c.roundRect(191, 1148, 158, 6, 3); c.fill();
      });
      const screen = finish(0xffffff, 0, .24, .085);
      screen.map = screen.emissiveMap = wallpaper; screen.emissive.setHex(0xffffff);
      screen.toneMapped = false;
      const display = new T.ShapeGeometry(roundedOutline(66.57, 144.73, 11.45), 16);
      const { position, uv } = display.attributes;
      for (let i = 0; i < position.count; i++) {
        uv.setXY(i, position.getX(i) / 66.57 + .5, position.getY(i) / 144.73 + .5);
      }
      mesh(phone, display, screen, 0, 0, 4.383);
      box(phone, 12.8, .34, .07, .16, gasket, 0, 73.13, 4.37);
      // At rest the phone shows its camera side, like the sketch.
      shell.parent.rotation.y = PI;
      let wake = -10, brightness = 0;
      return {
        // Turn around and wake the lock screen for a few seconds.
        activate(t) { wake = t; },
        present() { wake = -10; },
        update(t, dt, model) {
          const showScreen = t - wake < 5;
          model.rotation.y = reduceMotion.matches ? (showScreen ? 0 : PI)
            : T.MathUtils.damp(model.rotation.y, showScreen ? 0 : PI, 4.2, dt);
          brightness = T.MathUtils.damp(brightness, t - wake < 4 ? 1 : 0, 6, dt);
          screen.color.setScalar(.21 + .18 * brightness);
          screen.emissiveIntensity = .17 + .79 * brightness;
        }
      };
    }

    function createCard(shell) {
      const front = texture(640, 400, c => {
        const lacquer = c.createLinearGradient(32, 48, 640, 400);
        lacquer.addColorStop(0, '#0b3037'); lacquer.addColorStop(.62, '#124a51');
        lacquer.addColorStop(1, '#227779');
        c.fillStyle = lacquer; c.fillRect(0, 0, 640, 400);

        const foil = c.createLinearGradient(295, 340, 655, 85);
        foil.addColorStop(0, '#a4d9bd33'); foil.addColorStop(.56, '#a4d9bd99');
        foil.addColorStop(1, '#b6e3cb45');
        c.strokeStyle = foil; c.lineWidth = 3;
        for (let offset = 0; offset < 220; offset += 19) {
          c.beginPath(); c.moveTo(278 + offset, 418);
          c.bezierCurveTo(346 + offset, 204, 529 + offset, 258, 570 + offset, -18); c.stroke();
        }

        c.fillStyle = '#fff5dd'; c.font = '600 58px sans-serif'; c.fillText('Credit', 48, 100);
        c.font = '600 36px monospace'; c.fillText('•••• 0248', 48, 349);

        const gold = c.createLinearGradient(48, 151, 152, 229);
        gold.addColorStop(0, '#b88b4d'); gold.addColorStop(.38, '#ffe2a5');
        gold.addColorStop(.68, '#dcb679'); gold.addColorStop(1, '#f4cf91');
        c.fillStyle = gold; c.strokeStyle = '#ffe1a6'; c.lineWidth = 2;
        c.beginPath(); c.roundRect(48, 151, 104, 78, 12); c.fill(); c.stroke();
        c.strokeStyle = '#805f3c'; c.lineWidth = 2.5;
        c.beginPath(); c.roundRect(85, 173, 30, 34, 6);
        c.moveTo(75, 152); c.lineTo(75, 168); c.lineTo(85, 177);
        c.moveTo(125, 152); c.lineTo(125, 168); c.lineTo(115, 177);
        c.moveTo(75, 228); c.lineTo(75, 212); c.lineTo(85, 203);
        c.moveTo(125, 228); c.lineTo(125, 212); c.lineTo(115, 203);
        c.moveTo(49, 190); c.lineTo(85, 190); c.moveTo(115, 190); c.lineTo(151, 190); c.stroke();
        signal(c, 171, 190, 33, '#fff5dd');
      });
      const back = texture(640, 400, c => {
        c.fillStyle = '#123e45'; c.fillRect(0, 0, 640, 400);
        const stripe = c.createLinearGradient(0, 65, 0, 156);
        stripe.addColorStop(0, '#111b20'); stripe.addColorStop(.4, '#263339');
        stripe.addColorStop(1, '#0f171c');
        c.fillStyle = stripe; c.fillRect(0, 65, 640, 91);
        c.fillStyle = '#ede8d6'; c.fillRect(48, 197, 365, 66);
        c.fillStyle = '#a2b1a6'; c.fillRect(68, 247, 325, 2);
        c.fillStyle = '#e0eee5'; c.font = '600 24px sans-serif'; c.fillText('Signature', 48, 295);
      });
      box(shell, 2.39, 1.51, .078, .13, faces(material(0x416369), printed(front), printed(back)));
      let target = 0;
      return {
        // Flip the card over.
        activate() { target += PI; },
        present() { target = Math.round(target / TAU) * TAU; },
        update(t, dt, model) {
          model.rotation.y = reduceMotion.matches ? target : T.MathUtils.damp(model.rotation.y, target, 5, dt);
        }
      };
    }

    function object(name, create) {
      const model = new T.Group(), shell = new T.Group();
      model.add(shell);
      return { name, model, action: create(shell) };
    }
    return [
      object('Key fob', createKeyFob),
      object('Phone', createPhone),
      object('Contactless card', createCard)
    ];
  }

  window.RFIDModels = { build };
})();
