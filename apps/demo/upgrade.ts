import type { Database } from "sql.js";
import indexes from "../../migrations/0011_query_indexes.sql?raw";
/** Additive upgrade: keep every saved row and file in an existing demo. */
export function upgradeBrowserDatabase(sqlite: Database) {
  sqlite.run(indexes);
}
