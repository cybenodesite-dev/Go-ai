import { db, newId } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// GET /api/models — all models with provider info (?selected=1 to filter)
export async function GET(request: Request) {
  try {
    const client = await db();
    const url = new URL(request.url);
    const onlySelected = url.searchParams.get("selected") === "1";
    const res = await client.execute(`
      SELECT m.id, m.model_id, m.selected, m.created_at,
             p.id AS provider_id, p.name AS provider_name, p.enabled AS provider_enabled
      FROM models m
      JOIN providers p ON p.id = m.provider_id
      ORDER BY p.name ASC, m.model_id ASC
    `);
    const models = res.rows
      .map((r) => ({
        id: String(r.id),
        model_id: String(r.model_id),
        selected: Number(r.selected),
        created_at: String(r.created_at),
        provider_id: String(r.provider_id),
        provider_name: String(r.provider_name),
        provider_enabled: Number(r.provider_enabled),
      }))
      .filter((m) => (onlySelected ? m.selected === 1 : true));
    return json({ models });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// POST /api/models — manual add { provider_id, model_id }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider_id = String(body?.provider_id ?? "").trim();
    const model_id = String(body?.model_id ?? "").trim();
    if (!provider_id || !model_id) return json({ error: "المزود واسم الموديل مطلوبان" }, 400);

    const client = await db();
    await client.execute({
      sql: "INSERT INTO models (id, provider_id, model_id, selected) VALUES (?, ?, ?, 1) ON CONFLICT(provider_id, model_id) DO UPDATE SET selected = 1",
      args: [newId(), provider_id, model_id],
    });
    return json({ ok: true }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
