import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/keys/[id] — { label?, status?, reset_usage? }
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const client = await db();

    const cur = await client.execute({
      sql: "SELECT * FROM api_keys WHERE id = ?",
      args: [id],
    });
    if (!cur.rows.length) return json({ error: "المفتاح غير موجود" }, 404);
    const row = cur.rows[0];

    if (body?.reset_usage) {
      await client.execute({
        sql: "UPDATE api_keys SET usage_count = 0, error_count = 0, last_error = NULL WHERE id = ?",
        args: [id],
      });
    }

    const label = body?.label !== undefined ? String(body.label).trim() : String(row.label ?? "");
    const status =
      body?.status !== undefined && ["active", "exhausted", "disabled"].includes(String(body.status))
        ? String(body.status)
        : body?.reset_usage
          ? "active"
          : String(row.status);

    await client.execute({
      sql: "UPDATE api_keys SET label = ?, status = ? WHERE id = ?",
      args: [label, status, id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// DELETE /api/keys/[id]
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    await client.execute({
      sql: "DELETE FROM api_keys WHERE id = ?",
      args: [id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
