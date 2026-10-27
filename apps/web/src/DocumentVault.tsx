import LoadingState from "./LoadingState";
import { msg, labelText, localeTag, getLocale } from "./i18n";
import { PageActions } from "./Ergonomics";
import { useEffect, useRef, useState } from "react";
import {
  Eye,
  X,
  Download,
  MoreHorizontal,
  HelpCircle,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { apiFetch } from "./session";
import { draftKey, readDraft, writeDraft, removeDraft } from "./form-drafts";
import {
  documentCategories,
  documentValidity,
  fileKind,
  searchText,
  type VaultDocument,
  type VaultTarget,
  type DocumentMetadata,
  type VaultVersion,
} from "../../../packages/contracts/documents";
import {
  VaultPreview,
  VaultPreviewScope,
  VaultThumbnail,
  downloadUrl,
} from "./VaultPreview";
import "./document-vault.css";

type Register = {
  documents: VaultDocument[];
  targets: VaultTarget[];
  canManage: boolean;
  asOf: string;
};
type Props = {
  context: string;
  userId: string;
  readOnly: boolean;
  onUpload: () => void;
  onNewVersion: (id: string) => void;
  refresh: unknown;
  onChanged: () => void;
};
type Filters = {
  q: string;
  kinds: string[];
  categories: string[];
  scope: string;
  from: string;
  to: string;
  validity: string[];
  storage: string[];
};
const empty: Filters = {
  q: "",
  kinds: [],
  categories: [],
  scope: "",
  from: "",
  to: "",
  validity: [],
  storage: [],
};
const kinds = () => [
  ["pdf", "PDF"],
  ["image", msg("document_vault.m0332")],
  ["office", msg("document_vault.m0333")],
  ["other", msg("document_vault.m0334")],
];
const validities = () => [
  ["soon", msg("document_vault.m0335")],
  ["expired", msg("document_vault.m0336")],
  ["valid", msg("document_vault.m0337")],
  ["none", msg("app.m0062")],
];
const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
const category = (key: string) => {
  const item =
    documentCategories.find((x) => x[0] === key) || documentCategories.at(-1)!;
  return [item[0], labelText(item[1]), item[2]] as const;
};
const fileDate = (d: VaultDocument) => d.metadata.date;
const bytes = (size: number) =>
  size >= 1024 * 1024
    ? msg("document_vault.m0338", {
        p1: new Intl.NumberFormat(localeTag(), {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format(size / 1024 / 1024),
      })
    : msg("document_vault.m0339", {
        p1: new Intl.NumberFormat(localeTag(), {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format(size / 1024),
      });
const date = (value: string) =>
  value
    ? new Date(value + "T12:00:00Z").toLocaleDateString(localeTag())
    : msg("app.m0068");
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(url, options);
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(value.error || msg("document_vault.m0340"));
  return value;
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function metadataExport(d: VaultDocument) {
  return {
    id: d.id,
    title: d.title,
    fiscalYear: d.fiscalYear,
    metadata: d.metadata,
    links: d.links,
    versions: d.versions,
  };
}

export default function DocumentVault(props: Props) {
  return (
    <VaultPreviewScope>
      <Vault {...props} />
    </VaultPreviewScope>
  );
}
function Vault({
  context,
  userId,
  readOnly,
  onUpload,
  onNewVersion,
  refresh,
  onChanged,
}: Props) {
  const menuHost = useRef<HTMLDivElement>(null);
  const base = `/api/condominiums/${encodeURIComponent(context)}/document-vault`,
    pref = `domolyma-vault:${userId}:${context}`;
  const [data, setData] = useState<Register>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(pref) || "{}");
      return { ...empty, ...v.filters };
    } catch {
      return empty;
    }
  });
  const [view, setView] = useState<"gallery" | "list">(() => {
    try {
      return JSON.parse(sessionStorage.getItem(pref) || "{}").view === "list"
        ? "list"
        : "gallery";
    } catch {
      return "gallery";
    }
  });
  const [sort, setSort] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(pref) || "{}").sort || "date";
    } catch {
      return "date";
    }
  });
  const [rail, setRail] = useState(true),
    [narrow, setNarrow] = useState(false),
    [filterDialog, setFilterDialog] = useState(false),
    [limit, setLimit] = useState(24);
  const [selection, setSelection] = useState<string[]>([]),
    [open, setOpen] = useState(""),
    [preview, setPreview] = useState<{
      version: VaultVersion;
      title: string;
    }>(),
    [menu, setMenu] = useState(false),
    [help, setHelp] = useState(false),
    [trash, setTrash] = useState(false);
  const [exporting, setExporting] = useState(""),
    host = useRef<HTMLDivElement>(null),
    filterButton = useRef<HTMLButtonElement>(null),
    mobileFilters = useRef<HTMLDialogElement>(null),
    exportController = useRef<AbortController | null>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(([e]) =>
      setNarrow(e.contentRect.width < 920),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Register>(base, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [base, refresh]);
  useEffect(() => {
    try {
      sessionStorage.setItem(pref, JSON.stringify({ filters, view, sort }));
    } catch {}
  }, [filters, view, sort, pref]);
  useEffect(() => {
    setLimit(24);
  }, [filters, trash]);
  useEffect(() => {
    if (filterDialog && mobileFilters.current && !mobileFilters.current.open)
      mobileFilters.current.showModal();
  }, [filterDialog]);
  useEffect(
    () => () => {
      exportController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!menu) return;
    const node = menuHost.current;
    node?.querySelector<HTMLButtonElement>(".dv-menu button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!node?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      if (node?.contains(document.activeElement))
        node.querySelector<HTMLButtonElement>("button")?.focus();
    };
  }, [menu]);
  const closeMenu = () => {
    setMenu(false);
    menuHost.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };
  const documents = (data?.documents || []).filter(
      (d) => !!d.metadata.trashed === trash,
    ),
    canEdit = !!data?.canManage && !readOnly;
  const update = (patch: Partial<Filters>) =>
    setFilters((v) => ({ ...v, ...patch }));
  const matches = (d: VaultDocument, skip = "") => {
    const v = d.versions[0],
      cat = category(d.metadata.category)[1],
      words = searchText(filters.q).split(/\s+/).filter(Boolean),
      haystack = searchText(
        [
          d.title,
          v?.filename,
          d.metadata.issuer,
          cat,
          ...d.links.map((l) => l.label),
        ].join(" "),
      );
    return (
      words.every((w) => haystack.includes(w)) &&
      (!filters.kinds.length ||
        skip === "kinds" ||
        (v && filters.kinds.includes(fileKind(v)))) &&
      (!filters.categories.length ||
        skip === "categories" ||
        filters.categories.includes(d.metadata.category)) &&
      (!filters.scope ||
        (filters.scope.startsWith("year:")
          ? d.fiscalYear === Number(filters.scope.slice(5))
          : d.links.some((l) => `${l.type}:${l.id}` === filters.scope))) &&
      (!filters.from || (fileDate(d) && fileDate(d) >= filters.from)) &&
      (!filters.to || (fileDate(d) && fileDate(d) <= filters.to)) &&
      (!filters.validity.length ||
        skip === "validity" ||
        filters.validity.includes(
          documentValidity(d.metadata.validUntil, data!.asOf),
        )) &&
      (!filters.storage.length || filters.storage.includes("managed"))
    );
  };
  const rows = documents
    .filter((d) => matches(d))
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "fr")
        : sort === "valid"
          ? (a.metadata.validUntil || "9999").localeCompare(
              b.metadata.validUntil || "9999",
            )
          : sort === "category"
            ? category(a.metadata.category)[1].localeCompare(
                category(b.metadata.category)[1],
                "fr",
              ) || b.createdAt.localeCompare(a.createdAt)
            : (b.metadata.date || b.createdAt).localeCompare(
                a.metadata.date || a.createdAt,
              ) || a.id.localeCompare(b.id),
    );
  const count = (skip: string, test: (d: VaultDocument) => boolean) =>
    documents.filter((d) => matches(d, skip) && test(d)).length;
  const picked = (data?.documents || []).filter(
    (d) => selection.includes(d.id) && !!d.metadata.trashed === trash,
  );
  const openDoc = data?.documents.find((d) => d.id === open);
  const show = (d: VaultDocument, v = d.versions[0]) => {
    if (v) setPreview({ version: v, title: d.title });
  };
  const closeFilters = () => {
    mobileFilters.current?.close();
    setFilterDialog(false);
    filterButton.current?.focus();
  };
  const active = [
    ...(filters.q
      ? [
          {
            key: "q",
            label: `« ${filters.q} »`,
            remove: () => update({ q: "" }),
          },
        ]
      : []),
    ...filters.kinds.map((k) => ({
      key: "k:" + k,
      label: kinds().find((x) => x[0] === k)?.[1] || k,
      remove: () => update({ kinds: toggle(filters.kinds, k) }),
    })),
    ...filters.categories.map((c) => ({
      key: "c:" + c,
      label: category(c)[1],
      remove: () => update({ categories: toggle(filters.categories, c) }),
    })),
    ...(filters.scope
      ? [
          {
            key: "scope",
            label: filters.scope.startsWith("year:")
              ? msg("document_vault.m0342") + filters.scope.slice(5)
              : data?.targets.find((t) => `${t.type}:${t.id}` === filters.scope)
                  ?.label || msg("document_vault.m0343"),
            remove: () => update({ scope: "" }),
          },
        ]
      : []),
    ...(filters.from || filters.to
      ? [
          {
            key: "period",
            label: `${filters.from || "…"} → ${filters.to || "…"}`,
            remove: () => update({ from: "", to: "" }),
          },
        ]
      : []),
    ...filters.validity.map((v) => ({
      key: "v:" + v,
      label: validities().find((x) => x[0] === v)?.[1] || v,
      remove: () => update({ validity: toggle(filters.validity, v) }),
    })),
    ...filters.storage.map((v) => ({
      key: "s:" + v,
      label:
        v === "managed"
          ? msg("document_vault.m0344")
          : msg("document_vault.m0345"),
      remove: () => update({ storage: toggle(filters.storage, v) }),
    })),
  ];
  const reload = async () => {
    const fresh = await api<Register>(base);
    setData(fresh);
    return fresh;
  };
  const save = async (
    doc: VaultDocument,
    title: string,
    metadata: DocumentMetadata,
  ) => {
    const response = await api<{ version: number }>(
      `${base}/${encodeURIComponent(doc.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: doc.version, title, metadata }),
      },
    );
    const updated = {
      ...doc,
      title,
      metadata,
      version: response.version,
      categorySuggested: false,
      links: metadata.links
        .map((l) =>
          data!.targets.find((t) => t.type === l.type && t.id === l.id),
        )
        .filter(Boolean) as VaultTarget[],
    };
    setData((old) =>
      old
        ? {
            ...old,
            documents: old.documents.map((d) =>
              d.id === doc.id ? updated : d,
            ),
          }
        : old,
    );
    onChanged();
    return updated;
  };
  const bulk = async (value: string) => {
    if (!value || bulkBusy) return;
    setBulkBusy(true);
    setError("");
    let done = 0;
    try {
      for (const d of picked) {
        await save(d, d.title, {
          ...d.metadata,
          category: value as DocumentMetadata["category"],
        });
        done++;
      }
      setNotice(msg("document_vault.m0346", { p1: done }));
    } catch (e) {
      setError(
        msg("document_vault.m0347", { p1: done, p2: (e as Error).message }),
      );
    } finally {
      setBulkBusy(false);
    }
  };
  const exportFiles = async (portable: boolean) => {
    if (!picked.length) return;
    const controller = new AbortController();
    exportController.current = controller;
    setError("");
    setExporting(msg("document_vault.m0348"));
    try {
      const chunks: Uint8Array[] = [];
      let finish!: (blob: Blob) => void, reject!: (e: Error) => void;
      const result = new Promise<Blob>((ok, no) => {
        finish = ok;
        reject = no;
      });
      const zip = new Zip((error, chunk, last) => {
        if (error) {
          reject(error);
          return;
        }
        chunks.push(chunk);
        if (last)
          finish(new Blob(chunks as BlobPart[], { type: "application/zip" }));
      });
      const add = (name: string, content: Uint8Array) => {
        const file = new ZipPassThrough(name);
        zip.add(file);
        file.push(content, true);
      };
      const manifest = [];
      let index = 0;
      for (const d of picked) {
        const v = d.versions[0];
        if (!v) continue;
        setExporting(
          msg("document_vault.m0349", {
            p1: ++index,
            p2: picked.length,
            p3: v.filename,
          }),
        );
        const r = await apiFetch(downloadUrl(context, v.id), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error(msg("document_vault.m0350"));
        const body = new Uint8Array(await r.arrayBuffer());
        const name = `documents/${String(index).padStart(3, "0")}_${v.filename.replace(/[\\/<>:"|?*\x00-\x1f]/g, "_")}`;
        add(name, body);
        manifest.push({ ...metadataExport(d), file: name });
      }
      add("manifest.json", strToU8(JSON.stringify(manifest, null, 2)));
      if (portable)
        add(
          "index.html",
          strToU8(
            `<!doctype html><html lang="${getLocale()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(msg("app.m0056"))}</title><style>body{font:16px system-ui;max-width:1000px;margin:3rem auto;padding:0 1rem;color:#34314d}li{padding:1rem;border-bottom:1px solid #ddd}small{display:block;color:#666}</style><h1>${escape(msg("app.m0056"))}</h1><p>${escape(msg("vault.portable_summary", { date: new Date().toLocaleDateString(localeTag()), count: manifest.length }))}</p><ul>${manifest.map((d) => `<li><a href="${escape(d.file.split("/").map(encodeURIComponent).join("/"))}">${escape(d.title)}</a><small>${escape(category(d.metadata.category)[1])} · ${escape(d.metadata.issuer || "")}</small></li>`).join("")}</ul></html>`,
          ),
        );
      if (controller.signal.aborted)
        throw new DOMException(msg("document_vault.m0352"), "AbortError");
      zip.end();
      const blob = await result;
      if (!controller.signal.aborted)
        downloadBlob(
          blob,
          portable
            ? "coffre-documentaire-portable.zip"
            : "documents-selection.zip",
        );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      else setNotice(msg("document_vault.m0353"));
    } finally {
      setExporting("");
      exportController.current = null;
    }
  };
  const railContent = (
    <>
      <header>
        <h2 id="dv-filters-title">{msg("document_vault.m0354")}</h2>
        <button
          className="secondary dv-square"
          aria-label={msg("document_vault.m0356")}
          onClick={() => (narrow ? closeFilters() : setRail(false))}
        >
          <X size={16} />
        </button>
      </header>
      <input
        type="search"
        aria-label={msg("document_vault.m0357")}
        placeholder={msg("document_vault.m0358")}
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
      />
      <fieldset>
        <legend>{msg("document_vault.m0359")}</legend>
        <div className="dv-filter-toggles">
          {kinds().map(([k, label]) => (
            <button
              key={k}
              aria-pressed={filters.kinds.includes(k)}
              onClick={() => update({ kinds: toggle(filters.kinds, k) })}
            >
              {labelText(label)}{" "}
              <span>
                {count(
                  "kinds",
                  (d) => !!d.versions[0] && fileKind(d.versions[0]) === k,
                )}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{msg("document_vault.m0360")}</legend>
        {documentCategories.map(([key, label, color]) => (
          <label className="dv-check" key={key}>
            <input
              type="checkbox"
              checked={filters.categories.includes(key)}
              onChange={() =>
                update({ categories: toggle(filters.categories, key) })
              }
            />
            <i className="dv-dot" style={{ background: color }} />
            {labelText(label)}
            <span>
              {count("categories", (d) => d.metadata.category === key)}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{msg("document_vault.m0343")}</legend>
        <select
          aria-label={msg("document_vault.m0361")}
          value={filters.scope}
          onChange={(e) => update({ scope: e.target.value })}
        >
          <option value="">{msg("common.all")}</option>
          <optgroup label={msg("document_vault.m0363")}>
            {[...new Set(documents.map((d) => d.fiscalYear))]
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={`year:${y}`}>
                  {msg("document_vault.m0342")}
                  {y}
                </option>
              ))}
          </optgroup>
          <optgroup label={msg("document_vault.m0364")}>
            {(data?.targets || [])
              .filter((t) =>
                documents.some((d) =>
                  d.links.some((l) => l.id === t.id && l.type === t.type),
                ),
              )
              .map((t) => (
                <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>
                  {t.label}
                </option>
              ))}
          </optgroup>
        </select>
      </fieldset>
      <fieldset>
        <legend>{msg("document_vault.m0365")}</legend>
        <label>
          {msg("document_vault.m0366")}
          <input
            aria-label={msg("document_vault.m0367")}
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
        </label>
        <label>
          {msg("document_vault.m0368")}
          <input
            aria-label={msg("document_vault.m0369")}
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </label>
        <small>{msg("document_vault.m0370")}</small>
      </fieldset>
      <fieldset>
        <legend>{msg("document_vault.m0371")}</legend>
        {validities().map(([key, label]) => (
          <label className="dv-check" key={key}>
            <input
              type="checkbox"
              checked={filters.validity.includes(key)}
              onChange={() =>
                update({ validity: toggle(filters.validity, key) })
              }
            />
            {labelText(label)}
            <span>
              {count(
                "validity",
                (d) =>
                  documentValidity(d.metadata.validUntil, data!.asOf) === key,
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{msg("document_vault.m0372")}</legend>
        {[
          ["managed", msg("document_vault.m0344")],
          ["external", msg("document_vault.m0345")],
        ].map(([key, label]) => (
          <label className="dv-check" key={key}>
            <input
              type="checkbox"
              checked={filters.storage.includes(key)}
              onChange={() => update({ storage: toggle(filters.storage, key) })}
            />
            {labelText(label)}
            <span>{key === "managed" ? documents.length : 0}</span>
          </label>
        ))}
      </fieldset>
      <button
        className="secondary"
        disabled={!active.length}
        onClick={() => setFilters(empty)}
      >
        {msg("document_vault.m0373")}
      </button>
      {narrow && (
        <button className="primary" onClick={closeFilters}>
          {msg("document_vault.m0374")}
          {rows.length}
          {msg("document_vault.m0375")}
        </button>
      )}
    </>
  );
  const chip = (d: VaultDocument) => {
    const state = documentValidity(d.metadata.validUntil, data!.asOf);
    return state === "expired" ? (
      <span className="dv-chip danger">{msg("document_vault.m0336")}</span>
    ) : state === "soon" ? (
      <span className="dv-chip warn">{msg("document_vault.m0335")}</span>
    ) : null;
  };
  return (
    <div className="document-vault" ref={host}>
      <div className="dv-actions">
        <div role="tablist" aria-label={msg("document_vault.m0378")}>
          <button
            role="tab"
            aria-selected={!trash}
            onClick={() => {
              setTrash(false);
              setSelection([]);
            }}
          >
            {msg("document_vault.m0379")}
          </button>
          {data?.canManage && (
            <button
              role="tab"
              aria-selected={trash}
              onClick={() => {
                setTrash(true);
                setSelection([]);
              }}
            >
              {msg("document_vault.m0380")}{" "}
              <small>
                {data.documents.filter((d) => d.metadata.trashed).length}
              </small>
            </button>
          )}
        </div>
        <PageActions>
          <div
            className="dv-header-actions"
            ref={menuHost}
            onKeyDown={(e) => {
              if (!menu) return;
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setMenu(false);
                menuHost.current
                  ?.querySelector<HTMLButtonElement>("button")
                  ?.focus();
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const buttons = [
                    ...menuHost.current!.querySelectorAll<HTMLButtonElement>(
                      ".dv-menu button",
                    ),
                  ],
                  index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                buttons[
                  (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            <button
              className="secondary dv-square"
              aria-label={msg("document_vault.m0384")}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((x) => !x)}
            >
              <MoreHorizontal size={19} />
            </button>
            <button className="dv-help" onClick={() => setHelp((x) => !x)}>
              <HelpCircle size={17} />
              {msg("document_vault.m0385")}
            </button>
            {menu && (
              <div
                className="dv-menu"
                role="menu"
                aria-label={msg("document_vault.m0386")}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    downloadBlob(
                      new Blob(
                        [JSON.stringify(rows.map(metadataExport), null, 2)],
                        { type: "application/json" },
                      ),
                      "coffre-metadonnees.json",
                    );
                    closeMenu();
                  }}
                >
                  {msg("document_vault.m0387")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setSelection(rows.map((d) => d.id));
                    closeMenu();
                  }}
                >
                  {msg("document_vault.m0388")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    void reload().catch((e) => setError(e.message));
                    closeMenu();
                  }}
                >
                  {msg("document_vault.m0389")}
                </button>
              </div>
            )}
          </div>
        </PageActions>
      </div>
      {help && (
        <aside className="dv-help-note">
          <strong>{msg("document_vault.m0390")}</strong>
          <p>{msg("document_vault.m0391")}</p>
          <p>{msg("document_vault.m0392")}</p>
        </aside>
      )}
      <div className="dv-scope">
        <strong>{msg("document_vault.m0393")}</strong>
        {active.length ? (
          <>
            {active.map((f) => (
              <span className="dv-filter-chip" key={f.key}>
                {f.label}
                <button
                  aria-label={msg("document_vault.m0394", { p1: f.label })}
                  onClick={f.remove}
                >
                  {msg("document_vault.m0395")}
                </button>
              </span>
            ))}
            <button
              className="dv-text-button"
              onClick={() => setFilters(empty)}
            >
              {msg("document_vault.m0396")}
            </button>
          </>
        ) : (
          <span>{msg("document_vault.m0397")}</span>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {labelText(error)}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {labelText(notice)}
          <button
            className="dv-text-button"
            aria-label={msg("app.m0149")}
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </p>
      )}
      <div className={`dv-body ${rail && !narrow ? "with-rail" : ""}`}>
        {!narrow && rail && (
          <aside className="dv-filter-rail" aria-labelledby="dv-filters-title">
            {railContent}
          </aside>
        )}
        <section
          className="dv-results"
          aria-label={msg("document_vault.m0399")}
        >
          <div className="dv-results-bar">
            <div>
              <button
                ref={filterButton}
                className="secondary"
                aria-expanded={narrow ? filterDialog : rail}
                onClick={() =>
                  narrow ? setFilterDialog((x) => !x) : setRail((x) => !x)
                }
              >
                {msg("document_vault.m0400")}
                {active.length}
              </button>
              <strong role="status">
                {data
                  ? rows.length === documents.length
                    ? msg("document_vault.m0401", { p1: rows.length })
                    : msg("document_vault.m0402", {
                        p1: rows.length,
                        p2: documents.length,
                      })
                  : msg("common.loading")}
              </strong>
            </div>
            <div>
              <label className="dv-sort">
                {msg("document_vault.m0403")}
                <select
                  aria-label={msg("document_vault.m0404")}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="date">{msg("document_vault.m0405")}</option>
                  <option value="name">{msg("administration.m0024")}</option>
                  <option value="valid">{msg("document_vault.m0406")}</option>
                  <option value="category">
                    {msg("document_vault.m0360")}
                  </option>
                </select>
              </label>
              <div
                className="dv-view"
                role="group"
                aria-label={msg("document_vault.m0407")}
              >
                <button
                  aria-pressed={view === "gallery"}
                  onClick={() => setView("gallery")}
                >
                  {msg("document_vault.m0408")}
                </button>
                <button
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  {msg("document_vault.m0409")}
                </button>
              </div>
            </div>
          </div>
          {!data && !error ? (
            <LoadingState />
          ) : !documents.length ? (
            <div className="dv-empty">
              <FileText size={28} />
              <strong>
                {trash
                  ? msg("document_vault.m0411")
                  : msg("document_vault.m0412")}
              </strong>
              {!trash && canEdit && (
                <button className="primary" onClick={onUpload}>
                  <Plus size={16} />
                  {msg("app.m0144")}
                </button>
              )}
            </div>
          ) : !rows.length ? (
            <div className="dv-empty">
              <strong>{msg("document_vault.m0413")}</strong>
              <span>
                {documents.length}
                {msg("document_vault.m0414")}
              </span>
              <button className="secondary" onClick={() => setFilters(empty)}>
                {msg("document_vault.m0373")}
              </button>
            </div>
          ) : view === "gallery" ? (
            <>
              <div className={`dv-grid ${selection.length ? "selecting" : ""}`}>
                {rows.slice(0, limit).map((d) => {
                  const v = d.versions[0];
                  return (
                    <article
                      key={d.id}
                      className={`dv-card ${selection.includes(d.id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="dv-pick"
                        aria-label={msg("document_vault.m0417", {
                          p1: d.title,
                        })}
                        checked={selection.includes(d.id)}
                        onChange={() =>
                          setSelection((ids) => toggle(ids, d.id))
                        }
                      />
                      <button
                        className="dv-thumb"
                        onClick={() => show(d)}
                        aria-label={msg("document_vault.m0418", {
                          p1: d.title,
                        })}
                        disabled={!v}
                      >
                        {v ? (
                          <VaultThumbnail context={context} version={v} />
                        ) : (
                          <span>{msg("document_vault.m0419")}</span>
                        )}
                        <span className="dv-badge">
                          {v
                            ? fileKind(v) === "other"
                              ? v.filename.split(".").at(-1)?.toUpperCase()
                              : fileKind(v).toUpperCase()
                            : "…"}
                        </span>
                      </button>
                      <button
                        className="dv-eye"
                        aria-label={msg("document_vault.m0420", {
                          p1: d.title,
                        })}
                        disabled={!v}
                        onClick={() => show(d)}
                      >
                        <Eye size={16} />
                      </button>
                      <div className="dv-meta">
                        <button
                          className="dv-name"
                          aria-label={msg("document_vault.m0421", {
                            p1: d.title,
                          })}
                          onClick={() => setOpen(d.id)}
                        >
                          {d.title}
                        </button>
                        <span className="dv-category">
                          <i
                            className="dv-dot"
                            style={{
                              background: category(d.metadata.category)[2],
                            }}
                          />
                          {labelText(category(d.metadata.category)[1])}
                        </span>
                        <small>
                          {d.links[0]?.label ||
                            msg("document_vault.m0422", {
                              p1: d.fiscalYear,
                            })}{" "}
                          ·{" "}
                          {d.metadata.date
                            ? date(d.metadata.date)
                            : msg("document_vault.m0423", {
                                p1: date(d.createdAt.slice(0, 10)),
                              })}
                        </small>
                        <span>
                          {chip(d)}
                          {d.versions.length > 1 && (
                            <span className="dv-chip">
                              {d.versions.length}
                              {msg("document_vault.m0424")}
                            </span>
                          )}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              {limit < rows.length && (
                <button
                  className="secondary dv-more"
                  onClick={() => setLimit((n) => n + 24)}
                >
                  {msg("document_vault.m0426")}
                  {Math.min(limit, rows.length)} / {rows.length})
                </button>
              )}
            </>
          ) : (
            <div className="dv-table-wrap">
              <table className="dv-list">
                <thead>
                  <tr>
                    {[
                      msg("document_vault.m0427"),
                      msg("document_vault.m0428"),
                      msg("document_vault.m0429"),
                      msg("document_vault.m0360"),
                      msg("document_vault.m0343"),
                      msg("administration.m0035"),
                      msg("document_vault.m0371"),
                      msg("document_vault.m0430"),
                      msg("document_vault.m0372"),
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const v = d.versions[0];
                    return (
                      <tr key={d.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={msg("document_vault.m0417", {
                              p1: d.title,
                            })}
                            checked={selection.includes(d.id)}
                            onChange={() =>
                              setSelection((ids) => toggle(ids, d.id))
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="dv-mini"
                            aria-label={msg("document_vault.m0418", {
                              p1: d.title,
                            })}
                            onClick={() => show(d)}
                          >
                            {v && (
                              <VaultThumbnail context={context} version={v} />
                            )}
                          </button>
                        </td>
                        <td>
                          <button
                            className="dv-name"
                            onClick={() => setOpen(d.id)}
                          >
                            {d.title}
                          </button>
                          <button
                            className="dv-eye-inline"
                            aria-label={msg("document_vault.m0420", {
                              p1: d.title,
                            })}
                            onClick={() => show(d)}
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                        <td>
                          <span className="dv-category">
                            <i
                              className="dv-dot"
                              style={{
                                background: category(d.metadata.category)[2],
                              }}
                            />
                            {labelText(category(d.metadata.category)[1])}
                          </span>
                        </td>
                        <td>
                          {d.links.map((l) => l.label).join(" · ") ||
                            msg("document_vault.m0422", { p1: d.fiscalYear })}
                        </td>
                        <td>
                          {d.metadata.date ? (
                            date(d.metadata.date)
                          ) : (
                            <span className="dv-muted">
                              {msg("document_vault.m0431")}
                            </span>
                          )}
                        </td>
                        <td>{chip(d) || d.metadata.validUntil || "—"}</td>
                        <td>{v ? bytes(v.size) : "—"}</td>
                        <td>{msg("app.m0085")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {filterDialog && narrow && (
        <dialog
          ref={mobileFilters}
          className="dv-mobile-filters"
          aria-labelledby="dv-filters-title"
          onCancel={(e) => {
            e.preventDefault();
            closeFilters();
          }}
        >
          <aside className="dv-filter-rail">{railContent}</aside>
        </dialog>
      )}
      {picked.length > 0 && (
        <div
          className="dv-selection"
          role="region"
          aria-label={msg("document_vault.m0432")}
        >
          <strong>
            {picked.length}
            {msg("document_vault.m0433")}
          </strong>
          <button
            className="primary"
            disabled={!!exporting}
            onClick={() => void exportFiles(false)}
          >
            {msg("document_vault.m0434")}
          </button>
          <button
            className="secondary"
            disabled={!!exporting}
            onClick={() => void exportFiles(true)}
          >
            {msg("document_vault.m0435")}
          </button>
          {canEdit && (
            <select
              aria-label={msg("document_vault.m0436")}
              disabled={bulkBusy || !!exporting}
              value=""
              onChange={(e) => void bulk(e.target.value)}
            >
              <option value="">{msg("document_vault.m0437")}</option>
              {documentCategories.map(([key, label]) => (
                <option key={key} value={key}>
                  {labelText(label)}
                </option>
              ))}
            </select>
          )}
          <button
            className="dv-text-button"
            disabled={!!exporting}
            onClick={() => setSelection([])}
          >
            {msg("document_vault.m0438")}
          </button>
        </div>
      )}
      {exporting && (
        <div role="status" className="dv-export-status">
          <span>{exporting}</span>
          <button
            className="secondary"
            onClick={() => exportController.current?.abort()}
          >
            {msg("document_vault.m0439")}
          </button>
        </div>
      )}
      {openDoc && (
        <DocumentDrawer
          key={openDoc.id}
          context={context}
          userId={userId}
          doc={openDoc}
          targets={data!.targets}
          canEdit={canEdit}
          onClose={() => setOpen("")}
          onPreview={(v) => show(openDoc, v)}
          onNewVersion={() => {
            setOpen("");
            onNewVersion(openDoc.id);
          }}
          onSave={save}
          onReload={async () => {
            const value = await reload();
            const d = value.documents.find((x) => x.id === openDoc.id);
            if (!d) throw Error("Ce document n’est plus accessible.");
            return d;
          }}
          onNotice={setNotice}
        />
      )}
      {preview && (
        <VaultPreview
          key={preview.version.id}
          context={context}
          version={preview.version}
          title={preview.title}
          onClose={() => setPreview(undefined)}
        />
      )}
    </div>
  );
}

function DocumentDrawer({
  context,
  userId,
  doc,
  targets,
  canEdit,
  onClose,
  onPreview,
  onNewVersion,
  onSave,
  onReload,
  onNotice,
}: {
  context: string;
  userId: string;
  doc: VaultDocument;
  targets: VaultTarget[];
  canEdit: boolean;
  onClose: () => void;
  onPreview: (v: VaultVersion) => void;
  onNewVersion: () => void;
  onSave: (
    d: VaultDocument,
    title: string,
    m: DocumentMetadata,
  ) => Promise<VaultDocument>;
  onReload: () => Promise<VaultDocument>;
  onNotice: (s: string) => void;
}) {
  const key = draftKey(userId, context, 0, "vault-metadata", doc.id),
    [base, setBase] = useState(doc),
    [title, setTitle] = useState(doc.title),
    [metadata, setMetadata] = useState(doc.metadata),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(() => readDraft(key)),
    [guard, setGuard] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    before = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const e = dialog.current!;
    e.showModal();
    return () => {
      if (e.open) e.close();
      if (before.current?.isConnected) before.current.focus();
    };
  }, []);
  useEffect(() => {
    if (dirty)
      writeDraft(key, {
        _baseVersion: String(base.version),
        _vault: JSON.stringify({ title, metadata }),
      });
  }, [title, metadata, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const close = () => (dirty ? setGuard(true) : onClose()),
    change = (patch: Partial<DocumentMetadata>) => {
      setDirty(true);
      setMetadata((v) => ({ ...v, ...patch }));
    };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await onSave(base, title, metadata);
      setBase(updated);
      setDirty(false);
      removeDraft(key);
      onNotice(msg("document_vault.m0441"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const archive = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(base, base.title, {
        ...base.metadata,
        trashed: !base.metadata.trashed,
      });
      removeDraft(key);
      onNotice(
        base.metadata.trashed
          ? msg("document_vault.m0442")
          : msg("document_vault.m0443"),
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const audience =
    base.audience === "management"
      ? msg("app.m0211")
      : base.audience === "lot"
        ? msg("app.m0212")
        : base.accessScope === "council"
          ? msg("app.m0217")
          : base.accessScope === "residents"
            ? msg("app.m0215")
            : base.accessScope === "assigned"
              ? msg("document_vault.m0444")
              : msg("document_vault.m0445");
  return (
    <dialog
      ref={dialog}
      className="dv-drawer"
      aria-labelledby="dv-drawer-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <div>
          <h2 id="dv-drawer-title">{base.title}</h2>
          <span className="dv-category">
            <i
              className="dv-dot"
              style={{ background: category(base.metadata.category)[2] }}
            />
            {labelText(category(base.metadata.category)[1])}
          </span>
        </div>
        <button
          className="secondary dv-square"
          aria-label={msg("document_vault.m0446")}
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="dv-drawer-body">
        {base.versions[0] && (
          <>
            <button
              className="dv-drawer-preview"
              onClick={() => onPreview(base.versions[0])}
              aria-label={msg("document_vault.m0447", { p1: base.title })}
            >
              <VaultThumbnail context={context} version={base.versions[0]} />
              <span className="dv-badge">{bytes(base.versions[0].size)}</span>
            </button>
            <div className="dv-drawer-actions">
              <button
                className="secondary"
                onClick={() => onPreview(base.versions[0])}
              >
                <Eye size={15} />
                {msg("document_vault.m0448")}
              </button>
              <a
                className="secondary"
                href={downloadUrl(context, base.versions[0].id)}
              >
                <Download size={15} />
                {msg("document_vault.m0449")}
              </a>
            </div>
          </>
        )}
        {guard && (
          <aside role="alert" className="dv-warning">
            <strong>{msg("document_vault.m0450")}</strong>
            <p>{msg("document_vault.m0451")}</p>
            <button className="secondary" onClick={onClose}>
              {msg("document_vault.m0452")}
            </button>
            <button
              className="secondary"
              onClick={() => {
                removeDraft(key);
                onClose();
              }}
            >
              {msg("document_vault.m0453")}
            </button>
            <button className="primary" onClick={() => setGuard(false)}>
              {msg("app.m0230")}
            </button>
          </aside>
        )}
        {pending && (
          <aside className="dv-warning">
            <strong>
              {pending._baseVersion !== String(base.version)
                ? msg("document_vault.m0454")
                : msg("document_vault.m0455")}
            </strong>
            <p>{msg("document_vault.m0456")}</p>
            <button
              className="secondary"
              onClick={() => {
                try {
                  const v = JSON.parse(pending._vault);
                  setTitle(v.title);
                  setMetadata(v.metadata);
                  setDirty(true);
                  setPending(null);
                } catch {
                  setError("Ce brouillon ne peut pas être repris.");
                }
              }}
            >
              {msg("document_vault.m0458")}
              {pending._baseVersion !== String(base.version)
                ? msg("document_vault.m0459")
                : ""}
            </button>
            <button
              className="secondary"
              onClick={() => {
                removeDraft(key);
                setPending(null);
              }}
            >
              {msg("document_vault.m0460")}
            </button>
          </aside>
        )}
        {error && (
          <div className="error" role="alert">
            <p>
              {labelText(error)}
              {msg("document_vault.m0461")}
            </p>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const value = await onReload();
                  setPending(readDraft(key));
                  setBase(value);
                  setTitle(value.title);
                  setMetadata(value.metadata);
                  setDirty(false);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {msg("document_vault.m0462")}
            </button>
          </div>
        )}
        <form id="dv-metadata-form" onSubmit={save}>
          <h3>{msg("document_vault.m0463")}</h3>
          {base.categorySuggested && (
            <p className="dv-muted">{msg("document_vault.m0464")}</p>
          )}
          <fieldset disabled={!canEdit || busy || !!pending}>
            <label>
              {msg("administration.m0024")}
              <input
                aria-label={msg("document_vault.m0465")}
                required
                maxLength={200}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              {msg("document_vault.m0360")}
              <select
                aria-label={msg("document_vault.m0466")}
                value={metadata.category}
                onChange={(e) =>
                  change({
                    category: e.target.value as DocumentMetadata["category"],
                  })
                }
              >
                {documentCategories.map(([key, label]) => (
                  <option key={key} value={key}>
                    {labelText(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {msg("document_vault.m0467")}
              <input
                aria-label={msg("document_vault.m0468")}
                value={metadata.issuer}
                maxLength={200}
                onChange={(e) => change({ issuer: e.target.value })}
              />
            </label>
            <div className="dv-field-row">
              <label>
                {msg("document_vault.m0469")}
                <input
                  aria-label={msg("document_vault.m0469")}
                  type="date"
                  value={metadata.date}
                  onChange={(e) => change({ date: e.target.value })}
                />
              </label>
              <label>
                {msg("document_vault.m0470")}
                <input
                  aria-label={msg("document_vault.m0471")}
                  type="date"
                  value={metadata.receivedOn}
                  onChange={(e) => change({ receivedOn: e.target.value })}
                />
              </label>
            </div>
            <label>
              {msg("document_vault.m0472")}
              <input
                aria-label={msg("document_vault.m0472")}
                type="date"
                value={metadata.validUntil}
                onChange={(e) => change({ validUntil: e.target.value })}
              />
            </label>
            <label>
              {msg("document_vault.m0473")}
              <select
                aria-label={msg("document_vault.m0474")}
                multiple
                value={metadata.links.map((l) => `${l.type}:${l.id}`)}
                onChange={(e) =>
                  change({
                    links: [...e.target.selectedOptions].map((o) => {
                      const colon = o.value.indexOf(":");
                      return {
                        type: o.value.slice(0, colon) as VaultTarget["type"],
                        id: o.value.slice(colon + 1),
                      };
                    }),
                  })
                }
              >
                {targets
                  .filter((t) =>
                    base.allowedTargetKeys.includes(`${t.type}:${t.id}`),
                  )
                  .map((t) => (
                    <option
                      key={`${t.type}:${t.id}`}
                      value={`${t.type}:${t.id}`}
                    >
                      {t.type === "lot"
                        ? msg("app.m0166")
                        : t.type === "operation"
                          ? msg("document_vault.m0475")
                          : t.type === "governance"
                            ? msg("document_vault.m0476")
                            : msg("app.m0180")}{" "}
                      · {t.label}
                    </option>
                  ))}
              </select>
              <small>{msg("document_vault.m0477")}</small>
            </label>
            <label>
              {msg("document_vault.m0478")}
              <textarea
                aria-label={msg("document_vault.m0479")}
                rows={4}
                maxLength={5000}
                value={metadata.notes}
                onChange={(e) => change({ notes: e.target.value })}
              />
            </label>
          </fieldset>
        </form>
        <section className="dv-storage">
          <h3>{msg("document_vault.m0480")}</h3>
          <p>
            {msg("document_vault.m0481")}
            {audience}
            {msg("document_vault.m0482")}
            {base.fiscalYear}
          </p>
          <p className="dv-muted">
            {msg("document_vault.m0483")}
            {base.version}
            {msg("document_vault.m0484")}
          </p>
          {base.versions.map((v, i) => (
            <article className="dv-version" key={v.id}>
              <div>
                <strong>
                  {i === 0
                    ? msg("document_vault.m0485")
                    : msg("document_vault.m0486")}{" "}
                  · {v.filename}
                </strong>
                <small>
                  {date(v.created_at.slice(0, 10))} · {bytes(v.size)}
                  {msg("document_vault.m0487")}{" "}
                  <code title={v.sha256}>{v.sha256.slice(0, 12)}…</code>
                </small>
              </div>
              <button
                className="secondary dv-square"
                aria-label={msg("document_vault.m0488", { p1: v.filename })}
                onClick={() => onPreview(v)}
              >
                <Eye size={15} />
              </button>
              <a
                className="secondary dv-square"
                aria-label={msg("document_vault.m0489", { p1: v.filename })}
                href={downloadUrl(context, v.id)}
              >
                <Download size={15} />
              </a>
            </article>
          ))}
        </section>
      </div>
      <footer>
        {canEdit && (
          <>
            <button
              form="dv-metadata-form"
              className="primary"
              disabled={busy || !!pending}
            >
              {msg("common.save")}
            </button>
            <button
              className="secondary"
              disabled={dirty || busy || !!pending}
              onClick={onNewVersion}
            >
              {msg("document_vault.m0490")}
            </button>
            <span className="dv-spacer" />
            {confirm ? (
              <>
                <button
                  className="secondary danger"
                  disabled={busy || dirty}
                  onClick={() => void archive()}
                >
                  {base.metadata.trashed
                    ? msg("document_vault.m0492")
                    : msg("document_vault.m0493")}
                </button>
                <button
                  className="dv-text-button"
                  onClick={() => setConfirm(false)}
                >
                  {msg("common.cancel")}
                </button>
              </>
            ) : (
              <button
                className="dv-text-button danger"
                disabled={dirty || busy}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={14} />
                {base.metadata.trashed
                  ? msg("document_vault.m0496")
                  : msg("document_vault.m0497")}
              </button>
            )}
          </>
        )}
        {!canEdit && <p className="dv-muted">{msg("document_vault.m0498")}</p>}
      </footer>
    </dialog>
  );
}
