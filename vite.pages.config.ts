import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pdfAssets } from "./scripts/pdf-assets";
const base = process.env.PAGES_BASE || "/domolyma/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw new Error("Invalid Pages base path");
const worker = process.env.PAGES_WORKER === "1";
export default defineConfig({
  base: base + "demo/",
  define: {
    "import.meta.env.VITE_STATIC_DEMO": "true",
    "import.meta.env.VITE_DOMOLYMA_INSTANCE": JSON.stringify("development"),
  },
  plugins: worker ? [] : [react(), pdfAssets()],
  build: {
    outDir: "dist/pages/demo",
    emptyOutDir: !worker,
    sourcemap: false,
    ...(worker
      ? {
          lib: {
            entry: "apps/demo/service-worker.ts",
            name: "DomolymaDemo",
            formats: ["iife"],
            fileName: () => "demo-worker.js",
          },
          assetsInlineLimit: 0,
        }
      : {}),
  },
});
