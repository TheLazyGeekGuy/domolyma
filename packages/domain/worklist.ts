import { sourceText } from "../i18n/source";
export type WorkItem = {
  id: string;
  kind: "incident" | "visit" | "contract" | "equipment" | "decision_action";
  targetId?: string;
  title: string;
  year: number;
  dueDate: string;
  status: string;
  assignee: string;
  assigneeFallback?: "unassigned" | "management" | "responsible";
  priority: string;
};
export const isOpenIncident = (status: string) =>
  !["Résolu", "Clôturé"].includes(status);
export function buildWorklist(
  records: {
    id: string;
    title: string;
    fiscal_year: number;
    kind: string;
    payload: any;
  }[],
  operations: {
    id: string;
    title: string;
    fiscal_year: number;
    kind: string;
    payload: any;
    assigned_to?: string | null;
  }[],
  today: string,
): WorkItem[] {
  const horizon = new Date(Date.parse(today + "T12:00:00Z") + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const incidents: WorkItem[] = records
    .filter((r) => r.kind === "incident" && isOpenIncident(r.payload.status))
    .map((r) => ({
      id: r.id,
      kind: "incident",
      title: r.title,
      year: r.fiscal_year,
      dueDate: r.payload.dueDate || "",
      status: r.payload.status,
      assignee:
        r.payload.assignee || sourceText("worklist.assignee_unassigned"),
      ...(!r.payload.assignee
        ? { assigneeFallback: "unassigned" as const }
        : {}),
      priority: r.payload.priority || "Normale",
    }));
  const tasks: WorkItem[] = operations.flatMap((o) => {
    const p = o.payload;
    const dueDate =
      o.kind === "visit"
        ? p.scheduledOn
        : o.kind === "contract"
          ? p.endsOn
          : o.kind === "equipment"
            ? p.nextMaintenance
            : "";
    if (
      !dueDate ||
      (o.kind === "visit"
        ? ["Réalisé", "Annulé"].includes(p.status)
        : dueDate > horizon)
    )
      return [];
    if (!["visit", "contract", "equipment"].includes(o.kind)) return [];
    return [
      {
        id: o.id,
        kind: o.kind as WorkItem["kind"],
        title: o.title,
        year: o.fiscal_year,
        dueDate,
        status:
          o.kind === "visit"
            ? p.status
            : o.kind === "contract"
              ? sourceText("worklist.contract_due")
              : sourceText("worklist.maintenance_due"),
        assignee:
          p.supplier ||
          o.assigned_to ||
          sourceText("worklist.assignee_management"),
        ...(!p.supplier && !o.assigned_to
          ? { assigneeFallback: "management" as const }
          : {}),
        priority: "Normale",
      },
    ];
  });
  return [...incidents, ...tasks].sort(
    (a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
      a.title.localeCompare(b.title, "fr") ||
      a.id.localeCompare(b.id),
  );
}
