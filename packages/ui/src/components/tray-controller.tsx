import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  refreshSystemTray,
  showMainWindow,
  updateTrayDownloadStatus,
} from "@/client";
import { listen, type UnlistenFn } from "@/lib/launcher-runtime";
import { useDownloadStore } from "@/models/downloads";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";

interface TrayLaunchRequest {
  instanceId: string;
  instanceName: string;
  versionId: string;
}

async function quickLaunch(request: TrayLaunchRequest) {
  try {
    let instanceState = useInstanceStore.getState();
    let instance = instanceState.instances.find(
      (candidate) => candidate.id === request.instanceId,
    );

    if (!instance) {
      await instanceState.refresh();
      instanceState = useInstanceStore.getState();
      instance = instanceState.instances.find(
        (candidate) => candidate.id === request.instanceId,
      );
    }

    if (!instance) {
      console.warn(
        `Tray quick launch instance is unavailable: ${request.instanceId}`,
      );
      await showMainWindow();
      return;
    }

    await instanceState.setActiveInstance(instance);
    const result = await useGameStore
      .getState()
      .startGame(request.instanceId, request.versionId);
    if (result === null) {
      await showMainWindow();
    }
  } catch (error) {
    console.error("Failed to quick launch from the system tray:", error);
    await showMainWindow().catch((showError) =>
      console.error("Failed to reveal the launcher window:", showError),
    );
  }
}

function refreshLaunchTargets() {
  void refreshSystemTray().catch((error) =>
    console.error("Failed to refresh system tray launch targets:", error),
  );
}

export function TrayController() {
  const navigate = useNavigate();
  const active = useDownloadStore((state) => state.active);
  const percentage = useDownloadStore((state) => state.percentage);
  const status = useDownloadStore((state) => state.status);
  const previousActive = useRef(active);

  useEffect(() => {
    const lifecycleChanged = previousActive.current !== active;
    previousActive.current = active;
    const timeout = window.setTimeout(
      () => {
        void updateTrayDownloadStatus({ active, percentage, status }).catch(
          (error) =>
            console.error("Failed to update system tray status:", error),
        );
      },
      lifecycleChanged ? 0 : 200,
    );

    return () => window.clearTimeout(timeout);
  }, [active, percentage, status]);

  useEffect(() => {
    refreshLaunchTargets();
    return useInstanceStore.subscribe((state, previousState) => {
      if (state.instances !== previousState.instances) refreshLaunchTargets();
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    void (async () => {
      try {
        unlisteners.push(
          await listen<TrayLaunchRequest>("tray-quick-launch", (event) => {
            void quickLaunch(event.payload);
          }),
        );
        unlisteners.push(
          await listen<void>("tray-open-downloads", () => {
            navigate("/");
            window.setTimeout(() => {
              document.getElementById("download-monitor")?.focus();
            });
          }),
        );

        if (disposed) {
          for (const unlisten of unlisteners.splice(0)) unlisten();
        }
      } catch (error) {
        for (const unlisten of unlisteners.splice(0)) unlisten();
        console.error("Failed to register system tray listeners:", error);
      }
    })();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners.splice(0)) unlisten();
    };
  }, [navigate]);

  return null;
}
