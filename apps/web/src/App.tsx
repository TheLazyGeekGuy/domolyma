import { msg, labelText, localeTag, useLocale, LanguageSelector } from "./i18n";
import {
  PageWorkspace,
  FilterWorkspace,
  PageHeaderActions,
  WorkspaceNavigation,
} from "./Ergonomics";
import DocumentVault from "./DocumentVault";
import GovernancePanel from "./GovernancePanel";
import Administration from "./Administration";
import { apiFetch, setCsrfToken } from "./session";
import RentalsPanel from "./RentalsPanel";
import { RequestGeneration } from "./request-generation";
import BrandLogo from "./BrandLogo";
import ResidenceProfile from "./ResidenceProfile";
import { roleLabels } from "../../../packages/contracts/operations";
import BudgetPanel from "./BudgetPanel";
import IncidentFields, { type IncidentPreset } from "./IncidentFields";
import AccidentFollowup from "./AccidentFollowup";
import IncidentStatistics from "./IncidentStatistics";
import OperationsPanel, { type OperationsData } from "./OperationsPanel";
import React, { useEffect, useState, useRef } from "react";
import {
  Building2,
  LayoutDashboard,
  Layers,
  Users,
  FolderOpen,
  Wrench,
  Landmark,
  Wallet,
  Plus,
  X,
  ChevronRight,
  Clock3,
  Check,
  FileText,
  AlertCircle,
  Download,
  History,
  Menu,
} from "lucide-react";
import palettes from "../../../design/palettes.json";
import type { RecordRow, Lot } from "../../../packages/contracts";
import "./style.css";
import { Portfolio, WorkQueue, WorkspaceHome } from "./WorkspaceViews";
import { readRoute, useWorkspaceRoute } from "./workspace-route";
import {
  captureDraft,
  clearDrafts,
  draftKey,
  readDraft,
  removeDraft,
  writeDraft,
  type DraftFields,
} from "./form-drafts";
import type { WorkItem } from "../../../packages/domain/worklist";
type Version = {
  id: string;
  record_id: string;
  filename: string;
  mime?: string;
  size: number;
  sha256: string;
  created_at: string;
};
type Snapshot = OperationsData & {
  role: string;
  canManage?: boolean;
  readOnly?: boolean;
  lots: Lot[];
  records: RecordRow[];
  members: { id: string; name: string; role: string }[];
  versions: Version[];
  audit: {
    id: number;
    action: string;
    resource_id: string;
    resource_title?: string | null;
    actor_id: string;
    happened_at: string;
    version: number;
  }[];
};
type Bootstrap = {
  demo: boolean;
  administrator: boolean;
  ghost: { id: string; label: string } | null;
  user: { id: string; name: string };
  condominiums: {
    id: string;
    name: string;
    address: string;
    fiscal_year: number;
    role: string;
  }[];
};
const nav = () =>
  [
    ["overview", msg("app.m0044"), LayoutDashboard],
    ["tasks", msg("app.m0045"), Clock3],
    ["portfolio", msg("app.m0046"), Building2],
    ["lots", msg("app.m0047"), Layers],
    ["rentals", msg("app.m0048"), Layers],
    ["incidents", msg("app.m0049"), Wrench],
    ["event", msg("app.m0050"), Clock3],
    ["equipment", msg("app.m0051"), Building2],
    ["contract", msg("app.m0052"), FileText],
    ["visit", msg("app.m0053"), Wrench],
    ["access", msg("app.m0054"), Layers],
    ["contacts", msg("app.m0055"), Users],
    ["documents", msg("app.m0056"), FolderOpen],
    ["governance", msg("app.m0057"), Landmark],
    ["assemblies", msg("app.m0058"), FileText],
    ["finances", msg("app.m0059"), Wallet],
    ["members", msg("app.m0060"), Users],
    ["history", msg("app.m0061"), History],
  ] as const;
const currency = (c: number) =>
  new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency: "EUR",
  }).format(c / 100);
const date = (s: string) =>
  s
    ? new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium" }).format(
        new Date(s),
      )
    : msg("app.m0062");
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await apiFetch(path, options);
  if (!r.ok) {
    const body = (await r.json()) as { error?: string };
    throw new Error(body.error || msg("app.m0063"));
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
export default function App() {
  useLocale();
  const [route, updateRoute] = useWorkspaceRoute();
  const { context, year, page, search } = route;
  const setYear = (value: number) => updateRoute({ year: value, record: "" });
  const setPage = (value: string) =>
    updateRoute({ page: value, record: "", search: "" });
  const setSearch = (value: string) => updateRoute({ search: value }, true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyForm = useRef(false);
  const [draftFields, setDraftFields] = useState<DraftFields>({});
  const [draftConflict, setDraftConflict] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [closeGuard, setCloseGuard] = useState(false);
  const [incidentPreset, setIncidentPreset] = useState<IncidentPreset | null>(
    null,
  );
  const [incidentRestricted, setIncidentRestricted] = useState(false);
  const [boot, setBoot] = useState<Bootstrap>(),
    [linkedOps, setLinkedOps] = useState<string | null>(null),
    [data, setData] = useState<Snapshot>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [selected, setSelected] = useState<RecordRow | null>(null),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState(""),
    [incidentStatus, setIncidentStatus] = useState("");
  useEffect(() => setIncidentStatus(""), [context, year, boot?.user.id]);
  useEffect(() => {
    if (modal && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, [modal]);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("domolyma-theme") || "clay-sand",
  );
  const [ghosts, setGhosts] = useState<{ id: string; label: string }[]>([]);
  const loadBoot = async () => {
    const b = await api<Bootstrap>("/api/bootstrap");
    setBoot(b);
    if (!b.demo && (b.administrator || b.ghost)) {
      const g = await api<{ profiles: { id: string; label: string }[] }>(
        "/api/auth/ghosts",
      );
      setGhosts(g.profiles);
    }
    const requested = readRoute(location.hash);
    let remembered = "";
    try {
      remembered = localStorage.getItem(`domolyma-context:${b.user.id}`) || "";
    } catch {}
    const target =
      b.condominiums.find((c) => c.id === requested.context) ||
      b.condominiums.find((c) => c.id === remembered) ||
      b.condominiums[0];
    updateRoute(
      {
        context: target?.id || "",
        year:
          requested.context === target?.id
            ? requested.year
            : target?.fiscal_year || new Date().getFullYear(),
        ...(requested.context && requested.context !== target?.id
          ? { page: "overview", record: "", search: "" }
          : {}),
      },
      true,
    );
  };
  useEffect(() => {
    loadBoot().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const t =
      palettes.themes[theme as keyof typeof palettes.themes] ||
      palettes.themes["clay-sand"];
    for (const k of ["primary", "accent", "background", "surface"] as const)
      document.documentElement.style.setProperty(`--${k}`, t[k]);
    localStorage.setItem("domolyma-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (boot && context) {
      try {
        localStorage.setItem(`domolyma-context:${boot.user.id}`, context);
      } catch {}
    }
  }, [boot?.user.id, context]);
  const snapshotRequests = useRef(new RequestGeneration());
  const snapshotScope = JSON.stringify([
    context,
    year,
    boot?.user.id,
    boot?.ghost?.id,
  ]);
  snapshotRequests.current.setScope(snapshotScope);
  const reload = async () => {
    const current = snapshotRequests.current.start(snapshotScope);
    if (context && current) {
      try {
        const next = await api<Snapshot>(
          `/api/condominiums/${context}?year=${year}`,
        );
        if (current()) setData(next);
      } catch (error) {
        if (current()) throw error;
      }
    }
  };
  useEffect(() => {
    const current = snapshotRequests.current.start(snapshotScope);
    setData(undefined);
    setSelected(null);
    setModal(null);
    dirtyForm.current = false;
    setCloseGuard(false);
    setError("");
    if (context)
      api<Snapshot>(`/api/condominiums/${context}?year=${year}`)
        .then((d) => {
          if (current?.()) setData(d);
        })
        .catch((e) => {
          if (current?.()) setError(e.message);
        });
    return () => {
      snapshotRequests.current.invalidate();
    };
  }, [context, year, boot?.user.id, boot?.ghost?.id]);
  const condo = boot?.condominiums.find((c) => c.id === context),
    manager = !!data?.canManage && !data?.readOnly;
  const records = (kind: string) =>
    (data?.records || []).filter(
      (r) =>
        r.kind === kind &&
        `${r.title} ${JSON.stringify(r.payload)}`
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")),
    );
  const incidents = records("incident"),
    documents = records("document"),
    assemblies = records("assembly"),
    funds = records("fund");
  const currentDraftKey = (kind = modal || "", row = selected) =>
    draftKey(boot?.user.id || "", context, year, kind, row?.id);
  const rememberDraft = () => {
    if (
      !formRef.current ||
      !modal ||
      data?.readOnly ||
      Boolean(selected && !manager)
    )
      return;
    dirtyForm.current = true;
    writeDraft(currentDraftKey(), {
      ...captureDraft(formRef.current),
      __baseVersion: String(selected?.version || 0),
    });
  };
  const finishClose = (discard = false) => {
    if (discard) removeDraft(currentDraftKey());
    setCloseGuard(false);
    dirtyForm.current = false;
    setModal(null);
    setSelected(null);
    setError("");
    updateRoute({ record: "" }, true);
    if (!discard) setNotice(msg("app.m0064"));
  };
  const requestClose = () => {
    if (busy) return;
    if (dirtyForm.current) {
      rememberDraft();
      setCloseGuard(true);
    } else {
      setModal(null);
      setSelected(null);
      setError("");
      updateRoute({ record: "" }, true);
    }
  };
  useEffect(() => {
    if (!modal || !formRef.current) return;
    for (const [name, value] of Object.entries(draftFields)) {
      const el = formRef.current.elements.namedItem(name);
      if (
        (el instanceof HTMLInputElement &&
          el.type !== "file" &&
          !el.readOnly) ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        el.value = value;
    }
    const lot = formRef.current.elements.namedItem("lotId");
    const audience = formRef.current.elements.namedItem("audience");
    if (
      lot instanceof HTMLSelectElement &&
      audience instanceof HTMLSelectElement
    )
      lot.required = audience.value === "lot";
  }, [modal, selected?.id, draftRevision]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyForm.current) {
        rememberDraft();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  });
  const open = (kind: string, row: RecordRow | null = null) => {
    if (data?.readOnly && !row) {
      setError(msg("app.m0065"));
      return;
    }
    const draft = readDraft(currentDraftKey(kind, row));
    const conflict = !!(
      row &&
      draft?.__baseVersion &&
      Number(draft.__baseVersion) !== row.version
    );
    setDraftFields(conflict ? {} : draft || {});
    setDraftConflict(conflict);
    setDraftRevision((v) => v + 1);
    dirtyForm.current = !!draft && !conflict;
    setCloseGuard(false);
    setLinkedOps(null);
    setIncidentPreset(null);
    setIncidentRestricted(
      row?.payload.confidentialReport ||
        row?.payload.domain === "Sécurité" ||
        row?.payload.eventNature === "Accident corporel" ||
        false,
    );
    setSelected(row);
    setModal(kind);
    if (row?.kind === "incident") updateRoute({ record: row.id }, true);
    setError("");
  };
  useEffect(() => {
    if (
      !route.record ||
      !data ||
      !context ||
      !["overview", "tasks", "incidents"].includes(page) ||
      selected?.id === route.record
    )
      return;
    let live = true;
    api<RecordRow>(
      `/api/condominiums/${encodeURIComponent(context)}/records/${encodeURIComponent(route.record)}`,
    )
      .then((row) => {
        if (live && row.kind === "incident") open("incident", row);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          updateRoute({ record: "" }, true);
        }
      });
    return () => {
      live = false;
    };
  }, [route.record, context, data, page]);
  useEffect(() => {
    if (!route.record && selected && !dirtyForm.current) {
      setModal(null);
      setSelected(null);
    }
  }, [route.record]);
  const openWorkItem = (item: WorkItem) => {
    updateRoute({
      page:
        item.kind === "decision_action"
          ? "governance"
          : item.kind === "incident"
            ? "tasks"
            : item.kind,
      view: item.kind === "decision_action" ? "decisions" : undefined,
      year: item.year,
      record: item.targetId || item.id,
      search: "",
    });
    setMobile(false);
  };
  const changePage = (p: string) => {
    if (dirtyForm.current) {
      requestClose();
      return;
    }
    setPage(p);
    setSearch("");
    setMobile(false);
  };
  const switchProfile = async (id: string) => {
    snapshotRequests.current.invalidate();
    clearDrafts();
    dirtyForm.current = false;
    setBusy(true);
    setBoot(undefined);
    setData(undefined);
    updateRoute(
      {
        context: "",
        year: new Date().getFullYear(),
        page: "overview",
        record: "",
        search: "",
      },
      true,
    );
    setModal(null);
    setSelected(null);
    try {
      const switched = await api<{ csrfToken: string } | undefined>(
        boot?.demo ? "/api/demo/profile" : "/api/auth/impersonate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id || null }),
        },
      );
      if (switched?.csrfToken) setCsrfToken(switched.csrfToken);
      await loadBoot();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form),
      get = (k: string) => String(f.get(k) || "");
    setBusy(true);
    setError("");
    try {
      const base = `/api/condominiums/${context}`;
      if (modal === "document") {
        if (selected) f.set("recordId", selected.id);
        if (linkedOps) f.set("opsId", linkedOps);
        await api(`${base}/documents?year=${year}`, {
          method: "POST",
          body: f,
        });
      } else {
        const audience = get("audience") || "shared",
          lotId = audience === "lot" ? get("lotId") : null;
        let payload: Record<string, unknown> = {};
        if (modal === "incident")
          payload = {
            ...(get("eventNature")
              ? {
                  eventNature: get("eventNature"),
                  domain: get("domain"),
                  occurredAt: get("occurredAt")
                    ? new Date(get("occurredAt")).toISOString()
                    : "",
                  location: get("location"),
                  equipmentMode: get("equipmentMode"),
                  equipmentDescription: get("equipmentDescription"),
                  symptom: get("symptom"),
                  symptomOther: get("symptomOther"),
                  injuryLevel: get("injuryLevel") || "Non renseignée",
                  relatedIncidentId: get("relatedIncidentId") || null,
                }
              : {}),
            category: get("category") || selected?.payload.category || "Autre",
            status: get("status") || "Signalé",
            priority: get("priority"),
            description: get("description"),
            assignee: get("assignee"),
            dueDate: get("dueDate"),
            comment: get("comment"),
          };
        if (modal === "assembly")
          payload = {
            date: get("date"),
            location: get("location"),
            agenda: get("agenda"),
          };
        if (modal === "fund") {
          const raw = get("amount").replace(",", ".");
          if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error(msg("app.m0071"));
          const [euros, cents = ""] = raw.split(".");
          payload = {
            amountCents: Number(euros) * 100 + Number(cents.padEnd(2, "0")),
            dueDate: get("dueDate"),
            decision: get("decision"),
          };
        }
        await api(
          `${base}/records${selected ? `/${selected.id}` : ""}?year=${year}`,
          {
            method: selected ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              selected
                ? {
                    version: selected.version,
                    equipmentId: get("eventNature")
                      ? get("equipmentId") || null
                      : selected.equipment_id || null,
                    payload,
                  }
                : {
                    kind: modal,
                    accessScope: get("accessScope") || "residents",
                    equipmentId: get("equipmentId") || null,
                    title: get("title"),
                    audience: modal === "fund" ? "management" : audience,
                    lotId,
                    payload,
                  },
            ),
          },
        );
      }
      removeDraft(currentDraftKey());
      dirtyForm.current = false;
      setCloseGuard(false);
      updateRoute({ record: "" }, true);
      setModal(null);
      setSelected(null);
      await reload();
      setNotice(msg("app.m0072"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const incidentRows = (rows: RecordRow[], compact = false) => (
    <div className="record-list">
      {rows.length ? (
        rows.map((r) => (
          <button
            key={r.id}
            className="record-row"
            onClick={() => open("incident", r)}
          >
            <span
              className={`state-icon ${r.payload.priority === "Urgente" ? "urgent" : ""}`}
            >
              {r.payload.status === "Résolu" ||
              r.payload.status === "Clôturé" ? (
                <Check size={19} />
              ) : (
                <Wrench size={19} />
              )}
            </span>
            <span className="row-main">
              <strong>{r.title}</strong>
              {r.payload.category && (
                <span className="category-tag">
                  {labelText(r.payload.eventNature || msg("app.m0076"))} ·{" "}
                  {labelText(r.payload.domain || r.payload.category)}
                </span>
              )}
              <small>
                {r.audience === "lot"
                  ? msg("app.m0077", {
                      p1:
                        data?.lots.find((l) => l.id === r.lot_id)?.number || "",
                    })
                  : r.payload.confidentialReport
                    ? msg("app.m0078")
                    : msg("app.m0079")}
                {!compact &&
                  ` · ${r.payload.location || r.payload.assignee || msg("app.m0080")}`}
                {!compact &&
                  r.payload.occurredAt &&
                  ` · ${new Date(r.payload.occurredAt).toLocaleString(localeTag())}`}
                {!compact && r.payload.relatedIncidentId && msg("app.m0081")}
              </small>
            </span>
            <span
              className={`status ${r.payload.status === "En cours" ? "working" : ""}`}
            >
              {labelText(r.payload.status)}
            </span>
            <ChevronRight size={16} />
          </button>
        ))
      ) : (
        <Empty text={msg("app.m0083")} />
      )}
    </div>
  );
  const heading =
    page === "administration"
      ? msg("app.m0084")
      : nav().find((n) => n[0] === page)?.[1];
  useEffect(() => {
    document.title = `${heading || msg("app.m0085")} · ${condo?.name || msg("app.m0085")}`;
  }, [heading, condo?.name]);
  return (
    <div className="app">
      <aside className={mobile ? "sidebar visible" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changePage("overview");
          }}
        >
          <BrandLogo />
        </a>
        <div className="workspace-label">{msg("app.m0087")}</div>
        <ResidenceProfile
          key={context}
          context={context}
          name={condo?.name || ""}
          manager={!!manager}
          onChange={(profile) =>
            setBoot((current) =>
              current
                ? {
                    ...current,
                    condominiums: current.condominiums.map((c) =>
                      c.id === context
                        ? { ...c, name: profile.name, address: profile.address }
                        : c,
                    ),
                  }
                : current,
            )
          }
        />
        <WorkspaceNavigation
          key={`${boot?.user.id}:${context}`}
          page={page}
          preferenceKey={`domolyma-navigation:${boot?.user.id}:${context}`}
          onNavigate={changePage}
          incidentCount={
            data?.records.filter(
              (r) =>
                r.kind === "incident" &&
                !["Résolu", "Clôturé"].includes(r.payload.status),
            ).length || 0
          }
          items={nav().filter(
            (n) =>
              (n[0] !== "rentals" || data?.roles.includes("owner")) &&
              (manager ||
                (data?.roles.includes("supplier")
                  ? [
                      "overview",
                      "tasks",
                      "portfolio",
                      "equipment",
                      "contract",
                      "visit",
                      "documents",
                      "contacts",
                    ].includes(n[0])
                  : !["members", "history"].includes(n[0]) &&
                    (n[0] !== "finances" ||
                      data?.roles.includes("owner") ||
                      data?.roles.includes("council")) &&
                    (!["assemblies", "governance", "contract"].includes(n[0]) ||
                      data?.roles.includes("owner") ||
                      data?.roles.includes("council")))),
          )}
        />
        <div
          className="sidebar-bottom account-profile"
          aria-label={msg("app.m0089")}
        >
          <span className="avatar" aria-hidden="true">
            {boot?.user.name
              .split(" ")
              .filter(Boolean)
              .map((part) => part[0])
              .join("")}
          </span>
          <div>
            <strong>{boot?.user.name || msg("common.loading")}</strong>
            <small>
              {data?.roles
                .map((role) => labelText(roleLabels[role] || role))
                .join(" · ") || msg("common.loading")}
            </small>
          </div>
          <span className="online" aria-hidden="true" />
        </div>
      </aside>
      <div className="workspace">
        <div className="workspace-topbar">
          <span className="workspace-breadcrumb">
            {msg("app.m0091")}
            <ChevronRight size={14} /> {heading}
          </span>
          <div className="workspace-actions">
            {boot?.administrator && (
              <button
                className="text-button"
                onClick={() => changePage("administration")}
              >
                {msg("app.m0084")}
              </button>
            )}
            <LanguageSelector />
            {!boot?.demo && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api("/api/auth/logout", { method: "POST" });
                    clearDrafts();
                    location.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {msg("administration.m0040")}
              </button>
            )}
            <span className="topbar-avatar" title={boot?.user.name}>
              {boot?.user.name
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .join("")}
            </span>
          </div>
        </div>
        <header>
          <button
            className="mobile-menu icon-button"
            aria-label={mobile ? msg("app.m0093") : msg("app.m0094")}
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="context">
            <Building2 size={19} />
            {boot && boot.condominiums.length > 1 ? (
              <select
                aria-label={msg("app.m0095")}
                name="active-residence"
                value={context}
                disabled={busy}
                onChange={(e) => {
                  const c = boot.condominiums.find(
                    (c) => c.id === e.target.value,
                  );
                  if (c)
                    updateRoute({
                      context: c.id,
                      year: c.fiscal_year,
                      page: "overview",
                      record: "",
                      search: "",
                    });
                }}
              >
                {boot.condominiums.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong className="context-name">
                {condo?.name || msg("app.m0096")}
              </strong>
            )}
            <span className="shared">{msg("app.m0097")}</span>
            {data && page !== "documents" && (
              <select
                aria-label={msg("app.m0098")}
                name="active-year"
                value={year}
                disabled={busy}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {data.years.map((y) => (
                  <option key={y.year} value={y.year}>
                    {msg("app.m0099")}
                    {y.year}
                  </option>
                ))}
              </select>
            )}
            {page === "documents" && (
              <span className="shared">{msg("app.m0100")}</span>
            )}
          </div>
          <select
            className="theme"
            aria-label={msg("app.m0101")}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {Object.entries(palettes.themes).map(([key, t]) => (
              <option value={key} key={key}>
                {labelText(t.label)}
              </option>
            ))}
          </select>
        </header>
        {boot?.demo ? (
          <div className="demo-bar">
            <span>
              <span className="demo-dot" />
              {import.meta.env.VITE_DOMOLYMA_INSTANCE === "development"
                ? msg("app.m0102")
                : msg("app.m0103")}{" "}
              {msg("app.m0104")}
            </span>
            <label>
              {msg("app.m0105")}{" "}
              <select
                aria-label={msg("app.m0106")}
                disabled={busy}
                value={boot?.user.id || "demo-manager"}
                onChange={(e) => switchProfile(e.target.value)}
              >
                <option value="demo-manager">{msg("app.m0107")}</option>
                <option value="demo-owner">{msg("app.m0108")}</option>
                <option value="demo-neighbor">{msg("app.m0109")}</option>
                <option value="demo-tenant">{msg("app.m0110")}</option>
                <option value="demo-resident">{msg("app.m0111")}</option>
                <option value="demo-hybrid">{msg("app.m0112")}</option>
                <option value="demo-supplier">{msg("app.m0113")}</option>
                <option value="demo-council">{msg("app.m0114")}</option>
                <option value="demo-outsider">{msg("app.m0115")}</option>
              </select>
            </label>
            {import.meta.env.VITE_STATIC_DEMO && (
              <>
                <a className="text-button" href="../">
                  {msg("demo.back_to_site")}
                </a>
                <button
                  className="text-button"
                  onClick={async () => {
                    if (!window.confirm(msg("demo.reset_confirm"))) return;
                    try {
                      await api("/api/demo/reset", { method: "POST" });
                      clearDrafts();
                      location.href = import.meta.env.BASE_URL + "#/overview";
                      location.reload();
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                >
                  {msg("demo.reset")}
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className={boot?.ghost ? "demo-bar ghost-bar" : "demo-bar real-bar"}
          >
            <span>
              {boot?.ghost
                ? msg("app.m0118", { p1: boot.ghost.label })
                : msg("app.m0119")}
            </span>
            {ghosts.length > 0 && (
              <label>
                {msg("app.m0120")}{" "}
                <select
                  aria-label={msg("app.m0121")}
                  value={boot?.ghost?.id || ""}
                  disabled={busy}
                  onChange={(e) => switchProfile(e.target.value)}
                >
                  <option value="">{msg("app.m0122")}</option>
                  {ghosts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {labelText(g.label)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {boot?.ghost && (
              <button className="text-button" onClick={() => switchProfile("")}>
                {msg("app.m0123")}
              </button>
            )}
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <PageWorkspace
            key={`${boot?.user.id}:${boot?.ghost?.id}:${context}:${page}`}
          >
            <div className="page-heading erg-page-heading">
              <div>
                <h1>{heading}</h1>
                <p className="subheading">
                  {page === "overview"
                    ? `${condo?.name || msg("common.loading")} · ${condo?.address || ""}`
                    : (
                        {
                          tasks: msg("app.m0125"),
                          portfolio: msg("app.m0126"),
                          rentals: msg("app.m0127"),
                          lots: msg("app.m0128"),
                          equipment: msg("app.m0129"),
                          contract: msg("app.m0130"),
                          visit: msg("app.m0131"),
                          event: msg("app.m0132"),
                          access: msg("app.m0133"),
                          contacts: msg("app.m0134"),
                          incidents: msg("app.m0135"),
                          documents: msg("app.m0136"),
                          governance: msg("app.m0137"),
                          assemblies: msg("app.m0138"),
                          finances: msg("app.m0139"),
                          members: msg("app.m0140"),
                          history: msg("app.m0141"),
                        } as Record<string, string>
                      )[page]}
                </p>
              </div>
              <PageHeaderActions
                page={page}
                onRefresh={() => {
                  void reload()
                    .then(() => setNotice("Données actualisées."))
                    .catch((e) => setError(e.message));
                }}
              >
                {data &&
                !data.readOnly &&
                !data.roles.includes("supplier") &&
                ["overview", "incidents", "tasks"].includes(page) ? (
                  <button className="primary" onClick={() => open("incident")}>
                    <Plus size={17} />
                    {msg("app.m0143")}
                  </button>
                ) : data &&
                  manager &&
                  ["documents", "assemblies", "finances"].includes(page) ? (
                  <button
                    className="primary"
                    onClick={() =>
                      open(
                        page === "documents"
                          ? "document"
                          : page === "assemblies"
                            ? "assembly"
                            : "fund",
                      )
                    }
                  >
                    <Plus size={17} />
                    {page === "documents"
                      ? msg("app.m0144")
                      : page === "assemblies"
                        ? msg("app.m0145")
                        : msg("app.m0146")}
                  </button>
                ) : null}
              </PageHeaderActions>
            </div>
            <p className="erg-page-scope">
              {condo?.name} ·{" "}
              {["documents", "tasks", "portfolio"].includes(page)
                ? msg("app.m0100")
                : msg("app.m0147", { p1: year })}{" "}
              ·{" "}
              {data?.readOnly
                ? msg("app.m0148")
                : data?.roles
                    .map((r) => labelText(roleLabels[r] || r))
                    .join(" · ")}
            </p>
            {error && !modal && (
              <div role="alert" className="error">
                <AlertCircle size={18} />
                {labelText(error)}
              </div>
            )}
            {notice && !modal && (
              <div className="notice" role="status">
                {labelText(notice)}
                <button
                  aria-label={msg("app.m0149")}
                  onClick={() => setNotice("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {!data ? (
              <p className="loading">{msg("app.m0150")}</p>
            ) : (
              <>
                {page === "administration" && boot?.administrator && (
                  <Administration />
                )}
                {page === "governance" && boot && (
                  <GovernancePanel
                    key={`${context}:${year}:${boot?.user.id}`}
                    context={context}
                    year={year}
                    userId={boot!.user.id}
                    readOnly={!!data.readOnly}
                    view={route.view || "assemblies"}
                    selectedId={route.record}
                    search={search}
                    onSearch={setSearch}
                    onChanged={() =>
                      void reload().catch((e) => setError(e.message))
                    }
                    onNavigate={(view, id = "") =>
                      updateRoute({ page: "governance", view, record: id })
                    }
                  />
                )}
                {page === "rentals" && (
                  <RentalsPanel
                    key={`${boot?.user.id}:${boot?.ghost?.id}:${context}`}
                    context={context}
                    year={year}
                    readOnly={!!data.readOnly}
                  />
                )}
                {page === "overview" && (
                  <WorkspaceHome
                    data={data}
                    context={context}
                    onOpen={openWorkItem}
                    changePage={changePage}
                  />
                )}
                {page === "tasks" && (
                  <WorkQueue
                    context={context}
                    refresh={data}
                    onOpen={openWorkItem}
                    search={search}
                    onSearch={setSearch}
                  />
                )}
                {page === "portfolio" && (
                  <Portfolio
                    key={boot?.user.id}
                    onSelect={(id, nextYear) =>
                      updateRoute({
                        context: id,
                        year: nextYear,
                        page: "overview",
                        record: "",
                        search: "",
                      })
                    }
                  />
                )}
                {page === "incidents" && (
                  <>
                    {manager && (
                      <>
                        <IncidentStatistics
                          records={data.records}
                          year={year}
                        />
                        <p className="erg-page-scope">
                          {msg("app.m0151")}
                          {year}
                          {msg("app.m0152")}
                        </p>
                      </>
                    )}
                    <FilterWorkspace
                      id={`incidents:${context}:${boot?.user.id}`}
                      title={msg("app.m0153")}
                      scope={msg("app.m0154", { p1: year })}
                      count={
                        incidents.filter(
                          (r) =>
                            !incidentStatus ||
                            r.payload.status === incidentStatus,
                        ).length
                      }
                      total={
                        data.records.filter((r) => r.kind === "incident").length
                      }
                      noun="incident(s)"
                      active={[
                        ...(search
                          ? [
                              {
                                key: "search",
                                label: msg("app.m0155", { p1: search }),
                                remove: () => setSearch(""),
                              },
                            ]
                          : []),
                        ...(incidentStatus
                          ? [
                              {
                                key: "status",
                                label: labelText(incidentStatus),
                                remove: () => setIncidentStatus(""),
                              },
                            ]
                          : []),
                      ]}
                      onReset={() => {
                        setSearch("");
                        setIncidentStatus("");
                      }}
                      rail={
                        <>
                          <label>
                            {msg("common.search")}
                            <input
                              type="search"
                              aria-label={msg("app.m0157")}
                              placeholder={msg("app.m0158")}
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </label>
                          <label>
                            {msg("app.m0159")}
                            <select
                              aria-label={msg("app.m0160")}
                              value={incidentStatus}
                              onChange={(e) =>
                                setIncidentStatus(e.target.value)
                              }
                            >
                              <option value="">{msg("app.m0161")}</option>
                              {[
                                ...new Set(
                                  data.records
                                    .filter((r) => r.kind === "incident")
                                    .map((r) => String(r.payload.status || "")),
                                ),
                              ]
                                .filter(Boolean)
                                .map((v) => (
                                  <option key={v} value={v}>
                                    {labelText(v)}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </>
                      }
                    >
                      <section className="panel">
                        {incidentRows(
                          incidents.filter(
                            (r) =>
                              !incidentStatus ||
                              r.payload.status === incidentStatus,
                          ),
                        )}
                      </section>
                    </FilterWorkspace>
                  </>
                )}
                {[
                  "lots",
                  "equipment",
                  "contract",
                  "visit",
                  "event",
                  "access",
                  "contacts",
                ].includes(page) && (
                  <OperationsPanel
                    initialItemId={route.record}
                    onItemClose={() => updateRoute({ record: "" }, true)}
                    page={page}
                    data={data}
                    context={context}
                    year={year}
                    userId={boot!.user.id}
                    reload={reload}
                    upload={(id) => {
                      open("document");
                      setLinkedOps(id);
                    }}
                  />
                )}
                {page === "documents" && boot && (
                  <DocumentVault
                    key={`${context}:${boot.user.id}`}
                    context={context}
                    userId={boot.user.id}
                    readOnly={!!data.readOnly}
                    refresh={data}
                    onChanged={() =>
                      void reload().catch((e) => setError(e.message))
                    }
                    onUpload={() => open("document")}
                    onNewVersion={async (id) => {
                      try {
                        const row = await api<RecordRow>(
                          `/api/condominiums/${encodeURIComponent(context)}/records/${encodeURIComponent(id)}`,
                        );
                        open("document", row);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  />
                )}
                {page === "assemblies" && (
                  <>
                    <p className="scope-note">{msg("app.m0162")}</p>
                    <section className="panel">
                      {assemblies.length ? (
                        assemblies.map((r) => (
                          <article className="assembly-item" key={r.id}>
                            <div className="assembly-date">
                              <Clock3 size={20} />
                              {date(r.payload.date)}
                            </div>
                            <div>
                              <h2>{r.title}</h2>
                              <p>{r.payload.location}</p>
                              <ol>
                                {String(r.payload.agenda)
                                  .split("\n")
                                  .filter(Boolean)
                                  .map((line, i) => (
                                    <li key={i}>{line}</li>
                                  ))}
                              </ol>
                            </div>
                            <span className="status">
                              {labelText(r.payload.status)}
                            </span>
                          </article>
                        ))
                      ) : (
                        <Empty text={msg("app.m0163")} />
                      )}
                    </section>
                  </>
                )}
                {page === "finances" && (
                  <>
                    <BudgetPanel
                      key={`${context}-${year}`}
                      context={context}
                      year={year}
                      manager={!!manager}
                    />
                    {manager && (
                      <>
                        <p className="scope-note">{msg("app.m0164")}</p>
                        <section className="panel">
                          {funds.length ? (
                            funds.map((r) => (
                              <article className="fund-item" key={r.id}>
                                <div className="section-heading">
                                  <div>
                                    <h2>{r.title}</h2>
                                    <p>
                                      {msg("app.m0165")}
                                      {date(r.payload.dueDate)} ·{" "}
                                      {r.payload.decision}
                                    </p>
                                  </div>
                                  <strong className="fund-total">
                                    {currency(r.payload.amountCents)}
                                  </strong>
                                </div>
                                <span className="status">
                                  {labelText(r.payload.status)}
                                </span>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>{msg("app.m0166")}</th>
                                      <th>{msg("app.m0167")}</th>
                                      <th>{msg("app.m0168")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.payload.allocation.map(
                                      (line: {
                                        lotId: string;
                                        cents: number;
                                      }) => (
                                        <tr key={line.lotId}>
                                          <td>
                                            {data.lots.find(
                                              (l) => l.id === line.lotId,
                                            )?.number || line.lotId}
                                          </td>
                                          <td>
                                            {
                                              r.payload.keySnapshot.find(
                                                (l: { id: string }) =>
                                                  l.id === line.lotId,
                                              )?.weight
                                            }
                                          </td>
                                          <td>{currency(line.cents)}</td>
                                        </tr>
                                      ),
                                    )}
                                  </tbody>
                                  <tfoot>
                                    <tr>
                                      <th colSpan={2}>{msg("app.m0169")}</th>
                                      <th>
                                        {currency(
                                          r.payload.allocation.reduce(
                                            (s: number, l: { cents: number }) =>
                                              s + l.cents,
                                            0,
                                          ),
                                        )}
                                      </th>
                                    </tr>
                                  </tfoot>
                                </table>
                                <small className="table-note">
                                  {msg("app.m0170")}
                                  {r.payload.rounding}.
                                </small>
                              </article>
                            ))
                          ) : (
                            <Empty text={msg("app.m0171")} />
                          )}
                        </section>
                      </>
                    )}
                  </>
                )}
                {page === "members" && (
                  <section className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{msg("app.m0173")}</th>
                          <th>{msg("app.m0174")}</th>
                          <th>{msg("app.m0175")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.members.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name}</strong>
                            </td>
                            <td>
                              {m.role === "manager"
                                ? msg("app.m0176")
                                : msg("app.m0177")}
                            </td>
                            <td>
                              <code>{m.id}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="table-note">{msg("app.m0178")}</p>
                  </section>
                )}
                {page === "history" && (
                  <section className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{msg("administration.m0035")}</th>
                          <th>{msg("app.m0179")}</th>
                          <th>{msg("administration.m0036")}</th>
                          <th>{msg("app.m0180")}</th>
                          <th>{msg("app.m0181")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {new Date(a.happened_at).toLocaleString(
                                localeTag(),
                              )}
                            </td>
                            <td>
                              {data.members.find((m) => m.id === a.actor_id)
                                ?.name || a.actor_id}
                            </td>
                            <td>
                              {a.action === "created" ||
                              a.action.endsWith("_created")
                                ? msg("app.m0182")
                                : msg("app.m0183")}
                            </td>
                            <td>
                              {data.records.find((r) => r.id === a.resource_id)
                                ?.title ||
                                a.resource_title ||
                                a.resource_id}
                            </td>
                            <td>{a.version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </>
            )}
          </PageWorkspace>
          <footer>
            <span>{msg("app.m0184")}</span>
            <span>{msg("app.m0185")}</span>
          </footer>
        </main>
      </div>
      {modal && (
        <dialog
          ref={dialogRef}
          aria-labelledby="record-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            requestClose();
          }}
          className="dialog"
        >
          <form
            ref={formRef}
            onSubmit={save}
            onInput={rememberDraft}
            onChange={rememberDraft}
            key={`${modal}-${selected?.id || "new"}-${draftRevision}`}
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">{condo?.name}</p>
                <h2 id="record-dialog-title">
                  {selected
                    ? modal === "document"
                      ? msg("app.m0186")
                      : msg("app.m0187")
                    : (
                        {
                          incident: msg("app.m0188"),
                          document: msg("app.m0189"),
                          assembly: msg("app.m0145"),
                          fund: msg("app.m0190"),
                        } as Record<string, string>
                      )[modal]}
                </h2>
              </div>
              <button
                type="button"
                aria-label={msg("common.close")}
                className="icon-button"
                onClick={requestClose}
              >
                <X />
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {labelText(error)}
              </div>
            )}
            {draftConflict && (
              <div className="draft-warning" role="alert">
                <p>{msg("app.m0192")}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setDraftFields(readDraft(currentDraftKey()) || {});
                    setDraftConflict(false);
                    setDraftRevision((v) => v + 1);
                    dirtyForm.current = true;
                  }}
                >
                  {msg("app.m0193")}
                </button>
              </div>
            )}
            {Object.keys(draftFields).length > 0 && (
              <p className="scope-note">{msg("app.m0194")}</p>
            )}
            <fieldset disabled={busy || Boolean(selected && !manager)}>
              {modal !== "document" || !selected ? (
                <label>
                  {msg("app.m0195")}
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={
                      selected?.title ||
                      (incidentPreset
                        ? `${incidentPreset.nature === "Accident corporel" ? "Accident lié" : "Récurrence"} : ${incidentPreset.source.title}`.slice(
                            0,
                            200,
                          )
                        : "")
                    }
                    readOnly={Boolean(selected)}
                  />
                </label>
              ) : (
                <p>
                  {selected.title}
                  {msg("app.m0198")}
                </p>
              )}
              {modal === "incident" && (
                <IncidentFields
                  selected={selected}
                  operations={data?.operations || []}
                  records={data?.records || []}
                  manager={!!manager}
                  preset={incidentPreset}
                  initialDraft={draftFields}
                  onRestricted={setIncidentRestricted}
                />
              )}
              {modal === "assembly" && (
                <>
                  <div className="form-grid">
                    <label>
                      {msg("administration.m0035")}
                      <input type="date" name="date" required />
                    </label>
                    <label>
                      {msg("app.m0199")}
                      <input name="location" required maxLength={200} />
                    </label>
                  </div>
                  <label>
                    {msg("app.m0200")}
                    <textarea
                      name="agenda"
                      required
                      maxLength={10000}
                      placeholder={msg("app.m0201")}
                    />
                  </label>
                  <p className="scope-note">{msg("app.m0202")}</p>
                </>
              )}
              {modal === "fund" && (
                <>
                  <div className="form-grid">
                    <label>
                      {msg("app.m0203")}
                      <input
                        name="amount"
                        inputMode="decimal"
                        placeholder="1000,00"
                        required
                      />
                    </label>
                    <label>
                      {msg("app.m0204")}
                      <input name="dueDate" type="date" required />
                    </label>
                  </div>
                  <label>
                    {msg("app.m0205")}
                    <input name="decision" maxLength={500} required />
                  </label>
                  <p className="scope-note">{msg("app.m0206")}</p>
                </>
              )}
              {modal === "document" && (
                <label>
                  {msg("app.m0207")}
                  <input
                    name="file"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,text/plain"
                    required
                  />
                  <small>{msg("app.m0208")}</small>
                </label>
              )}
              {!selected &&
                modal !== "fund" &&
                !(modal === "incident" && incidentRestricted) && (
                  <>
                    <label>
                      {msg("app.m0209")}
                      <select
                        name="audience"
                        onChange={(e) => {
                          const el = e.currentTarget.form?.elements.namedItem(
                            "lotId",
                          ) as unknown as HTMLSelectElement;
                          if (el) el.required = e.target.value === "lot";
                        }}
                      >
                        <option value="shared">{msg("app.m0210")}</option>
                        {manager && (
                          <option value="management">{msg("app.m0211")}</option>
                        )}
                        <option value="lot">{msg("app.m0212")}</option>
                      </select>
                    </label>
                    <label>
                      {msg("app.m0213")}
                      <select
                        name="accessScope"
                        defaultValue={
                          data?.roles.includes("supplier")
                            ? "assigned"
                            : modal === "incident"
                              ? "residents"
                              : "owners"
                        }
                      >
                        {data?.roles.includes("supplier") ? (
                          <option value="assigned">{msg("app.m0214")}</option>
                        ) : (
                          <option value="residents">{msg("app.m0215")}</option>
                        )}
                        {manager && (
                          <>
                            <option value="owners">{msg("app.m0216")}</option>
                            <option value="council">{msg("app.m0217")}</option>
                            {linkedOps && (
                              <option value="assigned">
                                {msg("app.m0218")}
                              </option>
                            )}
                          </>
                        )}
                      </select>
                    </label>
                    <label>
                      {msg("app.m0219")}
                      <select name="lotId" defaultValue="">
                        <option value="">{msg("app.m0220")}</option>
                        {data?.lots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {msg("app.m0221")}
                            {l.number} · {l.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
            </fieldset>
            {modal === "incident" &&
              selected &&
              selected.payload.eventNature !== "Accident corporel" &&
              !data?.roles.includes("supplier") && (
                <div className="incident-related-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const source = selected;
                      open("incident");
                      setIncidentPreset({ source, nature: "Incident" });
                    }}
                  >
                    {msg("app.m0223")}
                  </button>
                  {selected.payload.eventNature !== "Accident corporel" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const source = selected;
                        open("incident");
                        setIncidentPreset({
                          source,
                          nature: "Accident corporel",
                        });
                        setIncidentRestricted(true);
                      }}
                    >
                      {msg("app.m0224")}
                    </button>
                  )}
                </div>
              )}
            {closeGuard && (
              <section
                className="draft-warning"
                role="alert"
                aria-label={msg("app.m0225")}
              >
                <h3>{msg("app.m0226")}</h3>
                <p>{msg("app.m0227")}</p>
                <div className="draft-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => finishClose()}
                  >
                    {msg("app.m0228")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => finishClose(true)}
                  >
                    {msg("app.m0229")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCloseGuard(false)}
                  >
                    {msg("app.m0230")}
                  </button>
                </div>
              </section>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={requestClose}
              >
                {msg("common.close")}
              </button>
              {(!selected || manager) && (
                <button className="primary" disabled={busy} type="submit">
                  {busy
                    ? msg("app.m0231")
                    : modal === "fund"
                      ? msg("app.m0232")
                      : msg("common.save")}
                </button>
              )}
            </div>
          </form>
          {modal === "incident" &&
            manager &&
            selected?.payload.eventNature === "Accident corporel" && (
              <AccidentFollowup context={context} recordId={selected.id} />
            )}
        </dialog>
      )}
    </div>
  );
}
function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <FolderOpen size={27} strokeWidth={1.3} />
      <p>{text}</p>
      {action}
    </div>
  );
}
