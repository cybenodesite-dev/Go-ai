/**
 * Direct upstream tests — reproduce what the gateway experiences, per provider.
 * Also reveals server egress region (many providers geo-block).
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

function mask(k: string) {
  return k.length <= 12 ? k.slice(0, 4) + "…" + k.slice(-4) : k.slice(0, 8) + "…" + k.slice(-4);
}

async function egressRegion() {
  try {
    const r = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
      signal: AbortSignal.timeout(8000),
    });
    const t = await r.text();
    const loc = t.match(/loc=(\S+)/)?.[1];
    const ip = t.match(/ip=(\S+)/)?.[1];
    const colo = t.match(/colo=(\S+)/)?.[1];
    console.log(`EGRESS: country=${loc} colo=${colo} ip=${ip}`);
  } catch (e) {
    console.log("EGRESS check failed:", e instanceof Error ? e.message : e);
  }
}

async function main() {
  await egressRegion();

  const providers = await client.execute("SELECT * FROM providers ORDER BY created_at");
  for (const p of providers.rows) {
    const name = String(p.name);
    const base = String(p.base_url);
    const keys = await client.execute({
      sql: "SELECT key_value, label, status FROM api_keys WHERE provider_id = ? ORDER BY created_at LIMIT 1",
      args: [String(p.id)],
    });
    if (!keys.rows.length) {
      console.log(`\n### ${name} (${base}) — no keys, skip`);
      continue;
    }
    const key = String(keys.rows[0].key_value);
    console.log(`\n### ${name} | base=${base} | key=${mask(key)} (status=${String(keys.rows[0].status)})`);

    // 1) GET /models
    let b = base.trim().replace(/\/+$/, "");
    if (!/(\/v\d+(beta|preview)?)(\/)?$/.test(b)) b += "/v1";
    try {
      const r = await fetch(b + "/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      const txt = (await r.text()).slice(0, 220);
      console.log(`  GET /models -> ${r.status} | ${txt.replace(/\s+/g, " ")}`);
    } catch (e) {
      console.log(`  GET /models -> NETWORK ERROR: ${e instanceof Error ? e.message : e}`);
    }

    // 2) POST /chat/completions tiny
    try {
      const r = await fetch(b + "/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const txt = (await r.text()).slice(0, 260);
      console.log(`  POST /chat/completions -> ${r.status} | ${txt.replace(/\s+/g, " ")}`);
    } catch (e) {
      console.log(`  POST /chat/completions -> NETWORK ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
