import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Check, ChevronDown, Play, Terminal, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";
import { useInstancesStore } from "@/stores/instances-store";
import { useUIStore } from "@/stores/ui-store";

interface InstalledVersion {
  id: string;
  type: string;
}

export function BottomBar() {
  const authStore = useAuthStore();
  const gameStore = useGameStore();
  const instancesStore = useInstancesStore();
  const uiStore = useUIStore();

  const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);
  const [installedVersions, setInstalledVersions] = useState<
    InstalledVersion[]
  >([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadInstalledVersions = useCallback(async () => {
    if (!instancesStore.activeInstanceId) {
      setInstalledVersions([]);
      setIsLoadingVersions(false);
      return;
    }

    setIsLoadingVersions(true);
    try {
      const versions = await invoke<InstalledVersion[]>(
        "list_installed_versions",
        { instanceId: instancesStore.activeInstanceId },
      );

      const installed = versions || [];
      setInstalledVersions(installed);

      // If no version is selected but we have installed versions, select the first one
      if (!gameStore.selectedVersion && installed.length > 0) {
        gameStore.setSelectedVersion(installed[0].id);
      }
    } catch (error) {
      console.error("Failed to load installed versions:", error);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [
    instancesStore.activeInstanceId,
    gameStore.selectedVersion,
    gameStore.setSelectedVersion,
  ]);

  useEffect(() => {
    loadInstalledVersions();

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsVersionDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    // Listen for backend events that should refresh installed versions.
    let unlistenDownload: UnlistenFn | null = null;
    let unlistenVersionDeleted: UnlistenFn | null = null;

    (async () => {
      try {
        unlistenDownload = await listen("download-complete", () => {
          loadInstalledVersions();
        });
      } catch (err) {
        // best-effort: do not break UI if listening fails
        // eslint-disable-next-line no-console
        console.warn("Failed to attach download-complete listener:", err);
      }

      try {
        unlistenVersionDeleted = await listen("version-deleted", () => {
          loadInstalledVersions();
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to attach version-deleted listener:", err);
      }
    })();

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      try {
        if (unlistenDownload) unlistenDownload();
      } catch {
        // ignore
      }
      try {
        if (unlistenVersionDeleted) unlistenVersionDeleted();
      } catch {
        // ignore
      }
    };
  }, [loadInstalledVersions]);

  const selectVersion = (id: string) => {
    if (id !== "loading" && id !== "empty") {
      gameStore.setSelectedVersion(id);
      setIsVersionDropdownOpen(false);
    }
  };

  const handleStartGame = async () => {
    await gameStore.startGame(
      authStore.currentAccount,
      authStore.openLoginModal,
      instancesStore.activeInstanceId,
      uiStore.setView,
    );
  };

  const getVersionTypeColor = (type: string) => {
    switch (type) {
      case "release":
        return "bg-emerald-500";
      case "snapshot":
        return "bg-amber-500";
      case "old_beta":
        return "bg-rose-500";
      case "old_alpha":
        return "bg-violet-500";
      default:
        return "bg-gray-500";
    }
  };

  const versionOptions = isLoadingVersions
    ? [{ id: "loading", type: "loading", label: "Loading..." }]
    : installedVersions.length === 0
      ? [{ id: "empty", type: "empty", label: "No versions installed" }]
      : installedVersions.map((v) => ({
          ...v,
          label: `${v.id}${v.type !== "release" ? ` (${v.type})` : ""}`,
        }));

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/30 via-transparent to-transparent p-4 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between bg-white/5 dark:bg-black/20 backdrop-blur-xl rounded-xl border border-white/10 dark:border-white/5 p-3 shadow-lg">
          {/* Left: Instance Info */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Active Instance
              </span>
              <span className="text-sm font-medium text-white">
                {instancesStore.activeInstance?.name || "No instance selected"}
              </span>
            </div>

            {/* Version Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsVersionDropdownOpen(!isVersionDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-black/20 dark:bg-white/5 hover:bg-black/30 dark:hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
              >
                <span className="text-sm text-white">
                  {gameStore.selectedVersion || "Select Version"}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-zinc-400 transition-transform ${
                    isVersionDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dropdown */}
              {isVersionDropdownOpen && (
                <div className="absolute bottom-full mb-2 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
                  <div className="p-2">
                    {versionOptions.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => selectVersion(option.id)}
                        disabled={
                          option.id === "loading" || option.id === "empty"
                        }
                        className={`flex items-center justify-between w-full px-3 py-2 text-left rounded-md transition-colors ${
                          gameStore.selectedVersion === option.id
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "hover:bg-white/5 text-zinc-300"
                        } ${
                          option.id === "loading" || option.id === "empty"
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${getVersionTypeColor(
                              option.type,
                            )}`}
                          ></div>
                          <span className="text-sm font-medium">
                            {option.label}
                          </span>
                        </div>
                        {gameStore.selectedVersion === option.id && (
                          <Check size={14} className="text-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Console Toggle */}
            <button
              type="button"
              onClick={() => uiStore.toggleConsole()}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors"
            >
              <Terminal size={16} />
              <span className="text-sm font-medium">Console</span>
            </button>

            {/* User Login/Info */}
            <button
              type="button"
              onClick={() => authStore.openLoginModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            >
              <User size={16} />
              <span className="text-sm font-medium">
                {authStore.currentAccount?.username || "Login"}
              </span>
            </button>

            {/* Start Game */}
            <button
              type="button"
              onClick={handleStartGame}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Play size={16} />
              <span className="text-sm font-medium">Start</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
