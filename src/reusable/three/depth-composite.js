// Render a scene with depth blur and an optional motion trail.
export function createDepthComposite(T, renderer, samples = 4) {
  const floatColor = renderer.extensions.has('EXT_color_buffer_float');
  const target = new T.WebGLRenderTarget(1, 1, {
    type: floatColor ? T.HalfFloatType : T.UnsignedByteType,
    depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
    // Dense screens hide jagged edges by themselves, so they get lighter antialiasing.
    samples: Math.min(samples, renderer.capabilities.maxSamples)
  });
  const history = [0, 1].map(() => new T.WebGLRenderTarget(1, 1, { depthBuffer: false }));
  let current = 0, trailing = false;

  // Composite: depth of field, tone mapping and sRGB by hand, then receding objects
  // fade toward the configured tint. Output is premultiplied and written raw.
  const composite = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false,
    uniforms: {
      picture: { value: target.texture }, depthMap: { value: target.depthTexture },
      previous: { value: history[1].texture }, trail: { value: 0 }, exposure: { value: .82 },
      pixel: { value: new T.Vector2() }, paper: { value: new T.Vector3(1, 1, 1) }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D picture, depthMap, previous;
      uniform vec2 pixel;
      uniform vec3 paper;
      uniform float trail;
      uniform float exposure;
      // Only objects that have receded blur; the front one stays sharp through its whole depth.
      float blurAt(vec2 uv) { return smoothstep(.535, .64, texture2D(depthMap, uv).x); }
      vec3 fit(vec3 v) {
        vec3 a = v * (v + .0245786) - .000090537;
        vec3 b = v * (.983729 * v + .4329510) + .238081;
        return a / b;
      }
      vec3 aces(vec3 color) {
        const mat3 inMat = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
        const mat3 outMat = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
        return clamp(outMat * fit(inMat * (color / .6)), 0., 1.);
      }
      vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      void main() {
        vec4 center = texture2D(picture, vUv), color = center;
        vec4 result = vec4(0.);
        bool empty = false;
        if (center.a < .002) {
          // Most of the canvas is empty: four taps as far out as the blur reaches
          // are enough to skip it.
          vec2 d = pixel * 2.6;
          empty = texture2D(picture, vUv + d).a + texture2D(picture, vUv - d).a
                + texture2D(picture, vUv + vec2(d.x, -d.y)).a + texture2D(picture, vUv + vec2(-d.x, d.y)).a < .002;
        }
        float blur = empty ? 0. : blurAt(vUv);
        if (!empty) {
          if (blur > .012) {
            // Three rings of eight taps, each ring turned a little to fill the gaps.
            color = center * 4.;
            float total = 4.;
            for (int ring = 1; ring <= 3; ring++) {
              float r = float(ring), weight = 1.9 - .4 * r;
              for (int i = 0; i < 8; i++) {
                float a = float(i) * .78539816 + r * .26;
                vec2 uv = vUv + vec2(cos(a), sin(a)) * pixel * blur * r;
                vec4 tap = texture2D(picture, uv);
                // A sharp foreground edge must not spread into clear background pixels.
                if (center.a < .01) tap *= smoothstep(.015, .2, blurAt(uv));
                color += weight * tap;
                total += weight;
              }
            }
            color /= total;
          }
          if (color.a >= .002) {
            vec3 rgb = srgb(aces(color.rgb / color.a * exposure));
            float luma = dot(rgb, vec3(.2126, .7152, .0722));
            rgb = mix(rgb, vec3(luma), .8 * blur);
            rgb = mix(rgb, paper, .2 * blur);
            result = vec4(rgb * color.a, color.a);
          }
        }
        if (trail > 0.) result += texture2D(previous, vUv) * trail * (1. - result.a);
        gl_FragColor = result;
      }`
  });
  const copy = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false,
    uniforms: { map: { value: null } },
    vertexShader: composite.vertexShader,
    fragmentShader: `varying vec2 vUv; uniform sampler2D map;
      void main() { gl_FragColor = texture2D(map, vUv); }`
  });
  const screen = new T.Scene(), flat = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), composite);
  screen.add(quad);

  function resize(width, height) {
    const ratio = renderer.getPixelRatio();
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    target.setSize(w, h);
    for (const frame of history) frame.setSize(w, h);
    composite.uniforms.pixel.value.set(3.4 / width, 3.4 / height);
    trailing = false;
  }

  function render(scene, camera, trail = 0) {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    quad.material = composite;
    if (trail > .01) {
      if (!trailing) {
        for (const h2 of history) { renderer.setRenderTarget(h2); renderer.clear(); }
        trailing = true;
      }
      composite.uniforms.previous.value = history[1 - current].texture;
      composite.uniforms.trail.value = trail;
      renderer.setRenderTarget(history[current]);
      renderer.render(screen, flat);
      quad.material = copy;
      copy.uniforms.map.value = history[current].texture;
      renderer.setRenderTarget(null);
      renderer.render(screen, flat);
      current = 1 - current;
    } else {
      trailing = false;
      composite.uniforms.trail.value = 0;
      renderer.setRenderTarget(null);
      renderer.render(screen, flat);
    }
  }

  function dispose() {
    target.dispose();
    for (const frame of history) frame.dispose();
    quad.geometry.dispose();
    composite.dispose();
    copy.dispose();
  }

  return { resize, render, dispose, uniforms: composite.uniforms };
}
