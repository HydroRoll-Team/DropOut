<script lang="ts">
  import { open } from "@tauri-apps/plugin-shell";
  import { authState } from "../stores/auth.svelte";

  function openLink(url: string) {
    open(url);
  }
</script>

{#if authState.isLoginModalOpen}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-0 duration-200"
    >
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-white">Login</h2>
        <button
          onclick={() => authState.closeLoginModal()}
          class="text-zinc-500 hover:text-white transition group"
        >
          ✕
        </button>
      </div>

      {#if authState.loginMode === "select"}
        <div class="space-y-4">
          <button
            onclick={() => authState.startMicrosoftLogin()}
            class="w-full flex items-center justify-center gap-3 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white p-4 rounded-lg font-bold border border-transparent hover:border-zinc-500 transition-all group"
          >
            <!-- Microsoft Logo SVG -->
            <svg
              class="w-5 h-5"
              viewBox="0 0 23 23"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              ><path fill="#f35325" d="M1 1h10v10H1z" /><path
                fill="#81bc06"
                d="M12 1h10v10H12z"
              /><path fill="#05a6f0" d="M1 12h10v10H1z" /><path
                fill="#ffba08"
                d="M12 12h10v10H12z"
              /></svg
            >
            Microsoft Account
          </button>

          <div class="relative py-2">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-zinc-700"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-zinc-900 px-2 text-zinc-500">OR</span>
            </div>
          </div>

          <div class="space-y-2">
            <input
              type="text"
              bind:value={authState.offlineUsername}
              placeholder="Offline Username"
              class="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-white focus:border-indigo-500 outline-none"
              onkeydown={(e) => e.key === "Enter" && authState.performOfflineLogin()}
            />
            <button
              onclick={() => authState.performOfflineLogin()}
              class="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-3 rounded font-medium transition-colors"
            >
              Offline Login
            </button>
          </div>
        </div>
      {:else if authState.loginMode === "microsoft"}
        <div class="text-center">
          {#if authState.msLoginLoading && !authState.deviceCodeData}
            <div class="py-8 text-zinc-400 animate-pulse">
              Starting login flow...
            </div>
          {:else if authState.deviceCodeData}
            <div class="space-y-4">
              <p class="text-sm text-zinc-400">1. Go to this URL:</p>
              <button
                onclick={() =>
                    authState.deviceCodeData && openLink(authState.deviceCodeData.verification_uri)}
                class="text-indigo-400 hover:text-indigo-300 underline break-all font-mono text-sm"
              >
                {authState.deviceCodeData.verification_uri}
              </button>

              <p class="text-sm text-zinc-400 mt-2">2. Enter this code:</p>
              <div
                class="bg-zinc-950 p-4 rounded border border-zinc-700 font-mono text-2xl tracking-widest text-center select-all cursor-pointer hover:border-indigo-500 transition-colors"
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && navigator.clipboard.writeText(authState.deviceCodeData?.user_code || "")}
                onclick={() =>
                  navigator.clipboard.writeText(
                    authState.deviceCodeData?.user_code || ""
                  )}
              >
                {authState.deviceCodeData.user_code}
              </div>
              <p class="text-xs text-zinc-500">Click code to copy</p>

              <div class="pt-6 space-y-3">
                   <div class="flex flex-col items-center gap-3">
                       <div class="animate-spin rounded-full h-6 w-6 border-2 border-zinc-600 border-t-indigo-500"></div>
                       <span class="text-sm text-zinc-400 font-medium break-all text-center">{authState.msLoginStatus}</span>
                   </div>
                   <p class="text-xs text-zinc-600">This window will update automatically.</p>
              </div>
              
              <button
                onclick={() => { authState.stopPolling(); authState.loginMode = "select"; }}
                class="text-xs text-zinc-500 hover:text-zinc-300 mt-6 underline"
                >Cancel</button
              >
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
