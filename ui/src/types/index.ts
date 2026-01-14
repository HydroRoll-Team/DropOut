export type ViewType = "home" | "versions" | "settings";

export interface Version {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

export interface Account {
  type: "Offline" | "Microsoft";
  username: string;
  uuid: string;
}

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
}

export interface LauncherConfig {
  min_memory: number;
  max_memory: number;
  java_path: string;
  width: number;
  height: number;
}

export interface JavaInstallation {
  path: string;
  version: string;
  is_64bit: boolean;
}
