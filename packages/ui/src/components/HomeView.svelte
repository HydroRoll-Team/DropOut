<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState } from '../stores/game.svelte';
  import { releasesState } from '../stores/releases.svelte';
  import { Calendar, ExternalLink } from 'lucide-svelte';
  import { getSaturnEffect } from './ParticleBackground.svelte';

  type Props = {
    mouseX: number;
    mouseY: number;
  };
  let { mouseX = 0, mouseY = 0 }: Props = $props();

  // Saturn effect mouse interaction handlers
  function handleSaturnMouseDown(e: MouseEvent) {
    const effect = getSaturnEffect();
    if (effect) {
      effect.handleMouseDown(e.clientX);
    }
  }

  function handleSaturnMouseMove(e: MouseEvent) {
    const effect = getSaturnEffect();
    if (effect) {
      effect.handleMouseMove(e.clientX);
    }
  }

  function handleSaturnMouseUp() {
    const effect = getSaturnEffect();
    if (effect) {
      effect.handleMouseUp();
    }
  }

  function handleSaturnMouseLeave() {
    const effect = getSaturnEffect();
    if (effect) {
      effect.handleMouseUp();
    }
  }

  function handleSaturnTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      const effect = getSaturnEffect();
      if (effect) {
        effect.handleTouchStart(e.touches[0].clientX);
      }
    }
  }

  function handleSaturnTouchMove(e: TouchEvent) {
    if (e.touches.length === 1) {
      const effect = getSaturnEffect();
      if (effect) {
        effect.handleTouchMove(e.touches[0].clientX);
      }
    }
  }

  function handleSaturnTouchEnd() {
    const effect = getSaturnEffect();
    if (effect) {
      effect.handleTouchEnd();
    }
  }

  onMount(() => {
    releasesState.loadReleases();
  });

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  
  function escapeHtml(unsafe: string) {
      return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
  }

  // Enhanced markdown parser with Emoji and GitHub specific features
  function formatBody(body: string) {
      if (!body) return '';
      
      // Escape HTML first to prevent XSS
      let processed = escapeHtml(body);
      
      // Emoji map (common GitHub emojis)
      const emojiMap: Record<string, string> = {
          ':tada:': '🎉', ':sparkles:': '✨', ':bug:': '🐛', ':memo:': '📝',
          ':rocket:': '🚀', ':white_check_mark:': '✅', ':construction:': '🚧',
          ':recycle:': '♻️', ':wrench:': '🔧', ':package:': '📦',
          ':arrow_up:': '⬆️', ':arrow_down:': '⬇️', ':warning:': '⚠️',
          ':fire:': '🔥', ':heart:': '❤️', ':star:': '⭐', ':zap:': '⚡',
          ':art:': '🎨', ':lipstick:': '💄', ':globe_with_meridians:': '🌐'
      };

      // Replace emojis
      processed = processed.replace(/:[a-z0-9_]+:/g, (match) => emojiMap[match] || match);

      // GitHub commit hash linking (simple version for 7-40 hex chars inside backticks)
      processed = processed.replace(/`([0-9a-f]{7,40})`/g, (match, hash) => {
          return `<a href="https://github.com/HydroRoll-Team/DropOut/commit/${hash}" target="_blank" class="text-emerald-500 hover:underline font-mono bg-emerald-500/10 px-1 rounded text-[10px] py-0.5 transition-colors border border-emerald-500/20 hover:border-emerald-500/50">${hash.substring(0, 7)}</a>`;
      });
      
      // Auto-link users (@user)
      processed = processed.replace(/@([a-zA-Z0-9-]+)/g, '<a href="https://github.com/$1" target="_blank" class="text-zinc-300 hover:text-white hover:underline font-medium">@$1</a>');

      return processed.split('\n').map(line => {
          line = line.trim();
          
          // Formatting helper
          const formatLine = (text: string) => text
              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-zinc-200">$1</strong>')
              .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="text-zinc-400 italic">$1</em>')
              .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 py-0.5 rounded text-xs text-zinc-300 font-mono border border-white/5 break-all whitespace-normal">$1</code>')
              .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-indigo-400 hover:text-indigo-300 hover:underline decoration-indigo-400/30 break-all">$1</a>');

          // Lists
          if (line.startsWith('- ') || line.startsWith('* ')) {
              return `<li class="ml-4 list-disc marker:text-zinc-600 mb-1 pl-1 text-zinc-400">${formatLine(line.substring(2))}</li>`;
          }
          
          // Headers
          if (line.startsWith('##')) {
               return `<h3 class="text-sm font-bold mt-6 mb-3 text-zinc-100 flex items-center gap-2 border-b border-white/5 pb-2 uppercase tracking-wide">${line.replace(/^#+\s+/, '')}</h3>`;
          }
          if (line.startsWith('#')) {
               return `<h3 class="text-base font-bold mt-6 mb-3 text-white">${line.replace(/^#+\s+/, '')}</h3>`;
          }
          
          // Blockquotes
          if (line.startsWith('> ')) {
              return `<blockquote class="border-l-2 border-zinc-700 pl-4 py-1 my-2 text-zinc-500 italic bg-white/5 rounded-r-sm">${formatLine(line.substring(2))}</blockquote>`;
          }
          
          // Empty lines
          if (line === '') return '<div class="h-2"></div>';
          
          // Paragraphs
          return `<p class="mb-1.5 leading-relaxed">${formatLine(line)}</p>`;
      }).join('');
  }
</script>

<div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
  <!-- Fixed Background -->
  <div class="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/60 to-transparent"></div>
</div>

<!-- Scrollable Container -->
<div class="relative z-10 h-full {releasesState.isLoading ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar scroll-smooth'}">
  
  <!-- Hero Section (Full Height) - Interactive area for Saturn rotation -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="min-h-full flex flex-col justify-end p-12 pb-32 cursor-grab active:cursor-grabbing select-none"
    onmousedown={handleSaturnMouseDown}
    onmousemove={handleSaturnMouseMove}
    onmouseup={handleSaturnMouseUp}
    onmouseleave={handleSaturnMouseLeave}
    ontouchstart={handleSaturnTouchStart}
    ontouchmove={handleSaturnTouchMove}
    ontouchend={handleSaturnTouchEnd}
  >
     <!-- 3D Floating Hero Text -->
      <div 
        class="transition-transform duration-200 ease-out origin-bottom-left"
        style:transform={`perspective(1000px) rotateX(${mouseY * -1}deg) rotateY(${mouseX * 1}deg)`}
      >
        <div class="flex items-center gap-3 mb-6">
           <div class="h-px w-12 bg-white/50"></div>
           <span class="text-xs font-mono font-bold tracking-[0.2em] text-white/50 uppercase">Launcher Active</span>
        </div>

        <h1
          class="text-8xl font-black tracking-tighter text-white mb-6 leading-none"
        >
          MINECRAFT
        </h1>
        
        <div class="flex items-center gap-4">
          <div 
            class="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest text-white shadow-sm"
          >
            Java Edition
          </div>
          <div class="h-4 w-px bg-white/20"></div>
          <div class="text-xl font-light text-zinc-400">
            Latest Release <span class="text-white font-medium">{gameState.latestRelease?.id || '...'}</span>
          </div>
        </div>
      </div>

      <!-- Action Area -->
      <div class="mt-8 flex gap-4">
        <div class="text-zinc-500 text-sm font-mono">
          > Ready to launch session.
        </div>
      </div>

      <!-- Scroll Hint -->
      {#if !releasesState.isLoading && releasesState.releases.length > 0}
      <div class="absolute bottom-10 left-12 animate-bounce text-zinc-600 flex flex-col items-center gap-2 w-fit opacity-50 hover:opacity-100 transition-opacity">
          <span class="text-[10px] font-mono uppercase tracking-widest">Scroll for Updates</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
      </div>
      {/if}
  </div>

  <!-- Changelog / Updates Section -->
  <div class="bg-[#09090b] relative z-20 px-12 pb-24 pt-12 border-t border-white/5 min-h-[50vh]">
      <div class="max-w-4xl">
          <h2 class="text-2xl font-bold text-white mb-10 flex items-center gap-3">
              <span class="w-1.5 h-8 bg-emerald-500 rounded-sm"></span>
              LATEST UPDATES
          </h2>

          {#if releasesState.isLoading}
            <div class="flex flex-col gap-8">
                {#each Array(3) as _}
                    <div class="h-48 bg-white/5 rounded-sm animate-pulse border border-white/5"></div>
                {/each}
            </div>
          {:else if releasesState.error}
             <div class="p-6 border border-red-500/20 bg-red-500/10 text-red-400 rounded-sm">
                 Failed to load updates: {releasesState.error}
             </div>
          {:else if releasesState.releases.length === 0}
             <div class="text-zinc-500 italic">No releases found.</div>
          {:else}
             <div class="space-y-12">
                 {#each releasesState.releases as release}
                    <div class="group relative pl-8 border-l border-white/10 pb-4 last:pb-0 last:border-l-0">
                        <!-- Timeline Dot -->
                        <div class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-600 group-hover:bg-emerald-500 group-hover:border-emerald-400 transition-colors"></div>
                        
                        <div class="flex items-baseline gap-4 mb-3">
                             <h3 class="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                                {release.name || release.tag_name}
                             </h3>
                             <div class="text-xs font-mono text-zinc-500 flex items-center gap-2">
                                <Calendar size={12} />
                                {formatDate(release.published_at)}
                             </div>
                        </div>

                        <div class="bg-zinc-900/50 border border-white/5 hover:border-white/10 rounded-sm p-6 text-zinc-400 text-sm leading-relaxed transition-colors overflow-hidden">
                            <div class="prose prose-invert prose-sm max-w-none prose-p:text-zinc-400 prose-headings:text-zinc-200 prose-ul:my-2 prose-li:my-0 break-words whitespace-normal">
                                {@html formatBody(release.body)}
                            </div>
                        </div>
                        
                        <a href={release.html_url} target="_blank" class="inline-flex items-center gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-zinc-600 hover:text-white transition-colors">
                            View full changelog on GitHub <ExternalLink size={10} />
                        </a>
                    </div>
                 {/each}
             </div>
          {/if}
      </div>
  </div>
</div>
