import { db, newId } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// GET /api/providers — list providers with aggregated counts
export async function GET() {
  try {
    const client = await db();
    const res = await client.execute(`
      SELECT p.*,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id) AS keys_count,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id AND k.status = 'active') AS active_keys,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id AND k.status = 'exhausted') AS exhausted_keys,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id AND k.status = 'disabled') AS disabled_keys,
        (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id) AS models_count,
        (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id AND m.selected = 1) AS selected_models,
        (SELECT COALESCE(SUM(k.usage_count), 0) FROM api_keys k WHERE k.provider_id = p.id) AS total_usage
      FROM providers p
      ORDER BY p.created_at DESC
    `);
    const providers = res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      base_url: String(r.base_url),
      enabled: Number(r.enabled),
      auto_version: r.auto_version === undefined ? 1 : Number(r.auto_version),
      created_at: String(r.created_at),
      keys_count: Number(r.keys_count),
      active_keys: Number(r.active_keys),
      exhausted_keys: Number(r.exhausted_keys),
      disabled_keys: Number(r.disabled_keys),
      models_count: Number(r.models_count),
      selected_models: Number(r.selected_models),
      total_usage: Number(r.total_usage),
    }));
    return json({ providers });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// POST /api/providers — create provider { name, base_url, auto_version? }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const base_url = String(body?.base_url ?? "").trim();
    const auto_version = body?.auto_version === undefined ? 1 : body.auto_version ? 1 : 0;
    if (!name) return json({ error: "اسم المزود مطلوب" }, 400);
    if (!/^https?:\/\/.+/.test(base_url)) {
      return json({ error: "رابط البيز يجب أن يبدأ بـ http:// أو https://" }, 400);
    }
    const client = await db();
    const id = newId();
    await client.execute({
      sql: "INSERT INTO providers (id, name, base_url, enabled, auto_version) VALUES (?, ?, ?, 1, ?)",
      args: [id, name, base_url, auto_version],
    });
    return json({ id, name, base_url, enabled: 1, auto_version }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
