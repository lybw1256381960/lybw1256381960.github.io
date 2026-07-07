/**
 * LiquidEther - Fluid Background Animation
 * Based on React Bits (reactbits.dev) LiquidEther component
 */

(function() {
    'use strict';

    const config = {
        colors: ['#c0eef5', '#b8e8e0', '#d0f0ee', '#e8f8f5'],
        backgroundColor: '#f5fdfc',
        mouseForce: 40,
        cursorSize: 15,
        resolution: 0.5,
        autoSpeed: 0.3,
        autoIntensity: 0.6
    };

    // Vertex Shader
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    // Fragment Shader
    const fragmentShader = `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uMouseForce;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec3 uColor4;
        uniform vec3 uBgColor;
        
        varying vec2 vUv;
        
        // Simplex noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        
        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                               -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                                   dot(x12.zw,x12.zw)), 0.0);
            m = m*m; m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x = a0.x * x0.x + h.x * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }
        
        float fbm(vec2 p) {
            float value = 0.0;
            float amp = 0.4;
            float freq = 1.0;
            for (int i = 0; i < 4; i++) {
                value += amp * snoise(p * freq);
                amp *= 0.5;
                freq *= 1.8;
            }
            return value;
        }
        
        void main() {
            vec2 uv = vUv;
            vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
            float time = uTime * 0.08;
            float stretch = 0.6;
            
            // Base terrain
            vec2 q = vec2(0.0);
            q.x = fbm(uv * stretch + time * 0.3);
            q.y = fbm(uv * stretch + vec2(0.7));
            vec2 r = vec2(0.0);
            r.x = fbm(uv * stretch + q + vec2(1.7, 9.2) + time * 0.2);
            r.y = fbm(uv * stretch + q + vec2(8.3, 2.8) + time * 0.25);
            float f = fbm(uv * stretch + r + time * 0.15);
            
            // ─── Mouse interaction: directional ripple ──────────────────
            vec2 mouseUv = uMouse / uResolution;
            vec2 dir = uv - mouseUv;
            float dist = length(dir * aspect);
            
            // Concentric ripple from mouse
            float ripple = sin(dist * 20.0 - uTime * 4.0) * 0.15;
            
            // Directional push: fluid "flows away" from cursor
            float dirPush = sin(atan(dir.y, dir.x) + uTime * 2.0) * 0.1;
            
            // Falloff: smooth circle around cursor
            float falloff = smoothstep(0.35, 0.0, dist) * uMouseForce * 0.003;
            
            // Combine mouse effect into the intensity
            float mouseEffect = (ripple + dirPush) * falloff * 5.0;
            f += mouseEffect;
            
            // ─── Color mapping ─────────────────────────────────────────
            float intensity = smoothstep(-0.4, 0.8, f);
            
            vec3 color = uBgColor;
            color = mix(color, uColor1, smoothstep(0.0, 0.5, intensity) * 0.6);
            color = mix(color, uColor2, smoothstep(0.3, 0.7, intensity) * 0.5);
            color = mix(color, uColor3, smoothstep(0.5, 0.9, intensity) * 0.3);
            color = mix(color, uColor4, smoothstep(0.7, 1.0, intensity) * 0.12);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `;

    // Initialize
    function init() {
        const canvas = document.getElementById('liquid-ether-canvas');
        if (!canvas) {
            console.error('LiquidEther: Canvas not found');
            return;
        }

        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            console.error('LiquidEther: WebGL not supported');
            return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false
        });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255
            } : { r: 0, g: 0, b: 0 };
        }

        const colors = config.colors.map(hexToRgb);
        const bgColor = hexToRgb(config.backgroundColor);

        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                uMouse: { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2) },
                uMouseForce: { value: config.mouseForce },
                uColor1: { value: new THREE.Vector3(colors[0].r, colors[0].g, colors[0].b) },
                uColor2: { value: new THREE.Vector3(colors[1].r, colors[1].g, colors[1].b) },
                uColor3: { value: new THREE.Vector3(colors[2].r, colors[2].g, colors[2].b) },
                uColor4: { value: new THREE.Vector3(colors[3].r, colors[3].g, colors[3].b) },
                uBgColor: { value: new THREE.Vector3(bgColor.r, bgColor.g, bgColor.b) }
            }
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Mouse with smooth follow
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let targetMouseX = mouseX;
        let targetMouseY = mouseY;

        // Track actual coordinates (not flipped for the shader)
        // uMouse is already received as screen coords where Y=0 is bottom
        document.addEventListener('mousemove', (e) => {
            targetMouseX = e.clientX;
            targetMouseY = window.innerHeight - e.clientY;
        }, { passive: true });

        // Touch
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                targetMouseX = e.touches[0].clientX;
                targetMouseY = window.innerHeight - e.touches[0].clientY;
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        }, { passive: true });

        // Animation
        let animationId;
        let isVisible = true;
        
        function animate() {
            if (!isVisible) return;
            animationId = requestAnimationFrame(animate);
            
            // Smooth follow (lerp)
            mouseX += (targetMouseX - mouseX) * 0.08;
            mouseY += (targetMouseY - mouseY) * 0.08;
            
            material.uniforms.uTime.value += 0.016;
            material.uniforms.uMouse.value.set(mouseX, mouseY);
            
            renderer.render(scene, camera);
        }

        document.addEventListener('visibilitychange', () => {
            isVisible = !document.hidden;
            if (isVisible) animate();
            else cancelAnimationFrame(animationId);
        });

        animate();
        console.log('LiquidEther: Initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
