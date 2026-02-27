import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Play, User, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listInstalledVersions, startGame } from "@/client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { useInstanceStore } from "@/models/instance";
import { useGameStore } from "@/stores/game-store";
import { LoginModal } from "./login-modal";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Spinner } from "./ui/spinner";

interface InstalledVersion {
  id: string;
  type: string;
}

export function BottomBar() {
  const authStore = useAuthStore();
  const gameStore = useGameStore();
  const instancesStore = useInstanceStore();

  const [isLaunched, setIsLaunched] = useState<boolean>(false);
  const gameUnlisten = useRef<UnlistenFn | null>(null);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<
    InstalledVersion[]
  >([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const loadInstalledVersions = useCallback(async () => {
    if (!instancesStore.activeInstance) {
      setInstalledVersions([]);
      setIsLoadingVersions(false);
      return;
    }

    setIsLoadingVersions(true);
    try {
      const versions = await listInstalledVersions(
        instancesStore.activeInstance.id,
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
    instancesStore.activeInstance,
    gameStore.selectedVersion,
    gameStore.setSelectedVersion,
  ]);

  useEffect(() => {
    loadInstalledVersions();

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

  const handleStartGame = async () => {
    if (!selectedVersion) {
      toast.info("Please select a version!");
      return;
    }

    if (!instancesStore.activeInstance) {
      toast.info("Please select an instance first!");
      return;
    }

    try {
      gameUnlisten.current = await listen("game-exited", () => {
        setIsLaunched(false);
      });
    } catch (error) {
      toast.warning(`Failed to listen to game-exited event: ${error}`);
    }

    setIsLaunching(true);
    try {
      await startGame(instancesStore.activeInstance?.id, selectedVersion);
      setIsLaunched(true);
    } catch (error) {
      console.error(`Failed to start game: ${error}`);
      toast.error(`Failed to start game: ${error}`);
    } finally {
      setIsLaunching(false);
    }
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

  const versionOptions = useMemo(
    () =>
      installedVersions.map((v) => ({
        label: `${v.id}${v.type !== "release" ? ` (${v.type})` : ""}`,
        value: v.id,
        type: v.type,
      })),
    [installedVersions],
  );

  const renderButton = () => {
    if (!authStore.account) {
      return (
        <Button
          className="px-4 py-2"
          size="lg"
          onClick={() => setShowLoginModal(true)}
        >
          <User /> Login
        </Button>
      );
    }

    return isLaunched ? (
      <Button
        variant="destructive"
        onClick={() => {
          toast.warning(
            "Minecraft Process will not be terminated, please close it manually.",
          );
          setIsLaunched(false);
        }}
      >
        <XIcon />
        Game started
      </Button>
    ) : (
      <Button
        className={cn(
          "px-4 py-2 shadow-xl",
          "bg-emerald-600! hover:bg-emerald-500!",
        )}
        size="lg"
        onClick={handleStartGame}
        disabled={isLaunching}
      >
        {isLaunching ? <Spinner /> : <Play />}
        Start
      </Button>
    );
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/30 via-transparent to-transparent p-4 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between bg-white/5 dark:bg-black/20 backdrop-blur-xl border border-white/10 dark:border-white/5 p-3 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Active Instance
              </span>
              <span className="text-sm font-medium text-white">
                {instancesStore.activeInstance?.name || "No instance selected"}
              </span>
            </div>

            <Select
              items={versionOptions}
              onValueChange={setSelectedVersion}
              disabled={isLoadingVersions}
            >
              <SelectTrigger className="max-w-48">
                <SelectValue
                  placeholder={
                    isLoadingVersions
                      ? "Loading versions..."
                      : "Please select a version"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {versionOptions.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className={getVersionTypeColor(item.type)}
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">{renderButton()}</div>
        </div>
      </div>

      <LoginModal
        open={showLoginModal}
        onOpenChange={() => setShowLoginModal(false)}
      />
    </div>
  );
}
