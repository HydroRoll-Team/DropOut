import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CopyIcon,
  EditIcon,
  EllipsisIcon,
  FolderOpenIcon,
  GlobeIcon,
  PackageIcon,
  Plus,
  RocketIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { openFileExplorer } from "@/client";
import { ImportWizard } from "@/components/import-wizard";
import InstanceEditorModal from "@/components/instance-editor-modal";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import type { Instance } from "@/types";

export function InstancesPage() {
  const { t } = useTranslation();
  const instancesStore = useInstanceStore();
  const navigate = useNavigate();

  const account = useAuthStore((state) => state.account);
  const {
    startGame,
    runningInstanceId,
    stoppingInstanceId,
    launchingInstanceId,
    stopGame,
  } = useGameStore();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Selected / editing instance state
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(
    null,
  );
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);

  // Form fields
  const [duplicateName, setDuplicateName] = useState("");

  useEffect(() => {
    instancesStore.refresh();
  }, [instancesStore.refresh]);

  // Handlers to open modals
  const openCreate = () => {
    navigate("/instances/create");
  };

  const openEdit = (instance: Instance) => {
    setEditingInstance({ ...instance });
    setShowEditModal(true);
  };

  const openDelete = (instance: Instance) => {
    setSelectedInstance(instance);
    setShowDeleteConfirm(true);
  };

  const openDuplicate = (instance: Instance) => {
    setSelectedInstance(instance);
    setDuplicateName(`${instance.name} (Copy)`);
    setShowDuplicateModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedInstance) return;
    await instancesStore.delete(selectedInstance.id);
    setSelectedInstance(null);
    setShowDeleteConfirm(false);
  };

  const confirmDuplicate = async () => {
    if (!selectedInstance) return;
    const name = duplicateName.trim();
    if (!name) return;
    await instancesStore.duplicate(selectedInstance.id, name);
    setSelectedInstance(null);
    setDuplicateName("");
    setShowDuplicateModal(false);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });

      if (typeof selected !== "string") {
        return;
      }

      await instancesStore.importArchive(selected);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRepair = async () => {
    setRepairing(true);
    try {
      await instancesStore.repair();
    } finally {
      setRepairing(false);
    }
  };

  const handleExport = async (instance: Instance) => {
    setExportingId(instance.id);
    try {
      const filePath = await save({
        defaultPath: `${instance.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });

      if (!filePath) {
        return;
      }

      await instancesStore.exportArchive(instance.id, filePath);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("instances.title")}
        </h1>
        <div className="flex flex-row space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleImport}
            disabled={isImporting}
          >
            {isImporting ? t("instances.importing") : t("instances.importZip")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowImportWizard(true)}
          >
            {t("instances.fromLauncher")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRepair}
            disabled={repairing}
          >
            {repairing ? t("instances.repairing") : t("instances.repairIndex")}
          </Button>
          <Button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 transition-colors"
          >
            <Plus size={18} />
            {t("instances.create")}
          </Button>
        </div>
      </div>

      {instancesStore.instances.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">{t("instances.noInstances")}</p>
            <p className="text-sm">{t("instances.noInstancesHint")}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col space-y-3">
          {instancesStore.instances.map((instance) => {
            const isActive = instancesStore.activeInstance?.id === instance.id;
            const isLaunching = launchingInstanceId === instance.id;
            const isStopping = stoppingInstanceId === instance.id;
            const isRunning = runningInstanceId === instance.id;

            return (
              <li
                key={instance.id}
                onClick={() => instancesStore.setActiveInstance(instance)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    try {
                      await instancesStore.setActiveInstance(instance);
                    } catch (e) {
                      console.error("Failed to set active instance:", e);
                      toast.error("Error setting active instance");
                    }
                  }
                }}
                className="cursor-pointer"
              >
                <div
                  className={cn(
                    "flex flex-row space-x-3 p-3 justify-between",
                    "border bg-card/5 backdrop-blur-xl",
                    "hover:bg-accent/50 transition-colors",
                    isActive && "border-primary",
                  )}
                >
                  <div className="flex flex-row space-x-4">
                    {instance.iconPath ? (
                      <div className="w-12 h-12 rounded overflow-hidden">
                        <img
                          src={instance.iconPath}
                          alt={instance.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {instance.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col">
                      <h3 className="text-lg font-semibold">{instance.name}</h3>
                      {instance.versionId ? (
                        <p className="text-sm text-muted-foreground">
                          {instance.versionId}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("instances.noVersion")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="flex flex-row space-x-2">
                      <Button
                        variant={isRunning ? "destructive" : "ghost"}
                        size="icon"
                        onClick={async (e) => {
                          e.stopPropagation();

                          try {
                            await instancesStore.setActiveInstance(instance);
                          } catch (error) {
                            console.error(
                              "Failed to set active instance:",
                              error,
                            );
                            toast.error("Error setting active instance");
                            return;
                          }

                          if (isRunning) {
                            await stopGame(instance.id);
                            return;
                          }

                          if (!instance.versionId) {
                            toast.error(t("instances.noVersionError"));
                            return;
                          }

                          if (!account) {
                            toast.info(t("instances.loginFirst"));
                            return;
                          }

                          try {
                            await startGame(instance.id, instance.versionId);
                          } catch (error) {
                            console.error("Failed to start game:", error);
                            toast.error("Error starting game");
                          }
                        }}
                        disabled={
                          (!!runningInstanceId &&
                            runningInstanceId !== instance.id) ||
                          isLaunching ||
                          isStopping
                        }
                      >
                        {isLaunching || isStopping ? (
                          <EllipsisIcon />
                        ) : isRunning ? (
                          <XIcon />
                        ) : (
                          <RocketIcon />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openFileExplorer(instance.gameDir);
                        }}
                      >
                        <FolderOpenIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleExport(instance);
                        }}
                        disabled={exportingId === instance.id}
                      >
                        <span className="text-xs">
                          {exportingId === instance.id ? "..." : "ZIP"}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDuplicate(instance);
                        }}
                      >
                        <CopyIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/instances/${instance.id}/mods`);
                        }}
                        title={t("instances.manageMods")}
                      >
                        <PackageIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/instances/${instance.id}/browse`);
                        }}
                        title={t("instances.browseContent")}
                      >
                        <GlobeIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(instance);
                        }}
                      >
                        <EditIcon />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDelete(instance);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*<InstanceCreationModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />*/}

      <InstanceEditorModal
        open={showEditModal}
        instance={editingInstance}
        onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) setEditingInstance(null);
        }}
      />

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("instances.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("instances.deleteConfirm", { name: selectedInstance?.name })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setSelectedInstance(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("instances.duplicateTitle")}</DialogTitle>
            <DialogDescription>
              {t("instances.duplicateHint")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder={t("instances.duplicatePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && confirmDuplicate()}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDuplicateModal(false);
                setSelectedInstance(null);
                setDuplicateName("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={confirmDuplicate}
              disabled={!duplicateName.trim()}
            >
              {t("common.duplicate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportWizard
        open={showImportWizard}
        onOpenChange={setShowImportWizard}
        onComplete={() => instancesStore.refresh()}
      />
    </div>
  );
}
