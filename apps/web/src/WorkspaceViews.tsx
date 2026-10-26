import { msg, labelText, localeTag } from "./i18n";
import { FilterWorkspace } from "./Ergonomics";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  Layers,
  Wrench,
} from "lucide-react";
import { apiFetch } from "./session";
import { roleLabels } from "../../../packages/contracts/operations";
import type { WorkItem } from "../../../packages/domain/worklist";
import type { OperationsData } from "./OperationsPanel";
import "./workspace.css";

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const r = await apiFetch(path, { signal });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || msg("document_vault.m0340"));
  return data as T;
}
export function useWorklist(context: string, refresh: unknown) {
  const [result, setResult] = useState<{ asOf: string; items: WorkItem[] }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    if (context)
      get<{ asOf: string; items: WorkItem[] }>(
        `/api/condominiums/${encodeURIComponent(context)}/worklist`,
        controller.signal,
      )
        .then(setResult)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [context, refresh]);
  return { result, error };
}
const labels: () => Record<string, string> = () => ({
  incident: msg("workspace_views.m1134"),
  decision_action: msg("workspace_views.m1135"),
  visit: msg("workspace_views.m1136"),
  equipment: msg("workspace_views.m1137"),
  contract: msg("governance_panel.m0571"),
});
const day = (date: string) =>
  date
    ? new Intl.DateTimeFormat(localeTag(), {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Paris",
      }).format(new Date(date + "T12:00:00Z"))
    : msg("app.m0062");
export function TaskRows({
  items,
  asOf,
  onOpen,
}: {
  items: WorkItem[];
  asOf: string;
  onOpen: (item: WorkItem) => void;
}) {
  return (
    <div className="work-list">
      {items.length ? (
        items.map((item) => (
          <button
            key={`${item.kind}:${item.id}`}
            className={msg("workspace_views.m1138", {
              p1: item.dueDate && item.dueDate < asOf ? "overdue" : "",
            })}
            onClick={() => onOpen(item)}
          >
            <span className="work-mark">
              <Wrench size={17} />
            </span>
            <span className="work-title">
              <strong>{item.title}</strong>
              <small>
                {labels()[item.kind]} · {labelText(item.status)}
                {msg("workspace_views.m1139")}
                {item.year}
              </small>
              <small>
                {item.assigneeFallback
                  ? msg(`worklist.assignee_${item.assigneeFallback}`)
                  : item.assignee}
              </small>
            </span>
            <span className="work-due">
              {item.dueDate && item.dueDate < asOf && (
                <span>{msg("ergonomics_prototype.m0563")}</span>
              )}
              {day(item.dueDate)}
              <small>{labelText(item.priority)}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))
      ) : (
        <p className="work-empty">{msg("workspace_views.m1140")}</p>
      )}
    </div>
  );
}
export function WorkQueue({
  context,
  refresh,
  onOpen,
  search,
  onSearch,
}: {
  context: string;
  refresh: unknown;
  onOpen: (item: WorkItem) => void;
  search: string;
  onSearch: (s: string) => void;
}) {
  const { result, error } = useWorklist(context, refresh);
  const [late, setLate] = useState(false),
    [kind, setKind] = useState("all");
  useEffect(() => {
    setLate(false);
    setKind("all");
  }, [context]);
  const items =
    result?.items.filter(
      (i) =>
        (!late || (i.dueDate && i.dueDate < result.asOf)) &&
        (kind === "all" || i.kind === kind) &&
        `${i.title} ${i.assignee} ${i.status}`
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")),
    ) || [];
  return (
    <section aria-label={msg("workspace_views.m1141")}>
      <p className="scope-note">{msg("workspace_views.m1142")}</p>
      <FilterWorkspace
        id={`queue:${context}`}
        scope={msg("workspace_views.m1143")}
        title={msg("workspace_views.m1144")}
        count={items.length}
        total={result?.items.length || 0}
        active={[
          ...(search
            ? [
                {
                  key: "search",
                  label: msg("app.m0155", { p1: search }),
                  remove: () => onSearch(""),
                },
              ]
            : []),
          ...(kind !== "all"
            ? [
                {
                  key: "kind",
                  label: labels()[kind],
                  remove: () => setKind("all"),
                },
              ]
            : []),
          ...(late
            ? [
                {
                  key: "late",
                  label: msg("ergonomics_prototype.m0559"),
                  remove: () => setLate(false),
                },
              ]
            : []),
        ]}
        onReset={() => {
          onSearch("");
          setKind("all");
          setLate(false);
        }}
        rail={
          <>
            {" "}
            <input
              type="search"
              aria-label={msg("workspace_views.m1145")}
              placeholder={msg("workspace_views.m1146")}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
            <select
              aria-label={msg("workspace_views.m1147")}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">{msg("workspace_views.m1148")}</option>
              {Object.entries(labels()).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <label className="erg-checkbox">
              <input
                type="checkbox"
                checked={late}
                onChange={(e) => setLate(e.target.checked)}
              />
              {msg("ergonomics_prototype.m0559")}
            </label>
          </>
        }
      >
        {error && (
          <p role="alert" className="error">
            {labelText(error)}
          </p>
        )}
        {!result && !error && (
          <p role="status">{msg("workspace_views.m1149")}</p>
        )}
        {result && (
          <TaskRows items={items} asOf={result.asOf} onOpen={onOpen} />
        )}
      </FilterWorkspace>
    </section>
  );
}
export function WorkspaceHome({
  data,
  context,
  onOpen,
  changePage,
}: {
  data: OperationsData;
  context: string;
  onOpen: (item: WorkItem) => void;
  changePage: (page: string) => void;
}) {
  const { result, error } = useWorklist(context, data);
  const items = result?.items || [],
    upcoming = items
      .filter((i) => i.dueDate && i.dueDate >= (result?.asOf || ""))
      .slice(0, 3);
  return (
    <div className="workspace-home">
      <section className="work-stats" aria-label={msg("workspace_views.m1150")}>
        <div>
          <span>
            {data.roles.includes("supplier")
              ? msg("workspace_views.m1151")
              : msg("workspace_views.m1152")}
          </span>
          <strong>{result ? items.length : "…"}</strong>
          <small>{msg("workspace_views.m1153")}</small>
        </div>
        <div>
          <span>{msg("workspace_views.m1154")}</span>
          <strong>
            {result
              ? items.filter((i) => i.dueDate && i.dueDate < result.asOf).length
              : "…"}
          </strong>
          <small>
            {msg("workspace_views.m1155")}
            {result ? day(result.asOf) : "…"}
          </small>
        </div>
        <div>
          <span>{msg("workspace_views.m1156")}</span>
          <strong>
            {result
              ? upcoming[0]
                ? day(upcoming[0].dueDate)
                : msg("workspace_views.m1157")
              : "…"}
          </strong>
          <small>
            {result
              ? msg("workspace_views.m1158", {
                  p1: items.filter((i) => !i.dueDate).length,
                })
              : msg("common.loading")}
          </small>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {labelText(error)}
        </p>
      )}
      <div className="work-home-columns">
        <section>
          <div className="section-heading">
            <h2>
              {data.roles.includes("supplier")
                ? msg("workspace_views.m1159")
                : msg("workspace_views.m1160")}
            </h2>
            <button className="text-button" onClick={() => changePage("tasks")}>
              {msg("workspace_views.m1161")}
              <ArrowUpRight size={15} />
            </button>
          </div>
          {result && (
            <TaskRows
              items={items.slice(0, 4)}
              asOf={result.asOf}
              onOpen={onOpen}
            />
          )}
        </section>
        <aside className="work-upcoming">
          <h2>{msg("budget_panel.m0299")}</h2>
          {upcoming.length ? (
            upcoming.map((i) => (
              <button
                className="work-agenda"
                aria-label={`${day(i.dueDate)} · ${i.title}`}
                key={i.id}
                onClick={() => onOpen(i)}
              >
                <CalendarDays size={17} />
                <span>
                  <strong>{day(i.dueDate)}</strong>
                  {i.title}
                </span>
              </button>
            ))
          ) : (
            <p className="work-empty">{msg("workspace_views.m1162")}</p>
          )}
          <h2>{msg("workspace_views.m1163")}</h2>
          <div className="work-shortcuts">
            {data.roles.includes("owner") && (
              <button onClick={() => changePage("rentals")}>
                <Layers size={17} />
                {msg("app.m0048")}
                <ChevronRight size={16} />
              </button>
            )}
            <button onClick={() => changePage("documents")}>
              <FolderOpen size={17} />
              {msg("document_vault.m0379")}
              <ChevronRight size={16} />
            </button>
            <button onClick={() => changePage("portfolio")}>
              <Building2 size={17} />
              {msg("workspace_views.m1164")}
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
type Property = {
  id: string;
  name: string;
  address: string;
  fiscal_year: number;
  roles: string[];
  lots: number;
  ownedLots: number;
  tasks: number;
  overdue: number;
};
export function Portfolio({
  onSelect,
}: {
  onSelect: (id: string, year: number) => void;
}) {
  const [properties, setProperties] = useState<Property[]>(),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    get<{ properties: Property[] }>("/api/portfolio", c.signal)
      .then((d) => setProperties(d.properties))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <section aria-label={msg("workspace_views.m1165")}>
      {error && (
        <p role="alert" className="error">
          {labelText(error)}
        </p>
      )}
      {!properties && !error && <p>{msg("workspace_views.m1166")}</p>}
      {properties?.length === 0 && <p>{msg("workspace_views.m1167")}</p>}
      {properties?.map((p) => (
        <article className="work-property" key={p.id}>
          <span className="property-mark">
            <Building2 size={25} />
          </span>
          <div>
            <h2>{p.name}</h2>
            <p>{p.address}</p>
            <small>
              {p.roles.map((r) => labelText(roleLabels[r] || r)).join(" · ")}
            </small>
            <p>
              {p.lots}
              {msg("workspace_views.m1168")}
              {p.ownedLots}
              {msg("workspace_views.m1169")}
            </p>
            <button
              className="secondary"
              onClick={() => onSelect(p.id, p.fiscal_year)}
            >
              {msg("workspace_views.m1170")}
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="property-actions">
            <strong>{p.tasks}</strong>
            <span>{msg("workspace_views.m1171")}</span>
            <small>
              {p.overdue}
              {msg("workspace_views.m1172")}
            </small>
          </div>
        </article>
      ))}
      <p className="scope-note">{msg("workspace_views.m1173")}</p>
    </section>
  );
}
