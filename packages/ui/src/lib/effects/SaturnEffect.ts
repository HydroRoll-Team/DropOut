/**
 * Ported SaturnEffect for the React UI (ui-new).
 * Adapted from the original Svelte implementation but written as a standalone
 * TypeScript class that manages a 2D canvas particle effect resembling a
 * rotating "Saturn" with rings. Designed to be instantiated and controlled
 * from a React component (e.g. ParticleBackground).
 *
 * Usage:
 *   const effect = new SaturnEffect(canvasElement);
 *   effect.handleMouseDown(clientX);
 *   effect.handleMouseMove(clientX);
 *   effect.handleMouseUp();
 *   // on resize:
 *   effect.resize(width, height);
 *   // on unmount:
 *   effect.destroy();
 */

export class SaturnEffect {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Particle storage
  private xyz: Float32Array | null = null; // interleaved x,y,z
  private types: Uint8Array | null = null; // 0 = planet, 1 = ring
  private count = 0;

  // Animation
  private animationId = 0;
  private angle = 0;
  private scaleFactor = 1;

  // Interaction
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseTime = 0;
  private mouseVelocities: number[] = [];

  // Speed control
  private readonly baseSpeed = 0.005;
  private currentSpeed = 0.005;
  private rotationDirection = 1;
  private readonly speedDecayRate = 0.992;
  private readonly minSpeedMultiplier = 1;
  private readonly maxSpeedMultiplier = 50;
  private isStopped = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: false });
    if (!ctx) {
      throw new Error("Failed to get 2D context for SaturnEffect");
    }
    this.ctx = ctx;

    // Initialize size & particles
    this.resize(window.innerWidth, window.innerHeight);
    this.initParticles();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  // External interaction handlers (accept clientX)
  handleMouseDown(clientX: number) {
    this.isDragging = true;
    this.lastMouseX = clientX;
    this.lastMouseTime = performance.now();
    this.mouseVelocities = [];
  }

  handleMouseMove(clientX: number) {
    if (!this.isDragging) return;
    const now = performance.now();
    const dt = now - this.lastMouseTime;
    if (dt > 0) {
      const dx = clientX - this.lastMouseX;
      const velocity = dx / dt;
      this.mouseVelocities.push(velocity);
      if (this.mouseVelocities.length > 5) this.mouseVelocities.shift();
      // Rotate directly while dragging for immediate feedback
      this.angle += dx * 0.002;
    }
    this.lastMouseX = clientX;
    this.lastMouseTime = now;
  }

  handleMouseUp() {
    if (this.isDragging && this.mouseVelocities.length > 0) {
      this.applyFlingVelocity();
    }
    this.isDragging = false;
  }

  handleTouchStart(clientX: number) {
    this.handleMouseDown(clientX);
  }

  handleTouchMove(clientX: number) {
    this.handleMouseMove(clientX);
  }

  handleTouchEnd() {
    this.handleMouseUp();
  }

  // Resize canvas & scale (call on window resize)
  resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;

    // Update canvas pixel size and CSS size
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Reset transform and scale for devicePixelRatio
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    this.ctx.scale(dpr, dpr);

    const minDim = Math.min(width, height);
    this.scaleFactor = Math.max(1, minDim * 0.45);
  }

  // Initialize particle arrays with reduced counts to keep performance reasonable
  private initParticles() {
    // Tuned particle counts for reasonable performance across platforms
    const planetCount = 1000;
    const ringCount = 2500;
    this.count = planetCount + ringCount;

    this.xyz = new Float32Array(this.count * 3);
    this.types = new Uint8Array(this.count);

    let idx = 0;

    // Planet points
    for (let i = 0; i < planetCount; i++, idx++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 1.0;

      this.xyz[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.xyz[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.xyz[idx * 3 + 2] = r * Math.cos(phi);

      this.types[idx] = 0;
    }

    // Ring points
    const ringInner = 1.4;
    const ringOuter = 2.3;
    for (let i = 0; i < ringCount; i++, idx++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(
        Math.random() * (ringOuter * ringOuter - ringInner * ringInner) +
          ringInner * ringInner,
      );

      this.xyz[idx * 3] = dist * Math.cos(angle);
      this.xyz[idx * 3 + 1] = (Math.random() - 0.5) * 0.05;
      this.xyz[idx * 3 + 2] = dist * Math.sin(angle);

      this.types[idx] = 1;
    }
  }

  // Map fling/velocity samples to a rotation speed and direction
  private applyFlingVelocity() {
    if (this.mouseVelocities.length === 0) return;
    const avg =
      this.mouseVelocities.reduce((a, b) => a + b, 0) /
      this.mouseVelocities.length;
    const flingThreshold = 0.3;
    const stopThreshold = 0.1;

    if (Math.abs(avg) > flingThreshold) {
      this.isStopped = false;
      const newDir = avg > 0 ? 1 : -1;
      if (newDir !== this.rotationDirection) this.rotationDirection = newDir;
      const multiplier = Math.min(
        this.maxSpeedMultiplier,
        this.minSpeedMultiplier + Math.abs(avg) * 10,
      );
      this.currentSpeed = this.baseSpeed * multiplier;
    } else if (Math.abs(avg) < stopThreshold) {
      this.isStopped = true;
      this.currentSpeed = 0;
    }
  }

  // Main render loop
  private animate() {
    // Clear with full alpha to allow layering over background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Standard composition
    this.ctx.globalCompositeOperation = "source-over";

    // Update rotation speed (decay)
    if (!this.isDragging && !this.isStopped) {
      if (this.currentSpeed > this.baseSpeed) {
        this.currentSpeed =
          this.baseSpeed +
          (this.currentSpeed - this.baseSpeed) * this.speedDecayRate;
        if (this.currentSpeed - this.baseSpeed < 0.00001) {
          this.currentSpeed = this.baseSpeed;
        }
      }
      this.angle += this.currentSpeed * this.rotationDirection;
    }

    // Center positions
    const cx = this.width * 0.6;
    const cy = this.height * 0.5;

    // Pre-calc rotations
    const rotationY = this.angle;
    const rotationX = 0.4;
    const rotationZ = 0.15;

    const sinY = Math.sin(rotationY);
    const cosY = Math.cos(rotationY);
    const sinX = Math.sin(rotationX);
    const cosX = Math.cos(rotationX);
    const sinZ = Math.sin(rotationZ);
    const cosZ = Math.cos(rotationZ);

    const fov = 1500;
    const scaleFactor = this.scaleFactor;

    if (!this.xyz || !this.types) {
      this.animationId = requestAnimationFrame(this.animate);
      return;
    }

    // Loop particles
    for (let i = 0; i < this.count; i++) {
      const x = this.xyz[i * 3];
      const y = this.xyz[i * 3 + 1];
      const z = this.xyz[i * 3 + 2];

      // Scale to screen
      const px = x * scaleFactor;
      const py = y * scaleFactor;
      const pz = z * scaleFactor;

      // Rotate Y then X then Z
      const x1 = px * cosY - pz * sinY;
      const z1 = pz * cosY + px * sinY;
      const y2 = py * cosX - z1 * sinX;
      const z2 = z1 * cosX + py * sinX;
      const x3 = x1 * cosZ - y2 * sinZ;
      const y3 = y2 * cosZ + x1 * sinZ;
      const z3 = z2;

      const scale = fov / (fov + z3);

      if (z3 > -fov) {
        const x2d = cx + x3 * scale;
        const y2d = cy + y3 * scale;

        const type = this.types[i];
        const sizeBase = type === 0 ? 2.4 : 1.5;
        const size = sizeBase * scale;

        let alpha = scale * scale * scale;
        if (alpha > 1) alpha = 1;
        if (alpha < 0.15) continue;

        if (type === 0) {
          // Planet: warm-ish
          this.ctx.fillStyle = `rgba(255, 240, 220, ${alpha})`;
        } else {
          // Ring: cool-ish
          this.ctx.fillStyle = `rgba(220, 240, 255, ${alpha})`;
        }

        // Render as small rectangles (faster than arc)
        this.ctx.fillRect(x2d, y2d, size, size);
      }
    }

    this.animationId = requestAnimationFrame(this.animate);
  }

  // Stop animations and release resources
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
    // Intentionally do not null out arrays to allow reuse if desired.
  }
}
