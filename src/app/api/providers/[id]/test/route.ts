import { db } from "@/lib/turso";
import {
  extractUpstreamMessage,
  GEO_BLOCK_HINT,
  isGeoBlock,
  json,
  looksLikePathNotFound,
  upstreamUrl,
} from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

type KeyResult = {
  label: string;
  status_before: string;
  ok: boolean;
  http_status: number | null;
  reason: string;
  geo: boolean;
  reactivated: boolean;
};

/**
 * POST /api/providers/[id]/test — real connection diagnostics:
 * 1. GET {base}/models with EVERY key (finds dead keys, region blocks, wrong paths)
 * 2. POST a tiny chat completion on the first selected model (verifies end-to-end)
 * Keys that pass are auto-reactivated (fixes keys wrongly marked disabled/exhausted,
 * e.g. after a geo-block that no longer applies on Vercel).
 */
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
    const autoVersion = provider.auto_version === undefined ? true : Number(provider.auto_version) === 1;

    const kRes = await client.execute({
      sql: "SELECT id, label, key_value, status FROM api_keys WHERE provider_id = ? ORDER BY created_at ASC",
      args: [id],
    });
    if (!kRes.rows.length) {
      return json({ error: "أضف مفتاح API واحد على الأقل أولًا" }, 400);
    }

    // Probe the path style once with the first key; self-heal /v1 setting if needed.
    let effectiveAuto = autoVersion;
    let autoVersionFixed: boolean | null = null;
    {
      const probeKey = String(kRes.rows[0].key_value);
      try {
        const probe = await fetch(upstreamUrl(baseUrl, "/models", effectiveAuto), {
          headers: { Authorization: `Bearer ${probeKey}`, Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (probe.status === 404) {
          const peek = await probe.text().catch(() => "");
          if (looksLikePathNotFound(404, peek)) {
            const alt = await fetch(upstreamUrl(baseUrl, "/models", !effectiveAuto), {
              headers: { Authorization: `Bearer ${probeKey}`, Accept: "application/json" },
              signal: AbortSignal.timeout(15000),
            });
            if (alt.ok) {
              effectiveAuto = !effectiveAuto;
              autoVersionFixed = effectiveAuto;
              await client.execute({
                sql: "UPDATE providers SET auto_version = ? WHERE id = ?",
                args: [effectiveAuto ? 1 : 0, id],
              });
            }
          }
        }
      } catch {
        /* per-key checks below will report the network error */
      }
    }

    const modelsUrl = upstreamUrl(baseUrl, "/models", effectiveAuto);
    const results: KeyResult[] = [];
    let reactivated = 0;

    for (const k of kRes.rows) {
      const label = String(k.label ?? "");
      const statusBefore = String(k.status);
      let ok = false;
      let httpStatus: number | null = null;
      let reason = "";
      let geo = false;

      try {
        const up = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${String(k.key_value)}`, Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        const text = (await up.text().catch(() => "")).slice(0, 2000);
        httpStatus = up.status;
        ok = up.ok;
        geo = isGeoBlock(up.status, text);
        reason = ok
          ? "تم — المفتاح يعمل وقائمة الموديلات وصلت"
          : geo
            ? `HTTP ${up.status} — ${GEO_BLOCK_HINT}`
            : `HTTP ${up.status}${extractUpstreamMessage(text) ? ` — ${extractUpstreamMessage(text)}` : ""}`;
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        reason = isAbort ? "انتهت مهلة الاتصال (15 ثانية)" : "تعذر الاتصال بالمزود — خطأ شبكة أو رابط غير صحيح";
      }

      let wasReactivated = false;
      if (ok) {
        if (statusBefore !== "active") {
          await client.execute({
            sql: "UPDATE api_keys SET status = 'active', error_count = 0, last_error = NULL WHERE id = ?",
            args: [String(k.id)],
          });
          wasReactivated = true;
          reactivated++;
        } else {
          await client.execute({
            sql: "UPDATE api_keys SET last_error = NULL WHERE id = ?",
            args: [String(k.id)],
          });
        }
      } else {
        await client.execute({
          sql: "UPDATE api_keys SET last_error = ? WHERE id = ?",
          args: [reason.slice(0, 500), String(k.id)],
        });
      }

      results.push({ label, status_before: statusBefore, ok, http_status: httpStatus, reason, geo, reactivated: wasReactivated });
    }

    // Real chat test on the first selected model with the least-used active key
    let chat: {
      ok: boolean;
      model: string;
      http_status: number | null;
      reason: string;
      geo: boolean;
      latency_ms: number;
      tested: boolean;
    } | null = null;

    const mRes = await client.execute({
      sql: "SELECT model_id FROM models WHERE provider_id = ? AND selected = 1 ORDER BY model_id ASC LIMIT 1",
      args: [id],
    });
    const ckRes = await client.execute({
      sql: "SELECT key_value, label FROM api_keys WHERE provider_id = ? AND status = 'active' ORDER BY usage_count ASC, created_at ASC LIMIT 1",
      args: [id],
    });

    if (mRes.rows.length && ckRes.rows.length) {
      const model = String(mRes.rows[0].model_id);
      const chatUrl = upstreamUrl(baseUrl, "/chat/completions", effectiveAuto);
      const started = Date.now();
      try {
        const up = await fetch(chatUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${String(ckRes.rows[0].key_value)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 8,
            stream: false,
          }),
          signal: AbortSignal.timeout(60000),
        });
        const text = (await up.text().catch(() => "")).slice(0, 2000);
        const geo = isGeoBlock(up.status, text);
        chat = {
          ok: up.ok,
          model,
          http_status: up.status,
          reason: up.ok
            ? "تم — المزود رد برد كامل على الطلب الفعلي"
            : geo
              ? `HTTP ${up.status} — ${GEO_BLOCK_HINT}`
              : `HTTP ${up.status}${extractUpstreamMessage(text) ? ` — ${extractUpstreamMessage(text)}` : ""}`,
          geo,
          latency_ms: Date.now() - started,
          tested: true,
        };
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        chat = {
          ok: false,
          model,
          http_status: null,
          reason: isAbort ? "انتهت مهلة الاتصال (60 ثانية)" : "تعذر الاتصال بالمزود — خطأ شبكة أو رابط غير صحيح",
          geo: false,
          latency_ms: Date.now() - started,
          tested: true,
        };
      }
    }

    return json({
      ok: true,
      models_url: modelsUrl,
      results,
      chat,
      reactivated,
      all_geo_blocked: results.length > 0 && results.every((r) => r.geo),
      auto_version_fixed: autoVersionFixed,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
