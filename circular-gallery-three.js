/**
 * CircularGallery - Three.js implementation
 * Large, impactful cards with smooth curved layout
 */
(function() {
  'use strict';

  window.CircularGallery = {
    init: function(container, options) {
      if (!window.THREE) {
        console.error('CircularGallery: THREE not loaded');
        this.fallbackToGrid(container, options.items);
        return null;
      }

      try {
        return new GalleryApp(container, options);
      } catch (e) {
        console.error('CircularGallery init failed:', e);
        this.fallbackToGrid(container, options.items);
        return null;
      }
    },

    fallbackToGrid: function(container, items) {
      container.innerHTML = '';
      container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 2rem;';

      const displayItems = items && items.length ? items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂' }
      ];

      displayItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'project-fallback-card';
        card.style.cssText = 'background: rgba(255,255,255,0.8); backdrop-filter: blur(20px); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 12px 40px rgba(0,180,160,0.15); transition: transform 0.3s ease;';
        card.innerHTML = `
          <div style="height: 220px; overflow: hidden;">
            <img src="${item.image}" alt="${item.text}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <div style="padding: 1.25rem;">
            <h4 style="margin: 0; color: #2d5a5a; font-size: 1.2rem; font-weight: 600;">${item.text}</h4>
          </div>
        `;
        container.appendChild(card);
      });
    }
  };

  class GalleryApp {
    constructor(container, options) {
      this.container = container;
      this.options = {
        items: options.items || [],
        bend: options.bend || 1.5,
        textColor: options.textColor || '#2d5a5a',
        borderRadius: options.borderRadius || 0.08,
        scrollSpeed: options.scrollSpeed || 1.2,
        scrollEase: options.scrollEase || 0.05
      };

      this.scroll = { current: 0, target: 0, velocity: 0 };
      this.isDragging = false;
      this.startX = 0;
      this.scrollStart = 0;
      this.cardWidth = 5;  // Larger cards
      this.cardHeight = 3.5;
      this.cardSpacing = 6; // More breathing room

      this.init();
    }

    init() {
      const rect = this.container.getBoundingClientRect();

      // Scene
      this.scene = new THREE.Scene();

      // Camera - wider FOV for more dramatic perspective
      this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 100);
      this.camera.position.z = 12;
      this.camera.position.y = 0.5;

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(rect.width, rect.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.container.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab;';

      // Lighting for depth
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      this.scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 10);
      this.scene.add(directionalLight);

      // Create cards
      this.createCards();

      // Events
      this.addEvents();

      // Start
      this.animate();
    }

    createCards() {
      const items = this.options.items.length ? this.options.items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好', subtitle: '非遗数字化服务' },
        { image: 'assets/project-bamboo-detail.jpg', text: '竹艺数字化', subtitle: 'AI编辑器' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命', subtitle: '可持续包装' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦', subtitle: 'NFC教育棋' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂', subtitle: '智能植保' }
      ];

      // Only use original items, no duplication for cleaner look
      this.items = items;
      this.cards = [];
      this.totalWidth = this.cardSpacing * this.items.length;

      const loader = new THREE.TextureLoader();

      this.items.forEach((item, index) => {
        // Card group
        const cardGroup = new THREE.Group();

        // Card geometry with rounded corners feel via segments
        const geometry = new THREE.PlaneGeometry(this.cardWidth, this.cardHeight, 1, 1);

        // Load texture
        const texture = loader.load(item.image,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            this.renderer.render(this.scene, this.camera);
          },
          undefined,
          () => this.createFallbackTexture(item, material)
        );

        // Material
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { index, item };
        cardGroup.add(mesh);

        // Add subtle border/glow effect
        const borderGeo = new THREE.PlaneGeometry(this.cardWidth + 0.1, this.cardHeight + 0.1);
        const borderMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.3
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.position.z = -0.01;
        cardGroup.add(borderMesh);

        // Text label
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 128;
        const ctx = labelCanvas.getContext('2d');

        // Clear
        ctx.clearRect(0, 0, 512, 128);

        // Main title
        ctx.fillStyle = this.options.textColor;
        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, 256, 45);

        // Subtitle
        if (item.subtitle) {
          ctx.fillStyle = '#5a8a8a';
          ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(item.subtitle, 256, 85);
        }

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.minFilter = THREE.LinearFilter;
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true
        });
        const labelGeometry = new THREE.PlaneGeometry(3, 0.75);
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.y = -this.cardHeight / 2 - 0.6;
        cardGroup.add(labelMesh);

        this.scene.add(cardGroup);
        this.cards.push(cardGroup);
      });

      this.updateCardPositions();
    }

    createFallbackTexture(item, material) {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      // Gradient background
      const gradient = ctx.createLinearGradient(0, 0, 600, 400);
      gradient.addColorStop(0, '#e8f6f5');
      gradient.addColorStop(1, '#d0f0ec');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 600, 400);

      // Text
      ctx.fillStyle = '#2d5a5a';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, 300, 200);

      const fallbackTexture = new THREE.CanvasTexture(canvas);
      material.map = fallbackTexture;
      material.needsUpdate = true;
    }

    updateCardPositions() {
      const viewportWidth = this.getViewportWidth();
      const centerOffset = viewportWidth / 2;

      this.cards.forEach((card, i) => {
        // Calculate position with wrap-around for infinite scroll
        let x = (i * this.cardSpacing) - this.scroll.current;

        // Normalize to center viewport
        const halfTotal = this.totalWidth / 2;
        while (x < -halfTotal - this.cardSpacing) x += this.totalWidth;
        while (x > halfTotal + this.cardSpacing) x -= this.totalWidth;

        // Position
        card.position.x = x;

        // Apply smooth curve (bend effect)
        const bendStrength = this.options.bend * 0.15;
        const normalizedX = x / (viewportWidth / 2); // -1 to 1 range
        const curveY = Math.pow(Math.abs(normalizedX), 2) * bendStrength;

        card.position.y = -curveY;

        // Rotation for 3D effect
        const maxRotation = 0.25;
        card.rotation.y = -normalizedX * maxRotation;
        card.rotation.x = curveY * 0.1;

        // Scale based on distance from center (center card is largest)
        const distFromCenter = Math.abs(normalizedX);
        const scale = 1 - distFromCenter * 0.15;
        card.scale.setScalar(Math.max(0.7, scale));

        // Opacity fade at edges
        const opacity = Math.max(0.4, 1 - distFromCenter * 0.6);
        card.children[0].material.opacity = opacity;

        // Z-order: center cards in front
        card.position.z = (1 - distFromCenter) * 2;
      });
    }

    getViewportWidth() {
      const fov = this.camera.fov * (Math.PI / 180);
      return 2 * Math.tan(fov / 2) * this.camera.position.z;
    }

    addEvents() {
      const canvas = this.renderer.domElement;

      // Mouse/Touch
      canvas.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startX = e.clientX;
        this.scrollStart = this.scroll.target;
        canvas.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const delta = (e.clientX - this.startX) * 0.008 * this.options.scrollSpeed;
        this.scroll.target = this.scrollStart - delta;
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
        canvas.style.cursor = 'grab';
      });

      // Touch
      canvas.addEventListener('touchstart', (e) => {
        this.isDragging = true;
        this.startX = e.touches[0].clientX;
        this.scrollStart = this.scroll.target;
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        const delta = (e.touches[0].clientX - this.startX) * 0.008 * this.options.scrollSpeed;
        this.scroll.target = this.scrollStart - delta;
      }, { passive: true });

      window.addEventListener('touchend', () => {
        this.isDragging = false;
      });

      // Wheel
      canvas.addEventListener('wheel', (e) => {
        this.scroll.target += e.deltaY * 0.003;
      }, { passive: true });

      // Resize
      window.addEventListener('resize', () => {
        const rect = this.container.getBoundingClientRect();
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
      });

      // Auto-scroll hint animation
      this.showScrollHint();
    }

    showScrollHint() {
      // Subtle auto-scroll on first view
      setTimeout(() => {
        if (!this.isDragging) {
          const hintScroll = this.scroll.target + 2;
          const start = this.scroll.target;
          const startTime = Date.now();
          const duration = 800;

          const animateHint = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            this.scroll.target = start + (hintScroll - start) * ease;

            if (progress < 1 && !this.isDragging) {
              requestAnimationFrame(animateHint);
            }
          };
          animateHint();
        }
      }, 1500);
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      // Smooth scroll with velocity
      const diff = this.scroll.target - this.scroll.current;
      this.scroll.velocity = diff * this.options.scrollEase;
      this.scroll.current += this.scroll.velocity;

      this.updateCardPositions();
      this.renderer.render(this.scene, this.camera);
    }
  }
})();
// Force update Thu Jul  9 16:59:08 CST 2026
