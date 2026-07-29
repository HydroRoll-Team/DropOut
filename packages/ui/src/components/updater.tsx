import { check } from "@tauri-apps/plugin-updater";
import { marked } from "marked";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { isLauncherFixtureMode } from "@/lib/launcher-runtime";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Spinner } from "./ui/spinner";

interface UpdateInfo {
  version: string;
  body: string;
}

export function useUpdater() {
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDialog, setShowDialog] = useState(false);

  const checkForUpdate = useCallback(async (silent = false) => {
    if (isLauncherFixtureMode()) return;

    setChecking(true);
    try {
      const result = await check();
      if (result) {
        setUpdate({
          version: result.version,
          body: result.body ?? "",
        });
        setShowDialog(true);
      } else if (!silent) {
        toast.info("You're on the latest version");
      }
    } catch (e) {
      if (!silent) {
        toast.error(`Update check failed: ${e}`);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (isLauncherFixtureMode()) return;

    setDownloading(true);
    setProgress(0);
    try {
      const result = await check();
      if (!result) return;

      await result.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          setProgress(0);
        } else if (event.event === "Progress") {
          setProgress((prev) => prev + (event.data.chunkLength ?? 0));
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      toast.success("Update installed. Please restart the app.");
    } catch (e) {
      toast.error(`Update failed: ${e}`);
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    checking,
    update,
    downloading,
    progress,
    showDialog,
    setShowDialog,
    checkForUpdate,
    downloadAndInstall,
  };
}

export function UpdateDialog({
  update,
  open,
  onOpenChange,
  downloading,
  onConfirm,
}: {
  update: UpdateInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloading: boolean;
  onConfirm: () => void;
}) {
  if (!update) return null;

  const html = marked.parse(update.body || "No changelog available.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Update Available: v{update.version}</DialogTitle>
          <DialogDescription>
            A new version is ready to install.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex-1 overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown changelog
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={downloading}
          >
            Later
          </Button>
          <Button onClick={onConfirm} disabled={downloading}>
            {downloading && <Spinner />}
            {downloading ? "Installing..." : "Update Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
