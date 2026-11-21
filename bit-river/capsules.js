const CAPSULES = [
  { label: 'ID', value: '04A27F91', bytes: [0x04, 0xa2, 0x7f, 0x91], lane: .26, phase: .42, start: .53 },
  { label: 'AUTH', value: '8A2F', bytes: [0x8a, 0x2f], lane: -.52, phase: .15, start: .63 },
  { label: 'DATA', value: 'Demo', bytes: [0x44, 0x65, 0x6d, 0x6f], lane: .62, phase: .73, start: .72 }
];

const clamp = value => Math.max(0, Math.min(1, value));
function fade(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function binary(bytes) {
  return bytes.map(byte => byte.toString(2).padStart(8, '0'));
}

function dataTexture(THREE, bytes) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 256;
  const ink = canvas.getContext('2d');
  ink.font = '700 30px monospace';
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.fillStyle = '#fff1d3';
  const rows = binary(bytes);
  for (let i = 0; i < rows.length; i++) {
    ink.fillText(rows[i], 96, 128 + (i - (rows.length - 1) / 2) * 53);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glassMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { alpha: { value: 0 }, opening: { value: 0 } },
    vertexShader: `
      uniform float opening;
      varying vec3 surfacePoint;
      varying vec3 eyeNormal;
      varying vec3 eyeDirection;

      void main() {
        surfacePoint = position;
        vec3 split = position;
        split.x += sign(position.x) * opening * 0.082;
        split.y += position.y * opening * 0.14;
        vec4 eyePosition = modelViewMatrix * vec4(split, 1.0);
        eyeNormal = normalMatrix * normal;
        eyeDirection = -eyePosition.xyz;
        gl_Position = projectionMatrix * eyePosition;
      }`,
    fragmentShader: `
      uniform float alpha;
      uniform float opening;
      varying vec3 surfacePoint;
      varying vec3 eyeNormal;
      varying vec3 eyeDirection;

      void main() {
        vec3 normal = normalize(eyeNormal);
        vec3 eye = normalize(eyeDirection);
        float rim = pow(1.0 - max(dot(normal, eye), 0.0), 2.3);
        float reflection = pow(max(dot(reflect(-eye, normal), normalize(vec3(-0.9, 0.7, 0.6))), 0.0), 16.0);
        float reflectedBand = pow(1.0 - abs(normal.x * 0.9 + normal.z * 0.42), 13.0);
        float seam = mix(1.0, smoothstep(0.003, 0.045, abs(surfacePoint.x)), opening);
        vec3 copper = vec3(0.50, 0.24, 0.095);
        vec3 light = vec3(1.0, 0.79, 0.59);
        vec3 tint = mix(copper, light, clamp(rim + reflection + reflectedBand * 0.65, 0.0, 1.0));
        float opacity = (0.16 + rim * 0.79 + reflection * 0.69 + reflectedBand * 0.25);
        gl_FragColor = vec4(tint, opacity * alpha * seam * (1.0 - opening * 0.45));
        #include <colorspace_fragment>
      }`
  });
}

export function createCapsules({ THREE, scene, surface, controls, notice, readout, signal, onDisturb, onReceive, wake }) {
  const size = .56;
  const radius = size * .25;
  const shellGeometry = new THREE.CapsuleGeometry(radius, size - radius * 2, 7, 20);
  const ringGeometry = new THREE.TorusGeometry(radius * .99, .004, 4, 24).rotateX(Math.PI / 2);
  const dataGeometry = new THREE.PlaneGeometry(radius * 1.85, size * .73);
  const y = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const lifted = new THREE.Vector3();
  const slide = new THREE.Vector3();
  const entries = [...controls.querySelectorAll('.packet')];

  const capsuleList = CAPSULES.map((data, i) => {
    const group = new THREE.Group();
    group.visible = false;
    scene?.add(group);

    const shell = new THREE.Mesh(shellGeometry, glassMaterial(THREE));
    const core = new THREE.Mesh(dataGeometry, new THREE.MeshBasicMaterial({
      map: dataTexture(THREE, data.bytes), color: 0xffdcb0, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, opacity: 0
    }));
    const rim = new THREE.MeshBasicMaterial({ color: 0xffac69, transparent: true, depthWrite: false, opacity: 0 });
    const firstRing = new THREE.Mesh(ringGeometry, rim);
    const lastRing = new THREE.Mesh(ringGeometry, rim);
    firstRing.position.y = size * .28;
    lastRing.position.y = -size * .28;
    shell.renderOrder = 3;
    group.add(core, firstRing, lastRing, shell);
    return {
      ...data, group, shell, core, rim, button: entries[i], dragOffset: new THREE.Vector3(),
      open: 0, t: 0, detail: binary(data.bytes).join(' '), missingUntil: 0, burstAt: -Infinity, replace: false
    };
  });

  const grainCount = 12;
  const grainPositions = new Float32Array(capsuleList.length * grainCount * 3);
  const grainAlphas = new Float32Array(capsuleList.length * grainCount);
  const grainGeometry = new THREE.BufferGeometry();
  grainGeometry.setAttribute('position', new THREE.BufferAttribute(grainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  grainGeometry.setAttribute('alpha', new THREE.BufferAttribute(grainAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  const grainMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { resolution: { value: 1 } },
    vertexShader: `
      attribute float alpha;
      uniform float resolution;
      varying float appearance;
      void main() {
        appearance = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.5 + alpha * 4.0) * resolution;
      }`,
    fragmentShader: `
      varying float appearance;
      void main() {
        float glow = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(1.0, 0.64, 0.39, glow * appearance);
      }`
  });
  const grains = new THREE.Points(grainGeometry, grainMaterial);
  grains.frustumCulled = false;
  grains.renderOrder = 4;
  scene?.add(grains);

  let hovered = -1;
  let keyboard = -1;
  let pinned = -1;
  let inspecting = -1;
  let drag = null;
  let stopClickUntil = 0;
  let unlocked = false;
  let unlockTimer;
  let noticeTimer;
  let warning = false;
  let view;
  const on = (target, event, fn) => target.addEventListener(event, fn, { signal });
  const readoutLabel = readout?.querySelector('.inspection-label');
  const readoutValue = readout?.querySelector('.inspection-value');
  const readoutBinary = readout?.querySelector('.inspection-binary');

  function announce(message, delay = 0) {
    if (!notice) return;
    clearTimeout(noticeTimer);
    notice.textContent = message;
    if (delay) noticeTimer = setTimeout(() => {
      notice.textContent = '';
      warning = false;
      setInspection();
    }, delay);
  }

  function setInspection() {
    const requested = drag?.active ? -1 : hovered >= 0 ? hovered : pinned >= 0 ? pinned : keyboard;
    const next = capsuleList[requested]?.group.visible ? requested : -1;
    if (next >= 0 && !unlocked && !unlockTimer && !warning) {
      announce("You're not supposed to see this... But just this once. 👀");
      unlockTimer = setTimeout(() => {
        unlocked = true;
        unlockTimer = null;
        announce('');
        setInspection();
      }, 1250);
    }
    const open = unlocked ? next : -1;
    if (inspecting === open) return;
    inspecting = open;
    entries.forEach((button, i) => {
      button.classList.toggle('is-inspecting', i === inspecting);
      button.setAttribute('aria-pressed', String(i === inspecting));
    });
    if (readout) {
      readout.hidden = inspecting < 0;
      if (inspecting >= 0) {
        const capsule = capsuleList[inspecting];
        if (readoutLabel) readoutLabel.textContent = `${capsule.label} · Simulated`;
        if (readoutValue) readoutValue.textContent = capsule.value;
        if (readoutBinary) readoutBinary.textContent = capsule.detail;
      }
    }
    wake();
  }

  function project(point) {
    if (view.project) return view.project(point);
    screen.copy(point).project(view.camera);
    return { x: (screen.x * .5 + .5) * view.projectRect.width,
      y: (.5 - screen.y * .5) * view.projectRect.height, z: screen.z };
  }

  function worldDrag(dx, dy, z) {
    if (!view.camera) return slide.set(dx / 50, -dy / 50, 0);
    lifted.copy(base).project(view.camera);
    lifted.x += 2 * dx / view.projectRect.width;
    lifted.y -= 2 * dy / view.projectRect.height;
    lifted.z = z;
    return slide.copy(lifted).unproject(view.camera).sub(base);
  }

  function outsideRiver(x, py) {
    let distance = Infinity;
    let nearest = 0;
    for (let i = 0; i <= 24; i++) {
      const t = view.front * i / 24;
      const center = project(view.point(t, 0, sample));
      const gap = Math.hypot(center.x - x, center.y - py);
      if (gap < distance) {
        distance = gap;
        nearest = t;
      }
    }
    const center = project(view.point(nearest, 0, sample));
    const a = project(view.point(nearest, -1, sample));
    const b = project(view.point(nearest, 1, sample));
    const breadth = Math.max(Math.hypot(a.x - center.x, a.y - center.y), Math.hypot(b.x - center.x, b.y - center.y));
    return distance > breadth + 27;
  }

  function steal(i) {
    const capsule = capsuleList[i];
    if (!capsule.group.visible || capsule.replace) return;
    const recoverFocus = capsule.button.getRootNode().activeElement === capsule.button;
    capsule.missingUntil = performance.now() + 780;
    capsule.replace = true;
    capsule.group.visible = false;
    capsule.open = 0;
    capsule.dragOffset.set(0, 0, 0);
    onDisturb?.(capsule.t, capsule.lane);
    if (keyboard === i) keyboard = -1;
    if (hovered === i) hovered = -1;
    if (pinned === i) pinned = -1;
    // The inspection reveal must not overwrite the removal message.
    clearTimeout(unlockTimer);
    unlockTimer = null;
    warning = true;
    announce('DATA PACKET MISSING! 🚨', 1900);
    setInspection();
    if (recoverFocus) {
      entries.find(button => button !== capsule.button && !button.hidden)?.focus({ preventScroll: true });
    }
    wake();
  }

  entries.forEach((button, i) => {
    on(button, 'pointerenter', event => {
      if (event.pointerType !== 'mouse' || drag) return;
      hovered = i;
      setInspection();
    });
    on(button, 'pointerleave', () => {
      if (hovered !== i) return;
      hovered = -1;
      setInspection();
    });
    on(button, 'focus', () => {
      if (drag?.i === i) return;
      keyboard = i;
      setInspection();
    });
    on(button, 'blur', () => {
      if (keyboard === i) keyboard = -1;
      setInspection();
    });
    on(button, 'click', event => {
      if (event.detail && performance.now() < stopClickUntil) return;
      if (pinned === i) {
        pinned = keyboard = hovered = -1;
      } else {
        pinned = i;
      }
      setInspection();
    });
    on(button, 'keydown', event => {
      if (event.key === 'Delete') {
        event.preventDefault();
        steal(i);
      }
      if (event.key === 'Escape') {
        hovered = keyboard = pinned = -1;
        setInspection();
      }
    });
    on(button, 'pointerdown', event => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      drag = { i, id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, active: false };
    });
  });

  on(window, 'pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    if (!drag.active && Math.hypot(drag.dx, drag.dy) < 8) return;
    if (!drag.active) {
      const button = entries[drag.i];
      drag.active = true;
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-dragging');
      setInspection();
    }
    wake();
  });

  function release(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const { i, active } = drag;
    const capsule = capsuleList[i];
    capsule.button.classList.remove('is-dragging');
    drag = null;
    if (!active) return;
    stopClickUntil = performance.now() + 350;
    hovered = -1;
    if (event.type === 'pointerup') {
      const rect = surface.getBoundingClientRect();
      if (outsideRiver(event.clientX - rect.left, event.clientY - rect.top)) steal(i);
    }
    setInspection();
    wake();
  }

  on(window, 'pointerup', release);
  on(window, 'pointercancel', release);
  on(surface, 'lostpointercapture', release);

  function drawGrain(index, strength, age, forming) {
    for (let i = 0; i < grainCount; i++) {
      const slot = index * grainCount + i;
      const angle = i * 2.399963 + view.time * .72;
      const radius = (i % 4 + 3) * (forming ? .055 : .033 + age * .03);
      grainPositions[slot * 3] = base.x + radius * Math.cos(angle);
      grainPositions[slot * 3 + 1] = base.y + radius * Math.sin(angle);
      grainPositions[slot * 3 + 2] = base.z + radius * Math.cos(angle * .6);
      grainAlphas[slot] = strength * (i % 4 + 3) * .105;
    }
  }

  function update(frame) {
    view = frame;
    const { time, dt, front, progress, point, motion, reduced, projectRect } = frame;
    const now = performance.now();
    const lerp = reduced ? 1 : 1 - Math.exp(-Math.max(dt, 1 / 120) * 9);
    grainAlphas.fill(0);
    let unsettled = false;

    capsuleList.forEach((capsule, i) => {
      const { group, shell, core, rim, button } = capsule;
      const entry = fade(capsule.start, capsule.start + .135, progress);
      const available = front > .1 && entry > 0;
      if (capsule.replace && now >= capsule.missingUntil) {
        capsule.replace = false;
        capsule.phase = reduced || !motion ? CAPSULES[i].phase : 0;
      }
      const steady = i === inspecting || i === hovered || i === keyboard || i === drag?.i;
      const lastPhase = capsule.phase;
      if (available && !capsule.replace && !steady && motion) {
        capsule.phase = (capsule.phase + dt * .115) % 1;
      }

      const t = capsule.t = capsule.phase * front;
      const formation = fade(0, .145, capsule.phase);
      const arrival = 1 - fade(.92, 1, capsule.phase);
      const opacity = (capsule.replace ? 0 : entry) * formation * arrival;
      let interactive = opacity > .32 && t >= .13 && t <= .95;
      group.visible = opacity > .001;
      if (!group.visible && (hovered === i || pinned === i || keyboard === i)) {
        if (hovered === i) hovered = -1;
        if (pinned === i) pinned = -1;
        if (keyboard === i) keyboard = -1;
      }
      if (i === inspecting && group.visible) interactive = true;
      if (i === drag?.i && drag.active) interactive = true;

      point(t, capsule.lane, base);
      const open = i === inspecting ? 1 : 0;
      capsule.open += (open - capsule.open) * lerp;
      if (Math.abs(open - capsule.open) > .005 || capsule.replace || capsule.dragOffset.lengthSq() > .0001) unsettled = true;
      const anchor = project(base);
      if (i === drag?.i && drag.active) {
        capsule.dragOffset.copy(worldDrag(drag.dx, drag.dy, anchor.z));
      } else {
        capsule.dragOffset.multiplyScalar(1 - lerp);
      }

      if (group.visible) {
        point(Math.min(1, t + .012), capsule.lane, tangent).sub(base).normalize();
        group.position.copy(base).add(capsule.dragOffset);
        group.position.y += capsule.open * .34;
        group.position.z += capsule.open * .18;
        group.quaternion.setFromUnitVectors(y, tangent);
        group.rotateY((motion ? Math.sin(time * .7 + i * 2) * .38 : 0) + capsule.open * .2);
        group.scale.setScalar((.58 + .42 * formation) * (.68 + .32 * arrival) * (.84 + entry * .16 + capsule.open * .29));
        shell.material.uniforms.alpha.value = opacity;
        shell.material.uniforms.opening.value = capsule.open;
        core.material.opacity = opacity * (.58 + capsule.open * .42) * (.93 + Math.sin(time * 2.5 + i) * .07);
        rim.opacity = opacity * (.65 - capsule.open * .36);
        if (!reduced && capsule.phase < .17) drawGrain(i, entry * (1 - formation) * .63, 0, true);
        if (!reduced && capsule.open > .01) {
          base.copy(group.position);
          drawGrain(i, Math.sin(Math.PI * capsule.open) * .56 + capsule.open * .16, 0, true);
        }
      }

      if (motion && available && front > .975 && lastPhase < .975 && capsule.phase >= .975) {
        capsule.burstAt = time;
        onReceive?.(i);
      }
      const age = time - capsule.burstAt;
      if (!reduced && age < .52) {
        point(1, 0, base);
        drawGrain(i, .67 * (1 - age / .52), age, false);
      }

      button.hidden = !interactive || anchor.x < 0 || anchor.y < 0 || anchor.x > projectRect.width ||
        anchor.y > projectRect.height || anchor.z > 1 || anchor.z < -1;
      if (!button.hidden) {
        const position = drag?.i === i && drag.active ? project(group.position) : anchor;
        button.style.left = `${position.x.toFixed(1)}px`;
        button.style.top = `${position.y.toFixed(1)}px`;
      }
    });

    grains.visible = !reduced && grainAlphas.some(alpha => alpha > 0);
    if (grains.visible) {
      grainMaterial.uniforms.resolution.value = Math.min(devicePixelRatio || 1, 1.6);
      grainGeometry.attributes.position.needsUpdate = true;
      grainGeometry.attributes.alpha.needsUpdate = true;
    }
    setInspection();
    return unsettled;
  }

  signal.addEventListener('abort', () => {
    clearTimeout(unlockTimer);
    clearTimeout(noticeTimer);
    for (const capsule of capsuleList) {
      capsule.shell.material.dispose();
      capsule.core.material.map.dispose();
      capsule.core.material.dispose();
      capsule.rim.dispose();
      capsule.group.removeFromParent();
    }
    grains.removeFromParent();
    for (const buffer of [shellGeometry, ringGeometry, dataGeometry, grainGeometry, grainMaterial]) buffer.dispose();
  }, { once: true });

  return {
    update,
    get focus() { return capsuleList[inspecting]?.group.position ?? null; }
  };
}
