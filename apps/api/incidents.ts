import { sourceText } from "../../packages/i18n/source";
import type { z } from "zod";
import { incidentPayload } from "../../packages/contracts";
import { followupSchema } from "../../packages/contracts/incidents";
import { businessDate } from "../../packages/domain/occupancy";
import { fail, json, type AccessContext } from "./access";
export const confidentialIncident = (p: {
  eventNature?: string;
  domain?: string;
}) => p.eventNature === "Accident corporel" || p.domain === "Sécurité";
export async function validateClassification(
  a: AccessContext,
  payload: z.infer<typeof incidentPayload>,
  equipmentId: string | null,
  year: number,
  audience: string,
  lotId: string | null,
  scope: string,
  old?: any,
) {
  if (!payload.eventNature) {
    if (old?.payload.eventNature) fail(400, sourceText("metadata.m1246"));
    return;
  }
  if (
    old?.payload.eventNature &&
    old.payload.eventNature !== payload.eventNature
  )
    fail(400, sourceText("metadata.m1247"));
  if (
    payload.relatedIncidentId !== undefined &&
    old &&
    payload.relatedIncidentId !== (old.payload.relatedIncidentId || null)
  )
    fail(400, sourceText("metadata.m1248"));
  const occurred = new Date(payload.occurredAt!);
  if (occurred.getTime() > Date.now() + 300_000)
    fail(400, sourceText("metadata.m1249"));
  if (Number(businessDate(occurred).slice(0, 4)) !== year)
    fail(400, sourceText("metadata.m1250"));
  if (payload.equipmentMode === "catalogue") {
    if (
      !equipmentId ||
      !a.rawOps.some(
        (o) => o.id === equipmentId && o.kind === "equipment" && a.canReadOp(o),
      )
    )
      fail(400, sourceText("metadata.m1251"));
  } else if (equipmentId) fail(400, sourceText("metadata.m1252"));
  if (payload.relatedIncidentId) {
    const source = await a.db
      .prepare(
        "SELECT * FROM records WHERE id=? AND condominium_id=? AND kind='incident'",
      )
      .bind(payload.relatedIncidentId, a.condoId)
      .first<any>();
    if (!source || !a.canReadRecord(source) || source.id === old?.id)
      fail(400, sourceText("metadata.m1253"));
    if (
      audience !== "management" &&
      (source.audience !== audience ||
        source.lot_id !== lotId ||
        source.access_scope !== scope)
    )
      fail(400, sourceText("metadata.m1254"));
    const p = JSON.parse(source.payload);
    if (
      payload.eventNature === "Accident corporel" &&
      p.eventNature === "Accident corporel"
    )
      fail(400, sourceText("metadata.m1255"));
    if (p.occurredAt && new Date(p.occurredAt).getTime() > occurred.getTime())
      fail(400, sourceText("metadata.m1256"));
  }
}
export function initialFollowup(a: AccessContext, id: string, now: string) {
  return a.db
    .prepare(
      "INSERT INTO incident_followups(record_id,condominium_id,payload,updated_by,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND condominium_id=? AND json_extract(payload,'$.eventNature')='Accident corporel') ON CONFLICT(record_id) DO NOTHING",
    )
    .bind(
      id,
      a.condoId,
      JSON.stringify({
        secured: false,
        managerInformed: false,
        evidenceCollected: false,
        insuranceReviewed: false,
        insuranceStatus: "À évaluer",
        insuranceReference: "",
        declaredOn: "",
        nextActionOn: "",
        notes: "",
      }),
      a.userId,
      now,
      id,
      a.condoId,
    );
}
export async function handleIncidentFollowup(
  request: Request,
  a: AccessContext,
  path: string,
) {
  const match = path.match(/^records\/([^/]+)\/followup$/);
  if (!match) return null;
  if (!a.manager) fail(403, sourceText("metadata.m1257"));
  const record = await a.db
    .prepare(
      "SELECT * FROM records WHERE id=? AND condominium_id=? AND kind='incident'",
    )
    .bind(match[1], a.condoId)
    .first<any>();
  if (!record || JSON.parse(record.payload).eventNature !== "Accident corporel")
    fail(404, sourceText("metadata.m1258"));
  const row = await a.db
    .prepare(
      "SELECT payload,version FROM incident_followups WHERE record_id=? AND condominium_id=?",
    )
    .bind(record.id, a.condoId)
    .first<{ payload: string; version: number }>();
  if (!row) fail(404, sourceText("metadata.m1259"));
  if (request.method === "GET")
    return json({ ...JSON.parse(row.payload), version: row.version });
  if (request.method === "PUT") {
    const input = followupSchema.parse(await request.json());
    const { version, ...payload } = input;
    if (payload.declaredOn && payload.declaredOn > businessDate(new Date()))
      fail(400, sourceText("metadata.m1260"));
    const occurredAt = JSON.parse(record.payload).occurredAt;
    if (
      payload.declaredOn &&
      occurredAt &&
      payload.declaredOn < businessDate(new Date(occurredAt))
    )
      fail(400, sourceText("metadata.m1261"));
    const result = await a.db
      .prepare(
        "UPDATE incident_followups SET payload=?,version=version+1,updated_by=?,updated_at=? WHERE record_id=? AND condominium_id=? AND version=?",
      )
      .bind(
        JSON.stringify(payload),
        a.userId,
        new Date().toISOString(),
        record.id,
        a.condoId,
        version,
      )
      .run();
    if (!result.meta.changes) fail(409, sourceText("metadata.m1262"));
    return json({ saved: true });
  }
  fail(404, sourceText("metadata.m1207"));
}
