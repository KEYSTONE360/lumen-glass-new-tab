(() => {
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class LiquidField {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d", { alpha: true });
      this.hue = options.hue ?? 214;
      this.motion = (options.motion ?? 100) / 100;
      this.pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, lastTime: performance.now() };
      this.particles = [];
      this.last = performance.now();
      this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.resize = this.resize.bind(this);
      this.frame = this.frame.bind(this);
      this.onPointer = this.onPointer.bind(this);
      this.onImpulse = this.onImpulse.bind(this);
      this.resize();
      addEventListener("resize", this.resize, { passive: true });
      addEventListener("pointermove", this.onPointer, { passive: true });
      addEventListener("pointerdown", this.onImpulse, { passive: true });
      document.addEventListener("pointerleave", () => { this.pointer.active = false; });
      if (globalThis.chrome?.storage) {
        chrome.storage.onChanged.addListener((changes) => {
          if (changes.motion) this.motion = changes.motion.newValue / 100;
          if (changes.hue) this.hue = changes.hue.newValue;
        });
      }
      if (!this.reduced) requestAnimationFrame(this.frame);
      else this.draw();
    }

    resize() {
      this.width = innerWidth;
      this.height = innerHeight;
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const targetCount = clamp(Math.round((this.width * this.height) / 125000), 7, 15);
      while (this.particles.length < targetCount) this.particles.push(this.createParticle(this.particles.length));
      this.particles.length = targetCount;
    }

    createParticle(index) {
      const radius = Math.min(this.width, this.height) * (.12 + Math.random() * .13);
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - .5) * 58,
        vy: (Math.random() - .5) * 58,
        radius,
        mass: radius * radius,
        phase: Math.random() * TAU,
        hueOffset: (index % 4) * 18 - 24
      };
    }

    onPointer(event) {
      const now = performance.now();
      const elapsed = Math.max(8, now - this.pointer.lastTime);
      this.pointer.vx = (event.clientX - this.pointer.x) / elapsed * 16;
      this.pointer.vy = (event.clientY - this.pointer.y) / elapsed * 16;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
      this.pointer.lastTime = now;
    }

    onImpulse(event) {
      for (const particle of this.particles) {
        const dx = particle.x - event.clientX;
        const dy = particle.y - event.clientY;
        const distance = Math.max(70, Math.hypot(dx, dy));
        const impulse = Math.min(165, 14000 / distance);
        particle.vx += dx / distance * impulse;
        particle.vy += dy / distance * impulse;
      }
    }

    simulate(dt, time) {
      const speed = this.motion;
      for (let i = 0; i < this.particles.length; i += 1) {
        const p = this.particles[i];
        const curlX = Math.sin(time * .00027 + p.phase + p.y * .003) * 38;
        const curlY = Math.cos(time * .00023 + p.phase + p.x * .002) * 38;
        p.vx += curlX * dt * speed;
        p.vy += curlY * dt * speed;
        if (this.pointer.active) {
          const dx = this.pointer.x - p.x;
          const dy = this.pointer.y - p.y;
          const distance = Math.max(80, Math.hypot(dx, dy));
          const contactRadius = p.radius * 1.08;
          if (distance < contactRadius) {
            const pressure = (1 - distance / contactRadius) * 420 * speed;
            p.vx -= dx / distance * pressure * dt;
            p.vy -= dy / distance * pressure * dt;
            p.vx += this.pointer.vx * .24 * speed;
            p.vy += this.pointer.vy * .24 * speed;
          }
        }
        for (let j = i + 1; j < this.particles.length; j += 1) {
          const q = this.particles[j];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const rest = (p.radius + q.radius) * .46;
          if (distance < rest) {
            const force = (rest - distance) * .085 * dt;
            const nx = dx / distance;
            const ny = dy / distance;
            p.vx -= nx * force;
            p.vy -= ny * force;
            q.vx += nx * force;
            q.vy += ny * force;
          } else if (distance < (p.radius + q.radius) * 1.08) {
            const cohesion = (distance - rest) * .008 * dt;
            const nx = dx / distance;
            const ny = dy / distance;
            p.vx += nx * cohesion;
            p.vy += ny * cohesion;
            q.vx -= nx * cohesion;
            q.vy -= ny * cohesion;
            const viscosity = .018 * dt * 60;
            const averageVx = (p.vx + q.vx) * .5;
            const averageVy = (p.vy + q.vy) * .5;
            p.vx += (averageVx - p.vx) * viscosity;
            p.vy += (averageVy - p.vy) * viscosity;
            q.vx += (averageVx - q.vx) * viscosity;
            q.vy += (averageVy - q.vy) * viscosity;
          }
        }
        p.vx *= Math.pow(.982, dt * 60);
        p.vy *= Math.pow(.982, dt * 60);
        p.x += p.vx * dt * speed;
        p.y += p.vy * dt * speed;
        const margin = p.radius * .22;
        if (p.x < -margin || p.x > this.width + margin) { p.vx *= -.82; p.x = clamp(p.x, -margin, this.width + margin); }
        if (p.y < -margin || p.y > this.height + margin) { p.vy *= -.82; p.y = clamp(p.y, -margin, this.height + margin); }
      }
    }

    draw() {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      context.globalCompositeOperation = "screen";
      for (const particle of this.particles) {
        const wobble = 1 + Math.sin(performance.now() * .0012 + particle.phase) * .045;
        const radius = particle.radius * wobble;
        const gradient = context.createRadialGradient(particle.x - radius * .26, particle.y - radius * .32, radius * .025, particle.x, particle.y, radius);
        const hue = (this.hue + particle.hueOffset + 360) % 360;
        gradient.addColorStop(0, `hsla(${hue}, 98%, 88%, .68)`);
        gradient.addColorStop(.24, `hsla(${hue}, 91%, 68%, .46)`);
        gradient.addColorStop(.7, `hsla(${hue + 22}, 82%, 54%, .25)`);
        gradient.addColorStop(1, `hsla(${hue + 30}, 70%, 44%, 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, TAU);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
    }

    frame(now) {
      const dt = Math.min(.034, (now - this.last) / 1000 || .016);
      this.last = now;
      this.simulate(dt, now);
      this.draw();
      requestAnimationFrame(this.frame);
    }
  }

  globalThis.LiquidPhysics = { mount(canvas, options) { return canvas ? new LiquidField(canvas, options) : null; } };
})();
