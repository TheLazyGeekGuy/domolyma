import { msg, labelText, localeTag } from "./i18n";
import { apiFetch } from "./session";
import { useEffect, useState } from "react";
import type { budgetSummary } from "../../../packages/domain/budget";
type Invoice = {
  id: string;
  title: string;
  supplier: string;
  invoice_date: string;
  amount_cents: number;
  paid_cents: number;
  cancelled: number;
  notes: string;
  version: number;
};
type Data = {
  budget: { amount_cents: number; notes: string; version: number } | null;
  invoices: Invoice[];
  summary: ReturnType<typeof budgetSummary>;
  totalWeight: number;
  shares: {
    lotId: string;
    number: string;
    weight: number;
    budgetCents: number | null;
    invoicedCents: number;
    forecastCents: number | null;
  }[];
};
const money = (n: number | null) =>
  n === null
    ? msg("budget_panel.m0249")
    : new Intl.NumberFormat(localeTag(), {
        style: "currency",
        currency: "EUR",
      }).format(n / 100);
const months = () => [
  msg("budget_panel.m0250"),
  msg("budget_panel.m0251"),
  msg("budget_panel.m0252"),
  msg("budget_panel.m0253"),
  msg("budget_panel.m0254"),
  msg("budget_panel.m0255"),
  msg("budget_panel.m0256"),
  msg("budget_panel.m0257"),
  msg("budget_panel.m0258"),
  msg("budget_panel.m0259"),
  msg("budget_panel.m0260"),
  msg("budget_panel.m0261"),
];
function cents(value: FormDataEntryValue | null) {
  const input = String(value || "0").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(input))
    throw new Error(msg("budget_panel.m0262"));
  const [whole, part = ""] = input.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}
export default function BudgetPanel({
  context,
  year,
  manager,
  compact = false,
  onOpen,
}: {
  context: string;
  year: number;
  manager: boolean;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const base = `/api/condominiums/${context}/budget`,
    url = base + `?year=${year}`;
  async function load() {
    const response = await apiFetch(url);
    if (!response.ok)
      throw new Error(((await response.json()) as { error: string }).error);
    setData((await response.json()) as Data);
  }
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.activeElement?.closest(".budget-editors")) return;
      try {
        const response = await apiFetch(url);
        if (!response.ok)
          throw new Error(((await response.json()) as { error: string }).error);
        const next = (await response.json()) as Data;
        if (active) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [url]);
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    kind: "budget" | "invoice",
  ) {
    event.preventDefault();
    if (!data) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload =
        kind === "budget"
          ? {
              amountCents: cents(values.get("amount")),
              notes: String(values.get("notes")),
              version: data.budget?.version || 0,
            }
          : {
              title: String(values.get("title")),
              supplier: String(values.get("supplier")),
              invoiceDate: String(values.get("date")),
              amountCents: cents(values.get("amount")),
              paidCents: cents(values.get("paid")),
              cancelled: values.has("cancelled"),
              notes: String(values.get("notes")),
              version: editing?.version || 0,
            };
      const response = await apiFetch(
        (kind === "budget"
          ? base
          : base + "/invoices" + (editing ? "/" + editing.id : "")) +
          `?year=${year}`,
        {
          method: kind === "budget" ? "PUT" : editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok)
        throw new Error(((await response.json()) as { error: string }).error);
      await load();
      if (kind === "invoice") {
        form.reset();
        setEditing(null);
      }
      setNotice(
        kind === "budget"
          ? msg("budget_panel.m0263")
          : msg("budget_panel.m0264"),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="budget-panel panel">
        <h2>{msg("budget_panel.m0266")}</h2>
        <p role={error ? "alert" : undefined}>
          {error || msg("budget_panel.m0267")}
        </p>
      </section>
    );
  const s = data.summary;
  const top = Math.max(
    1,
    s.budgetCents || 0,
    ...s.months.map((m) => m.invoicedCents),
  );
  const point = (month: number, value: number) =>
    `${44 + (month - 1) * 48},${174 - (value / top) * 144}`;
  const budgetLine = s.months
    .filter((m) => m.budgetCents !== null)
    .map((m) => point(m.month, m.budgetCents!))
    .join(" ");
  const actualLine = s.months
    .filter((m) => m.month <= s.throughMonth)
    .map((m) => point(m.month, m.invoicedCents))
    .join(" ");
  return (
    <section className={`budget-panel panel ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {msg("budget_panel.m0269")}
            {year}
          </p>
          <h2>{msg("budget_panel.m0266")}</h2>
          <p>
            {msg("budget_panel.m0270")}{" "}
            {new Date(s.asOf + "T12:00:00").toLocaleDateString(localeTag())}
            {msg("budget_panel.m0271")}
          </p>
        </div>
        {compact && (
          <button className="text-button" onClick={onOpen}>
            {msg("budget_panel.m0272")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {labelText(error)}{" "}
          <button onClick={() => load().catch((e) => setError(e.message))}>
            {msg("budget_panel.m0273")}
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {labelText(notice)}
        </p>
      )}
      <dl className="budget-numbers">
        <div>
          <dt>{msg("budget_panel.m0274")}</dt>
          <dd>{money(s.budgetCents)}</dd>
        </div>
        <div>
          <dt>{msg("budget_panel.m0275")}</dt>
          <dd>{money(s.invoicedCents)}</dd>
        </div>
        <div>
          <dt>{msg("budget_panel.m0276")}</dt>
          <dd>{money(s.paidCents)}</dd>
        </div>
        <div>
          <dt>{msg("budget_panel.m0277")}</dt>
          <dd>
            {s.forecastCents === null
              ? msg("budget_panel.m0278")
              : money(s.forecastCents)}
          </dd>
        </div>
      </dl>
      {s.budgetCents !== null || s.invoicedCents > 0 ? (
        <>
          <svg
            className="budget-chart"
            viewBox="0 0 610 208"
            role="img"
            aria-label={msg("budget_panel.m0279", { p1: year })}
          >
            <title>{msg("budget_panel.m0280")}</title>
            <desc>{msg("budget_panel.m0281")}</desc>
            {[30, 78, 126, 174].map((y) => (
              <line
                key={y}
                x1="44"
                y1={y}
                x2="572"
                y2={y}
                stroke="var(--line)"
              />
            ))}
            {budgetLine && (
              <polyline
                points={budgetLine}
                fill="none"
                stroke="var(--muted)"
                strokeDasharray="5 5"
                strokeWidth="2"
              />
            )}
            {actualLine && (
              <polyline
                points={actualLine}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
              />
            )}
            {s.months
              .filter((m) => m.month <= s.throughMonth)
              .map((m) => (
                <circle
                  key={m.month}
                  cx={44 + (m.month - 1) * 48}
                  cy={174 - (m.invoicedCents / top) * 144}
                  r="3"
                  fill="var(--accent)"
                />
              ))}
            {months().map((month, i) => (
              <text
                key={month}
                x={44 + i * 48}
                y="198"
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
              >
                {month}
              </text>
            ))}
            <text x="44" y="17" fontSize="10" fill="currentColor">
              {msg("budget_panel.m0282")}
              {money(top)}
            </text>
          </svg>
          <p className="chart-legend">
            <span>{msg("budget_panel.m0283")}</span>
            <span>{msg("budget_panel.m0284")}</span>
          </p>
        </>
      ) : (
        <p className="scope-note">
          {manager ? msg("budget_panel.m0285") : msg("budget_panel.m0286")}
        </p>
      )}
      {!data.invoices.some((i) => !i.cancelled && i.invoice_date <= s.asOf) && (
        <p className="scope-note">{msg("budget_panel.m0287")}</p>
      )}
      <p className="scope-note">
        {msg("budget_panel.m0288")} {12 - s.throughMonth}
        {msg("budget_panel.m0289")}
      </p>
      {data.shares.length > 0 && (
        <div className="table-wrap">
          <h3>{msg("budget_panel.m0290")}</h3>
          <table>
            <thead>
              <tr>
                <th>{msg("app.m0166")}</th>
                <th>{msg("budget_panel.m0291")}</th>
                <th>{msg("budget_panel.m0292")}</th>
                <th>{msg("budget_panel.m0293")}</th>
                <th>{msg("budget_panel.m0294")}</th>
              </tr>
            </thead>
            <tbody>
              {data.shares.map((l) => (
                <tr key={l.lotId}>
                  <td>{l.number}</td>
                  <td>
                    {l.weight} / {data.totalWeight}
                  </td>
                  <td>{money(l.budgetCents)}</td>
                  <td>{money(l.invoicedCents)}</td>
                  <td>{money(l.forecastCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="table-note">{msg("budget_panel.m0295")}</p>
        </div>
      )}
      {!compact && (
        <>
          <details>
            <summary>{msg("budget_panel.m0296")}</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{msg("budget_panel.m0297")}</th>
                    <th>{msg("budget_panel.m0298")}</th>
                    <th>{msg("budget_panel.m0275")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.months.map((m) => (
                    <tr key={m.month}>
                      <td>{months()[m.month - 1]}</td>
                      <td>{money(m.budgetCents)}</td>
                      <td>
                        {m.month <= s.throughMonth
                          ? money(m.invoicedCents)
                          : msg("budget_panel.m0299")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p>
            {msg("budget_panel.m0300")} <strong>{money(s.unpaidCents)}</strong>
            {s.varianceCents !== null && (
              <>
                {" "}
                {msg("budget_panel.m0301")}{" "}
                <strong>{money(s.varianceCents)}</strong>
              </>
            )}
          </p>
          {manager && (
            <div className="budget-editors">
              <form
                className="editor-form"
                key={data.budget?.version || 0}
                onSubmit={(event) => save(event, "budget")}
              >
                <h3>
                  {msg("budget_panel.m0302")}
                  {year}
                </h3>
                <label>
                  {msg("budget_panel.m0303")}
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                    defaultValue={
                      data.budget
                        ? (data.budget.amount_cents / 100).toFixed(2)
                        : ""
                    }
                  />
                </label>
                <label>
                  {msg("budget_panel.m0304")}
                  <textarea
                    name="notes"
                    maxLength={3000}
                    defaultValue={data.budget?.notes || ""}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {msg("budget_panel.m0305")}
                </button>
              </form>
              <form
                className="editor-form"
                key={editing ? editing.id + editing.version : "new"}
                onSubmit={(event) => save(event, "invoice")}
              >
                <h3>
                  {editing
                    ? msg("budget_panel.m0306")
                    : msg("budget_panel.m0307")}
                </h3>
                <label>
                  {msg("budget_panel.m0308")}
                  <input
                    name="title"
                    maxLength={200}
                    required
                    defaultValue={editing?.title}
                  />
                </label>
                <label>
                  {msg("budget_panel.m0309")}
                  <input
                    name="supplier"
                    maxLength={200}
                    required
                    defaultValue={editing?.supplier}
                  />
                </label>
                <label>
                  {msg("budget_panel.m0310")}
                  <input
                    name="date"
                    type="date"
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    required
                    defaultValue={editing?.invoice_date}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    {msg("budget_panel.m0311")}
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max="1000000"
                      step="0.01"
                      required
                      defaultValue={
                        editing ? (editing.amount_cents / 100).toFixed(2) : ""
                      }
                    />
                  </label>
                  <label>
                    {msg("budget_panel.m0312")}
                    <input
                      name="paid"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                      defaultValue={
                        editing ? (editing.paid_cents / 100).toFixed(2) : "0"
                      }
                    />
                  </label>
                </div>
                <label>
                  {msg("budget_panel.m0313")}
                  <textarea
                    name="notes"
                    maxLength={3000}
                    defaultValue={editing?.notes}
                  />
                </label>
                {editing && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="cancelled"
                      defaultChecked={!!editing.cancelled}
                    />
                    {msg("budget_panel.m0314")}
                  </label>
                )}
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    {editing
                      ? msg("budget_panel.m0315")
                      : msg("budget_panel.m0316")}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditing(null)}
                    >
                      {msg("budget_panel.m0317")}
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
          <div className="table-wrap">
            <h3>{msg("budget_panel.m0318")}</h3>
            <table>
              <thead>
                <tr>
                  <th>{msg("administration.m0035")}</th>
                  <th>{msg("budget_panel.m0319")}</th>
                  <th>{msg("budget_panel.m0293")}</th>
                  <th>{msg("budget_panel.m0320")}</th>
                  {manager && <th>{msg("administration.m0036")}</th>}
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.invoice_date}</td>
                    <td>
                      {i.title}
                      <small>
                        {i.supplier}
                        {i.cancelled
                          ? msg("budget_panel.m0321")
                          : i.invoice_date > s.asOf
                            ? msg("budget_panel.m0322")
                            : ""}
                      </small>
                    </td>
                    <td>{money(i.amount_cents)}</td>
                    <td>{money(i.paid_cents)}</td>
                    {manager && (
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setEditing(i)}
                        >
                          {msg("common.edit")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.invoices.length && <p>{msg("budget_panel.m0324")}</p>}
          </div>
        </>
      )}
    </section>
  );
}
