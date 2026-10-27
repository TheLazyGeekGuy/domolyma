import { createRoot } from "react-dom/client";
import AuthGate from "./AuthGate";
import App from "./App";
import { lazy, Suspense } from "react";
import { msg, setLocale } from "./i18n";
const ErgonomicsPrototype = lazy(() => import("./ErgonomicsPrototype"));
async function start() {
  if (import.meta.env.VITE_STATIC_DEMO) {
    const language = new URLSearchParams(location.search).get("lang");
    if (language === "fr" || language === "en") setLocale(language);
    const root = document.getElementById("root")!;
    root.textContent = msg("demo.loading");
    await (await import("../../demo/register")).startDemo();
  }
  createRoot(document.getElementById("root")!).render(
    new URLSearchParams(location.search).get("maquette") === "ergonomie" ? (
      <Suspense fallback={<p>{msg("application.prototype_loading")}</p>}>
        <ErgonomicsPrototype />
      </Suspense>
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    ),
  );
}
void start().catch((error) => {
  console.error(error);
  document.getElementById("root")!.textContent = msg(
    "demo.initialization_failed",
  );
});
