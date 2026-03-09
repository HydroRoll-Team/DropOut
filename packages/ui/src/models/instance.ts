import { toast } from "sonner";
import { create } from "zustand";
import {
  createInstance,
  deleteInstance,
  duplicateInstance,
  exportInstance as exportInstanceCommand,
  getActiveInstance,
  getInstance,
  importInstance as importInstanceCommand,
  listInstances,
  setActiveInstance as setActiveInstanceCommand,
  updateInstance,
} from "@/client";
import type { Instance } from "@/types";

interface InstanceState {
  instances: Instance[];
  activeInstance: Instance | null;

  refresh: () => Promise<void>;
  create: (name: string) => Promise<Instance | null>;
  delete: (id: string) => Promise<void>;
  update: (instance: Instance) => Promise<void>;
  setActiveInstance: (instance: Instance) => Promise<void>;
  duplicate: (id: string, newName: string) => Promise<Instance | null>;
  exportInstance: (id: string, archivePath: string) => Promise<string | null>;
  importInstance: (archivePath: string, newName?: string | null) => Promise<Instance | null>;
  get: (id: string) => Promise<Instance | null>;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeInstance: null,

  refresh: async () => {
    try {
      const instances = await listInstances();
      let activeInstance = await getActiveInstance();

      if (activeInstance) {
        const currentActiveId = activeInstance.id;
        activeInstance =
          instances.find((instance) => instance.id === currentActiveId) ??
          activeInstance;
      }

      if (
        (!activeInstance ||
          !instances.some((instance) => instance.id === activeInstance?.id)) &&
        instances.length > 0
      ) {
        await setActiveInstanceCommand(instances[0].id);
        activeInstance = instances[0];
      }

      set({ instances, activeInstance });
    } catch (e) {
      console.error("Failed to load instances:", e);
      toast.error("Error loading instances");
    }
  },

  create: async (name) => {
    const { refresh, setActiveInstance } = get();
    try {
      const instance = await createInstance(name);
      await refresh();
      await setActiveInstance(instance);
      toast.success(`Instance "${name}" created successfully`);
      return instance;
    } catch (e) {
      console.error("Failed to create instance:", e);
      toast.error("Error creating instance");
      return null;
    }
  },

  delete: async (id) => {
    const { refresh } = get();
    try {
      await deleteInstance(id);
      await refresh();

      toast.success("Instance deleted successfully");
    } catch (e) {
      console.error("Failed to delete instance:", e);
      toast.error("Error deleting instance");
    }
  },

  update: async (instance) => {
    const { refresh } = get();
    try {
      await updateInstance(instance);
      await refresh();
      toast.success("Instance updated successfully");
    } catch (e) {
      console.error("Failed to update instance:", e);
      toast.error("Error updating instance");
    }
  },

  setActiveInstance: async (instance) => {
    try {
      await setActiveInstanceCommand(instance.id);
      set({ activeInstance: instance });
      toast.success("Active instance changed");
    } catch (e) {
      console.error("Failed to set active instance:", e);
      toast.error("Error setting active instance");
    }
  },

  duplicate: async (id, newName) => {
    const { refresh, setActiveInstance } = get();
    try {
      const instance = await duplicateInstance(id, newName);
      await refresh();
      await setActiveInstance(instance);
      toast.success(`Instance duplicated as "${newName}"`);
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      toast.error("Error duplicating instance");
      return null;
    }
  },

  exportInstance: async (id, archivePath) => {
    try {
      const savedPath = await exportInstanceCommand(id, archivePath);
      toast.success("Instance exported successfully");
      return savedPath;
    } catch (e) {
      console.error("Failed to export instance:", e);
      toast.error("Error exporting instance");
      return null;
    }
  },

  importInstance: async (archivePath, newName) => {
    const { refresh, setActiveInstance } = get();
    try {
      const instance = await importInstanceCommand(archivePath, newName ?? null);
      await refresh();
      await setActiveInstance(instance);
      toast.success(`Instance \"${instance.name}\" imported successfully`);
      return instance;
    } catch (e) {
      console.error("Failed to import instance:", e);
      toast.error("Error importing instance");
      return null;
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
