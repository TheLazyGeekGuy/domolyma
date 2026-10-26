import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../apps/api";
let mf: Miniflare;
let env: Parameters<typeof worker.fetch>[1];
let cookie = "",
  csrf = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token = csrf,
  session = cookie,
) {
  return worker.fetch(
    new Request(`http://localhost:5173${path}`, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        Cookie: session,
        "X-CSRF-Token": token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}
function dbInsert(login: string, count: number, start: number) {
  return env.DB.prepare(
    "INSERT OR REPLACE INTO auth_attempts VALUES(?,?,?)",
  ).bind(login, start, count);
}
async function switchGhost(userId: string | null) {
  const oldCookie = cookie,
    oldCsrf = csrf;
  const before = await env.DB.prepare(
    "SELECT expires_at FROM auth_sessions ORDER BY expires_at DESC LIMIT 1",
  ).first<{ expires_at: number }>();
  const response = await call("/api/auth/impersonate", "POST", { userId });
  expect(response.status).toBe(200);
  cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  csrf = ((await response.json()) as any).csrfToken;
  expect(cookie).not.toBe(oldCookie);
  expect(csrf).not.toBe(oldCsrf);
  expect(
    (await call("/api/bootstrap", "GET", undefined, oldCsrf, oldCookie)).status,
  ).toBe(401);
  expect(
    (
      await call(
        "/api/auth/impersonate",
        "POST",
        { userId: null },
        oldCsrf,
        cookie,
      )
    ).status,
  ).toBe(403);
  expect(
    (await env.DB.prepare(
      "SELECT expires_at FROM auth_sessions ORDER BY expires_at DESC LIMIT 1",
    ).first<{ expires_at: number }>())!.expires_at,
  ).toBe(before!.expires_at);
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
  for (const file of readdirSync("migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(`migrations/${file}`, "utf8").replace(
      /^--.*$/gm,
      "",
    );
    for (const line of sql
      .replace(/\n(?=\()/g, " ")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean))
      await env.DB.exec(line);
  }
  await env.DB.exec(
    "INSERT INTO users VALUES('owner-demo','Propriétaire fictif'),('ghost-tenant','Locataire fictif'),('ghost-owner','Propriétaire fictif');",
  );
  await env.DB.exec(
    "INSERT INTO condominiums(id,name,address,fiscal_year) VALUES('residence-fixture','Résidence fictive','Ville fictive',2026);",
  );
  await env.DB.exec(
    "INSERT INTO fiscal_years VALUES('residence-fixture',2026,'open');",
  );
  await env.DB.exec(
    "INSERT INTO memberships VALUES('owner-demo','residence-fixture','council',NULL),('ghost-tenant','residence-fixture','tenant',NULL),('ghost-owner','residence-fixture','owner',NULL);",
  );
  await env.DB.exec(
    "INSERT INTO lots(id,condominium_id,number,label,owner_id,weight) VALUES('lot-a','residence-fixture','0001','A01','owner-demo',345),('lot-2','residence-fixture','0002','Parking',NULL,14);",
  );
  await env.DB.exec(
    "INSERT INTO lot_relations VALUES('ownership','lot-a','owner-demo','owner',NULL,'2026-01-01',NULL);",
  );
  await env.DB.exec(
    "INSERT INTO installation_settings VALUES(1,'real','owner-demo','2026-10-23');",
  );
  await env.DB.exec(
    "INSERT INTO auth_accounts(user_id,login,administrator,created_at) VALUES('owner-demo','owner-demo',1,'2026-10-23');",
  );
  await env.DB.exec(
    `INSERT INTO ghost_profiles VALUES('ghost-tenant','residence-fixture','Locataire fictif','tenant','["lot-a"]','[]'),('ghost-owner','residence-fixture','Propriétaire fictif','owner','["lot-a"]','[]');`,
  );
  await env.DB.exec(
    `INSERT INTO records(id,condominium_id,kind,title,audience,payload,created_at,updated_at,updated_by,created_by,fiscal_year) VALUES('private','residence-fixture','document','Privé gestion','management','{}','2026-10-23','2026-10-23','owner-demo','owner-demo',2026),('owners','residence-fixture','document','Document propriétaires','shared','{}','2026-10-23','2026-10-23','owner-demo','owner-demo',2026);`,
  );
});
afterAll(async () => {
  await mf.dispose();
});
describe("Compte réel et mode fantôme", () => {
  it("ne laisse ni un cookie démo ni une session absente accéder aux données réelles", async () => {
    expect(
      (
        await call(
          "/api/bootstrap",
          "GET",
          undefined,
          "",
          "domolyma_demo=demo-manager",
        )
      ).status,
    ).toBe(401);
    expect(
      ((await (await call("/api/auth/session")).json()) as any).setupLogin,
    ).toBe("owner-demo");
    expect(
      (
        await call(
          "/api/demo/profile",
          "POST",
          { userId: "demo-manager" },
          "",
          "",
        )
      ).status,
    ).toBe(401);
  });
  it("active une seule fois le compte sans exposer le hash et pose un cookie HttpOnly", async () => {
    expect(
      (
        await call("/api/auth/setup", "POST", {
          login: "owner-demo",
          password: "short",
        })
      ).status,
    ).toBe(400);
    const r = await call("/api/auth/setup", "POST", {
      login: "owner-demo",
      password: "MotDePasseDeTest-2026!",
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(r.headers.get("Set-Cookie")).toContain("SameSite=Strict");
    cookie = r.headers.get("Set-Cookie")!.split(";")[0];
    const result = (await r.json()) as any;
    csrf = result.csrfToken;
    expect(JSON.stringify(result)).not.toContain("password_hash");
    expect(
      (
        await call("/api/auth/setup", "POST", {
          login: "owner-demo",
          password: "AutreMotDePasse-2026!",
        })
      ).status,
    ).toBe(409);
    const stored = await env.DB.prepare(
      "SELECT password_hash FROM auth_accounts",
    ).first<{ password_hash: string }>();
    expect(stored!.password_hash).toMatch(/^\$2[ab]\$12\$/);
  });
  it("distingue le rôle conseil syndical des droits d’administration locale", async () => {
    const boot = (await (await call("/api/bootstrap")).json()) as any;
    expect(boot.user.name).toBe("Propriétaire fictif");
    expect(boot.condominiums[0].role).toBe("council");
    expect(boot.administrator).toBe(true);
    const data = (await (
      await call("/api/condominiums/residence-fixture")
    ).json()) as any;
    expect(data.roles).toEqual(["owner", "council"]);
    expect(data.canManage).toBe(true);
    expect(data.lots).toHaveLength(2);
    expect(data.records).toHaveLength(2);
    expect((await call("/api/admin/overview")).status).toBe(200);
  });
  it("exige le CSRF, bloque le sélecteur démo et les profils non autorisés", async () => {
    expect(
      (
        await call(
          "/api/auth/impersonate",
          "POST",
          { userId: "ghost-tenant" },
          "",
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("/api/demo/profile", "POST", { userId: "demo-manager" }))
        .status,
    ).toBe(403);
    expect(
      (await call("/api/auth/impersonate", "POST", { userId: "owner-demo" }))
        .status,
    ).toBe(403);
  });
  it("simule les droits du locataire sans lui attribuer une occupation réelle ni permettre une écriture", async () => {
    await switchGhost("ghost-tenant");
    const boot = (await (await call("/api/bootstrap")).json()) as any;
    expect(boot.ghost.id).toBe("ghost-tenant");
    expect(boot.administrator).toBe(false);
    const data = (await (
      await call("/api/condominiums/residence-fixture")
    ).json()) as any;
    expect(data.roles).toEqual(["resident", "tenant"]);
    expect(data.lots.map((l: any) => l.id)).toEqual(["lot-a"]);
    expect(data.records).toHaveLength(0);
    expect(data.readOnly).toBe(true);
    expect(
      (await call("/api/condominiums/residence-fixture/records", "POST", {}))
        .status,
    ).toBe(403);
    expect((await call("/api/admin/overview")).status).toBe(403);
    expect(
      (
        await env.DB.prepare(
          "SELECT * FROM lot_relations WHERE user_id='ghost-tenant'",
        ).all()
      ).results,
    ).toHaveLength(0);
    await switchGhost("ghost-owner");
    const owner = (await (
      await call("/api/condominiums/residence-fixture")
    ).json()) as any;
    expect(owner.records.map((r: any) => r.id)).toEqual(["owners"]);
    expect(
      (await call("/api/condominiums/residence-fixture/governance")).status,
    ).toBe(200);
    expect(
      (await call("/api/condominiums/residence-fixture/governance", "POST", {}))
        .status,
    ).toBe(403);
    await switchGhost(null);
    expect(((await (await call("/api/bootstrap")).json()) as any).user.id).toBe(
      "owner-demo",
    );
  });
  it("journalise les changements, révoque la session et vérifie le mot de passe", async () => {
    const events = await env.DB.prepare(
      "SELECT action FROM auth_events ORDER BY id",
    ).all<{ action: string }>();
    expect(events.results.map((e) => e.action)).toContain("ghost_enter");
    expect(events.results.map((e) => e.action)).toContain("ghost_exit");
    expect((await call("/api/auth/logout", "POST")).status).toBe(204);
    expect((await call("/api/bootstrap")).status).toBe(401);
    expect(
      (
        await call("/api/auth/login", "POST", {
          login: "owner-demo",
          password: "MotDePasseErroné",
        })
      ).status,
    ).toBe(401);
    const r = await call("/api/auth/login", "POST", {
      login: "owner-demo",
      password: "MotDePasseDeTest-2026!",
    });
    expect(r.status).toBe(200);
    cookie = r.headers.get("Set-Cookie")!.split(";")[0];
    csrf = ((await r.json()) as any).csrfToken;
    expect(((await (await call("/api/bootstrap")).json()) as any).ghost).toBe(
      null,
    );
  });
  it("isole la limite d’essais par identifiant et fait expirer les compteurs", async () => {
    const now = Date.now();
    await env.DB.batch([
      dbInsert("*", 30, now),
      dbInsert("autre-compte", 10, now),
    ]);
    expect(
      (
        await call("/api/auth/login", "POST", {
          login: "autre-compte",
          password: "MotDePasseErroné",
        })
      ).status,
    ).toBe(429);
    const good = await call("/api/auth/login", "POST", {
      login: "owner-demo",
      password: "MotDePasseDeTest-2026!",
    });
    expect(good.status).toBe(200);
    const priorCookie = cookie,
      priorCsrf = csrf;
    cookie = good.headers.get("Set-Cookie")!.split(";")[0];
    csrf = ((await good.json()) as any).csrfToken;
    await dbInsert("owner-demo", 10, now).run();
    expect(
      (
        await call("/api/auth/login", "POST", {
          login: "owner-demo",
          password: "MotDePasseDeTest-2026!",
        })
      ).status,
    ).toBe(429);
    await env.DB.prepare(
      "UPDATE auth_attempts SET window_start=? WHERE login_key='owner-demo'",
    )
      .bind(now - 901_000)
      .run();
    expect(
      (
        await call("/api/auth/login", "POST", {
          login: "owner-demo",
          password: "MotDePasseErroné",
        })
      ).status,
    ).toBe(401);
    const counter = await env.DB.prepare(
      "SELECT failures FROM auth_attempts WHERE login_key='owner-demo'",
    ).first<{ failures: number }>();
    expect(counter!.failures).toBe(1);
    expect(
      (
        await call(
          "/api/auth/logout",
          "POST",
          undefined,
          priorCsrf,
          priorCookie,
        )
      ).status,
    ).toBe(204);
    expect((await call("/api/bootstrap")).status).toBe(200);
  });
  it("refuse une session expirée et une origine étrangère", async () => {
    expect(
      (
        await worker.fetch(
          new Request("http://localhost:5173/api/auth/login", {
            method: "POST",
            headers: { Origin: "https://foreign.test" },
            body: "{}",
          }),
          env,
        )
      ).status,
    ).toBe(403);
    await env.DB.prepare("UPDATE auth_sessions SET expires_at=0").run();
    expect((await call("/api/bootstrap")).status).toBe(401);
  });
});
