import { sourceText } from "../../packages/i18n/source";
import {
  updateDocument,
  initialMetadata,
  type DocumentLink,
  type VaultTarget,
  type VaultDocument,
} from "../../packages/contracts/documents";
import { governanceRows, readableGovernance } from "./governance";
import { json, fail, type AccessContext } from "./access";
import { businessDate } from "../../packages/domain/occupancy";

async function targets(a: AccessContext) {
  const gov = await governanceRows(a);
  const records = (
    await a.db
      .prepare(
        "SELECT * FROM records WHERE condominium_id=? AND kind!='document'",
      )
      .bind(a.condoId)
      .all<any>()
  ).results.filter(a.canReadRecord);
  const all: any[] = [
    ...a.lots
      .filter((l) => a.manager || a.own(l.id) || a.occupy(l.id))
      .map((l) => ({
        type: "lot",
        id: l.id,
        label: `Lot ${l.number} · ${l.label}`,
        audience: "lot",
        lotId: l.id,
      })),
    ...a.rawOps.filter(a.canReadOp).map((o) => ({
      type: "operation",
      id: o.id,
      label: o.title,
      audience: o.audience,
      lotId: o.lot_id,
    })),
    ...gov
      .filter((g) => readableGovernance(a, g, gov))
      .map((g) => ({
        type: "governance",
        id: g.id,
        label: g.title,
        audience: g.audience,
      })),
    ...records.map((r) => ({
      type: "record",
      id: r.id,
      label: r.title,
      audience: r.audience === "shared" ? r.access_scope : r.audience,
      lotId: r.lot_id,
    })),
  ];
  return all;
}
function compatible(record: any, target: any): boolean {
  if (record.audience === "management") return true;
  return record.audience === "lot"
    ? target.audience === "lot"
      ? target.lotId === record.lot_id
      : ["residents", "owners"].includes(target.audience)
    : record.access_scope === "council"
      ? ["residents", "owners", "council"].includes(target.audience)
      : record.access_scope === "residents"
        ? target.audience === "residents"
        : ["residents", "owners"].includes(target.audience);
}
const parsed = (r: any) =>
  typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
export async function handleDocumentVault(
  request: Request,
  a: AccessContext,
  path: string,
) {
  if (path !== "document-vault" && !path.startsWith("document-vault/")) return;
  const rows = (
    await a.db
      .prepare(
        "SELECT * FROM records WHERE condominium_id=? AND kind='document' ORDER BY updated_at DESC,id",
      )
      .bind(a.condoId)
      .all<any>()
  ).results.filter(a.canReadRecord);
  if (path === "document-vault" && request.method === "GET") {
    const [versions, links] = await Promise.all([
      a.db
        .prepare(
          "SELECT v.id,v.record_id,v.filename,v.mime,v.size,v.sha256,v.created_at FROM document_versions v JOIN records r ON r.id=v.record_id WHERE r.condominium_id=? AND v.state='ready' ORDER BY v.created_at DESC,v.id DESC",
        )
        .bind(a.condoId)
        .all<any>(),
      targets(a),
    ]);
    const byRecord = new Map<string, any[]>();
    for (const v of versions.results) {
      const { record_id, ...safe } = v;
      const list = byRecord.get(record_id) || [];
      list.push(safe);
      byRecord.set(record_id, list);
    }
    const documents: VaultDocument[] = rows.map((r) => {
      const vs = byRecord.get(r.id) || [],
        p = parsed(r),
        metadata = {
          ...initialMetadata(r.title, vs[0]?.filename),
          ...p.documentMeta,
        };
      const visible = metadata.links.filter((l: DocumentLink) =>
        links.some((t) => t.type === l.type && t.id === l.id),
      );
      metadata.links = visible;
      const legacy = [
        ...(r.lot_id ? [{ type: "lot", id: r.lot_id }] : []),
        ...(r.ops_id ? [{ type: "operation", id: r.ops_id }] : []),
      ];
      return {
        id: r.id,
        title: r.title,
        fiscalYear: r.fiscal_year,
        version: r.version,
        audience: r.audience,
        accessScope: r.access_scope,
        lotId: r.lot_id,
        opsId: r.ops_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        metadata,
        categorySuggested: !p.documentMeta?.category,
        allowedTargetKeys: links
          .filter((t) => compatible(r, t))
          .map((t) => `${t.type}:${t.id}`),
        versions: vs,
        links: [...visible, ...legacy]
          .map((l) => links.find((t) => t.type === l.type && t.id === l.id))
          .filter(Boolean)
          .map(({ type, id, label }: any) => ({ type, id, label })),
      };
    });
    return json({
      documents,
      targets: links.map(({ type, id, label }) => ({ type, id, label })),
      canManage: a.manager,
      asOf: businessDate(),
    });
  }
  if (!a.manager) fail(403, sourceText("metadata.m1208"));
  const match = path.match(/^document-vault\/([^/]+)$/);
  if (!match || request.method !== "PATCH")
    fail(405, sourceText("metadata.m1209"));
  const old = rows.find((r) => r.id === match[1]);
  if (!old) fail(404, sourceText("metadata.m1210"));
  const input = updateDocument.parse(await request.json());
  if (input.version !== old.version) fail(409, sourceText("metadata.m1211"));
  const links = await targets(a);
  for (const link of input.metadata.links) {
    const target = links.find((t) => t.id === link.id && t.type === link.type);
    if (!target) fail(400, sourceText("metadata.m1212"));
    if (old.audience !== "management") {
      const allowed = compatible(old, target);
      if (!allowed) fail(400, sourceText("metadata.m1213"));
    }
  }
  const p = parsed(old);
  p.documentMeta = {
    ...input.metadata,
    title: input.title,
    originalTitle: p.documentMeta?.originalTitle || old.title,
  };
  const result = await a.db
    .prepare(
      "UPDATE records SET title=?,payload=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND condominium_id=? AND version=?",
    )
    .bind(
      input.title,
      JSON.stringify(p),
      new Date().toISOString(),
      a.userId,
      old.id,
      a.condoId,
      old.version,
    )
    .run();
  if (!result.meta.changes) fail(409, sourceText("metadata.m1214"));
  return json({ id: old.id, version: old.version + 1 });
}

export function byteRange(value: string | null, size: number) {
  if (!value) return null;
  const m = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return false;
  let start: number, end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return false;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}
