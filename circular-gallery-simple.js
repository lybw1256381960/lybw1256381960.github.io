/**
 * CircularGallery - Simplified version using raw OGL
 */
(function() {
  'use strict';

  // Wait for OGL to be available
  function getOGL() {
    return window.OGL || (window.ogl && window.ogl.Renderer ? window.ogl : null);
  }

  // Simple CircularGallery implementation
  window.CircularGallery = {
    init: function(container, options = {}) {
      const OGL = getOGL();
      if (!OGL) {
        console.error('CircularGallery: OGL not loaded');
        this.fallbackToGrid(container, options.items);
        return null;
      }

      try {
        return new GalleryApp(container, options, OGL);
      } catch (e) {
        console.error('CircularGallery init failed:', e);
        this.fallbackToGrid(container, options.items);
        return null;
      }
    },

    fallbackToGrid: function(container, items) {
      // Fallback: show simple image grid
      container.innerHTML = '';
      container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; padding: 1rem;';

      const displayItems = items && items.length ? items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂' }
      ];

      displayItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'project-fallback-card';
        card.style.cssText = 'background: rgba(255,255,255,0.7); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 8px 32px rgba(0,180,160,0.1); transition: transform 0.3s ease;';
        card.innerHTML = `
          <div style="height: 200px; overflow: hidden;">
            <img src="${item.image}" alt="${item.text}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          </div>
          <div style="padding: 1rem;">
            <h4 style="margin: 0; color: #2d5a5a; font-size: 1.1rem;">${item.text}</h4>
          </div>
        `;
        container.appendChild(card);
      });
    }
  };

  // Full GalleryApp class
  class GalleryApp {
    constructor(container, options, OGL) {
      this.container = container;
      this.OGL = OGL;
      this.options = {
        items: options.items || [],
        bend: options.bend || 2,
        textColor: options.textColor || '#2d5a5a',
        borderRadius: options.borderRadius || 0.05,
        scrollSpeed: options.scrollSpeed || 1.5,
        scrollEase: options.scrollEase || 0.06,
        font: options.font || 'bold 24px sans-serif'
      };

      this.scroll = { current: 0, target: 0, ease: this.options.scrollEase };
      this.isDown = false;
      this.startX = 0;
      this.scrollStart = 0;

      this.init();
    }

    init() {
      // Create renderer
      this.renderer = new this.OGL.Renderer({
        alpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
      });

      this.gl = this.renderer.gl;
      this.gl.clearColor(0, 0, 0, 0);
      this.container.appendChild(this.gl.canvas);
      this.gl.canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';

      // Create camera
      this.camera = new this.OGL.Camera(this.gl);
      this.camera.fov = 45;
      this.camera.position.z = 20;

      // Create scene
      this.scene = new this.OGL.Transform();

      // Handle resize
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // Create geometry
      this.geometry = new this.OGL.Plane(this.gl, {
        widthSegments: 50,
        heightSegments: 25
      });

      // Create media items
      this.createMedias();

      // Add events
      this.addEvents();

      // Start loop
      this.update();
    }

    resize() {
      const rect = this.container.getBoundingClientRect();
      this.renderer.setSize(rect.width, rect.height);
      this.camera.perspective({ aspect: rect.width / rect.height });

      const fov = this.camera.fov * (Math.PI / 180);
      const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
      const width = height * (rect.width / rect.height);

      this.viewport = { width, height };
      this.screen = { width: rect.width, height: rect.height };

      if (this.medias) {
        this.medias.forEach(media => media.resize(this.viewport, this.screen));
      }
    }

    createMedias() {
      const items = this.options.items.length ? this.options.items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好' },
        { image: 'assets/project-bamboo-detail.jpg', text: '竹艺数字化' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂' }
      ];

      // Duplicate for infinite scroll
      const galleryItems = [...items, ...items];

      this.medias = galleryItems.map((item, index) => {
        return new GalleryMedia({
          gl: this.gl,
          scene: this.scene,
          geometry: this.geometry,
          image: item.image,
          text: item.text,
          index,
          total: galleryItems.length,
          viewport: this.viewport,
          screen: this.screen,
          bend: this.options.bend,
          textColor: this.options.textColor,
          borderRadius: this.options.borderRadius,
          font: this.options.font
        });
      });
    }

    addEvents() {
      // Mouse/Touch events
      this.container.addEventListener('mousedown', (e) => this.onDown(e));
      this.container.addEventListener('mousemove', (e) => this.onMove(e));
      window.addEventListener('mouseup', () => this.onUp());

      this.container.addEventListener('touchstart', (e) => this.onDown(e), { passive: true });
      this.container.addEventListener('touchmove', (e) => this.onMove(e), { passive: true });
      window.addEventListener('touchend', () => this.onUp());

      // Wheel
      this.container.addEventListener('wheel', (e) => {
        this.scroll.target += e.deltaY * 0.01;
      }, { passive: true });
    }

    onDown(e) {
      this.isDown = true;
      this.startX = e.touches ? e.touches[0].clientX : e.clientX;
      this.scrollStart = this.scroll.target;
    }

    onMove(e) {
      if (!this.isDown) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const delta = (this.startX - x) * 0.01 * this.options.scrollSpeed;
      this.scroll.target = this.scrollStart + delta;
    }

    onUp() {
      this.isDown = false;
    }

    update() {
      // Smooth scroll
      this.scroll.current += (this.scroll.target - this.scroll.current) * this.scroll.ease;

      // Update medias
      if (this.medias) {
        this.medias.forEach(media => {
          media.update(this.scroll.current, this.viewport);
        });
      }

      // Render
      this.renderer.render({ scene: this.scene, camera: this.camera });

      requestAnimationFrame(() => this.update());
    }
  }

  class GalleryMedia {
    constructor({ gl, scene, geometry, image, text, index, total, viewport, screen, bend, textColor, borderRadius, font }) {
      this.gl = gl;
      this.scene = scene;
      this.geometry = geometry;
      this.image = image;
      this.text = text;
      this.index = index;
      this.total = total;
      this.viewport = viewport;
      this.screen = screen;
      this.bend = bend;
      this.textColor = textColor;
      this.borderRadius = borderRadius;
      this.font = font;

      this.createMesh();
      this.createTitle();
      this.resize(viewport, screen);
    }

    createMesh() {
      const texture = new this.OGL.Texture(this.gl, { generateMipmaps: false });

      this.program = new this.OGL.Program(this.gl, {
        vertex: `
          precision highp float;
          attribute vec3 position;
          attribute vec2 uv;
          uniform mat4 modelViewMatrix;
          uniform mat4 projectionMatrix;
          uniform float uBend;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            float dist = abs(p.x) / 5.0;
            p.z += sin(dist * 3.14159) * uBend * 0.3;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragment: `
          precision highp float;
          uniform sampler2D tMap;
          uniform vec2 uImageSizes;
          uniform vec2 uPlaneSizes;
          uniform float uBorderRadius;
          varying vec2 vUv;

          float roundedBox(vec2 p, vec2 b, float r) {
            vec2 d = abs(p) - b + r;
            return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
          }

          void main() {
            vec2 ratio = vec2(
              min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
              min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
            );
            vec2 uv = vec2(
              vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
              vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
            );
            vec4 color = texture2D(tMap, uv);

            float d = roundedBox(vUv - 0.5, vec2(0.5), uBorderRadius);
            float alpha = 1.0 - smoothstep(0.0, 0.01, d);

            gl_FragColor = vec4(color.rgb, color.a * alpha);
          }
        `,
        uniforms: {
          tMap: { value: texture },
          uImageSizes: { value: [1, 1] },
          uPlaneSizes: { value: [1, 1] },
          uBend: { value: this.bend },
          uBorderRadius: { value: this.borderRadius }
        },
        transparent: true
      });

      this.mesh = new this.OGL.Mesh(this.gl, {
        geometry: this.geometry,
        program: this.program
      });
      this.mesh.setParent(this.scene);

      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        texture.image = img;
        this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
      };
      img.onerror = () => {
        console.warn('Failed to load image:', this.image);
        // Use a colored placeholder
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e0f5f3';
        ctx.fillRect(0, 0, 400, 300);
        ctx.fillStyle = '#2d5a5a';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, 200, 160);
        texture.image = canvas;
        this.program.uniforms.uImageSizes.value = [400, 300];
      };
      img.src = this.image;
    }

    createTitle() {
      // Create text texture
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = this.textColor;
      ctx.font = this.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.text, 256, 64);

      const texture = new this.OGL.Texture(this.gl, { generateMipmaps: false });
      texture.image = canvas;

      const program = new this.OGL.Program(this.gl, {
        vertex: `
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
        `,
        fragment: `
          precision highp float;
          uniform sampler2D tMap;
          varying vec2 vUv;
          void main() {
            vec4 color = texture2D(tMap, vUv);
            if (color.a < 0.1) discard;
            gl_FragColor = color;
          }
        `,
        uniforms: { tMap: { value: texture } },
        transparent: true
      });

      this.titleMesh = new this.OGL.Mesh(this.gl, {
        geometry: new this.OGL.Plane(this.gl),
        program
      });
      this.titleMesh.setParent(this.mesh);
    }

    resize(viewport, screen) {
      this.viewport = viewport;
      this.screen = screen;

      const scale = screen.height / 1500;
      const height = (viewport.height * (900 * scale)) / screen.height;
      const width = (viewport.width * (700 * scale)) / screen.width;

      this.mesh.scale.set(width, height, 1);
      this.program.uniforms.uPlaneSizes.value = [width, height];

      this.width = width + 2;
      this.x = this.width * this.index;

      // Position title below image
      this.titleMesh.scale.set(width * 0.8, width * 0.2, 1);
      this.titleMesh.position.y = -height * 0.5 - width * 0.15;
    }

    update(scroll, viewport) {
      const x = this.x - scroll;

      // Wrap around for infinite scroll
      const totalWidth = this.width * this.total;
      let wrappedX = ((x % totalWidth) + totalWidth) % totalWidth;
      if (wrappedX > totalWidth / 2) wrappedX -= totalWidth;

      this.mesh.position.x = wrappedX;

      // Apply bend
      const H = viewport.width / 2;
      const R = (H * H + this.bend * this.bend) / (2 * Math.abs(this.bend));
      const arc = R - Math.sqrt(R * R - Math.min(wrappedX * wrappedX, H * H));
      this.mesh.position.y = this.bend > 0 ? -arc : arc;
      this.mesh.rotation.z = -Math.sign(wrappedX) * Math.asin(Math.min(Math.abs(wrappedX), H) / R);
    }
  }

  // Expose OGL reference for the classes
  Object.defineProperty(window, 'OGL', {
    get: getOGL,
    configurable: true
  });
})();
