import { invoke } from "@tauri-apps/api/core";
import type { Instance } from "../types";
import { uiState } from "./ui.svelte";

export class InstancesState {
  instances = $state<Instance[]>([]);
  activeInstanceId = $state<string | null>(null);
  isLoading = $state(false);
  error = $state("");
  
  // Modal states
  showEditModal = $state(false);
  editingInstance = $state<Instance | null>(null);
  isCreating = $state(false);
  
  // Import/Export states
  showImportExportModal = $state(false);
  isExporting = $state(false);
  isImporting = $state(false);

  // Get active instance
  get activeInstance(): Instance | null {
    if (!this.activeInstanceId) return null;
    return this.instances.find(i => i.id === this.activeInstanceId) || null;
  }

  // Load all instances
  async loadInstances() {
    this.isLoading = true;
    this.error = "";
    
    try {
      this.instances = await invoke<Instance[]>("list_instances");
      this.activeInstanceId = await invoke<string | null>("get_active_instance");
      
      // If no active instance but we have instances, set the first one
      if (!this.activeInstanceId && this.instances.length > 0) {
        await this.setActiveInstance(this.instances[0].id);
      }
    } catch (e) {
      console.error("Failed to load instances:", e);
      this.error = `Failed to load instances: ${e}`;
    } finally {
      this.isLoading = false;
    }
  }

  // Create a new instance
  async createInstance(name: string, versionId: string): Promise<Instance | null> {
    try {
      const instance = await invoke<Instance>("create_instance", {
        name,
        versionId,
      });
      
      this.instances = [...this.instances, instance];
      
      // Set as active if it's the first instance
      if (this.instances.length === 1) {
        await this.setActiveInstance(instance.id);
      }
      
      uiState.setStatus(`Instance "${name}" created successfully!`);
      return instance;
    } catch (e) {
      console.error("Failed to create instance:", e);
      uiState.setStatus(`Failed to create instance: ${e}`);
      return null;
    }
  }

  // Delete an instance
  async deleteInstance(instanceId: string) {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) return;
    
    try {
      await invoke("delete_instance", { instanceId });
      this.instances = this.instances.filter(i => i.id !== instanceId);
      
      // If deleted instance was active, select another
      if (this.activeInstanceId === instanceId) {
        this.activeInstanceId = this.instances.length > 0 ? this.instances[0].id : null;
        if (this.activeInstanceId) {
          await invoke("set_active_instance", { instanceId: this.activeInstanceId });
        }
      }
      
      uiState.setStatus(`Instance "${instance.name}" deleted`);
    } catch (e) {
      console.error("Failed to delete instance:", e);
      uiState.setStatus(`Failed to delete instance: ${e}`);
    }
  }

  // Update an instance
  async updateInstance(instance: Instance): Promise<Instance | null> {
    try {
      const updated = await invoke<Instance>("update_instance", { instance });
      
      this.instances = this.instances.map(i => 
        i.id === updated.id ? updated : i
      );
      
      uiState.setStatus(`Instance "${updated.name}" updated`);
      return updated;
    } catch (e) {
      console.error("Failed to update instance:", e);
      uiState.setStatus(`Failed to update instance: ${e}`);
      return null;
    }
  }

  // Duplicate an instance
  async duplicateInstance(instanceId: string, newName: string): Promise<Instance | null> {
    try {
      const instance = await invoke<Instance>("duplicate_instance", {
        instanceId,
        newName,
      });
      
      this.instances = [...this.instances, instance];
      uiState.setStatus(`Instance duplicated as "${newName}"`);
      return instance;
    } catch (e) {
      console.error("Failed to duplicate instance:", e);
      uiState.setStatus(`Failed to duplicate instance: ${e}`);
      return null;
    }
  }

  // Set active instance
  async setActiveInstance(instanceId: string | null) {
    try {
      await invoke("set_active_instance", { instanceId });
      this.activeInstanceId = instanceId;
    } catch (e) {
      console.error("Failed to set active instance:", e);
      uiState.setStatus(`Failed to set active instance: ${e}`);
    }
  }

  // Export instance to zip
  async exportInstance(instanceId: string, outputPath: string) {
    this.isExporting = true;
    try {
      await invoke("export_instance", { instanceId, outputPath });
      uiState.setStatus("Instance exported successfully!");
    } catch (e) {
      console.error("Failed to export instance:", e);
      uiState.setStatus(`Failed to export instance: ${e}`);
    } finally {
      this.isExporting = false;
    }
  }

  // Import instance from zip
  async importInstance(zipPath: string, name?: string): Promise<Instance | null> {
    this.isImporting = true;
    try {
      const instance = await invoke<Instance>("import_instance", {
        zipPath,
        name: name || null,
      });
      
      this.instances = [...this.instances, instance];
      uiState.setStatus(`Instance "${instance.name}" imported successfully!`);
      return instance;
    } catch (e) {
      console.error("Failed to import instance:", e);
      uiState.setStatus(`Failed to import instance: ${e}`);
      return null;
    } finally {
      this.isImporting = false;
    }
  }

  // Open edit modal for new instance
  openCreateModal() {
    this.editingInstance = null;
    this.isCreating = true;
    this.showEditModal = true;
  }

  // Open edit modal for existing instance
  openEditModal(instance: Instance) {
    this.editingInstance = { ...instance };
    this.isCreating = false;
    this.showEditModal = true;
  }

  // Close edit modal
  closeEditModal() {
    this.showEditModal = false;
    this.editingInstance = null;
    this.isCreating = false;
  }

  // Format timestamp to readable date
  formatDate(timestamp: number | undefined): string {
    if (!timestamp) return "Never";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Format relative time
  formatRelativeTime(timestamp: number | undefined): string {
    if (!timestamp) return "Never played";
    
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    
    return this.formatDate(timestamp);
  }
}

export const instancesState = new InstancesState();
