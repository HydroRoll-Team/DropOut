<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ConstellationEffect } from "../lib/effects/ConstellationEffect";
  import { SaturnEffect } from "../lib/effects/SaturnEffect";
  import { settingsState } from "../stores/settings.svelte";

  let canvas: HTMLCanvasElement | undefined;
  let activeEffect: any;

  function loadEffect() {
    if (activeEffect) {
      activeEffect.destroy();
    }

    if (!canvas) return;

    if (settingsState.settings.active_effect === "saturn") {
      activeEffect = new SaturnEffect(canvas);
    } else {
      activeEffect = new ConstellationEffect(canvas);
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
  });
</script>

<canvas bind:this={canvas} class="absolute inset-0 z-0 pointer-events-none"
></canvas>
