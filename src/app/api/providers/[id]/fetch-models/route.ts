import { db, newId } from "@/lib/turso";
import { upstreamUrl, json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function extractModelIds(payload: unknown): string[] {
  // Supports OpenAI shape { data: [...] } and Google-ish shape { models: [...] }
  const obj = payload as Record<string, unknown> | null;
  const list = Array.isArray(obj?.data) ? obj.data : Array.isArray(obj?.models) ? obj.models : null;
  if (!list) return [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      ids.push(item);
      continue;
    }
    const o = item as Record<string, unknown>;
    const raw = (o?.id ?? o?.name ?? o?.model) as string | undefined;
    if (typeof raw === "string" && raw.trim()) {
      // Google returns "models/gemini-pro" -> strip prefix
      ids.push(raw.trim().replace(/^models\//, ""));
    }
  }
  return ids;
}

// POST /api/providers/[id]/fetch-models — pull model list from the upstream provider
export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const client = await db();
    const pRes = await client.execute({
      sql: "SELECT * FROM providers WHERE id = ?",
      args: [id],
    });
    if (!pRes.rows.length) return json({ error: "المزود غير موجود" }, 404);
    const provider = pRes.rows[0];
    const baseUrl = String(provider.base_url);

    const kRes = await client.execute({
      sql: "SELECT key_value FROM api_keys WHERE provider_id = ? AND status != 'disabled' ORDER BY usage_count ASC LIMIT 1",
      args: [id],
    });
    if (!kRes.rows.length) {
      return json({ error: "أضف مفتاح API واحد على الأقل لهذا المزود أولًا" }, 400);
    }
    const apiKey = String(kRes.rows[0].key_value);

    const url = upstreamUrl(baseUrl, "/models");
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return json({ error: `تعذر الاتصال بالمزود على ${url}` }, 502);
    }

    if (!upstream.ok) {
      const text = (await upstream.text().catch(() => "")).slice(0, 300);
      return json(
        { error: `المزود رد بالخطأ ${upstream.status}${text ? `: ${text}` : ""}` },
        502
      );
    }

    const payload = await upstream.json().catch(() => null);
    const ids = extractModelIds(payload);
    if (!ids.length) {
      return json({ error: "لم يتمكن من قراءة أي موديلات من رد المزود" }, 502);
    }

    let added = 0;
    for (const modelId of Array.from(new Set(ids))) {
      const res = await client.execute({
        sql: "INSERT INTO models (id, provider_id, model_id, selected) VALUES (?, ?, ?, 0) ON CONFLICT(provider_id, model_id) DO NOTHING",
        args: [newId(), id, modelId],
      });
      if (res.rowsAffected > 0) added++;
    }

    const all = await client.execute({
      sql: "SELECT id, model_id, selected FROM models WHERE provider_id = ? ORDER BY model_id ASC",
      args: [id],
    });
    const models = all.rows.map((m) => ({
      id: String(m.id),
      model_id: String(m.model_id),
      selected: Number(m.selected),
    }));

    return json({ ok: true, fetched: ids.length, added, models });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
