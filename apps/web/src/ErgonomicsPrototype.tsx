import { msg, labelText, useLocale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Clock3,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Plus,
  X,
} from "lucide-react";
import {
  FilterWorkspace,
  PageActions,
  PageHeaderActions,
  PageWorkspace,
  WorkspaceNavigation,
} from "./Ergonomics";
const items = () =>
  [
    ["overview", msg("app.m0044"), LayoutDashboard],
    ["tasks", msg("app.m0045"), Clock3],
    ["contract", msg("app.m0052"), FileText],
    ["documents", msg("app.m0056"), FolderOpen],
    ["governance", msg("app.m0057"), Landmark],
  ] as const;
const initial = () => [
  {
    id: 1,
    title: msg("ergonomics_prototype.m0542"),
    supplier: msg("ergonomics_prototype.m0543"),
    date: "2026-10-15",
    late: true,
  },
  {
    id: 2,
    title: msg("ergonomics_prototype.m0544"),
    supplier: msg("ergonomics_prototype.m0545"),
    date: "2026-11-12",
    late: false,
  },
  {
    id: 3,
    title: msg("ergonomics_prototype.m0546"),
    supplier: msg("ergonomics_prototype.m0547"),
    date: "2026-12-01",
    late: false,
  },
];
export default function ErgonomicsPrototype() {
  useLocale();
  const [page, setPage] = useState("contract"),
    [query, setQuery] = useState(""),
    [late, setLate] = useState(false),
    [rows, setRows] = useState(initial()),
    [selected, setSelected] = useState<
      ReturnType<typeof initial>[number] | null
    >(null),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    before = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected) {
      before.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
      return () => {
        dialog.current?.close();
        before.current?.focus();
      };
    }
  }, [selected]);
  const title = items().find((i) => i[0] === page)?.[1] || msg("app.m0052"),
    visible = rows.filter(
      (r) =>
        (!late || r.late) &&
        `${r.title} ${r.supplier}`
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr")),
    );
  return (
    <>
      <div className="erg-prototype-bar">
        <strong>{msg("ergonomics_prototype.m0548")}</strong>
        <span>{msg("ergonomics_prototype.m0549")}</span>
        <a href="/#/overview">{msg("ergonomics_prototype.m0550")}</a>
      </div>
      <div className="app erg-prototype">
        <aside className="sidebar">
          <div className="brand">
            <Building2 />
            <strong>{msg("app.m0085")}</strong>
          </div>
          <p>{msg("ergonomics_prototype.m0552")}</p>
          <WorkspaceNavigation
            items={items()}
            page={page}
            onNavigate={(p) => {
              setPage(p);
              setQuery("");
              setLate(false);
            }}
            preferenceKey="domolyma-prototype-navigation"
            incidentCount={0}
          />
        </aside>
        <div className="workspace">
          <div className="workspace-topbar">
            {msg("ergonomics_prototype.m0553")}
          </div>
          <main>
            <PageWorkspace key={page}>
              <div className="page-heading erg-page-heading">
                <div>
                  <h1>{title}</h1>
                  <p className="subheading">
                    {msg("ergonomics_prototype.m0554")}
                  </p>
                </div>
                <PageHeaderActions
                  page={page}
                  onRefresh={() =>
                    setNotice("La liste de démonstration est à jour.")
                  }
                >
                  {null}
                </PageHeaderActions>
              </div>
              <p className="erg-page-scope">
                {msg("ergonomics_prototype.m0556")}
              </p>
              <PageActions>
                <button
                  className="primary"
                  onClick={() =>
                    setSelected({
                      id: 0,
                      title: "",
                      supplier: "",
                      date: "2026-12-15",
                      late: false,
                    })
                  }
                >
                  <Plus size={16} />
                  {msg("ergonomics_prototype.m0557")}
                </button>
              </PageActions>
              {notice && (
                <p role="status" className="notice">
                  {labelText(notice)}
                </p>
              )}
              <FilterWorkspace
                id="prototype"
                count={visible.length}
                total={rows.length}
                scope={msg("ergonomics_prototype.m0558")}
                active={[
                  ...(query
                    ? [
                        {
                          key: "query",
                          label: msg("app.m0155", { p1: query }),
                          remove: () => setQuery(""),
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
                  setQuery("");
                  setLate(false);
                }}
                rail={
                  <>
                    <label>
                      {msg("common.search")}
                      <input
                        type="search"
                        aria-label={msg("ergonomics_prototype.m0560")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={msg("ergonomics_prototype.m0561")}
                      />
                    </label>
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
                <table className="erg-prototype-table">
                  <thead>
                    <tr>
                      <th>{msg("app.m0180")}</th>
                      <th>{msg("ergonomics_prototype.m0562")}</th>
                      <th>{msg("app.m0204")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button onClick={() => setSelected(r)}>
                            {r.title}
                          </button>
                        </td>
                        <td>{r.supplier}</td>
                        <td>
                          <span className="erg-prototype-state">
                            {r.late ? msg("ergonomics_prototype.m0563") : ""}
                            {r.date}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </FilterWorkspace>
            </PageWorkspace>
          </main>
        </div>
      </div>
      {selected && (
        <dialog
          ref={dialog}
          className="erg-prototype-details"
          aria-labelledby="prototype-dialog-title"
          onCancel={(e) => {
            e.preventDefault();
            setSelected(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const value = {
                ...selected,
                id: selected.id || Date.now(),
                title: String(f.get("title")),
                supplier: String(f.get("supplier")),
                date: String(f.get("date")),
              };
              setRows((old) =>
                selected.id
                  ? old.map((r) => (r.id === selected.id ? value : r))
                  : [value, ...old],
              );
              setSelected(null);
              setNotice(
                "Dossier enregistré dans cette maquette. Aucune donnée réelle n’a été modifiée.",
              );
            }}
          >
            <header>
              <h2 id="prototype-dialog-title">
                {selected.id
                  ? msg("ergonomics_prototype.m0565")
                  : msg("ergonomics_prototype.m0557")}
              </h2>
              <button
                type="button"
                className="secondary"
                aria-label={msg("ergonomics_prototype.m0566")}
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </header>
            <p>{msg("ergonomics_prototype.m0567")}</p>
            <label>
              {msg("ergonomics_prototype.m0568")}
              <input name="title" required defaultValue={selected.title} />
            </label>
            <label>
              {msg("ergonomics_prototype.m0562")}
              <input
                name="supplier"
                required
                defaultValue={selected.supplier}
              />
            </label>
            <label>
              {msg("app.m0204")}
              <input
                type="date"
                name="date"
                required
                defaultValue={selected.date}
              />
            </label>
            <footer>
              <button
                className="secondary"
                type="button"
                onClick={() => setSelected(null)}
              >
                {msg("common.close")}
              </button>
              <button className="primary">{msg("common.save")}</button>
            </footer>
          </form>
        </dialog>
      )}
    </>
  );
}
