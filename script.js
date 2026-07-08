/* ═══════════════════════════════════════════════════════════════════════
   林韦婧个人主页 — script.js v3
   GSAP ScrollTrigger + Splash Liquid + 丰富交互动效
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────── */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── 1. GSAP Init ──────────────────────────────────────────── */
  function initGSAP() {
    if (typeof gsap === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    // Smooth scroll behavior
    ScrollTrigger.normalizeScroll(true);

    // Refresh on load
    window.addEventListener('load', () => {
      ScrollTrigger.refresh();
    });
  }

  /* ── 2. Splash Screen ──────────────────────────────────────── */
  function initSplash() {
    const splash = $('#splash');
    const progress = $('#splash-progress');
    if (!splash) return;

    let splashLiquid;

    // Init splash liquid
    try {
      if (typeof SplashLiquid !== 'undefined') {
        splashLiquid = new SplashLiquid('splash-canvas');
        splashLiquid.start();
      }
    } catch (e) {
      console.warn('SplashLiquid init failed:', e);
    }

    // Timeline
    const tl = gsap.timeline({
      onComplete: () => {
        // Fade out splash
        gsap.to(splash, {
          opacity: 0,
          duration: 0.9,
          ease: 'power2.inOut',
          onComplete: () => {
            splash.style.display = 'none';
            splash.setAttribute('aria-hidden', 'true');
            if (splashLiquid) splashLiquid.stop();
            // Init main page liquid ether
            initMainLiquid();
          }
        });
      }
    });

    // Wait for progress bar to complete + a bit extra
    tl.to({}, { duration: 2.8 });

    // Mouse interaction on splash canvas
    if (splashLiquid) {
      splash.addEventListener('mousemove', (e) => {
        splashLiquid.splatEvent(e);
      });
    }

    // Animate progress bar
    if (progress) {
      gsap.fromTo(progress,
        { scaleX: 0 },
        { scaleX: 1, duration: 2.6, ease: 'power2.inOut', delay: 0.1 }
      );
    }
  }

  /* ── 3. Main Liquid Ether ──────────────────────────────────── */
  // liquid-ether.js auto-initializes via IIFE — no manual call needed.
  // Mouse splat is handled by liquid-ether.js internally.
  function initMainLiquid() {
    // Already running from liquid-ether.js IIFE
  }

  /* ── 4. Header Scroll ─────────────────────────────────────── */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;

    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 40);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Active nav link
    const navLinks = $$('.nav-links a');
    const sections = $$('section[id]');

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(a => a.classList.remove('is-active'));
          const active = $(`.nav-links a[href="#${entry.target.id}"]`);
          if (active) active.classList.add('is-active');
        }
      });
    }, { threshold: 0.3, rootMargin: '-64px 0px 0px 0px' });

    sections.forEach(s => sectionObserver.observe(s));
  }

  /* ── 5. Nav Toggle (mobile) ────────────────────────────────── */
  function initNavToggle() {
    const toggle = $('[data-nav-toggle]');
    const links  = $('[data-nav-links]');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen);
    });

    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── 6. Counter Animation ─────────────────────────────────── */
  function initCounters() {
    const counters = $$('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);

        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        const obj = { val: 0 };

        gsap.to(obj, {
          val: target,
          duration: 1.6,
          ease: 'power2.out',
          onUpdate() {
            el.textContent = Math.round(obj.val);
          },
          onComplete() {
            el.textContent = target;
          }
        });
      });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
  }

  /* ── 7. IntersectionObserver Reveals ───────────────────────── */
  function initReveal() {
    const targets = $$('.section, .timeline-card, .project-card, .experience-card, .skill-card, .award-card, .contact-card, .about-story, .focus-item');

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        entry.target.classList.add('fade-in-up');
        requestAnimationFrame(() => {
          entry.target.classList.add('is-visible');
        });
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 0.07}s`;
      io.observe(el);
    });
  }

  /* ── 8. Card Tilt 3D ──────────────────────────────────────── */
  function initTilt() {
    const cards = $$('[data-tilt]');
    if (!cards.length) return;

    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width  * 100;
        const cy = (e.clientY - rect.top)  / rect.height * 100;

        // CSS glow
        card.style.setProperty('--glow-x', `${cx}%`);
        card.style.setProperty('--glow-y', `${cy}%`);
        card.style.setProperty('--glow-opacity', '1');

        // 3D tilt
        const dx = (cx - 50) / 50;   // -1 to 1
        const dy = (cy - 50) / 50;   // -1 to 1
        gsap.to(card, {
          rotateY: dx * 6,
          rotateX: -dy * 4,
          duration: 0.5,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      });

      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--glow-opacity', '0');
        gsap.to(card, {
          rotateY: 0, rotateX: 0,
          duration: 0.7,
          ease: 'elastic.out(1, 0.5)',
          overwrite: 'auto'
        });
      });
    });
  }

  /* ── 9. Hero Parallax ─────────────────────────────────────── */
  function initHeroParallax() {
    const blobs = $$('.hero-blob');
    if (!blobs.length) return;

    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      blobs.forEach((b, i) => {
        gsap.set(b, { y: y * (0.15 + i * 0.08) });
      });
    }, { passive: true });
  }

  /* ── 9b. Hero Title 3D Mouse Parallax ─────────────────────── */
  function initHeroTitleParallax() {
    const hero = $('.hero-section');
    const copy = $('.hero-copy');
    const title = $('.hero-title');
    if (!hero || !copy) return;

    let ticking = false;

    hero.addEventListener('mousemove', (e) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width  - 0.5;  // -0.5 to 0.5
        const cy = (e.clientY - rect.top)  / rect.height - 0.5;

        // hero-copy: subtle X/Y drift
        gsap.to(copy, {
          x: cx * -18,
          y: cy * -12,
          duration: 1.2,
          ease: 'power2.out'
        });

        // hero-title: slight Z-rotation + deeper drift for depth
        if (title) {
          gsap.to(title, {
            x: cx * -10,
            y: cy * -6,
            rotateY: cx * 6,
            rotateX: -cy * 4,
            duration: 1.0,
            ease: 'power2.out'
          });
        }

        ticking = false;
      });
    });

    hero.addEventListener('mouseleave', () => {
      gsap.to(copy,  { x: 0, y: 0, duration: 1.4, ease: 'elastic.out(1, 0.5)' });
      if (title) {
        gsap.to(title, { x: 0, y: 0, rotateY: 0, rotateX: 0, duration: 1.4, ease: 'elastic.out(1, 0.5)' });
      }
    });
  }

  /* ── 10. Gallery Drag Scroll ───────────────────────────────── */
  function initGallery() {
    const container = $('#projects-gallery');
    if (!container) return;

    // Project items for the 3D circular gallery
    const galleryItems = [
      { image: 'assets/project-bamboo-overview.jpg',  text: '竹构美好' },
      { image: 'assets/project-bamboo-detail.jpg',   text: '竹构美好' },
      { image: 'assets/project-secondlife-detail.jpg', text: '第二次生命' },
      { image: 'assets/project-maigua-detail.jpg',  text: '变卦' },
      { image: 'assets/project-drone-detail.jpg',   text: '穿隧蜂' },
    ];

    // Wait for OGL to be ready
    if (typeof CircularGallery === 'undefined') {
      console.warn('CircularGallery not loaded');
      return;
    }

    const gallery = new CircularGallery({
      container: '#projects-gallery',
      items: galleryItems,
      bend: 2.5,
      textColor: '#005f6e',
      borderRadius: 0.06,
      scrollEase: 0.04,
      scrollSpeed: 1.8,
      font: 'bold 24px "Space Grotesk", sans-serif',
      labelOffsetY: 0.22,
    });

    gallery.start();

    // Store for cleanup if needed
    window._circularGallery = gallery;
  }

  /* ── 11. Tool Bar Animations ──────────────────────────────── */
  function initToolBars() {
    const fills = $$('.tool-fill');
    if (!fills.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const w = entry.target.style.getPropertyValue('--w');
        entry.target.style.setProperty('--w', '0%');
        requestAnimationFrame(() => {
          entry.target.style.transition = 'width 1.2s cubic-bezier(0.16,1,0.3,1)';
          entry.target.style.setProperty('--w', w);
        });
      });
    }, { threshold: 0.5 });

    fills.forEach(f => io.observe(f));
  }

  /* ── 12. Contact Form ─────────────────────────────────────── */
  function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = form.querySelector('#cf-name')?.value?.trim();
      const email = form.querySelector('#cf-email')?.value?.trim();
      const msg = form.querySelector('#cf-message')?.value?.trim();

      if (!name || !email || !msg) {
        shakeForm(form);
        return;
      }

      const btn = form.querySelector('button[type=submit]');
      const orig = btn.innerHTML;
      btn.innerHTML = '<span>已发送 ✦</span>';
      btn.disabled = true;
      btn.style.background = 'var(--grad-soft)';

      setTimeout(() => {
        form.reset();
        btn.innerHTML = orig;
        btn.disabled = false;
      }, 3000);
    });
  }

  function shakeForm(form) {
    gsap.to(form, {
      x: [-6, 6, -4, 4, -2, 2, 0],
      duration: 0.4,
      ease: 'none'
    });
  }

  /* ── 13. Year auto-update ──────────────────────────────────── */
  function initYear() {
    const el = $('[data-year]');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ── 14. Scroll Progress Bar ──────────────────────────────── */
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.id = 'scroll-progress';
    Object.assign(bar.style, {
      position: 'fixed',
      top: '0', left: '0',
      height: '3px',
      background: 'var(--grad-soft)',
      width: '0%',
      zIndex: '9998',
      transition: 'width 0.05s linear',
      borderRadius: '0 2px 2px 0',
    });
    document.body.appendChild(bar);

    window.addEventListener('scroll', () => {
      const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      bar.style.width = `${clamp(pct, 0, 100)}%`;
    }, { passive: true });
  }

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initGSAP();
    initHeader();
    initNavToggle();
    initCounters();
    initReveal();
    initTilt();
    initHeroParallax();
    initHeroTitleParallax();
    initGallery();
    initToolBars();
    initContactForm();
    initYear();
    initScrollProgress();

    // Splash is always initialized
    initSplash();
  });

})();
