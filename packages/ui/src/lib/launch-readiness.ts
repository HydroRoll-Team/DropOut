import type {
  Account,
  Instance,
  LauncherConfig,
  LaunchReadiness,
} from "@/types";
import type { GameExitedEvent } from "@/types/bindings/core";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export type HomeLaunchState =
  | "checking"
  | "data-error"
  | "no-account"
  | "no-instance"
  | "version-missing"
  | "java-missing"
  | "files-missing"
  | "memory-invalid"
  | "downloading"
  | "launching"
  | "running"
  | "stopped"
  | "failed"
  | "ready";

export interface HomeLaunchStateInput {
  account: Account | null;
  activeInstance: Instance | null;
  config: LauncherConfig | null;
  authStatus: LoadStatus;
  instanceStatus: LoadStatus;
  settingsStatus: LoadStatus;
  probe: LaunchReadiness | null;
  probeLoading: boolean;
  probeError: string | null;
  downloadActive: boolean;
  launchingInstanceId: string | null;
  runningInstanceId: string | null;
  lastExit: GameExitedEvent | null;
  lastError: string | null;
}

export function resolveHomeLaunchState(
  input: HomeLaunchStateInput,
): HomeLaunchState {
  if (
    input.authStatus === "idle" ||
    input.authStatus === "loading" ||
    input.instanceStatus === "idle" ||
    input.instanceStatus === "loading" ||
    input.settingsStatus === "idle" ||
    input.settingsStatus === "loading"
  ) {
    return "checking";
  }

  if (
    input.authStatus === "error" ||
    input.instanceStatus === "error" ||
    input.settingsStatus === "error"
  ) {
    return "data-error";
  }

  if (!input.account) return "no-account";
  if (!input.activeInstance) return "no-instance";

  if (input.runningInstanceId) return "running";
  if (input.downloadActive) return "downloading";
  if (input.launchingInstanceId) return "launching";
  if (input.lastError) return "failed";

  if (
    input.lastExit?.instanceId === input.activeInstance.id &&
    (input.lastExit.wasStopped || input.lastExit.exitCode === 0)
  ) {
    return "stopped";
  }

  if (!input.activeInstance.versionId) return "version-missing";
  if (input.probeError) return "data-error";
  if (input.probeLoading || !input.probe) return "checking";
  if (!input.probe.java) return "java-missing";
  if (!input.probe.versionInstalled) return "files-missing";

  if (
    input.probe.memory.appliedMinMb <= 0 ||
    input.probe.memory.appliedMaxMb < input.probe.memory.appliedMinMb ||
    input.probe.memory.pressure === "critical"
  ) {
    return "memory-invalid";
  }

  return "ready";
}
