/// <reference lib="webworker" />
import { upgradeBrowserDatabase } from "./upgrade";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import api from "../api/index";
import { BrowserDatabase, BrowserFiles } from "./database";
import { readState, writeState } from "./storage";
import { internalRequest } from "./request";
import demoSeed from "../../fixtures/demo.sql?raw";
import residentsSeed from "../../fixtures/residents.sql?raw";
import pagesSeed from "../../fixtures/pages.sql?raw";

const sw = self as unknown as ServiceWorkerGlobalScope;
const migrations = import.meta.glob("../../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const SQL = initSqlJs({
  locateFile: () => new URL(wasmUrl, sw.location.origin).href,
});
type Runtime = { db: BrowserDatabase; files: BrowserFiles; profile: string };
const env = (runtime: Runtime) => ({
  DB: runtime.db as unknown as D1Database,
  FILES: runtime.files as unknown as R2Bucket,
  DEMO_MODE: "local-only",
  APP_REVISION: "pages-demo",
  INSTANCE: "browser-demo",
});
async function fresh(): Promise<Runtime> {
  const sqlite = new (await SQL).Database();
  for (const [, sql] of Object.entries(migrations).sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    sqlite.run(sql);
  sqlite.run(demoSeed);
  sqlite.run(residentsSeed);
  sqlite.run(pagesSeed);
  const runtime = {
    db: new BrowserDatabase(sqlite),
    files: new BrowserFiles(),
    profile: "demo-manager",
  };
  for (const [name, title, type] of [
    ["guide-demo.pdf", "Guide de la résidence fictive", "application/pdf"],
    ["notice-demo.txt", "Notice de démonstration", "text/plain"],
  ]) {
    const response = await fetch(
      new URL("fixtures/" + name, sw.registration.scope),
    );
    if (!response.ok) throw new Error("Demo fixture unavailable");
    const form = new FormData();
    form.set("file", new File([await response.arrayBuffer()], name, { type }));
    form.set("title", title);
    form.set("audience", "shared");
    const result = await api.fetch(
      internalRequest("/api/condominiums/demo-tilleuls/documents?year=2026", {
        method: "POST",
        body: form,
      }),
      env(runtime),
    );
    if (!result.ok)
      throw new Error(
        "Demo document initialization failed: " + (await result.text()),
      );
  }
  return runtime;
}
async function persist(runtime: Runtime) {
  const sqlite = runtime.db.sqlite.export();
  runtime.db.sqlite.run("PRAGMA foreign_keys=ON");
  await writeState({
    schema: 1,
    sqlite,
    files: [...runtime.files.files],
    profile: runtime.profile,
  });
}
let runtime: Promise<Runtime> | undefined;
function load() {
  return (runtime ??= (async () => {
    const saved = await readState();
    if (saved?.schema === 1) {
      const sqlite = new (await SQL).Database(saved.sqlite);
      upgradeBrowserDatabase(sqlite);
      const restored = {
        db: new BrowserDatabase(sqlite),
        files: new BrowserFiles(new Map(saved.files)),
        profile: saved.profile,
      };
      await persist(restored);
      return restored;
    }
    const value = await fresh();
    await persist(value);
    return value;
  })().then((value) => {
    value.db.sqlite.run("PRAGMA foreign_keys=ON");
    return value;
  }));
}
let queue: Promise<unknown> = Promise.resolve();
async function dispatch(request: Request) {
  let value = await load();
  const incoming = new URL(request.url);
  const base = new URL(sw.registration.scope).pathname;
  const path = incoming.pathname.slice(base.length - 1);
  if (path === "/api/demo/reset" && request.method === "POST") {
    const replacement = await fresh();
    await persist(replacement);
    value.db.sqlite.close();
    runtime = Promise.resolve(replacement);
    return Response.json({ saved: true });
  }
  const headers = new Headers(request.headers);
  headers.set("Origin", "http://localhost");
  headers.set("Cookie", "domolyma_demo=" + value.profile);
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  const response = await api.fetch(
    internalRequest(
      path + incoming.search,
      { method: request.method, headers, body },
      value.profile,
    ),
    env(value),
  );
  // Native browser Responses strip Set-Cookie. Apply only an API-validated profile change.
  if (
    path === "/api/demo/profile" &&
    request.method === "POST" &&
    response.status === 204 &&
    body
  ) {
    value.profile = JSON.parse(new TextDecoder().decode(body)).userId;
  }
  if (!["GET", "HEAD"].includes(request.method)) await persist(value);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("Set-Cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
sw.addEventListener("install", (event) => event.waitUntil(sw.skipWaiting()));
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));
sw.addEventListener("message", (event) => {
  if (event.data === "DOMOLYMA_CLAIM") event.waitUntil(sw.clients.claim());
});
sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== sw.location.origin ||
    !url.pathname.startsWith(new URL("api/", sw.registration.scope).pathname)
  )
    return;
  const result = queue.then(() => dispatch(event.request));
  queue = result.catch(() => {});
  event.respondWith(
    result.catch((error) => {
      console.error("Demo runtime", error);
      return Response.json(
        {
          error:
            "Demo unavailable. Reload or reset this browser’s demo storage.",
        },
        { status: 503 },
      );
    }),
  );
});
