(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = (a_position + 1.0) * 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform vec2 u_pointer;
    uniform vec2 u_velocity;
    uniform vec2 u_click;
    uniform float u_clickAge;
    uniform float u_time;
    uniform float u_motion;
    uniform float u_refraction;
    uniform float u_imageAspect;

    vec2 coverUv(vec2 uv) {
      float screenAspect = u_resolution.x / max(u_resolution.y, 1.0);
      if (screenAspect > u_imageAspect) {
        uv.y = (uv.y - 0.5) * (u_imageAspect / screenAspect) + 0.5;
      } else {
        uv.x = (uv.x - 0.5) * (screenAspect / u_imageAspect) + 0.5;
      }
      return uv;
    }

    void main() {
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 pointer = vec2(u_pointer.x, 1.0 - u_pointer.y);
      vec2 delta = v_uv - pointer;
      delta.x *= aspect;
      float distanceToPointer = length(delta);
      vec2 direction = delta / max(distanceToPointer, 0.0001);
      direction.x /= aspect;
      float speed = clamp(length(u_velocity), 0.0, 2.4);
      float contact = exp(-distanceToPointer * distanceToPointer * 13.0);
      float distortion = clamp(u_refraction * 1.9, 0.45, 3.2);
      float pressure = (0.017 + speed * 0.014) * contact * distortion;
      float wake = sin(distanceToPointer * 42.0 - u_time * 4.2) * exp(-distanceToPointer * 6.2) * (0.003 + speed * 0.0045) * u_motion * distortion;

      vec2 clickDelta = v_uv - vec2(u_click.x, 1.0 - u_click.y);
      clickDelta.x *= aspect;
      float clickDistance = length(clickDelta);
      vec2 clickDirection = clickDelta / max(clickDistance, 0.0001);
      clickDirection.x /= aspect;
      float clickEnvelope = exp(-u_clickAge * 1.8) * exp(-clickDistance * 4.0);
      float clickWave = sin(clickDistance * 64.0 - u_clickAge * 12.0) * 0.015 * clickEnvelope * distortion;

      vec2 warped = v_uv;
      warped -= direction * (pressure + wake);
      warped += clickDirection * clickWave;
      warped += (pointer - 0.5) * 0.026 * u_motion;
      warped += vec2(
        sin(v_uv.y * 8.0 + u_time * 0.34),
        cos(v_uv.x * 7.0 - u_time * 0.29)
      ) * 0.00125 * u_motion;

      vec2 sampleUv = coverUv(warped);
      float chroma = contact * (0.0018 + speed * 0.0022) * distortion;
      vec4 base = texture2D(u_texture, sampleUv);
      float red = texture2D(u_texture, sampleUv + direction * chroma).r;
      float blue = texture2D(u_texture, sampleUv - direction * chroma).b;
      gl_FragColor = vec4(red, base.g, blue, 1.0);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  class WallpaperField {
    constructor(canvas, imageUrl, options = {}) {
      this.canvas = canvas;
      this.gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "high-performance" });
      if (!this.gl) return;
      this.motion = (options.motion ?? 100) / 100;
      this.refraction = (options.refraction ?? 28) / 28;
      this.target = { x: .5, y: .5 };
      this.position = { x: .5, y: .5 };
      this.velocity = { x: 0, y: 0 };
      this.click = { x: .5, y: .5, time: -100000 };
      this.last = performance.now();
      this.start = this.last;
      this.ready = false;
      this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.frame = this.frame.bind(this);
      this.setupProgram();
      this.resize();
      this.loadTexture(imageUrl);
      addEventListener("resize", () => this.resize(), { passive: true });
      addEventListener("pointermove", (event) => {
        this.target.x = event.clientX / innerWidth;
        this.target.y = event.clientY / innerHeight;
      }, { passive: true });
      addEventListener("pointerdown", (event) => {
        this.click.x = event.clientX / innerWidth;
        this.click.y = event.clientY / innerHeight;
        this.click.time = performance.now();
        this.velocity.x += (this.target.x - .5) * .34;
        this.velocity.y += (this.target.y - .5) * .34;
      }, { passive: true });
      document.addEventListener("pointerleave", () => { this.target.x = .5; this.target.y = .5; });
      if (globalThis.chrome?.storage) chrome.storage.onChanged.addListener((changes) => {
        if (changes.motion) this.motion = changes.motion.newValue / 100;
        if (changes.refraction) this.refraction = changes.refraction.newValue / 28;
      });
      requestAnimationFrame(this.frame);
    }

    setupProgram() {
      const gl = this.gl;
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      ["resolution", "pointer", "velocity", "click", "clickAge", "time", "motion", "refraction", "imageAspect"].forEach((name) => {
        this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      });
      gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
    }

    loadTexture(url) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        this.imageAspect = image.naturalWidth / image.naturalHeight;
        this.ready = true;
      };
      image.src = url;
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(innerWidth * dpr);
      this.canvas.height = Math.round(innerHeight * dpr);
      this.canvas.style.width = `${innerWidth}px`;
      this.canvas.style.height = `${innerHeight}px`;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    simulate(dt) {
      const stiffness = this.reduced ? 90 : 44;
      const damping = this.reduced ? 20 : 11.8;
      const accelerationX = stiffness * (this.target.x - this.position.x) - damping * this.velocity.x;
      const accelerationY = stiffness * (this.target.y - this.position.y) - damping * this.velocity.y;
      this.velocity.x += accelerationX * dt;
      this.velocity.y += accelerationY * dt;
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.x = clamp(this.position.x, -.08, 1.08);
      this.position.y = clamp(this.position.y, -.08, 1.08);
    }

    frame(now) {
      const dt = Math.min(.033, (now - this.last) / 1000 || .016);
      this.last = now;
      this.simulate(dt);
      if (this.ready) {
        const gl = this.gl;
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uniforms.pointer, this.position.x, this.position.y);
        gl.uniform2f(this.uniforms.velocity, this.velocity.x, this.velocity.y);
        gl.uniform2f(this.uniforms.click, this.click.x, this.click.y);
        gl.uniform1f(this.uniforms.clickAge, (now - this.click.time) / 1000);
        gl.uniform1f(this.uniforms.time, (now - this.start) / 1000);
        gl.uniform1f(this.uniforms.motion, this.reduced ? 0 : this.motion);
        gl.uniform1f(this.uniforms.refraction, this.refraction);
        gl.uniform1f(this.uniforms.imageAspect, this.imageAspect);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      requestAnimationFrame(this.frame);
    }
  }

  globalThis.WallpaperPhysics = { mount(canvas, imageUrl, options) { return canvas ? new WallpaperField(canvas, imageUrl, options) : null; } };
})();
