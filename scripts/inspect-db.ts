/**
 * Dumps current DB state: providers, keys (masked), models selected, gateway keys, recent logs.
 * Read-only diagnostics.
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

function mask(k: string) {
  if (k.length <= 12) return k.slice(0, 4) + "…" + k.slice(-4);
  return k.slice(0, 8) + "…" + k.slice(-4);
}

const out: string[] = [];
function p(s: string) {
  out.push(s);
  console.log(s);
}

async function main() {
  const providers = await client.execute("SELECT * FROM providers ORDER BY created_at");
  p("\n===== PROVIDERS =====");
  for (const r of providers.rows) {
    p(
      `id=${String(r.id)} | name=${String(r.name)} | base_url=${String(r.base_url)} | enabled=${String(r.enabled)}`
    );
    const keys = await client.execute({
      sql: "SELECT id, label, key_value, status, usage_count, error_count, last_used_at, last_error FROM api_keys WHERE provider_id = ?",
      args: [String(r.id)],
    });
    for (const k of keys.rows) {
      p(
        `   KEY ${mask(String(k.key_value))} | label=${String(k.label)} | status=${String(k.status)} | used=${String(k.usage_count)} | errors=${String(k.error_count)} | last_used=${String(k.last_used_at ?? "-")} | last_error=${String((k.last_error ?? "-") as string).slice(0, 200)}`
      );
    }
    const models = await client.execute({
      sql: "SELECT model_id, selected FROM models WHERE provider_id = ? ORDER BY selected DESC, model_id LIMIT 40",
      args: [String(r.id)],
    });
    const sel = models.rows.filter((m) => Number(m.selected) === 1).map((m) => String(m.model_id));
    const unsel = models.rows.filter((m) => Number(m.selected) === 0).map((m) => String(m.model_id));
    p(`   SELECTED(${sel.length}): ${sel.join(", ") || "-"}`);
    p(`   unselected sample(${unsel.length}): ${unsel.slice(0, 6).join(", ")}`);
  }

  const gk = await client.execute("SELECT id, name, key_value, enabled, usage_count FROM gateway_keys");
  p("\n===== GATEWAY KEYS =====");
  for (const r of gk.rows) {
    p(`name=${String(r.name)} | key=${mask(String(r.key_value))} | enabled=${String(r.enabled)} | used=${String(r.usage_count)}`);
  }

  const logs = await client.execute("SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT 30");
  p("\n===== LAST 30 USAGE LOGS =====");
  for (const r of logs.rows) {
    p(
      `[${String(r.created_at)}] key=${String(r.gateway_key_name)} | provider=${String(r.provider_name)} | keyLabel=${String(r.api_key_label)} | model=${String(r.model)} | status=${String(r.status)} | code=${String(r.status_code)} | attempts=${String(r.attempts)} | latency=${String(r.latency_ms)} | stream=${String(r.stream)} | err=${String((r.error_message ?? "-") as string).slice(0, 300)}`
    );
  }
}

main().catch((e) => {
  console.error("INSPECT FAILED:", e);
  process.exit(1);
});
