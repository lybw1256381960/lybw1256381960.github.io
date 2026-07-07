/* ================================================================
   林韦婧个人主页 — ColorBends WebGL + 交互系统 v3
   ================================================================ */

(function () {
    "use strict";

    /* ═══════════════════════════════════════════════════════════
       PART 1: LiquidEther Fluid Background
       由 liquid-ether.js 接管
    ═══════════════════════════════════════════════════════════ */

    const cbCanvas = document.getElementById("liquid-ether-canvas");
    if (cbCanvas) {
        // Handled by liquid-ether.js
    }

    /* ═══════════════════════════════════════════════════════════
       PART 2: UI Interactions
    ═══════════════════════════════════════════════════════════ */

            const FRAG = `
                precision highp float;
                uniform float u_time;
                uniform vec2  u_resolution;
                uniform vec2  u_mouse;
                uniform float u_rotation;
                uniform float u_speed;
                uniform float u_autoRotate;
                uniform float u_scale;
                uniform float u_frequency;
                uniform float u_warpStrength;
                uniform float u_mouseInfluence;
                uniform float u_parallax;
                uniform float u_noise;
                uniform int   u_iterations;
                uniform float u_intensity;
                uniform float u_bandWidth;
                uniform vec3  u_color0;
                uniform vec3  u_color1;
                uniform vec3  u_color2;

                float hash21(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
                }

                float valueNoise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
                               mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
                }

                float fbm(vec2 p, int oct) {
                    float v=0.0, a=0.5, fr=1.0, norm=0.0;
                    for(int i=0;i<6;i++){
                        if(i>=oct) break;
                        v += a * valueNoise(p * fr);
                        norm += a; a *= 0.5; fr *= 2.0;
                    }
                    return v / norm;
                }

                float warpedNoise(vec2 p, float t) {
                    float q = fbm(p, u_iterations);
                    float r = fbm(p + vec2(5.2+t*0.1, 1.3+t*0.07), u_iterations);
                    vec2 off = vec2(
                        fbm(p + q*u_warpStrength + vec2(1.7, 9.2), u_iterations),
                        fbm(p + r*u_warpStrength + vec2(8.3, 2.8), u_iterations)
                    ) * u_warpStrength;
                    return fbm(p + off, u_iterations);
                }

                vec2 rotateUV(vec2 uv, float ang) {
                    float rad = radians(ang);
                    float s=sin(rad), c=cos(rad);
                    return vec2(c*uv.x-s*uv.y, s*uv.x+c*uv.y);
                }

                float band(float t, float w) {
                    float fw = fwidth(t) * w;
                    return smoothstep(-fw, fw, sin(t * 6.2832));
                }

                void main() {
                    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution)
                              / min(u_resolution.x, u_resolution.y);
                    float t  = u_time * u_speed;
                    float rot = u_rotation + u_autoRotate * t * 10.0;
                    vec2 ruv = rotateUV(uv * u_scale, rot);

                    // Mouse distortion
                    vec2 m = u_mouse * 2.0 - 1.0;
                    m.x *= u_resolution.x / u_resolution.y;
                    float mDist = length(uv - m);
                    float mStr  = u_mouseInfluence * smoothstep(1.2, 0.0, mDist);

                    // Warped noise field
                    vec2 nc = ruv * u_frequency + vec2(t*0.08, t*0.05);
                    nc += mStr * (uv - m) * 0.5;
                    float n = warpedNoise(nc, t);
                    n = mix(0.5, n, u_intensity);

                    // Grain
                    n += valueNoise(ruv * 40.0 + t) * u_noise * 0.04;

                    // Three-color band mixing
                    float bt = n * u_bandWidth;
                    float c1 = pow(sin(bt*1.0)*0.5+0.5, 0.8) * (0.6+0.4*band(n, 3.0));
                    float c2 = pow(sin(bt*1.0+2.094)*0.5+0.5, 0.8) * (0.6+0.4*band(n+0.33, 3.0));
                    float c3 = pow(sin(bt*1.0+4.189)*0.5+0.5, 0.8) * (0.6+0.4*band(n+0.66, 3.0));

                    vec3 col = u_color0*c1 + u_color1*c2 + u_color2*c3;

                    // Vignette
                    float vig = 1.0 - smoothstep(0.5, 1.4, length(uv));
                    col *= mix(0.80, 1.0, vig);

                    // Mouse glow
                    col += mStr * 0.07 * (u_color0 + u_color2) * 0.5;

                    gl_FragColor = vec4(col, 1.0);
                }`;

            function compileShader(type, src) {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    console.error("Shader error:", gl.getShaderInfoLog(s));
                    return null;
                }
                return s;
            }
            const vs = compileShader(gl.VERTEX_SHADER, VERT);
            const fs = compileShader(gl.FRAGMENT_SHADER, FRAG);
            if (!vs || !fs) { /* fallback handled below */ }

            if (vs && fs) {
                const prog = gl.createProgram();
                gl.attachShader(prog, vs);
                gl.attachShader(prog, fs);
                gl.linkProgram(prog);
                gl.useProgram(prog);

                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER,
                    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
                const posLoc = gl.getAttribLocation(prog, "a_pos");
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

                const U = {
                    time: gl.getUniformLocation(prog,"u_time"),
                    res:  gl.getUniformLocation(prog,"u_resolution"),
                    mouse:gl.getUniformLocation(prog,"u_mouse"),
                    rot:  gl.getUniformLocation(prog,"u_rotation"),
                    speed:gl.getUniformLocation(prog,"u_speed"),
                    autoR:gl.getUniformLocation(prog,"u_autoRotate"),
                    scale:gl.getUniformLocation(prog,"u_scale"),
                    freq: gl.getUniformLocation(prog,"u_frequency"),
                    warp: gl.getUniformLocation(prog,"u_warpStrength"),
                    mInfl:gl.getUniformLocation(prog,"u_mouseInfluence"),
                    para: gl.getUniformLocation(prog,"u_parallax"),
                    noise:gl.getUniformLocation(prog,"u_noise"),
                    iter: gl.getUniformLocation(prog,"u_iterations"),
                    ints: gl.getUniformLocation(prog,"u_intensity"),
                    bndW: gl.getUniformLocation(prog,"u_bandWidth"),
                    c0:   gl.getUniformLocation(prog,"u_color0"),
                    c1:   gl.getUniformLocation(prog,"u_color1"),
                    c2:   gl.getUniformLocation(prog,"u_color2"),
                };

                const hexToRGB = h => [
                    parseInt(h.slice(1,3),16)/255,
                    parseInt(h.slice(3,5),16)/255,
                    parseInt(h.slice(5,7),16)/255
                ];
                const C0 = hexToRGB("#06d492");
                const C1 = hexToRGB("#f37eef");
                const C2 = hexToRGB("#19c5ff");

                let mX=0.5, mY=0.5, tMX=0.5, tMY=0.5;
                document.addEventListener("mousemove", e => {
                    tMX = e.clientX / cbCanvas.width;
                    tMY = 1.0 - e.clientY / cbCanvas.height;
                });

                function resizeCanvas() {
                    cbCanvas.width  = window.innerWidth;
                    cbCanvas.height = window.innerHeight;
                    gl.viewport(0, 0, cbCanvas.width, cbCanvas.height);
                }
                resizeCanvas();
                window.addEventListener("resize", resizeCanvas);

                let startMs = performance.now();
                let cbAnimId;
                function renderCB(elapsed) {
                    mX += (tMX - mX) * 0.07;
                    mY += (tMY - mY) * 0.07;

                    gl.uniform1f(U.time,   elapsed);
                    gl.uniform2f(U.res,   cbCanvas.width, cbCanvas.height);
                    gl.uniform2f(U.mouse, mX, mY);
                    gl.uniform1f(U.rot,   85);
                    gl.uniform1f(U.speed,  0.3);
                    gl.uniform1f(U.autoR,  0.5);
                    gl.uniform1f(U.scale,  1.8);
                    gl.uniform1f(U.freq,   2.0);
                    gl.uniform1f(U.warp,   1.0);
                    gl.uniform1f(U.mInfl,  1.2);
                    gl.uniform1f(U.para,    0.7);
                    gl.uniform1f(U.noise,  0.1);
                    gl.uniform1i(U.iter,   2);
                    gl.uniform1f(U.ints,   1.2);
                    gl.uniform1f(U.bndW,   6.0);
                    gl.uniform3fv(U.c0, C0);
                    gl.uniform3fv(U.c1, C1);
                    gl.uniform3fv(U.c2, C2);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    cbAnimId = requestAnimationFrame(ts => renderCB((ts-startMs)/1000));
                }
                renderCB(0);

                document.addEventListener("visibilitychange", () => {
                    if (document.hidden) { cancelAnimationFrame(cbAnimId); }
                    else { startMs = performance.now() - performance.now() * 0.001; renderCB(0); }
                });
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       PART 2: UI Interactions (原有功能保留)
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
