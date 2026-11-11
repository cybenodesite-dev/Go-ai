/**
 * Read-only inspection of the live Turso DB (real user data — never delete/modify here).
 * Masks API keys: shows only the first 6 and last 4 characters.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in .env");
  process.exit(1);
}
const client = createClient({ url, authToken: token });

function mask(k: string) {
  return k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : "…";
}

async function main() {
  const provs = await client.execute("SELECT id, name, base_url, auto_version, enabled, created_at FROM providers ORDER BY created_at");
  console.log("=== PROVIDERS ===");
  for (const p of provs.rows) {
    console.log(`- ${p.name} | base_url=${p.base_url} | auto_version=${p.auto_version} | enabled=${p.enabled}`);
  }

  const keys = await client.execute(`
    SELECT k.id, p.name AS provider, k.label, k.key_value, k.status, k.usage_count, k.error_count, k.last_error
    FROM api_keys k JOIN providers p ON p.id = k.provider_id ORDER BY p.created_at, k.created_at`);
  console.log("\n=== API KEYS ===");
  for (const k of keys.rows) {
    console.log(`- [${k.provider}] ${k.label} | ${mask(String(k.key_value))} | status=${k.status} | used=${k.usage_count} | err=${k.error_count}`);
    if (k.last_error) console.log(`    last_error: ${String(k.last_error).slice(0, 200)}`);
  }

  const models = await client.execute(`
    SELECT p.name AS provider, m.model_id, m.selected FROM models m
    JOIN providers p ON p.id = m.provider_id ORDER BY p.created_at, m.model_id`);
  console.log("\n=== MODELS (selected=*) ===");
  for (const m of models.rows) {
    if (Number(m.selected) === 1) console.log(`* [${m.provider}] ${m.model_id}`);
  }
  const unselected = models.rows.filter((m) => Number(m.selected) === 0).length;
  console.log(`(plus ${unselected} unselected models)`);

  const gw = await client.execute("SELECT name, key_value, enabled, usage_count FROM gateway_keys");
  console.log("\n=== GATEWAY KEYS ===");
  for (const g of gw.rows) console.log(`- ${g.name} | ${mask(String(g.key_value))} | enabled=${g.enabled} | used=${g.usage_count}`);

  const logs = await client.execute("SELECT * FROM usage_logs ORDER BY rowid DESC LIMIT 12");
  console.log("\n=== LAST 12 USAGE LOGS ===");
  for (const l of logs.rows) {
    console.log(`- ${l.created_at} | ${l.status} ${l.status_code ?? ""} | provider=${l.provider_name ?? "-"} | model=${l.model} | attempts=${l.attempts} | stream=${l.stream}`);
    if (l.error_message) console.log(`    error: ${String(l.error_message).slice(0, 400)}`);
  }
}

main().catch((e) => {
  console.error("inspect failed:", e);
  process.exit(1);
});
