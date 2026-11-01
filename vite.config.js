import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
