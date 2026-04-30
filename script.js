/* ================================================================
   林韦婧个人主页 — 流体3D玻璃质感交互系统
   ================================================================ */

(function () {
    "use strict";

    /* ===== 1. Header Scroll State ===== */
    const header = document.querySelector("[data-header]");
    const navToggle = document.querySelector("[data-nav-toggle]");
    const navLinks = document.querySelector("[data-nav-links]");
    const navItems = Array.from(document.querySelectorAll(".nav-links a"));
    const sections = navItems
        .map((l) => document.querySelector(l.getAttribute("href")))
        .filter(Boolean);

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
    const openNav = () => {
        navToggle.setAttribute("aria-expanded", "true");
        navLinks.classList.add("is-open");
    };
    navToggle.addEventListener("click", () => {
        navToggle.getAttribute("aria-expanded") === "true" ? closeNav() : openNav();
    });
    navItems.forEach((l) => l.addEventListener("click", closeNav));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
    document.addEventListener("click", (e) => {
        if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) closeNav();
    });

    /* ===== 3. Scroll Reveal (IntersectionObserver) ===== */
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
            { threshold: 0.10, rootMargin: "0px 0px -40px 0px" }
        );
        document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

        // Active nav highlight
        const navObs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    navItems.forEach((l) => {
                        l.classList.toggle(
                            "is-active",
                            l.getAttribute("href") === `#${entry.target.id}`
                        );
                    });
                });
            },
            { threshold: 0.30, rootMargin: "-20% 0px -55% 0px" }
        );
        sections.forEach((s) => navObs.observe(s));
    } else {
        document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    }

    /* ===== 4. Parallax Background (50% of scroll speed) ===== */
    const parallaxBg = document.querySelector("[data-parallax]");
    let ticking = false;

    function updateParallax() {
        const scrollY = window.scrollY;
        parallaxBg.style.transform = `translateY(${scrollY * 0.5}px)`;
        ticking = false;
    }

    window.addEventListener("scroll", () => {
        if (!ticking) {
            requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }, { passive: true });

    /* ===== 5. Mouse-Follow Tilt (3D Deformation) ===== */
    const tiltElements = document.querySelectorAll("[data-tilt]");

    function handleTilt(e, el) {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -6;   // max ±6deg
        const rotateY = ((x - centerX) / centerX) * 6;

        el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01,1.01,1.01)`;

        // Mouse-follow light spot
        const percentX = (x / rect.width) * 100;
        const percentY = (y / rect.height) * 100;
        el.style.setProperty("--mx", percentX + "%");
        el.style.setProperty("--my", percentY + "%");
    }

    function resetTilt(el) {
        el.style.transform = "perspective(800px) rotateX(0) rotateY(0) scale3d(1,1,1)";
        el.style.transition = "transform 0.5s cubic-bezier(.25,.46,.45,.94)";
    }

    // Use event delegation for performance
    document.addEventListener("mousemove", (e) => {
        tiltElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            // Only process if mouse is near the element
            if (
                e.clientX >= rect.left - 40 &&
                e.clientX <= rect.right + 40 &&
                e.clientY >= rect.top - 40 &&
                e.clientY <= rect.bottom + 40
            ) {
                el.style.transition = "transform 0.15s ease-out";
                handleTilt(e, el);
            }
        });
    });

    document.addEventListener("mouseleave", () => {
        tiltElements.forEach(resetTilt);
    });

    // Reset on scroll to avoid stuck transforms
    let tiltResetTick = false;
    window.addEventListener("scroll", () => {
        if (!tiltResetTick) {
            requestAnimationFrame(() => {
                tiltElements.forEach(resetTilt);
                tiltResetTick = false;
            });
            tiltResetTick = true;
        }
    }, { passive: true });

    /* ===== 6. Particle System (Canvas) ===== */
    const canvas = document.getElementById("particles");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        let particles = [];
        const PARTICLE_COUNT = 60;

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
                this.size = Math.random() * 3 + 1;
                this.speedX = (Math.random() - 0.5) * 0.3;
                this.speedY = (Math.random() - 0.5) * 0.3;
                this.opacity = Math.random() * 0.35 + 0.05;
                this.hue = 160 + Math.random() * 40; // blue-green range
                this.life = Math.random() * 300 + 200;
                this.age = 0;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.age++;
                if (this.age > this.life || this.x < -10 || this.x > canvas.width + 10 ||
                    this.y < -10 || this.y > canvas.height + 10) {
                    this.reset();
                }
            }
            draw() {
                const fade = 1 - this.age / this.life;
                const alpha = this.opacity * fade;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 80%, 60%, ${alpha})`;
                ctx.fill();

                // Glow
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 80%, 60%, ${alpha * 0.15})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new Particle());
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.update();
                p.draw();
            });
            requestAnimationFrame(animateParticles);
        }
        animateParticles();
    }

    /* ===== 7. Year ===== */
    const yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ===== 8. Contact Form (mailto) ===== */
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
})();
