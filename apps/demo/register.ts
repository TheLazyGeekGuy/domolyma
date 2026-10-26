export async function startDemo() {
  if (!("serviceWorker" in navigator))
    throw new Error(
      "This demonstration needs a browser with Service Worker support.",
    );
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  await navigator.serviceWorker.register(new URL("demo-worker.js", base), {
    scope: base.pathname,
  });
  const ready = await navigator.serviceWorker.ready;
  ready.active?.postMessage("DOMOLYMA_CLAIM");
  if (
    !navigator.serviceWorker.controller ||
    !navigator.serviceWorker.controller.scriptURL.startsWith(base.href)
  ) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          changed,
        );
        reject(new Error("Demo initialization timed out. Please reload."));
      }, 20000);
      function changed() {
        if (
          navigator.serviceWorker.controller?.scriptURL.startsWith(base.href)
        ) {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            changed,
          );
          resolve();
        }
      }
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      changed();
    });
  }
}
