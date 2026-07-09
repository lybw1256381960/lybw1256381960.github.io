/**
 * CircularGallery - Three.js implementation
 * No external dependencies beyond Three.js
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
        card.style.cssText = 'background: rgba(255,255,255,0.7); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 8px 32px rgba(0,180,160,0.1);';
        card.innerHTML = `
          <div style="height: 200px; overflow: hidden;">
            <img src="${item.image}" alt="${item.text}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <div style="padding: 1rem;">
            <h4 style="margin: 0; color: #2d5a5a; font-size: 1.1rem;">${item.text}</h4>
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
        bend: options.bend || 2,
        textColor: options.textColor || '#2d5a5a',
        borderRadius: options.borderRadius || 0.05,
        scrollSpeed: options.scrollSpeed || 1.5,
        scrollEase: options.scrollEase || 0.06
      };

      this.scroll = { current: 0, target: 0, velocity: 0 };
      this.isDragging = false;
      this.startX = 0;
      this.scrollStart = 0;

      this.init();
    }

    init() {
      const rect = this.container.getBoundingClientRect();

      // Scene
      this.scene = new THREE.Scene();

      // Camera
      this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
      this.camera.position.z = 10;

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
      });
      this.renderer.setSize(rect.width, rect.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.container.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab;';

      // Create cards
      this.createCards();

      // Events
      this.addEvents();

      // Start
      this.animate();
    }

    createCards() {
      const items = this.options.items.length ? this.options.items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好' },
        { image: 'assets/project-bamboo-detail.jpg', text: '竹艺数字化' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂' }
      ];

      // Duplicate for infinite scroll
      this.items = [...items, ...items];
      this.cards = [];

      const loader = new THREE.TextureLoader();

      this.items.forEach((item, index) => {
        // Card geometry
        const geometry = new THREE.PlaneGeometry(3, 2, 32, 16);

        // Load texture
        const texture = loader.load(item.image,
          () => { this.renderer.render(this.scene, this.camera); },
          undefined,
          () => {
            // On error, create colored texture
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#e0f5f3';
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = '#2d5a5a';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.text, 200, 160);
            const fallbackTexture = new THREE.CanvasTexture(canvas);
            material.map = fallbackTexture;
            material.needsUpdate = true;
          }
        );

        // Material with rounded corners simulation via alpha test
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { index, originalY: 0 };
        this.scene.add(mesh);
        this.cards.push(mesh);

        // Add text label below
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 64;
        const ctx = labelCanvas.getContext('2d');
        ctx.fillStyle = 'transparent';
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = this.options.textColor;
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, 128, 32);

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true
        });
        const labelGeometry = new THREE.PlaneGeometry(2, 0.5);
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.y = -1.4;
        mesh.add(labelMesh);
      });

      this.updateCardPositions();
    }

    updateCardPositions() {
      const spacing = 3.5;
      const totalWidth = spacing * this.cards.length;

      this.cards.forEach((card, i) => {
        let x = (i * spacing) - this.scroll.current;

        // Wrap for infinite scroll
        while (x < -totalWidth / 2) x += totalWidth;
        while (x > totalWidth / 2) x -= totalWidth;

        card.position.x = x;

        // Apply bend curve
        const bendAmount = this.options.bend * 0.1;
        const curve = Math.sin(x * 0.3) * bendAmount;
        card.position.y = -Math.abs(curve) * 0.5;
        card.rotation.z = -curve * 0.2;

        // Scale based on distance from center
        const distFromCenter = Math.abs(x);
        const scale = Math.max(0.7, 1 - distFromCenter * 0.05);
        card.scale.setScalar(scale);

        // Fade out at edges
        const opacity = Math.max(0.3, 1 - distFromCenter * 0.15);
        card.material.opacity = opacity;
      });
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
        const delta = (e.clientX - this.startX) * 0.01 * this.options.scrollSpeed;
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
        const delta = (e.touches[0].clientX - this.startX) * 0.01 * this.options.scrollSpeed;
        this.scroll.target = this.scrollStart - delta;
      }, { passive: true });

      window.addEventListener('touchend', () => {
        this.isDragging = false;
      });

      // Wheel
      canvas.addEventListener('wheel', (e) => {
        this.scroll.target += e.deltaY * 0.002;
      }, { passive: true });

      // Resize
      window.addEventListener('resize', () => {
        const rect = this.container.getBoundingClientRect();
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
      });
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      // Smooth scroll
      this.scroll.current += (this.scroll.target - this.scroll.current) * this.options.scrollEase;

      this.updateCardPositions();
      this.renderer.render(this.scene, this.camera);
    }
  }
})();
