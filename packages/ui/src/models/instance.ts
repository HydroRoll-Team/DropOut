import { toast } from "sonner";
import { create } from "zustand";
import {
  createInstance,
  deleteInstance,
  duplicateInstance,
  getActiveInstance,
  getInstance,
  listInstances,
  setActiveInstance,
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
  get: (id: string) => Promise<Instance | null>;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeInstance: null,

  refresh: async () => {
    const { setActiveInstance } = get();
    try {
      const instances = await listInstances();
      const activeInstance = await getActiveInstance();

      if (!activeInstance && instances.length > 0) {
        // If no active instance but instances exist, set the first one as active
        await setActiveInstance(instances[0]);
      }

      set({ instances, activeInstance });
    } catch (e) {
      console.error("Failed to load instances:", e);
      toast.error("Error loading instances");
    }
  },

  create: async (name) => {
    const { refresh } = get();
    try {
      const instance = await createInstance(name);
      await refresh();
      toast.success(`Instance "${name}" created successfully`);
      return instance;
    } catch (e) {
      console.error("Failed to create instance:", e);
      toast.error("Error creating instance");
      return null;
    }
  },

  delete: async (id) => {
    const { refresh, instances, activeInstance, setActiveInstance } = get();
    try {
      await deleteInstance(id);
      await refresh();

      // If deleted instance was active, set another as active
      if (activeInstance?.id === id) {
        if (instances.length > 0) {
          await setActiveInstance(instances[0]);
        } else {
          set({ activeInstance: null });
        }
      }

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
      await setActiveInstance(instance.id);
      set({ activeInstance: instance });
      toast.success("Active instance changed");
    } catch (e) {
      console.error("Failed to set active instance:", e);
      toast.error("Error setting active instance");
    }
  },

  duplicate: async (id, newName) => {
    const { refresh } = get();
    try {
      const instance = await duplicateInstance(id, newName);
      await refresh();
      toast.success(`Instance duplicated as "${newName}"`);
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      toast.error("Error duplicating instance");
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
