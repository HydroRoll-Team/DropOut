<script lang="ts">
  import { gameState } from "../stores/game.svelte";
</script>

<div class="p-8 h-full overflow-y-auto bg-zinc-900">
  <h2 class="text-3xl font-bold mb-6">Versions</h2>
  <div class="grid gap-2">
    {#if gameState.versions.length === 0}
      <div class="text-zinc-500">Loading versions...</div>
    {:else}
      {#each gameState.versions as version}
        <button
          class="flex items-center justify-between p-4 bg-zinc-800 rounded hover:bg-zinc-700 transition text-left border border-zinc-700 {gameState.selectedVersion ===
          version.id
            ? 'border-green-500 bg-zinc-800/80 ring-1 ring-green-500'
            : ''}"
          onclick={() => (gameState.selectedVersion = version.id)}
        >
          <div>
            <div class="font-bold font-mono text-lg">{version.id}</div>
            <div class="text-xs text-zinc-400 capitalize">
              {version.type} • {new Date(
                version.releaseTime
              ).toLocaleDateString()}
            </div>
          </div>
          {#if gameState.selectedVersion === version.id}
            <div class="text-green-500 font-bold text-sm">SELECTED</div>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
