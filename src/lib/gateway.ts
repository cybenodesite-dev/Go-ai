/**
 * Shared helpers for the AI gateway (failover engine, auth, CORS).
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
};

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/** Builds an upstream URL from the provider base URL, appending /v1 when missing. */
export function upstreamUrl(baseUrl: string, path: string): string {
  let b = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!/\/v\d+(beta)?(preview)?/.test(b)) {
    b += "/v1";
  }
  return b + path;
}

/**
 * Classifies an upstream failure into a key status:
 * - 401/403  -> key invalid  -> "disabled"
 * - 402/429  -> quota/rate   -> "exhausted"
 * - others   -> transient    -> stays "active"
 */
export function classifyFailure(status: number): "disabled" | "exhausted" | "active" {
  if (status === 401 || status === 403) return "disabled";
  if (status === 402 || status === 429) return "exhausted";
  return "active";
}

export type GatewayKeyRow = {
  id: string;
  name: string;
  key_value: string;
  enabled: number;
  usage_count: number;
};

/** Validates the Bearer token against gateway_keys. Returns the row or null. */
export async function authenticateGatewayKey(
  client: import("@libsql/client").Client,
  request: Request
): Promise<GatewayKeyRow | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await client.execute({
    sql: "SELECT id, name, key_value, enabled, usage_count FROM gateway_keys WHERE key_value = ? AND enabled = 1",
    args: [token],
  });
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    key_value: String(r.key_value),
    enabled: Number(r.enabled),
    usage_count: Number(r.usage_count),
  };
}

export function touchGatewayKey(client: import("@libsql/client").Client, id: string) {
  return client.execute({
    sql: "UPDATE gateway_keys SET usage_count = usage_count + 1, last_used_at = datetime('now') WHERE id = ?",
    args: [id],
  });
}
