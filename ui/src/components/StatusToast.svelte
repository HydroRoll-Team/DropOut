<script lang="ts">
  import { uiState } from "../stores/ui.svelte";
</script>

{#if uiState.status !== "Ready"}
  <div
    class="absolute top-12 right-12 bg-zinc-800/90 backdrop-blur border border-zinc-600 p-4 rounded-lg shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-4 duration-300 z-50 group"
  >
    <div class="flex justify-between items-start mb-1">
      <div class="text-xs text-zinc-400 uppercase font-bold">Status</div>
      <button
        onclick={() => uiState.setStatus("Ready")}
        class="text-zinc-500 hover:text-white transition -mt-1 -mr-1 p-1"
      >
        ✕
      </button>
    </div>
    <div class="font-mono text-sm whitespace-pre-wrap mb-2">{uiState.status}</div>
    <div class="w-full bg-zinc-700/50 h-1 rounded-full overflow-hidden">
      <div
        class="h-full bg-indigo-500 animate-[progress_5s_linear_forwards] origin-left w-full"
      ></div>
    </div>
  </div>
{/if}

<style>
  @keyframes progress {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
