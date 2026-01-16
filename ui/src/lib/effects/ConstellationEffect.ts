export class ConstellationEffect {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private particles: Particle[] = [];
  private animationId: number = 0;
  private mouseX: number = -1000;
  private mouseY: number = -1000;

  // Configuration
  private readonly particleCount = 100;
  private readonly connectionDistance = 150;
  private readonly particleSpeed = 0.5;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true })!;

    // Bind methods
    this.animate = this.animate.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);

    // Initial setup
    this.resize(window.innerWidth, window.innerHeight);
    this.initParticles();

    // Mouse interaction
    window.addEventListener("mousemove", this.handleMouseMove);

    // Start animation
    this.animate();
  }

  resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.scale(dpr, dpr);

    // Re-initialize if screen size changes significantly to maintain density
    if (this.particles.length === 0) {
      this.initParticles();
    }
  }

  private initParticles() {
    this.particles = [];
    // Adjust density based on screen area
    const area = this.width * this.height;
    const density = Math.floor(area / 15000); // 1 particle per 15000px²
    const count = Math.min(Math.max(density, 50), 200); // Clamp between 50 and 200

    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(this.width, this.height, this.particleSpeed));
    }
  }

  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update and draw particles
    this.particles.forEach((p) => {
      p.update(this.width, this.height);
      p.draw(this.ctx);
    });

    // Draw lines
    this.drawConnections();

    this.animationId = requestAnimationFrame(this.animate);
  }

  private drawConnections() {
    this.ctx.lineWidth = 1;

    for (let i = 0; i < this.particles.length; i++) {
      const p1 = this.particles[i];

      // Connect to mouse if close
      const distMouse = Math.hypot(p1.x - this.mouseX, p1.y - this.mouseY);
      if (distMouse < this.connectionDistance + 50) {
        const alpha = 1 - distMouse / (this.connectionDistance + 50);
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`; // Brighter near mouse
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(this.mouseX, this.mouseY);
        this.ctx.stroke();

        // Gently attract to mouse
        if (distMouse > 10) {
          p1.x += (this.mouseX - p1.x) * 0.005;
          p1.y += (this.mouseY - p1.y) * 0.005;
        }
      }

      // Connect to other particles
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

        if (dist < this.connectionDistance) {
          const alpha = 1 - dist / this.connectionDistance;
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.15})`;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("mousemove", this.handleMouseMove);
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;

  constructor(w: number, h: number, speed: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * speed;
    this.vy = (Math.random() - 0.5) * speed;
    this.size = Math.random() * 2 + 1;
  }

  update(w: number, h: number) {
    this.x += this.vx;
    this.y += this.vy;

    // Bounce off walls
    if (this.x < 0 || this.x > w) this.vx *= -1;
    if (this.y < 0 || this.y > h) this.vy *= -1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}
