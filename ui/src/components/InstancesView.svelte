<script lang="ts">
  import { onMount } from "svelte";
  import { instancesState } from "../stores/instances.svelte";
  import { Plus, Trash2, Edit2, Copy, Check, X } from "lucide-svelte";
  import type { Instance } from "../types";

  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let showDeleteConfirm = $state(false);
  let showDuplicateModal = $state(false);
  let selectedInstance: Instance | null = $state(null);
  let newInstanceName = $state("");
  let duplicateName = $state("");

  onMount(() => {
    instancesState.loadInstances();
  });

  function handleCreate() {
    newInstanceName = "";
    showCreateModal = true;
  }

  function handleEdit(instance: Instance) {
    selectedInstance = instance;
    newInstanceName = instance.name;
    showEditModal = true;
  }

  function handleDelete(instance: Instance) {
    selectedInstance = instance;
    showDeleteConfirm = true;
  }

  function handleDuplicate(instance: Instance) {
    selectedInstance = instance;
    duplicateName = `${instance.name} (Copy)`;
    showDuplicateModal = true;
  }

  async function confirmCreate() {
    if (!newInstanceName.trim()) return;
    await instancesState.createInstance(newInstanceName.trim());
    showCreateModal = false;
    newInstanceName = "";
  }

  async function confirmEdit() {
    if (!selectedInstance || !newInstanceName.trim()) return;
    await instancesState.updateInstance({
      ...selectedInstance,
      name: newInstanceName.trim(),
    });
    showEditModal = false;
    selectedInstance = null;
    newInstanceName = "";
  }

  async function confirmDelete() {
    if (!selectedInstance) return;
    await instancesState.deleteInstance(selectedInstance.id);
    showDeleteConfirm = false;
    selectedInstance = null;
  }

  async function confirmDuplicate() {
    if (!selectedInstance || !duplicateName.trim()) return;
    await instancesState.duplicateInstance(selectedInstance.id, duplicateName.trim());
    showDuplicateModal = false;
    selectedInstance = null;
    duplicateName = "";
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function formatLastPlayed(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }
</script>

<div class="h-full flex flex-col gap-4 p-6 overflow-y-auto">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Instances</h1>
    <button
      onclick={handleCreate}
      class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
    >
      <Plus size={18} />
      Create Instance
    </button>
  </div>

  {#if instancesState.instances.length === 0}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-500 dark:text-gray-400">
        <p class="text-lg mb-2">No instances yet</p>
        <p class="text-sm">Create your first instance to get started</p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each instancesState.instances as instance (instance.id)}
        <div
          class="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border-2 transition-all cursor-pointer hover:border-blue-500 {instancesState.activeInstanceId === instance.id
            ? 'border-blue-500'
            : 'border-transparent'}"
          onclick={() => instancesState.setActiveInstance(instance.id)}
        >
          {#if instancesState.activeInstanceId === instance.id}
            <div class="absolute top-2 right-2">
              <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
            </div>
          {/if}

          <div class="flex items-start justify-between mb-2">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {instance.name}
            </h3>
            <div class="flex gap-1">
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  handleEdit(instance);
                }}
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Edit"
              >
                <Edit2 size={16} class="text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  handleDuplicate(instance);
                }}
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Duplicate"
              >
                <Copy size={16} class="text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  handleDelete(instance);
                }}
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Delete"
              >
                <Trash2 size={16} class="text-red-600 dark:text-red-400" />
              </button>
            </div>
          </div>

          <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {#if instance.version_id}
              <p>Version: <span class="font-medium">{instance.version_id}</span></p>
            {:else}
              <p class="text-gray-400">No version selected</p>
            {/if}

            {#if instance.mod_loader && instance.mod_loader !== "vanilla"}
              <p>
                Mod Loader: <span class="font-medium capitalize">{instance.mod_loader}</span>
                {#if instance.mod_loader_version}
                  <span class="text-gray-500">({instance.mod_loader_version})</span>
                {/if}
              </p>
            {/if}

            <p>Created: {formatDate(instance.created_at)}</p>

            {#if instance.last_played}
              <p>Last played: {formatLastPlayed(instance.last_played)}</p>
            {/if}
          </div>

          {#if instance.notes}
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-500 italic">
              {instance.notes}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Create Instance</h2>
      <input
        type="text"
        bind:value={newInstanceName}
        placeholder="Instance name"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
        onkeydown={(e) => e.key === "Enter" && confirmCreate()}
        autofocus
      />
      <div class="flex gap-2 justify-end">
        <button
          onclick={() => {
            showCreateModal = false;
            newInstanceName = "";
          }}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmCreate}
          disabled={!newInstanceName.trim()}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Create
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && selectedInstance}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Edit Instance</h2>
      <input
        type="text"
        bind:value={newInstanceName}
        placeholder="Instance name"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
        onkeydown={(e) => e.key === "Enter" && confirmEdit()}
        autofocus
      />
      <div class="flex gap-2 justify-end">
        <button
          onclick={() => {
            showEditModal = false;
            selectedInstance = null;
            newInstanceName = "";
          }}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmEdit}
          disabled={!newInstanceName.trim()}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation -->
{#if showDeleteConfirm && selectedInstance}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96">
      <h2 class="text-xl font-bold mb-4 text-red-600 dark:text-red-400">Delete Instance</h2>
      <p class="mb-4 text-gray-700 dark:text-gray-300">
        Are you sure you want to delete "{selectedInstance.name}"? This action cannot be undone and will delete all game data for this instance.
      </p>
      <div class="flex gap-2 justify-end">
        <button
          onclick={() => {
            showDeleteConfirm = false;
            selectedInstance = null;
          }}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmDelete}
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Duplicate Modal -->
{#if showDuplicateModal && selectedInstance}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Duplicate Instance</h2>
      <input
        type="text"
        bind:value={duplicateName}
        placeholder="New instance name"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
        onkeydown={(e) => e.key === "Enter" && confirmDuplicate()}
        autofocus
      />
      <div class="flex gap-2 justify-end">
        <button
          onclick={() => {
            showDuplicateModal = false;
            selectedInstance = null;
            duplicateName = "";
          }}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmDuplicate}
          disabled={!duplicateName.trim()}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Duplicate
        </button>
      </div>
    </div>
  </div>
{/if}
