import type { GhostProfile } from "./auth";
import { businessDate } from "../../packages/domain/occupancy";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export type AccessContext = Awaited<ReturnType<typeof loadAccess>>;
export async function loadAccess(
  db: D1Database,
  condoId: string,
  userId: string,
  role: string,
  lots: any[],
  options: { administrator?: boolean; ghost?: GhostProfile | null } = {},
) {
  const today = businessDate();
  const relations = (
    await db
      .prepare(
        "SELECT r.* FROM lot_relations r JOIN lots l ON l.id=r.lot_id WHERE l.condominium_id=? AND r.valid_from<=? AND (r.valid_until IS NULL OR r.valid_until>?)",
      )
      .bind(condoId, today, today)
      .all<{
        lot_id: string;
        user_id: string;
        relation: string;
        tenure: string;
      }>()
  ).results;
  if (options.ghost) {
    const scope = JSON.parse(options.ghost.lot_ids);
    const owned: string[] = Array.isArray(scope)
      ? ["owner", "council"].includes(role)
        ? scope
        : []
      : scope.owned || [];
    const occupied: string[] = Array.isArray(scope)
      ? role === "tenant"
        ? scope
        : []
      : scope.occupied || [];
    for (const lotId of owned.filter((id) => lots.some((l) => l.id === id)))
      relations.push({
        lot_id: lotId,
        user_id: userId,
        relation: "owner",
        tenure: "owner",
      });
    for (const lotId of occupied.filter((id) => lots.some((l) => l.id === id)))
      relations.push({
        lot_id: lotId,
        user_id: userId,
        relation: "occupant",
        tenure:
          Array.isArray(scope) || scope.tenure === "tenant"
            ? "tenant"
            : "owner",
      });
  }
  const own = (id: string | null) =>
    relations.some(
      (r) => r.lot_id === id && r.user_id === userId && r.relation === "owner",
    );
  const occupy = (id: string | null) =>
    relations.some(
      (r) =>
        r.lot_id === id && r.user_id === userId && r.relation === "occupant",
    );
  const manager = role === "manager" || !!options.administrator,
    supplier = role === "supplier",
    owner = relations.some(
      (r) => r.user_id === userId && r.relation === "owner",
    ),
    resident = relations.some(
      (r) => r.user_id === userId && r.relation === "occupant",
    ),
    council = role === "council";
  const roles = [
    ...(role === "manager" ? ["manager"] : []),
    ...(owner ? ["owner"] : []),
    ...(resident ? ["resident"] : []),
    ...(relations.some((r) => r.user_id === userId && r.tenure === "tenant")
      ? ["tenant"]
      : []),
    ...(supplier ? ["supplier"] : []),
    ...(council ? ["council"] : []),
  ];
  const internal = manager || owner || resident || council;
  const rawOps = (
    await db
      .prepare(
        "SELECT * FROM ops_items WHERE condominium_id=? ORDER BY updated_at DESC,id",
      )
      .bind(condoId)
      .all<any>()
  ).results.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const canReadOp = (r: any) =>
    manager ||
    (!supplier &&
      r.kind === "access" &&
      (own(r.lot_id) || occupy(r.lot_id)) &&
      r.payload.holderId === userId) ||
    (supplier
      ? r.assigned_to === userId
      : r.kind !== "access" &&
        ((r.audience === "residents" && internal) ||
          (r.audience === "owners" && (owner || council)) ||
          (r.audience === "lot" && (own(r.lot_id) || occupy(r.lot_id)))));
  const canReadRecord = (r: any) => {
    if (manager) return true;
    if (r.kind === "document") {
      const p =
        typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      if (p?.documentMeta?.trashed) return false;
    }
    if (r.ops_id && !rawOps.some((o) => o.id === r.ops_id && canReadOp(o)))
      return false;
    if (r.audience === "management") {
      const payload =
        typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      return (
        internal &&
        !supplier &&
        r.kind === "incident" &&
        r.created_by === userId &&
        payload.confidentialReport === true
      );
    }
    if (supplier)
      return (
        r.access_scope === "assigned" &&
        rawOps.some((o) => o.id === r.ops_id && o.assigned_to === userId)
      );
    if (r.access_scope === "assigned") return false;
    const audienceAllowed =
      r.access_scope === "residents"
        ? internal
        : r.access_scope === "council"
          ? council
          : owner || council;
    if (!audienceAllowed) return false;
    if (r.audience === "lot")
      return (
        own(r.lot_id) || (r.access_scope === "residents" && occupy(r.lot_id))
      );
    return r.audience === "shared";
  };
  const safeOp = (r: any) => {
    const copy = { ...r, payload: { ...r.payload } };
    if (!manager) {
      delete copy.payload.serial;
      delete copy.payload.internalCode;
      delete copy.payload.notes;
      if (copy.payload.equipmentIds)
        copy.payload.equipmentIds = copy.payload.equipmentIds.filter(
          (id: string) => rawOps.some((o) => o.id === id && canReadOp(o)),
        );
      if (copy.payload.opensEquipmentIds)
        copy.payload.opensEquipmentIds = copy.payload.opensEquipmentIds.filter(
          (id: string) => rawOps.some((o) => o.id === id && canReadOp(o)),
        );
    }
    return copy;
  };
  const safeLot = (l: any) => {
    const { mutation_id: _mutationId, ...copy } = l;
    if (manager) return copy;
    delete copy.intercom_program;
    if (!own(l.id)) delete copy.owner_id;
    return copy;
  };
  return {
    db,
    condoId,
    userId,
    role,
    roles,
    manager,
    supplier,
    owner,
    resident,
    council,
    internal,
    lots,
    relations,
    own,
    occupy,
    rawOps,
    canReadOp,
    canReadRecord,
    safeOp,
    safeLot,
  };
}
