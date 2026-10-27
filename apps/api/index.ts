import { mapConcurrent } from "./concurrent";
import { sourceText } from "../../packages/i18n/source";
import {
  installationMode,
  identity,
  requireSession,
  handleAuth,
  handleAdministration,
} from "./auth";
import { handleRentals } from "./rentals";
import { handleResidence } from "./residence";
import { handleBudget } from "./budget";
import {
  confidentialIncident,
  validateClassification,
  initialFollowup,
  handleIncidentFollowup,
} from "./incidents";
import { ApiError, fail, json, loadAccess } from "./access";
import { handleOperations, operationsSnapshot } from "./operations";
import { createRecord, updateIncident } from "../../packages/contracts";
import { allocateCents } from "../../packages/domain/allocation";
import { version } from "../../package.json";
import { handleWorkspace, worklist } from "./workspace";
import { handleDocumentVault, byteRange } from "./documents";
import { handleGovernance } from "./governance";
type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  DEMO_MODE?: string;
  APP_REVISION?: string;
  INSTANCE?: string;
};
type Row = {
  id: string;
  condominium_id: string;
  kind: string;
  title: string;
  audience: string;
  lot_id: string | null;
  payload: string;
  version: number;
  access_scope: string;
  fiscal_year: number;
  equipment_id: string | null;
  ops_id: string | null;
  created_by: string;
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/"))
      return new Response("Not found", { status: 404 });
    try {
      // Installation locale uniquement, y compris les comptes réels. Aucun hôte distant autorisé.
      if (
        env.DEMO_MODE !== "local-only" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
        fail(503, sourceText("metadata.m1263"));
      if (
        !["GET", "HEAD"].includes(request.method) &&
        request.headers.get("Origin") !== url.origin
      )
        fail(403, sourceText("metadata.m1264"));
      if (url.pathname === "/api/health" && request.method === "GET") {
        const ledger = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'",
        ).first();
        const migrations = ledger
          ? (
              await env.DB.prepare(
                "SELECT name FROM d1_migrations ORDER BY id",
              ).all()
            ).results.map((row) => row.name)
          : [];
        return json({
          status: "ok",
          version,
          revision: env.APP_REVISION || "development",
          instance: env.INSTANCE || "development",
          migrations,
          demo: (await installationMode(env.DB)) === "demo",
        });
      }
      const mode = await installationMode(env.DB);
      const who = await identity(request, env.DB, mode);
      const authResponse = await handleAuth(request, env.DB, who);
      if (authResponse) return authResponse;
      if (mode === "real") requireSession(request, who);
      const adminResponse =
        mode === "real"
          ? await handleAdministration(request, env.DB, who)
          : null;
      if (adminResponse) return adminResponse;
      if (who.ghost && !["GET", "HEAD"].includes(request.method))
        fail(403, sourceText("app.m0065"));
      const profiles = [
        "demo-manager",
        "demo-owner",
        "demo-neighbor",
        "demo-outsider",
        "demo-tenant",
        "demo-resident",
        "demo-hybrid",
        "demo-supplier",
        "demo-council",
      ];
      if (url.pathname === "/api/demo/profile" && request.method === "POST") {
        if (mode !== "demo") fail(403, sourceText("metadata.m1265"));
        const input = (await request.json()) as { userId: string };
        if (!profiles.includes(input.userId))
          fail(400, sourceText("metadata.m1266"));
        return new Response(null, {
          status: 204,
          headers: {
            "Set-Cookie": `domolyma_demo=${input.userId}; HttpOnly; SameSite=Strict; Path=/`,
            "Cache-Control": "no-store",
          },
        });
      }
      const userId =
        who.userId ||
        request.headers
          .get("Cookie")
          ?.match(/(?:^|;\s*)domolyma_demo=([^;]+)/)?.[1] ||
        "demo-manager";
      if (mode === "demo" && !profiles.includes(userId))
        fail(401, sourceText("metadata.m1266"));
      const user = await env.DB.prepare("SELECT id,name FROM users WHERE id=?")
        .bind(userId)
        .first();
      if (!user) fail(401, sourceText("metadata.m1267"));
      if (url.pathname === "/api/portfolio" && request.method === "GET") {
        const memberships = (
          await env.DB.prepare(
            "SELECT c.*,m.role FROM condominiums c JOIN memberships m ON c.id=m.condominium_id WHERE m.user_id=? AND m.revoked_at IS NULL ORDER BY c.name",
          )
            .bind(userId)
            .all<any>()
        ).results;
        const properties = await mapConcurrent(memberships, 3, async (c) => {
          const lots = (
            await env.DB.prepare(
              "SELECT * FROM lots WHERE condominium_id=? ORDER BY number",
            )
              .bind(c.id)
              .all<any>()
          ).results;
          const a = await loadAccess(env.DB, c.id, userId, c.role, lots, {
            administrator: !!who.account?.administrator && !who.ghost,
            ghost: who.ghost,
          });
          const tasks = await worklist(a);
          return {
            id: c.id,
            name: c.name,
            address: c.address,
            fiscal_year: c.fiscal_year,
            roles: a.roles,
            lots: lots.filter((l) => a.manager || a.own(l.id) || a.occupy(l.id))
              .length,
            ownedLots: lots.filter((l) => a.own(l.id)).length,
            tasks: tasks.items.length,
            overdue: tasks.items.filter(
              (t) => t.dueDate && t.dueDate < tasks.asOf,
            ).length,
          };
        });
        return json({ properties });
      }
      if (url.pathname === "/api/bootstrap") {
        const condos = await env.DB.prepare(
          "SELECT c.*,m.role FROM condominiums c JOIN memberships m ON c.id=m.condominium_id WHERE m.user_id=? AND m.revoked_at IS NULL ORDER BY c.name",
        )
          .bind(userId)
          .all();
        return json({
          user,
          condominiums: condos.results,
          demo: mode === "demo",
          administrator: !!who.account?.administrator && !who.ghost,
          ghost: who.ghost
            ? { id: who.ghost.user_id, label: who.ghost.label }
            : null,
        });
      }
      const match = url.pathname.match(
        /^\/api\/condominiums\/([^/]+)(?:\/(.*))?$/,
      );
      if (!match) fail(404, sourceText("metadata.m1268"));
      const condoId = match[1],
        path = match[2] || "";
      const membership = await env.DB.prepare(
        "SELECT role FROM memberships WHERE condominium_id=? AND user_id=? AND revoked_at IS NULL",
      )
        .bind(condoId, userId)
        .first<{ role: string }>();
      if (!membership) fail(403, sourceText("metadata.m1269"));
      const administrator = !!who.account?.administrator && !who.ghost;
      const manager = membership.role === "manager" || administrator;
      const lotResult = await env.DB.prepare(
        "SELECT * FROM lots WHERE condominium_id=? ORDER BY number",
      )
        .bind(condoId)
        .all<{ id: string; owner_id: string; weight: number }>();
      const lots = lotResult.results;
      const access = await loadAccess(
        env.DB,
        condoId,
        userId,
        membership.role,
        lots,
        { administrator, ghost: who.ghost },
      );
      const canRead = access.canReadRecord;
      const condo = await env.DB.prepare(
        "SELECT fiscal_year FROM condominiums WHERE id=?",
      )
        .bind(condoId)
        .first<{ fiscal_year: number }>();
      const year = Number(
        url.searchParams.get("year") || condo?.fiscal_year || 2026,
      );
      const workspaceResponse = await handleWorkspace(request, access, path);
      if (workspaceResponse) return workspaceResponse;
      const vaultResponse = await handleDocumentVault(request, access, path);
      if (vaultResponse) return vaultResponse;
      if (
        !Number.isInteger(year) ||
        !(await env.DB.prepare(
          "SELECT year FROM fiscal_years WHERE condominium_id=? AND year=?",
        )
          .bind(condoId, year)
          .first())
      )
        fail(400, sourceText("metadata.m1270"));
      const governanceResponse = await handleGovernance(
        request,
        access,
        path,
        year,
      );
      if (governanceResponse) return governanceResponse;
      const rentalResponse = await handleRentals(request, access, path, year);
      const residenceResponse = await handleResidence(
        request,
        access,
        env.FILES,
        path,
      );
      if (residenceResponse) return residenceResponse;
      const budgetResponse = await handleBudget(request, access, path, year);
      if (budgetResponse) return budgetResponse;
      const followupResponse = await handleIncidentFollowup(
        request,
        access,
        path,
      );
      if (followupResponse) return followupResponse;
      if (rentalResponse) return rentalResponse;
      const operationResponse = await handleOperations(
        request,
        env,
        access,
        path,
      );
      if (operationResponse) return operationResponse;
      const getRecord = async (id: string) => {
        const row = await env.DB.prepare(
          "SELECT * FROM records WHERE id=? AND condominium_id=?",
        )
          .bind(id, condoId)
          .first<Row>();
        if (!row || !canRead(row)) fail(404, sourceText("metadata.m1271"));
        return row;
      };
      const validateAudience = (
        audience: string,
        lotId: string | null,
        restrictedReport = false,
      ) => {
        if (audience === "lot") {
          if (
            !lots.some(
              (l) =>
                l.id === lotId &&
                (manager || access.own(l.id) || access.occupy(l.id)),
            )
          )
            fail(400, sourceText("metadata.m1272"));
        } else if (lotId !== null) fail(400, sourceText("metadata.m1273"));
        if (!manager && audience === "management" && !restrictedReport)
          fail(403, sourceText("metadata.m1274"));
      };
      const publicPayload = (row: any) => {
        const p = JSON.parse(row.payload);
        if (row.kind === "document" && !manager && p.documentMeta)
          p.documentMeta = { ...p.documentMeta, links: [] };
        return p;
      };
      if (!path && request.method === "GET") {
        const records = (
          await env.DB.prepare(
            "SELECT * FROM records WHERE condominium_id=? AND fiscal_year=? ORDER BY updated_at DESC,id",
          )
            .bind(condoId, year)
            .all<Row>()
        ).results.filter(canRead);
        const members = manager
          ? (
              await env.DB.prepare(
                "SELECT u.id,u.name,m.role,m.revoked_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.condominium_id=? AND NOT EXISTS(SELECT 1 FROM ghost_profiles g WHERE g.user_id=u.id)",
              )
                .bind(condoId)
                .all()
            ).results
          : [];
        const versions = (
          await env.DB.prepare(
            "SELECT v.id,v.record_id,v.filename,v.mime,v.size,v.sha256,v.created_at,v.author_id FROM document_versions v JOIN records r ON r.id=v.record_id WHERE r.condominium_id=? AND r.fiscal_year=? AND v.state='ready' ORDER BY v.created_at DESC,v.id",
          )
            .bind(condoId, year)
            .all<{ record_id: string }>()
        ).results.filter((v) => records.some((r) => r.id === v.record_id));
        const audit = manager
          ? (
              await env.DB.prepare(
                "SELECT a.*,(SELECT g.title FROM governance_items g WHERE g.id=a.resource_id AND g.condominium_id=a.condominium_id) AS resource_title FROM audit a WHERE a.condominium_id=? ORDER BY a.id DESC LIMIT 50",
              )
                .bind(condoId)
                .all()
            ).results
          : [];
        return json({
          ...(await operationsSnapshot(access, year)),
          role: membership.role,
          canManage: manager,
          readOnly: !!who.ghost,
          lots: (manager
            ? lots
            : lots.filter((l) => access.own(l.id) || access.occupy(l.id))
          ).map(access.safeLot),
          records: records.map((r) => ({
            ...r,
            payload: publicPayload(r),
          })),
          members,
          versions,
          audit,
        });
      }
      if (path === "records" && request.method === "POST") {
        const input = createRecord.parse(await request.json());
        if (!manager && (!access.internal || input.kind !== "incident"))
          fail(403, sourceText("metadata.m1275"));
        const restrictedReport =
          input.kind === "incident" && confidentialIncident(input.payload);
        if (restrictedReport) {
          input.audience = "management";
          input.lotId = null;
          input.accessScope = "residents";
        }
        validateAudience(input.audience, input.lotId, restrictedReport);
        const scope = input.accessScope || "owners";
        if (!manager && scope !== "residents")
          fail(403, sourceText("metadata.m1276"));
        if (scope === "assigned") fail(400, sourceText("metadata.m1277"));
        if (
          !manager &&
          input.kind === "incident" &&
          input.equipmentId &&
          !access.rawOps.some(
            (o) =>
              o.id === input.equipmentId &&
              o.kind === "equipment" &&
              access.canReadOp(o),
          )
        )
          fail(400, sourceText("metadata.m1251"));
        if (
          input.equipmentId &&
          !access.rawOps.some(
            (o) => o.id === input.equipmentId && o.kind === "equipment",
          )
        )
          fail(400, sourceText("metadata.m1278"));

        if (
          !manager &&
          input.kind === "incident" &&
          (input.payload.status !== "Signalé" ||
            input.payload.assignee ||
            input.payload.comment)
        )
          fail(403, sourceText("metadata.m1279"));
        const id = crypto.randomUUID(),
          now = new Date().toISOString();
        let payload: object = input.payload;
        if (input.kind === "incident") {
          await validateClassification(
            access,
            input.payload,
            input.equipmentId || null,
            year,
            input.audience,
            input.lotId,
            scope,
          );
          payload = {
            ...input.payload,
            ...(restrictedReport ? { confidentialReport: true } : {}),
          };
        }
        if (
          input.kind === "incident" &&
          ["Clôturé", "Réouvert"].includes(input.payload.status) &&
          !input.payload.comment
        )
          fail(400, sourceText("metadata.m1280"));
        if (input.kind === "assembly")
          payload = { ...input.payload, status: "Brouillon · à valider" };
        if (input.kind === "fund") {
          if (!manager || input.audience !== "management")
            fail(400, sourceText("metadata.m1281"));
          payload = {
            ...input.payload,
            status: "Simulation · non émise",
            allocation: allocateCents(input.payload.amountCents, lots),
            keySnapshot: lots.map((l) => ({ id: l.id, weight: l.weight })),
            rounding:
              "Plus forts restes ; égalité départagée par identifiant de lot",
          };
        }
        const insert = env.DB.prepare(
          "INSERT INTO records(id,condominium_id,kind,title,audience,lot_id,payload,created_at,updated_at,updated_by,created_by,access_scope,fiscal_year,equipment_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          condoId,
          input.kind,
          input.title,
          input.audience,
          input.lotId,
          JSON.stringify(payload),
          now,
          now,
          userId,
          userId,
          scope,
          year,
          input.equipmentId || null,
        );
        if (
          input.kind === "incident" &&
          input.payload.eventNature === "Accident corporel"
        )
          await env.DB.batch([insert, initialFollowup(access, id, now)]);
        else await insert.run();
        return json({ id }, 201);
      }
      const recordMatch = path.match(/^records\/([^/]+)$/);
      if (recordMatch && request.method === "GET") {
        const record = await getRecord(recordMatch[1]);
        return json({ ...record, payload: publicPayload(record) });
      }
      if (recordMatch && request.method === "PATCH") {
        const record = await getRecord(recordMatch[1]);
        if (!manager || record.kind !== "incident")
          fail(403, sourceText("metadata.m1282"));
        const input = updateIncident.parse(await request.json());
        const oldPayload = JSON.parse(record.payload);
        const equipmentId =
          input.equipmentId === undefined
            ? record.equipment_id
            : input.equipmentId;
        const restrictedReport =
          oldPayload.confidentialReport === true ||
          confidentialIncident(input.payload);
        const audience = restrictedReport ? "management" : record.audience;
        const lotId = restrictedReport ? null : record.lot_id;
        const scope = restrictedReport ? "residents" : record.access_scope;
        await validateClassification(
          access,
          input.payload,
          equipmentId,
          record.fiscal_year,
          audience,
          lotId,
          scope,
          { ...record, payload: oldPayload },
        );
        if (
          ["Clôturé", "Réouvert"].includes(input.payload.status) &&
          !input.payload.comment.trim()
        )
          fail(400, sourceText("metadata.m1283"));
        const update = env.DB.prepare(
          "UPDATE records SET payload=?,equipment_id=?,audience=?,lot_id=?,access_scope=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND condominium_id=? AND version=?",
        ).bind(
          JSON.stringify({
            ...input.payload,
            ...(restrictedReport ? { confidentialReport: true } : {}),
          }),
          equipmentId,
          audience,
          lotId,
          scope,
          new Date().toISOString(),
          userId,
          record.id,
          condoId,
          input.version,
        );
        const result =
          input.payload.eventNature === "Accident corporel"
            ? (
                await env.DB.batch([
                  update,
                  initialFollowup(access, record.id, new Date().toISOString()),
                ])
              )[0]
            : await update.run();
        if (!result.meta.changes) fail(409, sourceText("metadata.m1284"));
        return json({ id: record.id, version: input.version + 1 });
      }
      if (path === "documents" && request.method === "POST") {
        if (!manager && !access.supplier)
          fail(403, sourceText("metadata.m1285"));
        if (
          Number(request.headers.get("Content-Length") || 0) >
          11 * 1024 * 1024
        )
          fail(413, sourceText("metadata.m1286"));
        const form = await request.formData(),
          file = form.get("file");
        if (
          !(file instanceof File) ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024
        )
          fail(400, sourceText("metadata.m1287"));
        const bytes = await file.arrayBuffer(),
          head = new Uint8Array(bytes.slice(0, 8));
        const mime = file.type;
        const valid =
          (mime === "application/pdf" &&
            new TextDecoder().decode(head).startsWith("%PDF-")) ||
          (mime === "image/png" &&
            head.join(",") === "137,80,78,71,13,10,26,10") ||
          (mime === "image/jpeg" &&
            head[0] === 255 &&
            head[1] === 216 &&
            head[2] === 255) ||
          (mime === "text/plain" && !new Uint8Array(bytes).includes(0));
        if (!valid) fail(400, sourceText("metadata.m1288"));
        const existing = String(form.get("recordId") || "");
        const title = String(form.get("title") || file.name).trim(),
          audience = String(form.get("audience") || "shared"),
          lotId = String(form.get("lotId") || "") || null;
        if (
          !title ||
          title.length > 200 ||
          !["shared", "management", "lot"].includes(audience)
        )
          fail(400, sourceText("metadata.m1289"));
        validateAudience(audience, lotId);
        const scope = String(form.get("accessScope") || "owners");
        if (!["owners", "residents", "council", "assigned"].includes(scope))
          fail(400, sourceText("metadata.m1290"));
        const opsId = String(form.get("opsId") || "") || null;
        if (opsId && !access.rawOps.some((o) => o.id === opsId))
          fail(400, sourceText("metadata.m1291"));
        if (scope === "assigned" && !opsId)
          fail(400, sourceText("metadata.m1292"));
        if (
          !manager &&
          (scope !== "assigned" ||
            !access.rawOps.some(
              (o) =>
                o.id === opsId &&
                o.kind === "visit" &&
                o.assigned_to === userId,
            ))
        )
          fail(403, sourceText("metadata.m1293"));

        if (existing && (await getRecord(existing)).kind !== "document")
          fail(400, sourceText("metadata.m1294"));
        const id = existing || crypto.randomUUID(),
          versionId = crypto.randomUUID(),
          now = new Date().toISOString(),
          key = `${condoId}/${id}/${versionId}`;
        const sha = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        const statements = [];
        if (!existing)
          statements.push(
            env.DB.prepare(
              "INSERT INTO records(id,condominium_id,kind,title,audience,lot_id,payload,created_at,updated_at,updated_by,created_by,access_scope,fiscal_year,ops_id) VALUES(?,?,'document',?,?,?,'{}',?,?,?,?,?,?,?)",
            ).bind(
              id,
              condoId,
              title,
              audience,
              lotId,
              now,
              now,
              userId,
              userId,
              scope,
              year,
              opsId,
            ),
          );
        statements.push(
          env.DB.prepare(
            "INSERT INTO document_versions VALUES(?,?,?,?,?,?,?,'pending',?,?)",
          ).bind(
            versionId,
            id,
            key,
            file.name.slice(0, 200),
            mime,
            file.size,
            sha,
            now,
            userId,
          ),
        );
        await env.DB.batch(statements);
        try {
          await env.FILES.put(key, bytes, {
            httpMetadata: { contentType: mime },
          });
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE document_versions SET state='ready' WHERE id=?",
            ).bind(versionId),
            env.DB.prepare(
              "UPDATE records SET version=version+1,updated_at=?,updated_by=? WHERE id=?",
            ).bind(now, userId, id),
          ]);
        } catch (error) {
          await env.DB.prepare(
            "UPDATE document_versions SET state='failed' WHERE id=?",
          )
            .bind(versionId)
            .run();
          throw error;
        }
        return json({ id, versionId, sha256: sha }, 201);
      }
      const download = path.match(/^documents\/([^/]+)\/(download|preview)$/);
      if (download && ["GET", "HEAD"].includes(request.method)) {
        const v = await env.DB.prepare(
          "SELECT v.* FROM document_versions v JOIN records r ON r.id=v.record_id WHERE v.id=? AND r.condominium_id=? AND v.state='ready'",
        )
          .bind(download[1], condoId)
          .first<{
            record_id: string;
            object_key: string;
            mime: string;
            filename: string;
            size: number;
          }>();
        if (!v) fail(404, sourceText("metadata.m1295"));
        await getRecord(v.record_id);
        const range = byteRange(request.headers.get("Range"), v.size);
        if (range === false)
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${v.size}`,
              "Cache-Control": "no-store",
            },
          });
        const headers: Record<string, string> = {
          "Content-Type": v.mime,
          "Content-Disposition": `${download[2] === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(v.filename)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Accept-Ranges": "bytes",
          "Content-Length": String(range ? range.length : v.size),
        };
        if (range)
          headers["Content-Range"] =
            `bytes ${range.offset}-${range.offset + range.length - 1}/${v.size}`;
        if (request.method === "HEAD") {
          if (!(await env.FILES.head(v.object_key)))
            fail(404, sourceText("metadata.m1296"));
          return new Response(null, { status: range ? 206 : 200, headers });
        }
        const object = await env.FILES.get(
          v.object_key,
          range ? { range } : undefined,
        );
        if (!object) fail(404, sourceText("metadata.m1296"));
        return new Response(object.body, {
          status: range ? 206 : 200,
          headers,
        });
      }
      fail(404, sourceText("metadata.m1268"));
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message }, error.status);
      if (error && typeof error === "object" && "issues" in error)
        return json(
          {
            error: sourceText("api.invalid_fields"),
            details: (error as { issues: unknown }).issues,
          },
          400,
        );
      if (error instanceof SyntaxError)
        return json({ error: sourceText("api.invalid_json") }, 400);
      console.error(
        "API failure",
        error instanceof Error ? error.message : "unknown",
      );
      return json(
        {
          error: sourceText("api.local_error"),
        },
        500,
      );
    }
    return new Response(null, { status: 500 });
  },
};
