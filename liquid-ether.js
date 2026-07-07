/* ================================================================
   LiquidEther — Three.js Fluid Simulation
   Ported from React component to vanilla JS
   ================================================================ */

(function() {
    "use strict";

    // Configuration matching React props
    const CFG = {
        mouseForce: 20,
        cursorSize: 100,
        isViscous: false,
        viscous: 30,
        iterationsViscous: 12,
        iterationsPoisson: 20,
        dt: 0.016,
        BFECC: true,
        resolution: 0.25,
        isBounce: false,
        colors: ['#00a8d8', '#00e0b0', '#50f0d8', '#b0fff4', '#ffffff'],
        autoDemo: true,
        autoSpeed: 0.7,
        autoIntensity: 8.0,
        takeoverDuration: 0.25,
        autoResumeDelay: 1000,
        autoRampDuration: 0.6
    };

    const canvas = document.getElementById('liquid-ether-canvas');
    if (!canvas) { console.error('[LiquidEther] canvas not found'); return; }

    // THREE.js already loaded synchronously from <head>
    const THREE = window.THREE;
    if (!THREE) { console.error('[LiquidEther] THREE not loaded'); return; }

    initLiquidEther();

    function initLiquidEther() {

        /* ═══════════════════════════════════════════════════════════
           SHADER SOURCES (from React LiquidEther)
        ═══════════════════════════════════════════════════════════ */
        const face_vert = `
            attribute vec3 position;
            uniform vec2 px;
            uniform vec2 boundarySpace;
            varying vec2 uv;
            precision highp float;
            void main(){
                vec3 pos = position;
                vec2 scale = 1.0 - boundarySpace * 2.0;
                pos.xy = pos.xy * scale;
                uv = vec2(0.5)+(pos.xy)*0.5;
                gl_Position = vec4(pos, 1.0);
            }
        `;

        const line_vert = `
            attribute vec3 position;
            uniform vec2 px;
            precision highp float;
            varying vec2 uv;
            void main(){
                vec3 pos = position;
                uv = 0.5 + pos.xy * 0.5;
                vec2 n = sign(pos.xy);
                pos.xy = abs(pos.xy) - px * 1.0;
                pos.xy *= n;
                gl_Position = vec4(pos, 1.0);
            }
        `;

        const mouse_vert = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform vec2 center;
            uniform vec2 scale;
            uniform vec2 px;
            varying vec2 vUv;
            void main(){
                vec2 pos = position.xy * scale * 2.0 * px + center;
                vUv = uv;
                gl_Position = vec4(pos, 0.0, 1.0);
            }
        `;

        const advection_frag = `
            precision highp float;
            uniform sampler2D velocity;
            uniform float dt;
            uniform bool isBFECC;
            uniform vec2 fboSize;
            uniform vec2 px;
            uniform float time;
            varying vec2 uv;
            void main(){
                vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
                // Subtle continuous background drift so it's never dead
                vec2 bgDrift = vec2(
                    sin(uv.y * 3.14159 + time * 0.6) * 0.012,
                    cos(uv.x * 3.14159 + time * 0.4) * 0.012
                );
                vec2 vel = texture2D(velocity, uv).xy + bgDrift;
                if(isBFECC == false){
                    vec2 uv2 = uv - vel * dt * ratio;
                    vec2 newVel = texture2D(velocity, uv2).xy + bgDrift;
                    gl_FragColor = vec4(newVel, 0.0, 0.0);
                } else {
                    vec2 spot_new = uv;
                    vec2 vel_old = texture2D(velocity, uv).xy + bgDrift;
                    vec2 spot_old = spot_new - vel_old * dt * ratio;
                    vec2 vel_new1 = texture2D(velocity, spot_old).xy + bgDrift;
                    vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
                    vec2 error = spot_new2 - spot_new;
                    vec2 spot_new3 = spot_new - error / 2.0;
                    vec2 vel_2 = texture2D(velocity, spot_new3).xy + bgDrift;
                    vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
                    vec2 newVel2 = texture2D(velocity, spot_old2).xy + bgDrift;
                    gl_FragColor = vec4(newVel2, 0.0, 0.0);
                }
            }
        `;

        const color_frag = `
            precision highp float;
            uniform sampler2D velocity;
            uniform sampler2D palette;
            uniform vec4 bgColor;
            varying vec2 uv;
            void main(){
                vec2 vel = texture2D(velocity, uv).xy;
                float lenv = length(vel);
                // Non-linear map: amplify the display range so more screen lights up
                float lenvV = clamp(pow(lenv, 0.5) * 3.5, 0.0, 1.0);
                vec3 c = texture2D(palette, vec2(lenvV, 0.5)).rgb;
                // Screen blend against white background — vivid, never muddy
                vec3 outRGB = 1.0 - (1.0 - c) * (1.0 - bgColor.rgb);
                // Even near-zero velocity gets a soft base glow so fluid is always visible
                float alpha = clamp(0.20 + lenv * 1.8, 0.18, 0.92);
                gl_FragColor = vec4(outRGB, alpha);
            }
        `;

        const divergence_frag = `
            precision highp float;
            uniform sampler2D velocity;
            uniform float dt;
            uniform vec2 px;
            varying vec2 uv;
            void main(){
                float x0 = texture2D(velocity, uv-vec2(px.x, 0.0)).x;
                float x1 = texture2D(velocity, uv+vec2(px.x, 0.0)).x;
                float y0 = texture2D(velocity, uv-vec2(0.0, px.y)).y;
                float y1 = texture2D(velocity, uv+vec2(0.0, px.y)).y;
                float divergence = (x1 - x0 + y1 - y0) / 2.0;
                gl_FragColor = vec4(divergence / dt);
            }
        `;

        const externalForce_frag = `
            precision highp float;
            uniform vec2 force;
            uniform vec2 center;
            uniform vec2 scale;
            uniform vec2 px;
            varying vec2 vUv;
            void main(){
                vec2 circle = (vUv - 0.5) * 2.0;
                float d = 1.0 - min(length(circle), 1.0);
                d *= d;
                gl_FragColor = vec4(force * d, 0.0, 1.0);
            }
        `;

        const poisson_frag = `
            precision highp float;
            uniform sampler2D pressure;
            uniform sampler2D divergence;
            uniform vec2 px;
            varying vec2 uv;
            void main(){
                float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
                float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
                float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
                float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
                float div = texture2D(divergence, uv).r;
                float newP = (p0 + p1 + p2 + p3) / 4.0 - div;
                gl_FragColor = vec4(newP);
            }
        `;

        const pressure_frag = `
            precision highp float;
            uniform sampler2D pressure;
            uniform sampler2D velocity;
            uniform vec2 px;
            uniform float dt;
            varying vec2 uv;
            void main(){
                float step = 1.0;
                float p0 = texture2D(pressure, uv + vec2(px.x * step, 0.0)).r;
                float p1 = texture2D(pressure, uv - vec2(px.x * step, 0.0)).r;
                float p2 = texture2D(pressure, uv + vec2(0.0, px.y * step)).r;
                float p3 = texture2D(pressure, uv - vec2(0.0, px.y * step)).r;
                vec2 v = texture2D(velocity, uv).xy;
                vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
                v = v - gradP * dt;
                gl_FragColor = vec4(v, 0.0, 1.0);
            }
        `;

        const viscous_frag = `
            precision highp float;
            uniform sampler2D velocity;
            uniform sampler2D velocity_new;
            uniform float v;
            uniform vec2 px;
            uniform float dt;
            varying vec2 uv;
            void main(){
                vec2 old = texture2D(velocity, uv).xy;
                vec2 new0 = texture2D(velocity_new, uv + vec2(px.x * 2.0, 0.0)).xy;
                vec2 new1 = texture2D(velocity_new, uv - vec2(px.x * 2.0, 0.0)).xy;
                vec2 new2 = texture2D(velocity_new, uv + vec2(0.0, px.y * 2.0)).xy;
                vec2 new3 = texture2D(velocity_new, uv - vec2(0.0, px.y * 2.0)).xy;
                vec2 newv = 4.0 * old + v * dt * (new0 + new1 + new2 + new3);
                newv /= 4.0 * (1.0 + v * dt);
                gl_FragColor = vec4(newv, 0.0, 0.0);
            }
        `;

        /* ═══════════════════════════════════════════════════════════
           CLASSES
        ═══════════════════════════════════════════════════════════ */

        // Common singleton
        const Common = {
            width: 0, height: 0, aspect: 1, pixelRatio: 1,
            container: null, renderer: null, clock: null,
            time: 0, delta: 0,

            init(container) {
                this.container = container;
                this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
                this.resize();
                this.renderer = new THREE.WebGLRenderer({
                    antialias: true, alpha: true, canvas: canvas
                });
                this.renderer.autoClear = false;
                this.renderer.setClearColor(new THREE.Color(0x000000), 0);
                this.renderer.setPixelRatio(this.pixelRatio);
                this.renderer.setSize(this.width, this.height);
                this.clock = new THREE.Clock();
                this.clock.start();
            },
            resize() {
                if (!this.container) return;
                const rect = this.container.getBoundingClientRect();
                this.width = Math.max(1, Math.floor(rect.width));
                this.height = Math.max(1, Math.floor(rect.height));
                this.aspect = this.width / this.height;
                if (this.renderer) {
                    this.renderer.setSize(this.width, this.height, false);
                }
            },
            update() {
                this.delta = this.clock.getDelta();
                this.time += this.delta;
            }
        };

        // Mouse handler
        const Mouse = {
            coords: new THREE.Vector2(),
            coords_old: new THREE.Vector2(),
            diff: new THREE.Vector2(),
            isHoverInside: false,
            hasUserControl: false,
            isAutoActive: false,
            takeoverActive: false,
            takeoverStartTime: 0,
            takeoverDuration: CFG.takeoverDuration,
            takeoverFrom: new THREE.Vector2(),
            takeoverTo: new THREE.Vector2(),
            onInteract: null,
            lastInteract: performance.now(),

            init(container) {
                this.container = container;
                const onMove = (e) => {
                    this.updateHoverState(e.clientX, e.clientY);
                    if (!this.isHoverInside) return;
                    if (this.onInteract) this.onInteract();
                    if (this.isAutoActive && !this.hasUserControl && !this.takeoverActive) {
                        this.startTakeover(e.clientX, e.clientY);
                        return;
                    }
                    this.setCoords(e.clientX, e.clientY);
                    this.hasUserControl = true;
                };
                const onTouch = (e) => {
                    if (e.touches.length !== 1) return;
                    const t = e.touches[0];
                    this.updateHoverState(t.clientX, t.clientY);
                    if (!this.isHoverInside) return;
                    if (this.onInteract) this.onInteract();
                    this.setCoords(t.clientX, t.clientY);
                    this.hasUserControl = true;
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('touchstart', onTouch, { passive: true });
                window.addEventListener('touchmove', onTouch, { passive: true });
            },
            updateHoverState(x, y) {
                const r = this.container.getBoundingClientRect();
                this.isHoverInside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
                return this.isHoverInside;
            },
            setCoords(x, y) {
                const r = this.container.getBoundingClientRect();
                const nx = (x - r.left) / r.width;
                const ny = (y - r.top) / r.height;
                this.coords.set(nx * 2 - 1, -(ny * 2 - 1));
            },
            startTakeover(x, y) {
                this.takeoverFrom.copy(this.coords);
                const r = this.container.getBoundingClientRect();
                const nx = (x - r.left) / r.width;
                const ny = (y - r.top) / r.height;
                this.takeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
                this.takeoverStartTime = performance.now();
                this.takeoverActive = true;
                this.hasUserControl = true;
                this.isAutoActive = false;
            },
            update() {
                if (this.takeoverActive) {
                    const t = (performance.now() - this.takeoverStartTime) / (this.takeoverDuration * 1000);
                    if (t >= 1) {
                        this.takeoverActive = false;
                        this.coords.copy(this.takeoverTo);
                        this.coords_old.copy(this.coords);
                        this.diff.set(0, 0);
                    } else {
                        const k = t * t * (3 - 2 * t);
                        this.coords.lerpVectors(this.takeoverFrom, this.takeoverTo, k);
                    }
                }
                this.diff.subVectors(this.coords, this.coords_old);
                this.coords_old.copy(this.coords);
                if (this.coords_old.x === 0 && this.coords_old.y === 0) this.diff.set(0, 0);
                if (this.isAutoActive && !this.takeoverActive) {
                    this.diff.multiplyScalar(CFG.autoIntensity);
                }
            }
        };

        // Auto driver
        class AutoDriver {
            constructor() {
                this.active = false;
                this.current = new THREE.Vector2(0, 0);
                this.target = new THREE.Vector2();
                this.lastTime = performance.now();
                this.activationTime = 0;
                this.margin = 0.2;
                this.pickTarget();
            }
            pickTarget() {
                this.target.set(
                    (Math.random() * 2 - 1) * (1 - this.margin),
                    (Math.random() * 2 - 1) * (1 - this.margin)
                );
            }
            stop() {
                this.active = false;
                Mouse.isAutoActive = false;
            }
            update() {
                if (!CFG.autoDemo) return;
                const now = performance.now();
                const idle = now - Mouse.lastInteract;
                if (idle < CFG.autoResumeDelay || Mouse.isHoverInside) {
                    if (this.active) this.stop();
                    return;
                }
                if (!this.active) {
                    this.active = true;
                    this.current.copy(Mouse.coords);
                    this.lastTime = now;
                    this.activationTime = now;
                }
                Mouse.isAutoActive = true;
                let dt = (now - this.lastTime) / 1000;
                this.lastTime = now;
                if (dt > 0.2) dt = 0.016;
                const dir = new THREE.Vector2().subVectors(this.target, this.current);
                const dist = dir.length();
                if (dist < 0.01) { this.pickTarget(); return; }
                dir.normalize();
                let ramp = 1;
                if (CFG.autoRampDuration > 0) {
                    const t = Math.min(1, (now - this.activationTime) / (CFG.autoRampDuration * 1000));
                    ramp = t * t * (3 - 2 * t);
                }
                const step = CFG.autoSpeed * dt * ramp;
                const move = Math.min(step, dist);
                this.current.addScaledVector(dir, move);
                Mouse.coords.copy(this.current);
            }
        }

        // ShaderPass base
        class ShaderPass {
            constructor(props) {
                this.props = props || {};
                this.uniforms = this.props.material?.uniforms;
                this.scene = new THREE.Scene();
                this.camera = new THREE.Camera();
                if (this.uniforms) {
                    this.material = new THREE.RawShaderMaterial(this.props.material);
                    this.geometry = new THREE.PlaneGeometry(2.0, 2.0);
                    this.plane = new THREE.Mesh(this.geometry, this.material);
                    this.scene.add(this.plane);
                }
            }
            update() {
                Common.renderer.setRenderTarget(this.props.output || null);
                Common.renderer.render(this.scene, this.camera);
                Common.renderer.setRenderTarget(null);
            }
        }

        // Simulation passes
        class Advection extends ShaderPass {
            constructor(simProps) {
                super({
                    material: {
                        vertexShader: face_vert,
                        fragmentShader: advection_frag,
                        uniforms: {
                            boundarySpace: { value: simProps.cellScale },
                            px: { value: simProps.cellScale },
                            fboSize: { value: simProps.fboSize },
                            velocity: { value: simProps.src.texture },
                            dt: { value: simProps.dt },
                            isBFECC: { value: true },
                            time: { value: 0.0 }
                        }
                    },
                    output: simProps.dst
                });
                this.uniforms = this.props.material.uniforms;
                this.createBoundary();
            }
            createBoundary() {
                const geo = new THREE.BufferGeometry();
                const verts = new Float32Array([
                    -1,-1,0, -1,1,0, -1,1,0, 1,1,0, 1,1,0, 1,-1,0, 1,-1,0, -1,-1,0
                ]);
                geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
                const mat = new THREE.RawShaderMaterial({
                    vertexShader: line_vert,
                    fragmentShader: advection_frag,
                    uniforms: this.uniforms
                });
                this.line = new THREE.LineSegments(geo, mat);
                this.scene.add(this.line);
            }
            update({ dt, isBounce, BFECC, time }) {
                this.uniforms.time.value = time || 0;
                this.uniforms.dt.value = dt;
                this.line.visible = isBounce;
                this.uniforms.isBFECC.value = BFECC;
                super.update();
            }
        }

        class ExternalForce extends ShaderPass {
            constructor(simProps) {
                super({ output: simProps.dst });
                const geo = new THREE.PlaneGeometry(1, 1);
                const mat = new THREE.RawShaderMaterial({
                    vertexShader: mouse_vert,
                    fragmentShader: externalForce_frag,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    uniforms: {
                        px: { value: simProps.cellScale },
                        force: { value: new THREE.Vector2(0, 0) },
                        center: { value: new THREE.Vector2(0, 0) },
                        scale: { value: new THREE.Vector2(simProps.cursor_size, simProps.cursor_size) }
                    }
                });
                this.mouse = new THREE.Mesh(geo, mat);
                this.scene.add(this.mouse);
            }
            update(props) {
                const fx = (Mouse.diff.x / 2) * props.mouse_force;
                const fy = (Mouse.diff.y / 2) * props.mouse_force;
                const csx = props.cursor_size * props.cellScale.x;
                const csy = props.cursor_size * props.cellScale.y;
                const cx = Math.min(Math.max(Mouse.coords.x, -1 + csx + props.cellScale.x * 2), 1 - csx - props.cellScale.x * 2);
                const cy = Math.min(Math.max(Mouse.coords.y, -1 + csy + props.cellScale.y * 2), 1 - csy - props.cellScale.y * 2);
                const u = this.mouse.material.uniforms;
                u.force.value.set(fx, fy);
                u.center.value.set(cx, cy);
                u.scale.value.set(props.cursor_size, props.cursor_size);
                super.update();
            }
        }

        class Viscous extends ShaderPass {
            constructor(simProps) {
                super({
                    material: {
                        vertexShader: face_vert,
                        fragmentShader: viscous_frag,
                        uniforms: {
                            boundarySpace: { value: simProps.boundarySpace },
                            velocity: { value: simProps.src.texture },
                            velocity_new: { value: simProps.dst_.texture },
                            v: { value: simProps.viscous },
                            px: { value: simProps.cellScale },
                            dt: { value: simProps.dt }
                        }
                    },
                    output: simProps.dst,
                    output0: simProps.dst_,
                    output1: simProps.dst
                });
            }
            update({ viscous, iterations, dt }) {
                this.uniforms.v.value = viscous;
                for (let i = 0; i < iterations; i++) {
                    const fbo_in = (i % 2 === 0) ? this.props.output0 : this.props.output1;
                    const fbo_out = (i % 2 === 0) ? this.props.output1 : this.props.output0;
                    this.uniforms.velocity_new.value = fbo_in.texture;
                    this.props.output = fbo_out;
                    this.uniforms.dt.value = dt;
                    super.update();
                }
                return (iterations % 2 === 0) ? this.props.output0 : this.props.output1;
            }
        }

        class Divergence extends ShaderPass {
            constructor(simProps) {
                super({
                    material: {
                        vertexShader: face_vert,
                        fragmentShader: divergence_frag,
                        uniforms: {
                            boundarySpace: { value: simProps.boundarySpace },
                            velocity: { value: simProps.src.texture },
                            px: { value: simProps.cellScale },
                            dt: { value: simProps.dt }
                        }
                    },
                    output: simProps.dst
                });
            }
            update({ vel }) {
                this.uniforms.velocity.value = vel.texture;
                super.update();
            }
        }

        class Poisson extends ShaderPass {
            constructor(simProps) {
                super({
                    material: {
                        vertexShader: face_vert,
                        fragmentShader: poisson_frag,
                        uniforms: {
                            boundarySpace: { value: simProps.boundarySpace },
                            pressure: { value: simProps.dst_.texture },
                            divergence: { value: simProps.src.texture },
                            px: { value: simProps.cellScale }
                        }
                    },
                    output: simProps.dst,
                    output0: simProps.dst_,
                    output1: simProps.dst
                });
            }
            update({ iterations }) {
                for (let i = 0; i < iterations; i++) {
                    const p_in = (i % 2 === 0) ? this.props.output0 : this.props.output1;
                    const p_out = (i % 2 === 0) ? this.props.output1 : this.props.output0;
                    this.uniforms.pressure.value = p_in.texture;
                    this.props.output = p_out;
                    super.update();
                }
                return (iterations % 2 === 0) ? this.props.output0 : this.props.output1;
            }
        }

        class Pressure extends ShaderPass {
            constructor(simProps) {
                super({
                    material: {
                        vertexShader: face_vert,
                        fragmentShader: pressure_frag,
                        uniforms: {
                            boundarySpace: { value: simProps.boundarySpace },
                            pressure: { value: simProps.src_p.texture },
                            velocity: { value: simProps.src_v.texture },
                            px: { value: simProps.cellScale },
                            dt: { value: simProps.dt }
                        }
                    },
                    output: simProps.dst
                });
            }
            update({ vel, pressure }) {
                this.uniforms.velocity.value = vel.texture;
                this.uniforms.pressure.value = pressure.texture;
                super.update();
            }
        }

        // Simulation
        class Simulation {
            constructor(options) {
                this.options = Object.assign({
                    iterations_poisson: 32, iterations_viscous: 32,
                    mouse_force: 20, resolution: 0.5, cursor_size: 100,
                    viscous: 30, isBounce: false, dt: 0.014,
                    isViscous: false, BFECC: true
                }, options);
                this.fbos = {};
                this.fboSize = new THREE.Vector2();
                this.cellScale = new THREE.Vector2();
                this.boundarySpace = new THREE.Vector2();
                this.init();
            }
            getFloatType() {
                const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
                return isIOS ? THREE.HalfFloatType : THREE.FloatType;
            }
            createFBO(w, h, type, seedVelocity) {
                const opts = {
                    type, depthBuffer: false, stencilBuffer: false,
                    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping
                };
                const rt = new THREE.WebGLRenderTarget(w, h, opts);
                // Seed with initial swirl velocity to avoid black screen
                if (seedVelocity && Common.renderer) {
                    const data = new Float32Array(w * h * 4);
                    for (let i = 0; i < w * h; i++) {
                        const u = (i % w) / w * 2 - 1;
                        const vv = (Math.floor(i / w)) / h * 2 - 1;
                        const angle = Math.atan2(vv, u);
                        const dist = Math.sqrt(u*u + vv*vv);
                        data[i*4]   = -Math.sin(angle) * Math.max(0, 1 - dist) * 3.5;
                        data[i*4+1] =  Math.cos(angle) * Math.max(0, 1 - dist) * 3.5;
                        data[i*4+2] = 0;
                        data[i*4+3] = 1;
                    }
                    const seedTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, type);
                    seedTex.needsUpdate = true;
                    // Render seed texture to FBO
                    const seedScene = new THREE.Scene();
                    const seedCam = new THREE.Camera();
                    const seedMesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2),
                        new THREE.MeshBasicMaterial({ map: seedTex }));
                    seedScene.add(seedMesh);
                    Common.renderer.setRenderTarget(rt);
                    Common.renderer.render(seedScene, seedCam);
                    Common.renderer.setRenderTarget(null);
                    seedTex.dispose();
                }
                return rt;
            }
            init() {
                this.calcSize();
                const type = this.getFloatType();
                this.fbos.vel_0 = this.createFBO(this.fboSize.x, this.fboSize.y, type, true); // seed
                this.fbos.vel_1 = this.createFBO(this.fboSize.x, this.fboSize.y, type, true); // seed
                ['vel_viscous0', 'vel_viscous1', 'div', 'pressure_0', 'pressure_1']
                    .forEach(k => this.fbos[k] = this.createFBO(this.fboSize.x, this.fboSize.y, type, false));

                this.advection = new Advection({
                    cellScale: this.cellScale, fboSize: this.fboSize,
                    dt: this.options.dt, src: this.fbos.vel_0, dst: this.fbos.vel_1
                });
                this.externalForce = new ExternalForce({
                    cellScale: this.cellScale, cursor_size: this.options.cursor_size, dst: this.fbos.vel_1
                });
                this.viscous = new Viscous({
                    cellScale: this.cellScale, boundarySpace: this.boundarySpace,
                    viscous: this.options.viscous, src: this.fbos.vel_1,
                    dst: this.fbos.vel_viscous1, dst_: this.fbos.vel_viscous0, dt: this.options.dt
                });
                this.divergence = new Divergence({
                    cellScale: this.cellScale, boundarySpace: this.boundarySpace,
                    src: this.fbos.vel_viscous0, dst: this.fbos.div, dt: this.options.dt
                });
                this.poisson = new Poisson({
                    cellScale: this.cellScale, boundarySpace: this.boundarySpace,
                    src: this.fbos.div, dst: this.fbos.pressure_1, dst_: this.fbos.pressure_0
                });
                this.pressure = new Pressure({
                    cellScale: this.cellScale, boundarySpace: this.boundarySpace,
                    src_p: this.fbos.pressure_0, src_v: this.fbos.vel_viscous0,
                    dst: this.fbos.vel_0, dt: this.options.dt
                });
            }
            calcSize() {
                const w = Math.max(1, Math.round(this.options.resolution * Common.width));
                const h = Math.max(1, Math.round(this.options.resolution * Common.height));
                this.cellScale.set(1/w, 1/h);
                this.fboSize.set(w, h);
            }
            resize() {
                this.calcSize();
                Object.values(this.fbos).forEach(fbo => fbo.setSize(this.fboSize.x, this.fboSize.y));
            }
            update() {
                this.boundarySpace.copy(this.options.isBounce ? new THREE.Vector2(0,0) : this.cellScale);
                this.advection.update({ dt: this.options.dt, isBounce: this.options.isBounce, BFECC: this.options.BFECC, time: Common.time });
                this.externalForce.update({
                    cursor_size: this.options.cursor_size,
                    mouse_force: this.options.mouse_force,
                    cellScale: this.cellScale
                });
                let vel = this.fbos.vel_1;
                if (this.options.isViscous) {
                    vel = this.viscous.update({
                        viscous: this.options.viscous,
                        iterations: this.options.iterations_viscous,
                        dt: this.options.dt
                    });
                }
                this.divergence.update({ vel });
                const pressure = this.poisson.update({ iterations: this.options.iterations_poisson });
                this.pressure.update({ vel, pressure });
            }
        }

        // Output renderer
        class Output {
            constructor(paletteTex) {
                this.simulation = new Simulation({
                    iterations_poisson: CFG.iterationsPoisson,
                    iterations_viscous: CFG.iterationsViscous,
                    mouse_force: CFG.mouseForce,
                    resolution: CFG.resolution,
                    cursor_size: CFG.cursorSize,
                    viscous: CFG.viscous,
                    isBounce: CFG.isBounce,
                    dt: CFG.dt,
                    isViscous: CFG.isViscous,
                    BFECC: CFG.BFECC
                });
                this.scene = new THREE.Scene();
                this.camera = new THREE.Camera();
                this.mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 2),
                    new THREE.RawShaderMaterial({
                        vertexShader: face_vert,
                        fragmentShader: color_frag,
                        transparent: true,
                        depthWrite: false,
                        blending: THREE.NormalBlending,
                        uniforms: {
                            velocity: { value: this.simulation.fbos.vel_0.texture },
                            boundarySpace: { value: new THREE.Vector2() },
                            palette: { value: paletteTex },
                            bgColor: { value: new THREE.Vector4(1, 1, 1, 0.12) }
                        }
                    })
                );
                this.scene.add(this.mesh);
            }
            resize() { this.simulation.resize(); }
            render() {
                Common.renderer.setRenderTarget(null);
                Common.renderer.render(this.scene, this.camera);
            }
            update() {
                this.simulation.update();
                this.render();
            }
        }

        // Palette texture
        function makePaletteTexture(stops) {
            const arr = (Array.isArray(stops) && stops.length > 0)
                ? (stops.length === 1 ? [stops[0], stops[0]] : stops)
                : ['#ffffff', '#ffffff'];
            const w = 256;
            const data = new Uint8Array(w * 4);
            // Create gradient across 256 pixels
            for (let i = 0; i < w; i++) {
                const t = i / (w - 1);
                // Map t [0,1] to color stops
                const idx = t * (arr.length - 1);
                const i0 = Math.floor(idx);
                const i1 = Math.min(i0 + 1, arr.length - 1);
                const localT = idx - i0;
                const c0 = new THREE.Color(arr[i0]);
                const c1 = new THREE.Color(arr[i1]);
                const r = c0.r + (c1.r - c0.r) * localT;
                const g = c0.g + (c1.g - c0.g) * localT;
                const b = c0.b + (c1.b - c0.b) * localT;
                data[i*4] = Math.round(r * 255);
                data[i*4+1] = Math.round(g * 255);
                data[i*4+2] = Math.round(b * 255);
                data[i*4+3] = 255;
            }
            const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return tex;
        }

        // Main
        const container = document.body;
        Common.init(container);
        Mouse.init(container);
        Mouse.onInteract = () => { Mouse.lastInteract = performance.now(); };

        const paletteTex = makePaletteTexture(CFG.colors);
        const output = new Output(paletteTex);
        const autoDriver = new AutoDriver();

        // Resize handler
        window.addEventListener('resize', () => {
            Common.resize();
            output.resize();
        });

        // Animation loop
        let running = true;
        function loop() {
            if (!running) return;
            requestAnimationFrame(loop);
            autoDriver.update();
            Mouse.update();
            Common.update();
            output.update();
        }
        loop();

        // Visibility
        document.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) loop();
        });

        // IntersectionObserver
        const io = new IntersectionObserver(entries => {
            const visible = entries[0].isIntersecting;
            running = visible && !document.hidden;
            if (running) loop();
        }, { threshold: [0, 0.01, 0.1] });
        io.observe(canvas);
    }
})();
