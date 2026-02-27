import { useEffect, useState } from "react";
import { BottomBar } from "@/components/bottom-bar";
import type { SaturnEffect } from "@/lib/effects/SaturnEffect";
import { useGameStore } from "../stores/game-store";
import { useReleasesStore } from "../stores/releases-store";

export function HomeView() {
  const gameStore = useGameStore();
  const releasesStore = useReleasesStore();
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  useEffect(() => {
    releasesStore.loadReleases();
  }, [releasesStore.loadReleases]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    setMouseX(x);
    setMouseY(y);

    // Forward mouse move to SaturnEffect (if available) for parallax/rotation interactions
    try {
      const saturn = (
        window as unknown as {
          getSaturnEffect?: () => SaturnEffect;
        }
      ).getSaturnEffect?.();
      if (saturn?.handleMouseMove) {
        saturn.handleMouseMove(e.clientX);
      }
    } catch {
      /* best-effort, ignore errors from effect */
    }
  };

  const handleSaturnMouseDown = (e: React.MouseEvent) => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseDown) {
        saturn.handleMouseDown(e.clientX);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnMouseUp = () => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseUp) {
        saturn.handleMouseUp();
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnMouseLeave = () => {
    // Treat leaving the area as mouse-up for the effect
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseUp) {
        saturn.handleMouseUp();
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      try {
        const clientX = e.touches[0].clientX;
        const saturn = (window as any).getSaturnEffect?.();
        if (saturn?.handleTouchStart) {
          saturn.handleTouchStart(clientX);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaturnTouchMove = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      try {
        const clientX = e.touches[0].clientX;
        const saturn = (window as any).getSaturnEffect?.();
        if (saturn?.handleTouchMove) {
          saturn.handleTouchMove(clientX);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaturnTouchEnd = () => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleTouchEnd) {
        saturn.handleTouchEnd();
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="relative z-10 h-full overflow-y-auto custom-scrollbar scroll-smooth"
      style={{
        overflow: releasesStore.isLoading ? "hidden" : "auto",
      }}
    >
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
            <div className="h-4 w-px bg-white/20"></div>
            <div className="text-sm text-zinc-400">
              Latest Release{" "}
              <span className="text-white font-medium">
                {gameStore.latestRelease?.id || "..."}
              </span>
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
