import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard aggregates
export async function GET() {
  try {
    const client = await db();
    const res = await client.execute(`
      SELECT
        (SELECT COUNT(*) FROM providers) AS providers,
        (SELECT COUNT(*) FROM providers WHERE enabled = 1) AS enabled_providers,
        (SELECT COUNT(*) FROM api_keys) AS total_keys,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS active_keys,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'exhausted') AS exhausted_keys,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'disabled') AS disabled_keys,
        (SELECT COALESCE(SUM(usage_count), 0) FROM api_keys) AS total_key_usage,
        (SELECT COUNT(*) FROM models) AS total_models,
        (SELECT COUNT(*) FROM models WHERE selected = 1) AS selected_models,
        (SELECT COUNT(*) FROM gateway_keys WHERE enabled = 1) AS gateway_keys,
        (SELECT COUNT(*) FROM usage_logs) AS total_requests,
        (SELECT COUNT(*) FROM usage_logs WHERE status = 'success') AS success_requests,
        (SELECT COUNT(*) FROM usage_logs WHERE status = 'success' AND attempts > 1) AS failover_saves,
        (SELECT COUNT(*) FROM usage_logs WHERE created_at >= datetime('now', '-1 day')) AS requests_24h
    `);
    const r = res.rows[0];
    const stats = {
      providers: Number(r.providers),
      enabled_providers: Number(r.enabled_providers),
      total_keys: Number(r.total_keys),
      active_keys: Number(r.active_keys),
      exhausted_keys: Number(r.exhausted_keys),
      disabled_keys: Number(r.disabled_keys),
      total_key_usage: Number(r.total_key_usage),
      total_models: Number(r.total_models),
      selected_models: Number(r.selected_models),
      gateway_keys: Number(r.gateway_keys),
      total_requests: Number(r.total_requests),
      success_requests: Number(r.success_requests),
      failover_saves: Number(r.failover_saves),
      requests_24h: Number(r.requests_24h),
    };

    const keyUsage = await client.execute(`
      SELECT k.id, k.label, k.status, k.usage_count, k.error_count,
             p.name AS provider_name, p.id AS provider_id
      FROM api_keys k
      JOIN providers p ON p.id = k.provider_id
      ORDER BY k.usage_count DESC
      LIMIT 30
    `);
    const key_usage = keyUsage.rows.map((x) => ({
      id: String(x.id),
      provider_id: String(x.provider_id),
      provider_name: String(x.provider_name),
      label: String(x.label ?? ""),
      status: String(x.status),
      usage_count: Number(x.usage_count),
      error_count: Number(x.error_count),
    }));

    return json({ stats, key_usage });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
