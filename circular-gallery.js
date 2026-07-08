/**
 * CircularGallery — Vanilla JS + OGL
 * 3D 透视圆形作品集轮播，参考 React Bits CircularGallery 交互
 *
 * 用法:
 *   const gallery = new CircularGallery({
 *     container: '#gallery-container',
 *     items: [
 *       { image: 'url', text: '标题' },
 *       ...
 *     ],
 *     bend: 3,
 *     textColor: '#005f6e',
 *     borderRadius: 0.05,
 *     scrollEase: 0.05,
 *   });
 *   gallery.start();
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CircularGallery = factory();
}(this, function () {
  'use strict';

  /* ── Math helpers ───────────────────────────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── Text → Canvas texture ─────────────────────────────────── */
  function createTextTexture(gl, text, font, color, padding) {
    padding = padding || 12;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const tw = Math.ceil(metrics.width) + padding * 2;
    const th = Math.ceil(parseFloat(font) * 1.6) + padding * 2;
    canvas.width = Math.max(tw, 64);
    canvas.height = Math.max(th, 32);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create OGL Texture from canvas
    const tex = new gl.renderer.Texture(canvas, {
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      flipY: false,
    });
    return { texture: tex, width: canvas.width, height: canvas.height };
  }

  /* ── Load image → OGL Texture ──────────────────────────────── */
  function loadImageTexture(gl, url) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const tex = new gl.renderer.Texture(img, {
          minFilter: gl.LINEAR_MIPMAP_LINEAR,
          magFilter: gl.LINEAR,
          flipY: false,
        });
        resolve({ texture: tex, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        // Fallback: solid color placeholder
        const cvs = document.createElement('canvas');
        cvs.width = 400; cvs.height = 300;
        const cx = cvs.getContext('2d');
        cx.fillStyle = '#c8ecf0';
        cx.fillRect(0, 0, 400, 300);
        const tex = new gl.renderer.Texture(cvs, { minFilter: gl.LINEAR, magFilter: gl.LINEAR, flipY: false });
        resolve({ texture: tex, width: 400, height: 300 });
      };
      img.src = url;
    });
  }

  /* ── Vertex/Fragment shaders ───────────────────────────────── */
  var VERT = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  var FRAG_PLANE = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uOpacity;
    uniform float uRadius;
    void main() {
      vec2 center = vec2(0.5);
      vec2 p = vUv - center;
      float dist = length(p * vec2(1.0, 1.0 / 0.75));
      float r = uRadius;
      float alpha = 1.0 - smoothstep(r * 0.88, r, dist);
      vec4 col = texture2D(uMap, vUv);
      gl_FragColor = vec4(col.rgb, col.a * alpha * uOpacity);
    }
  `;

  var FRAG_TEXT = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uOpacity;
    void main() {
      vec4 col = texture2D(uMap, vUv);
      gl_FragColor = vec4(col.rgb, col.a * uOpacity);
    }
  `;

  /* ── CircularGallery ───────────────────────────────────────── */
  function CircularGallery(opts) {
    opts = opts || {};
    this.container = typeof opts.container === 'string'
      ? document.querySelector(opts.container)
      : opts.container;
    if (!this.container) throw new Error('CircularGallery: container not found');

    this.items = opts.items || [];
    this.bend = opts.bend !== undefined ? opts.bend : 3;
    this.textColor = opts.textColor || '#005f6e';
    this.borderRadius = opts.borderRadius !== undefined ? opts.borderRadius : 0.05;
    this.scrollEase = opts.scrollEase !== undefined ? opts.scrollEase : 0.05;
    this.scrollSpeed = opts.scrollSpeed !== undefined ? opts.scrollSpeed : 2;
    this.font = opts.font || 'bold 28px "Space Grotesk", sans-serif';
    this.labelOffsetY = opts.labelOffsetY !== undefined ? opts.labelOffsetY : 0.12;

    this._currentAngle = 0;
    this._targetAngle = 0;
    this._isDragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._velocity = 0;
    this._lastDragTime = 0;
    this._loadedImages = [];
    this._meshes = [];
    this._textMeshes = [];
    this._itemData = []; // { angle, loadedData }
    this._running = false;
    this._raf = null;
    this._itemCount = this.items.length;
  }

  CircularGallery.prototype.start = function () {
    var self = this;
    this._running = true;

    // Create canvas
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.container.style.position = 'relative';
    this.container.appendChild(canvas);
    this.canvas = canvas;

    // OGL renderer
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new this._ogl.Renderer({
      canvas: canvas,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      dpr: dpr,
      alpha: true,
      antialias: true,
    });
    var gl = this.renderer;
    this._gl = gl;

    // Camera
    this.camera = new gl.Camera();
    this.camera.position.set(0, 0, 5);
    this.camera.far = 20;

    // Scene
    this.scene = new gl.Scene();
    this.scene.matrixAutoUpdate = false;

    // Geometry
    this._geoPlane = new gl.Plane(gl, { width: 1, height: 1.0 });

    // Programs
    var fragTextClean = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uOpacity;
void main() {
  vec4 col = texture2D(uMap, vUv);
  if (col.a < 0.01) discard;
  gl_FragColor = vec4(col.rgb, col.a * uOpacity);
}`;
    this._progPlane = new gl.Program(gl, {
      vertex: VERT,
      fragment: FRAG_PLANE,
      uniforms: {
        uMap: { value: null },
        uOpacity: { value: 1.0 },
        uRadius: { value: this.borderRadius },
      },
      transparent: true,
      cullFace: false,
    });
    this._progText = new gl.Program(gl, {
      vertex: VERT,
      fragment: fragTextClean,
      uniforms: {
        uMap: { value: null },
        uOpacity: { value: 1.0 },
      },
      transparent: true,
      cullFace: false,
    });

    // Load images & create meshes
    this._loadItems().then(function () {
      self._createMeshes();
      self._bindEvents();
      self._resize();
      self._loop();
    });

    var _r = this._resize.bind(this);
    window.addEventListener('resize', _r);
    this._cleanup = function () {
      window.removeEventListener('resize', _r);
      self._running = false;
      if (self._raf) cancelAnimationFrame(self._raf);
      if (self.canvas && self.canvas.parentNode)
        self.canvas.parentNode.removeChild(self.canvas);
    };
  };

  CircularGallery.prototype._loadItems = function () {
    var self = this;
    var promises = [];
    this._itemData = [];
    for (var i = 0; i < this._itemCount; i++) {
      var item = this.items[i];
      var p = loadImageTexture(this._gl, item.image).then(function (data) {
        return data;
      });
      promises.push(p);
    }
    return Promise.all(promises).then(function (results) {
      self._loadedImages = results;
    });
  };

  CircularGallery.prototype._createMeshes = function () {
    var gl = this._gl;
    var bend = this.bend;
    var radius = 2.2; // base radius for item positions

    this._meshes = [];
    this._textMeshes = [];

    for (var i = 0; i < this._itemCount; i++) {
      var imgData = this._loadedImages[i];
      if (!imgData) continue;

      var item = this.items[i];

      // ── Image mesh ──
      var prog = this._progPlane.clone();
      prog.uniforms.uMap.value = imgData.texture;
      prog.uniforms.uRadius.value = this.borderRadius;

      var mesh = new gl.Mesh(gl, { geometry: this._geoPlane, program: prog });
      mesh.position.set(0, 0, 0);
      mesh.visible = false;
      mesh._imgData = imgData;
      this.scene.addChild(mesh);
      this._meshes.push(mesh);

      // ── Text mesh ──
      var textData = createTextTexture(gl, item.text, this.font, this.textColor);
      var tProg = this._progText.clone();
      tProg.uniforms.uMap.value = textData.texture;
      var tGeo = new gl.Plane(gl, { width: textData.width / 150, height: textData.height / 150 });
      var tMesh = new gl.Mesh(gl, { geometry: tGeo, program: tProg });
      tMesh.visible = false;
      this.scene.addChild(tMesh);
      this._textMeshes.push(tMesh);
    }

    this.scene.updateMatrixWorld();
  };

  CircularGallery.prototype._bindEvents = function () {
    var self = this;
    var el = this.container;

    el.addEventListener('mousedown', function (e) {
      self._isDragging = true;
      self._lastX = e.clientX;
      self._lastY = e.clientY;
      self._velocity = 0;
      self._lastDragTime = Date.now();
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!self._isDragging) return;
      var dx = e.clientX - self._lastX;
      var now = Date.now();
      var dt = Math.max(now - self._lastDragTime, 1);
      self._velocity = dx / dt * 10;
      self._targetAngle += dx * 0.008;
      self._lastX = e.clientX;
      self._lastY = e.clientY;
      self._lastDragTime = now;
    });

    window.addEventListener('mouseup', function () {
      self._isDragging = false;
    });

    el.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        self._isDragging = true;
        self._lastX = e.touches[0].clientX;
        self._lastDragTime = Date.now();
        self._velocity = 0;
      }
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!self._isDragging || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - self._lastX;
      var now = Date.now();
      var dt = Math.max(now - self._lastDragTime, 1);
      self._velocity = dx / dt * 10;
      self._targetAngle += dx * 0.008;
      self._lastX = e.touches[0].clientX;
      self._lastDragTime = now;
    }, { passive: true });

    el.addEventListener('touchend', function () {
      self._isDragging = false;
    });

    // Scroll wheel
    el.addEventListener('wheel', function (e) {
      self._targetAngle += e.deltaY * 0.001 * self.scrollSpeed;
      e.preventDefault();
    }, { passive: false });
  };

  CircularGallery.prototype._resize = function () {
    var w = this.container.clientWidth;
    var h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.perspective({
      fov: 45,
      aspect: w / h,
      near: 0.1,
      far: 50,
    });
  };

  CircularGallery.prototype._loop = function () {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._loop.bind(this));
    this._update();
    this.renderer.render({ scene: this.scene, camera: this.camera });
  };

  CircularGallery.prototype._update = function () {
    var self = this;
    var bend = this.bend;
    var radius = 2.6;
    var n = this._itemCount;
    if (n === 0) return;

    // Inertia
    if (!this._isDragging && Math.abs(this._velocity) > 0.001) {
      this._targetAngle += this._velocity * 0.016;
      this._velocity *= 0.92;
    }

    // Lerp current → target
    this._currentAngle = lerp(this._currentAngle, this._targetAngle, this.scrollEase);

    var cW = this._gl.width / (this._gl.dpr || 1);
    var cH = this._gl.height / (this._gl.dpr || 1);

    for (var i = 0; i < n; i++) {
      var imgMesh = this._meshes[i];
      var txtMesh = this._textMeshes[i];
      if (!imgMesh || !imgMesh.visible) continue;

      var baseAngle = (i / n) * Math.PI * 2;
      var angle = baseAngle - this._currentAngle;

      // Position on circle with bend
      var x = Math.sin(angle) * radius;
      var z = Math.cos(angle) * radius - radius * 0.3;
      var y = -Math.sin(angle) * bend * 0.5;

      imgMesh.position.set(x, y, z);
      txtMesh.position.set(x, y - this.labelOffsetY * (0.5 + Math.cos(angle) * 0.5 + 0.5), z);

      // Rotation
      imgMesh.rotation.set(0, -angle, 0);
      txtMesh.rotation.set(0, -angle, 0);

      // Scale by depth + facing
      var facing = Math.cos(angle);
      var depthScale = Math.max(0.3, (z + radius * 1.3) / (radius * 1.3));
      var s = Math.max(0.35, (0.6 + facing * 0.4) * depthScale);

      // Image mesh: wider than tall
      var imgAspect = imgMesh._imgData
        ? imgMesh._imgData.width / imgMesh._imgData.height
        : 4 / 3;
      imgMesh.scale.set(s * imgAspect * 0.85, s * 0.85, 1);

      // Text mesh
      txtMesh.scale.set(s * 0.7, s * 0.7 * 0.3, 1);

      // Opacity
      var opacity = Math.pow(Math.max(0, facing * 0.5 + 0.5), 1.5);
      imgMesh.program.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity));
      txtMesh.program.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity * 0.9));

      // Visibility
      imgMesh.visible = facing > -0.6;
      txtMesh.visible = facing > -0.7 && opacity > 0.05;
    }

    // Re-sort scene (OGL handles this automatically)
    this.scene.updateMatrixWorld();
  };

  CircularGallery.prototype.stop = function () {
    if (this._cleanup) this._cleanup();
  };

  return CircularGallery;
}));
