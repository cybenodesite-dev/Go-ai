import { db } from "@/lib/turso";
import {
  authenticateGatewayKey,
  classifyFailure,
  CORS_HEADERS,
  extractUpstreamMessage,
  GEO_BLOCK_HINT,
  isGeoBlock,
  json,
  touchGatewayKey,
  upstreamUrl,
} from "@/lib/gateway";

export const dynamic = "force-dynamic";
// Vercel: allow long-running LLM responses (clamped to plan limit automatically)
export const maxDuration = 300;

type Candidate = {
  provider_id: string;
  provider_name: string;
  base_url: string;
  auto_version: number;
  key_id: string;
  key_label: string;
  key_value: string;
};

type Attempt = {
  provider: string;
  key: string;
  status: number | string;
  detail: string;
  reason: string;
  geo: boolean;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /v1/chat/completions — OpenAI-compatible endpoint with automatic
 * key rotation / provider failover. When a key is exhausted (429/402) or
 * invalid (401/403) the request is automatically retried on the next
 * available key, then on the next provider serving the same model.
 */
export async function POST(request: Request) {
  const started = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: { message: "JSON body غير صالح", type: "invalid_request_error" } },
      400,
      CORS_HEADERS
    );
  }

  const client = await db();
  const gwKey = await authenticateGatewayKey(client, request);
  if (!gwKey) {
    return json(
      { error: { message: "مفتاح الجيت واي غير صحيح أو معطل", type: "invalid_api_key" } },
      401,
      CORS_HEADERS
    );
  }

  const model = String(body?.model ?? "").trim();
  if (!model) {
    return json(
      { error: { message: "اسم الموديل (model) مطلوب", type: "invalid_request_error" } },
      400,
      CORS_HEADERS
    );
  }
  const isStream = body?.stream === true;

  // 1) Which enabled providers have this model selected?
  const modelRes = await client.execute(
    `
    SELECT p.id AS provider_id, p.name AS provider_name, p.base_url, p.auto_version
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.model_id = ? AND m.selected = 1 AND p.enabled = 1
    ORDER BY p.created_at ASC
  `,
    [model]
  );

  if (!modelRes.rows.length) {
    return json(
      {
        error: {
          message: `الموديل "${model}" غير متاح في الجيت واي — تأكد من تحديده في صفحة المزود`,
          type: "model_not_available",
        },
      },
      404,
      CORS_HEADERS
    );
  }

  // 2) Build the failover candidate list: every active key of every provider
  //    that serves the model, least-used keys first (even load balancing).
  const candidates: Candidate[] = [];
  const providerIds = modelRes.rows.map(
    (r) => ({
      id: String(r.provider_id),
      name: String(r.provider_name),
      base: String(r.base_url),
      autoVersion: r.auto_version === undefined ? 1 : Number(r.auto_version),
    })
  );
  for (const p of providerIds) {
    const keysRes = await client.execute(
      `SELECT id, label, key_value FROM api_keys
       WHERE provider_id = ? AND status = 'active'
       ORDER BY usage_count ASC, created_at ASC`,
      [p.id]
    );
    for (const k of keysRes.rows) {
      candidates.push({
        provider_id: p.id,
        provider_name: p.name,
        base_url: p.base,
        auto_version: p.autoVersion,
        key_id: String(k.id),
        key_label: String(k.label ?? ""),
        key_value: String(k.key_value),
      });
    }
  }

  if (!candidates.length) {
    return json(
      {
        error: {
          message: "لا يوجد مفتاح نشط لهذا الموديل — كل المفاتيح منتهية أو معطلة",
          type: "no_active_keys",
        },
      },
      503,
      CORS_HEADERS
    );
  }

  // 3) Failover loop
  const attempts: Attempt[] = [];
  const forwardedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Title": "AI-Provider-Gateway",
  };
  const clientOrg = request.headers.get("openai-organization");
  if (clientOrg) forwardedHeaders["OpenAI-Organization"] = clientOrg;

  for (const cand of candidates) {
    const url = upstreamUrl(cand.base_url, "/chat/completions", cand.auto_version === 1);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: { ...forwardedHeaders, Authorization: `Bearer ${cand.key_value}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      const detail = isAbort ? "timeout 120s" : "network error";
      const reason = isAbort
        ? "انتهت مهلة الاتصال بالمزود (120 ثانية)"
        : "تعذر الاتصال بالمزود — خطأ شبكة أو رابط غير صحيح";
      attempts.push({ provider: cand.provider_name, key: cand.key_label, status: "net", detail, reason, geo: false });
      await client.execute({
        sql: "UPDATE api_keys SET error_count = error_count + 1, last_error = ?, last_used_at = datetime('now') WHERE id = ?",
        args: [reason, cand.key_id],
      });
      continue;
    }

    if (upstream.ok) {
      // Success — count usage, log and relay the response.
      await client.execute({
        sql: "UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = datetime('now'), status = 'active' WHERE id = ?",
        args: [cand.key_id],
      });
      touchGatewayKey(client, gwKey.id);
      const latency = Date.now() - started;
      await client.execute({
        sql: `INSERT INTO usage_logs (id, gateway_key_name, provider_name, api_key_label, model, status, status_code, attempts, latency_ms, stream, error_message)
              VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, NULL)`,
        args: [
          crypto.randomUUID(),
          gwKey.name,
          cand.provider_name,
          cand.key_label,
          model,
          upstream.status,
          attempts.length + 1,
          latency,
          isStream ? 1 : 0,
        ],
      });

      if (isStream && upstream.body) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Gateway-Failover-Attempts": String(attempts.length),
          },
        });
      }

      const payload = await upstream.text();
      return new Response(payload, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          "X-Gateway-Failover-Attempts": String(attempts.length),
        },
      });
    }

    // Failure — classify the key and move on to the next candidate.
    const status = upstream.status;
    const text = (await upstream.text().catch(() => "")).slice(0, 2000);
    const reason = extractUpstreamMessage(text) || "(رد المزود بدون تفاصيل)";
    const geo = isGeoBlock(status, text);
    const newStatus = classifyFailure(status, text);
    const detail = `HTTP ${status}: ${reason}`;
    attempts.push({ provider: cand.provider_name, key: cand.key_label, status, detail, reason, geo });
    await client.execute({
      sql: "UPDATE api_keys SET error_count = error_count + 1, last_error = ?, last_used_at = datetime('now'), status = ? WHERE id = ?",
      args: [detail.slice(0, 500), newStatus, cand.key_id],
    });

    // 400-level request errors (except auth/quota) are usually not key-specific;
    // we still try the next candidate in case the issue is model/provider specific.
  }

  // 4) Everything failed
  const latency = Date.now() - started;
  const lastStatus = [...attempts].reverse().find((a) => typeof a.status === "number");
  await client.execute({
    sql: `INSERT INTO usage_logs (id, gateway_key_name, provider_name, api_key_label, model, status, status_code, attempts, latency_ms, stream, error_message)
          VALUES (?, ?, ?, ?, ?, 'error', ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      gwKey.name,
      attempts.length ? attempts[attempts.length - 1].provider : null,
      attempts.length ? attempts[attempts.length - 1].key : null,
      model,
      lastStatus ? Number(lastStatus.status) : null,
      attempts.length,
      latency,
      isStream ? 1 : 0,
      attempts.map((a) => `[${a.provider} / ${a.key || "مفتاح"}] ${a.status} — ${a.reason}`).join(" | ").slice(0, 1800),
    ],
  });

  // Build a message that reveals the REAL upstream reason in every client
  // (most clients only display error.message, so the reason must live inside it).
  const geoCount = attempts.filter((a) => a.geo).length;
  const allGeo = attempts.length > 0 && geoCount === attempts.length;
  const last = attempts[attempts.length - 1];
  const lastReason = last
    ? `[${last.provider}${last.key ? ` / ${last.key}` : ""}] ${last.status === "net" ? "خطأ شبكة" : `HTTP ${last.status}`} — ${last.reason.slice(0, 180)}`
    : "لا توجد تفاصيل";

  const message = allGeo
    ? `فشل الطلب على كل المفاتيح (${attempts.length}) — ${GEO_BLOCK_HINT}. آخر رد: ${lastReason}`
    : `فشل الطلب على كل المفاتيح المتاحة (${attempts.length} محاولة — تم تجربة التدوير التلقائي). السبب الأخير: ${lastReason}`;

  return json(
    {
      error: {
        message,
        type: allGeo ? "geo_blocked" : "all_keys_failed",
        attempts,
      },
    },
    502,
    CORS_HEADERS
  );
}
