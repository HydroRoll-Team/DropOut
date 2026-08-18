import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import * as MdxConfig from "./source.config.ts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [mdx(MdxConfig), tailwindcss(), reactRouter()],
});
