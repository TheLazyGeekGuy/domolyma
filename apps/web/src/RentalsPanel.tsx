import { msg, labelText, localeTag } from "./i18n";
import { PageActions } from "./Ergonomics";
import { apiFetch } from "./session";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, CalendarDays } from "lucide-react";
import type {
  Rental,
  RentalContact,
} from "../../../packages/contracts/rentals";
import type { Lot } from "../../../packages/contracts";
type Data = {
  lots: Lot[];
  contacts: RentalContact[];
  entries: Rental[];
  occupation: {
    lotId: string;
    planned: { days: number; daysInYear: number };
    actual: { days: number; daysInYear: number };
  }[];
};
const statusLabels: () => Record<string, string> = () => ({
  draft: msg("rentals_panel.m1005"),
  active: msg("rentals_panel.m1006"),
  ended: msg("rentals_panel.m1007"),
  cancelled: msg("operations_panel.m0863"),
  confirmed: msg("rentals_panel.m1008"),
  completed: msg("rentals_panel.m1009"),
});
const money = (n: number) =>
  new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency: "EUR",
  }).format(n / 100);
function cents(value: string) {
  const raw = value.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error(msg("rentals_panel.m1010"));
  const [euros, c = ""] = raw.split(".");
  return Number(euros) * 100 + Number(c.padEnd(2, "0"));
}
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await apiFetch(
    path,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const result = (await response.json()) as any;
  if (!response.ok)
    throw new Error(
      result.details?.[0]?.message ||
        result.error ||
        msg("rentals_panel.m1011"),
    );
  return result;
}
export default function RentalsPanel({
  context,
  year,
  readOnly = false,
}: {
  context: string;
  year: number;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<Data>(),
    [error, setError] = useState(""),
    [lotId, setLotId] = useState(""),
    [modal, setModal] = useState<string | null>(null),
    [editing, setEditing] = useState<Rental | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [month, setMonth] = useState(
      `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    );
  const dialog = useRef<HTMLDialogElement>(null),
    active = useRef({ context, year });
  active.current = { context, year };
  const base = `/api/condominiums/${context}/rentals`;
  async function load() {
    const c = context,
      y = year;
    const next = await api<Data>(`${base}?year=${year}`);
    if (active.current.context === c && active.current.year === y) {
      setData(next);
      setLotId((old) =>
        next.lots.some((l) => l.id === old) ? old : next.lots[0]?.id || "",
      );
    }
  }
  useEffect(() => {
    let live = true;
    setData(undefined);
    setModal(null);
    setMonth(`${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
    api<Data>(`${base}?year=${year}`)
      .then((d) => {
        if (live) {
          setData(d);
          setLotId(d.lots[0]?.id || "");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [context, year]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
  }, [modal]);
  useEffect(() => {
    if (readOnly) setModal(null);
  }, [readOnly]);
  const entries = data?.entries.filter((r) => r.lot_id === lotId) || [],
    occupation = data?.occupation.find((o) => o.lotId === lotId);
  const open = (kind: string, row: Rental | null = null) => {
    if (readOnly) return;
    setError("");
    setEditing(row);
    setModal(kind);
  };
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly) return;
    const f = new FormData(e.currentTarget),
      get = (k: string) => String(f.get(k) || "");
    setBusy(true);
    setError("");
    try {
      if (modal === "contact")
        await api(`${base}/contacts`, {
          name: get("name"),
          email: get("email"),
          phone: get("phone"),
          notes: get("notes"),
        });
      else
        await api(
          `${base}/entries${editing ? `/${editing.id}` : ""}`,
          {
            lotId: editing?.lot_id || lotId,
            kind: modal,
            title: get("title"),
            status: get("status"),
            startsOn: get("startsOn"),
            endsOn: get("endsOn"),
            version: editing?.version,
            payload: {
              contactIds: f.getAll("contactIds").map(String),
              rentalType: get("rentalType"),
              channel: get("channel"),
              reference: get("reference"),
              rentCents: cents(get("rent") || "0"),
              chargesCents: cents(get("charges") || "0"),
              depositCents: cents(get("deposit") || "0"),
              actualStart: get("actualStart"),
              actualEnd: get("actualEnd"),
              notes: get("notes"),
            },
          },
          editing ? "PATCH" : "POST",
        );
      setModal(null);
      await load();
      setMessage(msg("rentals_panel.m1012"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [calYear, calMonth] = month.split("-").map(Number),
    dayCount = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate(),
    startOffset =
      (new Date(Date.UTC(calYear, calMonth - 1, 1)).getUTCDay() + 6) % 7;
  if (!data)
    return <p className="loading">{error || msg("rentals_panel.m1013")}</p>;
  return (
    <>
      <p className="scope-note">{msg("rentals_panel.m1014")}</p>
      {error && !modal && (
        <p role="alert" className="error">
          {labelText(error)}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {labelText(message)}
        </p>
      )}
      <div className="rental-toolbar">
        <label>
          {msg("rentals_panel.m1015")}
          <select
            aria-label={msg("rentals_panel.m1015")}
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
          >
            {data.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {msg("app.m0221")}
                {l.number} · {l.label}
              </option>
            ))}
          </select>
        </label>
        {!readOnly && (
          <PageActions>
            <div>
              <button
                className="secondary"
                onClick={() => open("contact")}
                disabled={!data.lots.length}
              >
                <Plus size={15} />
                {msg("rentals_panel.m1016")}
              </button>
              <button
                className="secondary"
                disabled={!lotId || !data.contacts.length}
                onClick={() => open("lease")}
              >
                <Plus size={15} />
                {msg("rentals_panel.m1017")}
              </button>
              <button
                className="primary"
                disabled={!lotId || !data.contacts.length}
                onClick={() => open("booking")}
              >
                <CalendarDays size={15} />
                {msg("rentals_panel.m1018")}
              </button>
            </div>
          </PageActions>
        )}
      </div>
      {!data.lots.length ? (
        <p className="empty">{msg("rentals_panel.m1019")}</p>
      ) : (
        <>
          {!data.contacts.length && (
            <p className="table-note">{msg("rentals_panel.m1020")}</p>
          )}
          <section className="summary rental-summary">
            <div>
              <small>{msg("rentals_panel.m1022")}</small>
              <strong>{entries.length}</strong>
              <span>{msg("rentals_panel.m1023")}</span>
            </div>
            <div>
              <small>
                {msg("rentals_panel.m1024")}
                {year}
              </small>
              <strong>{occupation?.planned.days || 0}</strong>
              <span>{msg("rentals_panel.m1025")}</span>
            </div>
            <div>
              <small>
                {msg("rentals_panel.m1026")}
                {year}
              </small>
              <strong>{occupation?.actual.days || 0}</strong>
              <span>{msg("rentals_panel.m1027")}</span>
            </div>
          </section>
          <div className="rental-grid">
            <section className="panel rental-calendar">
              <div className="section-heading">
                <div>
                  <h2>{msg("rentals_panel.m1029")}</h2>
                  <p>{msg("rentals_panel.m1030")}</p>
                </div>
                <input
                  aria-label={msg("rentals_panel.m1031")}
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </div>
              <div className="calendar-grid">
                {[
                  msg("calendar.weekday.mon"),
                  msg("calendar.weekday.tue"),
                  msg("calendar.weekday.wed"),
                  msg("calendar.weekday.thu"),
                  msg("calendar.weekday.fri"),
                  msg("calendar.weekday.sat"),
                  msg("calendar.weekday.sun"),
                ].map((d) => (
                  <strong className="weekday" key={d}>
                    {d}
                  </strong>
                ))}
                {Array.from({ length: startOffset }, (_, i) => (
                  <span key={`empty${i}`} />
                ))}
                {Array.from({ length: dayCount }, (_, i) => {
                  const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                  const stays = entries.filter(
                    (r) =>
                      !["draft", "cancelled"].includes(r.status) &&
                      r.starts_on <= day &&
                      (!r.ends_on || r.ends_on > day),
                  );
                  return (
                    <div
                      className={`calendar-day ${stays.length ? "occupied" : ""}`}
                      key={day}
                      title={
                        stays.map((r) => r.title).join(", ") ||
                        msg("rentals_panel.m1039")
                      }
                    >
                      <span>{i + 1}</span>
                      {stays.length > 0 && (
                        <small>
                          {stays[0].kind === "booking"
                            ? msg("rentals_panel.m1040")
                            : msg("rentals_panel.m1041")}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="table-note">{msg("rentals_panel.m1042")}</p>
            </section>
            <section className="panel rental-contacts">
              <div className="section-heading">
                <h2>{msg("rentals_panel.m1044")}</h2>
              </div>
              {data.contacts.map((c) => (
                <div className="contact-row" key={c.id}>
                  <div>
                    <h2>{c.name}</h2>
                    <small>{c.email || msg("rentals_panel.m1045")}</small>
                    {c.phone && <small>{c.phone}</small>}
                  </div>
                </div>
              ))}
            </section>
          </div>
          <section className="panel rental-history">
            <div className="section-heading">
              <h2>{msg("rentals_panel.m1047")}</h2>
            </div>
            {entries.length ? (
              entries.map((r) => (
                <article className="ops-item" key={r.id}>
                  <div className="ops-heading">
                    <div>
                      <h2>{r.title}</h2>
                      <small className="block-muted">
                        {r.kind === "booking"
                          ? msg("rentals_panel.m1048")
                          : msg("rentals_panel.m1041")}{" "}
                        · {statusLabels()[r.status]}
                        {msg("rentals_panel.m1049")}
                        {r.version}
                      </small>
                    </div>
                    {!readOnly && (
                      <button
                        className="text-button"
                        onClick={() => open(r.kind, r)}
                      >
                        <Pencil size={14} />
                        {msg("common.edit")}
                      </button>
                    )}
                  </div>
                  <p>
                    {r.starts_on} → {r.ends_on || msg("rentals_panel.m1050")} ·{" "}
                    {r.payload.contactIds
                      .map(
                        (id) =>
                          data.contacts.find((c) => c.id === id)?.name ||
                          msg("rentals_panel.m1051"),
                      )
                      .join(", ")}
                  </p>
                  <p>
                    {r.kind === "booking"
                      ? msg("rentals_panel.m1052", { p1: r.payload.channel })
                      : msg("rentals_panel.m1053")}{" "}
                    : {money(r.payload.rentCents)}
                    {msg("rentals_panel.m1054")} {money(r.payload.chargesCents)}
                    {msg("rentals_panel.m1055")} {money(r.payload.depositCents)}
                  </p>
                  {r.payload.actualStart && (
                    <p>
                      {msg("rentals_panel.m1056")}
                      {r.payload.actualStart} →{" "}
                      {r.payload.actualEnd || msg("rentals_panel.m1057")}
                    </p>
                  )}
                  <p className="multiline">{r.payload.notes}</p>
                </article>
              ))
            ) : (
              <p className="empty">{msg("rentals_panel.m1058")}</p>
            )}
          </section>
          <p className="scope-note">{msg("rentals_panel.m1059")}</p>
        </>
      )}
      {modal && (
        <dialog
          ref={dialog}
          className="dialog"
          aria-labelledby="rental-dialog-title"
          onCancel={() => setModal(null)}
        >
          <form onSubmit={save}>
            <div className="dialog-heading">
              <h2 id="rental-dialog-title">
                {modal === "contact"
                  ? msg("rentals_panel.m1060")
                  : modal === "lease"
                    ? msg("rentals_panel.m1061")
                    : msg("rentals_panel.m1062")}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label={msg("common.close")}
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {labelText(error)}
              </p>
            )}
            <fieldset disabled={busy || readOnly}>
              {modal === "contact" ? (
                <>
                  <label>
                    {msg("rentals_panel.m1063")}
                    <input name="name" maxLength={200} required />
                  </label>
                  <label>
                    {msg("rentals_panel.m1064")}
                    <input name="email" type="email" />
                  </label>
                  <label>
                    {msg("operations_panel.m1002")}
                    <input name="phone" maxLength={50} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {msg("app.m0195")}
                    <input
                      name="title"
                      maxLength={200}
                      required
                      defaultValue={editing?.title}
                    />
                  </label>
                  <label>
                    {msg("rentals_panel.m1065")}
                    <select
                      multiple
                      name="contactIds"
                      required
                      defaultValue={editing?.payload.contactIds || []}
                      size={Math.min(4, Math.max(2, data.contacts.length))}
                    >
                      {data.contacts.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      {msg("administration.m0027")}
                      <select
                        name="status"
                        defaultValue={editing?.status || "draft"}
                      >
                        {(modal === "lease"
                          ? ["draft", "active", "ended", "cancelled"]
                          : ["draft", "confirmed", "completed", "cancelled"]
                        ).map((s) => (
                          <option key={s} value={s}>
                            {labelText(statusLabels()[s])}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {msg("rentals_panel.m1066")}
                      <select
                        name="rentalType"
                        defaultValue={
                          editing?.payload.rentalType ||
                          (modal === "booking" ? "seasonal" : "unfurnished")
                        }
                      >
                        <option value="unfurnished">
                          {msg("rentals_panel.m1067")}
                        </option>
                        <option value="furnished">
                          {msg("rentals_panel.m1068")}
                        </option>
                        <option value="parking">
                          {msg("rentals_panel.m1069")}
                        </option>
                        <option value="commercial">
                          {msg("rentals_panel.m1070")}
                        </option>
                        <option value="seasonal">
                          {msg("rentals_panel.m1071")}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      {msg("rentals_panel.m1072")}
                      <input
                        name="startsOn"
                        type="date"
                        required
                        defaultValue={editing?.starts_on}
                      />
                    </label>
                    <label>
                      {msg("rentals_panel.m1073")}
                      <input
                        name="endsOn"
                        type="date"
                        required={modal === "booking"}
                        defaultValue={editing?.ends_on || ""}
                      />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      {msg("rentals_panel.m1074")}
                      <input
                        type="date"
                        name="actualStart"
                        defaultValue={editing?.payload.actualStart}
                      />
                    </label>
                    <label>
                      {msg("rentals_panel.m1075")}
                      <input
                        type="date"
                        name="actualEnd"
                        defaultValue={editing?.payload.actualEnd}
                      />
                    </label>
                  </div>
                  <label>
                    {modal === "booking"
                      ? msg("rentals_panel.m1076")
                      : msg("rentals_panel.m1077")}
                    <input
                      inputMode="decimal"
                      name="rent"
                      required
                      defaultValue={(
                        (editing?.payload.rentCents || 0) / 100
                      ).toFixed(2)}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      {msg("rentals_panel.m1078")}
                      <input
                        name="charges"
                        inputMode="decimal"
                        defaultValue={(
                          (editing?.payload.chargesCents || 0) / 100
                        ).toFixed(2)}
                      />
                    </label>
                    <label>
                      {msg("rentals_panel.m1079")}
                      <input
                        name="deposit"
                        inputMode="decimal"
                        defaultValue={(
                          (editing?.payload.depositCents || 0) / 100
                        ).toFixed(2)}
                      />
                    </label>
                  </div>
                  <label>
                    {msg("rentals_panel.m1080")}
                    <select
                      name="channel"
                      defaultValue={editing?.payload.channel || "Direct"}
                    >
                      {["Direct", "Airbnb", "Booking.com", "Autre"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {msg("rentals_panel.m1084")}
                    <input
                      name="reference"
                      maxLength={200}
                      defaultValue={editing?.payload.reference}
                    />
                  </label>
                </>
              )}
              <label>
                {msg("rentals_panel.m1085")}
                <textarea
                  name="notes"
                  maxLength={modal === "contact" ? 3000 : 5000}
                  defaultValue={editing?.payload.notes}
                />
              </label>
            </fieldset>
            <div className="dialog-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                {msg("common.close")}
              </button>
              <button className="primary" disabled={busy || readOnly}>
                {msg("common.save")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
