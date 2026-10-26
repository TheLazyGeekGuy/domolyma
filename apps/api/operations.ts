import { sourceText } from "../../packages/i18n/source";
import { z } from "zod";
import {
  operationSchema,
  lotSchema,
  buildingSchema,
  relationSchema,
} from "../../packages/contracts/operations";
import { fail, json, type AccessContext } from "./access";
import { businessDate } from "../../packages/domain/occupancy";
type Env = { DB: D1Database };
export async function operationsSnapshot(a: AccessContext, year: number) {
  const { db, condoId, userId, manager } = a;
  const buildings = (
    await db
      .prepare("SELECT * FROM buildings WHERE condominium_id=? ORDER BY name")
      .bind(condoId)
      .all<any>()
  ).results.map((b) => {
    if (manager) return b;
    const { intercom_program_offset, notes, ...safe } = b;
    return safe;
  });
  const contacts = (
    await db
      .prepare(
        "SELECT u.id,u.name,m.role,p.visible,p.email,p.phone FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN contact_preferences p ON p.user_id=u.id AND p.condominium_id=m.condominium_id WHERE m.condominium_id=? AND m.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM ghost_profiles g WHERE g.user_id=u.id) AND (m.role='manager' OR p.visible=1 OR u.id=?) ORDER BY m.role='manager' DESC,u.name",
      )
      .bind(condoId, userId)
      .all<any>()
  ).results
    .filter(
      (c) =>
        (a.internal && !a.supplier) || c.role === "manager" || c.id === userId,
    )
    .map((c) => ({ ...c, email: c.email || "", phone: c.phone || "" }));
  const years = (
    await db
      .prepare(
        "SELECT year,status FROM fiscal_years WHERE condominium_id=? ORDER BY year DESC",
      )
      .bind(condoId)
      .all()
  ).results;
  return {
    roles: a.roles,
    buildings,
    years,
    operations: a.rawOps
      .filter(a.canReadOp)
      .filter(
        (o) =>
          ["equipment", "contract", "access"].includes(o.kind) ||
          o.fiscal_year === year,
      )
      .map(a.safeOp),
    contacts,
    relations: manager
      ? a.relations
      : a.relations.filter((r) => r.user_id === userId),
    contactPreference: (await db
      .prepare(
        "SELECT visible,email,phone FROM contact_preferences WHERE user_id=? AND condominium_id=?",
      )
      .bind(userId, condoId)
      .first()) || { visible: 0, email: "", phone: "" },
  };
}
export async function handleOperations(
  request: Request,
  env: Env,
  a: AccessContext,
  path: string,
): Promise<Response | undefined> {
  const { db, condoId, userId, manager } = a;
  if (path === "contacts/me" && request.method === "PUT") {
    const v = z
      .object({
        visible: z.boolean(),
        email: z.union([z.literal(""), z.email()]).transform((s) => s.trim()),
        phone: z.string().trim().max(50),
      })
      .parse(await request.json());
    await db
      .prepare(
        "INSERT INTO contact_preferences VALUES(?,?,?,?,?) ON CONFLICT(user_id,condominium_id) DO UPDATE SET visible=excluded.visible,email=excluded.email,phone=excluded.phone",
      )
      .bind(userId, condoId, v.visible ? 1 : 0, v.email, v.phone)
      .run();
    return json({ saved: true });
  }
  if (path === "years" && request.method === "POST") {
    if (!manager) fail(403, sourceText("metadata.m1297"));
    const { year } = z
      .object({ year: z.number().int().min(1900).max(2200) })
      .parse(await request.json());
    await db
      .prepare("INSERT OR IGNORE INTO fiscal_years VALUES(?,?,'open')")
      .bind(condoId, year)
      .run();
    return json({ year }, 201);
  }
  const buildingMatch = path.match(/^buildings(?:\/([^/]+))?$/);
  if (buildingMatch && ["POST", "PATCH"].includes(request.method)) {
    if (!manager) fail(403, sourceText("metadata.m1297"));
    const body = (await request.json()) as any,
      v = buildingSchema.parse(body),
      id = buildingMatch[1] || crypto.randomUUID();
    if (request.method === "PATCH") {
      const result = await db
        .prepare(
          "UPDATE buildings SET name=?,has_intercom=?,intercom_display_offset=?,intercom_program_offset=?,notes=?,version=version+1 WHERE id=? AND condominium_id=? AND version=?",
        )
        .bind(
          v.name,
          v.hasIntercom ? 1 : 0,
          v.displayOffset,
          v.programOffset,
          v.notes,
          id,
          condoId,
          z.number().int().positive().parse(body.version),
        )
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1298"));
    } else
      await db
        .prepare(
          "INSERT INTO buildings(id,condominium_id,name,has_intercom,intercom_display_offset,intercom_program_offset,notes) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          condoId,
          v.name,
          v.hasIntercom ? 1 : 0,
          v.displayOffset,
          v.programOffset,
          v.notes,
        )
        .run();
    return json({ id }, request.method === "PATCH" ? 200 : 201);
  }
  const lotMatch = path.match(/^lots(?:\/([^/]+))?$/);
  if (lotMatch && ["POST", "PATCH"].includes(request.method)) {
    if (!manager) fail(403, sourceText("metadata.m1297"));
    const body = (await request.json()) as any,
      v = lotSchema.parse(body),
      id = lotMatch[1] || crypto.randomUUID();
    const old = a.lots.find((l) => l.id === id);
    if (request.method === "PATCH" && !old)
      fail(404, sourceText("metadata.m1299"));
    if (request.method === "POST" && lotMatch[1])
      fail(405, sourceText("metadata.m1300"));
    if (
      v.buildingId &&
      !(await db
        .prepare("SELECT id FROM buildings WHERE id=? AND condominium_id=?")
        .bind(v.buildingId, condoId)
        .first())
    )
      fail(400, sourceText("metadata.m1301"));
    if (
      v.parentLotId &&
      (!a.lots.some((l) => l.id === v.parentLotId) || v.parentLotId === id)
    )
      fail(400, sourceText("metadata.m1302"));
    let parent = v.parentLotId;
    const seen = new Set([id]);
    while (parent) {
      if (seen.has(parent)) fail(400, sourceText("metadata.m1303"));
      seen.add(parent);
      parent = a.lots.find((l) => l.id === parent)?.parent_lot_id || null;
    }
    if (
      v.ownerId &&
      !(await db
        .prepare(
          "SELECT user_id FROM memberships WHERE user_id=? AND condominium_id=? AND role!='supplier' AND revoked_at IS NULL",
        )
        .bind(v.ownerId, condoId)
        .first())
    )
      fail(400, sourceText("metadata.m1304"));
    if (a.lots.some((l) => l.id !== id && l.number === v.number))
      fail(409, sourceText("metadata.m1305"));
    const values = [
      v.number,
      v.label,
      v.ownerId,
      v.weight,
      v.buildingId,
      v.lotType,
      v.areaM2.replace(",", ".") || null,
      v.useType,
      v.declaredActivity,
      v.apartmentNumber,
      v.parentLotId,
      v.intercomDisplay,
      v.intercomProgram,
      v.mailbox,
    ];
    const now = new Date().toISOString(),
      today = businessDate(new Date(now)),
      mutation = crypto.randomUUID();
    const expected = old ? z.number().int().positive().parse(body.version) : 0;
    if (old && expected !== old.version)
      fail(409, sourceText("metadata.m1306"));
    // D1 batch is atomic. The per-request receipt also gates side effects when
    // a concurrent writer wins after loadAccess and this UPDATE affects no row.
    const guard =
      "EXISTS(SELECT 1 FROM lots WHERE id=? AND condominium_id=? AND mutation_id=?)";
    const statements: D1PreparedStatement[] = [
      old
        ? db
            .prepare(
              "UPDATE lots SET number=?,label=?,owner_id=?,weight=?,building_id=?,lot_type=?,area_m2=?,use_type=?,declared_activity=?,apartment_number=?,parent_lot_id=?,intercom_display=?,intercom_program=?,mailbox=?,mutation_id=?,version=version+1 WHERE id=? AND condominium_id=? AND version=?",
            )
            .bind(...values, mutation, id, condoId, expected)
        : db
            .prepare(
              "INSERT INTO lots(number,label,owner_id,weight,building_id,lot_type,area_m2,use_type,declared_activity,apartment_number,parent_lot_id,intercom_display,intercom_program,mailbox,id,condominium_id,mutation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(...values, id, condoId, mutation),
    ];
    if (!old || old.owner_id !== v.ownerId) {
      statements.push(
        db
          .prepare(
            "UPDATE lot_relations SET valid_until=? WHERE lot_id=? AND relation='owner' AND valid_until IS NULL AND valid_from<? AND " +
              guard,
          )
          .bind(today, id, today, id, condoId, mutation),
      );
      statements.push(
        db
          .prepare(
            "DELETE FROM lot_relations WHERE lot_id=? AND relation='owner' AND valid_from=? AND " +
              guard,
          )
          .bind(id, today, id, condoId, mutation),
      );
      if (v.ownerId)
        statements.push(
          db
            .prepare(
              "INSERT INTO lot_relations SELECT ?,?,?,'owner',NULL,?,NULL WHERE " +
                guard,
            )
            .bind(
              crypto.randomUUID(),
              id,
              v.ownerId,
              today,
              id,
              condoId,
              mutation,
            ),
        );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO audit(condominium_id,actor_id,action,resource_id,version,happened_at) SELECT ?,?,?,?,?,? WHERE " +
            guard,
        )
        .bind(
          condoId,
          userId,
          old ? "updated" : "created",
          id,
          old ? old.version + 1 : 1,
          now,
          id,
          condoId,
          mutation,
        ),
    );
    statements.push(
      db
        .prepare(
          "UPDATE lots SET mutation_id=NULL WHERE id=? AND condominium_id=? AND mutation_id=?",
        )
        .bind(id, condoId, mutation),
    );
    const results = await db.batch(statements);
    if (!results[0].meta.changes) fail(409, sourceText("metadata.m1306"));
    return json({ id }, old ? 200 : 201);
  }
  if (path === "relations" && request.method === "POST") {
    if (!manager) fail(403, sourceText("metadata.m1297"));
    const v = relationSchema.parse(await request.json());
    if (
      !a.lots.some((l) => l.id === v.lotId) ||
      !(await db
        .prepare(
          "SELECT user_id FROM memberships WHERE user_id=? AND condominium_id=? AND role!='supplier' AND revoked_at IS NULL",
        )
        .bind(v.userId, condoId)
        .first())
    )
      fail(400, sourceText("metadata.m1307"));
    if (v.relation === "owner") fail(400, sourceText("metadata.m1308"));
    if (v.tenure === null) fail(400, sourceText("metadata.m1309"));
    const existing = await db
      .prepare(
        "SELECT id FROM lot_relations WHERE lot_id=? AND user_id=? AND relation='occupant' AND valid_from<COALESCE(NULLIF(?,''),'9999-12-31') AND (valid_until IS NULL OR valid_until>?)",
      )
      .bind(v.lotId, v.userId, v.validUntil, v.validFrom)
      .first();
    if (existing) fail(409, sourceText("metadata.m1310"));
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO lot_relations VALUES(?,?,?,?,?,?,?)")
      .bind(
        id,
        v.lotId,
        v.userId,
        v.relation,
        v.tenure,
        v.validFrom,
        v.validUntil || null,
      )
      .run();
    return json({ id }, 201);
  }
  const opMatch = path.match(/^operations(?:\/([^/]+))?$/);
  if (opMatch && ["POST", "PATCH"].includes(request.method)) {
    const body = (await request.json()) as any,
      old = opMatch[1] ? a.rawOps.find((o) => o.id === opMatch[1]) : undefined;
    if (opMatch[1] && !old) fail(404, sourceText("metadata.m1217"));
    if (
      !manager &&
      !(request.method === "POST" && a.internal && body.kind === "event") &&
      !(
        request.method === "PATCH" &&
        a.supplier &&
        old?.kind === "visit" &&
        old.assigned_to === userId
      )
    )
      fail(403, sourceText("metadata.m1311"));
    // Le prestataire ne peut modifier que son compte rendu et ses dates réelles.
    const raw =
      a.supplier && old
        ? {
            kind: old.kind,
            title: old.title,
            audience: old.audience,
            lotId: old.lot_id,
            assignedTo: old.assigned_to,
            fiscalYear: old.fiscal_year,
            payload: {
              ...old.payload,
              ...z
                .object({
                  performedOn: z.string(),
                  status: z.string(),
                  report: z.string(),
                  reservations: z.string(),
                })
                .parse(body.payload),
            },
          }
        : body;
    const v = operationSchema.parse(raw);
    if (old && v.kind !== old.kind) fail(400, sourceText("metadata.m1312"));
    if (
      !(await db
        .prepare(
          "SELECT year FROM fiscal_years WHERE condominium_id=? AND year=?",
        )
        .bind(condoId, v.fiscalYear)
        .first())
    )
      fail(400, sourceText("metadata.m1270"));
    if (
      !manager &&
      v.kind === "event" &&
      (v.audience !== "residents" || v.assignedTo || v.lotId)
    )
      fail(403, sourceText("metadata.m1313"));
    if (
      v.audience === "lot"
        ? !a.lots.some((l) => l.id === v.lotId)
        : v.lotId !== null
    )
      fail(400, sourceText("metadata.m1314"));
    if (
      v.assignedTo &&
      !(await db
        .prepare(
          "SELECT user_id FROM memberships WHERE user_id=? AND condominium_id=? AND revoked_at IS NULL",
        )
        .bind(v.assignedTo, condoId)
        .first())
    )
      fail(400, sourceText("metadata.m1315"));
    const reference = (id: string | null, kind: string) => {
      if (id && !a.rawOps.some((o) => o.id === id && o.kind === kind))
        fail(400, `Lien ${kind} invalide`);
    };
    const p = v.payload as any;
    for (const id of p.equipmentIds || p.opensEquipmentIds || [])
      reference(id, "equipment");
    if (v.kind === "equipment") {
      if (
        p.buildingId &&
        !(await db
          .prepare("SELECT id FROM buildings WHERE id=? AND condominium_id=?")
          .bind(p.buildingId, condoId)
          .first())
      )
        fail(400, sourceText("metadata.m1301"));
      reference(p.parentId, "equipment");
      let parent = p.parentId;
      const seen = new Set([old?.id]);
      while (parent) {
        if (seen.has(parent)) fail(400, sourceText("metadata.m1316"));
        seen.add(parent);
        parent = a.rawOps.find((o) => o.id === parent)?.payload.parentId;
      }
    }
    if (v.kind === "visit") {
      reference(p.contractId, "contract");
      if (
        p.incidentId &&
        !(await db
          .prepare(
            "SELECT id FROM records WHERE id=? AND condominium_id=? AND kind='incident'",
          )
          .bind(p.incidentId, condoId)
          .first())
      )
        fail(400, sourceText("metadata.m1317"));
    }
    if (v.kind === "access") {
      if (!v.lotId || v.audience !== "lot")
        fail(400, sourceText("metadata.m1318"));
      if (
        !a.relations.some(
          (r) => r.lot_id === v.lotId && r.user_id === p.holderId,
        )
      )
        fail(400, sourceText("metadata.m1319"));
    }
    const id = old?.id || crypto.randomUUID(),
      now = new Date().toISOString();
    if (old) {
      const result = await db
        .prepare(
          "UPDATE ops_items SET title=?,audience=?,lot_id=?,assigned_to=?,fiscal_year=?,payload=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND condominium_id=? AND version=?",
        )
        .bind(
          v.title,
          v.audience,
          v.lotId,
          v.assignedTo,
          v.fiscalYear,
          JSON.stringify(v.payload),
          userId,
          now,
          id,
          condoId,
          z.number().int().positive().parse(body.version),
        )
        .run();
      if (!result.meta.changes) fail(409, sourceText("metadata.m1320"));
    } else
      await db
        .prepare(
          "INSERT INTO ops_items(id,condominium_id,kind,title,audience,lot_id,assigned_to,fiscal_year,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          condoId,
          v.kind,
          v.title,
          v.audience,
          v.lotId,
          v.assignedTo,
          v.fiscalYear,
          JSON.stringify(v.payload),
          userId,
          userId,
          now,
          now,
        )
        .run();
    return json({ id }, old ? 200 : 201);
  }
}
