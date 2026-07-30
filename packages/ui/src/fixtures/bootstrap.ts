import {
  getLauncherFixtureLocale,
  getLauncherFixtureName,
  getLauncherFixtureTheme,
} from "@/lib/launcher-runtime";
import { useDownloadStore } from "@/models/downloads";
import { useGameStore } from "@/models/game";

export function bootstrapLauncherFixture() {
  const fixtureName = getLauncherFixtureName();
  if (!fixtureName) return;

  document.documentElement.dataset.launcherFixture = fixtureName;
  document.documentElement.dataset.launcherFixtureTheme =
    getLauncherFixtureTheme() ?? "dark";
  document.documentElement.dataset.launcherFixtureLocale =
    getLauncherFixtureLocale() ?? "en";

  if (fixtureName === "instances-grid") {
    window.localStorage.setItem("dropout.instanceLibraryView", "grid");
  }

  if (fixtureName === "downloading") {
    useDownloadStore.setState({
      active: true,
      kind: "game",
      currentFile: "client-1.21.1.jar",
      status: "Downloading",
      completedFiles: 37,
      totalFiles: 58,
      downloadedBytes: 84 * 1024 * 1024,
      totalBytes: 128 * 1024 * 1024,
      percentage: 65,
    });
  }

  if (fixtureName === "launching") {
    useGameStore.setState({
      launchingInstanceId: "fixture-fabric-1211",
      recentLogs: [
        { id: 1, source: "launcher", message: "Resolving Java runtime" },
        { id: 2, source: "launcher", message: "Building launch arguments" },
      ],
    });
  } else if (fixtureName === "running") {
    useGameStore.setState({
      runningInstanceId: "fixture-fabric-1211",
      runningVersionId: "1.21.1",
      launchingInstanceId: null,
      stoppingInstanceId: null,
      recentLogs: [
        { id: 1, source: "launcher", message: "Minecraft process started" },
        {
          id: 2,
          source: "stdout",
          message: "[Render thread/INFO]: OpenGL initialized",
        },
      ],
    });
  } else if (fixtureName === "stopped") {
    useGameStore.setState({
      lastExit: {
        instanceId: "fixture-fabric-1211",
        versionId: "1.21.1",
        exitCode: 0,
        wasStopped: false,
      },
      recentLogs: [
        { id: 1, source: "stdout", message: "Stopping integrated server" },
        { id: 2, source: "launcher", message: "Minecraft exited with code 0" },
      ],
    });
  } else if (fixtureName === "failed") {
    useGameStore.setState({
      lastError: "Minecraft 1.21.1 exited with code 1",
      lastErrorInstanceId: "fixture-fabric-1211",
      lastExit: {
        instanceId: "fixture-fabric-1211",
        versionId: "1.21.1",
        exitCode: 1,
        wasStopped: false,
      },
      recentLogs: [
        { id: 1, source: "launcher", message: "Starting Minecraft 1.21.1" },
        {
          id: 2,
          source: "stderr",
          message: "Could not initialize class net.fabricmc.loader",
        },
        { id: 3, source: "stderr", message: "Process exited with code 1" },
      ],
    });
  }
}
