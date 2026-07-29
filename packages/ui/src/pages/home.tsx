import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomBar } from "@/components/bottom-bar";
import { useSaturnEffect } from "@/components/particle-background";

export function HomePage() {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const saturn = useSaturnEffect();
  const { t } = useTranslation();

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    setMouseX(x);
    setMouseY(y);

    // Forward mouse move to SaturnEffect (if available) for parallax/rotation interactions
    saturn?.handleMouseMove(e.clientX);
  };

  const handleSaturnMouseDown = (e: React.MouseEvent) => {
    saturn?.handleMouseDown(e.clientX);
  };

  const handleSaturnMouseUp = () => {
    saturn?.handleMouseUp();
  };

  const handleSaturnMouseLeave = () => {
    // Treat leaving the area as mouse-up for the effect
    saturn?.handleMouseUp();
  };

  const handleSaturnTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      const clientX = e.touches[0].clientX;
      saturn?.handleTouchStart(clientX);
    }
  };

  const handleSaturnTouchMove = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      const clientX = e.touches[0].clientX;
      saturn?.handleTouchMove(clientX);
    }
  };

  const handleSaturnTouchEnd = () => {
    saturn?.handleTouchEnd();
  };

  return (
    <div className="relative z-10 h-full overflow-y-auto custom-scrollbar scroll-smooth">
      {/* Hero Section (Full Height) - Interactive area */}
      <section
        aria-label={t("home.launcherActive")}
        className="min-h-full flex flex-col justify-start p-12 pb-32 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleSaturnMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleSaturnMouseUp}
        onMouseLeave={handleSaturnMouseLeave}
        onTouchStart={handleSaturnTouchStart}
        onTouchMove={handleSaturnTouchMove}
        onTouchEnd={handleSaturnTouchEnd}
      >
        {/* 3D Floating Hero Text */}
        <div
          className="transition-transform duration-200 ease-out origin-bottom-left"
          style={{
            transform: `perspective(1000px) rotateX(${mouseY * -1}deg) rotateY(${mouseX * 1}deg)`,
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-black/30 dark:bg-white/50"></div>
            <span className="text-xs font-mono font-bold tracking-[0.2em] text-zinc-600 dark:text-white/50 uppercase">
              {t("home.launcherActive")}
            </span>
          </div>

          <h1 className="text-8xl font-black tracking-tighter text-zinc-950 dark:text-white mb-6 leading-none">
            {t("home.title")}
          </h1>

          <div className="flex items-center gap-4">
            <div className="bg-black/5 dark:bg-white/10 backdrop-blur-md border border-black/10 dark:border-white/10 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest text-zinc-900 dark:text-white shadow-sm">
              {t("home.javaEdition")}
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="mt-8 flex gap-4">
          <div className="text-zinc-600 dark:text-zinc-500 text-sm font-mono">
            {t("home.readyToLaunch")}
          </div>
        </div>

        <BottomBar />
      </section>
    </div>
  );
}
