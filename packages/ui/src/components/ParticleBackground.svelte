<script lang="ts" module>
  import { SaturnEffect } from "../lib/effects/SaturnEffect";
  
  // Global reference to the active Saturn effect for external control
  let globalSaturnEffect: SaturnEffect | null = null;
  
  export function getSaturnEffect(): SaturnEffect | null {
    return globalSaturnEffect;
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ConstellationEffect } from "../lib/effects/ConstellationEffect";
  import { settingsState } from "../stores/settings.svelte";

  let canvas: HTMLCanvasElement;
  let activeEffect: any;

  function loadEffect() {
    if (activeEffect) {
      activeEffect.destroy();
    }
    
    if (!canvas) return;

    if (settingsState.settings.active_effect === "saturn") {
      activeEffect = new SaturnEffect(canvas);
      globalSaturnEffect = activeEffect;
    } else {
      activeEffect = new ConstellationEffect(canvas);
      globalSaturnEffect = null;
    }
    
    // Ensure correct size immediately
    activeEffect.resize(window.innerWidth, window.innerHeight);
  }

  $effect(() => {
    const _ = settingsState.settings.active_effect;
    if (canvas) {
        loadEffect();
    }
  });

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (canvas && activeEffect) {
         activeEffect.resize(window.innerWidth, window.innerHeight);
      }
    });
    
    resizeObserver.observe(document.body);
    
    return () => {
      resizeObserver.disconnect();
      if (activeEffect) activeEffect.destroy();
    };
  });
  
  onDestroy(() => {
    if (activeEffect) activeEffect.destroy();
    globalSaturnEffect = null;
  });
</script>

<canvas
  bind:this={canvas}
  class="absolute inset-0 z-0 pointer-events-none"
></canvas>
