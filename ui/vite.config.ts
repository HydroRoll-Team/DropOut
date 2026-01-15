import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],

  // Fix for Tauri + Vite HMR
  server: {
    host: true,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5173,
    },
    watch: {
      usePolling: true,
    },
  },

  // Ensure compatibility with Tauri
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});
