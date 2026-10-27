import { upgradeBrowserDatabase } from "../apps/demo/upgrade";
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { readFileSync, readdirSync } from "node:fs";
import { BrowserDatabase, BrowserFiles } from "../apps/demo/database";
import { internalRequest } from "../apps/demo/request";
import api from "../apps/api";
import { mapConcurrent } from "../apps/api/concurrent";
import { resolveTheme } from "../apps/web/src/theme";
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});
function fixture() {
  const sqlite = new SQL.Database();
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.run(readFileSync(`migrations/${file}`, "utf8"));
  for (const file of ["demo", "residents", "pages"])
    sqlite.run(readFileSync(`fixtures/${file}.sql`, "utf8"));
  const db = new BrowserDatabase(sqlite),
    queries: string[] = [];
  const measured = new Proxy(db, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => {
          queries.push(sql);
          return target.prepare(sql);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const env = {
    DB: measured as unknown as D1Database,
    FILES: new BrowserFiles() as unknown as R2Bucket,
    DEMO_MODE: "local-only",
  };
  return { sqlite, queries, env };
}
describe("Query and loading boundaries", () => {
  it("upgrades an existing browser database without changing saved records", () => {
    const { sqlite } = fixture();
    try {
      sqlite.run(
        "DROP INDEX lot_relations_lot_dates; DROP INDEX records_year_updated; DROP INDEX document_versions_record_state;",
      );
      sqlite.run(
        "UPDATE users SET name='Retained fictional edit' WHERE id='demo-owner'",
      );
      upgradeBrowserDatabase(sqlite);
      upgradeBrowserDatabase(sqlite);
      expect(
        sqlite.exec("SELECT name FROM users WHERE id='demo-owner'")[0]
          .values[0][0],
      ).toBe("Retained fictional edit");
      expect(
        sqlite.exec(
          "SELECT name FROM sqlite_master WHERE name='records_year_updated'",
        )[0].values,
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
  it("bounds concurrency, preserves order and propagates errors", async () => {
    let active = 0,
      peak = 0;
    const result = await mapConcurrent([3, 1, 2, 4, 5], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return n * 2;
    });
    expect(result).toEqual([6, 2, 4, 8, 10]);
    expect(peak).toBe(3);
    await expect(
      mapConcurrent([1], 3, async () => {
        throw Error("failed");
      }),
    ).rejects.toThrow("failed");
  });
  it("uses the relations index rather than scanning the relations table", () => {
    const { sqlite } = fixture();
    try {
      const result = sqlite.exec(
        "EXPLAIN QUERY PLAN SELECT r.* FROM lot_relations r JOIN lots l ON l.id=r.lot_id WHERE l.condominium_id='demo-tilleuls' AND r.valid_from<='2026-10-27' AND (r.valid_until IS NULL OR r.valid_until>'2026-10-27')",
      );
      const plan = result[0].values.map((r) => String(r[3])).join(" ");
      expect(plan).toContain("lot_relations_lot_dates");
      expect(plan).not.toContain("SCAN r");
    } finally {
      sqlite.close();
    }
  });
  it("filters yearly snapshots in SQL while preserving all-years worklists", async () => {
    const { sqlite, queries, env } = fixture();
    try {
      const response = await api.fetch(
        internalRequest("/api/condominiums/demo-tilleuls?year=2026", {}),
        env,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.records.every((r: any) => r.fiscal_year === 2026)).toBe(true);
      expect(
        queries.some((q) =>
          q.includes("FROM records WHERE condominium_id=? AND fiscal_year=?"),
        ),
      ).toBe(true);
      expect(
        queries.some((q) => q.includes("r.fiscal_year=? AND v.state='ready'")),
      ).toBe(true);
      queries.length = 0;
      const work = await api.fetch(
        internalRequest("/api/condominiums/demo-tilleuls/worklist", {}),
        env,
      );
      expect(work.status).toBe(200);
      expect(
        queries.some(
          (q) => q.includes("kind='incident'") && !q.includes("fiscal_year=?"),
        ),
      ).toBe(true);
    } finally {
      sqlite.close();
    }
  });
  it("groups assigned names instead of looking them up individually", async () => {
    const { sqlite, queries, env } = fixture();
    try {
      const ids = sqlite.exec(
        "SELECT id FROM ops_items WHERE condominium_id='demo-tilleuls' LIMIT 3",
      )[0].values;
      ids.forEach(([id], i) => {
        sqlite.run("INSERT INTO users(id,name) VALUES(?,?)", [
          `perf-${i}`,
          `Example ${i}`,
        ]);
        sqlite.run("UPDATE ops_items SET assigned_to=? WHERE id=?", [
          `perf-${i}`,
          id,
        ]);
      });
      const response = await api.fetch(
        internalRequest("/api/portfolio", {}),
        env,
      );
      expect(response.status).toBe(200);
      expect(
        queries.filter((q) =>
          q.startsWith("SELECT id,name FROM users WHERE id IN"),
        ).length,
      ).toBe(1);
      expect(
        queries.filter((q) => q.startsWith("SELECT name FROM users WHERE id="))
          .length,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it("follows the system only until a theme is explicitly chosen", () => {
    expect(resolveTheme("system", true)).toBe("obsidian-copper");
    expect(resolveTheme("system", false)).toBe("clay-sand");
    expect(resolveTheme("clay-sand", true)).toBe("clay-sand");
    expect(resolveTheme("obsidian-copper", false)).toBe("obsidian-copper");
  });
});
