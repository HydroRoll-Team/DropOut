import {
  ArrowLeftIcon,
  DownloadIcon,
  FolderSearchIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  const scan = useCallback(async () => {
    setScanning(true);
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
      scan();
    }
  }, [open, scan]);

  const selectLauncher = async (launcher: DetectedLauncher) => {
    setSelectedLauncher(launcher);
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

  const toggleInstance = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const doImport = async () => {
    setStep("importing");
    setImporting(true);
    setImportProgress(0);
    const paths = [...selected];
    let done = 0;

    for (const sourcePath of paths) {
      try {
        await importFromLauncher(sourcePath);
        done++;
        setImportProgress(Math.round((done / paths.length) * 100));
      } catch (e) {
        toast.error(`Failed to import: ${e}`);
      }
    }

    setImporting(false);
    toast.success(`Imported ${done} instance(s)`);
    onComplete?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {step === "detect" && "Import from Launcher"}
            {step === "select" &&
              `Select Instances — ${selectedLauncher?.launcherType}`}
            {step === "importing" && "Importing..."}
          </DialogTitle>
          <DialogDescription>
            {step === "detect" && "Select a launcher to import instances from."}
            {step === "select" && "Choose which instances to import."}
            {step === "importing" && `Progress: ${importProgress}%`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {step === "detect" && (
            <>
              {scanning && (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              )}
              {!scanning && launchers.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <FolderSearchIcon className="size-8 mx-auto mb-2 opacity-40" />
                  <p>No compatible launchers detected</p>
                </div>
              )}
              {launchers.map((l) => (
                <button
                  type="button"
                  key={l.instancesDir}
                  onClick={() => selectLauncher(l)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
                >
                  <DownloadIcon className="size-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize">{l.launcherType}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.instanceCount} instance(s)
                    </p>
                  </div>
                </button>
              ))}
            </>
          )}

          {step === "select" &&
            instances.map((inst, index) => (
              <label
                key={inst.sourcePath}
                htmlFor={`import-instance-${index}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <Checkbox
                  id={`import-instance-${index}`}
                  checked={selected.has(inst.sourcePath)}
                  onCheckedChange={() => toggleInstance(inst.sourcePath)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inst.name}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {inst.minecraftVersion && (
                      <span>{inst.minecraftVersion}</span>
                    )}
                    {inst.modLoader && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                      >
                        {inst.modLoader}
                        {inst.modLoaderVersion && ` ${inst.modLoaderVersion}`}
                      </Badge>
                    )}
                  </div>
                </div>
              </label>
            ))}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Spinner />
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
            <Button variant="outline" onClick={scan} disabled={scanning}>
              <RefreshCwIcon className="size-4" />
              Refresh
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
