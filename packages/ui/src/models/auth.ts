import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { Mutex } from "es-toolkit";
import { toString as stringify } from "es-toolkit/compat";
import { toast } from "sonner";
import { create } from "zustand";
import {
  completeMicrosoftLogin,
  getActiveAccount,
  loginOffline,
  logout,
  startMicrosoftLogin,
} from "@/client";
import type { Account, DeviceCodeResponse } from "@/types";

export interface AuthState {
  account: Account | null;
  loginMode: Account["type"] | null;
  deviceCode: DeviceCodeResponse | null;
  _pollingInterval: number | null;
  _mutex: Mutex;
  statusMessage: string | null;
  _progressUnlisten: UnlistenFn | null;

  init: () => Promise<void>;
  setLoginMode: (mode: Account["type"] | null) => void;
  loginOnline: (onSuccess?: () => void | Promise<void>) => Promise<void>;
  _pollLoginStatus: (
    deviceCode: string,
    onSuccess?: () => void | Promise<void>,
  ) => Promise<void>;
  cancelLoginOnline: () => Promise<void>;
  loginOffline: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  account: null,
  loginMode: null,
  deviceCode: null,
  _pollingInterval: null,
  statusMessage: null,
  _progressUnlisten: null,
  _mutex: new Mutex(),

  init: async () => {
    try {
      const account = await getActiveAccount();
      set({ account });
    } catch (error) {
      console.error("Failed to initialize auth store:", error);
    }
  },
  setLoginMode: (mode) => set({ loginMode: mode }),
  loginOnline: async (onSuccess) => {
    const { _pollLoginStatus } = get();

    set({ statusMessage: "Waiting for authorization..." });

    try {
      const unlisten = await listen("auth-progress", (event) => {
        const message = event.payload;
        console.log(message);
        set({ statusMessage: stringify(message), _progressUnlisten: unlisten });
      });
    } catch (error) {
      console.warn("Failed to attch auth-progress listener:", error);
      toast.warning("Failed to attch auth-progress listener");
    }

    const deviceCode = await startMicrosoftLogin();
    navigator.clipboard?.writeText(deviceCode.userCode).catch((err) => {
      console.error("Failed to copy to clipboard:", err);
    });
    open(deviceCode.verificationUri).catch((err) => {
      console.error("Failed to open browser:", err);
    });
    const ms = Number(deviceCode.interval) * 1000;
    const interval = setInterval(() => {
      _pollLoginStatus(deviceCode.deviceCode, onSuccess);
    }, ms);
    set({ _pollingInterval: interval, deviceCode });
  },
  _pollLoginStatus: async (deviceCode, onSuccess) => {
    const { _pollingInterval, _mutex: mutex, _progressUnlisten } = get();
    if (mutex.isLocked) return;
    mutex.acquire();
    try {
      const account = await completeMicrosoftLogin(deviceCode);
      clearInterval(_pollingInterval ?? undefined);
      _progressUnlisten?.();
      onSuccess?.();
      set({ account, loginMode: "microsoft" });
    } catch (error) {
      if (error === "authorization_pending") {
        console.log("Authorization pending...");
      } else {
        console.error("Failed to poll login status:", error);
        toast.error("Failed to poll login status");
      }
    } finally {
      mutex.release();
    }
  },
  cancelLoginOnline: async () => {
    const { account, logout, _pollingInterval, _progressUnlisten } = get();
    clearInterval(_pollingInterval ?? undefined);
    _progressUnlisten?.();
    if (account) {
      await logout();
    }
    set({
      loginMode: null,
      _pollingInterval: null,
      statusMessage: null,
      _progressUnlisten: null,
    });
  },
  loginOffline: async (username: string) => {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length === 0) {
      throw new Error("Username cannot be empty");
    }

    try {
      const account = await loginOffline(trimmedUsername);
      set({ account, loginMode: "offline" });
    } catch (error) {
      console.error("Failed to login offline:", error);
      toast.error("Failed to login offline");
    }
  },
  logout: async () => {
    try {
      await logout();
      set({ account: null });
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error("Failed to logout");
    }
  },
}));
