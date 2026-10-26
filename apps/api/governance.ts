import { sourceText } from "../../packages/i18n/source";
import {
  governanceInput,
  type GovernanceItem,
} from "../../packages/contracts/governance";
import { fail, json, type AccessContext } from "./access";
import { businessDate } from "../../packages/domain/occupancy";
import type { WorkItem } from "../../packages/domain/worklist";

export async function governanceRows(a: AccessContext) {
  const result = await a.db
    .prepare(
      "SELECT * FROM governance_items WHERE condominium_id=? ORDER BY dossier_year DESC,created_at,id",
    )
    .bind(a.condoId)
    .all<any>();
  return result.results.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload),
  })) as GovernanceItem[];
}
export function readableGovernance(
  a: AccessContext,
  row: GovernanceItem,
  rows: GovernanceItem[],
  seen = new Set<string>(),
): boolean {
  if (seen.has(row.id)) return false;
  seen.add(row.id);
  const allowed =
    a.manager ||
    (row.audience === "owners" && (a.owner || a.council)) ||
    (row.audience === "council" && a.council);
  if (!allowed) return false;
  if (!row.parent_id) return true;
  const parent = rows.find((r) => r.id === row.parent_id);
  return !!parent && readableGovernance(a, parent, rows, seen);
}
async function documents(a: AccessContext) {
  const result = await a.db
    .prepare(
      "SELECT * FROM records WHERE condominium_id=? AND kind='document' ORDER BY title,id",
    )
    .bind(a.condoId)
    .all<any>();
  return result.results.filter(a.canReadRecord);
}
function compatible(audience: string, doc: any) {
  // A collective decision never makes a private lot attachment collective.
  if (doc.audience === "lot") return false;
  if (audience === "management") return true;
  if (doc.audience === "management") return false;
  return (
    audience === "council"
      ? ["owners", "residents", "council"]
      : ["owners", "residents"]
  ).includes(doc.access_scope);
}
export async function governanceWorklist(
  a: AccessContext,
): Promise<WorkItem[]> {
  if (!(a.manager || a.owner || a.council)) return [];
  const rows = await governanceRows(a);
  return rows
    .filter(
      (r) =>
        r.kind === "action" &&
        readableGovernance(a, r, rows) &&
        !["done", "cancelled"].includes(r.payload.status),
    )
    .map((r) => ({
      id: r.id,
      targetId: r.parent_id!,
      kind: "decision_action",
      title: r.title,
      year: r.dossier_year,
      dueDate: r.payload.dueDate,
      status:
        r.payload.actionType === "execution" &&
        rows.find((d) => d.id === r.parent_id)?.payload.status !== "adopted"
          ? sourceText("worklist.decision_document")
          : r.payload.status === "waiting"
            ? "En attente"
            : r.payload.status === "in_progress"
              ? "En cours"
              : "À préparer",
      assignee:
        r.payload.responsible || sourceText("worklist.assignee_responsible"),
      ...(!r.payload.responsible
        ? { assigneeFallback: "responsible" as const }
        : {}),
      priority: "Normale",
    }));
}
export async function handleGovernance(
  request: Request,
  a: AccessContext,
  path: string,
  year: number,
) {
  if (path !== "governance" && !path.startsWith("governance/")) return;
  if (!(a.manager || a.owner || a.council))
    fail(403, sourceText("metadata.m1215"));
  const rows = await governanceRows(a);
  const docs = await documents(a);
  if (path === "governance" && request.method === "GET") {
    const visible = rows.filter(
      (r) => r.dossier_year === year && readableGovernance(a, r, rows),
    );
    const versions = (
      await a.db
        .prepare(
          "SELECT v.record_id,v.id,v.filename,v.sha256,v.created_at FROM document_versions v JOIN records r ON r.id=v.record_id WHERE r.condominium_id=? AND r.kind='document' AND v.state='ready' ORDER BY v.created_at DESC,v.id DESC",
        )
        .bind(a.condoId)
        .all<any>()
    ).results;
    const sources = docs.flatMap((doc) => {
      const ready = versions
        .filter((v) => v.record_id === doc.id)
        .map(({ record_id, ...v }) => v);
      return ready.length
        ? [
            {
              id: doc.id,
              title: doc.title,
              audiences: ["owners", "council", "management"].filter((x) =>
                compatible(x, doc),
              ),
              versions: ready,
            },
          ]
        : [];
    });
    const items = visible.map((r) => {
      const p = { ...r.payload };
      if (p.documentId && !docs.some((d) => d.id === p.documentId)) {
        delete p.sourceFilename;
        delete p.sourceSha256;
        p.documentId = null;
        p.sourceVersionId = null;
        p.sourcePage = null;
        p.sourceNote = "";
        p.sourceUnavailable = true;
      }
      if (Array.isArray(p.relatedIds))
        p.relatedIds = p.relatedIds.filter((id: string) =>
          rows.some((x) => x.id === id && readableGovernance(a, x, rows)),
        );
      return { ...r, payload: p };
    });
    return json({
      items,
      sources,
      canEdit: !!(a.manager || a.council),
      canConfirm: !!a.manager,
      asOf: businessDate(),
    });
  }
  if (!(a.manager || a.council)) fail(403, sourceText("metadata.m1216"));
  const match = path.match(/^governance\/([^/]+)$/);
  const creating = path === "governance" && request.method === "POST";
  if (!creating && !(match && request.method === "PATCH"))
    fail(405, sourceText("metadata.m1209"));
  const old = creating
    ? undefined
    : rows.find((r) => r.id === match![1] && readableGovernance(a, r, rows));
  if (!creating && !old) fail(404, sourceText("metadata.m1217"));
  if (
    !a.manager &&
    old &&
    ((old.kind === "decision" &&
      ["adopted", "rejected"].includes(old.payload.status)) ||
      (old.kind === "offer" && old.payload.status === "signed") ||
      (old.kind === "charge_key" && old.payload.status === "validated") ||
      (old.kind === "action" &&
        old.payload.actionType === "execution" &&
        old.payload.status === "done"))
  )
    fail(403, sourceText("metadata.m1218"));
  const raw = (await request.json()) as any;
  const input = governanceInput.parse(raw);
  if (input.dossierYear !== year) fail(400, sourceText("metadata.m1219"));
  if (
    old &&
    (input.kind !== old.kind ||
      (input.parentId !== old.parent_id && input.kind !== "offer") ||
      input.dossierYear !== old.dossier_year)
  )
    fail(400, sourceText("metadata.m1220"));
  if (old && (!Number.isInteger(raw.version) || raw.version !== old.version))
    fail(409, sourceText("metadata.m1221"));
  if (!a.manager && input.audience === "management")
    fail(403, sourceText("metadata.m1222"));
  const parent = input.parentId
    ? rows.find(
        (r) => r.id === input.parentId && readableGovernance(a, r, rows),
      )
    : undefined;
  const parentKind =
    input.kind === "decision" || input.kind === "requirement"
      ? "meeting"
      : input.kind === "action" || input.kind === "offer"
        ? "decision"
        : null;
  if (
    (input.kind === "decision" ||
      input.kind === "requirement" ||
      input.kind === "action") &&
    !parent
  )
    fail(400, sourceText("metadata.m1223"));
  if (
    input.parentId &&
    (!parent || parent.kind !== parentKind || parent.dossier_year !== year)
  )
    fail(400, sourceText("metadata.m1224"));
  if (!parentKind && input.parentId) fail(400, sourceText("metadata.m1225"));
  const audience = parent?.audience || input.audience;
  if (
    old &&
    audience !== old.audience &&
    rows.some((r) => r.parent_id === old.id)
  )
    fail(409, sourceText("metadata.m1226"));
  const p: Record<string, any> = { ...input.payload };
  // Pin the file version explicitly. A subsequent upload cannot change this evidence.
  if (p.documentId) {
    const doc = docs.find((d) => d.id === p.documentId);
    if (!doc || !compatible(audience, doc))
      fail(400, sourceText("metadata.m1227"));
    const requested =
      p.sourceVersionId ||
      (old && old.payload.documentId === p.documentId
        ? old.payload.sourceVersionId
        : null);
    const version = await a.db
      .prepare(
        "SELECT id,filename,sha256 FROM document_versions WHERE record_id=? AND state='ready'" +
          (requested ? " AND id=?" : " ORDER BY created_at DESC,id DESC") +
          " LIMIT 1",
      )
      .bind(...(requested ? [doc.id, requested] : [doc.id]))
      .first<any>();
    if (!version) fail(400, sourceText("metadata.m1228"));
    p.sourceVersionId = version.id;
    p.sourceFilename = version.filename;
    p.sourceSha256 = version.sha256;
  } else {
    p.sourceVersionId = null;
    p.sourcePage = null;
  }
  const requireSource = (message: string) => {
    if (!p.documentId || !p.sourcePage) fail(400, message);
  };
  if (input.kind === "requirement" && p.status === "received")
    requireSource("Une pièce reçue exige le document et sa page de référence");
  if (input.kind === "decision") {
    if (["adopted", "rejected"].includes(p.status)) {
      if (!a.manager) fail(403, sourceText("metadata.m1229"));
      requireSource("Le résultat exige le PV et sa page de référence");
      if (p.sourceType !== "minutes" || !p.decidedOn)
        fail(400, sourceText("metadata.m1230"));
    }
    for (const id of p.relatedIds) {
      const related = rows.find(
        (r) =>
          r.id === id &&
          r.kind === "decision" &&
          r.id !== old?.id &&
          readableGovernance(a, r, rows),
      );
      if (!related || related.audience !== audience)
        fail(400, sourceText("metadata.m1231"));
    }
    if (
      old?.payload.status === "adopted" &&
      p.status !== "adopted" &&
      rows.some(
        (r) =>
          r.parent_id === old.id &&
          ((r.kind === "action" &&
            r.payload.actionType === "execution" &&
            ["in_progress", "waiting", "done"].includes(r.payload.status)) ||
            (r.kind === "offer" && r.payload.status === "signed")),
      )
    )
      fail(409, sourceText("metadata.m1232"));
  }
  if (input.kind === "action") {
    if (old && p.actionType !== old.payload.actionType)
      fail(400, sourceText("metadata.m1233"));
    if (
      p.actionType === "execution" &&
      ["in_progress", "waiting", "done"].includes(p.status) &&
      parent?.payload.status !== "adopted"
    )
      fail(400, sourceText("metadata.m1234"));
    if (!a.manager && p.actionType === "execution" && p.status === "done")
      fail(403, sourceText("metadata.m1235"));
    if (p.status === "done") {
      requireSource("La clôture exige un justificatif et sa page");
      if (!p.note) fail(400, sourceText("metadata.m1236"));
      p.closedOn =
        old?.payload.status === "done" ? old.payload.closedOn : businessDate();
    }
    if (p.status === "cancelled" && !p.note)
      fail(400, sourceText("metadata.m1237"));
  }
  if (input.kind === "offer" && p.status === "signed") {
    if (!a.manager) fail(403, sourceText("metadata.m1238"));
    requireSource("Le contrat signé exige une pièce et sa page");
    if (
      p.sourceType !== "contract" ||
      !p.signedOn ||
      parent?.payload.status !== "adopted"
    )
      fail(400, sourceText("metadata.m1239"));
  }
  if (input.kind === "charge_key") {
    if (p.base && Number(p.base.replace(",", ".")) <= 0)
      fail(400, sourceText("metadata.m1240"));
    if (p.validFrom && p.validUntil && p.validUntil < p.validFrom)
      fail(400, sourceText("metadata.m1241"));
    if (p.status === "validated") {
      if (!a.manager) fail(403, sourceText("metadata.m1242"));
      requireSource("La validation exige la source et sa page");
      if (!p.base || !p.unit || !p.scope)
        fail(400, sourceText("metadata.m1243"));
    }
  }
  const now = new Date().toISOString(),
    id = old?.id || crypto.randomUUID();
  try {
    if (creating) {
      await a.db
        .prepare(
          "INSERT INTO governance_items(id,condominium_id,kind,dossier_year,parent_id,title,audience,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          a.condoId,
          input.kind,
          year,
          input.parentId,
          input.title,
          audience,
          JSON.stringify(p),
          a.userId,
          a.userId,
          now,
          now,
        )
        .run();
    } else {
      const result = await a.db
        .prepare(
          "UPDATE governance_items SET title=?,audience=?,payload=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND condominium_id=? AND version=?",
        )
        .bind(
          input.title,
          audience,
          JSON.stringify(p),
          a.userId,
          now,
          id,
          a.condoId,
          old!.version,
        )
        .run();
      if (result.meta.changes === 0) fail(409, sourceText("metadata.m1244"));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("governance_parent_changed")
    )
      fail(409, sourceText("metadata.m1245"));
    throw error;
  }
  return json({ id, version: (old?.version || 0) + 1 }, creating ? 201 : 200);
}
