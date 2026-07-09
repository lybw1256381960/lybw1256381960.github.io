/**
 * CircularGallery - Three.js implementation
 * Clean, focused layout with proper alignment
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
      container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; padding: 2rem;';

      const displayItems = items && items.length ? items : [
        { image: 'assets/project-bamboo-overview.jpg', text: '竹构美好' },
        { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
        { image: 'assets/project-maigua-detail.jpg', text: '变卦' },
        { image: 'assets/project-drone-detail.jpg', text: '穿隧蜂' }
      ];

      displayItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'project-fallback-card';
        card.style.cssText = 'background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 12px 40px rgba(0,180,160,0.12); transition: transform 0.3s ease;';
        card.innerHTML = `
          <div style="height: 240px; overflow: hidden;">
            <img src="${item.image}" alt="${item.text}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <div style="padding: 1.5rem;">
            <h4 style="margin: 0; color: #2d5a5a; font-size: 1.25rem; font-weight: 600;">${item.text}</h4>
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
        textColor: options.textColor || '#2d5a5a',
        scrollSpeed: options.scrollSpeed || 1,
        scrollEase: options.scrollEase || 0.06
      };

      this.scroll = { current: 0, target: 0 };
      this.isDragging = false;
      this.startX = 0;
      this.scrollStart = 0;
      
      // Fixed layout parameters
      this.cardWidth = 4.2;
      this.cardHeight = 3;
      this.cardGap = 0.6; // Small gap between cards
      
      this.init();
    }

    init() {
      const rect = this.container.getBoundingClientRect();

      // Scene
      this.scene = new THREE.Scene();

      // Camera - moderate FOV for natural perspective
      this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
      this.camera.position.z = 10;
      this.camera.position.y = 0.3;

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

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      this.scene.add(ambientLight);

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

      this.items = items;
      this.cards = [];
      
      // Calculate total width for centering
      this.totalWidth = (this.cardWidth + this.cardGap) * this.items.length - this.cardGap;

      const loader = new THREE.TextureLoader();

      this.items.forEach((item, index) => {
        const cardGroup = new THREE.Group();

        // Card mesh
        const geometry = new THREE.PlaneGeometry(this.cardWidth, this.cardHeight);
        const texture = loader.load(item.image,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
          },
          undefined,
          () => this.createFallbackTexture(item, material)
        );

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { index, item };
        cardGroup.add(mesh);

        // Subtle shadow/depth layer
        const shadowGeo = new THREE.PlaneGeometry(this.cardWidth + 0.08, this.cardHeight + 0.08);
        const shadowMat = new THREE.MeshBasicMaterial({
          color: 0x00b4a0,
          transparent: true,
          opacity: 0.08
        });
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.position.z = -0.02;
        cardGroup.add(shadowMesh);

        // Text label - positioned directly below card
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 100;
        const ctx = labelCanvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 100);

        // Main title
        ctx.fillStyle = this.options.textColor;
        ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, 256, 35);

        // Subtitle
        if (item.subtitle) {
          ctx.fillStyle = '#5a8a8a';
          ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(item.subtitle, 256, 70);
        }

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.minFilter = THREE.LinearFilter;
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true
        });
        const labelGeometry = new THREE.PlaneGeometry(2.5, 0.5);
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.y = -this.cardHeight / 2 - 0.5;
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

      const gradient = ctx.createLinearGradient(0, 0, 600, 400);
      gradient.addColorStop(0, '#e8f6f5');
      gradient.addColorStop(1, '#d0f0ec');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 600, 400);

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
      
      this.cards.forEach((card, i) => {
        // Calculate base position
        let x = (i * (this.cardWidth + this.cardGap)) - this.scroll.current;
        
        // Center the entire row
        x -= this.totalWidth / 2;
        x += this.cardWidth / 2;

        // Wrap around for infinite scroll
        const itemSpacing = this.cardWidth + this.cardGap;
        const halfTotal = this.totalWidth / 2 + itemSpacing;
        while (x < -halfTotal) x += this.totalWidth + itemSpacing;
        while (x > halfTotal) x -= this.totalWidth + itemSpacing;

        // Position
        card.position.x = x;
        
        // Subtle curve - cards at edges tilt slightly inward
        const normalizedX = x / (viewportWidth / 3);
        const absNormX = Math.abs(normalizedX);
        
        // Very subtle Y curve (cards dip slightly at edges)
        card.position.y = -absNormX * absNormX * 0.15;
        
        // Subtle rotation toward center
        card.rotation.y = -normalizedX * 0.12;
        
        // Scale: center cards full size, edge cards slightly smaller
        const scale = 1 - absNormX * 0.1;
        card.scale.setScalar(Math.max(0.85, scale));
        
        // Opacity fade at far edges
        const opacity = Math.max(0.5, 1 - absNormX * 0.4);
        card.children[0].material.opacity = opacity;
        
        // Z-order: center in front
        card.position.z = (1 - absNormX) * 1.5;
      });
    }

    getViewportWidth() {
      const fov = this.camera.fov * (Math.PI / 180);
      return 2 * Math.tan(fov / 2) * this.camera.position.z;
    }

    addEvents() {
      const canvas = this.renderer.domElement;

      // Mouse
      canvas.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startX = e.clientX;
        this.scrollStart = this.scroll.target;
        canvas.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const delta = (e.clientX - this.startX) * 0.005 * this.options.scrollSpeed;
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
        const delta = (e.touches[0].clientX - this.startX) * 0.005 * this.options.scrollSpeed;
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
      const diff = this.scroll.target - this.scroll.current;
      this.scroll.current += diff * this.options.scrollEase;

      this.updateCardPositions();
      this.renderer.render(this.scene, this.camera);
    }
  }
})();
// v2 1783587799
