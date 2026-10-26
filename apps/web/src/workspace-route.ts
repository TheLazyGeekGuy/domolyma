import { useEffect, useState } from "react";
export const pages = [
  "overview",
  "tasks",
  "portfolio",
  "lots",
  "rentals",
  "incidents",
  "event",
  "equipment",
  "contract",
  "visit",
  "access",
  "contacts",
  "documents",
  "assemblies",
  "governance",
  "finances",
  "members",
  "history",
  "administration",
];
export type WorkspaceRoute = {
  page: string;
  context: string;
  year: number;
  record: string;
  search: string;
  view?: string;
};
export function readRoute(hash: string): WorkspaceRoute {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const year = Number(params.get("year"));
  return {
    page: pages.includes(path) ? path : "overview",
    context: params.get("residence") || "",
    year:
      Number.isInteger(year) && year >= 1900 && year <= 2200
        ? year
        : new Date().getFullYear(),
    record: params.get("record") || "",
    search: params.get("q") || "",
    ...(["assemblies", "decisions", "offers", "keys"].includes(
      params.get("view") || "",
    )
      ? { view: params.get("view")! }
      : {}),
  };
}
export function routeHash(route: WorkspaceRoute) {
  const params = new URLSearchParams({
    residence: route.context,
    year: String(route.year),
  });
  if (route.view) params.set("view", route.view);
  if (route.record) params.set("record", route.record);
  if (route.search) params.set("q", route.search);
  return `#/${route.page}?${params}`;
}
export function useWorkspaceRoute() {
  const [route, setState] = useState(() => readRoute(location.hash));
  useEffect(() => {
    const sync = () => setState(readRoute(location.hash));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  const update = (patch: Partial<WorkspaceRoute>, replace = false) => {
    // Read the current URL so sequential changes do not overwrite each other.
    const next = { ...readRoute(location.hash), ...patch };
    history[replace ? "replaceState" : "pushState"](null, "", routeHash(next));
    setState(next);
  };
  return [route, update] as const;
}
