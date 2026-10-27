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
  const ids = [...assignedIds];
  const names = new Map<string, string>();
  // Stay below D1's bound-parameter limit even with a large portfolio.
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const users = await a.db
      .prepare(
        `SELECT id,name FROM users WHERE id IN (${batch.map(() => "?").join(",")})`,
      )
      .bind(...batch)
      .all<{ id: string; name: string }>();
    for (const user of users.results) names.set(user.id, user.name);
  }
  for (const item of items)
    item.assignee = names.get(item.assignee) || item.assignee;
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
