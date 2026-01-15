<script lang="ts">
  import { ChevronDown, Check } from 'lucide-svelte';

  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    options: Option[];
    value: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    onchange?: (value: string) => void;
  }

  let { 
    options, 
    value = $bindable(), 
    placeholder = "Select...", 
    disabled = false,
    class: className = "",
    onchange
  }: Props = $props();

  let isOpen = $state(false);
  let containerRef: HTMLDivElement;

  let selectedOption = $derived(options.find(o => o.value === value));

  function toggle() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  function select(option: Option) {
    if (option.disabled) return;
    value = option.value;
    isOpen = false;
    onchange?.(option.value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape') {
      isOpen = false;
    } else if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex(o => o.value === value);
      const nextIndex = Math.min(currentIndex + 1, options.length - 1);
      if (!options[nextIndex].disabled) {
        value = options[nextIndex].value;
      }
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex(o => o.value === value);
      const prevIndex = Math.max(currentIndex - 1, 0);
      if (!options[prevIndex].disabled) {
        value = options[prevIndex].value;
      }
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div 
  bind:this={containerRef}
  class="relative {className}"
>
  <!-- Trigger Button -->
  <button
    type="button"
    onclick={toggle}
    onkeydown={handleKeydown}
    {disabled}
    class="w-full flex items-center justify-between gap-2 px-3 py-2 pr-8 text-left
           bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200
           hover:border-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
           transition-colors cursor-pointer outline-none
           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-700"
  >
    <span class="truncate {!selectedOption ? 'text-zinc-500' : ''}">
      {selectedOption?.label || placeholder}
    </span>
    <ChevronDown 
      size={14} 
      class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}" 
    />
  </button>

  <!-- Dropdown Menu -->
  {#if isOpen}
    <div 
      class="absolute z-50 w-full mt-1 py-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl
             max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {#each options as option}
        <button
          type="button"
          onclick={() => select(option)}
          disabled={option.disabled}
          class="w-full flex items-center justify-between px-3 py-2 text-sm text-left
                 transition-colors outline-none
                 {option.value === value 
                   ? 'bg-indigo-600 text-white' 
                   : 'text-zinc-300 hover:bg-zinc-800'}
                 {option.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
        >
          <span class="truncate">{option.label}</span>
          {#if option.value === value}
            <Check size={14} class="shrink-0 ml-2" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
