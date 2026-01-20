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

  // Mouse interaction properties
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseTime: number = 0;
  private mouseVelocities: number[] = []; // Store recent velocities for averaging

  // Rotation speed control
  private readonly baseSpeed: number = 0.005; // Original rotation speed
  private currentSpeed: number = 0.005; // Current rotation speed (can be modified by mouse)
  private rotationDirection: number = 1; // 1 for clockwise, -1 for counter-clockwise
  private readonly speedDecayRate: number = 0.992; // How fast speed returns to normal (closer to 1 = slower decay)
  private readonly minSpeedMultiplier: number = 1; // Minimum speed is baseSpeed
  private readonly maxSpeedMultiplier: number = 50; // Maximum speed is 50x baseSpeed
  private isStopped: boolean = false; // Whether the user has stopped the rotation

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

  // Public methods for external mouse event handling
  // These can be called from any element that wants to control the Saturn rotation

  handleMouseDown(clientX: number) {
    this.isDragging = true;
    this.lastMouseX = clientX;
    this.lastMouseTime = performance.now();
    this.mouseVelocities = [];
  }

  handleMouseMove(clientX: number) {
    if (!this.isDragging) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastMouseTime;

    if (deltaTime > 0) {
      const deltaX = clientX - this.lastMouseX;
      const velocity = deltaX / deltaTime; // pixels per millisecond

      // Store recent velocities (keep last 5 for smoothing)
      this.mouseVelocities.push(velocity);
      if (this.mouseVelocities.length > 5) {
        this.mouseVelocities.shift();
      }

      // Apply direct rotation while dragging
      this.angle += deltaX * 0.002;
    }

    this.lastMouseX = clientX;
    this.lastMouseTime = currentTime;
  }

  handleMouseUp() {
    if (this.isDragging && this.mouseVelocities.length > 0) {
      this.applyFlingVelocity();
    }
    this.isDragging = false;
  }

  handleTouchStart(clientX: number) {
    this.isDragging = true;
    this.lastMouseX = clientX;
    this.lastMouseTime = performance.now();
    this.mouseVelocities = [];
  }

  handleTouchMove(clientX: number) {
    if (!this.isDragging) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastMouseTime;

    if (deltaTime > 0) {
      const deltaX = clientX - this.lastMouseX;
      const velocity = deltaX / deltaTime;

      this.mouseVelocities.push(velocity);
      if (this.mouseVelocities.length > 5) {
        this.mouseVelocities.shift();
      }

      this.angle += deltaX * 0.002;
    }

    this.lastMouseX = clientX;
    this.lastMouseTime = currentTime;
  }

  handleTouchEnd() {
    if (this.isDragging && this.mouseVelocities.length > 0) {
      this.applyFlingVelocity();
    }
    this.isDragging = false;
  }

  private applyFlingVelocity() {
    // Calculate average velocity from recent samples
    const avgVelocity =
      this.mouseVelocities.reduce((a, b) => a + b, 0) / this.mouseVelocities.length;

    // Threshold for considering it a "fling" (pixels per millisecond)
    const flingThreshold = 0.3;
    // Threshold for considering the rotation as "stopped" by user
    const stopThreshold = 0.1;

    if (Math.abs(avgVelocity) > flingThreshold) {
      // User flung it - start rotating again
      this.isStopped = false;

      // Determine new direction based on fling direction
      const newDirection = avgVelocity > 0 ? 1 : -1;

      // If direction changed, update it permanently
      if (newDirection !== this.rotationDirection) {
        this.rotationDirection = newDirection;
      }

      // Calculate speed boost based on fling strength
      // Map velocity to speed multiplier (stronger fling = faster rotation)
      const speedMultiplier = Math.min(
        this.maxSpeedMultiplier,
        this.minSpeedMultiplier + Math.abs(avgVelocity) * 10,
      );

      this.currentSpeed = this.baseSpeed * speedMultiplier;
    } else if (Math.abs(avgVelocity) < stopThreshold) {
      // User gently released - keep it stopped
      this.isStopped = true;
      this.currentSpeed = 0;
    }
    // If velocity is between stopThreshold and flingThreshold,
    // keep current state (don't change isStopped)
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

    // Update rotation speed - decay towards base speed while maintaining direction
    if (!this.isDragging && !this.isStopped) {
      if (this.currentSpeed > this.baseSpeed) {
        // Gradually decay speed back to base speed
        this.currentSpeed =
          this.baseSpeed + (this.currentSpeed - this.baseSpeed) * this.speedDecayRate;

        // Snap to base speed when close enough
        if (this.currentSpeed - this.baseSpeed < 0.00001) {
          this.currentSpeed = this.baseSpeed;
        }
      }

      // Apply rotation with current speed and direction
      this.angle += this.currentSpeed * this.rotationDirection;
    }

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
