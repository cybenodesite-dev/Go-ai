import { db, newId, generateGatewayKey } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// GET /api/gateway-keys — list keys (auto-creates a default key on first run)
export async function GET() {
  try {
    const client = await db();
    const count = await client.execute("SELECT COUNT(*) AS c FROM gateway_keys");
    if (Number(count.rows[0].c) === 0) {
      await client.execute({
        sql: "INSERT INTO gateway_keys (id, name, key_value, enabled) VALUES (?, ?, ?, 1)",
        args: [newId(), "المفتاح الافتراضي", generateGatewayKey()],
      });
    }
    const res = await client.execute(
      "SELECT * FROM gateway_keys ORDER BY created_at ASC"
    );
    const keys = res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      key_value: String(r.key_value),
      enabled: Number(r.enabled),
      usage_count: Number(r.usage_count),
      last_used_at: r.last_used_at ? String(r.last_used_at) : null,
      created_at: String(r.created_at),
    }));
    return json({ keys });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}

// POST /api/gateway-keys — { name }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim() || "مفتاح جديد";
    const client = await db();
    const id = newId();
    const key = generateGatewayKey();
    await client.execute({
      sql: "INSERT INTO gateway_keys (id, name, key_value, enabled) VALUES (?, ?, ?, 1)",
      args: [id, name, key],
    });
    return json({ id, name, key_value: key }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
