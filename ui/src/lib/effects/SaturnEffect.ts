// Optimized Saturn Effect for low-end hardware
// Uses TypedArrays for memory efficiency and reduced particle density

export class SaturnEffect {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Data-oriented design for performance
  // xyz: Float32Array where [i*3, i*3+1, i*3+2] corresponds to x, y, z
  private xyz: Float32Array | null = null;
  // types: Uint8Array where 0 = planet, 1 = ring
  private types: Uint8Array | null = null;
  private count: number = 0;

  private animationId: number = 0;
  private angle: number = 0;
  private scaleFactor: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: false, // default is usually fine, 'desynchronized' can help latency but might flicker
    })!;

    // Initial resize will set up everything
    this.resize(window.innerWidth, window.innerHeight);
    this.initParticles();

    this.animate = this.animate.bind(this);
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

    // Dynamic scaling based on screen size
    const minDim = Math.min(width, height);
    this.scaleFactor = minDim * 0.45;
  }

  initParticles() {
    // Significantly reduced particle count for CPU optimization
    // Planet: 1800 -> 1000
    // Rings: 5000 -> 2500
    // Total approx 3500 vs 6800 previously (approx 50% reduction)
    const planetCount = 1000;
    const ringCount = 2500;
    this.count = planetCount + ringCount;

    // Use TypedArrays for better memory locality
    this.xyz = new Float32Array(this.count * 3);
    this.types = new Uint8Array(this.count);

    let idx = 0;

    // 1. Planet
    for (let i = 0; i < planetCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 1.0;

      // x, y, z
      this.xyz[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.xyz[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.xyz[idx * 3 + 2] = r * Math.cos(phi);

      this.types[idx] = 0; // 0 for planet
      idx++;
    }

    // 2. Rings
    const ringInner = 1.4;
    const ringOuter = 2.3;

    for (let i = 0; i < ringCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(
        Math.random() * (ringOuter * ringOuter - ringInner * ringInner) + ringInner * ringInner,
      );

      // x, y, z
      this.xyz[idx * 3] = dist * Math.cos(angle);
      this.xyz[idx * 3 + 1] = (Math.random() - 0.5) * 0.05;
      this.xyz[idx * 3 + 2] = dist * Math.sin(angle);

      this.types[idx] = 1; // 1 for ring
      idx++;
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Normal blending
    this.ctx.globalCompositeOperation = "source-over";

    // Slower rotation (from 0.0015 to 0.0005)
    this.angle += 0.0005;

    const cx = this.width * 0.6;
    const cy = this.height * 0.5;

    // Pre-calculate rotation matrices
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

    if (!this.xyz || !this.types) return;

    for (let i = 0; i < this.count; i++) {
      const x = this.xyz[i * 3];
      const y = this.xyz[i * 3 + 1];
      const z = this.xyz[i * 3 + 2];

      // Apply Scale
      const px = x * scaleFactor;
      const py = y * scaleFactor;
      const pz = z * scaleFactor;

      // 1. Rotate Y
      const x1 = px * cosY - pz * sinY;
      const z1 = pz * cosY + px * sinY;
      // y1 = py

      // 2. Rotate X
      const y2 = py * cosX - z1 * sinX;
      const z2 = z1 * cosX + py * sinX;
      // x2 = x1

      // 3. Rotate Z
      const x3 = x1 * cosZ - y2 * sinZ;
      const y3 = y2 * cosZ + x1 * sinZ;
      const z3 = z2;

      const scale = fov / (fov + z3);

      if (z3 > -fov) {
        const x2d = cx + x3 * scale;
        const y2d = cy + y3 * scale;

        // Size calculation - slightly larger dots to compensate for lower count
        // Previously Planet 2.0 -> 2.4, Ring 1.3 -> 1.5
        const type = this.types[i];
        const sizeBase = type === 0 ? 2.4 : 1.5;
        const size = sizeBase * scale;

        // Opacity
        let alpha = scale * scale * scale;
        if (alpha > 1) alpha = 1;
        if (alpha < 0.15) continue; // Skip very faint particles for performance

        // Optimization: Planet color vs Ring color
        if (type === 0) {
          // Planet: Warm White
          this.ctx.fillStyle = `rgba(255, 240, 220, ${alpha})`;
        } else {
          // Ring: Cool White
          this.ctx.fillStyle = `rgba(220, 240, 255, ${alpha})`;
        }

        // Render as squares (fillRect) instead of circles (arc)
        // This is significantly faster for software rendering and reduces GPU usage.
        this.ctx.fillRect(x2d, y2d, size, size);
      }
    }

    this.animationId = requestAnimationFrame(this.animate);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
  }
}
