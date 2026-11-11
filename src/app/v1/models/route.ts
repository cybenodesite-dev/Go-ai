import { db } from "@/lib/turso";
import { authenticateGatewayKey, CORS_HEADERS, json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// GET /v1/models — OpenAI-compatible list of the models the admin selected
export async function GET(request: Request) {
  try {
    const client = await db();
    const key = await authenticateGatewayKey(client, request);
    if (!key) {
      return json(
        { error: { message: "مفتاح الجيت واي غير صحيح أو معطل", type: "invalid_api_key" } },
        401,
        CORS_HEADERS
      );
    }

    const res = await client.execute(`
      SELECT DISTINCT m.model_id, p.name AS provider_name
      FROM models m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.selected = 1 AND p.enabled = 1
      ORDER BY m.model_id ASC
    `);

    const seen = new Set<string>();
    const data: Array<Record<string, unknown>> = [];
    for (const r of res.rows) {
      const modelId = String(r.model_id);
      if (seen.has(modelId)) continue;
      seen.add(modelId);
      data.push({
        id: modelId,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: String(r.provider_name),
      });
    }

    return json({ object: "list", data }, 200, CORS_HEADERS);
  } catch (err) {
    return json(
      { error: { message: err instanceof Error ? err.message : "خطأ غير معروف", type: "gateway_error" } },
      500,
      CORS_HEADERS
    );
  }
}
