import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// PATCH /api/models/bulk — { ids: string[], selected: boolean }
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    const selected = body?.selected ? 1 : 0;
    if (!Array.isArray(ids) || ids.length === 0) {
      return json({ error: "قائمة الموديلات مطلوبة" }, 400);
    }
    const client = await db();
    const stmts = (ids as unknown[]).slice(0, 500).map((mid) => ({
      sql: "UPDATE models SET selected = ? WHERE id = ?",
      args: [selected, String(mid)],
    }));
    await client.batch(stmts, "write");
    return json({ ok: true, updated: stmts.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
