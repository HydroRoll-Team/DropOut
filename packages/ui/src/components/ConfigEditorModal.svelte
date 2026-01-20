<script lang="ts">
  import { settingsState } from "../stores/settings.svelte";
  import { Save, X, FileJson, AlertCircle, Undo, Redo, Settings } from "lucide-svelte";
  import Prism from 'prismjs';
  import 'prismjs/components/prism-json';
  import 'prismjs/themes/prism-tomorrow.css';

  let content = $state(settingsState.rawConfigContent);
  let isSaving = $state(false);
  let localError = $state("");
  
  let textareaRef: HTMLTextAreaElement | undefined = $state();
  let preRef: HTMLPreElement | undefined = $state();
  let lineNumbersRef: HTMLDivElement | undefined = $state();

  // Textarea attributes that TypeScript doesn't recognize but are valid HTML
  const textareaAttrs = {
    autocorrect: "off",
    autocapitalize: "off"
  } as Record<string, string>;

  // History State
  let history = $state([settingsState.rawConfigContent]);
  let historyIndex = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Editor Settings
  let showLineNumbers = $state(localStorage.getItem('editor_showLineNumbers') !== 'false');
  let showStatusBar = $state(localStorage.getItem('editor_showStatusBar') !== 'false');
  let showSettings = $state(false);

  // Cursor Status
  let cursorLine = $state(1);
  let cursorCol = $state(1);
  
  let lines = $derived(content.split('\n'));

  $effect(() => {
     localStorage.setItem('editor_showLineNumbers', String(showLineNumbers));
     localStorage.setItem('editor_showStatusBar', String(showStatusBar));
  });

  // Cleanup timer on destroy
  $effect(() => {
    return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  // Initial validation
  $effect(() => {
    validate(content);
  });

  function validate(text: string) {
    try {
        JSON.parse(text);
        localError = "";
    } catch (e: any) {
        localError = e.message;
    }
  }

  function pushHistory(newContent: string, immediate = false) {
      if (debounceTimer) clearTimeout(debounceTimer);
      
      const commit = () => {
          if (newContent === history[historyIndex]) return;
          const next = history.slice(0, historyIndex + 1);
          next.push(newContent);
          history = next;
          historyIndex = next.length - 1;
      };

      if (immediate) {
          commit();
      } else {
          debounceTimer = setTimeout(commit, 500);
      }
  }

  function handleUndo() {
      if (historyIndex > 0) {
          historyIndex--;
          content = history[historyIndex];
          validate(content);
      }
  }

  function handleRedo() {
      if (historyIndex < history.length - 1) {
          historyIndex++;
          content = history[historyIndex];
          validate(content);
      }
  }

  function updateCursor() {
      if (!textareaRef) return;
      const pos = textareaRef.selectionStart;
      const text = textareaRef.value.substring(0, pos);
      const lines = text.split('\n');
      cursorLine = lines.length;
      cursorCol = lines[lines.length - 1].length + 1;
  }

  function handleInput(e: Event) {
      const target = e.target as HTMLTextAreaElement;
      content = target.value;
      validate(content);
      pushHistory(content);
      updateCursor();
  }

  function handleScroll() {
      if (textareaRef) {
          if (preRef) {
              preRef.scrollTop = textareaRef.scrollTop;
              preRef.scrollLeft = textareaRef.scrollLeft;
          }
          if (lineNumbersRef) {
              lineNumbersRef.scrollTop = textareaRef.scrollTop;
          }
      }
  }

  let highlightedCode = $derived(
      Prism.highlight(content, Prism.languages.json, 'json') + '\n'
  );

  async function handleSave(close = false) {
    if (localError) return;
    isSaving = true;
    await settingsState.saveRawConfig(content, close);
    isSaving = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    // Save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave(false); // Keep open on shortcut save
    } 
    // Undo
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
    }
    // Redo (Ctrl+Shift+Z or Ctrl+Y)
    else if (
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.key === 'y' && (e.ctrlKey || e.metaKey))
    ) {
        e.preventDefault();
        handleRedo();
    }
    // Close
    else if (e.key === 'Escape') {
      settingsState.closeConfigEditor();
    } 
    // Tab
    else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      
      pushHistory(content, true);

      const newContent = content.substring(0, start) + "  " + content.substring(end);
      content = newContent;
      
      pushHistory(content, true);

      setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 2;
          updateCursor();
      }, 0);
      validate(content);
    }
  }
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-black/70 animate-in fade-in duration-200">
  <div 
    class="bg-[#1d1f21] rounded-xl border border-zinc-700 shadow-2xl w-[900px] max-w-[95vw] h-[85vh] flex flex-col overflow-hidden"
    role="dialog"
    aria-modal="true"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-zinc-700 bg-[#1d1f21] z-20 relative">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
          <FileJson size={20} />
        </div>
        <div class="flex flex-col">
            <h3 class="text-lg font-bold text-white leading-none">Configuration Editor</h3>
            <span class="text-[10px] text-zinc-500 font-mono mt-1 break-all">{settingsState.configFilePath}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
          <!-- Undo/Redo Buttons -->
          <div class="flex items-center bg-zinc-800 rounded-lg p-0.5 mr-2 border border-zinc-700">
              <button 
                onclick={handleUndo} 
                disabled={historyIndex === 0}
                class="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Undo (Ctrl+Z)"
              >
                  <Undo size={16} />
              </button>
              <button 
                onclick={handleRedo} 
                disabled={historyIndex === history.length - 1}
                class="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Redo (Ctrl+Y)"
              >
                  <Redo size={16} />
              </button>
          </div>

          <!-- Settings Toggle -->
          <div class="relative">
              <button 
                onclick={() => showSettings = !showSettings}
                class="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg {showSettings ? 'bg-white/10 text-white' : ''}"
                title="Editor Settings"
              >
                <Settings size={20} />
              </button>
              
              {#if showSettings}
                <div class="absolute right-0 top-full mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-2 z-50 flex flex-col gap-1">
                    <label class="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                        <input type="checkbox" bind:checked={showLineNumbers} class="rounded border-zinc-600 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50" />
                        <span class="text-sm text-zinc-300">Line Numbers</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                        <input type="checkbox" bind:checked={showStatusBar} class="rounded border-zinc-600 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50" />
                        <span class="text-sm text-zinc-300">Cursor Status</span>
                    </label>
                </div>
              {/if}
          </div>

          <button
            onclick={() => settingsState.closeConfigEditor()}
            class="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
      </div>
    </div>

    <!-- Error Banner -->
    {#if localError || settingsState.configEditorError}
        <div class="bg-red-500/10 border-b border-red-500/20 p-3 flex items-start gap-3 animate-in slide-in-from-top-2 z-10 relative">
            <AlertCircle size={16} class="text-red-400 mt-0.5 shrink-0" />
            <p class="text-xs text-red-300 font-mono whitespace-pre-wrap">{localError || settingsState.configEditorError}</p>
        </div>
    {/if}

    <!-- Editor Body (Flex row for line numbers + code) -->
    <div class="flex-1 flex overflow-hidden relative bg-[#1d1f21]">
        <!-- Line Numbers -->
        {#if showLineNumbers}
            <div 
                bind:this={lineNumbersRef}
                class="pt-4 pb-4 pr-3 pl-2 text-right text-zinc-600 bg-[#1d1f21] border-r border-zinc-700/50 font-mono select-none overflow-hidden min-w-[3rem]"
                aria-hidden="true"
            >
                {#each lines as _, i}
                    <div class="leading-[20px] text-[13px]">{i + 1}</div>
                {/each}
            </div>
        {/if}

        <!-- Code Area -->
        <div class="flex-1 relative overflow-hidden group">
            <!-- Highlighted Code (Background) -->
            <pre 
                bind:this={preRef}
                aria-hidden="true"
                class="absolute inset-0 w-full h-full p-4 m-0 bg-transparent pointer-events-none overflow-hidden whitespace-pre font-mono text-sm leading-relaxed"
            ><code class="language-json">{@html highlightedCode}</code></pre>

            <!-- Textarea (Foreground) -->
            <textarea
                bind:this={textareaRef}
                bind:value={content}
                oninput={handleInput}
                onkeydown={handleKeydown}
                onscroll={handleScroll}
                onmouseup={updateCursor}
                onkeyup={updateCursor}
                onclick={() => showSettings = false}
                class="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white font-mono text-sm leading-relaxed resize-none focus:outline-none whitespace-pre overflow-auto z-10 selection:bg-indigo-500/30"
                spellcheck="false"
                {...textareaAttrs}
            ></textarea>
        </div>
    </div>

    <!-- Footer -->
    <div class="p-3 border-t border-zinc-700 bg-[#1d1f21] flex justify-between items-center z-20 relative">
      <div class="text-xs text-zinc-500 flex gap-4 items-center">
        {#if showStatusBar}
            <div class="flex gap-3 font-mono border-r border-zinc-700 pr-4 mr-1">
                <span>Ln {cursorLine}</span>
                <span>Col {cursorCol}</span>
            </div>
        {/if}
        <span class="hidden sm:inline"><span class="bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">Ctrl+S</span> save</span>
      </div>
      <div class="flex gap-3">
        <button
          onclick={() => settingsState.closeConfigEditor()}
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={() => handleSave(false)}
          disabled={isSaving || !!localError}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          title={localError ? "Fix errors before saving" : "Save changes"}
        >
          {#if isSaving}
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Saving...
          {:else}
            <Save size={16} />
            Save
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Ensure exact font match */
  pre, textarea {
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 13px !important;
      line-height: 20px !important;
      letter-spacing: 0px !important;
      tab-size: 2;
  }
  
  /* Hide scrollbar for pre but keep it functional for textarea */
  pre::-webkit-scrollbar {
    display: none;
  }

  /* Override Prism background and font weights for alignment */
  :global(pre[class*="language-"]), :global(code[class*="language-"]) {
      background: transparent !important;
      text-shadow: none !important;
      box-shadow: none !important;
  }

  /* CRITICAL: Force normal weight to match textarea */
  :global(.token) {
      font-weight: normal !important;
      font-style: normal !important;
  }
</style>
