import type { Database, SqlValue } from "sql.js";

/** The subset of D1 used by the existing API, backed by SQLite in this browser. */
export class BrowserDatabase {
  constructor(public readonly sqlite: Database) {}
  prepare(sql: string) {
    return new BrowserStatement(this, sql);
  }
  async batch(statements: BrowserStatement[]) {
    this.sqlite.run("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.run("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.run("ROLLBACK");
      throw error;
    }
  }
}

class BrowserStatement {
  constructor(
    private readonly db: BrowserDatabase,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}
  bind(...values: SqlValue[]) {
    return new BrowserStatement(this.db, this.sql, values);
  }
  execute() {
    const statement = this.db.sqlite.prepare(this.sql);
    const results: Record<string, SqlValue>[] = [];
    try {
      statement.bind(this.values);
      while (statement.step()) results.push(statement.getAsObject());
    } finally {
      statement.free();
    }
    return {
      success: true,
      results,
      meta: { changes: this.db.sqlite.getRowsModified(), duration: 0 },
    };
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
  async first(column?: string) {
    const row = this.execute().results[0];
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
}

export type DemoFile = { bytes: Uint8Array; contentType: string };
export class BrowserFiles {
  constructor(public readonly files = new Map<string, DemoFile>()) {}
  async put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    const bytes =
      body instanceof Uint8Array ? body.slice() : new Uint8Array(body).slice();
    this.files.set(key, {
      bytes,
      contentType:
        options?.httpMetadata?.contentType || "application/octet-stream",
    });
    return { key, size: bytes.byteLength };
  }
  async head(key: string) {
    return this.files.has(key)
      ? { key, size: this.files.get(key)!.bytes.byteLength }
      : null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ) {
    const file = this.files.get(key);
    if (!file) return null;
    const bytes = options?.range
      ? file.bytes.slice(
          options.range.offset,
          options.range.offset + options.range.length,
        )
      : file.bytes.slice();
    return {
      body: new Blob([bytes as Uint8Array<ArrayBuffer>]).stream(),
      size: bytes.byteLength,
      httpMetadata: { contentType: file.contentType },
    };
  }
}
