/**
 * Diagnose Gemini base-URL behaviour (read-only on DB; keys never printed).
 * Tests which URL shapes Google accepts for OpenAI-style calls.
 */
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function tryUrl(name: string, url: string, init: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    const text = (await res.text()).slice(0, 300);
    console.log(`\n[${name}] -> HTTP ${res.status}`);
    console.log(`  ${text.replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`\n[${name}] -> NETWORK ERROR: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  // latest logs mentioning Gemini
  const logs = await client.execute(
    `SELECT created_at, status, status_code, attempts, error_message FROM usage_logs
     WHERE model LIKE 'gemini%' OR provider_name LIKE '%emini%'
     ORDER BY rowid DESC LIMIT 8`
  );
  console.log("=== GEMINI LOGS ===");
  if (!logs.rows.length) console.log("(none)");
  for (const l of logs.rows) {
    console.log(`- ${l.created_at} | ${l.status} ${l.status_code ?? ""} | attempts=${l.attempts}`);
    if (l.error_message) console.log(`    ${String(l.error_message).slice(0, 260)}`);
  }

  // all gemini provider models (selected and not)
  const models = await client.execute(
    `SELECT model_id, selected FROM models WHERE provider_id = (SELECT id FROM providers WHERE name = 'Gemini') ORDER BY model_id LIMIT 30`
  );
  console.log("\n=== GEMINI MODELS IN DB ===");
  for (const m of models.rows) console.log(`- ${m.model_id} (selected=${m.selected})`);

  const k = await client.execute(
    `SELECT key_value FROM api_keys WHERE provider_id = (SELECT id FROM providers WHERE name = 'Gemini') LIMIT 1`
  );
  const key = String(k.rows[0].key_value);
  console.log("\n=== URL TESTS (key masked, never printed) ===");

  const auth = { Authorization: `Bearer ${key}` };
  const chatBody = JSON.stringify({
    model: "gemini-3.8-flash",
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 10,
  });
  const post = { method: "POST", headers: { ...auth, "Content-Type": "application/json" } };

  await tryUrl("A: v1beta/chat/completions (current, auto_version=0)", "https://generativelanguage.googleapis.com/v1beta/chat/completions", { ...post, body: chatBody });
  await tryUrl("B: v1beta/openai/chat/completions (expected fix)", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { ...post, body: chatBody });
  await tryUrl("C: v1beta/models (native list, Bearer)", "https://generativelanguage.googleapis.com/v1beta/models", { headers: auth });
  await tryUrl("D: v1beta/openai/models (openai-compat list)", "https://generativelanguage.googleapis.com/v1beta/openai/models", { headers: auth });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
