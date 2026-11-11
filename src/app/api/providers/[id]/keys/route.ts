import { db, newId } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/providers/[id]/keys — add one or many keys (newline separated)
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const label = String(body?.label ?? "").trim();
    const raw = String(body?.key_value ?? "").trim();
    if (!raw) return json({ error: "المفتاح مطلوب" }, 400);

    const client = await db();
    const pRes = await client.execute({
      sql: "SELECT id FROM providers WHERE id = ?",
      args: [id],
    });
    if (!pRes.rows.length) return json({ error: "المزود غير موجود" }, 404);

    const parts = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return json({ error: "المفتاح مطلوب" }, 400);
    if (parts.length > 100) return json({ error: "الحد الأقصى 100 مفتاح في المرة" }, 400);

    const created: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const keyLabel = parts.length > 1 ? (label ? `${label} ${i + 1}` : `مفتاح ${i + 1}`) : label;
      const keyId = newId();
      await client.execute({
        sql: "INSERT INTO api_keys (id, provider_id, label, key_value, status) VALUES (?, ?, ?, ?, 'active')",
        args: [keyId, id, keyLabel, parts[i]],
      });
      created.push(keyId);
    }
    return json({ ok: true, added: created.length }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
