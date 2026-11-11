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

/**
 * Builds an upstream URL from the provider base URL.
 * - Auto-prepends https:// when the protocol is missing.
 * - Appends /v1 only when `autoVersion` is on AND the URL does not already end
 *   with a version segment (/v1, /v1beta, /v2…). Some proxies (e.g. personal
 *   Cloudflare workers) add /v1 themselves — for those autoVersion is off.
 */
export function upstreamUrl(baseUrl: string, path: string, autoVersion = true): string {
  let b = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
  if (autoVersion && !/(\/v\d+(beta|preview)?)(\/)?$/i.test(b)) {
    b += "/v1";
  }
  return b + path;
}

/** Extracts the human-readable message from an upstream error body (JSON or plain text). */
export function extractUpstreamMessage(text: string): string | null {
  const t = (text || "").trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    const err = obj?.error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (typeof e.message === "string" && e.message) return e.message;
    }
    if (typeof obj?.message === "string" && obj.message) return obj.message;
    if (typeof obj?.detail === "string" && obj.detail) return obj.detail;
  } catch {
    /* plain text */
  }
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

/**
 * Detects a geo/IP block: the provider refuses to serve the region the SERVER
 * exits from. The key itself is fine — it works from the user's machine or
 * from a supported deployment region (e.g. Vercel US).
 */
export function isGeoBlock(status: number, body: string): boolean {
  if (status !== 403 && status !== 451) return false;
  const msg = (extractUpstreamMessage(body) || "").toLowerCase();
  if (/region|sanction|embargo|country|geo|jurisdiction|not available|blocked/.test(msg)) return true;
  if (msg === "forbidden" || msg === "") return true; // bare 403 = IP/WAF-level block
  return false;
}

export const GEO_BLOCK_HINT =
  "المزود يحجب منطقة خروج السيرفر الحالية — المفتاح سليم لكن الطلبات مرفوضة من هذه المنطقة. الحل: انشر البوابة على Vercel بمنطقة مدعومة (مثل الولايات المتحدة)";

/**
 * Classifies an upstream failure into a key status:
 * - 401                                  -> key invalid        -> "disabled"
 * - 402/429                              -> quota/rate limit   -> "exhausted"
 * - 403 with key-related message         -> key has no access  -> "disabled"
 * - 403 geo/IP blocks & everything else  -> NOT the key's fault -> stays "active"
 *   (a region-blocked key works again as soon as the deployment region changes,
 *    so permanently disabling it would be wrong)
 */
export function classifyFailure(status: number, body = ""): "disabled" | "exhausted" | "active" {
  if (status === 401) return "disabled";
  if (status === 402 || status === 429) return "exhausted";
  if (status === 403) {
    const msg = (extractUpstreamMessage(body) || "").toLowerCase();
    if (/api key|invalid|incorrect|unauthorized|credentials|authentication|quota|billing/.test(msg)) {
      return "disabled";
    }
    return "active";
  }
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
