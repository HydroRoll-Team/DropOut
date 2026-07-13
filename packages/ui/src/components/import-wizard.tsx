import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FolderOpenIcon,
  FolderSearchIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  detectLaunchers,
  importFromLauncher,
  scanLauncherInstances,
} from "@/client";
import type { DetectedLauncher, ImportableInstance } from "@/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Spinner } from "./ui/spinner";

type Step = "detect" | "select" | "importing";

function launcherLabel(type: string) {
  switch (type) {
    case "pcl-hmcl":
      return "PCL / HMCL";
    case "multimc-compatible":
      return "MultiMC compatible";
    default:
      return type.replaceAll("-", " ");
  }
}

function sourceLabel(instance: ImportableInstance) {
  if (instance.sourceKind === "version") return "version folder";
  if (instance.sourceKind === "instance") return "instance";
  return instance.sourceKind || "directory";
}

export function ImportWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("detect");
  const [launchers, setLaunchers] = useState<DetectedLauncher[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedLauncher, setSelectedLauncher] =
    useState<DetectedLauncher | null>(null);
  const [instances, setInstances] = useState<ImportableInstance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);

  const selectedInstances = useMemo(
    () => instances.filter((instance) => selected.has(instance.sourcePath)),
    [instances, selected],
  );

  const scan = useCallback(async () => {
    setScanning(true);
    setFailures([]);
    try {
      const result = await detectLaunchers();
      setLaunchers(result);
    } catch (e) {
      toast.error(`Failed to detect launchers: ${e}`);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStep("detect");
      setSelected(new Set());
      setInstances([]);
      setSelectedLauncher(null);
      setFailures([]);
      scan();
    }
  }, [open, scan]);

  const selectLauncher = async (launcher: DetectedLauncher) => {
    setSelectedLauncher(launcher);
    setSelected(new Set());
    setFailures([]);
    setScanning(true);
    try {
      const result = await scanLauncherInstances(launcher.instancesDir);
      setInstances(result);
      setStep("select");
    } catch (e) {
      toast.error(`Failed to scan instances: ${e}`);
    } finally {
      setScanning(false);
    }
  };

  const selectManualDirectory = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Select a launcher, instance, or .minecraft directory",
      });
      if (typeof picked !== "string") return;

      const result = await scanLauncherInstances(picked);
      const launcher: DetectedLauncher = {
        launcherType: "custom",
        instancesDir: picked,
        instanceCount: result.length,
      };
      setLaunchers((previous) => [launcher, ...previous]);
      setSelectedLauncher(launcher);
      setInstances(result);
      setSelected(new Set());
      setFailures([]);
      setStep("select");
    } catch (e) {
      toast.error(`Failed to scan selected directory: ${e}`);
    }
  };

  const toggleInstance = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(instances.map((instance) => instance.sourcePath)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const doImport = async () => {
    setStep("importing");
    setImporting(true);
    setImportProgress(0);
    setFailures([]);
    const paths = [...selected];
    let done = 0;
    const nextFailures: string[] = [];

    for (const instance of selectedInstances) {
      try {
        await importFromLauncher(instance.sourcePath);
        done++;
      } catch (e) {
        nextFailures.push(`${instance.name}: ${e}`);
      } finally {
        setImportProgress(
          Math.round(((done + nextFailures.length) / paths.length) * 100),
        );
      }
    }

    setImporting(false);
    setFailures(nextFailures);

    if (nextFailures.length > 0) {
      toast.error(`Imported ${done}, failed ${nextFailures.length}`);
      setStep("select");
      return;
    }

    toast.success(`Imported ${done} instance(s)`);
    onComplete?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[78vh] max-w-3xl flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {step === "detect" && "Import from another launcher"}
            {step === "select" &&
              `Import from ${launcherLabel(selectedLauncher?.launcherType ?? "launcher")}`}
            {step === "importing" && "Importing instances"}
          </DialogTitle>
          <DialogDescription>
            {step === "detect" &&
              "Scan Prism, MultiMC, PCL, HMCL, or choose a directory manually."}
            {step === "select" &&
              "Choose versions or isolated instances to copy into DropOut."}
            {step === "importing" && `Progress: ${importProgress}%`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {step === "detect" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={scan}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                  Auto scan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectManualDirectory}
                >
                  <FolderOpenIcon className="size-4" />
                  Choose directory
                </Button>
              </div>

              {scanning && (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              )}

              {!scanning && launchers.length === 0 && (
                <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                  <FolderSearchIcon className="mx-auto mb-2 size-8 opacity-40" />
                  <p>No compatible launchers detected</p>
                  <p className="mt-1 text-xs">
                    Choose a Prism instance folder, MultiMC instances folder, or
                    a PCL/HMCL .minecraft directory.
                  </p>
                </div>
              )}

              {launchers.map((launcher) => (
                <button
                  type="button"
                  key={`${launcher.launcherType}:${launcher.instancesDir}`}
                  onClick={() => selectLauncher(launcher)}
                  className="flex w-full items-center gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <DownloadIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium capitalize">
                        {launcherLabel(launcher.launcherType)}
                      </p>
                      <Badge variant="outline">
                        {launcher.instanceCount} item
                        {launcher.instanceCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {launcher.instancesDir}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === "select" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {instances.length} importable item
                    {instances.length === 1 ? "" : "s"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedLauncher?.instancesDir}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" onClick={selectAll}>
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {failures.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {failures.length} import failure
                    {failures.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {failures.slice(0, 4).map((failure) => (
                      <li key={failure}>{failure}</li>
                    ))}
                  </ul>
                </div>
              )}

              {instances.length === 0 && (
                <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                  <SearchIcon className="mx-auto mb-2 size-8 opacity-40" />
                  <p>No instances or versions found in this directory</p>
                </div>
              )}

              {instances.map((instance, index) => (
                <label
                  key={instance.sourcePath}
                  htmlFor={`import-instance-${index}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    id={`import-instance-${index}`}
                    checked={selected.has(instance.sourcePath)}
                    onCheckedChange={() => toggleInstance(instance.sourcePath)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{instance.name}</p>
                      <Badge variant="secondary">
                        {launcherLabel(instance.launcherType)}
                      </Badge>
                      <Badge variant="outline">{sourceLabel(instance)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {instance.minecraftVersion && (
                        <span>Minecraft {instance.minecraftVersion}</span>
                      )}
                      {instance.modLoader && (
                        <span>
                          {instance.modLoader}
                          {instance.modLoaderVersion &&
                            ` ${instance.modLoaderVersion}`}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {instance.gameDir || instance.sourcePath}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              {importing ? (
                <Spinner />
              ) : (
                <CheckCircle2Icon className="size-8 text-emerald-500" />
              )}
              <p className="text-sm text-muted-foreground">
                {importProgress}% complete
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => setStep("detect")}>
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
              <Button
                onClick={doImport}
                disabled={selected.size === 0 || importing}
              >
                Import {selected.size > 0 && `(${selected.size})`}
              </Button>
            </>
          )}
          {step === "detect" && (
            <Button variant="outline" onClick={selectManualDirectory}>
              <FolderOpenIcon className="size-4" />
              Choose directory
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
