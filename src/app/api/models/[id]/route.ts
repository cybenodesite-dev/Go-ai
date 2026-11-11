import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/models/[id] — { selected }
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const client = await db();
    await client.execute({
      sql: "UPDATE models SET selected = ? WHERE id = ?",
      args: [body?.selected ? 1 : 0, id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// DELETE /api/models/[id]
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    await client.execute({
      sql: "DELETE FROM models WHERE id = ?",
      args: [id],
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
