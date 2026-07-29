import {
  getLauncherFixtureName,
  getLauncherFixtureTheme,
} from "@/lib/launcher-runtime";
import { useGameStore } from "@/models/game";

export function bootstrapLauncherFixture() {
  const fixtureName = getLauncherFixtureName();
  if (!fixtureName) return;

  document.documentElement.dataset.launcherFixture = fixtureName;
  document.documentElement.dataset.launcherFixtureTheme =
    getLauncherFixtureTheme() ?? "dark";

  if (fixtureName === "running") {
    useGameStore.setState({
      runningInstanceId: "fixture-fabric-1211",
      runningVersionId: "1.21.1",
      launchingInstanceId: null,
      stoppingInstanceId: null,
    });
  }
}
