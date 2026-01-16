import { invoke } from "@tauri-apps/api/core";
import type { Instance } from "../types";
import { uiState } from "./ui.svelte";

export class InstancesState {
  instances = $state<Instance[]>([]);
  activeInstanceId = $state<string | null>(null);
  get activeInstance(): Instance | null {
    if (!this.activeInstanceId) return null;
    return this.instances.find((i) => i.id === this.activeInstanceId) || null;
  }

  async loadInstances() {
    try {
      this.instances = await invoke<Instance[]>("list_instances");
      const active = await invoke<Instance | null>("get_active_instance");
      if (active) {
        this.activeInstanceId = active.id;
      } else if (this.instances.length > 0) {
        // If no active instance but instances exist, set the first one as active
        await this.setActiveInstance(this.instances[0].id);
      }
    } catch (e) {
      console.error("Failed to load instances:", e);
      uiState.setStatus("Error loading instances: " + e);
    }
  }

  async createInstance(name: string): Promise<Instance | null> {
    try {
      const instance = await invoke<Instance>("create_instance", { name });
      await this.loadInstances();
      uiState.setStatus(`Instance "${name}" created successfully`);
      return instance;
    } catch (e) {
      console.error("Failed to create instance:", e);
      uiState.setStatus("Error creating instance: " + e);
      return null;
    }
  }

  async deleteInstance(id: string) {
    try {
      await invoke("delete_instance", { instanceId: id });
      await this.loadInstances();
      // If deleted instance was active, set another as active
      if (this.activeInstanceId === id) {
        if (this.instances.length > 0) {
          await this.setActiveInstance(this.instances[0].id);
        } else {
          this.activeInstanceId = null;
        }
      }
      uiState.setStatus("Instance deleted successfully");
    } catch (e) {
      console.error("Failed to delete instance:", e);
      uiState.setStatus("Error deleting instance: " + e);
    }
  }

  async updateInstance(instance: Instance) {
    try {
      await invoke("update_instance", { instance });
      await this.loadInstances();
      uiState.setStatus("Instance updated successfully");
    } catch (e) {
      console.error("Failed to update instance:", e);
      uiState.setStatus("Error updating instance: " + e);
    }
  }

  async setActiveInstance(id: string) {
    try {
      await invoke("set_active_instance", { instanceId: id });
      this.activeInstanceId = id;
      uiState.setStatus("Active instance changed");
    } catch (e) {
      console.error("Failed to set active instance:", e);
      uiState.setStatus("Error setting active instance: " + e);
    }
  }

  async duplicateInstance(id: string, newName: string): Promise<Instance | null> {
    try {
      const instance = await invoke<Instance>("duplicate_instance", {
        instanceId: id,
        newName,
      });
      await this.loadInstances();
      uiState.setStatus(`Instance duplicated as "${newName}"`);
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      uiState.setStatus("Error duplicating instance: " + e);
      return null;
    }
  }

  async getInstance(id: string): Promise<Instance | null> {
    try {
      return await invoke<Instance>("get_instance", { instanceId: id });
    } catch (e) {
      console.error("Failed to get instance:", e);
      return null;
    }
  }
}

export const instancesState = new InstancesState();
