/* ═══════════════════════════════════════════════════════════════════
   林韦婧个人主页 — GSAP 交互系统 v2
   包含: 开屏动画 | BorderGlow | CircularGallery | ScrollTrigger
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const { gsap } = window;
    const { ScrollTrigger } = window;

    // Register GSAP plugins
    if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    /* ─── 0. Splash Screen ─────────────────────────────────────── */
    (function splashScreen() {
        const splash = document.getElementById('splash-screen');
        if (!splash) return;

        // Wait for fonts to settle, then reveal page
        window.addEventListener('load', () => {
            setTimeout(() => {
                gsap.to(splash, {
                    opacity: 0,
                    duration: 0.85,
                    ease: 'power2.inOut',
                    onComplete: () => {
                        splash.style.display = 'none';
                        splash.style.pointerEvents = 'none';
                        // Kick off page entrance
                        initPageEntrance();
                    }
                });
            }, 1800); // splash visible for 1.8s
        });
    })();

    /* ─── 1. Page Entrance (GSAP) ─────────────────────────────── */
    function initPageEntrance() {
        // Hero elements stagger in
        gsap.from('.eyebrow', {
            opacity: 0, y: 20, duration: 0.7, ease: 'power3.out', delay: 0.1
        });
        gsap.from('.hero h1', {
            opacity: 0, y: 32, duration: 0.85, ease: 'power3.out', delay: 0.2
        });
        gsap.from('.hero-subtitle', {
            opacity: 0, y: 22, duration: 0.7, ease: 'power3.out', delay: 0.38
        });
        gsap.from('.hero-lead', {
            opacity: 0, y: 18, duration: 0.7, ease: 'power3.out', delay: 0.50
        });
        gsap.from('.hero-actions', {
            opacity: 0, y: 16, duration: 0.65, ease: 'power3.out', delay: 0.62
        });
        gsap.from('.hero-visual', {
            opacity: 0, x: 30, duration: 0.9, ease: 'power3.out', delay: 0.28
        });
        gsap.from('.signal-strip .signal-card', {
            opacity: 0, y: 24, duration: 0.65, stagger: 0.1, ease: 'power3.out', delay: 0.75
        });
    }

    /* ─── 2. Header State ───────────────────────────────────────── */
    (function headerState() {
        const header = document.querySelector('[data-header]');
        if (!header) return;
        const setState = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
        setState();
        window.addEventListener('scroll', setState, { passive: true });
    })();

    /* ─── 3. Mobile Nav ────────────────────────────────────────── */
    (function mobileNav() {
        const toggle  = document.querySelector('[data-nav-toggle]');
        const links   = document.querySelector('[data-nav-links]');
        const items   = Array.from(document.querySelectorAll('.nav-links a'));

        if (!toggle || !links) return;

        const close = () => {
            toggle.setAttribute('aria-expanded', 'false');
            links.classList.remove('is-open');
        };
        const open  = () => {
            toggle.setAttribute('aria-expanded', 'true');
            links.classList.add('is-open');
        };

        toggle.addEventListener('click', () =>
            toggle.getAttribute('aria-expanded') === 'true' ? close() : open()
        );
        items.forEach(l => l.addEventListener('click', close));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        document.addEventListener('click', e => {
            if (!links.contains(e.target) && !toggle.contains(e.target)) close();
        });
    })();

    /* ─── 4. GSAP ScrollTrigger Reveal ─────────────────────────── */
    (function gsapReveal() {
        if (typeof ScrollTrigger === 'undefined') return;

        // Section headings
        gsap.utils.toArray('.section-heading').forEach(heading => {
            gsap.from(heading, {
                opacity: 0, y: 36, duration: 0.8, ease: 'power3.out',
                scrollTrigger: {
                    trigger: heading,
                    start: 'top 88%',
                    once: true,
                }
            });
        });

        // Cards stagger
        const cardGroups = [
            { sel: '.about-grid .about-story', stagger: 0.12 },
            { sel: '.focus-list .focus-item', stagger: 0.08 },
            { sel: '.timeline .timeline-card', stagger: 0.12 },
            { sel: '.experience-grid .experience-card', stagger: 0.12 },
            { sel: '.skills-grid .skill-card', stagger: 0.09 },
            { sel: '.projects-grid .project-card', stagger: 0.12 },
            { sel: '.award-list .award-card', stagger: 0.07 },
            { sel: '.contact-panel', stagger: 0 },
            { sel: '.contact-form', stagger: 0 },
        ];

        cardGroups.forEach(({ sel, stagger }) => {
            gsap.from(sel, {
                opacity: 0, y: 28, duration: 0.72, stagger, ease: 'power3.out',
                scrollTrigger: {
                    trigger: sel,
                    start: 'top 90%',
                    once: true,
                }
            });
        });

        // Hero parallax on scroll
        const heroVisual = document.querySelector('.hero-visual');
        if (heroVisual) {
            gsap.to(heroVisual, {
                y: -40,
                ease: 'none',
                scrollTrigger: {
                    trigger: '.hero',
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 1.2,
                }
            });
        }

        // Section headings — subtle underline draw
        gsap.utils.toArray('.section-heading h2').forEach(h2 => {
            gsap.from(h2, {
                opacity: 0.4,
                duration: 1.2,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: h2,
                    start: 'top 85%',
                    once: true,
                }
            });
        });
    })();

    /* ─── 5. Mouse Tilt (GSAP-powered, smooth) ─────────────────── */
    (function mouseTilt() {
        const tiltEls = document.querySelectorAll('[data-tilt]');
        if (!tiltEls.length) return;

        let activeEl = null;

        document.addEventListener('mousemove', e => {
            tiltEls.forEach(el => {
                const r = el.getBoundingClientRect();
                const inBounds =
                    e.clientX >= r.left - 30 && e.clientX <= r.right + 30 &&
                    e.clientY >= r.top  - 30 && e.clientY <= r.bottom + 30;

                if (inBounds) {
                    const x = e.clientX - r.left;
                    const y = e.clientY - r.top;
                    const cx = r.width / 2;
                    const cy = r.height / 2;

                    const rotX = ((y - cy) / cy) * -4.5;
                    const rotY = ((x - cx) / cx) *  4.5;

                    gsap.to(el, {
                        rotateX: rotX, rotateY: rotY,
                        duration: 0.55, ease: 'power2.out',
                        transformPerspective: 900,
                        overwrite: 'auto'
                    });

                    // Update CSS var for glow spot
                    const mx = (x / r.width)  * 100;
                    const my = (y / r.height) * 100;
                    el.style.setProperty('--mx', mx + '%');
                    el.style.setProperty('--my', my + '%');

                    activeEl = el;
                } else if (el === activeEl) {
                    gsap.to(el, {
                        rotateX: 0, rotateY: 0,
                        duration: 0.7, ease: 'power2.out',
                        overwrite: 'auto'
                    });
                    activeEl = null;
                }
            });
        });

        document.addEventListener('mouseleave', () => {
            if (activeEl) {
                gsap.to(activeEl, {
                    rotateX: 0, rotateY: 0,
                    duration: 0.7, ease: 'power2.out'
                });
                activeEl = null;
            }
        });
    })();

    /* ─── 6. BorderGlow — Mouse-follow glow on project cards ───── */
    (function borderGlow() {
        const cards = document.querySelectorAll('.project-card');
        if (!cards.length) return;

        cards.forEach(card => {
            card.addEventListener('mousemove', e => {
                const r = card.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width)  * 100;
                const y = ((e.clientY - r.top)  / r.height) * 100;
                card.style.setProperty('--glow-x', x + '%');
                card.style.setProperty('--glow-y', y + '%');
                card.style.setProperty('--glow-opacity', '1');
            });
            card.addEventListener('mouseleave', () => {
                card.style.setProperty('--glow-opacity', '0');
            });
        });
    })();

    /* ─── 7. CircularGallery — GSAP Horizontal Scroll ──────────── */
    (function circularGallery() {
        const track = document.querySelector('.circular-track');
        if (!track) return;

        const items = Array.from(track.querySelectorAll('.circular-item'));
        if (items.length === 0) return;

        // Initialise each item with a vertical offset for the arc effect
        function layoutArc() {
            const vw = window.innerWidth;
            const count = items.length;
            const spacing = 20; // gap in px
            // Arc params
            const bendFactor = Math.min(vw / 900, 1) * 12; // arc depth in px
            const totalW = items.reduce((s, el) => {
                return s + el.offsetWidth + spacing;
            }, -spacing);

            track.style.width = totalW + 'px';

            const centerX = vw / 2;
            const startX  = (vw - totalW) / 2;

            items.forEach((el, i) => {
                const elCenterX = startX + el.offsetWidth / 2 + i * (el.offsetWidth + spacing);
                const dx = elCenterX - centerX; // distance from center
                const progress = dx / (totalW / 2 || 1); // -1 to +1
                const arcY = -bendFactor * (1 - progress * progress); // parabola
                const rotZ = progress * 4; // slight rotation toward edges

                el.style.transform = `translateY(${arcY}px) rotateZ(${rotZ}deg)`;
                el.style.transition = 'transform 0.12s ease-out';
            });
        }

        // Draggable horizontal scroll
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;

        track.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.pageX - track.offsetLeft;
            scrollLeft = track.parentElement.scrollLeft || 0;
            track.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - track.offsetLeft;
            const walk = (x - startX) * 1.5;
            track.parentElement.scrollLeft = scrollLeft - walk;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            track.style.cursor = 'grab';
        });

        // Touch support
        track.addEventListener('touchstart', e => {
            startX = e.touches[0].pageX - track.offsetLeft;
            scrollLeft = track.parentElement.scrollLeft || 0;
        }, { passive: true });

        track.addEventListener('touchmove', e => {
            const x = e.touches[0].pageX - track.offsetLeft;
            const walk = (x - startX) * 1.5;
            track.parentElement.scrollLeft = scrollLeft - walk;
        }, { passive: true });

        // Scroll-driven: when user scrolls page, gallery items react
        // Using IntersectionObserver to activate/deactivate items
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = entry.target.dataset.arcTransform || '';
                } else {
                    entry.target.style.opacity = '0.6';
                }
            });
        }, { threshold: 0.2 });

        items.forEach((el, i) => {
            // Save computed arc transform
            layoutArc();
            el.dataset.arcTransform = el.style.transform;
            el.style.transition = 'opacity 0.4s ease, transform 0.12s ease';
            io.observe(el);
        });

        // Re-layout on resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(layoutArc, 120);
        });

        // Auto-rotate on idle (subtle)
        let autoRotateId = null;
        let autoRotatePaused = false;

        function startAutoRotate() {
            if (autoRotateId) return;
            const parent = track.parentElement;
            const maxScroll = parent.scrollWidth - parent.clientWidth;
            if (maxScroll <= 0) return;

            let direction = 1;
            autoRotateId = setInterval(() => {
                if (autoRotatePaused || isDragging) return;
                parent.scrollLeft += direction * 0.6;
                if (parent.scrollLeft >= maxScroll) direction = -1;
                if (parent.scrollLeft <= 0) direction = 1;
            }, 16);
        }

        track.addEventListener('mouseenter', () => { autoRotatePaused = true; });
        track.addEventListener('mouseleave', () => { autoRotatePaused = false; });

        // Kick off auto-rotate after 5s idle
        setTimeout(startAutoRotate, 5000);
    })();

    /* ─── 8. Smooth Anchor Scroll ──────────────────────────────── */
    (function smoothAnchors() {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const t = document.querySelector(a.getAttribute('href'));
                if (t) {
                    e.preventDefault();
                    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    })();

    /* ─── 9. Active Nav — IntersectionObserver ─────────────────── */
    (function activeNav() {
        const sections = Array.from(document.querySelectorAll('section[id]'));
        const navItems  = Array.from(document.querySelectorAll('.nav-links a'));
        if (!sections.length || !navItems.length) return;

        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                navItems.forEach(l => {
                    l.classList.toggle('is-active',
                        l.getAttribute('href') === `#${entry.target.id}`
                    );
                });
            });
        }, { threshold: 0.25, rootMargin: '-18% 0px -50% 0px' });

        sections.forEach(s => io.observe(s));
    })();

    /* ─── 10. Contact Form ──────────────────────────────────────── */
    (function contactForm() {
        const form = document.getElementById('contact-form');
        if (!form) return;
        form.addEventListener('submit', e => {
            e.preventDefault();
            const fd  = new FormData(form);
            const s   = encodeURIComponent(`来自林韦婧个人主页的交流邀请：${fd.get('name').trim()}`);
            const b   = encodeURIComponent(
                `姓名：${fd.get('name').trim()}\n邮箱：${fd.get('email').trim()}\n\n${fd.get('message').trim()}`
            );
            window.location.href = `mailto:1256381960@qq.com?subject=${s}&body=${b}`;
        });
    })();

    /* ─── 11. Year ──────────────────────────────────────────────── */
    (function setYear() {
        const el = document.querySelector('[data-year]');
        if (el) el.textContent = new Date().getFullYear();
    })();

})();
