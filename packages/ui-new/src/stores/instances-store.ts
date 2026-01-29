import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";
import type { Instance } from "../types/bindings/instance";

interface InstancesState {
  // State
  instances: Instance[];
  activeInstanceId: string | null;

  // Computed property
  activeInstance: Instance | null;

  // Actions
  loadInstances: () => Promise<void>;
  createInstance: (name: string) => Promise<Instance | null>;
  deleteInstance: (id: string) => Promise<void>;
  updateInstance: (instance: Instance) => Promise<void>;
  setActiveInstance: (id: string) => Promise<void>;
  duplicateInstance: (id: string, newName: string) => Promise<Instance | null>;
  getInstance: (id: string) => Promise<Instance | null>;
  setInstances: (instances: Instance[]) => void;
  setActiveInstanceId: (id: string | null) => void;
}

export const useInstancesStore = create<InstancesState>((set, get) => ({
  // Initial state
  instances: [],
  activeInstanceId: null,

  // Computed property
  get activeInstance() {
    const { instances, activeInstanceId } = get();
    if (!activeInstanceId) return null;
    return instances.find((i) => i.id === activeInstanceId) || null;
  },

  // Actions
  loadInstances: async () => {
    try {
      const instances = await invoke<Instance[]>("list_instances");
      const active = await invoke<Instance | null>("get_active_instance");

      let newActiveInstanceId = null;
      if (active) {
        newActiveInstanceId = active.id;
      } else if (instances.length > 0) {
        // If no active instance but instances exist, set the first one as active
        await get().setActiveInstance(instances[0].id);
        newActiveInstanceId = instances[0].id;
      }

      set({ instances, activeInstanceId: newActiveInstanceId });
    } catch (e) {
      console.error("Failed to load instances:", e);
      toast.error("Error loading instances: " + String(e));
    }
  },

  createInstance: async (name) => {
    try {
      const instance = await invoke<Instance>("create_instance", { name });
      await get().loadInstances();
      toast.success(`Instance "${name}" created successfully`);
      return instance;
    } catch (e) {
      console.error("Failed to create instance:", e);
      toast.error("Error creating instance: " + String(e));
      return null;
    }
  },

  deleteInstance: async (id) => {
    try {
      await invoke("delete_instance", { instanceId: id });
      await get().loadInstances();

      // If deleted instance was active, set another as active
      const { instances, activeInstanceId } = get();
      if (activeInstanceId === id) {
        if (instances.length > 0) {
          await get().setActiveInstance(instances[0].id);
        } else {
          set({ activeInstanceId: null });
        }
      }

      toast.success("Instance deleted successfully");
    } catch (e) {
      console.error("Failed to delete instance:", e);
      toast.error("Error deleting instance: " + String(e));
    }
  },

  updateInstance: async (instance) => {
    try {
      await invoke("update_instance", { instance });
      await get().loadInstances();
      toast.success("Instance updated successfully");
    } catch (e) {
      console.error("Failed to update instance:", e);
      toast.error("Error updating instance: " + String(e));
    }
  },

  setActiveInstance: async (id) => {
    try {
      await invoke("set_active_instance", { instanceId: id });
      set({ activeInstanceId: id });
      toast.success("Active instance changed");
    } catch (e) {
      console.error("Failed to set active instance:", e);
      toast.error("Error setting active instance: " + String(e));
    }
  },

  duplicateInstance: async (id, newName) => {
    try {
      const instance = await invoke<Instance>("duplicate_instance", {
        instanceId: id,
        newName,
      });
      await get().loadInstances();
      toast.success(`Instance duplicated as "${newName}"`);
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      toast.error("Error duplicating instance: " + String(e));
      return null;
    }
  },

  getInstance: async (id) => {
    try {
      return await invoke<Instance>("get_instance", { instanceId: id });
    } catch (e) {
      console.error("Failed to get instance:", e);
      return null;
    }
  },

  setInstances: (instances) => {
    set({ instances });
  },

  setActiveInstanceId: (id) => {
    set({ activeInstanceId: id });
  },
}));
