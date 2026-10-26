import { sourceText } from "../../packages/i18n/source";
import { z } from "zod";
import { fail, json, type AccessContext } from "./access";
import { businessDate } from "../../packages/domain/occupancy";
import {
  budgetSummary,
  indicativeShare,
  type Expense,
} from "../../packages/domain/budget";
const cents = z.number().int().min(1).max(100_000_000);
const budgetInput = z.object({
  amountCents: cents,
  notes: z.string().trim().max(3000),
  version: z.number().int().min(0),
});
const invoiceInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    supplier: z.string().trim().min(1).max(200),
    invoiceDate: z.iso.date(),
    amountCents: cents,
    paidCents: z.number().int().min(0).max(100_000_000),
    cancelled: z.boolean(),
    notes: z.string().trim().max(3000),
    version: z.number().int().min(0),
  })
  .refine((v) => v.paidCents <= v.amountCents, sourceText("metadata.m1195"))
  .refine(
    (v) => !v.cancelled || v.notes.length > 0,
    sourceText("metadata.m1196"),
  );
type Budget = {
  id: string;
  amount_cents: number;
  notes: string;
  version: number;
};
export async function handleBudget(
  request: Request,
  a: AccessContext,
  path: string,
  year: number,
) {
  if (path !== "budget" && !path.startsWith("budget/")) return null;
  if (!a.manager && !a.owner && !a.council)
    fail(403, sourceText("metadata.m1197"));
  const { db, condoId, userId } = a;
  const current = await db
    .prepare(
      "SELECT * FROM annual_budgets WHERE condominium_id=? AND fiscal_year=?",
    )
    .bind(condoId, year)
    .first<Budget>();
  if (path === "budget" && request.method === "GET") {
    const invoices = (
      await db
        .prepare(
          "SELECT * FROM expense_invoices WHERE condominium_id=? AND fiscal_year=? ORDER BY invoice_date DESC,id",
        )
        .bind(condoId, year)
        .all<Expense>()
    ).results;
    if (
      invoices.reduce((s, i) => s + i.amount_cents, 0) >
      Number.MAX_SAFE_INTEGER / 12
    )
      fail(422, sourceText("metadata.m1198"));
    const summary = budgetSummary(
      current?.amount_cents ?? null,
      invoices,
      year,
      businessDate(new Date()),
    );
    const totalWeight = a.lots.reduce((s, l) => s + l.weight, 0);
    if (!Number.isSafeInteger(totalWeight))
      fail(422, sourceText("metadata.m1199"));
    return json({
      budget: current,
      invoices,
      summary,
      totalWeight,
      shares: a.lots
        .filter((l) => a.own(l.id))
        .map((l) => ({
          lotId: l.id,
          number: l.number,
          weight: l.weight,
          budgetCents: indicativeShare(
            summary.budgetCents,
            l.weight,
            totalWeight,
          ),
          invoicedCents: indicativeShare(
            summary.invoicedCents,
            l.weight,
            totalWeight,
          ),
          forecastCents: indicativeShare(
            summary.forecastCents,
            l.weight,
            totalWeight,
          ),
        })),
    });
  }
  if (!a.manager) fail(403, sourceText("metadata.m1200"));
  const now = new Date().toISOString();
  if (path === "budget" && request.method === "PUT") {
    const input = budgetInput.parse(await request.json());
    if ((current?.version || 0) !== input.version)
      fail(409, sourceText("metadata.m1201"));
    if (current) {
      const result = await db
        .prepare(
          "UPDATE annual_budgets SET amount_cents=?,notes=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?",
        )
        .bind(
          input.amountCents,
          input.notes,
          userId,
          now,
          current.id,
          input.version,
        )
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1202"));
    } else {
      const result = await db
        .prepare(
          "INSERT INTO annual_budgets(id,condominium_id,fiscal_year,amount_cents,notes,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(condominium_id,fiscal_year) DO NOTHING",
        )
        .bind(
          crypto.randomUUID(),
          condoId,
          year,
          input.amountCents,
          input.notes,
          userId,
          now,
        )
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1203"));
    }
    return json({ saved: true });
  }
  const match = path.match(/^budget\/invoices(?:\/([^/]+))?$/);
  if (
    match &&
    ((request.method === "POST" && !match[1]) ||
      (request.method === "PATCH" && match[1]))
  ) {
    const input = invoiceInput.parse(await request.json());
    if (Number(input.invoiceDate.slice(0, 4)) !== year)
      fail(400, sourceText("metadata.m1204"));
    const id = match[1] || crypto.randomUUID();
    if (match[1]) {
      const result = await db
        .prepare(
          "UPDATE expense_invoices SET title=?,supplier=?,invoice_date=?,amount_cents=?,paid_cents=?,cancelled=?,notes=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND condominium_id=? AND fiscal_year=? AND version=?",
        )
        .bind(
          input.title,
          input.supplier,
          input.invoiceDate,
          input.amountCents,
          input.paidCents,
          Number(input.cancelled),
          input.notes,
          userId,
          now,
          id,
          condoId,
          year,
          input.version,
        )
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1205"));
    } else {
      if (input.version !== 0) fail(400, sourceText("metadata.m1206"));
      await db
        .prepare(
          "INSERT INTO expense_invoices(id,condominium_id,fiscal_year,title,supplier,invoice_date,amount_cents,paid_cents,cancelled,notes,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          condoId,
          year,
          input.title,
          input.supplier,
          input.invoiceDate,
          input.amountCents,
          input.paidCents,
          Number(input.cancelled),
          input.notes,
          userId,
          now,
        )
        .run();
    }
    return json({ id }, match[1] ? 200 : 201);
  }
  fail(404, sourceText("metadata.m1207"));
}
