import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { GuidedTour } from "@/components/guided-tour";
import { ParticleBackground } from "@/components/particle-background";
import { Sidebar } from "@/components/sidebar";
import { UpdateDialog, useUpdater } from "@/components/updater";
import { useAuthStore } from "@/models/auth";
import { useDownloadStore } from "@/models/downloads";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import { useSettingsStore } from "@/models/settings";

export function IndexPage() {
  const authStore = useAuthStore();
  const settingsStore = useSettingsStore();
  const instanceStore = useInstanceStore();
  const updater = useUpdater();
  const initializeDownloads = useDownloadStore((state) => state.initialize);
  const initializeGame = useGameStore((state) => state.initialize);

  const location = useLocation();

  useEffect(() => {
    authStore.init();
    settingsStore.refresh();
    instanceStore.refresh();
    void initializeDownloads();
    void initializeGame();
    updater.checkForUpdate(true);
  }, [
    authStore.init,
    settingsStore.refresh,
    instanceStore.refresh,
    initializeDownloads,
    initializeGame,
    updater.checkForUpdate,
  ]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background font-sans">
      <div className="absolute inset-0 z-0 bg-gray-100 dark:bg-[#09090b] overflow-hidden">
        {settingsStore.config?.customBackgroundPath && (
          <>
            <img
              src={settingsStore.config?.customBackgroundPath}
              alt="Background"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[20s] ease-linear"
              onError={(e) =>
                console.error("Failed to load main background:", e)
              }
            />
            {/* Dimming Overlay for readability */}
            <div className="absolute inset-0 bg-black/50" />
          </>
        )}

        {!settingsStore.config?.customBackgroundPath && (
          <>
            {settingsStore.theme === "dark" ? (
              <div className="absolute inset-0 opacity-60 bg-linear-to-br from-emerald-900 via-zinc-900 to-indigo-950"></div>
            ) : (
              <div className="absolute inset-0 opacity-100 bg-linear-to-br from-emerald-100 via-gray-100 to-indigo-100"></div>
            )}

            <div className="absolute inset-0 bg-linear-to-t from-white/60 via-transparent to-white/20 dark:from-zinc-900 dark:to-black/50"></div>
          </>
        )}

        {/* Subtle Grid Overlay */}
        <div
          className="absolute inset-0 z-0 dark:opacity-10 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${
              settingsStore.config?.theme === "dark" ? "#ffffff" : "#000000"
            } 1px, transparent 1px), linear-gradient(90deg, ${
              settingsStore.config?.theme === "dark" ? "#ffffff" : "#000000"
            } 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
            maskImage:
              "radial-gradient(circle at 50% 50%, black 30%, transparent 70%)",
          }}
        />
      </div>

      <div className="size-full flex flex-row p-4 space-x-4 z-20 relative">
        <Sidebar />

        <main className="size-full overflow-hidden">
          {location.pathname === "/" ? (
            <ParticleBackground>
              <Outlet />
            </ParticleBackground>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <UpdateDialog
        update={updater.update}
        open={updater.showDialog}
        onOpenChange={updater.setShowDialog}
        downloading={updater.downloading}
        onConfirm={updater.downloadAndInstall}
      />

      <GuidedTour />
    </div>
  );
}
