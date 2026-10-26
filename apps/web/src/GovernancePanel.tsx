import { msg, labelText, localeTag } from "./i18n";
import { appUrl } from "./urls";
import { PageActions, FilterWorkspace } from "./Ergonomics";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  FileText,
  Pencil,
  X,
  CheckCircle2,
} from "lucide-react";
import { apiFetch } from "./session";
import { draftKey, readDraft, writeDraft, removeDraft } from "./form-drafts";
import {
  kindLabels,
  stateLabels,
  type GovernanceItem,
} from "../../../packages/contracts/governance";
import "./governance.css";

type Kind = GovernanceItem["kind"];
type Source = {
  id: string;
  title: string;
  audiences: string[];
  versions: {
    id: string;
    filename: string;
    sha256: string;
    created_at: string;
  }[];
};
type Register = {
  items: GovernanceItem[];
  sources: Source[];
  canEdit: boolean;
  canConfirm: boolean;
  asOf: string;
};
type Props = {
  context: string;
  year: number;
  userId: string;
  readOnly: boolean;
  view: string;
  selectedId: string;
  search: string;
  onNavigate: (view: string, id?: string) => void;
  onSearch: (s: string) => void;
  onChanged?: () => void;
};
type Field = {
  key: string;
  label: string;
  type?: "text" | "long" | "date" | "money" | "year" | "select";
  required?: boolean;
  options?: string[];
};
const sourceNames: () => Record<string, string> = () => ({
  convocation: msg("governance_panel.m0569"),
  minutes: msg("governance_panel.m0570"),
  contract: msg("governance_panel.m0571"),
  invoice: msg("governance_panel.m0572"),
  report: msg("governance_panel.m0573"),
  other: msg("governance_panel.m0574"),
});
const extraLabels: () => Record<string, string> = () => ({
  preparation: msg("governance_panel.m0575"),
  document_request: msg("governance_panel.m0576"),
  execution: msg("governance_panel.m0577"),
  minutes: msg("governance_panel.m0570"),
  accounts: msg("governance_panel.m0578"),
  contract: msg("governance_panel.m0579"),
  report: msg("governance_panel.m0580"),
  other: msg("common.other"),
});
const fields: () => Record<Kind, Field[]> = () => ({
  meeting: [
    { key: "meetingDate", label: msg("governance_panel.m0581"), type: "date" },
    { key: "location", label: msg("governance_panel.m0582") },
    {
      key: "accountingYear",
      label: msg("governance_panel.m0583"),
      type: "year",
    },
    { key: "budgetYear", label: msg("governance_panel.m0584"), type: "year" },
    { key: "notes", label: msg("governance_panel.m0585"), type: "long" },
  ],
  requirement: [
    {
      key: "category",
      label: msg("governance_panel.m0586"),
      type: "select",
      options: ["minutes", "accounts", "contract", "report", "other"],
    },
    {
      key: "status",
      label: msg("governance_panel.m0587"),
      type: "select",
      options: ["expected", "received", "not_applicable"],
    },
    {
      key: "notes",
      label: msg("governance_panel.m0588"),
      type: "long",
    },
  ],
  decision: [
    { key: "number", label: msg("governance_panel.m0589") },
    {
      key: "body",
      label: msg("governance_panel.m0590"),
      type: "long",
    },
    {
      key: "status",
      label: msg("governance_panel.m0591"),
      type: "select",
      options: [
        "proposed",
        "pending_evidence",
        "pending_review",
        "information",
        "adopted",
        "rejected",
      ],
    },
    { key: "decidedOn", label: msg("governance_panel.m0592"), type: "date" },
    { key: "votingRule", label: msg("governance_panel.m0593") },
    { key: "scope", label: msg("governance_panel.m0594") },
    {
      key: "ceilingCents",
      label: msg("governance_panel.m0595"),
      type: "money",
    },
    {
      key: "reserve",
      label: msg("governance_panel.m0596"),
      type: "long",
    },
  ],
  action: [
    {
      key: "actionType",
      label: msg("governance_panel.m0597"),
      type: "select",
      options: ["preparation", "document_request", "execution"],
    },
    {
      key: "status",
      label: msg("governance_panel.m0598"),
      type: "select",
      options: ["planned", "in_progress", "waiting", "done", "cancelled"],
    },
    { key: "responsible", label: msg("governance_panel.m0599") },
    { key: "dueDate", label: msg("governance_panel.m0600"), type: "date" },
    { key: "note", label: msg("governance_panel.m0601"), type: "long" },
  ],
  offer: [
    { key: "supplier", label: msg("governance_panel.m0602"), required: true },
    { key: "scope", label: msg("governance_panel.m0603"), required: true },
    {
      key: "unit",
      label: msg("governance_panel.m0604"),
      required: true,
    },
    { key: "baseHtCents", label: msg("governance_panel.m0605"), type: "money" },
    {
      key: "baseTtcCents",
      label: msg("governance_panel.m0606"),
      type: "money",
    },
    {
      key: "options",
      label: msg("governance_panel.m0607"),
      type: "long",
    },
    { key: "duration", label: msg("governance_panel.m0608") },
    { key: "notice", label: msg("governance_panel.m0609") },
    { key: "renewal", label: msg("governance_panel.m0610") },
    { key: "indexation", label: msg("governance_panel.m0611"), type: "long" },
    { key: "coverage", label: msg("governance_panel.m0612"), type: "long" },
    { key: "exclusions", label: msg("governance_panel.m0613"), type: "long" },
    {
      key: "status",
      label: msg("governance_panel.m0614"),
      type: "select",
      options: ["proposal", "withdrawn", "signed"],
    },
    { key: "signedOn", label: msg("governance_panel.m0615"), type: "date" },
  ],
  charge_key: [
    { key: "code", label: msg("governance_panel.m0616") },
    { key: "base", label: msg("governance_panel.m0617") },
    { key: "unit", label: msg("governance_panel.m0618") },
    { key: "scope", label: msg("governance_panel.m0619") },
    { key: "validFrom", label: msg("governance_panel.m0620"), type: "date" },
    { key: "validUntil", label: msg("governance_panel.m0621"), type: "date" },
    {
      key: "status",
      label: msg("governance_panel.m0622"),
      type: "select",
      options: ["unverified", "validated", "inactive"],
    },
    {
      key: "notes",
      label: msg("governance_panel.m0623"),
      type: "long",
    },
  ],
});
const defaults: Record<Kind, Record<string, any>> = {
  meeting: {
    meetingDate: "",
    location: "",
    accountingYear: null,
    budgetYear: null,
    notes: "",
  },
  requirement: { category: "minutes", status: "expected", notes: "" },
  decision: {
    number: "",
    body: "",
    status: "proposed",
    decidedOn: "",
    votingRule: "",
    scope: "",
    ceilingCents: null,
    reserve: "",
    relatedIds: [],
  },
  action: {
    actionType: "preparation",
    status: "planned",
    responsible: "",
    dueDate: "",
    note: "",
  },
  offer: {
    supplier: "",
    scope: "",
    unit: "",
    baseHtCents: null,
    baseTtcCents: null,
    options: "",
    duration: "",
    notice: "",
    renewal: "",
    indexation: "",
    coverage: "",
    exclusions: "",
    status: "proposal",
    signedOn: "",
  },
  charge_key: {
    code: "",
    base: "",
    unit: "",
    scope: "",
    validFrom: "",
    validUntil: "",
    status: "unverified",
    notes: "",
  },
};
const money = (v: number | null | undefined) =>
  v == null
    ? msg("budget_panel.m0249")
    : new Intl.NumberFormat(localeTag(), {
        style: "currency",
        currency: "EUR",
      }).format(v / 100);
const day = (v: string) =>
  v
    ? new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium" }).format(
        new Date(v + "T12:00:00Z"),
      )
    : msg("app.m0068");
function label(key: string) {
  return labelText(stateLabels[key] || extraLabels()[key] || key);
}
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await apiFetch(url, options);
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || msg("governance_panel.m0624"));
  return data;
}
function frozen(item: GovernanceItem, canConfirm: boolean) {
  return (
    !canConfirm &&
    ((item.kind === "decision" &&
      ["adopted", "rejected"].includes(item.payload.status)) ||
      (item.kind === "offer" && item.payload.status === "signed") ||
      (item.kind === "charge_key" && item.payload.status === "validated") ||
      (item.kind === "action" &&
        item.payload.actionType === "execution" &&
        item.payload.status === "done"))
  );
}

export default function GovernancePanel(props: Props) {
  const {
    context,
    year,
    userId,
    readOnly,
    view,
    selectedId,
    search,
    onNavigate,
    onSearch,
  } = props;
  const [data, setData] = useState<Register>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<{
    kind: Kind;
    item?: GovernanceItem;
    parentId: string | null;
  } | null>(null);
  const [meetingFilter, setMeetingFilter] = useState(""),
    [offerGroup, setOfferGroup] = useState("");
  const endpoint = `/api/condominiums/${encodeURIComponent(context)}/governance?year=${year}`;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Register>(endpoint, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, refresh]);
  const items = data?.items || [],
    meetings = items.filter((i) => i.kind === "meeting"),
    decisions = items.filter((i) => i.kind === "decision"),
    actions = items.filter((i) => i.kind === "action");
  const selected = items.find((i) => i.id === selectedId),
    activeMeeting =
      (selected?.kind === "meeting" ? selected : undefined) || meetings[0];
  const selectedDecision = selected?.kind === "decision" ? selected : undefined;
  const canEdit = !!data?.canEdit && !readOnly,
    canConfirm = !!data?.canConfirm;
  const edit = (
    kind: Kind,
    item?: GovernanceItem,
    parentId: string | null = null,
  ) => {
    setNotice("");
    setEditor({ kind, item, parentId: item?.parent_id || parentId });
  };
  const editButton = (item: GovernanceItem) =>
    canEdit && !frozen(item, canConfirm) ? (
      <button
        className="secondary gov-edit"
        onClick={() => edit(item.kind, item)}
      >
        <Pencil size={14} />
        {msg("governance_panel.m0626")}
        <span className="sr-only">{item.title}</span>
      </button>
    ) : null;
  const source = (item: GovernanceItem) =>
    item.payload.documentId && item.payload.sourceVersionId ? (
      <a
        className="gov-source"
        href={appUrl(
          `/api/condominiums/${encodeURIComponent(context)}/documents/${encodeURIComponent(item.payload.sourceVersionId)}/download`,
        )}
      >
        <FileText size={14} />
        {item.payload.sourceFilename || msg("governance_panel.m0627")}
        {msg("governance_panel.m0628")}{" "}
        {item.payload.sourcePage || msg("governance_panel.m0629")}
        <ArrowUpRight size={13} />
      </a>
    ) : (
      <span className="gov-muted">
        {item.payload.sourceUnavailable
          ? msg("governance_panel.m0630")
          : msg("governance_panel.m0631")}
      </span>
    );
  const rootName = (id: string | null) =>
    items.find((i) => i.id === id)?.title || msg("governance_panel.m0632");
  const visibleDecisions = decisions.filter(
    (i) =>
      (!meetingFilter || i.parent_id === meetingFilter) &&
      `${i.title} ${i.payload.number} ${i.payload.body} ${i.payload.reserve}`
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  const decisionIds = new Set(visibleDecisions.map((i) => i.id));
  const openActions = actions.filter(
    (i) =>
      decisionIds.has(i.parent_id!) &&
      !["done", "cancelled"].includes(i.payload.status),
  );
  const overdue = openActions.filter(
    (i) => i.payload.dueDate && i.payload.dueDate < data!.asOf,
  );
  const offers = items.filter((i) => i.kind === "offer"),
    keys = items.filter((i) => i.kind === "charge_key");
  const group = (o: GovernanceItem) =>
    JSON.stringify([
      o.parent_id || "",
      o.payload.scope.trim().toLocaleLowerCase("fr"),
      o.payload.unit.trim().toLocaleLowerCase("fr"),
    ]);
  const groups = [...new Set(offers.map(group))];
  const currentGroup = groups.includes(offerGroup) ? offerGroup : groups[0];
  const compared = offers.filter((o) => group(o) === currentGroup);
  const tabs = [
    ["assemblies", msg("governance_panel.m0633")],
    ["decisions", msg("governance_panel.m0634")],
    ["offers", msg("governance_panel.m0635")],
    ["keys", msg("governance_panel.m0636")],
  ];
  return (
    <section className="governance" aria-label={msg("governance_panel.m0637")}>
      <nav className="gov-tabs" aria-label={msg("governance_panel.m0638")}>
        <>
          {tabs.map(([id, title]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "active" : ""}
              onClick={() => onNavigate(id)}
            >
              {title}
            </button>
          ))}
        </>
      </nav>
      {error && (
        <p className="error" role="alert">
          {labelText(error)}
          <button onClick={() => setRefresh((x) => x + 1)}>
            {msg("common.retry")}
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <CheckCircle2 size={17} />
          {labelText(notice)}
        </p>
      )}
      {!data && !error ? (
        <p role="status">{msg("governance_panel.m0639")}</p>
      ) : (
        data && (
          <>
            <div className="gov-section-head">
              <div>
                <h2>
                  {view === "assemblies"
                    ? msg("governance_panel.m0640")
                    : view === "decisions"
                      ? msg("governance_panel.m0641")
                      : view === "offers"
                        ? msg("governance_panel.m0642")
                        : msg("governance_panel.m0643")}
                </h2>
                <p>
                  {view === "assemblies"
                    ? msg("governance_panel.m0644")
                    : view === "decisions"
                      ? msg("governance_panel.m0645")
                      : view === "offers"
                        ? msg("governance_panel.m0646")
                        : msg("governance_panel.m0647")}
                </p>
              </div>
              <PageActions>
                {canEdit && (
                  <button
                    className="primary"
                    disabled={view === "decisions" && !meetings.length}
                    onClick={() =>
                      edit(
                        view === "assemblies"
                          ? "meeting"
                          : view === "decisions"
                            ? "decision"
                            : view === "offers"
                              ? "offer"
                              : "charge_key",
                        undefined,
                        view === "decisions"
                          ? meetingFilter || meetings[0]?.id
                          : null,
                      )
                    }
                  >
                    <Plus size={16} />
                    {view === "assemblies"
                      ? msg("governance_panel.m0648")
                      : view === "decisions"
                        ? msg("governance_panel.m0649")
                        : view === "offers"
                          ? msg("governance_panel.m0650")
                          : msg("governance_panel.m0651")}
                  </button>
                )}
              </PageActions>
            </div>
            {!canEdit && (
              <p className="gov-muted">
                {readOnly
                  ? msg("governance_panel.m0652")
                  : msg("governance_panel.m0653")}
              </p>
            )}
            {view === "assemblies" && (
              <div className="gov-dossier-layout">
                <aside
                  className="gov-dossier-list"
                  aria-label={msg("governance_panel.m0654")}
                >
                  {meetings.map((m) => (
                    <button
                      key={m.id}
                      className={activeMeeting?.id === m.id ? "selected" : ""}
                      onClick={() => onNavigate("assemblies", m.id)}
                    >
                      <strong>{m.title}</strong>
                      <span>{day(m.payload.meetingDate)}</span>
                    </button>
                  ))}
                  {!meetings.length && (
                    <p className="gov-empty">{msg("governance_panel.m0655")}</p>
                  )}
                </aside>
                {activeMeeting && (
                  <article className="gov-detail">
                    <div className="gov-section-head">
                      <h3>{activeMeeting.title}</h3>
                      {editButton(activeMeeting)}
                    </div>
                    <dl className="gov-facts">
                      <div>
                        <dt>{msg("governance_panel.m0656")}</dt>
                        <dd>{day(activeMeeting.payload.meetingDate)}</dd>
                      </div>
                      <div>
                        <dt>{msg("governance_panel.m0657")}</dt>
                        <dd>
                          {activeMeeting.payload.accountingYear ??
                            msg("governance_panel.m0658")}
                        </dd>
                      </div>
                      <div>
                        <dt>{msg("governance_panel.m0659")}</dt>
                        <dd>
                          {activeMeeting.payload.budgetYear ??
                            msg("governance_panel.m0660")}
                        </dd>
                      </div>
                      <div>
                        <dt>{msg("app.m0199")}</dt>
                        <dd>
                          {activeMeeting.payload.location ||
                            msg("budget_panel.m0249")}
                        </dd>
                      </div>
                    </dl>
                    <p className="gov-pre">{activeMeeting.payload.notes}</p>
                    {source(activeMeeting)}
                    <div className="gov-section-head gov-spaced">
                      <h3>{msg("governance_panel.m0662")}</h3>
                      {canEdit && (
                        <button
                          className="secondary"
                          onClick={() =>
                            edit("requirement", undefined, activeMeeting.id)
                          }
                        >
                          <Plus size={14} />
                          {msg("governance_panel.m0663")}
                        </button>
                      )}
                    </div>
                    <p className="gov-muted">{msg("governance_panel.m0664")}</p>
                    <ul className="gov-records">
                      {items
                        .filter(
                          (i) =>
                            i.kind === "requirement" &&
                            i.parent_id === activeMeeting.id,
                        )
                        .map((i) => (
                          <li key={i.id}>
                            <div>
                              <strong>{i.title}</strong>
                              <span
                                className={`gov-status ${i.payload.status}`}
                              >
                                {label(i.payload.status)}
                              </span>
                              <p>{i.payload.notes}</p>
                              {source(i)}
                            </div>
                            {editButton(i)}
                          </li>
                        ))}
                    </ul>
                    {!items.some(
                      (i) =>
                        i.kind === "requirement" &&
                        i.parent_id === activeMeeting.id,
                    ) && (
                      <p className="gov-empty">
                        {msg("governance_panel.m0666")}
                      </p>
                    )}
                    <div className="gov-section-head gov-spaced">
                      <h3>{msg("governance_panel.m0667")}</h3>
                      <button
                        className="secondary"
                        onClick={() => {
                          setMeetingFilter(activeMeeting.id);
                          onNavigate("decisions");
                        }}
                      >
                        {msg("governance_panel.m0668")}
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <p>
                      {
                        decisions.filter(
                          (d) => d.parent_id === activeMeeting.id,
                        ).length
                      }{" "}
                      {msg("governance_panel.m0669")}
                    </p>
                  </article>
                )}
              </div>
            )}
            {view === "decisions" && (
              <>
                <FilterWorkspace
                  id={`decisions:${context}:${userId}`}
                  title={msg("governance_panel.m0670")}
                  scope={msg("governance_panel.m0671", { p1: year })}
                  count={visibleDecisions.length}
                  total={decisions.length}
                  noun={msg("governance_panel.m0672")}
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
                    ...(meetingFilter
                      ? [
                          {
                            key: "meeting",
                            label:
                              meetings.find((m) => m.id === meetingFilter)
                                ?.title || msg("governance_panel.m0673"),
                            remove: () => setMeetingFilter(""),
                          },
                        ]
                      : []),
                  ]}
                  onReset={() => {
                    onSearch("");
                    setMeetingFilter("");
                  }}
                  rail={
                    <>
                      {" "}
                      <label>
                        {msg("governance_panel.m0673")}
                        <select
                          aria-label={msg("governance_panel.m0674")}
                          value={meetingFilter}
                          onChange={(e) => setMeetingFilter(e.target.value)}
                        >
                          <option value="">
                            {msg("governance_panel.m0675")}
                          </option>
                          {meetings.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {msg("governance_panel.m0676")}
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => onSearch(e.target.value)}
                          placeholder={msg("governance_panel.m0677")}
                        />
                      </label>
                    </>
                  }
                >
                  <dl
                    className="gov-metrics"
                    aria-label={msg("governance_panel.m0678")}
                  >
                    <div>
                      <dt>{msg("governance_panel.m0679")}</dt>
                      <dd>
                        {
                          visibleDecisions.filter((d) =>
                            ["adopted", "rejected"].includes(d.payload.status),
                          ).length
                        }
                        <small>
                          {" "}
                          / {visibleDecisions.length}
                          {msg("governance_panel.m0680")}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>{msg("governance_panel.m0681")}</dt>
                      <dd>{openActions.length}</dd>
                    </div>
                    <div>
                      <dt>{msg("governance_panel.m0682")}</dt>
                      <dd>
                        {overdue.length}
                        <small>
                          {msg("governance_panel.m0683")}
                          {day(data.asOf)}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>{msg("governance_panel.m0684")}</dt>
                      <dd>
                        {openActions.filter((i) => !i.payload.dueDate).length}
                      </dd>
                    </div>
                  </dl>
                  <p className="gov-muted">
                    {msg("governance_panel.m0685")}
                    {year}
                    {msg("governance_panel.m0686")}
                  </p>
                  <div className="gov-decisions-layout">
                    <div
                      className="gov-decision-list"
                      aria-label={msg("governance_panel.m0687")}
                    >
                      {visibleDecisions.map((d) => (
                        <button
                          key={d.id}
                          className={
                            selectedDecision?.id === d.id ? "selected" : ""
                          }
                          onClick={() => onNavigate("decisions", d.id)}
                        >
                          <span className="gov-number">
                            {d.payload.number || "—"}
                          </span>
                          <span>
                            <strong>{d.title}</strong>
                            <small>{rootName(d.parent_id)}</small>
                            <span className={`gov-status ${d.payload.status}`}>
                              {label(d.payload.status)}
                            </span>
                            {d.payload.reserve && (
                              <small className="gov-reserve">
                                {msg("governance_panel.m0688")}
                              </small>
                            )}
                          </span>
                        </button>
                      ))}
                      {!visibleDecisions.length && (
                        <p className="gov-empty">
                          {msg("governance_panel.m0689")}
                          {!meetings.length && msg("governance_panel.m0690")}
                        </p>
                      )}
                    </div>
                    {selectedDecision ? (
                      <article className="gov-detail">
                        <div className="gov-section-head">
                          <div>
                            <span
                              className={`gov-status ${selectedDecision.payload.status}`}
                            >
                              {label(selectedDecision.payload.status)}
                            </span>
                            <h3>{selectedDecision.title}</h3>
                          </div>
                          {editButton(selectedDecision)}
                        </div>
                        <p className="gov-pre">
                          {selectedDecision.payload.body ||
                            msg("governance_panel.m0691")}
                        </p>
                        {selectedDecision.payload.reserve && (
                          <aside className="gov-reservation">
                            <strong>{msg("governance_panel.m0692")}</strong>
                            <p className="gov-pre">
                              {selectedDecision.payload.reserve}
                            </p>
                          </aside>
                        )}
                        <dl className="gov-facts">
                          <div>
                            <dt>{msg("governance_panel.m0693")}</dt>
                            <dd>{day(selectedDecision.payload.decidedOn)}</dd>
                          </div>
                          <div>
                            <dt>{msg("governance_panel.m0694")}</dt>
                            <dd>
                              {selectedDecision.payload.scope ||
                                msg("governance_panel.m0695")}
                            </dd>
                          </div>
                          <div>
                            <dt>{msg("governance_panel.m0696")}</dt>
                            <dd>
                              {selectedDecision.payload.votingRule ||
                                msg("governance_panel.m0697")}
                            </dd>
                          </div>
                          <div>
                            <dt>{msg("governance_panel.m0698")}</dt>
                            <dd>
                              {money(selectedDecision.payload.ceilingCents)}
                            </dd>
                          </div>
                        </dl>
                        {source(selectedDecision)}
                        <p className="gov-muted">
                          {sourceNames()[selectedDecision.payload.sourceType]} ·{" "}
                          {selectedDecision.payload.sourceNote ||
                            msg("governance_panel.m0699")}
                        </p>
                        {(selectedDecision.payload.relatedIds || []).length >
                          0 && (
                          <p>
                            {msg("governance_panel.m0700")}{" "}
                            {selectedDecision.payload.relatedIds.map(
                              (id: string) => (
                                <button
                                  className="gov-link"
                                  key={id}
                                  onClick={() => onNavigate("decisions", id)}
                                >
                                  {rootName(id)}
                                </button>
                              ),
                            )}
                          </p>
                        )}
                        <div className="gov-section-head gov-spaced">
                          <h3>{msg("governance_panel.m0701")}</h3>
                          {canEdit && (
                            <button
                              className="secondary"
                              onClick={() =>
                                edit("action", undefined, selectedDecision.id)
                              }
                            >
                              <Plus size={14} />
                              {msg("governance_panel.m0702")}
                            </button>
                          )}
                        </div>
                        {selectedDecision.payload.status !== "adopted" && (
                          <p className="gov-reservation">
                            {msg("governance_panel.m0703")}
                          </p>
                        )}
                        <ul className="gov-records">
                          {actions
                            .filter((a) => a.parent_id === selectedDecision.id)
                            .sort((a, b) =>
                              (a.payload.dueDate || "9999").localeCompare(
                                b.payload.dueDate || "9999",
                              ),
                            )
                            .map((a) => (
                              <li key={a.id}>
                                <div>
                                  <strong>{a.title}</strong>
                                  <span
                                    className={`gov-status ${a.payload.status}`}
                                  >
                                    {label(a.payload.status)}
                                  </span>
                                  <p>
                                    {label(a.payload.actionType)} ·{" "}
                                    {a.payload.responsible ||
                                      msg("governance_panel.m0704")}
                                  </p>
                                  <p
                                    className={
                                      a.payload.dueDate &&
                                      a.payload.dueDate < data.asOf &&
                                      !["done", "cancelled"].includes(
                                        a.payload.status,
                                      )
                                        ? "gov-reserve"
                                        : ""
                                    }
                                  >
                                    {msg("governance_panel.m0705")}
                                    {day(a.payload.dueDate)}
                                    {a.payload.closedOn &&
                                      msg("governance_panel.m0706", {
                                        p1: day(a.payload.closedOn),
                                      })}
                                  </p>
                                  <p className="gov-pre">{a.payload.note}</p>
                                  {source(a)}
                                </div>
                                {editButton(a)}
                              </li>
                            ))}
                        </ul>
                        {!actions.some(
                          (a) => a.parent_id === selectedDecision.id,
                        ) && (
                          <p className="gov-empty">
                            {msg("governance_panel.m0707")}
                          </p>
                        )}
                        <p className="gov-version">
                          {msg("governance_panel.m0708")}
                          {selectedDecision.version}
                          {msg("governance_panel.m0709")}{" "}
                          {new Date(selectedDecision.updated_at).toLocaleString(
                            localeTag(),
                          )}
                        </p>
                      </article>
                    ) : (
                      <p className="gov-empty">
                        {msg("governance_panel.m0710")}
                      </p>
                    )}
                  </div>
                </FilterWorkspace>
              </>
            )}
            {view === "offers" && (
              <>
                <label className="gov-group">
                  {msg("governance_panel.m0711")}
                  <select
                    aria-label={msg("governance_panel.m0711")}
                    value={currentGroup || ""}
                    onChange={(e) => setOfferGroup(e.target.value)}
                  >
                    {groups.map((g) => {
                      const o = offers.find((x) => group(x) === g)!;
                      return (
                        <option key={g} value={g}>
                          {o.payload.scope} · {o.payload.unit} ·{" "}
                          {rootName(o.parent_id)}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {compared.length ? (
                  <div
                    className="gov-table-wrap"
                    role="region"
                    aria-label={msg("governance_panel.m0712")}
                    tabIndex={0}
                  >
                    <table className="gov-comparison">
                      <caption>{msg("governance_panel.m0713")}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{msg("governance_panel.m0714")}</th>
                          {compared.map((o) => (
                            <th scope="col" key={o.id}>
                              <button
                                className="gov-link"
                                onClick={() => onNavigate("offers", o.id)}
                              >
                                {o.title}
                              </button>
                              <small>{o.payload.supplier}</small>
                              {editButton(o)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          [
                            msg("administration.m0027"),
                            (o: GovernanceItem) => label(o.payload.status),
                          ],
                          [
                            msg("governance_panel.m0715"),
                            (o: GovernanceItem) => money(o.payload.baseHtCents),
                          ],
                          [
                            msg("governance_panel.m0716"),
                            (o: GovernanceItem) =>
                              money(o.payload.baseTtcCents),
                          ],
                          [
                            msg("governance_panel.m0717"),
                            (o: GovernanceItem) => o.payload.options,
                          ],
                          [
                            msg("governance_panel.m0718"),
                            (o: GovernanceItem) => o.payload.duration,
                          ],
                          [
                            msg("governance_panel.m0719"),
                            (o: GovernanceItem) => o.payload.notice,
                          ],
                          [
                            msg("governance_panel.m0610"),
                            (o: GovernanceItem) => o.payload.renewal,
                          ],
                          [
                            msg("governance_panel.m0720"),
                            (o: GovernanceItem) => o.payload.indexation,
                          ],
                          [
                            msg("governance_panel.m0721"),
                            (o: GovernanceItem) => o.payload.coverage,
                          ],
                          [
                            msg("governance_panel.m0722"),
                            (o: GovernanceItem) => o.payload.exclusions,
                          ],
                        ].map(([name, get]) => (
                          <tr key={name as string}>
                            <th scope="row">{name as string}</th>
                            {compared.map((o) => (
                              <td key={o.id}>
                                {(get as (o: GovernanceItem) => string)(o) || (
                                  <span className="gov-muted">
                                    {msg("budget_panel.m0249")}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">{msg("governance_panel.m0723")}</th>
                          {compared.map((o) => (
                            <td key={o.id}>{source(o)}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="gov-empty">{msg("governance_panel.m0724")}</p>
                )}
                {selected?.kind === "offer" && (
                  <article className="gov-detail gov-spaced">
                    <h3>{selected.title}</h3>
                    <p>
                      {rootName(selected.parent_id)} ·{" "}
                      {selected.payload.signedOn
                        ? msg("governance_panel.m0726", {
                            p1: day(selected.payload.signedOn),
                          })
                        : msg("governance_panel.m0727")}
                    </p>
                    {source(selected)}
                    <p className="gov-pre">{selected.payload.sourceNote}</p>
                    <p className="gov-version">
                      {msg("governance_panel.m0708")}
                      {selected.version}
                    </p>
                  </article>
                )}
              </>
            )}
            {view === "keys" && (
              <>
                <p className="gov-reservation">
                  {msg("governance_panel.m0728")}
                </p>
                <div
                  className="gov-table-wrap"
                  role="region"
                  aria-label={msg("governance_panel.m0729")}
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        {[
                          msg("governance_panel.m0730"),
                          msg("governance_panel.m0731"),
                          msg("governance_panel.m0694"),
                          msg("document_vault.m0371"),
                          msg("governance_panel.m0732"),
                          msg("governance_panel.m0733"),
                          "",
                        ].map((h, i) => (
                          <th scope="col" key={i}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k.id}>
                          <th scope="row">
                            <button
                              className="gov-link"
                              onClick={() => onNavigate("keys", k.id)}
                            >
                              {k.title}
                            </button>
                            <small>{k.payload.code}</small>
                          </th>
                          <td>
                            {k.payload.base || msg("governance_panel.m0734")} ·{" "}
                            {k.payload.unit || msg("governance_panel.m0735")}
                          </td>
                          <td>
                            {k.payload.scope || msg("governance_panel.m0695")}
                          </td>
                          <td>
                            {k.payload.validFrom
                              ? day(k.payload.validFrom)
                              : msg("governance_panel.m0736")}
                            <br />
                            {k.payload.validUntil
                              ? msg("governance_panel.m0737", {
                                  p1: day(k.payload.validUntil),
                                })
                              : msg("governance_panel.m0738")}
                          </td>
                          <td>
                            <span className={`gov-status ${k.payload.status}`}>
                              {label(k.payload.status)}
                            </span>
                          </td>
                          <td>{source(k)}</td>
                          <td>{editButton(k)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!keys.length && (
                  <p className="gov-empty">{msg("governance_panel.m0739")}</p>
                )}
                {selected?.kind === "charge_key" && (
                  <article className="gov-detail gov-spaced">
                    <h3>{selected.title}</h3>
                    <p className="gov-pre">
                      {selected.payload.notes || msg("governance_panel.m0740")}
                    </p>
                    {source(selected)}
                    <p className="gov-pre">{selected.payload.sourceNote}</p>
                    <p className="gov-version">
                      {msg("governance_panel.m0708")}
                      {selected.version}
                    </p>
                  </article>
                )}
              </>
            )}
          </>
        )
      )}
      {editor && data && (
        <GovernanceEditor
          key={editor.item?.id || `${editor.kind}:${editor.parentId}`}
          {...props}
          data={data}
          editor={editor}
          endpoint={endpoint}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null);
            props.onChanged?.();
            setRefresh((x) => x + 1);
            setNotice(
              "Enregistrement effectué. La version et la modification sont conservées dans le journal.",
            );
            onNavigate(
              editor.kind === "meeting" || editor.kind === "requirement"
                ? "assemblies"
                : editor.kind === "offer"
                  ? "offers"
                  : editor.kind === "charge_key"
                    ? "keys"
                    : "decisions",
              editor.kind === "action" || editor.kind === "requirement"
                ? editor.parentId || id
                : id,
            );
          }}
        />
      )}
    </section>
  );
}

function GovernanceEditor({
  context,
  year,
  userId,
  data,
  editor,
  endpoint,
  onClose,
  onSaved,
}: Props & {
  data: Register;
  editor: { kind: Kind; item?: GovernanceItem; parentId: string | null };
  endpoint: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { kind, item, parentId } = editor;
  const key = draftKey(
    userId,
    context,
    year,
    `governance:${kind}:${parentId || "root"}`,
    item?.id,
  );
  const initial = () => {
    const p: Record<string, any> = {
      documentId: null,
      sourceVersionId: null,
      sourcePage: null,
      sourceType: "other",
      sourceNote: "",
      ...defaults[kind],
      ...item?.payload,
    };
    for (const f of fields()[kind])
      if (f.type === "money")
        p[f.key] = p[f.key] == null ? "" : (p[f.key] / 100).toFixed(2);
    return {
      title: item?.title || "",
      audience:
        item?.audience ||
        data.items.find((i) => i.id === parentId)?.audience ||
        "owners",
      parentId: parentId || "",
      payload: p,
    };
  };
  const [values, setValues] = useState(initial),
    [pendingDraft, setPendingDraft] = useState(() => readDraft(key)),
    [dirty, setDirty] = useState(false),
    [guard, setGuard] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const focusBefore = useRef(document.activeElement as HTMLElement | null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = focusBefore.current;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    return () => {
      if (element?.open) element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (dirty)
      writeDraft(key, {
        _governance: JSON.stringify(values),
        _baseVersion: String(item?.version || 0),
      });
  }, [values, dirty, key]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const change = (name: string, value: any) => {
    setDirty(true);
    setValues((v) => ({ ...v, payload: { ...v.payload, [name]: value } }));
  };
  const changeTop = (name: string, value: string) => {
    setDirty(true);
    setValues((v) => ({ ...v, [name]: value }));
  };
  const close = () => (dirty ? setGuard(true) : onClose());
  const parentKind =
    kind === "action" || kind === "offer"
      ? "decision"
      : kind === "decision" || kind === "requirement"
        ? "meeting"
        : null;
  const parent = data.items.find((i) => i.id === values.parentId),
    audience = parent?.audience || values.audience;
  const sources = data.sources.filter((s) => s.audiences.includes(audience)),
    source = sources.find((s) => s.id === values.payload.documentId);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...values.payload };
      for (const f of fields()[kind]) {
        if (f.type === "money") {
          const v = String(payload[f.key] ?? "")
            .replace(/[ \u00a0\u202f]/g, "")
            .trim();
          if (v && !/^\d{1,7}(?:[.,]\d{1,2})?$/.test(v))
            throw new Error(msg("governance_panel.m0742", { p1: f.label }));
          const [whole, decimal = ""] = v.replace(",", ".").split(".");
          payload[f.key] = v
            ? Number(whole) * 100 + Number(decimal.padEnd(2, "0"))
            : null;
        }
        if (f.type === "year")
          payload[f.key] =
            payload[f.key] === "" || payload[f.key] == null
              ? null
              : Number(payload[f.key]);
      }
      if (kind === "charge_key")
        payload.base = payload.base.replace(/[ \u00a0\u202f]/g, "");
      payload.documentId = payload.documentId || null;
      payload.sourceVersionId = payload.sourceVersionId || null;
      payload.sourcePage = payload.sourcePage
        ? Number(payload.sourcePage)
        : null;
      const result = await api<{ id: string }>(
        item
          ? endpoint.replace("?", `/${encodeURIComponent(item.id)}?`)
          : endpoint,
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            parentId: values.parentId || null,
            audience,
            kind,
            dossierYear: year,
            payload,
            ...(item ? { version: item.version } : {}),
          }),
        },
      );
      removeDraft(key);
      onSaved(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="gov-dialog"
      aria-labelledby="gov-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) close();
      }}
    >
      <form onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">
              {msg("governance_panel.m0743")}
              {year} ·{" "}
              {item
                ? msg("governance_panel.m0744", { p1: item.version })
                : msg("governance_panel.m0745")}
            </p>
            <h2 id="gov-editor-title">
              {item ? msg("common.edit") : msg("governance_panel.m0746")} ·{" "}
              {labelText(kindLabels[kind])}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={msg("governance_panel.m0747")}
            disabled={saving}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        {pendingDraft && (
          <aside className="gov-reservation">
            <p>
              {pendingDraft._baseVersion !== String(item?.version || 0)
                ? msg("governance_panel.m0748")
                : msg("governance_panel.m0749")}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                try {
                  const restored = JSON.parse(pendingDraft._governance);
                  if (!restored.payload || typeof restored.title !== "string")
                    throw Error();
                  setValues(restored);
                  setDirty(true);
                  setPendingDraft(null);
                } catch {
                  setError("Ce brouillon ne peut pas être repris.");
                }
              }}
            >
              {msg("document_vault.m0458")}
              {pendingDraft._baseVersion !== String(item?.version || 0)
                ? msg("document_vault.m0459")
                : ""}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                removeDraft(key);
                setPendingDraft(null);
              }}
            >
              {msg("document_vault.m0460")}
            </button>
          </aside>
        )}
        {guard && (
          <aside role="alert" className="gov-reservation">
            <p>{msg("governance_panel.m0750")}</p>
            <div className="gov-button-row">
              <button type="button" className="secondary" onClick={onClose}>
                {msg("document_vault.m0452")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  removeDraft(key);
                  onClose();
                }}
              >
                {msg("document_vault.m0453")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => setGuard(false)}
              >
                {msg("app.m0230")}
              </button>
            </div>
          </aside>
        )}
        {error && (
          <p role="alert" className="error">
            {labelText(error)}
            {msg("document_vault.m0461")}
          </p>
        )}
        <fieldset
          className="gov-editor-fields"
          disabled={saving || !!pendingDraft}
        >
          <div className="gov-form-grid">
            <label className="gov-wide">
              {msg("ergonomics_prototype.m0568")}
              <input
                autoFocus
                required
                maxLength={300}
                value={values.title}
                onChange={(e) => changeTop("title", e.target.value)}
              />
            </label>
            {parentKind && (
              <label className="gov-wide">
                {parentKind === "meeting"
                  ? msg("governance_panel.m0673")
                  : msg("governance_panel.m0751")}
                <select
                  aria-label={
                    parentKind === "meeting"
                      ? msg("governance_panel.m0673")
                      : msg("governance_panel.m0751")
                  }
                  required={kind !== "offer"}
                  disabled={!!item && kind !== "offer"}
                  value={values.parentId}
                  onChange={(e) => changeTop("parentId", e.target.value)}
                >
                  <option value="">
                    {kind === "offer"
                      ? msg("governance_panel.m0752")
                      : msg("governance_panel.m0753")}
                  </option>
                  {data.items
                    .filter((i) => i.kind === parentKind)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}{" "}
                        {i.kind === "decision"
                          ? `· ${label(i.payload.status)}`
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {!parent ? (
              <label>
                {msg("governance_panel.m0754")}
                <select
                  aria-label={msg("governance_panel.m0754")}
                  value={values.audience}
                  onChange={(e) => changeTop("audience", e.target.value)}
                >
                  <option value="owners">
                    {msg("governance_panel.m0755")}
                  </option>
                  <option value="council">
                    {msg("governance_panel.m0756")}
                  </option>
                  {data.canConfirm && (
                    <option value="management">
                      {msg("governance_panel.m0757")}
                    </option>
                  )}
                </select>
              </label>
            ) : (
              <p className="gov-muted gov-wide">
                {msg("governance_panel.m0759")}{" "}
                {audience === "owners"
                  ? msg("governance_panel.m0760")
                  : audience === "council"
                    ? msg("governance_panel.m0761")
                    : msg("governance_panel.m0762")}
                .
              </p>
            )}
            {fields()[kind].map((f) => (
              <label
                key={f.key}
                className={f.type === "long" ? "gov-wide" : ""}
              >
                {f.label}
                {f.type === "select" ? (
                  <select
                    aria-label={f.label}
                    value={values.payload[f.key] ?? ""}
                    disabled={
                      kind === "action" && f.key === "actionType" && !!item
                    }
                    onChange={(e) => change(f.key, e.target.value)}
                  >
                    {f.options
                      ?.filter(
                        (v) =>
                          data.canConfirm ||
                          !(
                            v === "adopted" ||
                            v === "rejected" ||
                            v === "signed" ||
                            v === "validated" ||
                            (kind === "action" &&
                              values.payload.actionType === "execution" &&
                              v === "done")
                          ),
                      )
                      .map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                  </select>
                ) : f.type === "long" ? (
                  <textarea
                    rows={f.key === "body" ? 7 : 3}
                    maxLength={f.key === "body" ? 50000 : 5000}
                    value={values.payload[f.key] ?? ""}
                    onChange={(e) => change(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    required={f.required}
                    type={
                      f.type === "date"
                        ? "date"
                        : f.type === "year"
                          ? "number"
                          : "text"
                    }
                    min={f.type === "year" ? 1900 : undefined}
                    max={f.type === "year" ? 2200 : undefined}
                    maxLength={f.key === "base" ? 24 : 300}
                    inputMode={f.type === "money" ? "decimal" : undefined}
                    value={values.payload[f.key] ?? ""}
                    onChange={(e) => change(f.key, e.target.value)}
                  />
                )}
              </label>
            ))}
            {kind === "decision" && (
              <label className="gov-wide">
                {msg("governance_panel.m0763")}
                <select
                  aria-label={msg("governance_panel.m0764")}
                  multiple
                  value={values.payload.relatedIds || []}
                  onChange={(e) =>
                    change(
                      "relatedIds",
                      [...e.target.selectedOptions].map((o) => o.value),
                    )
                  }
                >
                  {data.items
                    .filter(
                      (i) =>
                        i.kind === "decision" &&
                        i.id !== item?.id &&
                        i.audience === audience,
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.payload.number} · {i.title}
                      </option>
                    ))}
                </select>
                <small>{msg("governance_panel.m0765")}</small>
              </label>
            )}
            <fieldset className="gov-wide">
              <legend>{msg("governance_panel.m0766")}</legend>
              <p className="gov-muted">{msg("governance_panel.m0767")}</p>
              <label>
                {msg("governance_panel.m0768")}
                <select
                  aria-label={msg("governance_panel.m0768")}
                  value={values.payload.documentId || ""}
                  onChange={(e) => {
                    const doc = sources.find((s) => s.id === e.target.value);
                    setDirty(true);
                    setValues((v) => ({
                      ...v,
                      payload: {
                        ...v.payload,
                        documentId: doc?.id || null,
                        sourceVersionId: doc?.versions[0]?.id || null,
                        sourcePage: null,
                      },
                    }));
                  }}
                >
                  <option value="">{msg("governance_panel.m0769")}</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              {source && (
                <label>
                  {msg("governance_panel.m0770")}
                  <select
                    aria-label={msg("governance_panel.m0770")}
                    value={
                      values.payload.sourceVersionId ||
                      source.versions[0]?.id ||
                      ""
                    }
                    onChange={(e) => change("sourceVersionId", e.target.value)}
                  >
                    {source.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.filename} ·{" "}
                        {new Date(v.created_at).toLocaleDateString(localeTag())}{" "}
                        · {v.sha256.slice(0, 12)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="gov-form-grid">
                <label>
                  {msg("governance_panel.m0771")}
                  <select
                    aria-label={msg("governance_panel.m0771")}
                    value={values.payload.sourceType}
                    onChange={(e) => change("sourceType", e.target.value)}
                  >
                    {Object.entries(sourceNames()).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {msg("governance_panel.m0772")}
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    disabled={!source}
                    value={values.payload.sourcePage ?? ""}
                    onChange={(e) => change("sourcePage", e.target.value)}
                  />
                </label>
              </div>
              <label>
                {msg("governance_panel.m0773")}
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={values.payload.sourceNote}
                  onChange={(e) => change("sourceNote", e.target.value)}
                />
              </label>
              {!sources.length && (
                <p className="gov-reservation">
                  {msg("governance_panel.m0774")}
                </p>
              )}
            </fieldset>
          </div>
        </fieldset>
        <p className="gov-muted">{msg("governance_panel.m0775")}</p>
        <footer>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={close}
          >
            {msg("common.close")}
          </button>
          <button className="primary" disabled={saving || !!pendingDraft}>
            {saving ? msg("app.m0231") : msg("governance_panel.m0776")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
