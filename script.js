/* ================================================================
   林韦婧个人主页 — UI 交互系统
   LiquidEther 流体背景由 liquid-ether.js 独立接管
   ================================================================ */

(function () {
    "use strict";

    /* ═══════════════════════════════════════════════════════════
       PART 1: UI Interactions
    ═══════════════════════════════════════════════════════════ */

    /* 1. Header */
    const header     = document.querySelector("[data-header]");
    const navToggle  = document.querySelector("[data-nav-toggle]");
    const navLinks   = document.querySelector("[data-nav-links]");
    const navItems   = Array.from(document.querySelectorAll(".nav-links a"));
    const sections   = navItems.map(l => document.querySelector(l.getAttribute("href"))).filter(Boolean);

    const setHeaderState = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    setHeaderState();
    window.addEventListener("scroll", setHeaderState, { passive: true });

    /* 2. Mobile Nav */
    const closeNav = () => {
        navToggle.setAttribute("aria-expanded", "false");
        navLinks.classList.remove("is-open");
    };
    navToggle.addEventListener("click", () => {
        navToggle.getAttribute("aria-expanded") === "true" ? closeNav()
            : (navToggle.setAttribute("aria-expanded","true"), navLinks.classList.add("is-open"));
    });
    navItems.forEach(l => l.addEventListener("click", closeNav));
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeNav(); });
    document.addEventListener("click", e => {
        if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) closeNav();
    });

    /* 3. Scroll Reveal (staggered) */
    if ("IntersectionObserver" in window) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
        document.querySelectorAll(".reveal").forEach(el => obs.observe(el));

        const navObs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                navItems.forEach(l => {
                    l.classList.toggle("is-active",
                        l.getAttribute("href") === `#${entry.target.id}`);
                });
            });
        }, { threshold: 0.25, rootMargin: "-18% 0px -50% 0px" });
        sections.forEach(s => navObs.observe(s));
    } else {
        document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));
    }

    /* 4. Smooth Parallax */
    const parallaxBg = document.querySelector("[data-parallax]");
    let curPY = 0, tgtPY = 0;
    function animateParallax() {
        curPY += (tgtPY - curPY) * 0.08;
        parallaxBg.style.transform = `translateY(${curPY}px)`;
        requestAnimationFrame(animateParallax);
    }
    animateParallax();
    window.addEventListener("scroll", () => { tgtPY = window.scrollY * 0.5; }, { passive: true });

    /* 5. Mouse Tilt — lerped */
    const tiltEls = document.querySelectorAll("[data-tilt]");
    const tiltState = new Map();
    tiltEls.forEach(el => {
        tiltState.set(el, {
            cRX:0, cRY:0, cS:1, tRX:0, tRY:0, tS:1,
            mx:50, my:50, tMx:50, tMy:50, active:false
        });
    });
    function animateTilt() {
        tiltEls.forEach(el => {
            const s = tiltState.get(el);
            if (!s) return;
            const lf = s.active ? 0.12 : 0.06;
            s.cRX += (s.tRX-s.cRX)*lf; s.cRY += (s.tRY-s.cRY)*lf;
            s.cS  += (s.tS -s.cS )*lf;
            s.mx  += (s.tMx-s.mx)*0.1; s.my  += (s.tMy-s.my)*0.1;
            el.style.transform = `perspective(800px) rotateX(${s.cRX}deg) rotateY(${s.cRY}deg) scale3d(${s.cS},${s.cS},${s.cS})`;
            el.style.setProperty("--mx", s.mx+"%");
            el.style.setProperty("--my", s.my+"%");
        });
        requestAnimationFrame(animateTilt);
    }
    animateTilt();

    let activeTilt = null;
    document.addEventListener("mousemove", e => {
        if (activeTilt) {
            const r = activeTilt.getBoundingClientRect();
            if (!(e.clientX>=r.left-30 && e.clientX<=r.right+30 &&
                  e.clientY>=r.top-30  && e.clientY<=r.bottom+30)) {
                const s = tiltState.get(activeTilt);
                if (s) { s.active=false; s.tRX=0; s.tRY=0; s.tS=1; s.tMx=50; s.tMy=50; }
                activeTilt = null;
            }
        }
        tiltEls.forEach(el => {
            const r = el.getBoundingClientRect();
            if (!(e.clientX>=r.left-30 && e.clientX<=r.right+30 &&
                  e.clientY>=r.top-30  && e.clientY<=r.bottom+30)) return;
            const s = tiltState.get(el);
            if (!s) return;
            const x=e.clientX-r.left, y=e.clientY-r.top;
            const cx=r.width/2, cy=r.height/2;
            s.tRX = ((y-cy)/cy)*-4; s.tRY = ((x-cx)/cx)*4; s.tS = 1.015;
            s.tMx = (x/r.width)*100; s.tMy = (y/r.height)*100;
            s.active = true; activeTilt = el;
        });
    });
    document.addEventListener("mouseleave", () => {
        tiltEls.forEach(el => {
            const s = tiltState.get(el);
            if (s) { s.active=false; s.tRX=0; s.tRY=0; s.tS=1; s.tMx=50; s.tMy=50; }
        });
        activeTilt = null;
    });

    /* 6. Year */
    const yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* 7. Contact Form */
    const form = document.getElementById("contact-form");
    if (form) {
        form.addEventListener("submit", e => {
            e.preventDefault();
            const fd = new FormData(form);
            const s = encodeURIComponent(`来自个人主页的交流邀请：${fd.get("name").trim()}`);
            const b = encodeURIComponent(`姓名：${fd.get("name").trim()}\n邮箱：${fd.get("email").trim()}\n\n${fd.get("message").trim()}`);
            window.location.href = `mailto:1256381960@qq.com?subject=${s}&body=${b}`;
        });
    }

    /* 8. Smooth anchor scroll */
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener("click", e => {
            const t = document.querySelector(a.getAttribute("href"));
            if (t) { e.preventDefault(); t.scrollIntoView({ behavior:"smooth", block:"start" }); }
        });
    });

})();
