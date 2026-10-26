import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import worker from "../apps/api";
let mf: Miniflare;
let env: Parameters<typeof worker.fetch>[1];
const root = "/api/condominiums/demo-tilleuls";
async function call(
  path: string,
  user = "demo-manager",
  method = "GET",
  body?: unknown,
  host = "http://localhost:5173",
) {
  const headers: Record<string, string> = {
    Cookie: `domolyma_demo=${user}`,
    Origin: host,
  };
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  return worker.fetch(
    new Request(`${host}${path}`, {
      method,
      headers,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    }),
    env,
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
    }),
  );
  env = {
    DB: (await mf.getD1Database("DB")) as unknown as D1Database,
    FILES: (await mf.getR2Bucket("FILES")) as unknown as R2Bucket,
    DEMO_MODE: "local-only",
  };
  for (const file of [
    "migrations/0001_initial.sql",
    "migrations/0002_resident_operations.sql",
    "migrations/0003_building_version.sql",
    "migrations/0004_rentals.sql",
    "migrations/0005_residence_budget.sql",
    "migrations/0006_incident_followups.sql",
    "migrations/0007_local_accounts_imports.sql",
    "migrations/0008_governance.sql",
    "migrations/0009_governance_audience_guard.sql",
    "migrations/0010_atomic_lot_writes.sql",
    "fixtures/demo.sql",
    "fixtures/residents.sql",
  ]) {
    const sql = readFileSync(file, "utf8").replace(/^--.*$/gm, "");
    // D1 exec accepts one statement per line, including each trigger body.
    for (const line of sql
      .replace(/\n(?=\()/g, " ")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean))
      await env.DB.exec(line);
  }
});
afterAll(async () => {
  await mf?.dispose();
});
describe("Décisions sourcées et suivi d’exécution", () => {
  const url = `${root}/governance?year=2026`;
  let meeting: string,
    decision: string,
    source: string,
    sourceVersion: string,
    privateSource: string,
    councilSource: string;
  const base = (
    kind: string,
    parentId: string | null = null,
    payload: any = {},
  ) => ({
    kind,
    title: `Recette ${kind}`,
    dossierYear: 2026,
    parentId,
    audience: "owners",
    payload: {
      documentId: null,
      sourcePage: null,
      sourceType: "other",
      sourceNote: "",
      ...payload,
    },
  });
  const meetingBody = () =>
    base("meeting", null, {
      meetingDate: "2026-06-01",
      location: "Salle fictive",
      accountingYear: 2025,
      budgetYear: 2027,
      notes: "",
    });
  const decisionBody = (status = "proposed") =>
    base("decision", meeting, {
      number: "R1",
      body: "Proposition synthétique",
      status,
      decidedOn: status === "adopted" ? "2026-06-01" : "",
      votingRule: "À relever",
      scope: "Parties communes",
      reserve: "À vérifier",
      ceilingCents: 100000,
      relatedIds: [],
    });
  const actionBody = (type = "execution", status = "planned") =>
    base("action", decision, {
      actionType: type,
      status,
      responsible: "Suivi conseil",
      dueDate: "2025-01-01",
      note: "",
    });
  const proof = () => ({
    documentId: source,
    sourceVersionId: sourceVersion,
    sourcePage: 2,
    sourceType: "minutes",
  });
  async function create(body: any, user = "demo-manager") {
    const r = await call(url, user, "POST", body);
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(201);
    return ((await r.json()) as any).id as string;
  }
  async function read(user = "demo-manager") {
    return (await (await call(url, user)).json()) as any;
  }
  async function patch(
    id: string,
    body: any,
    version: number,
    user = "demo-manager",
  ) {
    return call(`${root}/governance/${id}?year=2026`, user, "PATCH", {
      ...body,
      version,
    });
  }
  beforeAll(async () => {
    async function document(audience: string, scope = "owners") {
      const f = new FormData();
      f.set("title", "Justificatif de recette synthétique");
      f.set("audience", audience);
      f.set("accessScope", scope);
      f.set(
        "file",
        new File(
          ["Justificatif fictif de recette, sans valeur juridique."],
          "recette.txt",
          { type: "text/plain" },
        ),
      );
      const r = await call(`${root}/documents`, "demo-manager", "POST", f);
      expect(r.status).toBe(201);
      return (await r.json()) as any;
    }
    const doc = await document("shared");
    source = doc.id;
    sourceVersion = doc.versionId;
    privateSource = (await document("management")).id;
    councilSource = (await document("shared", "council")).id;
    meeting = await create(meetingBody());
    decision = await create(decisionBody());
  });
  it("sépare année du dossier, comptes et budget, sans résultat implicite", async () => {
    const register = await read();
    const m = register.items.find((x: any) => x.id === meeting);
    expect(m.dossier_year).toBe(2026);
    expect(m.payload.accountingYear).toBe(2025);
    expect(m.payload.budgetYear).toBe(2027);
    expect(
      (await patch(meeting, { ...meetingBody(), audience: "council" }, 1))
        .status,
    ).toBe(409);
    expect(
      register.items.find((x: any) => x.id === decision).payload.status,
    ).toBe("proposed");
    const p = base("requirement", meeting, {
      category: "minutes",
      status: "received",
      notes: "",
    });
    expect((await call(url, "demo-manager", "POST", p)).status).toBe(400);
    p.payload = { ...p.payload, ...proof() };
    await create(p);
    expect(
      (await read()).items.find((x: any) => x.id === decision).payload.status,
    ).toBe("proposed");
  });
  it("interdit un résultat sans PV et une exécution lancée sur un projet", async () => {
    expect((await patch(decision, decisionBody("adopted"), 1)).status).toBe(
      400,
    );
    expect(
      (
        await call(
          url,
          "demo-manager",
          "POST",
          actionBody("execution", "in_progress"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(url, "demo-council", "POST", {
          ...decisionBody("adopted"),
          payload: { ...decisionBody("adopted").payload, ...proof() },
        })
      ).status,
    ).toBe(403);
    await create(actionBody("document_request", "in_progress"), "demo-council");
  });
  it("empêche une diffusion collective d’une pièce plus privée et les références étrangères", async () => {
    const body = decisionBody("adopted");
    body.payload = { ...body.payload, ...proof(), documentId: privateSource };
    expect((await patch(decision, body, 1)).status).toBe(400);
    body.payload.documentId = councilSource;
    expect((await patch(decision, body, 1)).status).toBe(400);
    body.payload.documentId = source;
    body.payload.sourceVersionId = "version-inconnue";
    expect((await patch(decision, body, 1)).status).toBe(400);
    const foreign = { ...decisionBody(), parentId: "foreign-id" };
    expect((await call(url, "demo-manager", "POST", foreign)).status).toBe(400);
    expect(
      (
        await call(
          "/api/condominiums/demo-ateliers/governance?year=2026",
          "demo-manager",
          "POST",
          decisionBody(),
        )
      ).status,
    ).toBe(403);
  });
  it("fige la pièce utilisée et conserve les corrections sans écrasement concurrent", async () => {
    const body = decisionBody("adopted");
    body.payload = { ...body.payload, ...proof() };
    expect((await patch(decision, body, 1)).status).toBe(200);
    const next = { ...body, title: "Résultat documenté synthétique" };
    const results = await Promise.all([
      patch(decision, next, 2),
      patch(decision, next, 2),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const p = (await read()).items.find((x: any) => x.id === decision);
    expect(p.version).toBe(3);
    expect(p.payload.sourceVersionId).toBe(sourceVersion);
    const replacement = new FormData();
    replacement.set("title", "Pièce remplacée");
    replacement.set("recordId", source);
    replacement.set(
      "file",
      new File(["Nouvelle version synthétique"], "nouvelle.txt", {
        type: "text/plain",
      }),
    );
    expect(
      (await call(`${root}/documents`, "demo-manager", "POST", replacement))
        .status,
    ).toBe(201);
    expect(
      (await read()).items.find((x: any) => x.id === decision).payload
        .sourceVersionId,
    ).toBe(sourceVersion);
    expect(p.payload.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    const versions = (
      await env.DB.prepare(
        "SELECT version,snapshot FROM item_revisions WHERE resource_id=? ORDER BY version",
      )
        .bind(decision)
        .all<any>()
    ).results;
    expect(versions.map((x) => x.version)).toEqual([1, 2]);
    expect(JSON.parse(versions[1].snapshot).payload.sourceVersionId).toBe(
      sourceVersion,
    );
    expect(
      (await patch(decision, decisionBody(), 3, "demo-council")).status,
    ).toBe(403);
  });
  it("exige une preuve et une validation de gestion pour clôturer une exécution", async () => {
    const body = actionBody("execution", "in_progress"),
      id = await create(body, "demo-council");
    const done = {
      ...body,
      payload: { ...body.payload, status: "done", note: "Réception constatée" },
    };
    expect((await patch(id, done, 1)).status).toBe(400);
    done.payload = { ...done.payload, ...proof(), sourceType: "report" };
    expect((await patch(id, done, 1, "demo-council")).status).toBe(403);
    expect((await patch(id, done, 1)).status).toBe(200);
    expect(
      (
        await patch(
          id,
          { ...done, payload: { ...done.payload, status: "planned" } },
          2,
          "demo-council",
        )
      ).status,
    ).toBe(403);
    expect((await patch(decision, decisionBody(), 3)).status).toBe(409);
    const raw = await env.DB.prepare(
      "SELECT * FROM governance_items WHERE id=?",
    )
      .bind(decision)
      .first<any>();
    await expect(
      env.DB.prepare(
        "UPDATE governance_items SET payload=json_set(payload,'$.status','proposed') WHERE id=?",
      )
        .bind(decision)
        .run(),
    ).rejects.toThrow("governance_parent_changed");
    expect(JSON.parse(raw.payload).status).toBe("adopted");
  });
  it("alimente la file multi-exercices et masque les actions du conseil aux propriétaires", async () => {
    const c = await create(
      { ...meetingBody(), audience: "council", title: "Dossier conseil privé" },
      "demo-council",
    );
    const d = await create(
      { ...decisionBody(), parentId: c, title: "Décision conseil privée" },
      "demo-council",
    );
    const a = await create(
      {
        ...actionBody("preparation"),
        parentId: d,
        title: "Action conseil privée",
      },
      "demo-council",
    );
    const owner = await read("demo-owner");
    expect(owner.items.some((i: any) => [c, d, a].includes(i.id))).toBe(false);
    const work = (await (
      await call(`${root}/worklist`, "demo-council")
    ).json()) as any;
    expect(work.items.find((i: any) => i.id === a)).toMatchObject({
      kind: "decision_action",
      targetId: d,
      year: 2026,
      dueDate: "2025-01-01",
    });
    const ownerWork = (await (
      await call(`${root}/worklist`, "demo-owner")
    ).json()) as any;
    expect(ownerWork.items.some((i: any) => i.id === a)).toBe(false);
    expect((await call(url, "demo-owner", "POST", meetingBody())).status).toBe(
      403,
    );
    for (const role of ["demo-tenant", "demo-supplier", "demo-outsider"]) {
      expect((await call(url, role)).status).toBe(403);
      expect((await call(url, role, "POST", meetingBody())).status).toBe(403);
    }
  });
  it("conserve les prix inconnus, les options et les unités et encadre le contrat signé", async () => {
    const offer = base("offer", decision, {
      supplier: "Entreprise fictive",
      scope: "Portail",
      unit: "résidence / an",
      baseHtCents: 0,
      baseTtcCents: null,
      options: "Abonnement séparé à confirmer",
      duration: "1 an",
      notice: "",
      renewal: "",
      indexation: "",
      coverage: "",
      exclusions: "",
      status: "proposal",
      signedOn: "",
    });
    const id = await create(offer);
    const stored = (await read()).items.find((i: any) => i.id === id);
    expect(stored.payload.baseHtCents).toBe(0);
    expect(stored.payload.baseTtcCents).toBeNull();
    const signed = {
      ...offer,
      payload: { ...offer.payload, status: "signed", signedOn: "2026-07-01" },
    };
    expect((await patch(id, signed, 1)).status).toBe(400);
    signed.payload = { ...signed.payload, ...proof(), sourceType: "contract" };
    expect((await patch(id, signed, 1, "demo-council")).status).toBe(403);
    expect((await patch(id, signed, 1)).status).toBe(200);
  });
  it("garde les clés indépendantes des lots et réserve la validation à la gestion", async () => {
    const before = await env.DB.prepare(
      "SELECT SUM(weight) total FROM lots WHERE condominium_id='demo-tilleuls'",
    ).first<any>();
    const key = base("charge_key", null, {
      code: "K01",
      base: "1000",
      unit: "tantièmes",
      scope: "Bâtiment A",
      validFrom: "",
      validUntil: "",
      status: "unverified",
      notes: "Grille individuelle à contrôler",
    });
    const id = await create(key, "demo-council");
    const checked = {
      ...key,
      payload: { ...key.payload, status: "validated", ...proof() },
    };
    expect((await patch(id, checked, 1, "demo-council")).status).toBe(403);
    expect((await patch(id, checked, 1)).status).toBe(200);
    expect(
      (
        await call(url, "demo-manager", "POST", {
          ...key,
          payload: { ...key.payload, base: "0" },
        })
      ).status,
    ).toBe(400);
    expect(
      await env.DB.prepare(
        "SELECT SUM(weight) total FROM lots WHERE condominium_id='demo-tilleuls'",
      ).first(),
    ).toEqual(before);
  });
  it("retire les métadonnées d’une source devenue inaccessible sans perdre la trace interne", async () => {
    await env.DB.prepare("UPDATE records SET audience='management' WHERE id=?")
      .bind(source)
      .run();
    const owner = await read("demo-owner"),
      d = owner.items.find((i: any) => i.id === decision);
    expect(d.payload.sourceUnavailable).toBe(true);
    expect(d.payload.documentId).toBeNull();
    expect(d.payload.sourceFilename).toBeUndefined();
    expect(d.payload.sourceSha256).toBeUndefined();
    expect(
      (await read()).items.find((i: any) => i.id === decision).payload
        .sourceVersionId,
    ).toBe(sourceVersion);
  });
  it("charge les versions en groupe au-delà de cinquante documents sans élargir les droits", async () => {
    const db = env.DB,
      statements = [];
    for (let i = 0; i < 65; i++) {
      const id = `bulk-source-${i}`;
      statements.push(
        db
          .prepare(
            "INSERT INTO records(id,condominium_id,kind,title,audience,payload,created_at,updated_at,updated_by,created_by,access_scope,fiscal_year) VALUES(?,'demo-tilleuls','document',?,'management','{}',datetime('now'),datetime('now'),'demo-manager','demo-manager','owners',2026)",
          )
          .bind(id, id),
      );
      statements.push(
        db
          .prepare(
            "INSERT INTO document_versions VALUES(?,?,?,?,?,?,?,'ready',datetime('now'),'demo-manager')",
          )
          .bind(
            id + "-v1",
            id,
            id,
            "transcription.md",
            "text/plain",
            1,
            "0".repeat(64),
          ),
      );
    }
    await db.batch(statements);
    let queries = 0;
    try {
      env.DB = new Proxy(db, {
        get(target, prop) {
          if (prop === "prepare")
            return (sql: string) => {
              queries++;
              return target.prepare(sql);
            };
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const response = await call(url);
      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(
        data.sources.filter((x: any) => x.id.startsWith("bulk-source-")),
      ).toHaveLength(65);
      expect(queries).toBeLessThan(30);
      env.DB = db;
      expect(
        (await read("demo-owner")).sources.some((x: any) =>
          x.id.startsWith("bulk-source-"),
        ),
      ).toBe(false);
      const review = {
        ...decisionBody(),
        payload: { ...decisionBody().payload, status: "pending_review" },
      };
      expect((await call(url, "demo-council", "POST", review)).status).toBe(
        201,
      );
    } finally {
      env.DB = db;
      await db.batch([
        db.prepare(
          "DELETE FROM document_versions WHERE record_id LIKE 'bulk-source-%'",
        ),
        db.prepare("DELETE FROM records WHERE id LIKE 'bulk-source-%'"),
        db.prepare("DELETE FROM audit WHERE resource_id LIKE 'bulk-source-%'"),
      ]);
    }
  });
});
describe("Coffre documentaire, droits et versions", () => {
  let shared: string,
    restricted: string,
    versionId: string,
    privateVersion: string;
  const payload = (patch: any = {}) => ({
    category: "contract",
    issuer: "Émetteur de recette",
    date: "2025-06-01",
    receivedOn: "2025-06-02",
    validUntil: "",
    notes: "Classement documentaire",
    links: [],
    trashed: false,
    ...patch,
  });
  const list = async (user = "demo-manager") =>
    (await (await call(`${root}/document-vault`, user)).json()) as any;
  const update = async (
    id: string,
    version: number,
    metadata: any,
    user = "demo-manager",
    title = "Document de recette",
  ) =>
    call(`${root}/document-vault/${id}`, user, "PATCH", {
      version,
      title,
      metadata,
    });
  beforeAll(async () => {
    for (const [audience, year] of [
      ["shared", 2025],
      ["management", 2026],
    ] as const) {
      const form = new FormData();
      form.set("title", `Coffre ${audience}`);
      form.set("audience", audience);
      form.set(
        "file",
        new File(["Texte de recette 0123456789"], "recette-coffre.md", {
          type: "text/plain",
        }),
      );
      const r = await call(
        `${root}/documents?year=${year}`,
        "demo-manager",
        "POST",
        form,
      );
      expect(r.status).toBe(201);
      const d = (await r.json()) as any;
      if (audience === "shared") {
        shared = d.id;
        versionId = d.versionId;
        await env.DB.prepare("UPDATE records SET payload=? WHERE id=?")
          .bind(
            JSON.stringify({
              sourceImport: "lot-trace",
              sourceFile: "archive/privee.md",
            }),
            shared,
          )
          .run();
      } else {
        restricted = d.id;
        privateVersion = d.versionId;
      }
    }
  });
  it("réunit les exercices autorisés sans divulguer le coffre privé", async () => {
    const manager = await list(),
      owner = await list("demo-owner"),
      tenant = await list("demo-tenant");
    expect(manager.documents.find((d: any) => d.id === shared).fiscalYear).toBe(
      2025,
    );
    expect(manager.documents.some((d: any) => d.id === restricted)).toBe(true);
    expect(owner.documents.some((d: any) => d.id === shared)).toBe(true);
    expect(owner.documents.some((d: any) => d.id === restricted)).toBe(false);
    expect(
      tenant.documents.some((d: any) => [shared, restricted].includes(d.id)),
    ).toBe(false);
    expect(
      owner.targets.every((t: any) => t.type !== "lot" || t.id === "lot-1"),
    ).toBe(true);
    expect((await call(`${root}/document-vault`, "demo-outsider")).status).toBe(
      403,
    );
  });
  it("prévisualise par plages et conserve le téléchargement exact", async () => {
    const get = (range?: string, user = "demo-owner", method = "GET") =>
      worker.fetch(
        new Request(
          `http://localhost:5173${root}/documents/${versionId}/preview`,
          {
            method,
            headers: {
              Cookie: `domolyma_demo=${user}`,
              ...(range ? { Range: range } : {}),
            },
          },
        ),
        env,
      );
    const r = await get("bytes=0-4");
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("Texte");
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect(r.headers.get("Content-Range")).toBe("bytes 0-4/27");
    expect(r.headers.get("Content-Disposition")).toMatch(/^inline;/);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await (await get("bytes=-3")).text()).toBe("789");
    expect((await get("bytes=999-1000")).status).toBe(416);
    expect((await get("bytes=1-2,4-5")).status).toBe(416);
    const head = await get(undefined, "demo-owner", "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("27");
    expect(await head.text()).toBe("");
    const forbidden = await call(
      `${root}/documents/${privateVersion}/preview`,
      "demo-owner",
    );
    expect(forbidden.status).toBe(404);
    expect(
      await (
        await call(`${root}/documents/${versionId}/download`, "demo-owner")
      ).text(),
    ).toBe("Texte de recette 0123456789");
  });
  it("enregistre les métadonnées sans changer les originaux ni perdre la provenance", async () => {
    const before = (await list()).documents.find((d: any) => d.id === shared);
    const target = (await list()).targets.find((t: any) =>
      before.allowedTargetKeys.includes(`${t.type}:${t.id}`),
    );
    expect(target).toBeDefined();
    const r = await update(
      shared,
      before.version,
      payload({ links: [{ type: target.type, id: target.id }] }),
    );
    expect(r.status).toBe(200);
    const after = (await list()).documents.find((d: any) => d.id === shared);
    expect(after.metadata.issuer).toBe("Émetteur de recette");
    expect(after.categorySuggested).toBe(false);
    expect(after.versions).toEqual(before.versions);
    expect(after.version).toBe(before.version + 1);
    expect(
      (await list("demo-owner")).documents.find((d: any) => d.id === shared)
        .metadata.links,
    ).toEqual([{ type: target.type, id: target.id }]);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM audit WHERE resource_id=? AND version=? AND action='updated'",
        )
          .bind(shared, after.version)
          .first<any>()
      ).n,
    ).toBe(1);
    const row = await env.DB.prepare("SELECT payload FROM records WHERE id=?")
      .bind(shared)
      .first<any>();
    expect(JSON.parse(row.payload).sourceImport).toBe("lot-trace");
    expect(JSON.parse(row.payload).documentMeta.originalTitle).toBe(
      "Coffre shared",
    );
    expect(
      (await update(shared, after.version, payload(), "demo-owner")).status,
    ).toBe(403);
  });
  it("refuse l’écrasement concurrent et les liens plus privés ou étrangers", async () => {
    let doc = (await list()).documents.find((d: any) => d.id === shared);
    const results = await Promise.all([
      update(shared, doc.version, payload({ issuer: "A" })),
      update(shared, doc.version, payload({ issuer: "B" })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    doc = (await list()).documents.find((d: any) => d.id === shared);
    expect(
      (
        await update(
          shared,
          doc.version,
          payload({ links: [{ type: "lot", id: "lot-x" }] }),
        )
      ).status,
    ).toBe(400);
    await env.DB.prepare(
      "INSERT INTO ops_items(id,condominium_id,kind,title,audience,fiscal_year,payload,created_by,updated_by,created_at,updated_at) VALUES('vault-private-operation','demo-tilleuls','event','Evénement privé','management',2026,'{}','demo-manager','demo-manager',datetime('now'),datetime('now'))",
    ).run();
    const privateOp = await env.DB.prepare(
      "SELECT id FROM ops_items WHERE condominium_id='demo-tilleuls' AND audience='management' LIMIT 1",
    ).first<any>();
    expect(privateOp).not.toBeNull();
    expect(
      (
        await update(
          shared,
          doc.version,
          payload({ links: [{ type: "operation", id: privateOp.id }] }),
        )
      ).status,
    ).toBe(400);
    const privateDoc = (await list()).documents.find(
      (d: any) => d.id === restricted,
    );
    expect(
      (
        await update(
          restricted,
          privateDoc.version,
          payload({ links: [{ type: "lot", id: "lot-1" }] }),
        )
      ).status,
    ).toBe(200);
  });
  it("met en corbeille puis restaure sans supprimer fichier, version ou preuve", async () => {
    let d = (await list()).documents.find((d: any) => d.id === shared);
    const oldVersions = d.versions;
    expect(
      (await update(shared, d.version, { ...d.metadata, trashed: true }))
        .status,
    ).toBe(200);
    expect(
      (await list("demo-owner")).documents.some((x: any) => x.id === shared),
    ).toBe(false);
    expect(
      (await call(`${root}/documents/${versionId}/preview`, "demo-owner"))
        .status,
    ).toBe(404);
    d = (await list()).documents.find((d: any) => d.id === shared);
    expect(d.metadata.trashed).toBe(true);
    expect(d.versions).toEqual(oldVersions);
    expect((await call(`${root}/documents/${versionId}/download`)).status).toBe(
      200,
    );
    expect(
      (await update(shared, d.version, { ...d.metadata, trashed: false }))
        .status,
    ).toBe(200);
    expect(
      (await list("demo-owner")).documents.some((x: any) => x.id === shared),
    ).toBe(true);
  });
});
describe("Portefeuille et file multi-exercices autorisés", () => {
  it("retrouve un ancien dossier sans élargir les audiences", async () => {
    await env.DB.prepare(
      "INSERT INTO records(id,condominium_id,kind,title,audience,lot_id,payload,created_at,updated_at,updated_by,created_by,access_scope,fiscal_year) VALUES(?,?,'incident',?,'management',NULL,?,datetime('now'),datetime('now'),'demo-manager','demo-manager','owners',2025)",
    )
      .bind(
        "workspace-old-private",
        "demo-tilleuls",
        "Dossier ancien privé",
        JSON.stringify({
          status: "Signalé",
          priority: "Normale",
          dueDate: "2025-01-01",
        }),
      )
      .run();
    const management = (await (
      await call(`${root}/worklist?year=2026`)
    ).json()) as any;
    expect(
      management.items.find((i: any) => i.id === "workspace-old-private").year,
    ).toBe(2025);
    const tenant = (await (
      await call(`${root}/worklist`, "demo-tenant")
    ).json()) as any;
    expect(
      tenant.items.some((i: any) => i.id === "workspace-old-private"),
    ).toBe(false);
    expect(
      (await call(`${root}/records/workspace-old-private`, "demo-tenant"))
        .status,
    ).toBe(404);
    expect((await call(`${root}/records/workspace-old-private`)).status).toBe(
      200,
    );
    expect((await call(`${root}/worklist`, "demo-outsider")).status).toBe(403);
  });
  it("agrège uniquement les résidences autorisées et retire les accès révoqués", async () => {
    await env.DB.prepare(
      "INSERT INTO memberships(user_id,condominium_id,role) VALUES('demo-manager','demo-ateliers','owner')",
    ).run();
    try {
      const portfolio = (await (await call("/api/portfolio")).json()) as any;
      expect(portfolio.properties.map((p: any) => p.id).sort()).toEqual([
        "demo-ateliers",
        "demo-tilleuls",
      ]);
      const ateliers = portfolio.properties.find(
        (p: any) => p.id === "demo-ateliers",
      );
      expect(ateliers.lots).toBe(0);
      expect(ateliers).not.toHaveProperty("rentals");
      await env.DB.prepare(
        "UPDATE memberships SET revoked_at=datetime('now') WHERE user_id='demo-manager' AND condominium_id='demo-ateliers'",
      ).run();
      const revoked = (await (await call("/api/portfolio")).json()) as any;
      expect(revoked.properties.map((p: any) => p.id)).toEqual([
        "demo-tilleuls",
      ]);
    } finally {
      await env.DB.prepare(
        "DELETE FROM memberships WHERE user_id='demo-manager' AND condominium_id='demo-ateliers'",
      ).run();
    }
  });
});
describe("Vie résidentielle, patrimoine et entretien", () => {
  const classified = (extra: Record<string, unknown> = {}) => ({
    category: "Autre",
    status: "Signalé",
    priority: "Normale",
    description: "Description factuelle fictive",
    assignee: "",
    dueDate: "",
    comment: "",
    eventNature: "Incident",
    domain: "Équipement",
    occurredAt: "2026-10-01T10:00:00Z",
    location: "Hall A",
    equipmentMode: "none",
    equipmentDescription: "",
    symptom: "Panne",
    symptomOther: "",
    injuryLevel: "Non renseignée",
    relatedIncidentId: null,
    ...extra,
  });
  const report = (payload: unknown, equipmentId: string | null = null) => ({
    kind: "incident",
    title: "Signalement qualifié de test",
    audience: "shared",
    lotId: null,
    accessScope: "residents",
    equipmentId,
    payload,
  });
  it("permet l’équipement, le sous-équipement et le choix libre, sans rendre le lien obligatoire", async () => {
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(
            classified({
              equipmentMode: "catalogue",
              symptom: "Casse / dégradation",
            }),
            "eq-mirror",
          ),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(
            classified({
              equipmentMode: "other",
              equipmentDescription: "Cylindre du local",
              symptom: "Autre",
              symptomOther: "Clé bloquée",
            }),
          ),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified({ equipmentMode: "other" })),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified({ equipmentMode: "catalogue" }), "eq-inconnu"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified(), "eq-mirror"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified({ occurredAt: "2035-10-01T10:00:00Z" })),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified({ occurredAt: "2025-10-01T10:00:00Z" })),
        )
      ).status,
    ).toBe(400);
  });
  it("réserve le signalement de sécurité sans équipement à la gestion et au déclarant", async () => {
    const created = await call(
      `${root}/records`,
      "demo-tenant",
      "POST",
      report(classified({ domain: "Sécurité", symptom: "Intrusion" })),
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as any;
    for (const user of ["demo-manager", "demo-tenant"]) {
      const snapshot = (await (await call(root, user)).json()) as any;
      const row = snapshot.records.find((r: any) => r.id === id);
      expect(row.audience).toBe("management");
      expect(row.payload.confidentialReport).toBe(true);
    }
    for (const user of ["demo-owner", "demo-neighbor", "demo-supplier"])
      expect(
        ((await (await call(root, user)).json()) as any).records.some(
          (r: any) => r.id === id,
        ),
      ).toBe(false);
    expect(
      (await call(`${root}/records/${id}/followup`, "demo-tenant")).status,
    ).toBe(403);
    expect((await call(`${root}/records/${id}/followup`)).status).toBe(404);
  });
  it("garde le danger initial et l’accident distincts avec un suivi d’assurance privé", async () => {
    const parent = await call(
      `${root}/records`,
      "demo-tenant",
      "POST",
      report(
        classified({
          domain: "Espaces et circulation",
          symptom: "Obstacle / trou",
          location: "Parking",
        }),
      ),
    );
    const { id: source } = (await parent.json()) as any;
    const accidentPayload = classified({
      eventNature: "Accident corporel",
      domain: "Espaces et circulation",
      symptom: "Chute",
      injuryLevel: "Blessure signalée",
      occurredAt: "2026-10-02T10:00:00Z",
      relatedIncidentId: source,
      location: "Parking",
    });
    const accident = await call(
      `${root}/records`,
      "demo-tenant",
      "POST",
      report(accidentPayload),
    );
    expect(accident.status).toBe(201);
    const { id } = (await accident.json()) as any;
    const manager = (await (await call(root)).json()) as any;
    expect(
      manager.records.find((r: any) => r.id === source).payload.eventNature,
    ).toBe("Incident");
    expect(
      manager.records.find((r: any) => r.id === id).payload.relatedIncidentId,
    ).toBe(source);
    const followup = (await (
      await call(`${root}/records/${id}/followup`)
    ).json()) as any;
    expect(followup.insuranceStatus).toBe("À évaluer");
    expect(
      (await call(`${root}/records/${id}/followup`, "demo-owner")).status,
    ).toBe(403);
    expect(
      (await call(`${root}/records/${id}/followup`, "demo-outsider")).status,
    ).toBe(403);
    expect(
      (
        await call(`${root}/records/${id}/followup`, "demo-manager", "PUT", {
          ...followup,
          insuranceStatus: "Déclaré",
        })
      ).status,
    ).toBe(400);
    const updated = {
      ...followup,
      secured: true,
      insuranceStatus: "Déclaré",
      declaredOn: "2026-10-03",
      insuranceReference: "ASSURANCE-TEST-PRIVEE",
      notes: "Gestion privée",
    };
    expect(
      (
        await call(
          `${root}/records/${id}/followup`,
          "demo-manager",
          "PUT",
          updated,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          `${root}/records/${id}/followup`,
          "demo-manager",
          "PUT",
          updated,
        )
      ).status,
    ).toBe(409);
    const author = (await (await call(root, "demo-tenant")).json()) as any;
    expect(author.records.some((r: any) => r.id === id)).toBe(true);
    expect(JSON.stringify(author)).not.toContain("ASSURANCE-TEST-PRIVEE");
    expect(
      (
        await call(`${root}/records/${source}`, "demo-manager", "PATCH", {
          version: 1,
          payload: accidentPayload,
        })
      ).status,
    ).toBe(400);
  });
  it("refuse les liens étrangers, la chronologie inversée et l’élargissement d’un dossier privé", async () => {
    expect(
      (
        await call(
          `${root}/records`,
          "demo-manager",
          "POST",
          report(classified({ relatedIncidentId: "source-étrangère" })),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-tenant",
          "POST",
          report(classified({ relatedIncidentId: "incident-private" })),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/records`,
          "demo-manager",
          "POST",
          report(classified({ relatedIncidentId: "incident-private" })),
        )
      ).status,
    ).toBe(400);
    const parent = await call(
      `${root}/records`,
      "demo-manager",
      "POST",
      report(classified({ occurredAt: "2026-10-02T10:00:00Z" })),
    );
    const { id } = (await parent.json()) as any;
    expect(
      (
        await call(
          `${root}/records`,
          "demo-manager",
          "POST",
          report(classified({ relatedIncidentId: id })),
        )
      ).status,
    ).toBe(400);
    const recurrence = await call(
      `${root}/records`,
      "demo-manager",
      "POST",
      report(
        classified({
          occurredAt: "2026-10-03T10:00:00Z",
          relatedIncidentId: id,
        }),
      ),
    );
    expect(recurrence.status).toBe(201);
  });
  it("conserve un profil résidence commun, versionné et modifiable uniquement par la gestion", async () => {
    const get = await call(`${root}/residence`, "demo-tenant");
    expect(get.status).toBe(200);
    const initial = (await get.json()) as any;
    expect(initial.illustration).toBe(true);
    const body = {
      name: "Résidence de maisons test",
      address: "Adresse fictive",
      residenceKind: "houses",
      description: "Ensemble de maisons",
      version: initial.profile_version,
    };
    expect(
      (await call(`${root}/residence`, "demo-owner", "PUT", body)).status,
    ).toBe(403);
    expect(
      (await call(`${root}/residence`, "demo-manager", "PUT", body)).status,
    ).toBe(200);
    expect(
      (await call(`${root}/residence`, "demo-manager", "PUT", body)).status,
    ).toBe(409);
    expect((await call(`${root}/residence`, "demo-outsider")).status).toBe(403);
    expect(
      ((await (await call(`${root}/residence`, "demo-tenant")).json()) as any)
        .residence_kind,
    ).toBe("houses");
  });
  it("conserve et protège la photo de résidence et refuse les faux formats", async () => {
    const current = (await (await call(`${root}/residence`)).json()) as any;
    const form = (mime: string, bytes: Uint8Array) => {
      const f = new FormData();
      f.set("version", String(current.profile_version));
      f.set(
        "file",
        new File([new Uint8Array(bytes)], "photo.png", { type: mime }),
      );
      return f;
    };
    const png = readFileSync("public/images/residence-illustration.png");
    expect(
      (
        await call(
          `${root}/residence/photo`,
          "demo-tenant",
          "POST",
          form("image/png", png),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `${root}/residence/photo`,
          "demo-manager",
          "POST",
          form("image/png", new Uint8Array([1, 2, 3])),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/residence/photo`,
          "demo-manager",
          "POST",
          form("image/png", png),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          `${root}/residence/photo`,
          "demo-manager",
          "POST",
          form("image/png", png),
        )
      ).status,
    ).toBe(409);
    const download = await call(`${root}/residence/photo`, "demo-tenant");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(
      new Uint8Array(png),
    );
    expect(
      (await call(`${root}/residence/photo`, "demo-outsider")).status,
    ).toBe(403);
  });
  it("protège le suivi financier et isole les quotes-parts de chaque propriétaire", async () => {
    const endpoint = `${root}/budget?year=2024`;
    const budget = {
      amountCents: 1200000,
      notes: "Budget de test",
      version: 0,
    };
    expect((await call(endpoint, "demo-tenant")).status).toBe(403);
    expect((await call(endpoint, "demo-supplier")).status).toBe(403);
    expect((await call(endpoint, "demo-outsider")).status).toBe(403);
    expect((await call(endpoint, "demo-owner", "PUT", budget)).status).toBe(
      403,
    );
    expect((await call(endpoint, "demo-manager", "PUT", budget)).status).toBe(
      200,
    );
    expect((await call(endpoint, "demo-manager", "PUT", budget)).status).toBe(
      409,
    );
    const invoice = {
      title: "Ascenseur",
      supplier: "Entreprise fictive",
      invoiceDate: "2024-03-01",
      amountCents: 100000,
      paidCents: 40000,
      cancelled: false,
      notes: "",
      version: 0,
    };
    expect(
      (
        await call(
          `${root}/budget/invoices?year=2024`,
          "demo-owner",
          "POST",
          invoice,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `${root}/budget/invoices?year=2024`,
          "demo-manager",
          "POST",
          { ...invoice, paidCents: 200000 },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/budget/invoices?year=2024`,
          "demo-manager",
          "POST",
          { ...invoice, invoiceDate: "2025-03-01" },
        )
      ).status,
    ).toBe(400);
    const created = await call(
      `${root}/budget/invoices?year=2024`,
      "demo-manager",
      "POST",
      invoice,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as any;
    const own = (await (await call(endpoint, "demo-owner")).json()) as any;
    expect(own.shares.map((l: any) => l.lotId)).toEqual(["lot-1"]);
    expect(own.summary.invoicedCents).toBe(100000);
    expect(own.summary.unpaidCents).toBe(60000);
    const other = (await (await call(endpoint, "demo-neighbor")).json()) as any;
    expect(other.shares.some((l: any) => l.lotId === "lot-1")).toBe(false);
    expect(
      ((await (await call(`${root}/budget?year=2025`)).json()) as any).invoices,
    ).toEqual([]);
    const edit = {
      ...invoice,
      version: 1,
      cancelled: true,
      notes: "Doublon de test",
    };
    expect(
      (
        await call(
          `${root}/budget/invoices/${id}?year=2024`,
          "demo-manager",
          "PATCH",
          edit,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          `${root}/budget/invoices/${id}?year=2024`,
          "demo-manager",
          "PATCH",
          edit,
        )
      ).status,
    ).toBe(409);
    expect(
      ((await (await call(endpoint)).json()) as any).summary.invoicedCents,
    ).toBe(0);
    expect(
      (
        await env.DB.prepare(
          "SELECT snapshot FROM item_revisions WHERE resource_id=?",
        )
          .bind(id)
          .all()
      ).results,
    ).toHaveLength(1);
  });
  it("expose une santé locale sans données personnelles et conserve le refus distant", async () => {
    const result = await call("/api/health");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      status: "ok",
      version: "0.1.0",
      revision: "development",
      instance: "development",
      migrations: [],
      demo: true,
    });
    expect(
      (
        await call(
          "/api/health",
          "demo-manager",
          "GET",
          undefined,
          "https://domolyma.example",
        )
      ).status,
    ).toBe(503);
  });
  it("applique conjointement le public du document et le lot, sans élargir les anciens partages", async () => {
    const form = (scope: string, lot: string | null) => {
      const f = new FormData();
      f.set("title", "Pièce ciblée");
      f.set("audience", lot ? "lot" : "shared");
      if (lot) f.set("lotId", lot);
      f.set("accessScope", scope);
      f.set(
        "file",
        new File(["Pièce fictive"], "piece.txt", { type: "text/plain" }),
      );
      return f;
    };
    const council = await call(
      `${root}/documents`,
      "demo-manager",
      "POST",
      form("council", "lot-1"),
    );
    expect(council.status).toBe(201);
    const { versionId } = (await council.json()) as any;
    expect(
      (await call(`${root}/documents/${versionId}/download`, "demo-owner"))
        .status,
    ).toBe(404);
    expect(
      (await call(`${root}/documents/${versionId}/download`, "demo-council"))
        .status,
    ).toBe(404);
    const residents = await call(
      `${root}/documents?year=2025`,
      "demo-manager",
      "POST",
      form("residents", null),
    );
    expect(residents.status).toBe(201);
    const doc = (await residents.json()) as any;
    const current = (await (await call(root, "demo-tenant")).json()) as any;
    expect(current.records.some((r: any) => r.id === doc.id)).toBe(false);
    const previous = (await (
      await call(`${root}?year=2025`, "demo-tenant")
    ).json()) as any;
    expect(previous.records.some((r: any) => r.id === doc.id)).toBe(true);
    expect(
      (await call(`${root}/documents/${doc.versionId}/download`, "demo-tenant"))
        .status,
    ).toBe(200);
  });
  it("autorise les pièces du prestataire uniquement sur sa propre intervention", async () => {
    const form = (opsId: string) => {
      const f = new FormData();
      f.set("title", "Rapport prestataire");
      f.set("audience", "shared");
      f.set("accessScope", "assigned");
      f.set("opsId", opsId);
      f.set(
        "file",
        new File(["Rapport fictif"], "rapport.txt", { type: "text/plain" }),
      );
      return f;
    };
    expect(
      (
        await call(
          `${root}/documents`,
          "demo-supplier",
          "POST",
          form("eq-lift-b"),
        )
      ).status,
    ).toBe(403);
    const response = await call(
      `${root}/documents`,
      "demo-supplier",
      "POST",
      form("visit-lift"),
    );
    expect(response.status).toBe(201);
    const { versionId } = (await response.json()) as any;
    expect(
      (await call(`${root}/documents/${versionId}/download`, "demo-supplier"))
        .status,
    ).toBe(200);
    expect(
      (await call(`${root}/documents/${versionId}/download`, "demo-owner"))
        .status,
    ).toBe(404);
  });
  it("sépare locataire, propriétaire occupant et propriétaire de parking également locataire", async () => {
    const tenant = (await (await call(root, "demo-tenant")).json()) as any;
    expect(tenant.roles).toEqual(["resident", "tenant"]);
    expect(tenant.lots.map((l: any) => l.id)).toEqual(["lot-2"]);
    expect(tenant.records.some((r: any) => r.id === "incident-private")).toBe(
      false,
    );
    expect(tenant.records.some((r: any) => r.kind === "assembly")).toBe(false);
    expect(tenant.lots[0]).not.toHaveProperty("owner_id");
    expect(tenant.lots[0]).not.toHaveProperty("intercom_program");
    expect(JSON.stringify(tenant)).not.toContain("CODE-FICTIF");
    expect(JSON.stringify(tenant)).not.toContain("VIGIK-FICTIF");
    const resident = (await (await call(root, "demo-resident")).json()) as any;
    expect(resident.roles).toContain("owner");
    expect(resident.roles).toContain("resident");
    const hybrid = (await (await call(root, "demo-hybrid")).json()) as any;
    expect(hybrid.roles).toEqual(["owner", "resident", "tenant"]);
    expect(
      hybrid.lots.find((l: any) => l.id === "lot-4").apartment_number,
    ).toBe("");
  });
  it("permet au locataire de signaler incident et déménagement sans accès de gestion", async () => {
    const incident = {
      kind: "incident",
      title: "Miroir détaché",
      audience: "shared",
      lotId: null,
      accessScope: "residents",
      equipmentId: "eq-mirror",
      payload: {
        status: "Signalé",
        priority: "Normale",
        description: "Miroir de la cabine A",
        assignee: "",
        dueDate: "",
        comment: "",
      },
    };
    const response = await call(
      `${root}/records`,
      "demo-tenant",
      "POST",
      incident,
    );
    expect(response.status).toBe(201);
    const id = ((await response.json()) as any).id;
    const owner = (await (await call(root, "demo-owner")).json()) as any;
    expect(owner.records.find((r: any) => r.id === id).equipment_id).toBe(
      "eq-mirror",
    );
    const event = {
      kind: "event",
      title: "Déménagement fictif",
      audience: "residents",
      lotId: null,
      assignedTo: null,
      fiscalYear: 2026,
      payload: {
        category: "Déménagement",
        startsAt: "2026-10-25T09:00",
        endsAt: "2026-10-25T12:00",
        location: "Bâtiment B",
        description: "Passage dans le hall",
      },
    };
    expect(
      (await call(`${root}/operations`, "demo-tenant", "POST", event)).status,
    ).toBe(201);
    expect(
      (
        await call(`${root}/operations`, "demo-tenant", "POST", {
          ...event,
          audience: "management",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`${root}/records`, "demo-tenant", "POST", {
          ...incident,
          accessScope: "owners",
        })
      ).status,
    ).toBe(403);
  });
  it("respecte le consentement de contact et donne le gestionnaire comme repli", async () => {
    let tenant = (await (await call(root, "demo-tenant")).json()) as any;
    expect(tenant.contacts.some((c: any) => c.id === "demo-manager")).toBe(
      true,
    );
    expect(tenant.contacts.some((c: any) => c.id === "demo-owner")).toBe(false);
    expect(JSON.stringify(tenant)).not.toContain("prive@example.invalid");
    expect(
      (
        await call(`${root}/contacts/me`, "demo-owner", "PUT", {
          visible: true,
          email: "alex@example.invalid",
          phone: "",
        })
      ).status,
    ).toBe(200);
    tenant = (await (await call(root, "demo-tenant")).json()) as any;
    expect(tenant.contacts.find((c: any) => c.id === "demo-owner").email).toBe(
      "alex@example.invalid",
    );
    await call(`${root}/contacts/me`, "demo-owner", "PUT", {
      visible: false,
      email: "alex@example.invalid",
      phone: "",
    });
  });
  it("limite le prestataire à ses affectations et au compte rendu, avec conflit de version", async () => {
    const supplier = (await (await call(root, "demo-supplier")).json()) as any;
    expect(supplier.lots).toEqual([]);
    expect(supplier.operations.some((o: any) => o.id === "eq-lift-b")).toBe(
      false,
    );
    expect(
      supplier.operations.some((o: any) => o.id === "contract-garden"),
    ).toBe(false);
    expect(
      supplier.records.every(
        (r: any) => r.kind === "document" && r.access_scope === "assigned",
      ),
    ).toBe(true);
    const visit = supplier.operations.find((o: any) => o.id === "visit-lift");
    const update = {
      version: visit.version,
      title: "Titre frauduleux",
      assignedTo: "demo-owner",
      payload: {
        performedOn: "2026-11-05",
        status: "Réalisé",
        report: "Visite effectuée",
        reservations: "",
      },
    };
    expect(
      (
        await call(
          `${root}/operations/visit-lift`,
          "demo-supplier",
          "PATCH",
          update,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          `${root}/operations/visit-lift`,
          "demo-supplier",
          "PATCH",
          update,
        )
      ).status,
    ).toBe(409);
    const row = await env.DB.prepare(
      "SELECT title,assigned_to,payload FROM ops_items WHERE id=?",
    )
      .bind("visit-lift")
      .first<any>();
    expect(row.title).toBe(visit.title);
    expect(row.assigned_to).toBe("demo-supplier");
    expect(
      (
        await call(
          `${root}/operations/eq-lift-b`,
          "demo-supplier",
          "PATCH",
          update,
        )
      ).status,
    ).toBe(403);
  });
  it("conserve les exercices précédents et classe les pièces et événements dans l’exercice choisi", async () => {
    const event = {
      kind: "event",
      title: "Information historique",
      audience: "residents",
      lotId: null,
      assignedTo: null,
      fiscalYear: 2025,
      payload: {
        category: "Information",
        startsAt: "2025-10-25T09:00",
        endsAt: "",
        location: "Hall",
        description: "Historique fictif",
      },
    };
    const response = await call(
      `${root}/operations?year=2025`,
      "demo-manager",
      "POST",
      event,
    );
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as any;
    const current = (await (await call(root, "demo-owner")).json()) as any;
    expect(current.operations.some((o: any) => o.id === id)).toBe(false);
    const old = (await (
      await call(`${root}?year=2025`, "demo-owner")
    ).json()) as any;
    expect(old.operations.some((o: any) => o.id === id)).toBe(true);
    expect(old.records.every((r: any) => r.fiscal_year === 2025)).toBe(true);
    expect((await call(`${root}?year=1999`)).status).toBe(400);
  });
  it("saisit un parking autonome et rejette des références étrangères, cycles et doublons", async () => {
    const lot = {
      number: "P99",
      label: "Parking autonome",
      ownerId: "demo-owner",
      buildingId: null,
      lotType: "parking",
      areaM2: "12,50",
      weight: 10,
      useType: "ancillary",
      declaredActivity: "",
      apartmentNumber: "",
      parentLotId: null,
      intercomDisplay: "",
      intercomProgram: "",
      mailbox: "",
    };
    const response = await call(`${root}/lots`, "demo-manager", "POST", lot);
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as any;
    expect(
      (await call(`${root}/lots`, "demo-manager", "POST", lot)).status,
    ).toBe(409);
    expect(
      (
        await call(`${root}/lots/${id}`, "demo-manager", "PATCH", {
          ...lot,
          parentLotId: id,
          version: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`${root}/lots`, "demo-tenant", "POST", {
          ...lot,
          number: "P98",
        })
      ).status,
    ).toBe(403);
  });
  it("exige un détenteur lié au lot et garde les séries privées", async () => {
    const input = {
      kind: "access",
      title: "Badge test",
      audience: "lot",
      lotId: "lot-1",
      assignedTo: null,
      fiscalYear: 2026,
      payload: {
        type: "Badge Vigik",
        quantity: 1,
        holderId: "demo-tenant",
        serial: "SECRET-SERIE",
        internalCode: "SECRET-CODE",
        handedOn: "2026-10-23",
        returnedOn: "",
        opensEquipmentIds: ["eq-gate"],
        notes: "",
      },
    };
    expect(
      (await call(`${root}/operations`, "demo-manager", "POST", input)).status,
    ).toBe(400);
    expect(
      (
        await call(`${root}/operations`, "demo-manager", "POST", {
          ...input,
          lotId: "lot-2",
        })
      ).status,
    ).toBe(201);
    const tenant = (await (await call(root, "demo-tenant")).json()) as any;
    expect(JSON.stringify(tenant)).not.toContain("SECRET-SERIE");
    expect(JSON.stringify(tenant)).not.toContain("SECRET-CODE");
  });
});
describe("Isolation et mutations API avec D1/R2 locaux isolés", () => {
  it("refuse une copropriété étrangère et le mode démo distant", async () => {
    expect((await call(root, "demo-outsider")).status).toBe(403);
    expect(
      (
        await call(
          root,
          "demo-manager",
          "GET",
          undefined,
          "https://example.com",
        )
      ).status,
    ).toBe(503);
  });
  it("filtre les documents privés, les lots et les compteurs à la source", async () => {
    const owner = (await (await call(root, "demo-owner")).json()) as any;
    expect(owner.records.some((r: any) => r.id === "incident-private")).toBe(
      false,
    );
    expect(owner.lots.map((l: any) => l.id)).toContain("lot-1");
    expect(owner.lots.every((l: any) => l.owner_id === "demo-owner")).toBe(
      true,
    );
    expect(owner.members).toEqual([]);
    expect(owner.audit).toEqual([]);
    const neighbor = (await (await call(root, "demo-neighbor")).json()) as any;
    expect(neighbor.records.some((r: any) => r.id === "incident-private")).toBe(
      true,
    );
  });
  it("refuse la lecture après révocation", async () => {
    await env.DB.prepare(
      "UPDATE memberships SET revoked_at='2026-10-23' WHERE user_id='demo-neighbor'",
    ).run();
    expect((await call(root, "demo-neighbor")).status).toBe(403);
    await env.DB.prepare(
      "UPDATE memberships SET revoked_at=NULL WHERE user_id='demo-neighbor'",
    ).run();
  });
  it("détecte un conflit sans perdre la première modification et exige un motif", async () => {
    const payload = {
      status: "En cours",
      priority: "Normale",
      description: "Test",
      assignee: "Démo",
      dueDate: "",
      comment: "",
    };
    expect(
      (
        await call(`${root}/records/incident-1`, "demo-manager", "PATCH", {
          version: 1,
          payload,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`${root}/records/incident-1`, "demo-manager", "PATCH", {
          version: 1,
          payload,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(`${root}/records/incident-1`, "demo-manager", "PATCH", {
          version: 2,
          payload: { ...payload, status: "Clôturé" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`${root}/records/incident-1`, "demo-owner", "PATCH", {
          version: 2,
          payload,
        })
      ).status,
    ).toBe(403);
  });
  it("bloque un lot étranger, une date invalide et une écriture hors origine", async () => {
    const input = {
      kind: "incident",
      title: "Test",
      audience: "lot",
      lotId: "lot-x",
      payload: {
        status: "Signalé",
        priority: "Normale",
        description: "Test",
        assignee: "",
        dueDate: "",
        comment: "",
      },
    };
    expect(
      (await call(`${root}/records`, "demo-manager", "POST", input)).status,
    ).toBe(400);
    expect(
      (
        await call(`${root}/records`, "demo-manager", "POST", {
          ...input,
          lotId: "lot-1",
          payload: { ...input.payload, dueDate: "2026-02-31" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          new Request(`http://localhost:5173${root}/records`, {
            method: "POST",
            headers: { Origin: "https://foreign.test" },
          }),
          env,
        )
      ).status,
    ).toBe(403);
  });
  it("persiste une simulation exacte sans émission et réserve les finances au gestionnaire", async () => {
    const input = {
      kind: "fund",
      title: "Test charges",
      audience: "management",
      lotId: null,
      payload: {
        amountCents: 100000,
        dueDate: "2026-11-01",
        decision: "Décision fictive",
      },
    };
    expect(
      (await call(`${root}/records`, "demo-owner", "POST", input)).status,
    ).toBe(403);
    const response = await call(
      `${root}/records`,
      "demo-manager",
      "POST",
      input,
    );
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as any;
    const row = await env.DB.prepare("SELECT payload FROM records WHERE id=?")
      .bind(id)
      .first<{ payload: string }>();
    const p = JSON.parse(row!.payload);
    expect(p.allocation.reduce((s: number, l: any) => s + l.cents, 0)).toBe(
      100000,
    );
    expect(p.status).toContain("non émise");
  });
  it("versionne un fichier R2 privé et en contrôle le téléchargement", async () => {
    const form = () => {
      const f = new FormData();
      f.set("title", "Pièce privée");
      f.set("audience", "lot");
      f.set("lotId", "lot-2");
      f.set(
        "file",
        new File(["Contenu synthétique"], "preuve.txt", { type: "text/plain" }),
      );
      return f;
    };
    const response = await call(
      `${root}/documents`,
      "demo-manager",
      "POST",
      form(),
    );
    expect(response.status).toBe(201);
    const { id, versionId, sha256 } = (await response.json()) as any;
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await call(`${root}/documents/${versionId}/download`, "demo-owner"))
        .status,
    ).toBe(404);
    expect(
      await (
        await call(`${root}/documents/${versionId}/download`, "demo-neighbor")
      ).text(),
    ).toBe("Contenu synthétique");
    const next = form();
    next.set("recordId", id);
    expect(
      (await call(`${root}/documents`, "demo-manager", "POST", next)).status,
    ).toBe(201);
    const versions = await env.DB.prepare(
      "SELECT id FROM document_versions WHERE record_id=? AND state='ready'",
    )
      .bind(id)
      .all();
    expect(versions.results).toHaveLength(2);
    const snapshot = (await (await call(root, "demo-owner")).json()) as any;
    expect(snapshot.versions.some((v: any) => v.record_id === id)).toBe(false);
  });
});

describe("Dossiers locatifs privés et calendrier", () => {
  let contactId = "",
    rentalId = "";
  const rental = (overrides: any = {}) => ({
    lotId: "lot-1",
    kind: "booking",
    title: "Séjour fictif",
    status: "confirmed",
    startsOn: "2026-11-01",
    endsOn: "2026-11-05",
    payload: {
      contactIds: [contactId],
      rentalType: "seasonal",
      channel: "Airbnb",
      reference: "DEMO",
      rentCents: 40000,
      chargesCents: 2000,
      depositCents: 10000,
      actualStart: "",
      actualEnd: "",
      notes: "",
    },
    ...overrides,
  });
  it("crée un contact privé pour le bailleur et refuse le locataire sans propriété", async () => {
    expect(
      (
        await call(`${root}/rentals/contacts`, "demo-tenant", "POST", {
          name: "Test",
          email: "",
          phone: "",
          notes: "",
        })
      ).status,
    ).toBe(403);
    const response = await call(
      `${root}/rentals/contacts`,
      "demo-owner",
      "POST",
      {
        name: "Voyageur Démo",
        email: "voyageur@example.invalid",
        phone: "",
        notes: "Dossier privé",
      },
    );
    expect(response.status).toBe(201);
    contactId = ((await response.json()) as any).id;
  });
  it("enregistre une réservation sur le lot canonique possédé", async () => {
    const response = await call(
      `${root}/rentals/entries`,
      "demo-owner",
      "POST",
      rental(),
    );
    expect(response.status).toBe(201);
    rentalId = ((await response.json()) as any).id;
    const owner = (await (
      await call(`${root}/rentals`, "demo-owner")
    ).json()) as any;
    expect(owner.entries.find((r: any) => r.id === rentalId).lot_id).toBe(
      "lot-1",
    );
    expect(
      owner.occupation.find((o: any) => o.lotId === "lot-1").planned.days,
    ).toBe(4);
    expect(
      owner.occupation.find((o: any) => o.lotId === "lot-1").actual.days,
    ).toBe(0);
  });
  it("ne donne pas au syndic, au locataire ou à un autre propriétaire les baux d’autrui", async () => {
    for (const user of ["demo-manager", "demo-tenant", "demo-neighbor"]) {
      const snapshot = (await (
        await call(`${root}/rentals`, user)
      ).json()) as any;
      expect(snapshot.entries.some((r: any) => r.id === rentalId)).toBe(false);
      expect(snapshot.contacts.some((c: any) => c.id === contactId)).toBe(
        false,
      );
    }
    expect(
      (
        await call(
          `${root}/rentals/entries/${rentalId}`,
          "demo-manager",
          "PATCH",
          { ...rental(), version: 1 },
        )
      ).status,
    ).toBe(404);
    expect(
      (await call(`${root}/rentals/entries`, "demo-manager", "POST", rental()))
        .status,
    ).toBe(403);
  });
  it("bloque les chevauchements en base, autorise deux séjours contigus et rejette une fin invalide", async () => {
    expect(
      (
        await call(
          `${root}/rentals/entries`,
          "demo-owner",
          "POST",
          rental({ startsOn: "2026-11-04", endsOn: "2026-11-08" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `${root}/rentals/entries`,
          "demo-owner",
          "POST",
          rental({ startsOn: "2026-11-05", endsOn: "2026-11-08" }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          `${root}/rentals/entries`,
          "demo-owner",
          "POST",
          rental({ endsOn: "2026-11-01" }),
        )
      ).status,
    ).toBe(400);
  });
  it("empêche un bail actif de recouvrir une réservation et détecte les conflits de version", async () => {
    expect(
      (
        await call(
          `${root}/rentals/entries`,
          "demo-owner",
          "POST",
          rental({ kind: "lease", status: "active", endsOn: "" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `${root}/rentals/entries/${rentalId}`,
          "demo-owner",
          "PATCH",
          { ...rental({ status: "cancelled" }), version: 1 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          `${root}/rentals/entries/${rentalId}`,
          "demo-owner",
          "PATCH",
          { ...rental(), version: 1 },
        )
      ).status,
    ).toBe(409);
  });
  it("refuse les contacts étrangers et ne compte pas les brouillons comme jours occupés", async () => {
    expect(
      (
        await call(`${root}/rentals/entries`, "demo-owner", "POST", {
          ...rental({ status: "draft" }),
          payload: { ...rental().payload, contactIds: ["foreign"] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${root}/rentals/entries`,
          "demo-owner",
          "POST",
          rental({
            status: "draft",
            startsOn: "2026-12-01",
            endsOn: "2026-12-31",
          }),
        )
      ).status,
    ).toBe(201);
    const snapshot = (await (
      await call(`${root}/rentals`, "demo-owner")
    ).json()) as any;
    expect(
      snapshot.occupation.find((o: any) => o.lotId === "lot-1").planned.days,
    ).toBe(3);
  });
});
