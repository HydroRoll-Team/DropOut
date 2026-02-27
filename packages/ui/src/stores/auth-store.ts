import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import { create } from "zustand";
import type { Account, DeviceCodeResponse } from "../types/bindings/auth";

interface AuthState {
  // State
  currentAccount: Account | null;
  isLoginModalOpen: boolean;
  isLogoutConfirmOpen: boolean;
  loginMode: "select" | "offline" | "microsoft";
  offlineUsername: string;
  deviceCodeData: DeviceCodeResponse | null;
  msLoginLoading: boolean;
  msLoginStatus: string;

  // Private state
  pollInterval: ReturnType<typeof setInterval> | null;
  isPollingRequestActive: boolean;
  authProgressUnlisten: UnlistenFn | null;

  // Actions
  checkAccount: () => Promise<void>;
  openLoginModal: () => void;
  openLogoutConfirm: () => void;
  cancelLogout: () => void;
  confirmLogout: () => Promise<void>;
  closeLoginModal: () => void;
  resetLoginState: () => void;
  performOfflineLogin: () => Promise<void>;
  startMicrosoftLogin: () => Promise<void>;
  checkLoginStatus: (deviceCode: string) => Promise<void>;
  stopPolling: () => void;
  cancelMicrosoftLogin: () => void;
  setLoginMode: (mode: "select" | "offline" | "microsoft") => void;
  setOfflineUsername: (username: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  currentAccount: null,
  isLoginModalOpen: false,
  isLogoutConfirmOpen: false,
  loginMode: "select",
  offlineUsername: "",
  deviceCodeData: null,
  msLoginLoading: false,
  msLoginStatus: "Waiting for authorization...",

  // Private state
  pollInterval: null,
  isPollingRequestActive: false,
  authProgressUnlisten: null,

  // Actions
  checkAccount: async () => {
    try {
      const acc = await invoke<Account | null>("get_active_account");
      set({ currentAccount: acc });
    } catch (error) {
      console.error("Failed to check account:", error);
    }
  },

  openLoginModal: () => {
    const { currentAccount } = get();
    if (currentAccount) {
      // Show custom logout confirmation dialog
      set({ isLogoutConfirmOpen: true });
      return;
    }
    get().resetLoginState();
    set({ isLoginModalOpen: true });
  },

  openLogoutConfirm: () => {
    set({ isLogoutConfirmOpen: true });
  },

  cancelLogout: () => {
    set({ isLogoutConfirmOpen: false });
  },

  confirmLogout: async () => {
    set({ isLogoutConfirmOpen: false });
    try {
      await invoke("logout");
      set({ currentAccount: null });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  },

  closeLoginModal: () => {
    get().stopPolling();
    set({ isLoginModalOpen: false });
  },

  resetLoginState: () => {
    set({
      loginMode: "select",
      offlineUsername: "",
      deviceCodeData: null,
      msLoginLoading: false,
      msLoginStatus: "Waiting for authorization...",
    });
  },

  performOfflineLogin: async () => {
    const { offlineUsername } = get();
    if (!offlineUsername.trim()) return;

    try {
      const account = await invoke<Account>("login_offline", {
        username: offlineUsername,
      });
      set({
        currentAccount: account,
        isLoginModalOpen: false,
        offlineUsername: "",
      });
    } catch (error) {
      // Keep UI-friendly behavior consistent with prior code
      alert("Login failed: " + String(error));
    }
  },

  startMicrosoftLogin: async () => {
    // Prepare UI state
    set({
      msLoginLoading: true,
      msLoginStatus: "Waiting for authorization...",
      loginMode: "microsoft",
      deviceCodeData: null,
    });

    // Listen to general launcher logs so we can display progress to the user.
    // The backend emits logs via "launcher-log"; using that keeps this store decoupled
    // from a dedicated auth event channel (backend may reuse launcher-log).
    try {
      const unlisten = await listen("launcher-log", (event) => {
        const payload = event.payload;
        // Normalize payload to string if possible
        const message =
          typeof payload === "string"
            ? payload
            : (payload?.toString?.() ?? JSON.stringify(payload));
        set({ msLoginStatus: message });
      });
      set({ authProgressUnlisten: unlisten });
    } catch (err) {
      console.warn("Failed to attach launcher-log listener:", err);
    }

    try {
      const deviceCodeData = await invoke<DeviceCodeResponse>(
        "start_microsoft_login",
      );
      set({ deviceCodeData });

      if (deviceCodeData) {
        // Try to copy user code to clipboard for convenience (best-effort)
        try {
          await navigator.clipboard?.writeText(deviceCodeData.userCode ?? "");
        } catch (err) {
          // ignore clipboard errors
          console.debug("Clipboard copy failed:", err);
        }

        // Open verification URI in default browser
        try {
          if (deviceCodeData.verificationUri) {
            await open(deviceCodeData.verificationUri);
          }
        } catch (err) {
          console.debug("Failed to open verification URI:", err);
        }

        // Start polling for completion
        // `interval` from the bindings is a bigint (seconds). Convert safely to number.
        const intervalSeconds =
          deviceCodeData.interval !== undefined &&
          deviceCodeData.interval !== null
            ? Number(deviceCodeData.interval)
            : 5;
        const intervalMs = intervalSeconds * 1000;
        const pollInterval = setInterval(
          () => get().checkLoginStatus(deviceCodeData.deviceCode),
          intervalMs,
        );
        set({ pollInterval });
      }
    } catch (error) {
      toast.error(`Failed to start Microsoft login: ${error}`);
      set({ loginMode: "select" });
      // cleanup listener if present
      const { authProgressUnlisten } = get();
      if (authProgressUnlisten) {
        authProgressUnlisten();
        set({ authProgressUnlisten: null });
      }
    } finally {
      set({ msLoginLoading: false });
    }
  },

  checkLoginStatus: async (deviceCode: string) => {
    const { isPollingRequestActive } = get();
    if (isPollingRequestActive) return;

    set({ isPollingRequestActive: true });

    try {
      const account = await invoke<Account>("complete_microsoft_login", {
        deviceCode,
      });

      // On success, stop polling and cleanup listener
      get().stopPolling();
      const { authProgressUnlisten } = get();
      if (authProgressUnlisten) {
        authProgressUnlisten();
        set({ authProgressUnlisten: null });
      }

      set({
        currentAccount: account,
        isLoginModalOpen: false,
      });
    } catch (error: unknown) {
      const errStr = String(error);
      if (errStr.includes("authorization_pending")) {
        // Still waiting — keep polling
      } else {
        set({ msLoginStatus: "Error: " + errStr });

        if (
          errStr.includes("expired_token") ||
          errStr.includes("access_denied")
        ) {
          // Terminal errors — stop polling and reset state
          get().stopPolling();
          const { authProgressUnlisten } = get();
          if (authProgressUnlisten) {
            authProgressUnlisten();
            set({ authProgressUnlisten: null });
          }
          alert("Login failed: " + errStr);
          set({ loginMode: "select" });
        }
      }
    } finally {
      set({ isPollingRequestActive: false });
    }
  },

  stopPolling: () => {
    const { pollInterval, authProgressUnlisten } = get();
    if (pollInterval) {
      try {
        clearInterval(pollInterval);
      } catch (err) {
        console.debug("Failed to clear poll interval:", err);
      }
      set({ pollInterval: null });
    }
    if (authProgressUnlisten) {
      try {
        authProgressUnlisten();
      } catch (err) {
        console.debug("Failed to unlisten auth progress:", err);
      }
      set({ authProgressUnlisten: null });
    }
  },

  cancelMicrosoftLogin: () => {
    get().stopPolling();
    set({
      deviceCodeData: null,
      msLoginLoading: false,
      msLoginStatus: "",
      loginMode: "select",
    });
  },

  setLoginMode: (mode: "select" | "offline" | "microsoft") => {
    set({ loginMode: mode });
  },

  setOfflineUsername: (username: string) => {
    set({ offlineUsername: username });
  },
}));
