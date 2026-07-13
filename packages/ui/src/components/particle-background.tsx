import { createContext, useContext, useEffect, useRef, useState } from "react";
import { SaturnEffect } from "@/lib/effects/saturn";

const SaturnEffectContext = createContext<SaturnEffect | null>(null);

export function useSaturnEffect() {
  return useContext(SaturnEffectContext);
}

export function ParticleBackground({
  children,
}: {
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [effect, setEffect] = useState<SaturnEffect | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let saturnEffect: SaturnEffect | null = null;
    try {
      saturnEffect = new SaturnEffect(canvas);
      setEffect(saturnEffect);
    } catch (err) {
      console.warn("SaturnEffect initialization failed:", err);
    }

    const resizeHandler = () => {
      saturnEffect?.resize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      saturnEffect?.destroy();

      setEffect(null);
    };
  }, []);

  return (
    <SaturnEffectContext.Provider value={effect}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 -z-10 pointer-events-none"
      />
      {children}
    </SaturnEffectContext.Provider>
  );
}

export default ParticleBackground;
