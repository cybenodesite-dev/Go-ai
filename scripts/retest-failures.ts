/**
 * Re-test ONLY the previously failing models to verify the fixes:
 * - Apinex cascade should be gone (model-scoped 402 no longer kills the key)
 * - model_unavailable error type for restricted models
 * - groq/Token Harbor remain geo-blocked from HK (expected; work on Vercel)
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
const BASE = "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MODELS = [
  "allam-2-7b",
  "qwen/qwen3.8-27b",
  "meta-llama/llama-prompt-guard-2-22m",
  "deepseek-v4.1-flash:free",
  "mimo-v2.6-flash:free",
  "free/claude-opus-4.6",
  "free/deepseek-v4.1-flash",
  "free/gemini-3.1-pro",
  "free/glm-5.3",
  "free/kimi-k2.8",
  "free/minimax-m3",
  "free/qwen-3.8-max",
  "gpt-oss-20b-free",
];

async function main() {
  const gw = await client.execute("SELECT key_value FROM gateway_keys WHERE enabled = 1 LIMIT 1");
  const gwKey = String(gw.rows[0].key_value);

  let pass = 0;
  let fail = 0;
  for (const model of MODELS) {
    let status = 0;
    let reason = "";
    let type = "";
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Say: OK" }], max_tokens: 10 }),
        signal: AbortSignal.timeout(60000),
      });
      status = res.status;
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        type = String(j?.error?.type ?? "success");
        reason = j?.error?.message
          ? String(j.error.message).slice(0, 110)
          : `OK: ${String(j?.choices?.[0]?.message?.content ?? "").slice(0, 30)}`;
      } catch {
        reason = text.slice(0, 80);
      }
    } catch (e) {
      reason = e instanceof Error ? e.message : "net";
    }
    const ok = status === 200;
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? "PASS" : "FAIL"} | ${model} | ${status} | ${type} | ${reason.replace(/\n/g, " ")}`);
    await sleep(1100);
  }
  console.log(`\n${pass} pass, ${fail} fail (of ${MODELS.length})`);

  // verify key health after everything
  const keys = await client.execute("SELECT status, COUNT(*) AS n FROM api_keys GROUP BY status");
  for (const r of keys.rows) console.log(`keys: ${String(r.status)}=${String(r.n)}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
