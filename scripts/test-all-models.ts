/**
 * Comprehensive test: EVERY selected model through the live gateway
 * (/v1/chat/completions), exactly like a real client. Paced to be gentle.
 * Produces a per-model verdict table + groups failures by root cause.
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
const BASE = "http://localhost:3000";
const PAUSE_MS = 1100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = {
  model: string;
  providers: string;
  status: number;
  attempts: number;
  provider_used: string;
  ok: boolean;
  reason: string;
  latency_ms: number;
};

async function main() {
  const gw = await client.execute("SELECT key_value FROM gateway_keys WHERE enabled = 1 LIMIT 1");
  const gwKey = String(gw.rows[0].key_value);

  const rows = await client.execute(`
    SELECT m.model_id, GROUP_CONCAT(p.name, ' + ') AS providers
    FROM models m JOIN providers p ON p.id = m.provider_id
    WHERE m.selected = 1 AND p.enabled = 1
    GROUP BY m.model_id ORDER BY m.model_id
  `);

  const results: Row[] = [];
  for (const r of rows.rows) {
    const model = String(r.model_id);
    const providers = String(r.providers);
    const started = Date.now();
    let status = 0;
    let attempts = 0;
    let providerUsed = "-";
    let ok = false;
    let reason = "";

    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say: OK" }],
          max_tokens: 10,
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });
      status = res.status;
      attempts = Number(res.headers.get("x-gateway-failover-attempts") ?? "0");
      const text = await res.text();
      if (res.ok) {
        ok = true;
        try {
          const j = JSON.parse(text);
          const content = j?.choices?.[0]?.message?.content ?? "";
          reason = `reply: ${String(content).slice(0, 40).replace(/\s+/g, " ") || "(empty)"}`;
        } catch {
          reason = "200 (non-JSON body)";
        }
      } else {
        try {
          const j = JSON.parse(text);
          const atts = j?.error?.attempts ?? [];
          if (atts.length) {
            const last = atts[atts.length - 1];
            providerUsed = `${last.provider}`;
            reason = `${last.status} — ${String(last.reason ?? "").slice(0, 120)}`;
          } else {
            reason = String(j?.error?.message ?? text).slice(0, 120);
          }
        } catch {
          reason = text.slice(0, 120);
        }
      }
    } catch (e) {
      reason = e instanceof Error && e.name === "AbortError" ? "timeout 60s" : "network error to gateway";
    }
    const latency = Date.now() - started;
    results.push({ model, providers, status, attempts, provider_used: providerUsed, ok, reason, latency_ms: latency });
    console.log(
      `${ok ? "PASS" : "FAIL"} | ${model} | ${status} | att=${attempts} | ${latency}ms | ${providers} | ${reason.replace(/\n/g, " ")}`
    );
    await sleep(PAUSE_MS);
  }

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${passed.length}/${results.length} models PASS =====\n`);
  if (failed.length) {
    console.log("FAILED MODELS:");
    for (const f of failed) console.log(`  - ${f.model} (${f.providers}) -> ${f.status} ${f.reason.slice(0, 150)}`);
  }
  // persist for the report step
  await Bun.write("/tmp/model-test-results.json", JSON.stringify(results, null, 2));
  console.log("\nsaved: /tmp/model-test-results.json");
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
