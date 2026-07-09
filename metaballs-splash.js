/**
 * Metaballs Liquid Splash - 液态分子球开屏动画
 * 使用距离场融合球体形成有机液态形态
 */
(function() {
  'use strict';

  const CONFIG = {
    BLOB_COUNT: 5,
    THRESHOLD: 0.8,
    SMOOTHNESS: 0.35,
    BASE_SPEED: 0.4,
    MOUSE_INFLUENCE: 0.15,
    COLORS: {
      primary: [0.0, 0.8, 0.9],    // 青色 #00ccff
      secondary: [0.0, 0.9, 0.77], // 蓝绿 #00e8c4
      tertiary: [0.0, 0.6, 0.75],  // 深蓝绿 #0099bf
      highlight: [0.5, 1.0, 1.0]   // 高光
    }
  };

  const canvas = document.getElementById('splash-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    console.warn('WebGL not supported, falling back to CSS animation');
    return;
  }

  // Resize handling
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Vertex shader
  const vertexSource = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  // Fragment shader - Metaballs with organic distortion
  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform vec3 u_blob0;
    uniform vec3 u_blob1;
    uniform vec3 u_blob2;
    uniform vec3 u_blob3;
    uniform vec3 u_blob4;

    // Simplex noise for organic distortion
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
      m = m*m;
      m = m*m;
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

    float metaball(vec2 uv, vec3 blob) {
      float d = length(uv - blob.xy);
      return blob.z / (d * d + 0.0001);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
      uv = (uv - 0.5) * aspect + 0.5;

      // Mouse influence
      vec2 mouse = u_mouse / u_resolution;
      mouse = (mouse - 0.5) * aspect + 0.5;

      // Calculate metaball field
      float field = 0.0;
      field += metaball(uv, vec3(u_blob0.xy, u_blob0.z));
      field += metaball(uv, vec3(u_blob1.xy, u_blob1.z));
      field += metaball(uv, vec3(u_blob2.xy, u_blob2.z));
      field += metaball(uv, vec3(u_blob3.xy, u_blob3.z));
      field += metaball(uv, vec3(u_blob4.xy, u_blob4.z));

      // Add mouse blob
      float mouseBlob = 0.15 / (length(uv - mouse) * length(uv - mouse) + 0.001);
      field += mouseBlob * 0.3;

      // Organic distortion using noise
      float noise1 = snoise(uv * 3.0 + u_time * 0.2) * 0.15;
      float noise2 = snoise(uv * 5.0 - u_time * 0.15) * 0.08;
      field += noise1 + noise2;

      // Threshold for liquid edge
      float threshold = 0.8;
      float edge = 0.15;
      float alpha = smoothstep(threshold - edge, threshold + edge, field);

      // Color gradient based on field intensity
      vec3 color1 = vec3(0.0, 0.8, 0.9);   // Cyan
      vec3 color2 = vec3(0.0, 0.9, 0.77);  // Teal
      vec3 color3 = vec3(0.0, 0.6, 0.75);  // Deep teal
      vec3 highlight = vec3(0.6, 1.0, 1.0); // Bright highlight

      float colorMix = smoothstep(0.5, 1.5, field);
      vec3 baseColor = mix(color1, color2, colorMix);
      baseColor = mix(baseColor, color3, smoothstep(1.0, 2.0, field));

      // Specular highlight
      float specular = pow(max(0.0, field - 0.5), 3.0) * 0.4;
      baseColor += highlight * specular;

      // Fresnel-like edge glow
      float fresnel = pow(1.0 - alpha, 2.0) * 0.5;
      baseColor += vec3(0.0, 0.95, 0.9) * fresnel;

      // Output with alpha
      gl_FragColor = vec4(baseColor, alpha * 0.95);
    }
  `;

  // Compile shader
  function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  // Setup geometry (full screen quad)
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    blob0: gl.getUniformLocation(program, 'u_blob0'),
    blob1: gl.getUniformLocation(program, 'u_blob1'),
    blob2: gl.getUniformLocation(program, 'u_blob2'),
    blob3: gl.getUniformLocation(program, 'u_blob3'),
    blob4: gl.getUniformLocation(program, 'u_blob4')
  };

  // Blob state
  const blobs = [
    { x: 0.3, y: 0.5, r: 0.08, vx: 0.003, vy: 0.002, phase: 0 },
    { x: 0.7, y: 0.4, r: 0.06, vx: -0.002, vy: 0.003, phase: 1 },
    { x: 0.5, y: 0.6, r: 0.07, vx: 0.002, vy: -0.002, phase: 2 },
    { x: 0.4, y: 0.3, r: 0.05, vx: -0.003, vy: -0.001, phase: 3 },
    { x: 0.6, y: 0.7, r: 0.04, vx: 0.001, vy: 0.002, phase: 4 }
  ];

  let mouseX = canvas.width / 2;
  let mouseY = canvas.height / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  document.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX * (canvas.width / window.innerWidth);
    targetMouseY = (window.innerHeight - e.clientY) * (canvas.height / window.innerHeight);
  }, { passive: true });

  // Animation loop
  let startTime = performance.now();
  let animationId;

  function animate() {
    const time = (performance.now() - startTime) / 1000;

    // Smooth mouse follow
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;

    // Update blob positions with organic movement
    blobs.forEach((blob, i) => {
      const angle = time * CONFIG.BASE_SPEED + blob.phase * 1.2;
      const radius = 0.15 + Math.sin(time * 0.3 + blob.phase) * 0.05;

      blob.x = 0.5 + Math.cos(angle) * radius + Math.sin(time * 0.5 + blob.phase * 2) * 0.08;
      blob.y = 0.5 + Math.sin(angle * 0.7) * radius * 0.6 + Math.cos(time * 0.4 + blob.phase) * 0.06;

      // Add subtle oscillation
      blob.r = 0.06 + Math.sin(time * 0.8 + blob.phase * 3) * 0.015;
    });

    // Set uniforms
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform2f(uniforms.mouse, mouseX, mouseY);

    // Upload blob data
    const aspect = canvas.width / canvas.height;
    gl.uniform3f(uniforms.blob0, blobs[0].x * aspect, blobs[0].y, blobs[0].r);
    gl.uniform3f(uniforms.blob1, blobs[1].x * aspect, blobs[1].y, blobs[1].r);
    gl.uniform3f(uniforms.blob2, blobs[2].x * aspect, blobs[2].y, blobs[2].r);
    gl.uniform3f(uniforms.blob3, blobs[3].x * aspect, blobs[3].y, blobs[3].r);
    gl.uniform3f(uniforms.blob4, blobs[4].x * aspect, blobs[4].y, blobs[4].r);

    // Clear and draw
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationId = requestAnimationFrame(animate);
  }

  animate();

  // Cleanup on splash hide
  window.addEventListener('splashHidden', () => {
    cancelAnimationFrame(animationId);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteBuffer(buffer);
  }, { once: true });

})();
