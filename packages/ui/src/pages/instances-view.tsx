import { Copy, Edit2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { toNumber } from "@/lib/tsrs-utils";
import { useInstanceStore } from "@/models/instance";
import type { Instance } from "../types/bindings/instance";

export function InstancesView() {
  const instancesStore = useInstanceStore();

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

  const formatDate = (timestamp: number): string =>
    new Date(timestamp * 1000).toLocaleDateString();

  const formatLastPlayed = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col gap-4 p-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Instances
        </h1>
        <Button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 transition-colors"
        >
          <Plus size={18} />
          Create Instance
        </Button>
      </div>

      {instancesStore.instances.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">No instances yet</p>
            <p className="text-sm">Create your first instance to get started</p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instancesStore.instances.map((instance) => {
            const isActive = instancesStore.activeInstance?.id === instance.id;

            return (
              <li
                key={instance.id}
                onClick={() => instancesStore.setActiveInstance(instance)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  instancesStore.setActiveInstance(instance)
                }
                className={`relative p-4 text-left border-2 transition-all cursor-pointer hover:border-blue-500 ${
                  isActive ? "border-blue-500" : "border-transparent"
                } bg-gray-100 dark:bg-gray-800`}
              >
                {/* Instance Icon */}
                {instance.iconPath ? (
                  <div className="w-12 h-12 mb-3 rounded overflow-hidden">
                    <img
                      src={instance.iconPath}
                      alt={instance.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 mb-3 rounded bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {instance.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {instance.name}
                </h3>

                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {instance.versionId ? (
                    <p className="truncate">Version: {instance.versionId}</p>
                  ) : (
                    <p className="text-gray-400">No version selected</p>
                  )}

                  {instance.modLoader && (
                    <p className="truncate">
                      Mod Loader:{" "}
                      <span className="capitalize">{instance.modLoader}</span>
                    </p>
                  )}

                  <p className="truncate">
                    Created: {formatDate(toNumber(instance.createdAt))}
                  </p>

                  {instance.lastPlayed && (
                    <p className="truncate">
                      Last played:{" "}
                      {formatLastPlayed(toNumber(instance.lastPlayed))}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(instance);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDuplicate(instance);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    <Copy size={14} />
                    Duplicate
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDelete(instance);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
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
