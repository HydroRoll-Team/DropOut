import { useEffect } from "react";
import { Outlet } from "react-router";
import { BottomBar } from "@/components/bottom-bar";
import { DownloadMonitor } from "@/components/download-monitor";
import { GameConsole } from "@/components/game-console";
import { LoginModal } from "@/components/login-modal";
import { ParticleBackground } from "@/components/particle-background";
import { Sidebar } from "@/components/sidebar";

import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";
import { useInstancesStore } from "@/stores/instances-store";
import { useLogsStore } from "@/stores/logs-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";

export function IndexPage() {
  const authStore = useAuthStore();
  const settingsStore = useSettingsStore();
  const uiStore = useUIStore();
  const instancesStore = useInstancesStore();
  const gameStore = useGameStore();
  const logsStore = useLogsStore();
  useEffect(() => {
    // ENFORCE DARK MODE: Always add 'dark' class and attribute
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.remove("light");

    // Initialize stores
    // Include store functions in the dependency array to satisfy hooks lint.
    // These functions are stable in our store implementation, so listing them
    // here is safe and prevents lint warnings.
    authStore.checkAccount();
    settingsStore.loadSettings();
    logsStore.init();
    settingsStore.detectJava();
    instancesStore.loadInstances();
    gameStore.loadVersions();

    // Note: getVersion() would need Tauri API setup
    // getVersion().then((v) => uiStore.setAppVersion(v));
  }, [
    authStore.checkAccount,
    settingsStore.loadSettings,
    logsStore.init,
    settingsStore.detectJava,
    instancesStore.loadInstances,
    gameStore.loadVersions,
  ]);

  // Refresh versions when active instance changes
  useEffect(() => {
    if (instancesStore.activeInstanceId) {
      gameStore.loadVersions();
    } else {
      gameStore.setVersions([]);
    }
  }, [
    instancesStore.activeInstanceId,
    gameStore.loadVersions,
    gameStore.setVersions,
  ]);

  return (
    <div className="relative h-screen w-screen overflow-hidden dark:text-white text-gray-900 font-sans selection:bg-indigo-500/30">
      {/* Modern Animated Background */}
      <div className="absolute inset-0 z-0 bg-gray-100 dark:bg-[#09090b] overflow-hidden">
        {settingsStore.settings.customBackgroundPath && (
          <img
            src={settingsStore.settings.customBackgroundPath}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[20s] ease-linear"
            onError={(e) => console.error("Failed to load main background:", e)}
          />
        )}

        {/* Dimming Overlay for readability */}
        {settingsStore.settings.customBackgroundPath && (
          <div className="absolute inset-0 bg-black/50"></div>
        )}

        {!settingsStore.settings.customBackgroundPath && (
          <>
            {settingsStore.settings.theme === "dark" ? (
              <div className="absolute inset-0 opacity-60 bg-linear-to-br from-emerald-900 via-zinc-900 to-indigo-950"></div>
            ) : (
              <div className="absolute inset-0 opacity-100 bg-linear-to-br from-emerald-100 via-gray-100 to-indigo-100"></div>
            )}

            {uiStore.currentView === "home" && <ParticleBackground />}

            <div className="absolute inset-0 bg-linear-to-t from-zinc-900 via-transparent to-black/50 dark:from-zinc-900 dark:to-black/50"></div>
          </>
        )}

        {/* Subtle Grid Overlay */}
        <div
          className="absolute inset-0 z-0 dark:opacity-10 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${
              settingsStore.settings.theme === "dark" ? "#ffffff" : "#000000"
            } 1px, transparent 1px), linear-gradient(90deg, ${
              settingsStore.settings.theme === "dark" ? "#ffffff" : "#000000"
            } 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
            maskImage:
              "radial-gradient(circle at 50% 50%, black 30%, transparent 70%)",
          }}
        ></div>
      </div>

      {/* Content Wrapper */}
      <div className="relative z-10 flex h-full p-4 gap-4 text-gray-900 dark:text-white">
        {/* Floating Sidebar */}
        <Sidebar />

        {/* Main Content Area - Transparent & Flat */}
        <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden transition-all duration-300">
          {/* Window Drag Region */}
          <div
            className="h-8 w-full absolute top-0 left-0 z-50 drag-region"
            data-tauri-drag-region
          ></div>

          {/* App Content */}
          <div className="flex-1 relative overflow-hidden flex flex-col">
            {/* Views Container */}
            <div className="flex-1 relative overflow-hidden">
              <Outlet />
            </div>

            {/* Download Monitor Overlay */}
            <div className="absolute bottom-20 left-4 right-4 pointer-events-none z-20">
              <div className="pointer-events-auto">
                <DownloadMonitor />
              </div>
            </div>

            {/* Bottom Bar */}
            {uiStore.currentView === "home" && <BottomBar />}
          </div>
        </main>
      </div>

      <LoginModal />

      {/* Logout Confirmation Dialog */}
      {authStore.isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-200 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-2">Logout</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Are you sure you want to logout{" "}
              <span className="text-white font-medium">
                {authStore.currentAccount?.username}
              </span>
              ?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => authStore.cancelLogout()}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => authStore.confirmLogout()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {uiStore.showConsole && (
        <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="w-full h-full max-w-6xl max-h-[85vh] bg-[#1e1e1e] rounded-lg overflow-hidden border border-zinc-700 shadow-2xl relative flex flex-col">
            <GameConsole />
          </div>
        </div>
      )}
    </div>
  );
}
