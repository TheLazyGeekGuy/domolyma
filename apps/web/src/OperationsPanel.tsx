import { useDialog } from "./use-dialog";
import { msg, labelText } from "./i18n";
import { PageActions, FilterWorkspace } from "./Ergonomics";
import { useFormDraft } from "./use-form-draft";
import { draftKey } from "./form-drafts";
import { searchText } from "../../../packages/contracts/documents";
import { apiFetch } from "./session";
import { interventionCategories } from "../../../packages/contracts/rentals";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Paperclip, Pencil } from "lucide-react";
import type {
  Operation,
  Building,
} from "../../../packages/contracts/operations";
import type { Lot, RecordRow } from "../../../packages/contracts";
export type OperationsData = {
  canManage?: boolean;
  readOnly?: boolean;
  roles: string[];
  operations: Operation[];
  buildings: Building[];
  years: { year: number; status: string }[];
  contacts: {
    id: string;
    name: string;
    role: string;
    email: string;
    phone: string;
  }[];
  relations: {
    lot_id: string;
    user_id: string;
    relation: string;
    tenure: string;
  }[];
  contactPreference: { visible: number; email: string; phone: string };
  lots: Lot[];
  members: { id: string; name: string; role: string }[];
  records: RecordRow[];
};
type Props = {
  page: string;
  data: OperationsData;
  context: string;
  year: number;
  userId: string;
  reload: () => Promise<void>;
  upload: (id: string) => void;
  initialItemId?: string;
  onItemClose?: () => void;
};
const labels: () => Record<string, string> = () => ({
  equipment: msg("app.m0051"),
  contract: msg("app.m0052"),
  visit: msg("app.m0053"),
  event: msg("app.m0050"),
  access: msg("app.m0054"),
  lots: msg("operations_panel.m0832"),
  contacts: msg("app.m0055"),
});
const lotLabels: () => Record<string, string> = () => ({
  apartment: msg("operations_panel.m0833"),
  parking: msg("operations_panel.m0834"),
  garage: msg("operations_panel.m0835"),
  cellar: msg("operations_panel.m0836"),
  bicycle: msg("operations_panel.m0837"),
  commercial: msg("operations_panel.m0838"),
  other: msg("common.other"),
});
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { id: string; label: string }[];
  required?: boolean;
  multiple?: boolean;
};
const option = (id: string, label?: string) => ({
  id,
  label: label ?? labelText(id),
});
async function request(path: string, body: unknown, method = "POST") {
  const r = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const b = (await r.json()) as any;
    throw new Error(
      b.details?.[0]?.message || b.error || msg("operations_panel.m0839"),
    );
  }
  return r.json();
}
export default function OperationsPanel({
  page,
  data,
  context,
  year,
  userId,
  reload,
  upload,
  initialItemId,
  onItemClose,
}: Props) {
  const manager =
      (data.canManage ?? data.roles.includes("manager")) && !data.readOnly,
    supplier = data.roles.includes("supplier");
  const [modal, setModal] = useState<string | null>(null),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [feedback, setFeedback] = useState(""),
    [audienceFilter, setAudienceFilter] = useState(""),
    [sort, setSort] = useState("name");
  const dialog = useRef<HTMLDialogElement>(null);
  const draft = useFormDraft({
    draftId: modal
      ? draftKey(userId, context, year, `operation:${modal}`, editing?.id)
      : null,
    version: editing?.version || 0,
    readOnly: !!data.readOnly,
    onClose: () => {
      setModal(null);
      onItemClose?.();
    },
  });
  useDialog(dialog, !!modal, modal);
  useEffect(() => {
    setModal(null);
    setEditing(null);
    setSearch("");
    setAudienceFilter("");
    setError("");
  }, [context, year, page]);
  const base = `/api/condominiums/${context}`;
  const open = (kind: string, item: any = null) => {
    if (data.readOnly) return;
    setEditing(item);
    setModal(kind);
    setError("");
  };
  const close = () => {
    draft.close();
  };
  useEffect(() => {
    if (!initialItemId) return;
    const item = data.operations.find(
      (o) => o.id === initialItemId && o.kind === page,
    );
    if (item) open(item.kind, item);
  }, [initialItemId, context, year, page]);
  const equipment = data.operations.filter((o) => o.kind === "equipment"),
    contracts = data.operations.filter((o) => o.kind === "contract");
  const opts = {
    buildings: data.buildings.map((b) => option(b.id, b.name)),
    equipment: equipment.map((o) => option(o.id, o.title)),
    contracts: contracts.map((o) => option(o.id, o.title)),
    members: data.members.map((m) => option(m.id, m.name)),
    lots: data.lots.map((l) =>
      option(
        l.id,
        msg("operations_panel.m0840", { p1: l.number, p2: l.label }),
      ),
    ),
    incidents: data.records
      .filter((r) => r.kind === "incident")
      .map((r) => option(r.id, r.title)),
  };
  const fields: Record<string, Field[]> = {
    equipment: [
      { key: "category", label: msg("document_vault.m0360"), required: true },
      {
        key: "buildingId",
        label: msg("operations_panel.m0841"),
        options: opts.buildings,
      },
      {
        key: "parentId",
        label: msg("operations_panel.m0842"),
        options: opts.equipment.filter((o) => o.id !== editing?.id),
      },
      { key: "location", label: msg("operations_panel.m0843") },
      { key: "reference", label: msg("operations_panel.m0844") },
      { key: "serial", label: msg("operations_panel.m0845") },
      {
        key: "commissioned",
        label: msg("operations_panel.m0846"),
        type: "date",
      },
      {
        key: "nextMaintenance",
        label: msg("operations_panel.m0847"),
        type: "date",
      },
      { key: "notes", label: msg("accident_followup.m0018"), type: "textarea" },
    ],
    contract: [
      { key: "supplier", label: msg("budget_panel.m0309"), required: true },
      { key: "reference", label: msg("operations_panel.m0848") },
      {
        key: "equipmentIds",
        label: msg("operations_panel.m0849"),
        options: opts.equipment,
        multiple: true,
      },
      { key: "startsOn", label: msg("operations_panel.m0850"), type: "date" },
      { key: "endsOn", label: msg("operations_panel.m0851"), type: "date" },
      {
        key: "frequency",
        label: msg("operations_panel.m0852"),
        required: true,
      },
      {
        key: "coverage",
        label: msg("operations_panel.m0853"),
        type: "textarea",
      },
      {
        key: "exclusions",
        label: msg("governance_panel.m0722"),
        type: "textarea",
      },
      { key: "notes", label: msg("document_vault.m0478"), type: "textarea" },
    ],
    visit: [
      {
        key: "category",
        label: msg("incident_fields.m0796"),
        options: interventionCategories.map((x) => option(x)),
        required: true,
      },
      {
        key: "contractId",
        label: msg("operations_panel.m0854"),
        options: opts.contracts,
      },
      {
        key: "equipmentIds",
        label: msg("operations_panel.m0855"),
        options: opts.equipment,
        multiple: true,
      },
      {
        key: "incidentId",
        label: msg("operations_panel.m0856"),
        options: opts.incidents,
      },
      {
        key: "scheduledOn",
        label: msg("operations_panel.m0857"),
        type: "date",
        required: true,
      },
      {
        key: "performedOn",
        label: msg("operations_panel.m0858"),
        type: "date",
      },
      {
        key: "status",
        label: msg("operations_panel.m0859"),
        options: ["Prévu", "Réalisé", "Avec réserves", "Annulé"].map((x) =>
          option(x),
        ),
        required: true,
      },
      {
        key: "reception",
        label: msg("operations_panel.m0864"),
        options: ["À vérifier", "Réceptionné", "Réserves"].map((x) =>
          option(x),
        ),
        required: true,
      },
      { key: "report", label: msg("operations_panel.m0868"), type: "textarea" },
      {
        key: "reservations",
        label: msg("operations_panel.m0869"),
        type: "textarea",
      },
    ],
    event: [
      {
        key: "category",
        label: msg("operations_panel.m0870"),
        options: [
          "Déménagement",
          "Fête",
          "Information",
          "Travaux privatifs",
          "Autre",
        ].map((x) => option(x)),
        required: true,
      },
      {
        key: "startsAt",
        label: msg("operations_panel.m0875"),
        type: "datetime-local",
        required: true,
      },
      {
        key: "endsAt",
        label: msg("operations_panel.m0876"),
        type: "datetime-local",
      },
      { key: "location", label: msg("app.m0199") },
      {
        key: "description",
        label: msg("operations_panel.m0877"),
        type: "textarea",
        required: true,
      },
    ],
    access: [
      {
        key: "type",
        label: msg("operations_panel.m0878"),
        options: ["Clé", "Badge Vigik", "Télécommande", "Autre"].map((x) =>
          option(x),
        ),
        required: true,
      },
      {
        key: "quantity",
        label: msg("operations_panel.m0881"),
        type: "number",
        required: true,
      },
      {
        key: "holderId",
        label: msg("operations_panel.m0882"),
        options: opts.members,
        required: true,
      },
      { key: "serial", label: msg("operations_panel.m0845") },
      { key: "internalCode", label: msg("operations_panel.m0883") },
      {
        key: "handedOn",
        label: msg("operations_panel.m0884"),
        type: "date",
        required: true,
      },
      { key: "returnedOn", label: msg("operations_panel.m0885"), type: "date" },
      {
        key: "opensEquipmentIds",
        label: msg("operations_panel.m0886"),
        options: opts.equipment,
        multiple: true,
      },
      { key: "notes", label: msg("accident_followup.m0018"), type: "textarea" },
    ],
    lot: [
      { key: "number", label: msg("operations_panel.m0887"), required: true },
      { key: "label", label: msg("operations_panel.m0888"), required: true },
      {
        key: "lotType",
        label: msg("operations_panel.m0889"),
        options: Object.entries(lotLabels()).map(([id, label]) =>
          option(id, label),
        ),
        required: true,
      },
      { key: "areaM2", label: msg("operations_panel.m0890") },
      {
        key: "weight",
        label: msg("operations_panel.m0891"),
        type: "number",
        required: true,
      },
      {
        key: "buildingId",
        label: msg("operations_panel.m0841"),
        options: opts.buildings,
      },
      {
        key: "ownerId",
        label: msg("operations_panel.m0892"),
        options: opts.members.filter(
          (m) => data.members.find((x) => x.id === m.id)?.role !== "supplier",
        ),
      },
      { key: "apartmentNumber", label: msg("operations_panel.m0893") },
      {
        key: "parentLotId",
        label: msg("operations_panel.m0894"),
        options: opts.lots.filter((o) => o.id !== editing?.id),
      },
      {
        key: "useType",
        label: msg("operations_panel.m0895"),
        options: [
          option("residential", msg("operations_panel.m0896")),
          option("professional", msg("operations_panel.m0897")),
          option("mixed", msg("operations_panel.m0898")),
          option("ancillary", msg("operations_panel.m0899")),
        ],
        required: true,
      },
      { key: "declaredActivity", label: msg("operations_panel.m0900") },
      {
        key: "intercomDisplay",
        label: msg("operations_panel.m0901"),
      },
      {
        key: "intercomProgram",
        label: msg("operations_panel.m0902"),
      },
      { key: "mailbox", label: msg("operations_panel.m0903") },
    ],
    building: [
      { key: "name", label: msg("operations_panel.m0904"), required: true },
      {
        key: "hasIntercom",
        label: msg("operations_panel.m0905"),
        type: "checkbox",
      },
      {
        key: "displayOffset",
        label: msg("operations_panel.m0906"),
        type: "number",
      },
      {
        key: "programOffset",
        label: msg("operations_panel.m0907"),
        type: "number",
      },
      { key: "notes", label: msg("document_vault.m0478"), type: "textarea" },
    ],
    relation: [
      {
        key: "lotId",
        label: msg("operations_panel.m0908"),
        options: opts.lots,
        required: true,
      },
      {
        key: "userId",
        label: msg("operations_panel.m0909"),
        options: opts.members,
        required: true,
      },
      {
        key: "tenure",
        label: msg("operations_panel.m0910"),
        options: [
          option("tenant", msg("operations_panel.m0911")),
          option("owner", msg("operations_panel.m0912")),
        ],
        required: true,
      },
      {
        key: "validFrom",
        label: msg("operations_panel.m0913"),
        type: "date",
        required: true,
      },
      {
        key: "validUntil",
        label: msg("operations_panel.m0914"),
        type: "date",
      },
    ],
    year: [
      {
        key: "year",
        label: msg("operations_panel.m0915"),
        type: "number",
        required: true,
      },
    ],
  };
  const initial = () => {
    if (!editing) return {};
    if (modal === "building")
      return {
        name: editing.name,
        hasIntercom: Boolean(editing.has_intercom),
        displayOffset: editing.intercom_display_offset ?? "",
        programOffset: editing.intercom_program_offset ?? "",
        notes: editing.notes || "",
      };
    if (modal !== "lot") return editing.payload || {};
    return {
      number: editing.number,
      label: editing.label,
      ownerId: editing.owner_id || "",
      weight: editing.weight,
      buildingId: editing.building_id || "",
      lotType: editing.lot_type,
      areaM2: editing.area_m2 || "",
      useType: editing.use_type,
      declaredActivity: editing.declared_activity || "",
      apartmentNumber: editing.apartment_number || "",
      parentLotId: editing.parent_lot_id || "",
      intercomDisplay: editing.intercom_display || "",
      intercomProgram: editing.intercom_program || "",
      mailbox: editing.mailbox || "",
    };
  };
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal || draft.blocked) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget),
        p: any = {};
      for (const field of fields[modal]) {
        const raw = String(f.get(field.key) || "");
        p[field.key] = field.multiple
          ? f.getAll(field.key).map(String)
          : field.type === "checkbox"
            ? f.has(field.key)
            : field.type === "number"
              ? raw
                ? Number(raw)
                : null
              : field.options && !field.required
                ? raw || null
                : raw;
      }
      let path = "",
        body: any = p,
        method = editing ? "PATCH" : "POST";
      if (modal === "lot")
        ((path = `lots${editing ? `/${editing.id}` : ""}`),
          (body = { ...p, version: editing?.version }));
      else if (modal === "building")
        ((path = `buildings${editing ? `/${editing.id}` : ""}`),
          (body = { ...p, version: editing?.version }));
      else if (modal === "relation")
        ((path = "relations"), (body = { ...p, relation: "occupant" }));
      else if (modal === "year") path = "years";
      else {
        path = `operations${editing ? `/${editing.id}` : ""}`;
        body = {
          kind: modal,
          title: String(f.get("title") || editing?.title || ""),
          audience:
            modal === "access"
              ? "lot"
              : !manager
                ? "residents"
                : String(f.get("audience") || "management"),
          lotId: String(f.get("lotId") || "") || null,
          assignedTo: String(f.get("assignedTo") || "") || null,
          fiscalYear: year,
          payload: p,
          version: editing?.version,
        };
        if (supplier && editing)
          body.payload = Object.fromEntries(
            ["performedOn", "status", "report", "reservations"].map((k) => [
              k,
              p[k],
            ]),
          );
      }
      await request(`${base}/${path}?year=${year}`, body, method);
      draft.complete();
      setModal(null);
      onItemClose?.();
      await reload();
      setFeedback(msg("operations_panel.m0916"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const allRows = data.operations.filter((o) => o.kind === page);
  const rows = allRows
    .filter(
      (o) =>
        (!audienceFilter || o.audience === audienceFilter) &&
        searchText(`${o.title} ${JSON.stringify(o.payload)}`).includes(
          searchText(search),
        ),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "fr")
        : (b.updated_at || "").localeCompare(a.updated_at || ""),
    );
  const filteredLots = data.lots.filter((l) =>
    searchText(`${l.number} ${l.label}`).includes(searchText(search)),
  );
  const chips = [
    ...(search
      ? [
          {
            key: "search",
            label: msg("app.m0155", { p1: search }),
            remove: () => setSearch(""),
          },
        ]
      : []),
    ...(audienceFilter
      ? [
          {
            key: "audience",
            label:
              (
                {
                  management: msg("app.m0211"),
                  owners: msg("document_vault.m0445"),
                  residents: msg("operations_panel.m0917"),
                  lot: msg("app.m0212"),
                } as any
              )[audienceFilter] || audienceFilter,
            remove: () => setAudienceFilter(""),
          },
        ]
      : []),
  ];
  const renderField = (field: Field) => {
    const value =
      initial()[field.key] ??
      (field.key === "category"
        ? "Autre"
        : field.key === "reception"
          ? "À vérifier"
          : field.key === "quantity"
            ? 1
            : field.key === "weight"
              ? 1
              : field.key === "useType"
                ? "residential"
                : "");
    return (
      <label key={field.key}>
        {field.label}
        {field.options ? (
          <select
            name={field.key}
            multiple={field.multiple}
            defaultValue={field.multiple ? value || [] : value || ""}
            required={field.required}
          >
            {!field.multiple && (
              <option value="">{msg("incident_fields.m0791")}</option>
            )}
            {field.options.map((o) => (
              <option value={o.id} key={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            name={field.key}
            defaultValue={value}
            required={field.required}
            maxLength={5000}
          />
        ) : (
          <input
            type={field.type || "text"}
            name={field.key}
            defaultValue={field.type === "checkbox" ? undefined : value}
            defaultChecked={
              field.type === "checkbox" ? Boolean(value) : undefined
            }
            required={field.required}
            maxLength={300}
            step={field.type === "number" ? 1 : undefined}
          />
        )}
      </label>
    );
  };
  const show = (key: string, id: string | null) =>
    id
      ? (key === "equipment" ? equipment : contracts).find((o) => o.id === id)
          ?.title || msg("operations_panel.m0918")
      : "—";
  return (
    <>
      {feedback && (
        <p role="status" className="notice">
          {labelText(feedback)}
        </p>
      )}
      <PageActions>
        {" "}
        <div>
          {manager && page === "lots" && (
            <>
              <button className="secondary" onClick={() => open("building")}>
                {msg("operations_panel.m0919")}
              </button>
              <button className="secondary" onClick={() => open("relation")}>
                {msg("operations_panel.m0920")}
              </button>
            </>
          )}
          {!data.readOnly &&
            (manager || (page === "event" && !supplier)) &&
            page !== "contacts" && (
              <button
                className="primary"
                onClick={() => open(page === "lots" ? "lot" : page)}
              >
                <Plus size={16} />
                {page === "lots"
                  ? msg("operations_panel.m0921")
                  : page === "event"
                    ? msg("operations_panel.m0922")
                    : msg("operations_panel.m0923", { p1: labels()[page] })}
              </button>
            )}
          {manager && page === "contacts" && (
            <button className="secondary" onClick={() => open("year")}>
              {msg("operations_panel.m0924")}
            </button>
          )}
        </div>
      </PageActions>
      {page === "contacts" ? (
        <Contacts data={data} context={context} reload={reload} />
      ) : (
        <FilterWorkspace
          id={`operations:${context}:${userId}:${page}`}
          title={msg("operations_panel.m0925")}
          scope={msg("operations_panel.m0926", { p1: year })}
          active={chips}
          onReset={() => {
            setSearch("");
            setAudienceFilter("");
          }}
          count={page === "lots" ? filteredLots.length : rows.length}
          total={page === "lots" ? data.lots.length : allRows.length}
          noun={page === "lots" ? "lot(s)" : msg("operations_panel.m0927")}
          toolbar={
            page !== "lots" ? (
              <label>
                {msg("document_vault.m0403")}{" "}
                <select
                  aria-label={msg("operations_panel.m0928")}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">{msg("administration.m0024")}</option>
                  <option value="recent">
                    {msg("operations_panel.m0929")}
                  </option>
                </select>
              </label>
            ) : undefined
          }
          rail={
            <>
              <label>
                {msg("common.search")}
                <input
                  type="search"
                  aria-label={msg("operations_panel.m0930")}
                  placeholder={msg("operations_panel.m0931")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {page !== "lots" && (
                <label>
                  {msg("app.m0209")}
                  <select
                    aria-label={msg("operations_panel.m0932")}
                    value={audienceFilter}
                    onChange={(e) => setAudienceFilter(e.target.value)}
                  >
                    <option value="">{msg("operations_panel.m0933")}</option>
                    {[...new Set(allRows.map((o) => o.audience))].map((a) => (
                      <option key={a} value={a}>
                        {(
                          {
                            management: msg("app.m0211"),
                            owners: msg("document_vault.m0445"),
                            residents: msg("operations_panel.m0917"),
                            lot: msg("app.m0212"),
                          } as any
                        )[a] || a}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          }
        >
          {page === "lots" ? (
            <>
              <div className="building-strip">
                {data.buildings.map((b) => (
                  <div key={b.id}>
                    <strong>{b.name}</strong>
                    {manager && (
                      <button
                        className="text-button"
                        onClick={() => open("building", b)}
                      >
                        {msg("common.edit")}
                      </button>
                    )}
                    <small>
                      {b.has_intercom
                        ? msg("operations_panel.m0934")
                        : msg("operations_panel.m0935")}
                      {b.intercom_display_offset !== null
                        ? msg("operations_panel.m0936", {
                            p1: b.intercom_display_offset,
                          })
                        : ""}
                      {manager && b.intercom_program_offset !== null
                        ? msg("operations_panel.m0937", {
                            p1: b.intercom_program_offset,
                          })
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{msg("operations_panel.m0938")}</th>
                      <th>{msg("operations_panel.m0888")}</th>
                      <th>{msg("operations_panel.m0939")}</th>
                      <th>{msg("budget_panel.m0291")}</th>
                      <th>{msg("operations_panel.m0940")}</th>
                      {manager && <th>{msg("operations_panel.m0941")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLots.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.number}</strong>
                          <small className="block-muted">
                            {lotLabels()[l.lot_type || "apartment"]}
                          </small>
                        </td>
                        <td>
                          {l.label}
                          <small className="block-muted">
                            {data.buildings.find((b) => b.id === l.building_id)
                              ?.name || msg("operations_panel.m0942")}
                            {l.apartment_number
                              ? msg("operations_panel.m0943", {
                                  p1: l.apartment_number,
                                })
                              : ""}
                            {l.parent_lot_id
                              ? msg("operations_panel.m0944", {
                                  p1:
                                    data.lots.find(
                                      (x) => x.id === l.parent_lot_id,
                                    )?.number || l.parent_lot_id,
                                })
                              : ""}
                          </small>
                          <small className="block-muted">
                            {
                              (
                                {
                                  residential: msg("operations_panel.m0896"),
                                  professional: msg("operations_panel.m0897"),
                                  mixed: msg("operations_panel.m0898"),
                                  ancillary: msg("operations_panel.m0899"),
                                } as any
                              )[l.use_type || "residential"]
                            }
                            {l.declared_activity
                              ? ` · ${l.declared_activity}`
                              : ""}
                          </small>
                        </td>
                        <td>
                          {l.area_m2
                            ? msg("operations_panel.m0945", { p1: l.area_m2 })
                            : msg("app.m0068")}
                        </td>
                        <td>{l.weight}</td>
                        <td>
                          {l.intercom_display || "—"}
                          <small className="block-muted">
                            {l.mailbox
                              ? msg("operations_panel.m0946", { p1: l.mailbox })
                              : ""}
                            {manager && l.intercom_program
                              ? msg("operations_panel.m0947", {
                                  p1: l.intercom_program,
                                })
                              : ""}
                          </small>
                        </td>
                        {manager && (
                          <td>
                            <button
                              className="text-button"
                              onClick={() => open("lot", l)}
                            >
                              <Pencil size={14} />
                              {msg("common.edit")}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="table-note">{msg("operations_panel.m0948")}</p>
              </section>
            </>
          ) : (
            <section className="panel ops-list">
              {rows.length ? (
                rows.map((o) => (
                  <article key={o.id} className="ops-item">
                    <div className="ops-heading">
                      <div>
                        <h2>{o.title}</h2>
                        <small className="block-muted">
                          {o.audience === "residents"
                            ? msg("operations_panel.m0917")
                            : o.audience === "owners"
                              ? msg("document_vault.m0445")
                              : o.audience === "lot"
                                ? msg("app.m0212")
                                : msg("app.m0211")}{" "}
                          {msg("operations_panel.m0950")}
                          {o.version}
                        </small>
                      </div>
                      <div>
                        {!data.readOnly &&
                        (manager || (supplier && o.kind === "visit")) ? (
                          <button
                            className="text-button"
                            onClick={() => open(o.kind, o)}
                          >
                            <Pencil size={14} />
                            {supplier
                              ? msg("operations_panel.m0951")
                              : msg("common.edit")}
                          </button>
                        ) : null}
                        {!data.readOnly &&
                          (manager || (supplier && o.kind === "visit")) && (
                            <button
                              className="text-button"
                              onClick={() => upload(o.id)}
                            >
                              <Paperclip size={14} />
                              {msg("operations_panel.m0952")}
                            </button>
                          )}
                      </div>
                    </div>
                    {o.kind === "equipment" && (
                      <>
                        <p>
                          {o.payload.category} ·{" "}
                          {o.payload.location || msg("operations_panel.m0953")}{" "}
                          ·{" "}
                          {o.payload.reference || msg("operations_panel.m0954")}
                        </p>
                        <p>
                          {o.payload.parentId
                            ? msg("operations_panel.m0955", {
                                p1: show("equipment", o.payload.parentId),
                              })
                            : data.buildings.find(
                                (b) => b.id === o.payload.buildingId,
                              )?.name}{" "}
                          {msg("operations_panel.m0956")}{" "}
                          {o.payload.nextMaintenance ||
                            msg("operations_panel.m0957")}
                        </p>
                        {manager && o.payload.serial && (
                          <p>
                            {msg("operations_panel.m0958")}
                            {o.payload.serial}
                          </p>
                        )}
                      </>
                    )}
                    {o.kind === "contract" && (
                      <>
                        <p>
                          {o.payload.supplier} · {o.payload.reference} ·{" "}
                          {o.payload.startsOn || msg("operations_panel.m0959")}{" "}
                          → {o.payload.endsOn || msg("operations_panel.m0960")}
                        </p>
                        <p>
                          <strong>{msg("operations_panel.m0961")}</strong>{" "}
                          {o.payload.frequency}
                        </p>
                        <p>
                          <strong>{msg("operations_panel.m0962")}</strong>{" "}
                          {o.payload.coverage || msg("operations_panel.m0963")}
                        </p>
                        <p>
                          <strong>{msg("operations_panel.m0964")}</strong>{" "}
                          {o.payload.exclusions ||
                            msg("operations_panel.m0963")}
                        </p>
                        <p>
                          {msg("operations_panel.m0965")}{" "}
                          {o.payload.equipmentIds.length
                            ? o.payload.equipmentIds
                                .map((id: string) => show("equipment", id))
                                .join(", ")
                            : msg("operations_panel.m0966")}
                        </p>
                      </>
                    )}
                    {o.kind === "visit" && (
                      <>
                        <p>
                          <span className="status">
                            {labelText(o.payload.status)}
                          </span>
                          {msg("operations_panel.m0967")}
                          {labelText(
                            o.payload.reception ||
                              msg("operations_panel.m0865"),
                          )}
                          {msg("operations_panel.m0968")}
                          {o.payload.scheduledOn}
                          {o.payload.performedOn
                            ? msg("operations_panel.m0969", {
                                p1: o.payload.performedOn,
                              })
                            : ""}
                        </p>
                        <p>
                          {o.payload.contractId
                            ? show("contract", o.payload.contractId)
                            : msg("operations_panel.m0970")}{" "}
                          ·{" "}
                          {o.payload.equipmentIds
                            .map((id: string) => show("equipment", id))
                            .join(", ") || msg("operations_panel.m0971")}
                        </p>
                        <p className="multiline">
                          {o.payload.report || msg("operations_panel.m0972")}
                        </p>
                        {o.payload.reservations && (
                          <p>
                            {msg("operations_panel.m0973")}
                            {o.payload.reservations}
                          </p>
                        )}
                        {supplier && o.payload.status === "Réalisé" && (
                          <small>{msg("operations_panel.m0974")}</small>
                        )}
                      </>
                    )}
                    {o.kind === "event" && (
                      <>
                        <p>
                          <span className="status">
                            {labelText(o.payload.category)}
                          </span>{" "}
                          · {o.payload.startsAt.replace("T", " ")}
                          {o.payload.endsAt
                            ? ` → ${o.payload.endsAt.replace("T", " ")}`
                            : ""}
                        </p>
                        <p>{o.payload.location}</p>
                        <p className="multiline">{o.payload.description}</p>
                      </>
                    )}
                    {o.kind === "access" && (
                      <>
                        <p>
                          {o.payload.type} · {o.payload.quantity}
                          {msg("operations_panel.m0975")} {o.payload.handedOn}
                          {o.payload.returnedOn
                            ? msg("operations_panel.m0976", {
                                p1: o.payload.returnedOn,
                              })
                            : msg("operations_panel.m0977")}
                        </p>
                        <p>
                          {msg("app.m0221")}
                          {
                            data.lots.find((l) => l.id === o.lot_id)?.number
                          } ·{" "}
                          {data.members.find((m) => m.id === o.payload.holderId)
                            ?.name || msg("operations_panel.m0978")}
                        </p>
                        {manager && (
                          <p>
                            {msg("operations_panel.m0979")}
                            {o.payload.serial || msg("operations_panel.m0980")}
                            {msg("operations_panel.m0981")}{" "}
                            {o.payload.internalCode ||
                              msg("operations_panel.m0982")}
                          </p>
                        )}
                      </>
                    )}
                    <div className="linked-documents">
                      {data.records
                        .filter((r: any) => r.ops_id === o.id)
                        .map((r) => (
                          <small key={r.id}>
                            <Paperclip size={12} />
                            {r.title}
                            {msg("operations_panel.m0983")}
                          </small>
                        ))}
                    </div>
                  </article>
                ))
              ) : (
                <p className="empty">{msg("operations_panel.m0984")}</p>
              )}
            </section>
          )}
        </FilterWorkspace>
      )}
      {modal && (
        <dialog
          ref={dialog}
          className="dialog operations-dialog"
          aria-labelledby="ops-dialog-title"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <form
            ref={draft.form}
            onSubmit={save}
            onInput={draft.capture}
            onChange={draft.capture}
          >
            <div className="dialog-heading">
              <h2 id="ops-dialog-title">
                {editing ? msg("common.edit") : msg("common.add")} ·{" "}
                {
                  (
                    {
                      lot: msg("app.m0166"),
                      building: msg("operations_panel.m0841"),
                      relation: msg("operations_panel.m0987"),
                      year: msg("operations_panel.m0988"),
                      ...labels(),
                    } as any
                  )[modal]
                }
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label={msg("common.close")}
                onClick={close}
              >
                <X />
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {labelText(error)}
              </div>
            )}
            {draft.controls}
            <fieldset disabled={busy || draft.blocked}>
              {!["lot", "building", "relation", "year"].includes(modal) &&
                !supplier && (
                  <label>
                    {msg("app.m0195")}
                    <input
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={editing?.title}
                    />
                  </label>
                )}
              {(supplier && modal === "visit"
                ? fields.visit.filter((f) =>
                    [
                      "performedOn",
                      "status",
                      "report",
                      "reservations",
                    ].includes(f.key),
                  )
                : fields[modal]
              ).map(renderField)}
              {manager &&
                !["lot", "building", "relation", "year"].includes(modal) && (
                  <>
                    {modal !== "access" && (
                      <label>
                        {msg("app.m0209")}
                        <select
                          name="audience"
                          defaultValue={
                            editing?.audience ||
                            (["equipment", "visit", "event"].includes(modal)
                              ? "residents"
                              : "owners")
                          }
                        >
                          <option value="residents">{msg("app.m0215")}</option>
                          <option value="owners">
                            {msg("document_vault.m0445")}
                          </option>
                          <option value="management">{msg("app.m0211")}</option>
                          <option value="lot">{msg("app.m0212")}</option>
                        </select>
                      </label>
                    )}
                    <label>
                      {msg("operations_panel.m0989")}
                      <select name="lotId" defaultValue={editing?.lot_id || ""}>
                        <option value="">
                          {msg("operations_panel.m0990")}
                        </option>
                        {opts.lots.map((o) => (
                          <option value={o.id} key={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {msg("operations_panel.m0991")}
                      <select
                        name="assignedTo"
                        defaultValue={editing?.assigned_to || ""}
                      >
                        <option value="">
                          {msg("operations_panel.m0992")}
                        </option>
                        {opts.members.map((o) => (
                          <option value={o.id} key={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <small>{msg("operations_panel.m0993")}</small>
                    </label>
                  </>
                )}
            </fieldset>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={close}>
                {msg("common.close")}
              </button>
              <button className="primary" disabled={busy || draft.blocked}>
                {busy ? msg("app.m0231") : msg("common.save")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
function Contacts({
  data,
  context,
  reload,
}: {
  data: OperationsData;
  context: string;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (data.readOnly) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await request(
        `/api/condominiums/${context}/contacts/me`,
        {
          visible: f.has("visible"),
          email: String(f.get("email") || ""),
          phone: String(f.get("phone") || ""),
        },
        "PUT",
      );
      await reload();
      setMessage(msg("operations_panel.m0994"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="scope-note">{msg("operations_panel.m0995")}</p>
      <section className="panel">
        {data.contacts.map((c) => (
          <div className="contact-row" key={c.id}>
            <div>
              <h2>{c.name}</h2>
              <small>
                {c.role === "manager"
                  ? msg("operations_panel.m0996")
                  : msg("operations_panel.m0997")}
              </small>
            </div>
            <div>
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.phone && <span>{c.phone}</span>}
              {!c.email && !c.phone && (
                <span>{msg("operations_panel.m0998")}</span>
              )}
            </div>
          </div>
        ))}
      </section>
      <form className="panel preference-form" onSubmit={save} key={context}>
        <h2>{msg("operations_panel.m1000")}</h2>
        <fieldset
          disabled={busy || !!data.readOnly}
          style={{
            border: 0,
            padding: 0,
            display: "grid",
            gap: 14,
            minWidth: 0,
          }}
        >
          <label>
            {msg("operations_panel.m1001")}
            <input
              name="email"
              type="email"
              defaultValue={data.contactPreference.email}
            />
          </label>
          <label>
            {msg("operations_panel.m1002")}
            <input
              name="phone"
              maxLength={50}
              defaultValue={data.contactPreference.phone}
            />
          </label>
          <label className="checkbox-label">
            <input
              name="visible"
              type="checkbox"
              defaultChecked={Boolean(data.contactPreference.visible)}
            />
            {msg("operations_panel.m1003")}
          </label>
          <button className="primary" disabled={busy}>
            {msg("operations_panel.m1004")}
          </button>
        </fieldset>
        {message && <p role="status">{labelText(message)}</p>}
      </form>
    </>
  );
}
