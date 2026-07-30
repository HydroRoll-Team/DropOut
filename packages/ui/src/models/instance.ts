import { toast } from "sonner";
import { create } from "zustand";
import {
  createInstance,
  deleteInstance,
  duplicateInstance,
  exportInstance,
  getActiveInstance,
  getInstance,
  importInstance,
  listInstances,
  repairInstances,
  setActiveInstance as setActiveInstanceCommand,
  updateInstance,
} from "@/client";
import { translate } from "@/lib/i18n";
import type { Instance } from "@/types";

interface InstanceState {
  instances: Instance[];
  activeInstance: Instance | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;

  refresh: () => Promise<void>;
  create: (name: string) => Promise<Instance>;
  delete: (id: string) => Promise<boolean>;
  update: (instance: Instance) => Promise<void>;
  setActiveInstance: (instance: Instance) => Promise<void>;
  duplicate: (id: string, newName: string) => Promise<Instance | null>;
  exportArchive: (id: string, archivePath: string) => Promise<void>;
  importArchive: (
    archivePath: string,
    newName?: string,
  ) => Promise<Instance | null>;
  repair: () => Promise<void>;
  get: (id: string) => Promise<Instance | null>;
}

let pendingRefresh: Promise<void> | null = null;

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeInstance: null,
  status: "idle",
  error: null,

  refresh: async () => {
    if (pendingRefresh) return pendingRefresh;

    set({ status: "loading", error: null });
    pendingRefresh = (async () => {
      try {
        const instances = await listInstances();
        let activeInstance = await getActiveInstance();

        if (
          activeInstance &&
          !instances.some((instance) => instance.id === activeInstance?.id)
        ) {
          activeInstance = null;
        }

        if (!activeInstance && instances.length > 0) {
          await setActiveInstanceCommand(instances[0].id);
          activeInstance = instances[0];
        }

        set({ instances, activeInstance, status: "ready", error: null });
      } catch (e) {
        console.error("Failed to load instances:", e);
        set({
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        toast.error(translate("store.instancesLoadFailed"));
      }
    })().finally(() => {
      pendingRefresh = null;
    });

    return pendingRefresh;
  },

  create: async (name) => {
    const { refresh } = get();
    const instance = await createInstance(name);
    await setActiveInstanceCommand(instance.id);
    await refresh();
    toast.success(translate("store.instanceCreated", { name }));
    return instance;
  },

  delete: async (id) => {
    const { refresh } = get();
    try {
      await deleteInstance(id);
      await refresh();

      toast.success(translate("store.instanceDeleted"));
      return true;
    } catch (e) {
      console.error("Failed to delete instance:", e);
      toast.error(String(e));
      return false;
    }
  },

  update: async (instance) => {
    const { refresh } = get();
    try {
      await updateInstance(instance);
      await refresh();
      toast.success(translate("store.instanceUpdated"));
    } catch (e) {
      console.error("Failed to update instance:", e);
      toast.error(translate("store.instanceUpdateFailed"));
    }
  },

  setActiveInstance: async (instance) => {
    await setActiveInstanceCommand(instance.id);
    set({ activeInstance: instance });
  },

  duplicate: async (id, newName) => {
    const { refresh } = get();
    try {
      const instance = await duplicateInstance(id, newName);
      await setActiveInstanceCommand(instance.id);
      await refresh();
      toast.success(translate("store.instanceDuplicated", { name: newName }));
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      toast.error(String(e));
      return null;
    }
  },

  exportArchive: async (id, archivePath) => {
    try {
      await exportInstance(id, archivePath);
      toast.success(translate("store.instanceExported"));
    } catch (e) {
      console.error("Failed to export instance:", e);
      toast.error(String(e));
    }
  },

  importArchive: async (archivePath, newName) => {
    const { refresh } = get();
    try {
      const instance = await importInstance(archivePath, newName ?? null);
      await setActiveInstanceCommand(instance.id);
      await refresh();
      toast.success(
        translate("store.instanceImported", { name: instance.name }),
      );
      return instance;
    } catch (e) {
      console.error("Failed to import instance:", e);
      toast.error(String(e));
      return null;
    }
  },

  repair: async () => {
    const { refresh } = get();
    try {
      const result = await repairInstances();
      await refresh();
      toast.success(
        translate("store.repairCompleted", {
          restored: result.restoredInstances,
          removed: result.removedStaleEntries,
        }),
      );
    } catch (e) {
      console.error("Failed to repair instances:", e);
      toast.error(String(e));
    }
  },

  get: async (id) => {
    try {
      return await getInstance(id);
    } catch (e) {
      console.error("Failed to get instance:", e);
      return null;
    }
  },
}));
