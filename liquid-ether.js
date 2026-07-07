/* ================================================================
   LiquidEther — Vanilla WebGL Fluid Simulation
   Ported from Three.js React component to pure HTML/CSS/JS
   Based on: WebGLRenderTarget FBO ping-pong, Navier-Stokes solver
   ================================================================ */

(function () {
    "use strict";

    /* ══════════════════════════════════════════════════════════════
       CONFIG — 匹配 React LiquidEther props
    ══════════════════════════════════════════════════════════════ */
    const CFG = {
        colors:              ['#5227FF', '#FF9FFC', '#B497CF'],
        color0:              '#27d9ff',
        color1:              '#20ffd1',
        color2:              '#b4f2ff',
        mouseForce:          19,
        cursorSize:          120,
        isViscous:           true,
        viscous:             35,
        iterationsViscous:   20,
        iterationsPoisson:   35,
        dt:                  0.014,
        BFECC:               true,
        resolution:           0.4,
        isBounce:            false,
        autoDemo:            true,
        autoSpeed:           0.35,
        autoIntensity:       0.9,
        takeoverDuration:     0.25,
        autoResumeDelay:     3000,
        autoRampDuration:    0.6,
    };

    const canvas = document.getElementById('liquid-ether-canvas');
    if (!canvas) return;

    /* ══════════════════════════════════════════════════════════════
       WEBGL SETUP
    ══════════════════════════════════════════════════════════════ */
    const gl = canvas.getContext('webgl', {
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
    });
    if (!gl) {
        console.warn('WebGL not available, skipping LiquidEther');
        return;
    }

    // Float textures (OES_texture_float if needed)
    const extFloat   = gl.getExtension('OES_texture_float');
    const extHalf    = gl.getExtension('OES_texture_half_float');
    const extLin     = gl.getExtension('OES_texture_float_linear');
    const extHalfLin = gl.getExtension('OES_texture_half_float_linear');
    const extFBO     = gl.getExtension('WEBGL_framebuffer');

    function getFloatType() {
        if (extFloat && extLin) return gl.FLOAT;
        if (extHalf && extHalfLin) return extHalf.HALF_FLOAT_OES;
        return gl.UNSIGNED_BYTE;
    }
    const TEX_TYPE = getFloatType();

    function createSolidTex(w, h, r, g, b, a) {
        const data = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a;
        }
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    function createFBO(w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, TEX_TYPE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { fbo, tex, w, h };
    }

    function createDoubleFBO(w, h) {
        const a = createFBO(w, h);
        const b = createFBO(w, h);
        return { read: a, write: b, swap() { const t=a; this.read=a=this.write; this.write=b=t; } };
    }

    function renderToFBO(fbo, prog) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
        gl.viewport(0, 0, fbo ? fbo.w : canvas.width, fbo ? fbo.h : canvas.height);
        gl.useProgram(prog.id);
        gl.bindBuffer(gl.ARRAY_BUFFER, prog.quadBuf);
        const loc = prog.a_pos;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function bindTex(unit, tex) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    /* ══════════════════════════════════════════════════════════════
       SHADER SOURCES (from React LiquidEther)
    ══════════════════════════════════════════════════════════════ */
    const VERT = `
    attribute vec2 a_pos;
    void main(){ gl_Position=vec4(a_pos,0.0,1.0); }`;

    // face_vert — covers full viewport, no aspect correction
    const FACE_VERT = `
    attribute vec3 a_pos;
    varying vec2 v_uv;
    void main(){
        vec3 pos=a_pos;
        v_uv=vec2(0.5)+(pos.xy)*0.5;
        gl_Position=vec4(pos,1.0);
    }`;

    const ADVECTION = `
    precision highp float;
    uniform sampler2D u_vel;
    uniform float u_dt;
    uniform bool u_bfecc;
    uniform vec2 u_ratio;
    varying vec2 v_uv;
    void main(){
        vec2 vel=texture2D(u_vel,v_uv).xy;
        vec2 uv2=v_uv-vel*u_dt*u_ratio;
        vec2 newVel=texture2D(u_vel,uv2).xy;
        gl_FragColor=vec4(newVel,0.0,0.0);
    }`;

    const ADVECTION_BFECC = `
    precision highp float;
    uniform sampler2D u_vel;
    uniform float u_dt;
    uniform bool u_bfecc;
    uniform vec2 u_ratio;
    varying vec2 v_uv;
    void main(){
        vec2 spot_new=v_uv;
        vec2 vel_old=texture2D(u_vel,v_uv).xy;
        vec2 spot_old=spot_new-vel_old*u_dt*u_ratio;
        vec2 vel_new1=texture2D(u_vel,spot_old).xy;
        vec2 spot_new2=spot_old+vel_new1*u_dt*u_ratio;
        vec2 error=spot_new2-spot_new;
        vec2 spot_new3=spot_new-error/2.0;
        vec2 vel_2=texture2D(u_vel,spot_new3).xy;
        vec2 spot_old2=spot_new3-vel_2*u_dt*u_ratio;
        vec2 newVel2=texture2D(u_vel,spot_old2).xy;
        gl_FragColor=vec4(newVel2,0.0,0.0);
    }`;

    const EXTERNAL_FORCE = `
    precision highp float;
    uniform vec2 u_force;
    uniform vec2 u_center;
    uniform vec2 u_cursorScale;
    varying vec2 v_uv;
    void main(){
        vec2 circle=(v_uv-0.5)*2.0;
        float d=1.0-min(length(circle/u_cursorScale),1.0);
        d*=d*d;
        gl_FragColor=vec4(u_force*d,0.0,1.0);
    }`;

    const DIVERGENCE = `
    precision highp float;
    uniform sampler2D u_vel;
    uniform vec2 u_px;
    uniform float u_dt;
    varying vec2 v_uv;
    void main(){
        float x0=texture2D(u_vel,v_uv-vec2(u_px.x,0.0)).x;
        float x1=texture2D(u_vel,v_uv+vec2(u_px.x,0.0)).x;
        float y0=texture2D(u_vel,v_uv-vec2(0.0,u_px.y)).y;
        float y1=texture2D(u_vel,v_uv+vec2(0.0,u_px.y)).y;
        float div=(x1-x0+y1-y0)/2.0;
        gl_FragColor=vec4(div/u_dt);
    }`;

    const POISSON = `
    precision highp float;
    uniform sampler2D u_pressure;
    uniform sampler2D u_divergence;
    uniform vec2 u_px;
    varying vec2 v_uv;
    void main(){
        float p0=texture2D(u_pressure,v_uv+vec2(u_px.x*2.0,0.0)).r;
        float p1=texture2D(u_pressure,v_uv-vec2(u_px.x*2.0,0.0)).r;
        float p2=texture2D(u_pressure,v_uv+vec2(0.0,u_px.y*2.0)).r;
        float p3=texture2D(u_pressure,v_uv-vec2(0.0,u_px.y*2.0)).r;
        float div=texture2D(u_divergence,v_uv).r;
        float newP=(p0+p1+p2+p3)/4.0-div;
        gl_FragColor=vec4(newP);
    }`;

    const PRESSURE = `
    precision highp float;
    uniform sampler2D u_pressure;
    uniform sampler2D u_vel;
    uniform vec2 u_px;
    uniform float u_dt;
    varying vec2 v_uv;
    void main(){
        float step=1.0;
        float p0=texture2D(u_pressure,v_uv+vec2(u_px.x*step,0.0)).r;
        float p1=texture2D(u_pressure,v_uv-vec2(u_px.x*step,0.0)).r;
        float p2=texture2D(u_pressure,v_uv+vec2(0.0,u_px.y*step)).r;
        float p3=texture2D(u_pressure,v_uv-vec2(0.0,u_px.y*step)).r;
        vec2 v=texture2D(u_vel,v_uv).xy;
        vec2 gradP=vec2(p0-p1,p2-p3)*0.5;
        v=v-gradP*u_dt;
        gl_FragColor=vec4(v,0.0,1.0);
    }`;

    const VISCOUS = `
    precision highp float;
    uniform sampler2D u_vel;
    uniform sampler2D u_velNew;
    uniform float u_viscous;
    uniform vec2 u_px;
    uniform float u_dt;
    varying vec2 v_uv;
    void main(){
        vec2 old=texture2D(u_vel,v_uv).xy;
        vec2 new0=texture2D(u_velNew,v_uv+vec2(u_px.x*2.0,0.0)).xy;
        vec2 new1=texture2D(u_velNew,v_uv-vec2(u_px.x*2.0,0.0)).xy;
        vec2 new2=texture2D(u_velNew,v_uv+vec2(0.0,u_px.y*2.0)).xy;
        vec2 new3=texture2D(u_velNew,v_uv-vec2(0.0,u_px.y*2.0)).xy;
        vec2 newv=4.0*old+u_viscous*u_dt*(new0+new1+new2+new3);
        newv/=4.0*(1.0+u_viscous*u_dt);
        gl_FragColor=vec4(newv,0.0,0.0);
    }`;

    const COLOR = `
    precision highp float;
    uniform sampler2D u_vel;
    uniform sampler2D u_palette;
    varying vec2 v_uv;
    void main(){
        vec2 vel=texture2D(u_vel,v_uv).xy;
        float lenv=clamp(length(vel),0.0,1.0);
        vec3 c=texture2D(u_palette,vec2(lenv,0.5)).rgb;
        gl_FragColor=vec4(c,1.0);
    }`;

    /* ══════════════════════════════════════════════════════════════
       SHADER COMPILATION
    ══════════════════════════════════════════════════════════════ */
    function compileShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(s), '\n', src.substring(0,200));
            return null;
        }
        return s;
    }
    function createProgram(vert, frag) {
        const vs = compileShader(gl.VERTEX_SHADER, vert);
        const fs = compileShader(gl.FRAGMENT_SHADER, frag);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('Link error:', gl.getProgramInfoLog(p)); return null;
        }
        // Pre-fetch uniforms
        const uid = {};
        const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < nu; i++) {
            const info = gl.getActiveUniform(p, i);
            uid[info.name] = gl.getUniformLocation(p, info.name);
        }
        // Create quad buffer
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        // Create face quad with position attr
        const faceQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, faceQuad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, 1,1,0]), gl.STATIC_DRAW);
        return { id: p, uid, quadBuf: quad, faceBuf: faceQuad };
    }

    const prog = {
        advect:   createProgram(VERT,      ADVECTION),
        advectBF: createProgram(VERT,      ADVECTION_BFECC),
        force:    createProgram(VERT,      EXTERNAL_FORCE),
        div:      createProgram(FACE_VERT, DIVERGENCE),
        poisson:  createProgram(FACE_VERT, POISSON),
        press:    createProgram(FACE_VERT, PRESSURE),
        viscous:  createProgram(FACE_VERT, VISCOUS),
        color:    createProgram(FACE_VERT, COLOR),
    };

    // Check all compiled
    for (const [k, v] of Object.entries(prog)) {
        if (!v) { console.error('Failed to compile:', k); return; }
    }

    /* ══════════════════════════════════════════════════════════════
       COLOR PALETTE TEXTURE
    ══════════════════════════════════════════════════════════════ */
    function hexToRGB(hex) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return [r, g, b];
    }

    // Build 256-width palette from the three color stops
    function buildPaletteTexture(colors, color0, color1, color2) {
        const W = 256;
        const data = new Uint8Array(W * 4);
        const stops = [color0, color1, color2];
        for (let i = 0; i < W; i++) {
            const t = i / (W - 1);
            // Map [0,1] to [0,2], clamp to [0,1]
            const idx = t * 2;
            const t0 = Math.max(0, Math.min(1, idx));
            const t1 = Math.max(0, Math.min(1, idx - 1));
            const weight0 = 1 - t0;
            const weight1 = 1 - Math.abs(t1 - 0.5) * 2;
            const weight2 = t1 > 0.5 ? (t1 - 0.5) * 2 : 0;
            const sum = weight0 + weight1 + weight2 || 1;
            let r = 0, g = 0, b = 0;
            for (let s = 0; s < 3; s++) {
                const [cr, cg, cb] = hexToRGB(stops[s]);
                r += cr * [weight0, weight1, weight2][s];
                g += cg * [weight0, weight1, weight2][s];
                b += cb * [weight0, weight1, weight2][s];
            }
            data[i*4]   = Math.round(r / sum);
            data[i*4+1] = Math.round(g / sum);
            data[i*4+2] = Math.round(b / sum);
            data[i*4+3] = 255;
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }
    const paletteTex = buildPaletteTexture(CFG.colors, CFG.color0, CFG.color1, CFG.color2);

    /* ══════════════════════════════════════════════════════════════
       MOUSE / AUTO DRIVER
    ══════════════════════════════════════════════════════════════ */
    const Mouse = {
        x: 0, y: 0,
        px: 0, py: 0,          // previous
        dx: 0, dy: 0,
        hasControl: false,
        isAutoActive: false,
        isHoverInside: false,
        takeoverActive: false,
        takeoverT0: 0,
        takeoverFrom: [0, 0],
        takeoverTo: [0, 0],
        autoDriver: null,
        lastInteract: 0,
    };

    function updateMouseHover(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        Mouse.isHoverInside = (
            clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top  && clientY <= rect.bottom
        );
    }

    function setMouseCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const nx = (clientX - rect.left) / rect.width;
        const ny = (clientY - rect.top)  / rect.height;
        Mouse.x  =  nx * 2 - 1;
        Mouse.y  = -(ny * 2 - 1);
        Mouse.dx = Mouse.x - Mouse.px;
        Mouse.dy = Mouse.y - Mouse.py;
        Mouse.px = Mouse.x;
        Mouse.py = Mouse.y;
    }

    canvas.addEventListener('mousemove', e => {
        updateMouseHover(e.clientX, e.clientY);
        if (!Mouse.isHoverInside) return;
        Mouse.lastInteract = performance.now();
        if (Mouse.autoDriver && Mouse.isAutoActive && !Mouse.hasControl && !Mouse.takeoverActive) {
            Mouse.takeoverFrom = [Mouse.x, Mouse.y];
            const rect = canvas.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top)  / rect.height;
            Mouse.takeoverTo = [nx * 2 - 1, -(ny * 2 - 1)];
            Mouse.takeoverT0 = performance.now();
            Mouse.takeoverActive = true;
            Mouse.hasControl = true;
            Mouse.isAutoActive = false;
            if (Mouse.autoDriver) Mouse.autoDriver.active = false;
            return;
        }
        setMouseCoords(e.clientX, e.clientY);
        Mouse.hasControl = true;
    });

    canvas.addEventListener('touchmove', e => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        updateMouseHover(t.clientX, t.clientY);
        if (!Mouse.isHoverInside) return;
        Mouse.lastInteract = performance.now();
        setMouseCoords(t.clientX, t.clientY);
        Mouse.hasControl = true;
    }, { passive: true });

    canvas.addEventListener('touchend', () => { Mouse.isHoverInside = false; });

    // Smooth mouse update per frame
    function updateMouse() {
        if (Mouse.takeoverActive) {
            const t = (performance.now() - Mouse.takeoverT0) / (CFG.takeoverDuration * 1000);
            if (t >= 1) {
                Mouse.takeoverActive = false;
                Mouse.x = Mouse.takeoverTo[0]; Mouse.y = Mouse.takeoverTo[1];
                Mouse.px = Mouse.x; Mouse.py = Mouse.y;
                Mouse.dx = 0; Mouse.dy = 0;
            } else {
                const k = t * t * (3 - 2 * t); // smoothstep
                Mouse.x = Mouse.takeoverFrom[0] + (Mouse.takeoverTo[0] - Mouse.takeoverFrom[0]) * k;
                Mouse.y = Mouse.takeoverFrom[1] + (Mouse.takeoverTo[1] - Mouse.takeoverFrom[1]) * k;
            }
        }
        if (!Mouse.takeoverActive) {
            Mouse.dx = Mouse.x - Mouse.px;
            Mouse.dy = Mouse.y - Mouse.py;
            Mouse.px = Mouse.x;
            Mouse.py = Mouse.y;
        }
        if (Mouse.isAutoActive) {
            Mouse.dx *= CFG.autoIntensity;
            Mouse.dy *= CFG.autoIntensity;
        }
    }

    /* Auto Driver */
    Mouse.autoDriver = {
        active: false,
        current: [0, 0],
        target: [0, 0],
        lastTime: 0,
        margin: 0.2,
        pickTarget() {
            const r = Math.random;
            this.target = [
                (r() * 2 - 1) * (1 - this.margin),
                (r() * 2 - 1) * (1 - this.margin)
            ];
        },
        update() {
            if (!CFG.autoDemo) return;
            const now = performance.now();
            const idle = now - Mouse.lastInteract;
            if (idle < CFG.autoResumeDelay) {
                if (this.active) this.active = false;
                Mouse.isAutoActive = false;
                return;
            }
            if (Mouse.isHoverInside) {
                if (this.active) { this.active = false; Mouse.isAutoActive = false; }
                return;
            }
            if (!this.active) {
                this.active = true;
                this.current = [Mouse.x, Mouse.y];
                this.lastTime = now;
                Mouse.isAutoActive = true;
            }
            let dtSec = (now - this.lastTime) / 1000;
            if (dtSec > 0.2) dtSec = 0.016;
            this.lastTime = now;
            const dx = this.target[0] - this.current[0];
            const dy = this.target[1] - this.current[1];
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 0.01) { this.pickTarget(); return; }
            let ramp = 1;
            if (CFG.autoRampDuration > 0) {
                const t = Math.min(1, (now - Mouse.lastInteract) / (CFG.autoRampDuration * 1000));
                ramp = t * t * (3 - 2 * t);
            }
            const step = CFG.autoSpeed * dtSec * ramp;
            const move = Math.min(step, dist);
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            this.current[0] += nx * move;
            this.current[1] += ny * move;
            Mouse.x = this.current[0];
            Mouse.y = this.current[1];
        }
    };

    /* ══════════════════════════════════════════════════════════════
       SIMULATION STATE
    ══════════════════════════════════════════════════════════════ */
    let W = 0, H = 0, fW = 0, fH = 0;
    let cellX = 0, cellY = 0;
    let vel, velB, vel_visc, vel_viscB, div, pres, presB;

    function calcSimSize() {
        W = canvas.width; H = canvas.height;
        fW = Math.max(1, Math.round(CFG.resolution * W));
        fH = Math.max(1, Math.round(CFG.resolution * H));
        cellX = 1.0 / fW;
        cellY = 1.0 / fH;
    }

    function createFBOs() {
        const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
        const type  = isIOS && extHalf ? extHalf.HALF_FLOAT_OES : gl.FLOAT;

        function mkFBO() {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            // Initialize to zero
            const init = new Float32Array(fW * fH * 4);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fW, fH, 0, gl.RGBA, type, init);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return { fbo, tex };
        }
        function mkDFBO() {
            const a = mkFBO(), b = mkFBO();
            return {
                read: a, write: b,
                swap() { const t=a; this.read=a=this.write; this.write=b=t; },
                resize() { /* handled in main resize */ }
            };
        }

        vel      = mkDFBO();
        vel_visc = mkDFBO();
        div      = mkFBO();
        pres     = mkDFBO();
    }

    function resizeSim() {
        const oldFW = fW, oldFH = fH;
        calcSimSize();
        if (fW === oldFW && fH === oldFH) return;

        function resizeFBO(dfbo) {
            const type = TEX_TYPE;
            function resize(f) {
                gl.bindTexture(gl.TEXTURE_2D, f.tex);
                const init = new Float32Array(fW * fH * 4);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fW, fH, 0, gl.RGBA, type, init);
                gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            resize(dfbo.read); resize(dfbo.write);
        }
        resizeFBO(vel); resizeFBO(vel_visc); resizeFBO(pres);
        gl.bindTexture(gl.TEXTURE_2D, div.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fW, fH, 0, gl.RGBA, type, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, div.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, div.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* ══════════════════════════════════════════════════════════════
       RENDER HELPERS
    ══════════════════════════════════════════════════════════════ */
    function renderQuad(progObj, target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
        gl.viewport(0, 0, target ? fW : canvas.width, target ? fH : canvas.height);
        gl.useProgram(progObj.id);
        gl.bindBuffer(gl.ARRAY_BUFFER, progObj.faceBuf);
        const loc = gl.getAttribLocation(progObj.id, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Render full-screen quad (for final color output)
    function renderFullQuad(progObj, target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target || null);
        gl.viewport(0, 0, target ? fW : canvas.width, target ? fH : canvas.height);
        gl.useProgram(progObj.id);
        gl.bindBuffer(gl.ARRAY_BUFFER, progObj.quadBuf);
        const loc = gl.getAttribLocation(progObj.id, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* ══════════════════════════════════════════════════════════════
       SIMULATION STEP
    ══════════════════════════════════════════════════════════════ */
    const ratio = [0, 0];

    function simStep() {
        // 1. Advection
        if (CFG.BFECC) {
            gl.useProgram(prog.advectBF.id);
            gl.uniform1i(gl.getUniformLocation(prog.advectBF.id,'u_vel'), 0);
            gl.uniform1f(gl.getUniformLocation(prog.advectBF.id,'u_dt'), CFG.dt);
            gl.uniform1i(gl.getUniformLocation(prog.advectBF.id,'u_bfecc'), 1);
            gl.uniform2fv(gl.getUniformLocation(prog.advectBF.id,'u_ratio'), ratio);
            bindTex(0, vel.read.tex);
        } else {
            gl.useProgram(prog.advect.id);
            gl.uniform1i(gl.getUniformLocation(prog.advect.id,'u_vel'), 0);
            gl.uniform1f(gl.getUniformLocation(prog.advect.id,'u_dt'), CFG.dt);
            gl.uniform1i(gl.getUniformLocation(prog.advect.id,'u_bfecc'), 0);
            gl.uniform2fv(gl.getUniformLocation(prog.advect.id,'u_ratio'), ratio);
            bindTex(0, vel.read.tex);
        }
        renderQuad(prog.advectBF, vel.write);
        vel.swap();

        // 2. External Force (mouse)
        gl.useProgram(prog.force.id);
        const forceX = (Mouse.dx / 2) * CFG.mouseForce;
        const forceY = (Mouse.dy / 2) * CFG.mouseForce;
        gl.uniform2f(gl.getUniformLocation(prog.force.id,'u_force'), forceX, forceY);
        gl.uniform2f(gl.getUniformLocation(prog.force.id,'u_center'), Mouse.x, Mouse.y);
        gl.uniform2f(gl.getUniformLocation(prog.force.id,'u_cursorScale'),
            (CFG.cursorSize / canvas.width), (CFG.cursorSize / canvas.height));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        renderQuad(prog.force, vel.write);
        vel.swap();
        gl.disable(gl.BLEND);

        // 3. Viscous (Jacobi iterations)
        if (CFG.isViscous) {
            let vin = vel.read, vout = vel.write;
            for (let i = 0; i < CFG.iterationsViscous; i++) {
                gl.useProgram(prog.viscous.id);
                gl.uniform1i(gl.getUniformLocation(prog.viscous.id,'u_vel'), 0);
                gl.uniform1i(gl.getUniformLocation(prog.viscous.id,'u_velNew'), 1);
                gl.uniform1f(gl.getUniformLocation(prog.viscous.id,'u_viscous'), CFG.viscous);
                gl.uniform2fv(gl.getUniformLocation(prog.viscous.id,'u_px'), [cellX, cellY]);
                gl.uniform1f(gl.getUniformLocation(prog.viscous.id,'u_dt'), CFG.dt);
                bindTex(0, vin.tex);
                bindTex(1, vout.tex);
                renderQuad(prog.viscous, vel_visc.write);
                vel_visc.swap();
                // ping-pong: vel_visc → vel
                gl.uniform1i(gl.getUniformLocation(prog.viscous.id,'u_vel'), 0);
                gl.uniform1i(gl.getUniformLocation(prog.viscous.id,'u_velNew'), 1);
                bindTex(0, vel_visc.read.tex);
                bindTex(1, vin.tex);
                renderQuad(prog.viscous, vout);
                // swap references for next iteration
                const tmp = vin; vin = vout; vout = tmp;
            }
            // Result ends up in vel.write
            vel.swap(); // put result back
        }

        // 4. Divergence
        gl.useProgram(prog.div.id);
        gl.uniform1i(gl.getUniformLocation(prog.div.id,'u_vel'), 0);
        gl.uniform2fv(gl.getUniformLocation(prog.div.id,'u_px'), [cellX, cellY]);
        gl.uniform1f(gl.getUniformLocation(prog.div.id,'u_dt'), CFG.dt);
        bindTex(0, vel.read.tex);
        renderQuad(prog.div, div);

        // 5. Poisson (pressure solve)
        let pin = pres.read, pout = pres.write;
        for (let i = 0; i < CFG.iterationsPoisson; i++) {
            gl.useProgram(prog.poisson.id);
            gl.uniform1i(gl.getUniformLocation(prog.poisson.id,'u_pressure'), 0);
            gl.uniform1i(gl.getUniformLocation(prog.poisson.id,'u_divergence'), 1);
            gl.uniform2fv(gl.getUniformLocation(prog.poisson.id,'u_px'), [cellX, cellY]);
            bindTex(0, pin.tex);
            bindTex(1, div.tex);
            renderQuad(prog.poisson, pout);
            const t = pin; pin = pout; pout = t;
        }
        pres.swap();

        // 6. Pressure subtraction
        gl.useProgram(prog.press.id);
        gl.uniform1i(gl.getUniformLocation(prog.press.id,'u_pressure'), 0);
        gl.uniform1i(gl.getUniformLocation(prog.press.id,'u_vel'), 1);
        gl.uniform2fv(gl.getUniformLocation(prog.press.id,'u_px'), [cellX, cellY]);
        gl.uniform1f(gl.getUniformLocation(prog.press.id,'u_dt'), CFG.dt);
        bindTex(0, pres.read.tex);
        bindTex(1, vel.read.tex);
        renderQuad(prog.press, vel.write);
        vel.swap();

        // Reset Mouse diff for next frame
        Mouse.dx = 0; Mouse.dy = 0;
    }

    /* ══════════════════════════════════════════════════════════════
       RESIZE + INIT
    ══════════════════════════════════════════════════════════════ */
    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        resizeSim();
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    /* ══════════════════════════════════════════════════════════════
       MAIN LOOP
    ══════════════════════════════════════════════════════════════ */
    let running = true;
    let lastT  = performance.now();

    function loop() {
        if (!running) return;
        requestAnimationFrame(loop);

        updateMouse();
        if (Mouse.autoDriver) Mouse.autoDriver.update();
        updateMouse();

        // Update ratio
        ratio[0] = fH / fW;
        ratio[1] = 1;

        simStep();

        // Render to screen with color mapping
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog.color.id);
        gl.uniform1i(gl.getUniformLocation(prog.color.id,'u_vel'), 0);
        gl.uniform1i(gl.getUniformLocation(prog.color.id,'u_palette'), 1);
        bindTex(0, vel.read.tex);
        bindTex(1, paletteTex);
        gl.bindBuffer(gl.ARRAY_BUFFER, prog.color.faceBuf);
        const loc = gl.getAttribLocation(prog.color.id, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Pause on tab hide
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { running = false; }
        else { running = true; loop(); }
    });

    // Kick off — give a small delay so page has settled
    requestAnimationFrame(() => requestAnimationFrame(loop));

    window.__liquidEther = { cfg: CFG, mouse: Mouse };

})();
