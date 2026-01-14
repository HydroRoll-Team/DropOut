<script lang="ts">
  import { authState } from "../stores/auth.svelte";
  import { gameState } from "../stores/game.svelte";
  import { uiState } from "../stores/ui.svelte";
</script>

<div
  class="h-24 bg-zinc-900 border-t border-zinc-800 flex items-center px-8 justify-between z-20 shadow-2xl"
>
  <div class="flex items-center gap-4">
    <div
      class="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
      onclick={() => authState.openLoginModal()}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && authState.openLoginModal()}
    >
      <div
        class="w-12 h-12 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg flex items-center justify-center text-white font-bold text-xl overflow-hidden"
      >
        {#if authState.currentAccount}
          <img
            src={`https://minotar.net/avatar/${authState.currentAccount.username}/48`}
            alt={authState.currentAccount.username}
            class="w-full h-full"
          />
        {:else}
          ?
        {/if}
      </div>
      <div>
        <div class="font-bold text-white text-lg">
          {authState.currentAccount ? authState.currentAccount.username : "Click to Login"}
        </div>
        <div class="text-xs text-zinc-400 flex items-center gap-1">
          <span
            class="w-1.5 h-1.5 rounded-full {authState.currentAccount
              ? 'bg-green-500'
              : 'bg-zinc-500'}"
          ></span>
          {authState.currentAccount ? "Ready" : "Guest"}
        </div>
      </div>
    </div>
    <!-- Console Toggle -->
    <button
      class="ml-4 text-xs text-zinc-500 hover:text-zinc-300 transition"
      onclick={() => uiState.toggleConsole()}
    >
      {uiState.showConsole ? "Hide Logs" : "Show Logs"}
    </button>
  </div>

  <div class="flex items-center gap-4">
    <div class="flex flex-col items-end mr-2">
      <label
        for="version-select"
        class="text-xs text-zinc-500 mb-1 uppercase font-bold tracking-wider"
        >Version</label
      >
      <select
        id="version-select"
        bind:value={gameState.selectedVersion}
        class="bg-zinc-950 text-zinc-200 border border-zinc-700 rounded px-4 py-2 hover:border-zinc-500 transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500 w-48"
      >
        {#if gameState.versions.length === 0}
          <option>Loading...</option>
        {:else}
          {#each gameState.versions as version}
            <option value={version.id}>{version.id} ({version.type})</option
            >
          {/each}
        {/if}
      </select>
    </div>

    <button
      onclick={() => gameState.startGame()}
      class="bg-green-600 hover:bg-green-500 text-white font-bold h-14 px-12 rounded transition-all transform active:scale-95 shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:shadow-[0_0_25px_rgba(22,163,74,0.6)] flex flex-col items-center justify-center uppercase tracking-wider text-lg"
    >
      Play
      <span
        class="text-[10px] font-normal opacity-80 normal-case tracking-normal"
        >Click to launch</span
      >
    </button>
  </div>
</div>
