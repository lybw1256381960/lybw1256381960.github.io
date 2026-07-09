/**
 * LiquidEther — GPU Navier-Stokes Fluid Simulation
 * Ported from React Bits (reactbits.dev) to vanilla JS
 */

(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────────────
  const CONFIG = {
    colors: ['#0fb89e', '#3dd4ba', '#5fe2c8', '#8eebd5', '#c5f4e2'],
    mouseForce: 18,
    cursorSize: 38,
    resolution: 0.4,
    dt: 0.014,
    BFECC: true,
    isViscous: false,
    viscous: 30,
    iterationsViscous: 32,
    iterationsPoisson: 28,
    isBounce: false,
    autoDemo: true,
    autoSpeed: 0.15,
    autoIntensity: 1.6,
    takeoverDuration: 0.25,
    autoResumeDelay: 3000,
    autoRampDuration: 0.6,
  };

  // ─── THREE.js Shortcut ───────────────────────────────────────────────────
  const THREE = window.THREE;

  // ─── Palette Texture ─────────────────────────────────────────────────────
  function makePaletteTexture(stops) {
    const arr = (Array.isArray(stops) && stops.length > 0) ? stops : ['#ffffff', '#ffffff'];
    const w = arr.length;
    const data = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
      const c = new THREE.Color(arr[i]);
      data[i * 4] = Math.round(c.r * 255);
      data[i * 4 + 1] = Math.round(c.g * 255);
      data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  const paletteTex = makePaletteTexture(CONFIG.colors);
  const bgVec4 = new THREE.Vector4(0, 0, 0, 0); // transparent

  // ─── Common (container manager) ──────────────────────────────────────────
  const Common = {
    width: 0, height: 0, aspect: 1, pixelRatio: 1,
    isMobile: false, breakpoint: 768,
    fboWidth: null, fboHeight: null,
    time: 0, delta: 0,
    container: null, renderer: null, clock: null,
    pendingResize: false,

    init(container) {
      this.container = container;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.resize();
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: false,
      });
      this.renderer.autoClear = false;
      this.renderer.setClearColor(new THREE.Color(0x000000), 0);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.top = '0';
      this.renderer.domElement.style.left = '0';
      this.renderer.domElement.style.pointerEvents = 'none';
      this.clock = new THREE.Clock();
      this.clock.start();
    },

    resize() {
      if (!this.container) return;
      const rect = this.container.getBoundingClientRect();
      this.width = Math.max(1, Math.floor(rect.width));
      this.height = Math.max(1, Math.floor(rect.height));
      this.aspect = this.width / this.height;
      if (this.renderer) this.renderer.setSize(this.width, this.height, false);
    },

    update() {
      this.delta = this.clock.getDelta();
      this.time += this.delta;
    },
  };

  // ─── Mouse ───────────────────────────────────────────────────────────────
  const Mouse = {
    mouseMoved: false,
    coords: new THREE.Vector2(),
    coords_old: new THREE.Vector2(),
    diff: new THREE.Vector2(),
    timer: null,
    container: null,
    docTarget: null,
    listenerTarget: null,
    isHoverInside: false,
    hasUserControl: false,
    isAutoActive: false,
    autoIntensity: 2.0,
    takeoverActive: false,
    takeoverStartTime: 0,
    takeoverDuration: 0.25,
    takeoverFrom: new THREE.Vector2(),
    takeoverTo: new THREE.Vector2(),
    onInteract: null,

    _onMouseMove: null,
    _onTouchStart: null,
    _onTouchMove: null,
    _onTouchEnd: null,
    _onDocLeave: null,

    init(container) {
      this.container = container;
      this.docTarget = container.ownerDocument || null;
      const defaultView = (this.docTarget && this.docTarget.defaultView) || window;
      if (!defaultView) return;
      this.listenerTarget = defaultView;

      this._onMouseMove = this.onDocumentMouseMove.bind(this);
      this._onTouchStart = this.onDocumentTouchStart.bind(this);
      this._onTouchMove = this.onDocumentTouchMove.bind(this);
      this._onTouchEnd = this.onTouchEnd.bind(this);
      this._onDocLeave = this.onDocumentLeave.bind(this);

      this.listenerTarget.addEventListener('mousemove', this._onMouseMove);
      this.listenerTarget.addEventListener('touchstart', this._onTouchStart, { passive: true });
      this.listenerTarget.addEventListener('touchmove', this._onTouchMove, { passive: true });
      this.listenerTarget.addEventListener('touchend', this._onTouchEnd);
      if (this.docTarget) {
        this.docTarget.addEventListener('mouseleave', this._onDocLeave);
      }
    },

    dispose() {
      if (this.listenerTarget) {
        this.listenerTarget.removeEventListener('mousemove', this._onMouseMove);
        this.listenerTarget.removeEventListener('touchstart', this._onTouchStart);
        this.listenerTarget.removeEventListener('touchmove', this._onTouchMove);
        this.listenerTarget.removeEventListener('touchend', this._onTouchEnd);
      }
      if (this.docTarget) {
        this.docTarget.removeEventListener('mouseleave', this._onDocLeave);
      }
      this.listenerTarget = null;
      this.docTarget = null;
      this.container = null;
    },

    isPointInside(cx, cy) {
      if (!this.container) return false;
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
    },

    updateHoverState(cx, cy) {
      this.isHoverInside = this.isPointInside(cx, cy);
      return this.isHoverInside;
    },

    setCoords(x, y) {
      if (!this.container) return;
      if (this.timer) clearTimeout(this.timer);
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (x - rect.left) / rect.width;
      const ny = (y - rect.top) / rect.height;
      this.coords.set(nx * 2 - 1, -(ny * 2 - 1));
      this.mouseMoved = true;
      this.timer = setTimeout(() => { this.mouseMoved = false; }, 100);
    },

    setNormalized(nx, ny) {
      this.coords.set(nx, ny);
      this.mouseMoved = true;
    },

    onDocumentMouseMove(e) {
      if (!this.updateHoverState(e.clientX, e.clientY)) return;
      if (this.onInteract) this.onInteract();
      if (this.isAutoActive && !this.hasUserControl && !this.takeoverActive) {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        this.takeoverFrom.copy(this.coords);
        this.takeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
        this.takeoverStartTime = performance.now();
        this.takeoverActive = true;
        this.hasUserControl = true;
        this.isAutoActive = false;
        return;
      }
      this.setCoords(e.clientX, e.clientY);
      this.hasUserControl = true;
    },

    onDocumentTouchStart(e) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!this.updateHoverState(t.clientX, t.clientY)) return;
      if (this.onInteract) this.onInteract();
      this.setCoords(t.clientX, t.clientY);
      this.hasUserControl = true;
    },

    onDocumentTouchMove(e) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!this.updateHoverState(t.clientX, t.clientY)) return;
      if (this.onInteract) this.onInteract();
      this.setCoords(t.clientX, t.clientY);
    },

    onTouchEnd() { this.isHoverInside = false; },
    onDocumentLeave() { this.isHoverInside = false; },

    update() {
      if (this.takeoverActive) {
        const t = (performance.now() - this.takeoverStartTime) / (this.takeoverDuration * 1000);
        if (t >= 1) {
          this.takeoverActive = false;
          this.coords.copy(this.takeoverTo);
          this.coords_old.copy(this.coords);
          this.diff.set(0, 0);
        } else {
          const k = t * t * (3 - 2 * t);
          this.coords.copy(this.takeoverFrom).lerp(this.takeoverTo, k);
        }
      }
      this.diff.subVectors(this.coords, this.coords_old);
      this.coords_old.copy(this.coords);
      if (this.coords_old.x === 0 && this.coords_old.y === 0) this.diff.set(0, 0);
      if (this.isAutoActive && !this.takeoverActive) this.diff.multiplyScalar(this.autoIntensity);
    },
  };

  // ─── AutoDriver ───────────────────────────────────────────────────────────
  class AutoDriver {
    constructor(mouse, manager, opts) {
      this.mouse = mouse;
      this.manager = manager;
      this.enabled = opts.enabled;
      this.speed = opts.speed;
      this.resumeDelay = opts.resumeDelay || 3000;
      this.rampDurationMs = (opts.rampDuration || 0) * 1000;
      this.active = false;
      this.current = new THREE.Vector2(0, 0);
      this.target = new THREE.Vector2();
      this.lastTime = performance.now();
      this.activationTime = 0;
      this.margin = 0.2;
      this._tmpDir = new THREE.Vector2();
      this.pickNewTarget();
    }

    pickNewTarget() {
      const r = Math.random;
      this.target.set(
        (r() * 2 - 1) * (1 - this.margin),
        (r() * 2 - 1) * (1 - this.margin)
      );
    }

    forceStop() {
      this.active = false;
      this.mouse.isAutoActive = false;
    }

    update() {
      if (!this.enabled) return;
      const now = performance.now();
      const idle = now - this.manager.lastUserInteraction;
      if (idle < this.resumeDelay) { if (this.active) this.forceStop(); return; }
      if (this.mouse.isHoverInside) { if (this.active) this.forceStop(); return; }
      if (!this.active) {
        this.active = true;
        this.current.copy(this.mouse.coords);
        this.lastTime = now;
        this.activationTime = now;
      }
      if (!this.active) return;
      this.mouse.isAutoActive = true;
      let dtSec = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (dtSec > 0.2) dtSec = 0.016;
      const dir = this._tmpDir.subVectors(this.target, this.current);
      const dist = dir.length();
      if (dist < 0.01) { this.pickNewTarget(); return; }
      dir.normalize();
      let ramp = 1;
      if (this.rampDurationMs > 0) {
        const t = Math.min(1, (now - this.activationTime) / this.rampDurationMs);
        ramp = t * t * (3 - 2 * t);
      }
      const step = this.speed * dtSec * ramp;
      const move = Math.min(step, dist);
      this.current.addScaledVector(dir, move);
      this.mouse.setNormalized(this.current.x, this.current.y);
    }
  }

  // ─── Shaders ─────────────────────────────────────────────────────────────
  const FACE_VERT = `
    attribute vec3 position;
    uniform vec2 px;
    uniform vec2 boundarySpace;
    varying vec2 uv;
    precision highp float;
    void main(){
      vec3 pos = position;
      vec2 scale = 1.0 - boundarySpace * 2.0;
      pos.xy = pos.xy * scale;
      uv = vec2(0.5)+(pos.xy)*0.5;
      gl_Position = vec4(pos, 1.0);
    }
  `;

  const LINE_VERT = `
    attribute vec3 position;
    uniform vec2 px;
    precision highp float;
    varying vec2 uv;
    void main(){
      vec3 pos = position;
      uv = 0.5 + pos.xy * 0.5;
      vec2 n = sign(pos.xy);
      pos.xy = abs(pos.xy) - px * 1.0;
      pos.xy *= n;
      gl_Position = vec4(pos, 1.0);
    }
  `;

  const MOUSE_VERT = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
      vec2 pos = position.xy * scale * 2.0 * px + center;
      vUv = uv;
      gl_Position = vec4(pos, 0.0, 1.0);
    }
  `;

  const ADVECTION_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform bool isBFECC;
    uniform vec2 fboSize;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
      if(isBFECC == false){
        vec2 vel = texture2D(velocity, uv).xy;
        vec2 uv2 = uv - vel * dt * ratio;
        vec2 newVel = texture2D(velocity, uv2).xy;
        gl_FragColor = vec4(newVel, 0.0, 0.0);
      } else {
        vec2 spot_new = uv;
        vec2 vel_old = texture2D(velocity, uv).xy;
        vec2 spot_old = spot_new - vel_old * dt * ratio;
        vec2 vel_new1 = texture2D(velocity, spot_old).xy;
        vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
        vec2 error = spot_new2 - spot_new;
        vec2 spot_new3 = spot_new - error / 2.0;
        vec2 vel_2 = texture2D(velocity, spot_new3).xy;
        vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
        vec2 newVel2 = texture2D(velocity, spot_old2).xy;
        gl_FragColor = vec4(newVel2, 0.0, 0.0);
      }
    }
  `;

  const COLOR_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D palette;
    uniform vec4 bgColor;
    varying vec2 uv;
    void main(){
      vec2 vel = texture2D(velocity, uv).xy;
      float lenv = clamp(length(vel), 0.0, 1.0);
      // boost to make low-velocity visible
      float boosted = pow(lenv, 0.5);
      vec3 c = texture2D(palette, vec2(boosted, 0.5)).rgb;
      float alpha = clamp(boosted * 0.8, 0.0, 1.0);
      gl_FragColor = vec4(c, alpha);
    }
  `;

  const DIVERGENCE_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      float x0 = texture2D(velocity, uv-vec2(px.x, 0.0)).x;
      float x1 = texture2D(velocity, uv+vec2(px.x, 0.0)).x;
      float y0 = texture2D(velocity, uv-vec2(0.0, px.y)).y;
      float y1 = texture2D(velocity, uv+vec2(0.0, px.y)).y;
      float divergence = (x1 - x0 + y1 - y0) / 2.0;
      gl_FragColor = vec4(divergence / dt);
    }
  `;

  const EXTERNAL_FORCE_FRAG = `
    precision highp float;
    uniform vec2 force;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
      vec2 circle = (vUv - 0.5) * 2.0;
      float d = 1.0 - min(length(circle), 1.0);
      d *= d;
      gl_FragColor = vec4(force * d, 0.0, 1.0);
    }
  `;

  const POISSON_FRAG = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D divergence;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
      float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
      float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
      float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
      float div = texture2D(divergence, uv).r;
      float newP = (p0 + p1 + p2 + p3) / 4.0 - div;
      gl_FragColor = vec4(newP);
    }
  `;

  const PRESSURE_FRAG = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;
    void main(){
      float step = 1.0;
      float p0 = texture2D(pressure, uv + vec2(px.x * step, 0.0)).r;
      float p1 = texture2D(pressure, uv - vec2(px.x * step, 0.0)).r;
      float p2 = texture2D(pressure, uv + vec2(0.0, px.y * step)).r;
      float p3 = texture2D(pressure, uv - vec2(0.0, px.y * step)).r;
      vec2 v = texture2D(velocity, uv).xy;
      vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
      v = v - gradP * dt;
      gl_FragColor = vec4(v, 0.0, 1.0);
    }
  `;

  const VISCOUS_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D velocity_new;
    uniform float v;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;
    void main(){
      vec2 old = texture2D(velocity, uv).xy;
      vec2 new0 = texture2D(velocity_new, uv + vec2(px.x * 2.0, 0.0)).xy;
      vec2 new1 = texture2D(velocity_new, uv - vec2(px.x * 2.0, 0.0)).xy;
      vec2 new2 = texture2D(velocity_new, uv + vec2(0.0, px.y * 2.0)).xy;
      vec2 new3 = texture2D(velocity_new, uv - vec2(0.0, px.y * 2.0)).xy;
      vec2 newv = 4.0 * old + v * dt * (new0 + new1 + new2 + new3);
      newv /= 4.0 * (1.0 + v * dt);
      gl_FragColor = vec4(newv, 0.0, 0.0);
    }
  `;

  // ─── ShaderPass base ─────────────────────────────────────────────────────
  class ShaderPass {
    constructor(props) {
      this.props = props || {};
      this.uniforms = this.props.material?.uniforms;
      this.scene = null;
      this.camera = null;
      this.material = null;
      this.geometry = null;
      this.plane = null;
    }
    init() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      if (this.uniforms) {
        this.material = new THREE.RawShaderMaterial(this.props.material);
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.plane = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.plane);
      }
    }
    setOutput() {
      Common.renderer.setRenderTarget(this.props.output || null);
      Common.renderer.render(this.scene, this.camera);
      Common.renderer.setRenderTarget(null);
    }
  }

  // ─── Advection Pass ──────────────────────────────────────────────────────
  class Advection extends ShaderPass {
    constructor(simProps) {
      super({
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: ADVECTION_FRAG,
          uniforms: {
            boundarySpace: { value: new THREE.Vector2() },
            px: { value: simProps.cellScale },
            fboSize: { value: simProps.fboSize },
            velocity: { value: simProps.src.texture },
            dt: { value: simProps.dt },
            isBFECC: { value: true },
          },
        },
        output: simProps.dst,
      });
      this.uniforms = this.props.material.uniforms;
      this.init();
      this.createBoundary();
    }
    createBoundary() {
      const bg = new THREE.BufferGeometry();
      const vb = new Float32Array([
        -1, -1, 0, -1, 1, 0, -1, 1, 0, 1, 1, 0, 1, 1, 0, 1, -1, 0, 1, -1, 0, -1, -1, 0,
      ]);
      bg.setAttribute('position', new THREE.BufferAttribute(vb, 3));
      const bm = new THREE.RawShaderMaterial({
        vertexShader: LINE_VERT,
        fragmentShader: ADVECTION_FRAG,
        uniforms: this.uniforms,
      });
      this.line = new THREE.LineSegments(bg, bm);
      this.scene.add(this.line);
    }
    update(opts) {
      this.uniforms.dt.value = opts.dt;
      this.line.visible = opts.isBounce;
      this.uniforms.isBFECC.value = opts.BFECC;
      this.setOutput();
    }
  }

  // ─── ExternalForce Pass ──────────────────────────────────────────────────
  class ExternalForce extends ShaderPass {
    constructor(simProps) {
      super({ output: simProps.dst });
      this.init(simProps);
    }
    init(simProps) {
      super.init();
      const mg = new THREE.PlaneGeometry(1, 1);
      const mm = new THREE.RawShaderMaterial({
        vertexShader: MOUSE_VERT,
        fragmentShader: EXTERNAL_FORCE_FRAG,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          px: { value: simProps.cellScale },
          force: { value: new THREE.Vector2(0, 0) },
          center: { value: new THREE.Vector2(0, 0) },
          scale: { value: new THREE.Vector2(simProps.cursor_size, simProps.cursor_size) },
        },
      });
      this.mouse = new THREE.Mesh(mg, mm);
      this.scene.add(this.mouse);
    }
    update(opts) {
      const forceX = (Mouse.diff.x / 2) * opts.mouse_force;
      const forceY = (Mouse.diff.y / 2) * opts.mouse_force;
      const cursorSizeX = opts.cursor_size * opts.cellScale.x;
      const cursorSizeY = opts.cursor_size * opts.cellScale.y;
      const centerX = Math.min(Math.max(Mouse.coords.x, -1 + cursorSizeX + opts.cellScale.x * 2),
        1 - cursorSizeX - opts.cellScale.x * 2);
      const centerY = Math.min(Math.max(Mouse.coords.y, -1 + cursorSizeY + opts.cellScale.y * 2),
        1 - cursorSizeY - opts.cellScale.y * 2);
      const u = this.mouse.material.uniforms;
      u.force.value.set(forceX, forceY);
      u.center.value.set(centerX, centerY);
      u.scale.value.set(opts.cursor_size, opts.cursor_size);
      this.setOutput();
    }
  }

  // ─── Viscous Pass ────────────────────────────────────────────────────────
  class Viscous extends ShaderPass {
    constructor(simProps) {
      super({
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: VISCOUS_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            velocity: { value: simProps.src.texture },
            velocity_new: { value: simProps.dst_.texture },
            v: { value: simProps.viscous },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
        output0: simProps.dst_,
        output1: simProps.dst,
      });
      this.init();
    }
    update(opts) {
      let fbo_in, fbo_out;
      this.uniforms.v.value = opts.viscous;
      for (let i = 0; i < opts.iterations; i++) {
        if (i % 2 === 0) {
          fbo_in = this.props.output0;
          fbo_out = this.props.output1;
        } else {
          fbo_in = this.props.output1;
          fbo_out = this.props.output0;
        }
        this.uniforms.velocity_new.value = fbo_in.texture;
        this.props.output = fbo_out;
        this.uniforms.dt.value = opts.dt;
        this.setOutput();
      }
      return fbo_out;
    }
  }

  // ─── Divergence Pass ─────────────────────────────────────────────────────
  class Divergence extends ShaderPass {
    constructor(simProps) {
      super({
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: DIVERGENCE_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            velocity: { value: simProps.src.texture },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
      });
      this.init();
    }
    update(opts) {
      this.uniforms.velocity.value = opts.vel.texture;
      this.setOutput();
    }
  }

  // ─── Poisson Pass ────────────────────────────────────────────────────────
  class Poisson extends ShaderPass {
    constructor(simProps) {
      super({
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: POISSON_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            pressure: { value: simProps.dst_.texture },
            divergence: { value: simProps.src.texture },
            px: { value: simProps.cellScale },
          },
        },
        output: simProps.dst,
        output0: simProps.dst_,
        output1: simProps.dst,
      });
      this.init();
    }
    update(opts) {
      let p_in, p_out;
      for (let i = 0; i < opts.iterations; i++) {
        if (i % 2 === 0) {
          p_in = this.props.output0;
          p_out = this.props.output1;
        } else {
          p_in = this.props.output1;
          p_out = this.props.output0;
        }
        this.uniforms.pressure.value = p_in.texture;
        this.props.output = p_out;
        this.setOutput();
      }
      return p_out;
    }
  }

  // ─── Pressure Projection Pass ────────────────────────────────────────────
  class Pressure extends ShaderPass {
    constructor(simProps) {
      super({
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: PRESSURE_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            pressure: { value: simProps.src_p.texture },
            velocity: { value: simProps.src_v.texture },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
      });
      this.init();
    }
    update(opts) {
      this.uniforms.velocity.value = opts.vel.texture;
      this.uniforms.pressure.value = opts.pressure.texture;
      this.setOutput();
    }
  }

  // ─── Simulation ──────────────────────────────────────────────────────────
  class Simulation {
    constructor(options) {
      this.options = {
        iterations_poisson: 32,
        iterations_viscous: 32,
        mouse_force: 20,
        resolution: 0.5,
        cursor_size: 100,
        viscous: 30,
        isBounce: false,
        dt: 0.014,
        isViscous: false,
        BFECC: true,
        ...options,
      };
      this.fbos = {
        vel_0: null, vel_1: null,
        vel_viscous0: null, vel_viscous1: null,
        div: null,
        pressure_0: null, pressure_1: null,
      };
      this.fboSize = new THREE.Vector2();
      this.cellScale = new THREE.Vector2();
      this.boundarySpace = new THREE.Vector2();
      this.init();
    }

    init() {
      this.calcSize();
      this.createAllFBO();
      this.createShaderPass();
    }

    getFloatType() {
      const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
      return isIOS ? THREE.HalfFloatType : THREE.FloatType;
    }

    createAllFBO() {
      const type = this.getFloatType();
      const opts = {
        type,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      };
      for (let key in this.fbos) {
        this.fbos[key] = new THREE.WebGLRenderTarget(this.fboSize.x, this.fboSize.y, opts);
      }
    }

    createShaderPass() {
      this.advection = new Advection({
        cellScale: this.cellScale,
        fboSize: this.fboSize,
        dt: this.options.dt,
        src: this.fbos.vel_0,
        dst: this.fbos.vel_1,
      });
      this.externalForce = new ExternalForce({
        cellScale: this.cellScale,
        cursor_size: this.options.cursor_size,
        dst: this.fbos.vel_1,
      });
      this.viscous = new Viscous({
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        viscous: this.options.viscous,
        src: this.fbos.vel_1,
        dst: this.fbos.vel_viscous1,
        dst_: this.fbos.vel_viscous0,
        dt: this.options.dt,
      });
      this.divergence = new Divergence({
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        src: this.fbos.vel_viscous0,
        dst: this.fbos.div,
        dt: this.options.dt,
      });
      this.poisson = new Poisson({
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        src: this.fbos.div,
        dst: this.fbos.pressure_1,
        dst_: this.fbos.pressure_0,
      });
      this.pressure = new Pressure({
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        src_p: this.fbos.pressure_0,
        src_v: this.fbos.vel_viscous0,
        dst: this.fbos.vel_0,
        dt: this.options.dt,
      });
    }

    calcSize() {
      const w = Math.max(1, Math.round(this.options.resolution * Common.width));
      const h = Math.max(1, Math.round(this.options.resolution * Common.height));
      this.cellScale.set(1 / w, 1 / h);
      this.fboSize.set(w, h);
    }

    resize() {
      this.calcSize();
      for (let key in this.fbos) {
        this.fbos[key].setSize(this.fboSize.x, this.fboSize.y);
      }
    }

    update() {
      if (this.options.isBounce) {
        this.boundarySpace.set(0, 0);
      } else {
        this.boundarySpace.copy(this.cellScale);
      }

      this.advection.update({
        dt: this.options.dt,
        isBounce: this.options.isBounce,
        BFECC: this.options.BFECC,
      });

      this.externalForce.update({
        cursor_size: this.options.cursor_size,
        mouse_force: this.options.mouse_force,
        cellScale: this.cellScale,
      });

      let vel = this.fbos.vel_1;
      if (this.options.isViscous) {
        vel = this.viscous.update({
          viscous: this.options.viscous,
          iterations: this.options.iterations_viscous,
          dt: this.options.dt,
        });
      }

      this.divergence.update({ vel });
      const pressure = this.poisson.update({ iterations: this.options.iterations_poisson });
      this.pressure.update({ vel, pressure });
    }
  }

  // ─── Output Renderer ─────────────────────────────────────────────────────
  class Output {
    constructor(sim) {
      this.simulation = sim;
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();

      const uniforms = {
        velocity: { value: sim.fbos.vel_0.texture },
        boundarySpace: { value: new THREE.Vector2() },
        palette: { value: paletteTex },
        bgColor: { value: bgVec4 },
      };

      this.material = new THREE.RawShaderMaterial({
        vertexShader: FACE_VERT,
        fragmentShader: COLOR_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms,
      });

      this.output = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
      this.scene.add(this.output);
    }

    render() {
      Common.renderer.setRenderTarget(null);
      Common.renderer.render(this.scene, this.camera);
    }

    update() {
      this.simulation.update();
      this.render();
    }
  }

  // ─── WebGL Manager ──────────────────────────────────────────────────────
  class WebGLManager {
    constructor(props) {
      this.props = props;
      this.lastUserInteraction = performance.now();
      this.running = false;
      this._boundLoop = this.loop.bind(this);
      this._boundResize = this.resize.bind(this);
      this._boundVisibility = null;

      Common.init(props.$wrapper);
      Mouse.init(props.$wrapper);
      Mouse.autoIntensity = props.autoIntensity;
      Mouse.takeoverDuration = props.takeoverDuration;
      Mouse.onInteract = () => {
        this.lastUserInteraction = performance.now();
        if (this.autoDriver) this.autoDriver.forceStop();
      };

      this.autoDriver = new AutoDriver(Mouse, this, {
        enabled: props.autoDemo,
        speed: props.autoSpeed,
        resumeDelay: props.autoResumeDelay,
        rampDuration: props.autoRampDuration,
      });

      this.init();

      window.addEventListener('resize', this._boundResize);
      this._boundVisibility = (() => {
        if (document.hidden) this.pause();
        else this.start();
      }).bind(this);
      document.addEventListener('visibilitychange', this._boundVisibility);
    }

    init() {
      this.props.$wrapper.prepend(Common.renderer.domElement);

      this.simulation = new Simulation({
        iterations_poisson: this.props.iterationsPoisson,
        iterations_viscous: this.props.iterationsViscous,
        mouse_force: this.props.mouseForce,
        resolution: this.props.resolution,
        cursor_size: this.props.cursorSize,
        viscous: this.props.viscous,
        isBounce: this.props.isBounce,
        dt: this.props.dt,
        isViscous: this.props.isViscous,
        BFECC: this.props.BFECC,
      });

      this.output = new Output(this.simulation);
    }

    resize() {
      Common.resize();
      this.simulation.resize();
    }

    render() {
      if (this.autoDriver) this.autoDriver.update();
      Mouse.update();
      Common.update();
      this.output.update();
    }

    loop() {
      if (!this.running) return;
      this.render();
      this._rafId = requestAnimationFrame(this._boundLoop);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this._loop();
    }

    _loop() {
      this.render();
      this._rafId = requestAnimationFrame(this._boundLoop);
    }

    pause() {
      this.running = false;
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    }

    dispose() {
      try {
        window.removeEventListener('resize', this._boundResize);
        document.removeEventListener('visibilitychange', this._boundVisibility);
        Mouse.dispose();
        if (Common.renderer) {
          const canvas = Common.renderer.domElement;
          if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
          Common.renderer.dispose();
          Common.renderer.forceContextLoss();
        }
      } catch (e) { /* ignore */ }
    }
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('liquid-ether-canvas');
    if (!canvas) { console.error('LiquidEther: canvas not found'); return; }

    // Create a div wrapper for the container
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '0';
    wrapper.style.pointerEvents = 'none';
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);
    canvas.style.display = 'none'; // hide the canvas element, Three will add its own

    const webgl = new WebGLManager({
      $wrapper: wrapper,
      mouseForce: CONFIG.mouseForce,
      cursorSize: CONFIG.cursorSize,
      isViscous: CONFIG.isViscous,
      viscous: CONFIG.viscous,
      iterationsViscous: CONFIG.iterationsViscous,
      iterationsPoisson: CONFIG.iterationsPoisson,
      dt: CONFIG.dt,
      BFECC: CONFIG.BFECC,
      resolution: CONFIG.resolution,
      isBounce: CONFIG.isBounce,
      autoDemo: CONFIG.autoDemo,
      autoSpeed: CONFIG.autoSpeed,
      autoIntensity: CONFIG.autoIntensity,
      takeoverDuration: CONFIG.takeoverDuration,
      autoResumeDelay: CONFIG.autoResumeDelay,
      autoRampDuration: CONFIG.autoRampDuration,
    });

    try {
      webgl.start();
      console.log('LiquidEther: Navier-Stokes fluid simulation initialized');
    } catch (e) {
      console.error('LiquidEther init failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { init(); } catch(e) { console.warn('LiquidEther bootstrap failed:', e); } });
  } else {
    try { init(); } catch(e) { console.warn('LiquidEther bootstrap failed:', e); }
  }
})();
