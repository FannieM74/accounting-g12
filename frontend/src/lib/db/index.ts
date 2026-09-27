import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { resolve } from "path";

/**
 * Database handle — lazily initialized (nothing opens until the first query,
 * so `next build` never touches the database).
 * - DATABASE_URL unset  -> local SQLite file (.data/local.db), created on demand
 * - DATABASE_URL = libsql://... -> hosted SQLite (Turso) in production
 */
export const isDbConfigured = Boolean(process.env.DATABASE_URL);

const LOCAL_URL = "file:.data/local.db";

type LibsqlClient = ReturnType<typeof createClient>;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function makeClient(): LibsqlClient {
  if (!process.env.DATABASE_URL) {
    try {
      mkdirSync(resolve(process.cwd(), ".data"), { recursive: true });
    } catch {
      // read-only environment — queries will surface the error themselves
    }
  }
  return createClient({
    url: process.env.DATABASE_URL || LOCAL_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
}

let _client: LibsqlClient | null = null;
export function getClient(): LibsqlClient {
  if (!_client) _client = makeClient();
  return _client;
}

let _db: DrizzleDb | null = null;
export function getDb(): DrizzleDb {
  if (!_db) _db = drizzle(getClient(), { schema });
  return _db;
}

// lazy proxies keep `import { db } from "@/lib/db"` ergonomic
export const client = new Proxy({} as LibsqlClient, {
  get(_t, prop) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

export const db = new Proxy({} as DrizzleDb, {
  get(_t, prop) {
    const d = getDb() as unknown as Record<string | symbol, unknown>;
    const v = d[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(d) : v;
  },
});
