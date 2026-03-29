import { useState } from "react";
import { BottomBar } from "@/components/bottom-bar";
import { useSaturnEffect } from "@/components/particle-background";

export function HomePage() {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const saturn = useSaturnEffect();

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
      <div
        role="tab"
        className="min-h-full flex flex-col justify-end p-12 pb-32 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleSaturnMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleSaturnMouseUp}
        onMouseLeave={handleSaturnMouseLeave}
        onTouchStart={handleSaturnTouchStart}
        onTouchMove={handleSaturnTouchMove}
        onTouchEnd={handleSaturnTouchEnd}
        tabIndex={0}
      >
        {/* 3D Floating Hero Text */}
        <div
          className="transition-transform duration-200 ease-out origin-bottom-left"
          style={{
            transform: `perspective(1000px) rotateX(${mouseY * -1}deg) rotateY(${mouseX * 1}deg)`,
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-white/50"></div>
            <span className="text-xs font-mono font-bold tracking-[0.2em] text-white/50 uppercase">
              Launcher Active
            </span>
          </div>

          <h1 className="text-8xl font-black tracking-tighter text-white mb-6 leading-none">
            MINECRAFT
          </h1>

          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest text-white shadow-sm">
              Java Edition
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="mt-8 flex gap-4">
          <div className="text-zinc-500 text-sm font-mono">
            &gt; Ready to launch session.
          </div>
        </div>

        <BottomBar />
      </div>
    </div>
  );
}
