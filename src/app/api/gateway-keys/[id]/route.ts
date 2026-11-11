import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/gateway-keys/[id] — { name?, enabled?, reset_usage? }
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const client = await db();

    const cur = await client.execute({
      sql: "SELECT * FROM gateway_keys WHERE id = ?",
      args: [id],
    });
    if (!cur.rows.length) return json({ error: "المفتاح غير موجود" }, 404);
    const row = cur.rows[0];

    if (body?.reset_usage) {
      await client.execute({
        sql: "UPDATE gateway_keys SET usage_count = 0 WHERE id = ?",
        args: [id],
      });
    }

    const name = body?.name !== undefined ? String(body.name).trim() : String(row.name ?? "");
    const enabled =
      body?.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(row.enabled);

    await client.execute({
      sql: "UPDATE gateway_keys SET name = ?, enabled = ? WHERE id = ?",
      args: [name, enabled, id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// DELETE /api/gateway-keys/[id]
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    const res = await client.execute("SELECT COUNT(*) AS c FROM gateway_keys");
    if (Number(res.rows[0].c) <= 1) {
      return json({ error: "لا يمكن حذف آخر مفتاح — أنشئ مفتاحًا بديلًا أولًا" }, 400);
    }
    await client.execute({
      sql: "DELETE FROM gateway_keys WHERE id = ?",
      args: [id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
