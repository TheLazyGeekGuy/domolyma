import { beforeAll, describe, it, expect } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { readFileSync, readdirSync } from "node:fs";
import { BrowserDatabase, BrowserFiles } from "../apps/demo/database";
import { internalRequest } from "../apps/demo/request";
import api from "../apps/api/index";
import { governanceInput } from "../packages/contracts/governance";
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});
function fixture() {
  const sqlite = new SQL.Database();
  for (const name of readdirSync("migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.run(readFileSync("migrations/" + name, "utf8"));
  for (const name of ["demo", "residents", "pages"])
    sqlite.run(readFileSync("fixtures/" + name + ".sql", "utf8"));
  const db = new BrowserDatabase(sqlite),
    files = new BrowserFiles();
  return {
    db,
    files,
    env: {
      DB: db as unknown as D1Database,
      FILES: files as unknown as R2Bucket,
      DEMO_MODE: "local-only",
    },
  };
}
describe("Autonomous browser API compatibility", () => {
  it("provides complete fictional meeting and decision payloads matching the editor contracts", async () => {
    const { db } = fixture();
    try {
      const rows = await db.prepare("SELECT * FROM governance_items").all();
      expect(rows.results.length).toBe(2);
      for (const row of rows.results) {
        const parsed = governanceInput.safeParse({
          kind: row.kind,
          title: row.title,
          dossierYear: row.dossier_year,
          parentId: row.parent_id,
          audience: row.audience,
          payload: JSON.parse(String(row.payload)),
        });
        expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
      }
    } finally {
      db.sqlite.close();
    }
  });
  it("boots the actual API from only fictional migrations and seeds", async () => {
    const { db, env } = fixture();
    try {
      const response = await api.fetch(
        internalRequest("/api/bootstrap", {}),
        env,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.demo).toBe(true);
      expect(body.user.name).toBe("Camille Martin");
      expect(body.condominiums[0].name).toBe("Les Tilleuls");
    } finally {
      db.sqlite.close();
    }
  });
  it("keeps profile-based access rules in the reused handler", async () => {
    const { db, env } = fixture();
    try {
      const blocked = await api.fetch(
        internalRequest("/api/condominiums/demo-tilleuls", {}, "demo-outsider"),
        env,
      );
      expect(blocked.status).toBe(403);
      const owner = await api.fetch(
        internalRequest("/api/condominiums/demo-tilleuls", {}, "demo-owner"),
        env,
      );
      expect(owner.status).toBe(200);
    } finally {
      db.sqlite.close();
    }
  });
  it("rolls back the whole D1-compatible batch when a later statement fails", async () => {
    const { db } = fixture();
    try {
      await expect(
        db.batch([
          db
            .prepare("INSERT INTO users VALUES(?,?)")
            .bind("fresh", "Fictional"),
          db
            .prepare("INSERT INTO users VALUES(?,?)")
            .bind("demo-owner", "Duplicate"),
        ]),
      ).rejects.toThrow();
      expect(
        await db.prepare("SELECT id FROM users WHERE id='fresh'").first(),
      ).toBeNull();
    } finally {
      db.sqlite.close();
    }
  });
  it("preserves prepared RETURNING values and an exported database snapshot", async () => {
    const { db } = fixture();
    try {
      const result = await db
        .prepare("UPDATE users SET name=? WHERE id=? RETURNING name")
        .bind("Updated example", "demo-owner")
        .all();
      expect(result.results[0].name).toBe("Updated example");
      expect(result.meta.changes).toBe(1);
      const restored = new SQL.Database(db.sqlite.export());
      try {
        await expect(
          new BrowserDatabase(restored)
            .prepare("SELECT name FROM users WHERE id='demo-owner'")
            .first("name"),
        ).resolves.toBe("Updated example");
      } finally {
        restored.close();
      }
    } finally {
      db.sqlite.close();
    }
  });
  it("implements file ranges and private in-process request headers without network I/O", async () => {
    const files = new BrowserFiles();
    await files.put("example", new Uint8Array([1, 2, 3, 4]));
    const object = await files.get("example", {
      range: { offset: 1, length: 2 },
    });
    expect([
      ...new Uint8Array(await new Response(object!.body).arrayBuffer()),
    ]).toEqual([2, 3]);
    await files.delete("example");
    expect(await files.head("example")).toBeNull();
    const request = internalRequest(
      "/api/example",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"title":"Test"}',
      },
      "demo-owner",
    );
    expect(request.headers.get("Origin")).toBe("http://localhost");
    expect(request.headers.get("Cookie")).toBe("domolyma_demo=demo-owner");
    expect(await request.json()).toEqual({ title: "Test" });
  });
});
