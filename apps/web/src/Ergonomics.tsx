import { msg } from "./i18n";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ElementType,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, CircleHelp, RefreshCw } from "lucide-react";
import { searchText } from "../../../packages/domain/ui-values";
import "./ergonomics.css";

type Frame = {
  slot: HTMLDivElement | null;
  setSlot: (node: HTMLDivElement | null) => void;
};
const FrameContext = createContext<Frame | null>(null);
export function PageWorkspace({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <FrameContext.Provider value={value}>
      <section className="erg-workspace">{children}</section>
    </FrameContext.Provider>
  );
}
export function PageActions({ children }: { children: ReactNode }) {
  const frame = useContext(FrameContext);
  return frame ? (
    frame.slot ? (
      createPortal(children, frame.slot)
    ) : null
  ) : (
    <div className="erg-actions">{children}</div>
  );
}
const help: () => Record<string, string[]> = () => ({
  overview: [msg("ergonomics.m0499"), msg("ergonomics.m0500")],
  tasks: [msg("ergonomics.m0501"), msg("ergonomics.m0502")],
  portfolio: [msg("ergonomics.m0503"), msg("ergonomics.m0504")],
  lots: [msg("ergonomics.m0505"), msg("ergonomics.m0506")],
  governance: [
    msg("ergonomics.m0507"),
    msg("ergonomics.m0508"),
    msg("ergonomics.m0509"),
  ],
  documents: [msg("ergonomics.m0510"), msg("ergonomics.m0511")],
  rentals: [msg("ergonomics.m0512"), msg("ergonomics.m0513")],
  incidents: [msg("ergonomics.m0514"), msg("ergonomics.m0515")],
  finances: [msg("ergonomics.m0516"), msg("ergonomics.m0517")],
  history: [msg("ergonomics.m0518")],
  members: [msg("ergonomics.m0519")],
});
export function PageHeaderActions({
  page,
  children,
  onRefresh,
}: {
  page: string;
  children: ReactNode;
  onRefresh: () => void;
}) {
  const frame = useContext(FrameContext),
    [open, setOpen] = useState(false),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      return () => {
        dialog.current?.close();
        trigger.current?.focus();
      };
    }
  }, [open]);
  return (
    <div className="erg-page-actions">
      {children}
      <div className="erg-action-slot" ref={frame?.setSlot} />
      <button
        className="secondary erg-refresh"
        onClick={onRefresh}
        aria-label={msg("ergonomics.m0521")}
        title={msg("ergonomics.m0522")}
      >
        <RefreshCw size={16} />
      </button>
      <button ref={trigger} className="erg-help" onClick={() => setOpen(true)}>
        <CircleHelp size={17} />
        {msg("ergonomics.m0523")}
      </button>
      {open && (
        <dialog
          className="erg-help-dialog"
          ref={dialog}
          aria-labelledby="erg-help-title"
          onCancel={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
        >
          <header>
            <h2 id="erg-help-title">{msg("ergonomics.m0524")}</h2>
            <button
              className="secondary"
              onClick={() => setOpen(false)}
              aria-label={msg("ergonomics.m0525")}
            >
              <X size={18} />
            </button>
          </header>
          {(
            help()[page] || [msg("ergonomics.m0526"), msg("ergonomics.m0527")]
          ).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </dialog>
      )}
    </div>
  );
}
const groups = () =>
  [
    [
      "space",
      msg("ergonomics.m0528"),
      ["overview", "tasks", "portfolio", "rentals"],
    ],
    [
      "residence",
      msg("app.m0096"),
      [
        "lots",
        "incidents",
        "event",
        "equipment",
        "contract",
        "visit",
        "access",
        "contacts",
      ],
    ],
    [
      "management",
      msg("ergonomics.m0529"),
      ["governance", "assemblies", "documents", "finances"],
    ],
    ["administration", msg("app.m0084"), ["members", "history"]],
  ] as const;
export function WorkspaceNavigation({
  items,
  page,
  onNavigate,
  preferenceKey,
  incidentCount,
}: {
  items: ReadonlyArray<readonly [string, string, ElementType]>;
  page: string;
  onNavigate: (page: string) => void;
  preferenceKey: string;
  incidentCount: number;
}) {
  const [query, setQuery] = useState(""),
    [opened, setOpened] = useState<string[]>(() => {
      try {
        const v = JSON.parse(sessionStorage.getItem(preferenceKey) || "null");
        if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
      } catch {}
      return groups().map((g) => g[0]);
    });
  const input = useRef<HTMLInputElement>(null),
    results = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    const group = groups().find((g) =>
      (g[2] as readonly string[]).includes(page),
    );
    if (group)
      setOpened((old) => (old.includes(group[0]) ? old : [...old, group[0]]));
  }, [page]);
  useEffect(() => {
    try {
      sessionStorage.setItem(preferenceKey, JSON.stringify(opened));
    } catch {}
  }, [opened, preferenceKey]);
  const filtered = items.filter(([, label]) =>
    searchText(label).includes(searchText(query.trim())),
  );
  const navigate = (target: string) => {
    setQuery("");
    onNavigate(target);
  };
  const button = ([target, label, Icon]: ReadonlyArray<any>) => (
    <button
      key={target}
      aria-current={page === target ? "page" : undefined}
      className={page === target ? "nav-item active" : "nav-item"}
      onClick={() => navigate(target)}
    >
      <Icon size={18} />
      <span>{label}</span>
      {target === "incidents" && incidentCount > 0 && (
        <span className="count">{incidentCount}</span>
      )}
    </button>
  );
  return (
    <nav aria-label={msg("ergonomics.m0531")} className="erg-navigation">
      <div className="erg-nav-search">
        <Search size={15} />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={msg("ergonomics.m0532")}
          aria-label={msg("ergonomics.m0533")}
          aria-controls={query.trim() ? id : undefined}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "ArrowDown") {
              e.preventDefault();
              results.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
            }
          }}
        />
      </div>
      {query.trim() ? (
        <div
          ref={results}
          id={id}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              input.current?.focus();
            }
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              const buttons = [
                  ...results.current!.querySelectorAll<HTMLButtonElement>(
                    "button",
                  ),
                ],
                index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
              if (e.key === "ArrowUp" && index === 0) input.current?.focus();
              else
                buttons[
                  Math.max(
                    0,
                    Math.min(
                      buttons.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                ]?.focus();
            }
          }}
        >
          <p role="status" className="erg-nav-count">
            {filtered.length}
            {msg("ergonomics.m0534")}
          </p>
          {filtered.map(button)}
        </div>
      ) : (
        groups().map(([key, label, pages]) => {
          const visible = items.filter(([target]) =>
            (pages as readonly string[]).includes(target),
          );
          if (!visible.length) return null;
          const expanded = opened.includes(key);
          return (
            <section key={key} className="erg-nav-group">
              <h2>
                <button
                  aria-expanded={expanded}
                  aria-controls={`${id}-${key}`}
                  onClick={() =>
                    setOpened((old) =>
                      old.includes(key)
                        ? old.filter((x) => x !== key)
                        : [...old, key],
                    )
                  }
                >
                  <span>{label}</span>
                  <ChevronDown size={14} />
                </button>
              </h2>
              <div id={`${id}-${key}`} hidden={!expanded}>
                {visible.map(button)}
              </div>
            </section>
          );
        })
      )}
    </nav>
  );
}

export type FilterChip = { key: string; label: string; remove: () => void };
export function FilterWorkspace({
  id,
  title = msg("ergonomics.m0535"),
  active,
  onReset,
  count,
  total,
  noun = msg("ergonomics.m0536"),
  scope,
  rail,
  toolbar,
  children,
}: {
  id: string;
  title?: string;
  active: FilterChip[];
  onReset: () => void;
  count: number;
  total: number;
  noun?: string;
  scope: string;
  rail: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    modal = useRef<HTMLDialogElement>(null),
    [narrow, setNarrow] = useState(false),
    [dialog, setDialog] = useState(false),
    [open, setOpen] = useState(() => {
      try {
        return sessionStorage.getItem(`domolyma-rail:${id}`) !== "closed";
      } catch {
        return true;
      }
    }),
    uid = useId();
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setNarrow(entry.contentRect.width < 920),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (dialog && narrow) {
      modal.current?.showModal();
      return () => {
        modal.current?.close();
      };
    }
    if (!narrow) setDialog(false);
  }, [dialog, narrow]);
  const close = () => {
    if (narrow) {
      modal.current?.close();
      setDialog(false);
    } else {
      setOpen(false);
      try {
        sessionStorage.setItem(`domolyma-rail:${id}`, "closed");
      } catch {}
    }
    button.current?.focus();
  };
  const panel = (
    <aside className="erg-filter-rail">
      <header>
        <h2 id={`${uid}-title`}>{title}</h2>
        <button
          className="secondary"
          onClick={close}
          aria-label={msg("document_vault.m0356")}
        >
          <X size={16} />
        </button>
      </header>
      {rail}
      <button className="secondary" disabled={!active.length} onClick={onReset}>
        {msg("document_vault.m0373")}
      </button>
      {narrow && (
        <button className="primary" onClick={close}>
          {msg("document_vault.m0374")}
          {count}
          {msg("document_vault.m0375")}
        </button>
      )}
    </aside>
  );
  return (
    <div className="erg-filter-layout" ref={host}>
      <div className="erg-filter-scope" aria-label={msg("ergonomics.m0537")}>
        <strong>{msg("document_vault.m0393")}</strong>
        <span>{scope}</span>
        {active.map((f) => (
          <span className="erg-filter-chip" key={f.key}>
            {f.label}
            <button
              aria-label={msg("document_vault.m0394", { p1: f.label })}
              onClick={f.remove}
            >
              {msg("document_vault.m0395")}
            </button>
          </span>
        ))}
        {active.length > 0 && (
          <button className="erg-text-button" onClick={onReset}>
            {msg("document_vault.m0396")}
          </button>
        )}
      </div>
      <div className={`erg-filter-body ${!narrow && open ? "with-rail" : ""}`}>
        {!narrow && open && panel}
        <section className="erg-filter-results">
          <div className="erg-results-bar">
            <div>
              <button
                ref={button}
                className="secondary"
                aria-expanded={narrow ? dialog : open}
                onClick={() => {
                  if (narrow) setDialog(true);
                  else {
                    setOpen(!open);
                    try {
                      sessionStorage.setItem(
                        `domolyma-rail:${id}`,
                        open ? "closed" : "open",
                      );
                    } catch {}
                  }
                }}
              >
                {msg("document_vault.m0400")}
                {active.length}
              </button>
              <strong role="status">
                {count} {noun}
                {count !== total && msg("ergonomics.m0539", { p1: total })}
              </strong>
            </div>
            {toolbar}
          </div>
          {count === 0 && total > 0 ? (
            <div className="erg-filter-empty" role="status">
              <strong>{msg("ergonomics.m0540")}</strong>
              <span>
                {total} {noun}
                {msg("ergonomics.m0541")}
              </span>
              <button className="secondary" onClick={onReset}>
                {msg("document_vault.m0373")}
              </button>
            </div>
          ) : (
            children
          )}
        </section>
      </div>
      {dialog && narrow && (
        <dialog
          ref={modal}
          className="erg-filter-dialog"
          aria-labelledby={`${uid}-title`}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          {panel}
        </dialog>
      )}
    </div>
  );
}
