import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CopyIcon,
  EditIcon,
  FolderOpenIcon,
  Plus,
  RocketIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { openFileExplorer } from "@/client";
import InstanceCreationModal from "@/components/instance-creation-modal";
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
import { useInstanceStore } from "@/models/instance";
import { useGameStore } from "@/stores/game-store";
import type { Instance } from "@/types";

export function InstancesView() {
  const account = useAuthStore((state) => state.account);
  const instancesStore = useInstanceStore();
  const startGame = useGameStore((state) => state.startGame);
  const stopGame = useGameStore((state) => state.stopGame);
  const runningInstanceId = useGameStore((state) => state.runningInstanceId);
  const launchingInstanceId = useGameStore((state) => state.launchingInstanceId);
  const stoppingInstanceId = useGameStore((state) => state.stoppingInstanceId);
  const [isImporting, setIsImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Modal / UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

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
    setShowCreateModal(true);
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
          Instances
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleImport}
            disabled={isImporting}
          >
            {isImporting ? "Importing..." : "Import"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRepair}
            disabled={repairing}
          >
            {repairing ? "Repairing..." : "Repair Index"}
          </Button>
          <Button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 transition-colors"
          >
            <Plus size={18} />
            Create Instance
          </Button>
        </div>
      </div>

      {instancesStore.instances.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">No instances yet</p>
            <p className="text-sm">Create your first instance to get started</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col space-y-3">
          {instancesStore.instances.map((instance) => {
            const isActive = instancesStore.activeInstance?.id === instance.id;
            const isRunning = runningInstanceId === instance.id;
            const isLaunching = launchingInstanceId === instance.id;
            const isStopping = stoppingInstanceId === instance.id;
            const otherInstanceRunning = runningInstanceId !== null && !isRunning;

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
                          No version selected
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
                            console.error("Failed to set active instance:", error);
                            toast.error("Error setting active instance");
                            return;
                          }

                          if (isRunning) {
                            await stopGame(instance.id);
                            return;
                          }

                          if (!instance.versionId) {
                            toast.error("No version selected or installed");
                            return;
                          }

                          await startGame(
                            account,
                            () => {
                              toast.info("Please login first");
                            },
                            instance.id,
                            instance.versionId,
                            () => undefined,
                          );
                        }}
                        disabled={otherInstanceRunning || isLaunching || isStopping}
                      >
                        {isLaunching || isStopping ? (
                          <span className="text-xs">...</span>
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

      <InstanceCreationModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

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
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedInstance?.name}"? This
              action cannot be undone.
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
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Instance</DialogTitle>
            <DialogDescription>
              Provide a name for the duplicated instance.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="New instance name"
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
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDuplicate}
              disabled={!duplicateName.trim()}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
