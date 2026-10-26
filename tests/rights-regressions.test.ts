import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../apps/api";
let mf: Miniflare, env: Parameters<typeof worker.fetch>[1];
const root = "/api/condominiums/demo-tilleuls";
async function call(
  path: string,
  user = "demo-manager",
  method = "GET",
  body?: any,
  db = env.DB,
) {
  return worker.fetch(
    new Request("http://localhost:5173" + path, {
      method,
      headers: {
        Cookie: `domolyma_demo=${user}`,
        Origin: "http://localhost:5173",
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    }),
    { ...env, DB: db },
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
    DB: (await mf.getD1Database("DB")) as any,
    FILES: (await mf.getR2Bucket("FILES")) as any,
    DEMO_MODE: "local-only",
  };
  for (const file of [
    ...readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "migrations/" + f),
    "fixtures/demo.sql",
    "fixtures/residents.sql",
  ]) {
    const sql = readFileSync(file, "utf8").replace(/^--.*$/gm, "");
    for (const line of sql
      .replace(/\n(?=\()/g, " ")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean))
      await env.DB.exec(line);
  }
});
afterAll(async () => {
  vi.useRealTimers();
  await mf.dispose();
});
for (const [day, before, after] of [
  ["2026-10-27", "2026-10-26T22:59:59.999Z", "2026-10-26T23:00:00Z"],
  ["2026-07-01", "2026-06-30T21:59:59.999Z", "2026-06-30T22:00:00Z"],
]) {
  it(`cuts off and grants rights at Paris midnight on ${day}`, async () => {
    await env.DB.prepare(
      "UPDATE lot_relations SET valid_from='2024-01-01',valid_until=? WHERE user_id='demo-tenant'",
    )
      .bind(day)
      .run();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(before));
      expect(
        ((await (await call(root, "demo-tenant")).json()) as any).roles,
      ).toContain("tenant");
      vi.setSystemTime(new Date(after));
      expect(
        ((await (await call(root, "demo-tenant")).json()) as any).roles,
      ).not.toContain("tenant");
      await env.DB.prepare(
        "UPDATE lot_relations SET valid_from=?,valid_until=NULL WHERE user_id='demo-tenant'",
      )
        .bind(day)
        .run();
      vi.setSystemTime(new Date(before));
      expect(
        ((await (await call(root, "demo-tenant")).json()) as any).roles,
      ).not.toContain("tenant");
      vi.setSystemTime(new Date(after));
      expect(
        ((await (await call(root, "demo-tenant")).json()) as any).roles,
      ).toContain("tenant");
    } finally {
      vi.useRealTimers();
    }
  });
}
async function lot() {
  return env.DB.prepare("SELECT * FROM lots WHERE id='lot-1'").first<any>();
}
function input(old: any, ownerId: string) {
  return {
    number: old.number,
    label: old.label,
    ownerId,
    buildingId: old.building_id,
    lotType: old.lot_type,
    areaM2: String(old.area_m2 || ""),
    weight: old.weight,
    useType: old.use_type,
    declaredActivity: old.declared_activity,
    apartmentNumber: old.apartment_number,
    parentLotId: old.parent_lot_id,
    intercomDisplay: old.intercom_display,
    intercomProgram: old.intercom_program,
    mailbox: old.mailbox,
    version: old.version,
  };
}
async function relations() {
  return (
    await env.DB.prepare(
      "SELECT * FROM lot_relations WHERE lot_id='lot-1' ORDER BY id",
    ).all()
  ).results;
}
async function journal() {
  return (
    await env.DB.prepare(
      "SELECT * FROM audit WHERE resource_id='lot-1' ORDER BY id",
    ).all()
  ).results;
}
it("rolls back the lot, every relation and the journal if any dependent step fails", async () => {
  const original = await lot(),
    owners = await relations(),
    audit = await journal();
  // Insert a duplicate primary key at each execution point inside the real batch.
  for (let position = 1; position <= 5; position++) {
    const failing = new Proxy(env.DB, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            const duplicate = target.prepare(
              "INSERT INTO lots(id,condominium_id,number,label,weight) VALUES('lot-1','demo-tilleuls','rollback-test','Fictif',1)",
            );
            return target.batch([
              ...statements.slice(0, position),
              duplicate,
              ...statements.slice(position),
            ]);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let response: Response;
    try {
      response = await call(
        root + "/lots/lot-1",
        "demo-manager",
        "PATCH",
        input(original, "demo-neighbor"),
        failing,
      );
    } finally {
      log.mockRestore();
    }
    expect(response!.status).toBe(500);
    expect(await lot()).toEqual(original);
    expect(await relations()).toEqual(owners);
    expect(await journal()).toEqual(audit);
  }
});
it("commits ownership, private access and journal together, with no receipt exposed", async () => {
  const old = await lot();
  const form = new FormData();
  form.set(
    "file",
    new File(["preuve fictive"], "preuve.txt", { type: "text/plain" }),
  );
  form.set("title", "Preuve fictive");
  form.set("audience", "lot");
  form.set("lotId", "lot-1");
  const upload = await call(root + "/documents", "demo-manager", "POST", form);
  expect(upload.status).toBe(201);
  const doc = ((await upload.json()) as any).id;
  expect((await call(root + "/records/" + doc, "demo-owner")).status).toBe(200);
  const r = await call(
    root + "/lots/lot-1",
    "demo-manager",
    "PATCH",
    input(old, "demo-neighbor"),
  );
  expect(r.status).toBe(200);
  expect((await lot()).owner_id).toBe("demo-neighbor");
  expect((await lot()).mutation_id).toBeNull();
  expect((await call(root + "/records/" + doc, "demo-owner")).status).toBe(404);
  expect((await call(root + "/records/" + doc, "demo-neighbor")).status).toBe(
    200,
  );
  const snapshot = (await (await call(root)).json()) as any;
  expect(snapshot.lots.find((l: any) => l.id === "lot-1")).not.toHaveProperty(
    "mutation_id",
  );
  const saved = await lot(),
    owners = await relations(),
    audit = await journal();
  expect(
    (
      await call(
        root + "/lots/lot-1",
        "demo-manager",
        "PATCH",
        input(old, "demo-owner"),
      )
    ).status,
  ).toBe(409);
  expect(await lot()).toEqual(saved);
  expect(await relations()).toEqual(owners);
  expect(await journal()).toEqual(audit);
});
it("a CAS lost after the initial read causes no dependent write, including for the same requested owner", async () => {
  const old = await lot(),
    before = (await journal()).length;
  let arrived = 0,
    release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const concurrent = new Proxy(env.DB, {
    get(target, key) {
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (++arrived === 2) release();
          await gate;
          return target.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const results = await Promise.all([
    call(
      root + "/lots/lot-1",
      "demo-manager",
      "PATCH",
      input(old, "demo-owner"),
      concurrent,
    ),
    call(
      root + "/lots/lot-1",
      "demo-manager",
      "PATCH",
      input(old, "demo-owner"),
      concurrent,
    ),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await lot()).version).toBe(old.version + 1);
  expect((await journal()).length).toBe(before + 1);
  expect(
    (await relations()).filter(
      (r: any) => r.relation === "owner" && r.valid_until === null,
    ),
  ).toHaveLength(1);
  expect((await lot()).mutation_id).toBeNull();
});
it("creates a new lot and its owner in one batch, with no public receipt", async () => {
  const template = await lot(),
    body = input(template, "demo-owner");
  body.number = "audit-new-lot";
  body.label = "Lot fictif transaction";
  const r = await call(root + "/lots", "demo-manager", "POST", body);
  expect(r.status).toBe(201);
  const id = ((await r.json()) as any).id;
  const row = await env.DB.prepare("SELECT * FROM lots WHERE id=?")
    .bind(id)
    .first<any>();
  expect(row.version).toBe(1);
  expect(row.mutation_id).toBeNull();
  const owners = (
    await env.DB.prepare(
      "SELECT * FROM lot_relations WHERE lot_id=? AND relation='owner' AND valid_until IS NULL",
    )
      .bind(id)
      .all<any>()
  ).results;
  expect(owners.map((r) => r.user_id)).toEqual(["demo-owner"]);
});
it("writes ownership relation boundaries using the Paris date", async () => {
  const old = await lot();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
  try {
    expect(
      (
        await call(
          root + "/lots/lot-1",
          "demo-manager",
          "PATCH",
          input(old, "demo-neighbor"),
        )
      ).status,
    ).toBe(200);
    const owners = await relations();
    expect(
      owners.find((r: any) => r.relation === "owner" && r.valid_until === null)
        ?.valid_from,
    ).toBe("2027-01-01");
    expect(owners.some((r: any) => r.valid_until === "2027-01-01")).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
