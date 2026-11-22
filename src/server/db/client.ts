/**
 * Database client.
 *
 * Uses Node's built-in `node:sqlite` (no native compilation required) through
 * Drizzle's proxy driver. A single synchronous connection is shared per
 * process, which keeps pragmas such as `foreign_keys` reliably applied.
 *
 * The rest of the application only talks to the Drizzle `db` object via the
 * repositories, so swapping to PostgreSQL later means replacing this module and
 * porting `schema.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { getConfig } from "../config";
import { tables } from "./schema";

type Method = "run" | "all" | "values" | "get";
export type DB = SqliteRemoteDatabase<typeof tables>;

interface DbState {
  sqlite: DatabaseSync;
  db: DB;
  ready: Promise<void>;
  file: string;
}

const globalForDb = globalThis as unknown as { __designVaultDb?: DbState };

function exec(sqlite: DatabaseSync, sqlText: string, params: unknown[], method: Method) {
  const stmt = sqlite.prepare(sqlText);
  const args = params as SQLInputValue[];
  if (method === "run") {
    stmt.run(...args);
    return { rows: [] as unknown[] };
  }
  stmt.setReturnArrays(true);
  if (method === "get") {
    return { rows: stmt.get(...args) as unknown as unknown[] };
  }
  return { rows: stmt.all(...args) as unknown[] };
}

function open(readOnly: boolean): DbState {
  const { databaseFile } = getConfig();
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const sqlite = new DatabaseSync(databaseFile, { enableForeignKeyConstraints: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");

  const db = drizzle(
    async (sqlText, params, method) => exec(sqlite, sqlText, params, method),
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((q) => exec(sqlite, q.sql, q.params, q.method));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { schema: tables },
  );

  const ready = (async () => {
    await migrate(
      db,
      async (queries) => {
        sqlite.exec("BEGIN");
        try {
          for (const q of queries) sqlite.exec(q);
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
      { migrationsFolder: path.join(process.cwd(), "drizzle") },
    );
    const { ensureSeedData } = await import("./seed");
    await ensureSeedData(db);
    if (readOnly) sqlite.exec("PRAGMA query_only = ON;");
  })();

  return { sqlite, db, ready, file: databaseFile };
}

/**
 * Returns the ready database. Pass `readOnly` from agent-facing processes
 * (the MCP server) so SQLite itself rejects any write.
 */
export async function getDb(options: { readOnly?: boolean } = {}): Promise<DB> {
  const { databaseFile } = getConfig();
  let state = globalForDb.__designVaultDb;
  if (!state || state.file !== databaseFile) {
    state = open(Boolean(options.readOnly));
    globalForDb.__designVaultDb = state;
  }
  await state.ready;
  return state.db;
}

/**
 * Raw parameterized query returning plain objects. Used for the few complex
 * read queries (search/filter) that are clearer in SQL. Always pass values as
 * parameters, never by string concatenation.
 */
export async function rawAll<T>(sqlText: string, params: SQLInputValue[] = []): Promise<T[]> {
  await getDb();
  const stmt = globalForDb.__designVaultDb!.sqlite.prepare(sqlText);
  return stmt.all(...params) as T[];
}

/** Run several statements atomically on the shared connection. */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await getDb();
  const sqlite = globalForDb.__designVaultDb!.sqlite;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

/** For backups: flush WAL into the main database file. */
export async function checkpoint() {
  await getDb();
  globalForDb.__designVaultDb!.sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
}

export function closeDb() {
  const state = globalForDb.__designVaultDb;
  if (state) {
    state.sqlite.close();
    globalForDb.__designVaultDb = undefined;
  }
}
