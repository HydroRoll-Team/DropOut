import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Account, DeviceCodeResponse } from "../types";
import { uiState } from "./ui.svelte";
import { logsState } from "./logs.svelte";

export class AuthState {
  currentAccount = $state<Account | null>(null);
  isLoginModalOpen = $state(false);
  isLogoutConfirmOpen = $state(false);
  loginMode = $state<"select" | "offline" | "microsoft">("select");
  offlineUsername = $state("");
  deviceCodeData = $state<DeviceCodeResponse | null>(null);
  msLoginLoading = $state(false);
  msLoginStatus = $state("Waiting for authorization...");

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPollingRequestActive = false;
  private authProgressUnlisten: UnlistenFn | null = null;

  async checkAccount() {
    try {
      const acc = await invoke("get_active_account");
      this.currentAccount = acc as Account | null;
    } catch (e) {
      console.error("Failed to check account:", e);
    }
  }

  openLoginModal() {
    if (this.currentAccount) {
      // Show custom logout confirmation dialog
      this.isLogoutConfirmOpen = true;
      return;
    }
    this.resetLoginState();
    this.isLoginModalOpen = true;
  }

  cancelLogout() {
    this.isLogoutConfirmOpen = false;
  }

  async confirmLogout() {
    this.isLogoutConfirmOpen = false;
    try {
      await invoke("logout");
      this.currentAccount = null;
      uiState.setStatus("Logged out successfully");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  }

  closeLoginModal() {
    this.stopPolling();
    this.isLoginModalOpen = false;
  }

  resetLoginState() {
    this.loginMode = "select";
    this.offlineUsername = "";
    this.deviceCodeData = null;
    this.msLoginLoading = false;
  }

  async performOfflineLogin() {
    if (!this.offlineUsername) return;
    try {
      this.currentAccount = (await invoke("login_offline", {
        username: this.offlineUsername,
      })) as Account;
      this.isLoginModalOpen = false;
    } catch (e) {
      alert("Login failed: " + e);
    }
  }

  async startMicrosoftLogin() {
    this.loginMode = "microsoft";
    this.msLoginLoading = true;
    this.msLoginStatus = "Waiting for authorization...";
    this.stopPolling();

    // Setup auth progress listener
    this.setupAuthProgressListener();

    try {
      this.deviceCodeData = (await invoke("start_microsoft_login")) as DeviceCodeResponse;

      if (this.deviceCodeData) {
        try {
          await navigator.clipboard.writeText(this.deviceCodeData.user_code);
        } catch (e) {
          console.error("Clipboard failed", e);
        }

        open(this.deviceCodeData.verification_uri);
        logsState.addLog(
          "info",
          "Auth",
          "Microsoft login started, waiting for browser authorization...",
        );

        console.log("Starting polling for token...");
        const intervalMs = (this.deviceCodeData.interval || 5) * 1000;
        this.pollInterval = setInterval(
          () => this.checkLoginStatus(this.deviceCodeData!.device_code),
          intervalMs,
        );
      }
    } catch (e) {
      logsState.addLog("error", "Auth", `Failed to start Microsoft login: ${e}`);
      alert("Failed to start Microsoft login: " + e);
      this.loginMode = "select";
    } finally {
      this.msLoginLoading = false;
    }
  }

  private async setupAuthProgressListener() {
    // Clean up previous listener if exists
    if (this.authProgressUnlisten) {
      this.authProgressUnlisten();
      this.authProgressUnlisten = null;
    }

    this.authProgressUnlisten = await listen<string>("auth-progress", (event) => {
      const message = event.payload;
      this.msLoginStatus = message;
      logsState.addLog("info", "Auth", message);
    });
  }

  private cleanupAuthListener() {
    if (this.authProgressUnlisten) {
      this.authProgressUnlisten();
      this.authProgressUnlisten = null;
    }
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async checkLoginStatus(deviceCode: string) {
    if (this.isPollingRequestActive) return;
    this.isPollingRequestActive = true;

    console.log("Polling Microsoft API...");
    try {
      this.currentAccount = (await invoke("complete_microsoft_login", {
        deviceCode,
      })) as Account;

      console.log("Login Successful!", this.currentAccount);
      this.stopPolling();
      this.cleanupAuthListener();
      this.isLoginModalOpen = false;
      logsState.addLog(
        "info",
        "Auth",
        `Login successful! Welcome, ${this.currentAccount.username}`,
      );
      uiState.setStatus("Welcome back, " + this.currentAccount.username);
    } catch (e: any) {
      const errStr = e.toString();
      if (errStr.includes("authorization_pending")) {
        console.log("Status: Waiting for user to authorize...");
      } else {
        console.error("Polling Error:", errStr);
        this.msLoginStatus = "Error: " + errStr;
        logsState.addLog("error", "Auth", `Login error: ${errStr}`);

        if (errStr.includes("expired_token") || errStr.includes("access_denied")) {
          this.stopPolling();
          this.cleanupAuthListener();
          alert("Login failed: " + errStr);
          this.loginMode = "select";
        }
      }
    } finally {
      this.isPollingRequestActive = false;
    }
  }
}

export const authState = new AuthState();
