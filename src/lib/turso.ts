import { createClient, type Client } from "@libsql/client";

/**
 * Turso (libSQL) client + schema bootstrap.
 * Credentials come from .env (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
 */

function getClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN غير معرّفين في .env");
  }
  const g = globalThis as unknown as { __tursoClient?: Client };
  if (!g.__tursoClient) {
    g.__tursoClient = createClient({ url, authToken: token });
  }
  return g.__tursoClient;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    key_value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    usage_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS gateway_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    key_value TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    gateway_key_name TEXT,
    provider_name TEXT,
    api_key_label TEXT,
    model TEXT,
    status TEXT NOT NULL,
    status_code INTEGER,
    attempts INTEGER NOT NULL DEFAULT 1,
    latency_ms INTEGER,
    stream INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_models_provider_model ON models (provider_id, model_id)`,
  `CREATE INDEX IF NOT EXISTS idx_keys_provider ON api_keys (provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_created ON usage_logs (created_at)`,
];

let readyPromise: Promise<Client> | null = null;

/** Returns a Turso client after ensuring the schema exists (runs once per process). */
export function db(): Promise<Client> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const client = getClient();
      await client.batch(SCHEMA_STATEMENTS, "write");
      return client;
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function generateGatewayKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `gw-${hex}`;
}
