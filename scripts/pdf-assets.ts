import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
/** Serve only the PDF renderer's versioned, public resources; no document cache. */
export function pdfAssets(): Plugin {
  const root = resolve(process.cwd(), "node_modules/pdfjs-dist"),
    version = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ).version;
  const assets = new Map<string, string>();
  assets.set(`/pdf-assets/${version}/LICENSE`, resolve(root, "LICENSE"));
  for (const dir of ["wasm", "standard_fonts", "cmaps"])
    for (const name of readdirSync(resolve(root, dir))) {
      if (/\.(wasm|pfb|ttf|bcmap|js)$/.test(name) || /^LICENSE/.test(name))
        assets.set(
          `/pdf-assets/${version}/${dir}/${name}`,
          resolve(root, dir, name),
        );
    }
  return {
    name: "domolyma-pdf-resources",
    applyToEnvironment: (environment) => environment.name === "client",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = assets.get((request.url || "").split("?")[0]);
        if (!path) return next();
        response.setHeader(
          "Content-Type",
          path.endsWith(".wasm")
            ? "application/wasm"
            : path.endsWith(".js")
              ? "text/javascript"
              : "application/octet-stream",
        );
        response.setHeader(
          "Cache-Control",
          "public,max-age=31536000,immutable",
        );
        createReadStream(path).pipe(response);
      });
    },
    generateBundle() {
      for (const [path, file] of assets)
        this.emitFile({
          type: "asset",
          fileName: path.slice(1),
          source: readFileSync(file),
        });
    },
  };
}
