/**
 * ScrollHorizontalGallery - 滚动驱动的水平卡片画廊
 * 用户向下滚动页面时，卡片水平移动
 */
(function() {
  'use strict';

  window.ScrollHorizontalGallery = {
    init: function(container, options) {
      if (!window.THREE) {
        console.error('ScrollHorizontalGallery: THREE not loaded');
        return null;
      }
      try {
        return new ScrollGallery(container, options);
      } catch (e) {
        console.error('ScrollHorizontalGallery init failed:', e);
        return null;
      }
    }
  };

  class ScrollGallery {
    constructor(container, options) {
      this.container = container;
      this.options = {
        items: options.items || [],
        textColor: options.textColor || '#2d5a5a',
        scrollMultiplier: options.scrollMultiplier || 1.5
      };

      this.scrollProgress = 0; // 0 到 1，由页面滚动驱动
      this.targetProgress = 0;
      this.isInView = false;
      
      // Fixed card layout
      this.cardWidth = 3.8;
      this.cardHeight = 2.6;
      this.cardGap = 0.5;
      
      this.init();
    }

    init() {
      const rect = this.container.getBoundingClientRect();

      // Scene
      this.scene = new THREE.Scene();
      this.scene.background = null;

      // Camera
      this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
      this.camera.position.z = 10;
      this.camera.position.y = 0.2;

      // Renderer - transparent
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(rect.width, rect.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x000000, 0);
      
      this.container.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
      this.scene.add(ambientLight);

      this.createCards();
      this.addEvents();
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
      this.cardSpacing = this.cardWidth + this.cardGap;
      this.totalScrollRange = this.cardSpacing * (this.items.length - 1);

      const loader = new THREE.TextureLoader();

      items.forEach((item, index) => {
        const cardGroup = new THREE.Group();

        // Card image
        const geometry = new THREE.PlaneGeometry(this.cardWidth, this.cardHeight);
        const material = new THREE.MeshBasicMaterial({
          map: null,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0
        });

        const texture = loader.load(item.image,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            material.map = tex;
            material.opacity = 1;
            material.needsUpdate = true;
          },
          undefined,
          () => this.createFallbackTexture(item, material)
        );

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { index, item };
        cardGroup.add(mesh);

        // Subtle border/glow
        const borderGeo = new THREE.PlaneGeometry(this.cardWidth + 0.05, this.cardHeight + 0.05);
        const borderMat = new THREE.MeshBasicMaterial({
          color: 0x00b4a0,
          transparent: true,
          opacity: 0.15
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.position.z = -0.01;
        cardGroup.add(borderMesh);

        // Text label below card
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 110;
        const ctx = labelCanvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 110);

        // Title
        ctx.fillStyle = this.options.textColor;
        ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, 256, 35);

        // Subtitle
        if (item.subtitle) {
          ctx.fillStyle = '#5a8a8a';
          ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(item.subtitle, 256, 75);
        }

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.minFilter = THREE.LinearFilter;
        const labelMaterial = new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true,
          opacity: 0
        });
        const labelGeometry = new THREE.PlaneGeometry(2.4, 0.55);
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.y = -this.cardHeight / 2 - 0.5;
        labelMesh.userData.isLabel = true;
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
      gradient.addColorStop(0.5, '#c5e8e0');
      gradient.addColorStop(1, '#a8d8c8');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 600, 400);

      ctx.fillStyle = '#2d5a5a';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, 300, 200);

      const fallbackTexture = new THREE.CanvasTexture(canvas);
      material.map = fallbackTexture;
      material.opacity = 1;
      material.needsUpdate = true;
    }

    updateCardPositions() {
      // scrollProgress 0 到 1
      // At 0: first card centered
      // At 1: last card centered
      const offsetX = this.scrollProgress * this.totalScrollRange;

      this.cards.forEach((card, i) => {
        // Target position: first card at 0, each next shifted by spacing
        // We move all cards by -offsetX to simulate horizontal scroll
        const baseX = i * this.cardSpacing;
        const x = baseX - offsetX;
        
        // Center the row
        const totalWidth = (this.items.length - 1) * this.cardSpacing;
        const finalX = x - totalWidth / 2;
        
        card.position.x = finalX;
        card.position.y = 0;
        card.position.z = 0;
        card.rotation.y = 0;

        // Show/hide cards based on whether they're in the visible range
        const distFromCenter = Math.abs(finalX);
        const maxVisibleDist = 5.5; // Hide cards too far off-screen
        
        const opacity = Math.max(0, 1 - distFromCenter / maxVisibleDist);
        
        if (card.children[0].material) {
          card.children[0].material.opacity = opacity;
        }
        if (card.children[1] && card.children[1].material) {
          card.children[1].material.opacity = opacity * 0.15;
        }
        // Label (last child)
        const labelMesh = card.children[2];
        if (labelMesh && labelMesh.material) {
          labelMesh.material.opacity = opacity;
        }
      });
    }

    addEvents() {
      // Track scroll position relative to container
      this.updateScrollProgress = () => {
        const rect = this.container.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        
        // Container starts at top: 0 (when fully out of view at top)
        // When container is centered in viewport, scrollProgress = 0.5
        // We want to map the container's vertical scroll position to 0-1
        
        // Container height in scroll: how much we need to scroll to fully reveal it
        // Trigger: start scrolling when container enters viewport, finish when it leaves
        
        // Calculate: how far the container has scrolled past the start of viewport
        // 0 = container top at viewport top
        // windowHeight = container bottom at viewport bottom
        const scrollDistance = -rect.top; // positive when scrolled past
        const triggerDistance = rect.height + windowHeight; // total scroll range
        
        let progress = scrollDistance / (rect.height * 0.5);
        progress = Math.max(0, Math.min(1, progress));
        
        this.targetProgress = progress;
        this.isInView = rect.top < windowHeight && rect.bottom > 0;
      };

      window.addEventListener('scroll', this.updateScrollProgress, { passive: true });
      window.addEventListener('resize', () => {
        const rect = this.container.getBoundingClientRect();
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
      });

      // Initial calculation
      this.updateScrollProgress();
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      // Smooth interpolation
      const diff = this.targetProgress - this.scrollProgress;
      this.scrollProgress += diff * 0.08;

      this.updateCardPositions();
      this.renderer.render(this.scene, this.camera);
    }
  }
})();
