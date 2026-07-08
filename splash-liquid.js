/* ═══════════════════════════════════════════════════════════════════════
   Splash Liquid Ether — 精致的蓝绿液体流动，用于开屏过渡
   GPU Navier-Stokes 求解器 + React Bits 调色板
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────── */
  const CONFIG = {
    RESOLUTION:   0.45,    // 像素比（低=更快）
    VISCOSITY:    0.000015,
    DIFFUSION:    0.00001,
    VELOCITY_DISSIPATION: 0.985,
    DENSITY_DISSIPATION:  0.975,
    PRESSURE_ITER: 28,
    VISCOSITY_ITER: 14,
    CURL:         28,
    SPLAT_FORCE:  5000,
    AUTO_SPLAT:   true,
    AUTO_INTERVAL: 75,     // ms between auto splats
    SPLAT_COUNT:  3,      // per event
    DISPLAY_WIDTH:  window.innerWidth,
    DISPLAY_HEIGHT: window.innerHeight,
    SIM_WIDTH:  Math.floor(window.innerWidth  * CONFIG.RESOLUTION),
    SIM_HEIGHT: Math.floor(window.innerHeight * CONFIG.RESOLUTION),
  };

  const PALETTE = [
    [0x06, 0xd6, 0xf0],   // #06d6f0 cyan
    [0x00, 0xf5, 0xc4],   // #00f5c4 teal
    [0x27, 0xd9, 0xff],   // #27d9ff light blue
    [0x00, 0xe8, 0xd0],   // #00e8d0 jade
  ];

  /* ── Math helpers ───────────────────────────────────────────── */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── Texture helpers ─────────────────────────────────────────── */
  function createTexture(w, h) {
    const data = new Float32Array(w * h * 4);
    return { data, width: w, height: h, ref: null };
  }

  function createFBO(w, h, type) {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    const fb = new THREE.WebGLRenderTarget(w, h, {
      minFilter: tex.minFilter,
      magFilter: tex.magFilter,
      format: THREE.RGBAFormat,
      type: type || THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    return { texture: tex, fbo: fb, width: w, height: h };
  }

  function createDoubleFBO(w, h) {
    return {
      read:  createFBO(w, h),
      write: createFBO(w, h),
      swap() { const t = this.read; this.read = this.write; this.write = t; }
    };
  }

  /* ── Shaders ────────────────────────────────────────────────── */
  const VERT = `
    precision highp float;
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const COPY_FRAG = `
    precision highp float;
    uniform sampler2D uTexture;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uTexture, vUv); }
  `;

  const SPLAT_FRAG = `
    precision highp float;
    uniform sampler2D uTarget;
    uniform vec2 uPoint;
    uniform vec3 uColor;
    uniform float uRadius;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspect;
      float d = exp(-dot(p, p) / uRadius);
      vec3 base = texture2D(uTarget, vUv).rgb;
      gl_FragColor = vec4(base + uColor * d, 1.0);
    }
  `;

  const ADVECT_FRAG = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uTexelSize;
    uniform float uDt;
    uniform float uDissipation;
    varying vec2 vUv;
    void main() {
      vec2 vel = texture2D(uVelocity, vUv).xy;
      vec2 uv = vUv - uDt * vel * uTexelSize;
      gl_FragColor = uDissipation * texture2D(uSource, uv);
    }
  `;

  const CURL_FRAG = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;
    void main() {
      float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
      float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
      float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uVelocity, uUv - vec2(0.0, uTexelSize.y)).x;
      float curl = 0.5 * (R - L - T + B);
      gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
    }
  `;

  const VORTICITY_FRAG = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float uCurl_strength;
    uniform float uDt;
    uniform vec2 uTexelSize;
    varying vec2 vUv;
    void main() {
      float L = texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 1e-5;
      force *= uCurl * uCurl_strength;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      gl_FragColor = vec4(vel + force * uDt, 0.0, 1.0);
    }
  `;

  const DIV_FRAG = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;
    void main() {
      float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
      float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;

  const PRESSURE_FRAG = `
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform vec2 uTexelSize;
    varying vec2 vUv;
    void main() {
      float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
      float div = texture2D(uDivergence, vUv).x;
      float p = (L + R + B + T - div) * 0.25;
      gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
    }
  `;

  const GRADIENT_FRAG = `
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;
    void main() {
      float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      vel -= vec2(R - L, T - B);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `;

  const DISPLAY_FRAG = `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uGamma;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(uTexture, vUv).rgb;
      col = pow(col, vec3(uGamma));
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      // Subtle vignette
      vec2 p = vUv - 0.5;
      float vig = 1.0 - dot(p, p) * 0.6;
      gl_FragColor = vec4(col * vig, 1.0);
    }
  `;

  /* ── Main Class ─────────────────────────────────────────────── */
  class SplashLiquid {
    constructor(canvasId) {
      this.canvasId = canvasId;
      this.canvas = document.getElementById(canvasId);
      this._init();
    }

    _init() {
      const w = CONFIG.SIM_WIDTH;
      const h = CONFIG.SIM_HEIGHT;

      /* Renderer */
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: false,
        depth: false,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * 0.5, 1));
      this.renderer.setSize(CONFIG.DISPLAY_WIDTH, CONFIG.DISPLAY_HEIGHT, false);
      this.renderer.setClearColor(new THREE.Color(0x000000), 0);

      /* Camera + Scene */
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.camera.left   = -1; this.camera.right  =  1;
      this.camera.top    =  1; this.camera.bottom  = -1;
      this.camera.updateProjectionMatrix();

      /* Quad geometry */
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
      geo.setAttribute('aPos', new THREE.BufferAttribute(verts, 2));
      this._geo = geo;

      /* FBOs */
      this.velocity  = createDoubleFBO(w, h);
      this.density  = createDoubleFBO(w, h);
      this.pressure = createDoubleFBO(w, h);
      this.divBuf   = createFBO(w, h);
      this.curlBuf  = createFBO(w, h);

      /* Materials */
      const mkMat = (frag) => new THREE.RawShaderMaterial({
        vertexShader: VERT, fragmentShader: frag,
        uniforms: {},
        depthTest: false, depthWrite: false,
      });

      this.matCopy      = mkMat(COPY_FRAG);
      this.matSplat     = mkMat(SPLAT_FRAG);
      this.matAdvect    = mkMat(ADVECT_FRAG);
      this.matCurl      = mkMat(CURL_FRAG);
      this.matVorticity = mkMat(VORTICITY_FRAG);
      this.matDiv       = mkMat(DIV_FRAG);
      this.matPressure  = mkMat(PRESSURE_FRAG);
      this.matGradient  = mkMat(GRADIENT_FRAG);
      this.matDisplay   = mkMat(DISPLAY_FRAG);

      /* Mesh */
      this.mesh = new THREE.Mesh(geo, this.matDisplay);
      this.scene.add(this.mesh);

      /* State */
      this.texelSize = new THREE.Vector2(1/w, 1/h);
      this._quad    = new THREE.Vector2();
      this.clock    = new THREE.Clock();
      this._autoTimer = null;
      this._running  = false;
      this._paused   = false;

      /* Expose display size */
      this.displayWidth  = CONFIG.DISPLAY_WIDTH;
      this.displayHeight = CONFIG.DISPLAY_HEIGHT;
    }

    _blit(target) {
      if (target) {
        this.renderer.setRenderTarget(target.fbo);
        target.texture.needsUpdate = true;
      } else {
        this.renderer.setRenderTarget(null);
      }
      this.renderer.render(this.scene, this.camera);
    }

    _setUniforms(mat, extras) {
      const u = mat.uniforms;
      u.uTexelSize = this.texelSize;
      u.uVelocity  && (u.uVelocity.value  = this.velocity.read.texture);
      u.uSource    && (u.uSource.value    = this.density.read.texture);
      u.uPressure  && (u.uPressure.value  = this.pressure.read.texture);
      u.uCurl      && (u.uCurl.value      = this.curlBuf.texture);
      u.uDivergence&& (u.uDivergence.value= this.divBuf.texture);
      if (extras) Object.assign(u, extras);
    }

    _step(mat, target, dt) {
      this._setUniforms(mat, { uDt: { value: dt } });
      this.mesh.material = mat;
      this._blit(target);
      if (target) target.texture.needsUpdate = true;
    }

    splat(x, y, dx, dy, r, g, b) {
      const mat = this.matSplat;
      const u = mat.uniforms;
      u.uPoint    = { value: new THREE.Vector2(x, y) };
      u.uColor    = { value: new THREE.Vector3(dx * CONFIG.SPLAT_FORCE, dy * CONFIG.SPLAT_FORCE, 0) };
      u.uRadius   = { value: r || 0.00025 };
      u.uAspect   = { value: CONFIG.SIM_WIDTH / CONFIG.SIM_HEIGHT };
      u.uTarget   = { value: this.velocity.read.texture };
      this.mesh.material = mat;
      this._blit(this.velocity.write);
      this.velocity.swap();

      // Color splat
      u.uColor.value.set(dx, dy, 0);
      u.uPoint.value.set(x + 0.002, y + 0.003);
      u.uTarget.value = this.density.read.texture;
      u.uColor.value.set(r || 0.08, g || 0.05, b || 0.12);
      u.uRadius.value = 0.00018;
      this.mesh.material = mat;
      this._blit(this.density.write);
      this.density.swap();
    }

    _splatRandom() {
      const x = Math.random();
      const y = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const force = Math.random() * 0.5 + 0.2;
      const dx = Math.cos(angle) * force;
      const dy = Math.sin(angle) * force;
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const r = c[0] / 255 * 0.18;
      const g = c[1] / 255 * 0.15;
      const b = c[2] / 255 * 0.22;
      for (let i = 0; i < CONFIG.SPLAT_COUNT; i++) {
        this.splat(
          x + (Math.random() - 0.5) * 0.04,
          y + (Math.random() - 0.5) * 0.04,
          dx, dy, r, g, b
        );
      }
    }

    step() {
      if (this._paused) return;
      const dt = Math.min(this.clock.getDelta(), 0.033);

      // Advect velocity
      this._setUniforms(this.matAdvect, {
        uDt: { value: dt },
        uDissipation: { value: CONFIG.VELOCITY_DISSIPATION },
      });
      this.mesh.material = this.matAdvect;
      this._blit(this.velocity.write);
      this.velocity.swap();

      // Curl
      this._setUniforms(this.matCurl);
      this.mesh.material = this.matCurl;
      this._blit(this.curlBuf);
      this.curlBuf.texture.needsUpdate = true;

      // Vorticity confinement
      this._setUniforms(this.matVorticity, {
        uCurl_strength: { value: CONFIG.CURL },
        uDt: { value: dt },
      });
      this.mesh.material = this.matVorticity;
      this._blit(this.velocity.write);
      this.velocity.swap();

      // Divergence
      this._setUniforms(this.matDiv);
      this.mesh.material = this.matDiv;
      this._blit(this.divBuf);
      this.divBuf.texture.needsUpdate = true;

      // Pressure Jacobi
      for (let i = 0; i < CONFIG.PRESSURE_ITER; i++) {
        this._setUniforms(this.matPressure);
        this.mesh.material = this.matPressure;
        this._blit(this.pressure.write);
        this.pressure.swap();
      }

      // Gradient subtract
      this._setUniforms(this.matGradient);
      this.mesh.material = this.matGradient;
      this._blit(this.velocity.write);
      this.velocity.swap();

      // Advect density
      this._setUniforms(this.matAdvect, {
        uDt: { value: dt },
        uDissipation: { value: CONFIG.DENSITY_DISSIPATION },
        uSource: { value: this.density.read.texture },
      });
      this.mesh.material = this.matAdvect;
      this._blit(this.density.write);
      this.density.swap();

      // Display
      this._setUniforms(this.matDisplay, {
        uTexture: { value: this.density.read.texture },
        uGamma:  { value: 0.72 },
      });
      this.mesh.material = this.matDisplay;
      this._blit(null);
    }

    start() {
      this._running = true;
      this._paused  = false;
      this.clock.start();

      // Initial splats burst
      for (let i = 0; i < 12; i++) this._splatRandom();

      // Auto splat
      if (CONFIG.AUTO_SPLAT) {
        this._autoTimer = setInterval(() => {
          if (!this._paused) this._splatRandom();
        }, CONFIG.AUTO_INTERVAL);
      }

      // Render loop
      const loop = () => {
        if (!this._running) return;
        this.step();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    pause()  { this._paused = true; }
    resume() { this._paused = false; this.clock.getDelta(); }

    stop() {
      this._running = false;
      if (this._autoTimer) clearInterval(this._autoTimer);
    }

    resize() {
      // Note: full resize needs recreation — just update display size
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    /* Splat from mouse event */
    splatEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left)  / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      const angle = Math.random() * Math.PI * 2;
      const force = Math.random() * 0.6 + 0.3;
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.splat(x, y,
        Math.cos(angle) * force,
        Math.sin(angle) * force,
        c[0] / 255 * 0.22,
        c[1] / 255 * 0.18,
        c[2] / 255 * 0.28
      );
    }
  }

  /* ── Export ──────────────────────────────────────────────────── */
  window.SplashLiquid = SplashLiquid;

})();
