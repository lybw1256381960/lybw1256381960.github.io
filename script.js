/* ================================================================
   林韦婧个人主页 — 流体3D玻璃质感交互系统 v2
   优化：tilt缓动、视差平滑、交错reveal、粒子性能
   ================================================================ */

(function () {
    "use strict";

    /* ===== 1. Header ===== */
    const header = document.querySelector("[data-header]");
    const navToggle = document.querySelector("[data-nav-toggle]");
    const navLinks = document.querySelector("[data-nav-links]");
    const navItems = Array.from(document.querySelectorAll(".nav-links a"));
    const sections = navItems.map((l) => document.querySelector(l.getAttribute("href"))).filter(Boolean);

    const setHeaderState = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    setHeaderState();
    window.addEventListener("scroll", setHeaderState, { passive: true });

    /* ===== 2. Mobile Nav ===== */
    const closeNav = () => {
        navToggle.setAttribute("aria-expanded", "false");
        navLinks.classList.remove("is-open");
    };
    navToggle.addEventListener("click", () => {
        navToggle.getAttribute("aria-expanded") === "true" ? closeNav() : (() => {
            navToggle.setAttribute("aria-expanded", "true");
            navLinks.classList.add("is-open");
        })();
    });
    navItems.forEach((l) => l.addEventListener("click", closeNav));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
    document.addEventListener("click", (e) => {
        if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) closeNav();
    });

    /* ===== 3. Scroll Reveal with Stagger ===== */
    if ("IntersectionObserver" in window) {
        const revealObs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        revealObs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
        );
        document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

        const navObs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    navItems.forEach((l) => {
                        l.classList.toggle("is-active", l.getAttribute("href") === `#${entry.target.id}`);
                    });
                });
            },
            { threshold: 0.25, rootMargin: "-18% 0px -50% 0px" }
        );
        sections.forEach((s) => navObs.observe(s));
    } else {
        document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    }

    /* ===== 4. Smooth Parallax (lerped, 50% speed) ===== */
    const parallaxBg = document.querySelector("[data-parallax]");
    let currentParallaxY = 0;
    let targetParallaxY = 0;

    function animateParallax() {
        // Smooth lerp toward target
        currentParallaxY += (targetParallaxY - currentParallaxY) * 0.08;
        parallaxBg.style.transform = `translateY(${currentParallaxY}px)`;
        requestAnimationFrame(animateParallax);
    }
    animateParallax();

    window.addEventListener("scroll", () => {
        targetParallaxY = window.scrollY * 0.5;
    }, { passive: true });

    /* ===== 5. Mouse-Follow Tilt — Smooth Lerped ===== */
    const tiltElements = document.querySelectorAll("[data-tilt]");
    const tiltState = new WeakMap();

    // Initialize state per element
    tiltElements.forEach((el) => {
        tiltState.set(el, {
            currentRX: 0, currentRY: 0, currentScale: 1,
            targetRX: 0, targetRY: 0, targetScale: 1,
            mx: 50, my: 50, targetMx: 50, targetMy: 50,
            active: false
        });
    });

    // Animation loop for smooth tilt
    function animateTilt() {
        tiltElements.forEach((el) => {
            const s = tiltState.get(el);
            if (!s) return;

            // Lerp toward targets
            const lerpFactor = s.active ? 0.12 : 0.06;
            s.currentRX += (s.targetRX - s.currentRX) * lerpFactor;
            s.currentRY += (s.targetRY - s.currentRY) * lerpFactor;
            s.currentScale += (s.targetScale - s.currentScale) * lerpFactor;
            s.mx += (s.targetMx - s.mx) * 0.1;
            s.my += (s.targetMy - s.my) * 0.1;

            el.style.transform = `perspective(800px) rotateX(${s.currentRX}deg) rotateY(${s.currentRY}deg) scale3d(${s.currentScale},${s.currentScale},${s.currentScale})`;
            el.style.setProperty("--mx", s.mx + "%");
            el.style.setProperty("--my", s.my + "%");
        });
        requestAnimationFrame(animateTilt);
    }
    animateTilt();

    // Track which element mouse is over
    let activeTiltEl = null;

    document.addEventListener("mousemove", (e) => {
        // Reset previous active
        if (activeTiltEl) {
            const rect = activeTiltEl.getBoundingClientRect();
            const isNear = e.clientX >= rect.left - 30 && e.clientX <= rect.right + 30 &&
                           e.clientY >= rect.top - 30 && e.clientY <= rect.bottom + 30;
            if (!isNear) {
                const s = tiltState.get(activeTiltEl);
                if (s) {
                    s.active = false;
                    s.targetRX = 0; s.targetRY = 0; s.targetScale = 1;
                    s.targetMx = 50; s.targetMy = 50;
                }
                activeTiltEl = null;
            }
        }

        // Check all tilt elements
        tiltElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            const isNear = e.clientX >= rect.left - 30 && e.clientX <= rect.right + 30 &&
                           e.clientY >= rect.top - 30 && e.clientY <= rect.bottom + 30;
            const s = tiltState.get(el);
            if (!s) return;

            if (isNear) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                // Softer tilt: ±4deg instead of ±6
                s.targetRX = ((y - centerY) / centerY) * -4;
                s.targetRY = ((x - centerX) / centerX) * 4;
                s.targetScale = 1.015;
                s.targetMx = (x / rect.width) * 100;
                s.targetMy = (y / rect.height) * 100;
                s.active = true;
                activeTiltEl = el;
            }
        });
    });

    // Reset all on mouse leave window
    document.addEventListener("mouseleave", () => {
        tiltElements.forEach((el) => {
            const s = tiltState.get(el);
            if (s) {
                s.active = false;
                s.targetRX = 0; s.targetRY = 0; s.targetScale = 1;
                s.targetMx = 50; s.targetMy = 50;
            }
        });
        activeTiltEl = null;
    });

    /* ===== 6. Particle System — Optimized ===== */
    const canvas = document.getElementById("particles");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        let particles = [];
        const PARTICLE_COUNT = 45; // reduced for smoothness
        let animFrameId;

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        class Particle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2.5 + 0.8;
                this.speedX = (Math.random() - 0.5) * 0.25;
                this.speedY = (Math.random() - 0.5) * 0.25;
                this.baseOpacity = Math.random() * 0.30 + 0.06;
                this.hue = 160 + Math.random() * 40;
                this.life = Math.random() * 400 + 250;
                this.age = 0;
                // Breathing phase offset
                this.phase = Math.random() * Math.PI * 2;
            }
            update(time) {
                this.x += this.speedX;
                this.y += this.speedY;
                this.age++;
                // Gentle breathing opacity
                const breathe = Math.sin(time * 0.001 + this.phase) * 0.3 + 0.7;
                this.currentOpacity = this.baseOpacity * breathe;
                if (this.age > this.life || this.x < -20 || this.x > canvas.width + 20 ||
                    this.y < -20 || this.y > canvas.height + 20) {
                    this.reset();
                }
            }
            draw() {
                const fade = Math.min(1, this.age / 40) * Math.min(1, (this.life - this.age) / 40);
                const alpha = this.currentOpacity * fade;
                if (alpha < 0.01) return;

                // Core dot
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 75%, 55%, ${alpha})`;
                ctx.fill();

                // Soft glow
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 75%, 55%, ${alpha * 0.08})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new Particle());
        }

        function animateParticles(time) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.update(time);
                p.draw();
            });
            animFrameId = requestAnimationFrame(animateParticles);
        }
        animateParticles(0);

        // Pause particles when tab is hidden
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                cancelAnimationFrame(animFrameId);
            } else {
                animateParticles(performance.now());
            }
        });
    }

    /* ===== 7. Year ===== */
    const yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ===== 8. Contact Form ===== */
    const form = document.getElementById("contact-form");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const name = fd.get("name").trim();
            const email = fd.get("email").trim();
            const message = fd.get("message").trim();
            const subject = encodeURIComponent(`来自个人主页的交流邀请：${name}`);
            const body = encodeURIComponent(`姓名：${name}\n邮箱：${email}\n\n${message}`);
            window.location.href = `mailto:1256381960@qq.com?subject=${subject}&body=${body}`;
        });
    }

    /* ===== 9. Smooth scroll for anchor links ===== */
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", (e) => {
            const target = document.querySelector(anchor.getAttribute("href"));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });
})();
