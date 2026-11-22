/**
 * Database client.
 *
 * Two engines behind one interface, both speaking SQLite through Drizzle's
 * proxy driver (same schema, same migrations):
 *
 *  - Local (default): Node's built-in `node:sqlite` file in the data folder.
 *    A single synchronous connection is shared per process.
 *  - Hosted: a libSQL/Turso database over HTTPS when `TURSO_DATABASE_URL` is
 *    set (used on Vercel, where the disk is temporary).
 *
 * The rest of the application only talks to the Drizzle `db` object (and the
 * `rawAll` / `transaction` helpers) via the repositories.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import type { Client, InStatement, ResultSet, Transaction } from "@libsql/client";
import { getConfig } from "../config";
import { tables } from "./schema";

type Method = "run" | "all" | "values" | "get";
export type DB = SqliteRemoteDatabase<typeof tables>;
/** Values that can be bound to SQL parameters. */
export type SqlValue = string | number | bigint | null | Uint8Array;

interface Engine {
  /** Drizzle proxy callback: rows as arrays (one row for `get`). */
  query(sqlText: string, params: unknown[], method: Method): Promise<{ rows: unknown[] }>;
  batch(queries: { sql: string; params: unknown[]; method: Method }[]): Promise<{ rows: unknown[] }[]>;
  /** Plain-object rows. */
  all<T>(sqlText: string, params: SqlValue[]): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  migrate(queries: string[]): Promise<void>;
  checkpoint(): Promise<void>;
  close(): void;
}

interface DbState {
  engine: Engine;
  db: DB;
  ready: Promise<void>;
  key: string;
}

const globalForDb = globalThis as unknown as { __designVaultDb?: DbState };

// ---------------------------------------------------------------- local file

async function openLocal(file: string): Promise<Engine> {
  const { DatabaseSync } = await import("node:sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  type Arg = import("node:sqlite").SQLInputValue;

  const exec = (sqlText: string, params: unknown[], method: Method) => {
    const stmt = sqlite.prepare(sqlText);
    const args = params as Arg[];
    if (method === "run") {
      stmt.run(...args);
      return { rows: [] as unknown[] };
    }
    stmt.setReturnArrays(true);
    if (method === "get") return { rows: stmt.get(...args) as unknown as unknown[] };
    return { rows: stmt.all(...args) as unknown[] };
  };

  const atomically = <T>(fn: () => T, mode = "BEGIN"): T => {
    sqlite.exec(mode);
    try {
      const result = fn();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    query: async (sqlText, params, method) => exec(sqlText, params, method),
    batch: async (queries) => atomically(() => queries.map((q) => exec(q.sql, q.params, q.method))),
    all: async <T>(sqlText: string, params: SqlValue[]) => sqlite.prepare(sqlText).all(...(params as Arg[])) as T[],
    transaction: async (fn) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    migrate: async (queries) => atomically(() => queries.forEach((q) => sqlite.exec(q))),
    checkpoint: async () => void sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);"),
    close: () => sqlite.close(),
  };
}

// ---------------------------------------------------------------- libSQL / Turso

const READ_ONLY_SQL = /^\s*(select|with|pragma\s+table_info|explain)\b/i;

async function openLibsql(url: string, authToken: string | null, readOnly: boolean): Promise<Engine> {
  // The `web` build is pure JavaScript (HTTP) — right for serverless. Local
  // `file:` URLs (used by tests) need the full Node client.
  const { createClient } = url.startsWith("file:") ? await import("@libsql/client") : await import("@libsql/client/web");
  const client: Client = createClient({ url, authToken: authToken ?? undefined, intMode: "number" });
  // Statements inside `transaction()` run on that transaction (no shared connection on HTTP).
  const activeTx = new AsyncLocalStorage<Transaction>();
  const target = () => activeTx.getStore() ?? client;

  const guard = (sqlText: string) => {
    if (readOnly && !READ_ONLY_SQL.test(sqlText)) throw new Error("This database connection is read-only.");
  };
  const toArrays = (rs: ResultSet) => rs.rows.map((row) => Array.from(row as ArrayLike<unknown>));
  const toObjects = <T>(rs: ResultSet) =>
    rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, (row as ArrayLike<unknown>)[i]])) as T);
  const shape = (rs: ResultSet, method: Method) => {
    if (method === "run") return { rows: [] as unknown[] };
    const rows = toArrays(rs);
    return { rows: method === "get" ? (rows[0] ?? (undefined as unknown as unknown[])) : rows };
  };
  const stmt = (sqlText: string, params: unknown[]): InStatement => ({ sql: sqlText, args: params as SqlValue[] });

  return {
    query: async (sqlText, params, method) => {
      guard(sqlText);
      return shape(await target().execute(stmt(sqlText, params)), method);
    },
    batch: async (queries) => {
      queries.forEach((q) => guard(q.sql));
      const tx = activeTx.getStore();
      if (tx) {
        const out = [];
        for (const q of queries) out.push(shape(await tx.execute(stmt(q.sql, q.params)), q.method));
        return out;
      }
      const results = await client.batch(queries.map((q) => stmt(q.sql, q.params)), "write");
      return results.map((rs, i) => shape(rs, queries[i].method));
    },
    all: async <T>(sqlText: string, params: SqlValue[]) => {
      guard(sqlText);
      return toObjects<T>(await target().execute(stmt(sqlText, params)));
    },
    transaction: async (fn) => {
      if (activeTx.getStore()) return fn();
      const tx = await client.transaction("write");
      try {
        const result = await activeTx.run(tx, fn);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      } finally {
        tx.close();
      }
    },
    migrate: async (queries) => {
      await client.batch(queries.map((q) => ({ sql: q, args: [] })), "write");
    },
    checkpoint: async () => undefined,
    close: () => client.close(),
  };
}

// ---------------------------------------------------------------- shared

function open(readOnly: boolean): DbState {
  const config = getConfig();
  const key = config.databaseUrl ?? config.databaseFile;
  const enginePromise = config.databaseUrl
    ? openLibsql(config.databaseUrl, config.databaseAuthToken, readOnly)
    : openLocal(config.databaseFile);

  let engine: Engine | null = null;
  const lazy: Engine = {
    query: (...a) => engine!.query(...a),
    batch: (...a) => engine!.batch(...a),
    all: (...a) => engine!.all(...a),
    transaction: (...a) => engine!.transaction(...a),
    migrate: (...a) => engine!.migrate(...a),
    checkpoint: () => engine!.checkpoint(),
    close: () => engine?.close(),
  };

  const db = drizzle(
    async (sqlText, params, method) => lazy.query(sqlText, params, method),
    async (queries) => lazy.batch(queries),
    { schema: tables },
  );

  const ready = (async () => {
    engine = await enginePromise;
    // A read-only hosted connection can't migrate; the app (or build) does that.
    if (!(readOnly && config.databaseUrl)) {
      await migrate(db, (queries) => lazy.migrate(queries), {
        migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle"),
      });
      const { ensureSeedData } = await import("./seed");
      await ensureSeedData(db);
    }
    if (readOnly && !config.databaseUrl) await lazy.query("PRAGMA query_only = ON;", [], "run");
  })();

  return { engine: lazy, db, ready, key };
}

function state(readOnly = false) {
  const config = getConfig();
  const key = config.databaseUrl ?? config.databaseFile;
  let current = globalForDb.__designVaultDb;
  if (!current || current.key !== key) {
    current = open(readOnly);
    globalForDb.__designVaultDb = current;
    // Don't cache a failed start (e.g. the database was unreachable).
    current.ready.catch(() => {
      if (globalForDb.__designVaultDb === current) globalForDb.__designVaultDb = undefined;
    });
  }
  return current;
}

/**
 * Returns the ready database. Pass `readOnly` from agent-facing processes
 * (the MCP server) so the database connection rejects any write.
 */
export async function getDb(options: { readOnly?: boolean } = {}): Promise<DB> {
  const s = state(Boolean(options.readOnly));
  await s.ready;
  return s.db;
}

/**
 * Raw parameterized query returning plain objects. Used for the few complex
 * read queries (search/filter) that are clearer in SQL. Always pass values as
 * parameters, never by string concatenation.
 */
export async function rawAll<T>(sqlText: string, params: SqlValue[] = []): Promise<T[]> {
  const s = state();
  await s.ready;
  return s.engine.all<T>(sqlText, params);
}

/** Run several statements atomically. */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  await s.ready;
  return s.engine.transaction(fn);
}

/** For backups: flush WAL into the main database file (local only). */
export async function checkpoint() {
  const s = state();
  await s.ready;
  await s.engine.checkpoint();
}

export function closeDb() {
  const s = globalForDb.__designVaultDb;
  if (s) {
    s.engine.close();
    globalForDb.__designVaultDb = undefined;
  }
}

/** True when the vault lives in a hosted database rather than a local file. */
export function isHostedDatabase() {
  return Boolean(getConfig().databaseUrl);
}
