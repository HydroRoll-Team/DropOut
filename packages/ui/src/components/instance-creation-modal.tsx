import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getFabricLoadersForVersion,
  getForgeVersionsForGame,
  installFabric,
  installForge,
  installVersion,
} from "@/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInstanceStore } from "@/models/instance";
import { useGameStore } from "@/stores/game-store";
import type {
  FabricLoaderEntry,
  ForgeVersion as ForgeVersionEntry,
  Version,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstanceCreationModal({ open, onOpenChange }: Props) {
  const gameStore = useGameStore();
  const instancesStore = useInstanceStore();

  // Steps: 1 = name, 2 = version, 3 = mod loader
  const [step, setStep] = useState<number>(1);

  // Step 1
  const [instanceName, setInstanceName] = useState<string>("");

  // Step 2
  const [versionSearch, setVersionSearch] = useState<string>("");
  const [versionFilter, setVersionFilter] = useState<
    "all" | "release" | "snapshot"
  >("release");
  const [selectedVersionUI, setSelectedVersionUI] = useState<Version | null>(
    null,
  );

  // Step 3
  const [modLoaderType, setModLoaderType] = useState<
    "vanilla" | "fabric" | "forge"
  >("vanilla");
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderEntry[]>([]);
  const [forgeVersions, setForgeVersions] = useState<ForgeVersionEntry[]>([]);
  const [selectedFabricLoader, setSelectedFabricLoader] = useState<string>("");
  const [selectedForgeLoader, setSelectedForgeLoader] = useState<string>("");
  const [loadingLoaders, setLoadingLoaders] = useState(false);

  const loadModLoaders = useCallback(async () => {
    if (!selectedVersionUI) return;
    setLoadingLoaders(true);
    setFabricLoaders([]);
    setForgeVersions([]);
    try {
      if (modLoaderType === "fabric") {
        const loaders = await getFabricLoadersForVersion(selectedVersionUI.id);
        setFabricLoaders(loaders || []);
        if (loaders && loaders.length > 0) {
          setSelectedFabricLoader(loaders[0].loader.version);
        } else {
          setSelectedFabricLoader("");
        }
      } else if (modLoaderType === "forge") {
        const versions = await getForgeVersionsForGame(selectedVersionUI.id);
        setForgeVersions(versions || []);
        if (versions && versions.length > 0) {
          // Binding `ForgeVersion` uses `version` (not `id`) — use `.version` here.
          setSelectedForgeLoader(versions[0].version);
        } else {
          setSelectedForgeLoader("");
        }
      }
    } catch (e) {
      console.error("Failed to load mod loaders:", e);
      toast.error("Failed to fetch mod loader versions");
    } finally {
      setLoadingLoaders(false);
    }
  }, [modLoaderType, selectedVersionUI]);

  // When entering step 3 and a base version exists, fetch loaders if needed
  useEffect(() => {
    if (step === 3 && modLoaderType !== "vanilla" && selectedVersionUI) {
      loadModLoaders();
    }
  }, [step, modLoaderType, selectedVersionUI, loadModLoaders]);

  // Creating state
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Derived filtered versions
  const filteredVersions = useMemo(() => {
    const all = gameStore.versions || [];
    let list = all.slice();
    if (versionFilter !== "all") {
      list = list.filter((v) => v.type === versionFilter);
    }
    if (versionSearch.trim()) {
      const q = versionSearch.trim().toLowerCase().replace(/。/g, ".");
      list = list.filter((v) => v.id.toLowerCase().includes(q));
    }
    return list;
  }, [gameStore.versions, versionFilter, versionSearch]);

  // Reset when opened/closed
  useEffect(() => {
    if (open) {
      // ensure versions are loaded
      gameStore.loadVersions();
      setStep(1);
      setInstanceName("");
      setVersionSearch("");
      setVersionFilter("release");
      setSelectedVersionUI(null);
      setModLoaderType("vanilla");
      setFabricLoaders([]);
      setForgeVersions([]);
      setSelectedFabricLoader("");
      setSelectedForgeLoader("");
      setErrorMessage("");
      setCreating(false);
    }
  }, [open, gameStore.loadVersions]);

  function validateStep1(): boolean {
    if (!instanceName.trim()) {
      setErrorMessage("Please enter an instance name");
      return false;
    }
    setErrorMessage("");
    return true;
  }

  function validateStep2(): boolean {
    if (!selectedVersionUI) {
      setErrorMessage("Please select a Minecraft version");
      return false;
    }
    setErrorMessage("");
    return true;
  }

  async function handleNext() {
    setErrorMessage("");
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
    } else if (step === 2) {
      if (!validateStep2()) return;
      setStep(3);
    }
  }

  function handleBack() {
    setErrorMessage("");
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleCreate() {
    if (!validateStep1() || !validateStep2()) return;
    setCreating(true);
    setErrorMessage("");

    try {
      // Step 1: create instance
      const instance = await instancesStore.create(instanceName.trim());

      // If selectedVersion provided, install it
      if (selectedVersionUI && instance) {
        try {
          await installVersion(instance?.id, selectedVersionUI.id);
        } catch (err) {
          console.error("Failed to install base version:", err);
          // continue - instance created but version install failed
          toast.error(
            `Failed to install version ${selectedVersionUI.id}: ${String(err)}`,
          );
        }
      }

      // If mod loader selected, install it
      if (modLoaderType === "fabric" && selectedFabricLoader && instance) {
        try {
          await installFabric(
            instance?.id,
            selectedVersionUI?.id ?? "",
            selectedFabricLoader,
          );
        } catch (err) {
          console.error("Failed to install Fabric:", err);
          toast.error(`Failed to install Fabric: ${String(err)}`);
        }
      } else if (modLoaderType === "forge" && selectedForgeLoader && instance) {
        try {
          await installForge(
            instance?.id,
            selectedVersionUI?.id ?? "",
            selectedForgeLoader,
          );
        } catch (err) {
          console.error("Failed to install Forge:", err);
          toast.error(`Failed to install Forge: ${String(err)}`);
        }
      }

      // Refresh instances list
      await instancesStore.refresh();

      toast.success("Instance created successfully");
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to create instance:", e);
      setErrorMessage(String(e));
      toast.error(`Failed to create instance: ${e}`);
    } finally {
      setCreating(false);
    }
  }

  // UI pieces
  const StepIndicator = () => (
    <div className="flex gap-2 w-full">
      <div
        className={`flex-1 h-1 rounded ${step >= 1 ? "bg-indigo-500" : "bg-zinc-700"}`}
      />
      <div
        className={`flex-1 h-1 rounded ${step >= 2 ? "bg-indigo-500" : "bg-zinc-700"}`}
      />
      <div
        className={`flex-1 h-1 rounded ${step >= 3 ? "bg-indigo-500" : "bg-zinc-700"}`}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create New Instance</DialogTitle>
          <DialogDescription>
            Multi-step wizard — create an instance and optionally install a
            version or mod loader.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <div className="pt-4 pb-6">
            <StepIndicator />
          </div>

          {/* Step 1 - Name */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="instance-name"
                  className="block text-sm font-medium mb-2"
                >
                  Instance Name
                </label>
                <Input
                  id="instance-name"
                  placeholder="My Minecraft Instance"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  disabled={creating}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Give your instance a memorable name.
              </p>
            </div>
          )}

          {/* Step 2 - Version selection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={versionSearch}
                    onChange={(e) => setVersionSearch(e.target.value)}
                    placeholder="Search versions..."
                    className="pl-9"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={versionFilter === "all" ? "default" : "outline"}
                    onClick={() => setVersionFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant={
                      versionFilter === "release" ? "default" : "outline"
                    }
                    onClick={() => setVersionFilter("release")}
                  >
                    Release
                  </Button>
                  <Button
                    type="button"
                    variant={
                      versionFilter === "snapshot" ? "default" : "outline"
                    }
                    onClick={() => setVersionFilter("snapshot")}
                  >
                    Snapshot
                  </Button>
                </div>
              </div>

              <ScrollArea className="max-h-[36vh]">
                <div className="space-y-2 py-2">
                  {gameStore.versions.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="animate-spin mr-2" />
                      Loading versions...
                    </div>
                  ) : filteredVersions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No matching versions found
                    </div>
                  ) : (
                    filteredVersions.map((v) => {
                      const isSelected = selectedVersionUI?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVersionUI(v)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isSelected
                              ? "bg-indigo-50 dark:bg-indigo-600/20 border-indigo-200"
                              : "bg-white/40 dark:bg-white/5 border-black/5 dark:border-white/5 hover:bg-white/60"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-mono font-bold">{v.id}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {v.type}{" "}
                                {v.releaseTime
                                  ? ` • ${new Date(v.releaseTime).toLocaleDateString()}`
                                  : ""}
                              </div>
                            </div>
                            {v.javaVersion && (
                              <div className="text-sm">
                                Java {v.javaVersion}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 3 - Mod loader */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Mod Loader Type</div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={
                      modLoaderType === "vanilla" ? "default" : "outline"
                    }
                    onClick={() => setModLoaderType("vanilla")}
                  >
                    Vanilla
                  </Button>
                  <Button
                    type="button"
                    variant={modLoaderType === "fabric" ? "default" : "outline"}
                    onClick={() => setModLoaderType("fabric")}
                  >
                    Fabric
                  </Button>
                  <Button
                    type="button"
                    variant={modLoaderType === "forge" ? "default" : "outline"}
                    onClick={() => setModLoaderType("forge")}
                  >
                    Forge
                  </Button>
                </div>
              </div>

              {modLoaderType === "fabric" && (
                <div>
                  {loadingLoaders ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="animate-spin" />
                      Loading Fabric versions...
                    </div>
                  ) : fabricLoaders.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        value={selectedFabricLoader}
                        onChange={(e) =>
                          setSelectedFabricLoader(e.target.value)
                        }
                        className="w-full px-3 py-2 rounded border bg-transparent"
                      >
                        {fabricLoaders.map((f) => (
                          <option
                            key={f.loader.version}
                            value={f.loader.version}
                          >
                            {f.loader.version}{" "}
                            {f.loader.stable ? "(Stable)" : "(Beta)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No Fabric loaders available for this version
                    </p>
                  )}
                </div>
              )}

              {modLoaderType === "forge" && (
                <div>
                  {loadingLoaders ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="animate-spin" />
                      Loading Forge versions...
                    </div>
                  ) : forgeVersions.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        value={selectedForgeLoader}
                        onChange={(e) => setSelectedForgeLoader(e.target.value)}
                        className="w-full px-3 py-2 rounded border bg-transparent"
                      >
                        {forgeVersions.map((f) => (
                          // binding ForgeVersion uses `version` as the identifier
                          <option key={f.version} value={f.version}>
                            {f.version}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No Forge versions available for this version
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="text-sm text-red-400 mt-3">{errorMessage}</div>
          )}
        </div>

        <DialogFooter>
          <div className="w-full flex justify-between items-center">
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  // cancel
                  onOpenChange(false);
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>

            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={creating}
                >
                  Back
                </Button>
              )}

              {step < 3 ? (
                <Button type="button" onClick={handleNext} disabled={creating}>
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InstanceCreationModal;
