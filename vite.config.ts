import { pdfAssets } from "./scripts/pdf-assets.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
const instance = process.env.DOMOLYMA_INSTANCE || "local";
if (!["local", "development"].includes(instance))
  throw new Error("Instance inconnue");
export default defineConfig({
  define: {
    "import.meta.env.VITE_DOMOLYMA_INSTANCE": JSON.stringify(instance),
  },
  plugins: [
    react(),
    pdfAssets(),
    cloudflare({
      config: { vars: { INSTANCE: instance, APP_REVISION: "development" } },
      persistState: {
        path:
          instance === "local"
            ? ".wrangler/state"
            : ".wrangler/development-state",
      },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: instance === "local" ? 5173 : 5174,
    strictPort: true,
  },
});
