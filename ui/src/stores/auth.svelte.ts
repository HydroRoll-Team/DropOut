import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type { Account, DeviceCodeResponse } from "../types";
import { uiState } from "./ui.svelte";

export class AuthState {
  currentAccount = $state<Account | null>(null);
  isLoginModalOpen = $state(false);
  loginMode = $state<"select" | "offline" | "microsoft">("select");
  offlineUsername = $state("");
  deviceCodeData = $state<DeviceCodeResponse | null>(null);
  msLoginLoading = $state(false);
  msLoginStatus = $state("Waiting for authorization...");
  
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPollingRequestActive = false;

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
      if (confirm("Logout " + this.currentAccount.username + "?")) {
        invoke("logout").then(() => (this.currentAccount = null));
      }
      return;
    }
    this.resetLoginState();
    this.isLoginModalOpen = true;
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

    try {
      this.deviceCodeData = (await invoke(
        "start_microsoft_login"
      )) as DeviceCodeResponse;

      if (this.deviceCodeData) {
        try {
          await navigator.clipboard.writeText(this.deviceCodeData.user_code);
        } catch (e) {
          console.error("Clipboard failed", e);
        }

        open(this.deviceCodeData.verification_uri);

        console.log("Starting polling for token...");
        const intervalMs = (this.deviceCodeData.interval || 5) * 1000;
        this.pollInterval = setInterval(
          () => this.checkLoginStatus(this.deviceCodeData!.device_code),
          intervalMs
        );
      }
    } catch (e) {
      alert("Failed to start Microsoft login: " + e);
      this.loginMode = "select";
    } finally {
      this.msLoginLoading = false;
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
      this.isLoginModalOpen = false;
      uiState.setStatus("Welcome back, " + this.currentAccount.username);
    } catch (e: any) {
      const errStr = e.toString();
      if (errStr.includes("authorization_pending")) {
        console.log("Status: Waiting for user to authorize...");
      } else {
        console.error("Polling Error:", errStr);
        this.msLoginStatus = "Error: " + errStr;
        
        if (
          errStr.includes("expired_token") ||
          errStr.includes("access_denied")
        ) {
          this.stopPolling();
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
