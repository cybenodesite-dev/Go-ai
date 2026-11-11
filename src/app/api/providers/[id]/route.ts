import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/providers/[id] — provider + its keys + its models
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    const pRes = await client.execute({
      sql: "SELECT * FROM providers WHERE id = ?",
      args: [id],
    });
    if (!pRes.rows.length) return json({ error: "المزود غير موجود" }, 404);
    const r = pRes.rows[0];
    const provider = {
      id: String(r.id),
      name: String(r.name),
      base_url: String(r.base_url),
      enabled: Number(r.enabled),
      auto_version: r.auto_version === undefined ? 1 : Number(r.auto_version),
      created_at: String(r.created_at),
    };

    const kRes = await client.execute({
      sql: "SELECT * FROM api_keys WHERE provider_id = ? ORDER BY created_at ASC",
      args: [id],
    });
    const keys = kRes.rows.map((k) => ({
      id: String(k.id),
      provider_id: String(k.provider_id),
      label: String(k.label ?? ""),
      key_value: String(k.key_value),
      status: String(k.status),
      usage_count: Number(k.usage_count),
      error_count: Number(k.error_count),
      last_used_at: k.last_used_at ? String(k.last_used_at) : null,
      last_error: k.last_error ? String(k.last_error) : null,
      created_at: String(k.created_at),
    }));

    const mRes = await client.execute({
      sql: "SELECT * FROM models WHERE provider_id = ? ORDER BY model_id ASC",
      args: [id],
    });
    const models = mRes.rows.map((m) => ({
      id: String(m.id),
      provider_id: String(m.provider_id),
      model_id: String(m.model_id),
      selected: Number(m.selected),
      created_at: String(m.created_at),
    }));

    return json({ provider, keys, models });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// PATCH /api/providers/[id] — { name?, base_url?, enabled?, auto_version? }
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const client = await db();

    const cur = await client.execute({
      sql: "SELECT * FROM providers WHERE id = ?",
      args: [id],
    });
    if (!cur.rows.length) return json({ error: "المزود غير موجود" }, 404);

    const name = body?.name !== undefined ? String(body.name).trim() : String(cur.rows[0].name);
    const base_url =
      body?.base_url !== undefined ? String(body.base_url).trim() : String(cur.rows[0].base_url);
    const enabled =
      body?.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(cur.rows[0].enabled);
    const auto_version =
      body?.auto_version !== undefined
        ? body.auto_version
          ? 1
          : 0
        : cur.rows[0].auto_version === undefined
          ? 1
          : Number(cur.rows[0].auto_version);

    if (!name) return json({ error: "اسم المزود مطلوب" }, 400);
    if (!/^https?:\/\/.+/.test(base_url)) {
      return json({ error: "رابط البيز يجب أن يبدأ بـ http:// أو https://" }, 400);
    }

    await client.execute({
      sql: "UPDATE providers SET name = ?, base_url = ?, enabled = ?, auto_version = ? WHERE id = ?",
      args: [name, base_url, enabled, auto_version, id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// DELETE /api/providers/[id] — deletes provider + its keys + models
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    await client.batch(
      [
        { sql: "DELETE FROM api_keys WHERE provider_id = ?", args: [id] },
        { sql: "DELETE FROM models WHERE provider_id = ?", args: [id] },
        { sql: "DELETE FROM providers WHERE id = ?", args: [id] },
      ],
      "write"
    );
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
