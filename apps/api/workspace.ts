import { json, type AccessContext } from "./access";
import { governanceWorklist } from "./governance";
import { businessDate } from "../../packages/domain/occupancy";
import { buildWorklist } from "../../packages/domain/worklist";

export async function worklist(a: AccessContext) {
  const rows = (
    await a.db
      .prepare(
        "SELECT * FROM records WHERE condominium_id=? AND kind='incident'",
      )
      .bind(a.condoId)
      .all<any>()
  ).results;
  const records = rows
    .filter(a.canReadRecord)
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const operations = a.rawOps.filter(a.canReadOp).map(a.safeOp);
  const today = businessDate();
  const items = buildWorklist(records, operations, today);
  const assignedIds = new Set(
    operations.map((o) => o.assigned_to).filter(Boolean),
  );
  for (const id of assignedIds) {
    const user = await a.db
      .prepare("SELECT name FROM users WHERE id=?")
      .bind(id)
      .first<{ name: string }>();
    if (user)
      for (const item of items)
        if (item.assignee === id) item.assignee = user.name;
  }
  items.push(...(await governanceWorklist(a)));
  items.sort(
    (x, y) =>
      (x.dueDate || "9999").localeCompare(y.dueDate || "9999") ||
      x.title.localeCompare(y.title, "fr") ||
      x.id.localeCompare(y.id),
  );
  return { asOf: today, items };
}
export async function handleWorkspace(
  request: Request,
  a: AccessContext,
  path: string,
) {
  if (path !== "worklist" || request.method !== "GET") return;
  return json(await worklist(a));
}
