<script lang="ts">
  import { assistantState } from '../stores/assistant.svelte';
  import { settingsState } from '../stores/settings.svelte';
  import { Send, Bot, RefreshCw, Trash2, AlertTriangle, Settings, Brain, ChevronDown } from 'lucide-svelte';
  import { uiState } from '../stores/ui.svelte';
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  let input = $state('');
  let messagesContainer: HTMLDivElement | undefined = undefined;

  function parseMessageContent(content: string) {
    if (!content) return { thinking: null, content: '', isThinking: false };
    
    // Support both <thinking> and <think> (DeepSeek uses <think>)
    let startTag = '<thinking>';
    let endTag = '</thinking>';
    let startIndex = content.indexOf(startTag);
    
    if (startIndex === -1) {
        startTag = '<think>';
        endTag = '</think>';
        startIndex = content.indexOf(startTag);
    }
    
    // Also check for encoded tags if they weren't decoded properly
    if (startIndex === -1) {
        startTag = '\u003cthink\u003e';
        endTag = '\u003c/think\u003e';
        startIndex = content.indexOf(startTag);
    }
    
    if (startIndex !== -1) {
        const endIndex = content.indexOf(endTag, startIndex);
        
        if (endIndex !== -1) {
            // Completed thinking block
            // We extract the thinking part and keep the rest (before and after)
            const before = content.substring(0, startIndex);
            const thinking = content.substring(startIndex + startTag.length, endIndex).trim();
            const after = content.substring(endIndex + endTag.length);
            
            return {
                thinking,
                content: (before + after).trim(),
                isThinking: false
            };
        } else {
            // Incomplete thinking block (still streaming)
            const before = content.substring(0, startIndex);
            const thinking = content.substring(startIndex + startTag.length).trim();
            
            return {
                thinking,
                content: before.trim(),
                isThinking: true
            };
        }
    }
    
    return { thinking: null, content, isThinking: false };
  }

  function renderMarkdown(content: string): string {
    if (!content) return '';
    try {
      // marked.parse returns string synchronously when async is false (default)
      return marked(content, { breaks: true, gfm: true }) as string;
    } catch {
      return content;
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 0);
    }
  }

  onMount(() => {
    assistantState.init();
  });

  // Scroll to bottom when messages change
  $effect(() => {
    // Access reactive state
    const _len = assistantState.messages.length;
    const _processing = assistantState.isProcessing;
    // Scroll on next tick
    if (_len > 0 || _processing) {
      scrollToBottom();
    }
  });

  async function handleSubmit() {
    if (!input.trim() || assistantState.isProcessing) return;
    const text = input;
    input = '';
    const provider = settingsState.settings.assistant.llm_provider;
    const endpoint = provider === 'ollama' 
      ? settingsState.settings.assistant.ollama_endpoint 
      : settingsState.settings.assistant.openai_endpoint;
    await assistantState.sendMessage(
      text, 
      settingsState.settings.assistant.enabled,
      provider,
      endpoint
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function getProviderName(): string {
    const provider = settingsState.settings.assistant.llm_provider;
    if (provider === 'ollama') {
      return `Ollama (${settingsState.settings.assistant.ollama_model})`;
    } else if (provider === 'openai') {
      return `OpenAI (${settingsState.settings.assistant.openai_model})`;
    }
    return provider;
  }

  function getProviderHelpText(): string {
    const provider = settingsState.settings.assistant.llm_provider;
    if (provider === 'ollama') {
      return `Please ensure Ollama is installed and running at ${settingsState.settings.assistant.ollama_endpoint}.`;
    } else if (provider === 'openai') {
      return "Please check your OpenAI API key in Settings > AI Assistant.";
    }
    return "";
  }
</script>

<div class="h-full w-full flex flex-col gap-4 p-4 lg:p-8 animate-in fade-in zoom-in-95 duration-300">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-3">
      <div class="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
        <Bot size={24} />
      </div>
      <div>
        <h2 class="text-2xl font-bold">Game Assistant</h2>
        <p class="text-zinc-400 text-sm">Powered by {getProviderName()}</p>
      </div>
    </div>
    
    <div class="flex items-center gap-2">
       {#if !settingsState.settings.assistant.enabled}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-zinc-500/10 text-zinc-400 rounded-full text-xs font-medium border border-zinc-500/20">
            <AlertTriangle size={14} />
            <span>Disabled</span>
        </div>
       {:else if !assistantState.isProviderHealthy}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full text-xs font-medium border border-red-500/20">
            <AlertTriangle size={14} />
            <span>Offline</span>
        </div>
       {:else}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
            <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>Online</span>
        </div>
       {/if}

       <button 
         onclick={() => assistantState.checkHealth()}
         class="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
         title="Check Connection"
       >
         <RefreshCw size={18} class={assistantState.isProcessing ? "animate-spin" : ""} />
       </button>
       
       <button 
         onclick={() => assistantState.clearHistory()}
         class="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
         title="Clear History"
       >
         <Trash2 size={18} />
       </button>

       <button 
         onclick={() => uiState.setView('settings')}
         class="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
         title="Settings"
       >
         <Settings size={18} />
       </button>
    </div>
  </div>

  <!-- Chat Area -->
  <div class="flex-1 bg-black/20 border border-white/5 rounded-xl overflow-hidden flex flex-col relative">
    {#if assistantState.messages.length === 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-4 p-8 text-center">
        <Bot size={48} class="opacity-20" />
        <div class="max-w-md">
            <p class="text-lg font-medium text-zinc-300 mb-2">How can I help you today?</p>
            <p class="text-sm opacity-70">I can analyze your game logs, diagnose crashes, or explain mod features.</p>
        </div>
        {#if !settingsState.settings.assistant.enabled}
            <div class="bg-zinc-500/10 border border-zinc-500/20 rounded-lg p-4 text-sm text-zinc-400 mt-4 max-w-sm">
                Assistant is disabled. Enable it in <button onclick={() => uiState.setView('settings')} class="text-indigo-400 hover:underline">Settings > AI Assistant</button>.
            </div>
        {:else if !assistantState.isProviderHealthy}
            <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400 mt-4 max-w-sm">
                {getProviderHelpText()}
            </div>
        {/if}
      </div>
    {/if}

    <div 
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
    >
      {#each assistantState.messages as msg, idx}
        <div class="flex gap-3 {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          {#if msg.role === 'assistant'}
            <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
              <Bot size={16} />
            </div>
          {/if}
          
          <div class="max-w-[80%] p-3 rounded-2xl {msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-800/50 text-zinc-200 rounded-tl-none border border-white/5'}">
            {#if msg.role === 'user'}
              <div class="break-words whitespace-pre-wrap">
                {msg.content}
              </div>
            {:else}
              {@const parsed = parseMessageContent(msg.content)}
              
              <!-- Thinking Block -->
              {#if parsed.thinking}
                  <div class="mb-3 max-w-full overflow-hidden">
                      <details class="group" open={parsed.isThinking}>
                          <summary class="list-none cursor-pointer flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-xs font-medium select-none bg-black/20 p-2 rounded-lg border border-white/5 w-fit mb-2 outline-none">
                              <Brain size={14} />
                              <span>Thinking Process</span>
                              <ChevronDown size={14} class="transition-transform duration-200 group-open:rotate-180" />
                          </summary>
                          <div class="pl-3 border-l-2 border-zinc-700 text-zinc-500 text-xs italic leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto custom-scrollbar bg-black/10 p-2 rounded-r-md">
                              {parsed.thinking}
                              {#if parsed.isThinking}
                                  <span class="inline-block w-1.5 h-3 bg-zinc-500 ml-1 animate-pulse align-middle"></span>
                              {/if}
                          </div>
                      </details>
                  </div>
              {/if}

              <!-- Markdown rendered content for assistant -->
              <div class="markdown-content prose prose-invert prose-sm max-w-none">
                {#if parsed.content}
                  {@html renderMarkdown(parsed.content)}
                {:else if assistantState.isProcessing && idx === assistantState.messages.length - 1 && !parsed.isThinking}
                  <span class="inline-flex items-center gap-1">
                    <span class="w-2 h-2 bg-zinc-400 rounded-full animate-pulse"></span>
                    <span class="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style="animation-delay: 0.2s"></span>
                    <span class="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style="animation-delay: 0.4s"></span>
                  </span>
                {/if}
              </div>

              <!-- Generation Stats -->
              {#if msg.stats}
                <div class="mt-3 pt-3 border-t border-white/5 text-[10px] text-zinc-500 font-mono flex flex-wrap gap-x-4 gap-y-1 opacity-70 hover:opacity-100 transition-opacity select-none">
                    <div class="flex gap-1" title="Tokens generated">
                        <span>Eval:</span>
                        <span class="text-zinc-400">{msg.stats.eval_count} tokens</span>
                    </div>
                    <div class="flex gap-1" title="Total duration">
                        <span>Time:</span>
                        <span class="text-zinc-400">{(msg.stats.total_duration / 1e9).toFixed(2)}s</span>
                    </div>
                    {#if msg.stats.eval_duration > 0}
                        <div class="flex gap-1" title="Generation speed">
                            <span>Speed:</span>
                            <span class="text-zinc-400">{(msg.stats.eval_count / (msg.stats.eval_duration / 1e9)).toFixed(1)} t/s</span>
                        </div>
                    {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Input Area -->
    <div class="p-4 bg-zinc-900/50 border-t border-white/5">
      <div class="relative">
        <textarea
          bind:value={input}
          onkeydown={handleKeydown}
          placeholder={settingsState.settings.assistant.enabled ? "Ask about your game..." : "Assistant is disabled..."}
          class="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-[52px] max-h-32 transition-all text-white disabled:opacity-50"
          disabled={assistantState.isProcessing || !settingsState.settings.assistant.enabled}
        ></textarea>
        
        <button
          onclick={handleSubmit}
          disabled={!input.trim() || assistantState.isProcessing || !settingsState.settings.assistant.enabled}
          class="absolute right-2 top-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Markdown content styles */
  .markdown-content :global(p) {
    margin-bottom: 0.5rem;
  }
  
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  
  .markdown-content :global(pre) {
    background-color: rgba(0, 0, 0, 0.4);
    border-radius: 0.5rem;
    padding: 0.75rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }
  
  .markdown-content :global(code) {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.85em;
  }
  
  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
  }
  
  .markdown-content :global(:not(pre) > code) {
    background-color: rgba(0, 0, 0, 0.3);
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
  }
  
  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  
  .markdown-content :global(li) {
    margin: 0.25rem 0;
  }
  
  .markdown-content :global(blockquote) {
    border-left: 3px solid rgba(99, 102, 241, 0.5);
    padding-left: 1rem;
    margin: 0.5rem 0;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4) {
    font-weight: 600;
    margin: 0.75rem 0 0.5rem 0;
  }
  
  .markdown-content :global(h1) {
    font-size: 1.25rem;
  }
  
  .markdown-content :global(h2) {
    font-size: 1.125rem;
  }
  
  .markdown-content :global(h3) {
    font-size: 1rem;
  }
  
  .markdown-content :global(a) {
    color: rgb(129, 140, 248);
    text-decoration: underline;
  }
  
  .markdown-content :global(a:hover) {
    color: rgb(165, 180, 252);
  }
  
  .markdown-content :global(table) {
    border-collapse: collapse;
    margin: 0.5rem 0;
    width: 100%;
  }
  
  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.5rem;
    text-align: left;
  }
  
  .markdown-content :global(th) {
    background-color: rgba(0, 0, 0, 0.3);
    font-weight: 600;
  }
  
  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 1rem 0;
  }
  
  .markdown-content :global(img) {
    max-width: 100%;
    border-radius: 0.5rem;
  }
  
  .markdown-content :global(strong) {
    font-weight: 600;
  }
  
  .markdown-content :global(em) {
    font-style: italic;
  }
</style>
