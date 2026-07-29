import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  type EventCallback,
  listen as tauriListen,
  type UnlistenFn,
} from "@tauri-apps/api/event";

export type { UnlistenFn };

export const launcherFixtureNames = [
  "empty",
  "no-account",
  "no-instance",
  "not-ready",
  "ready",
  "downloading",
  "java-download-progress",
  "launching",
  "running",
  "stopped",
  "failed",
  "error",
  "migration",
] as const;

export type LauncherFixtureName = (typeof launcherFixtureNames)[number];

const launcherFixtureNameSet = new Set<string>(launcherFixtureNames);

export function getLauncherFixtureName(): LauncherFixtureName | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  const requested =
    new URLSearchParams(window.location.search).get("fixture") ??
    import.meta.env.VITE_LAUNCHER_FIXTURE;

  return requested && launcherFixtureNameSet.has(requested)
    ? (requested as LauncherFixtureName)
    : null;
}

export function getLauncherFixtureTheme(): "light" | "dark" | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  const requested = new URLSearchParams(window.location.search).get("theme");
  return requested === "light" || requested === "dark" ? requested : null;
}

export function getLauncherFixtureLocale(): "en" | "zh-CN" | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  const requested = new URLSearchParams(window.location.search).get("locale");
  return requested === "en" || requested === "zh-CN" ? requested : null;
}

export function isLauncherFixtureMode(): boolean {
  return getLauncherFixtureName() !== null;
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (import.meta.env.DEV && isLauncherFixtureMode()) {
    const { fixtureInvoke } = await import("@/fixtures/launcher");
    return fixtureInvoke<T>(command, args);
  }

  return tauriInvoke<T>(command, args);
}

export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  if (import.meta.env.DEV && isLauncherFixtureMode()) {
    const { fixtureListen } = await import("@/fixtures/launcher");
    return fixtureListen(event, handler);
  }

  return tauriListen(event, handler);
}
