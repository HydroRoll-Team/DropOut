import { useEffect, useRef } from "react";
import { SaturnEffect } from "../lib/effects/SaturnEffect";

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectRef = useRef<SaturnEffect | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Instantiate SaturnEffect and attach to canvas
    let effect: SaturnEffect | null = null;
    try {
      effect = new SaturnEffect(canvas);
      effectRef.current = effect;
    } catch (err) {
      // If effect fails, silently degrade (keep background blank)
      // eslint-disable-next-line no-console
      console.warn("SaturnEffect initialization failed:", err);
    }

    const resizeHandler = () => {
      if (effectRef.current) {
        try {
          effectRef.current.resize(window.innerWidth, window.innerHeight);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("resize", resizeHandler);

    // Expose getter for HomeView interactions (getSaturnEffect)
    // HomeView will call window.getSaturnEffect()?.handleMouseDown/Move/Up
    (
      window as unknown as { getSaturnEffect?: () => SaturnEffect | null }
    ).getSaturnEffect = () => effectRef.current;

    return () => {
      window.removeEventListener("resize", resizeHandler);
      if (effectRef.current) {
        try {
          effectRef.current.destroy();
        } catch {
          // ignore
        }
      }
      effectRef.current = null;
      (
        window as unknown as { getSaturnEffect?: () => SaturnEffect | null }
      ).getSaturnEffect = undefined;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
    />
  );
}
