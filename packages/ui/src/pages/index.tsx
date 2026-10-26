import { useEffect } from "react";
import { Outlet } from "react-router";
import { GuidedTour } from "@/components/guided-tour";
import {
  ConstructionGrid,
  SideRuler,
  TopRuler,
} from "@/components/shell/construction-grid";
import { EasterEggs } from "@/components/shell/easter-eggs";
import { StatusStrip } from "@/components/shell/status-strip";
import { TopNav } from "@/components/shell/top-nav";
import { TrayController } from "@/components/tray-controller";
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

  const customBackground = settingsStore.config?.customBackgroundPath;

  return (
    <div className="relative grid size-full grid-cols-[18px_minmax(0,1fr)] grid-rows-[auto_14px_minmax(0,1fr)_20px] overflow-hidden bg-background font-sans text-foreground">
      <TopNav />

      <div
        aria-hidden="true"
        className="col-start-1 row-start-2 border-r border-b border-hair"
      />
      <TopRuler />
      <SideRuler />

      <div className="relative col-start-2 row-start-3 min-h-0">
        {customBackground && (
          <div aria-hidden="true" className="absolute inset-0 z-0">
            <img
              src={customBackground}
              alt=""
              className="size-full object-cover opacity-55 grayscale-[35%]"
              onError={(e) =>
                console.error("Failed to load main background:", e)
              }
            />
            <div className="dots absolute inset-0 opacity-60" />
          </div>
        )}
        <ConstructionGrid />
        <main className="relative z-10 size-full overflow-hidden">
          <Outlet />
        </main>
      </div>

      <StatusStrip />

      <UpdateDialog
        update={updater.update}
        open={updater.showDialog}
        onOpenChange={updater.setShowDialog}
        downloading={updater.downloading}
        onConfirm={updater.downloadAndInstall}
      />

      <GuidedTour />
      <TrayController />
      <EasterEggs />
    </div>
  );
}
