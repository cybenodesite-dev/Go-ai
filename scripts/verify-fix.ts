/**
 * End-to-end verification of the 502 fixes against the LIVE dev server + real providers:
 * 1. xkiro test endpoint (auto_version off) -> models 200
 * 2. Token Harbor test endpoint -> geo message
 * 3. Gateway chat via cometapi (real success path)
 * 4. Gateway chat via Token Harbor -> 502 with clear geo message inside error.message
 * 5. Keys must remain active after geo failures
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
const BASE = "http://localhost:3000";
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  const gw = await client.execute("SELECT key_value FROM gateway_keys WHERE enabled = 1 LIMIT 1");
  const gwKey = String(gw.rows[0].key_value);

  const provs = await client.execute("SELECT id, name FROM providers");
  const byName = new Map(provs.rows.map((r) => [String(r.name), String(r.id)]));

  // 1) xkiro test endpoint
  console.log("\n[1] xkiro /test (auto_version off)");
  {
    const r = await fetch(`${BASE}/api/providers/${byName.get("xkiro")}/test`, { method: "POST" });
    const j = await r.json();
    check("test endpoint 200", r.status === 200);
    check("key passes models check", j.results?.[0]?.ok === true, j.results?.[0]?.reason?.slice(0, 60));
  }

  // 2) Token Harbor test endpoint
  console.log("\n[2] Token Harbor /test (geo blocked)");
  {
    const r = await fetch(`${BASE}/api/providers/${byName.get("Token Harbor")}/test`, { method: "POST" });
    const j = await r.json();
    check("test endpoint 200", r.status === 200);
    check("keys fail (expected here)", j.results?.every((x: { ok: boolean }) => !x.ok) === true);
    check("geo detected", j.all_geo_blocked === true);
    check("geo reason is the friendly hint", /يحجب منطقة/.test(j.results?.[0]?.reason ?? ""));
  }

  // 3) Gateway chat success path (cometapi)
  console.log("\n[3] gateway chat via cometapi — gpt-6-astra");
  {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6-astra",
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 20,
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const j = await r.json();
    check("HTTP 200", r.status === 200, `got ${r.status}`);
    check("has content", typeof j?.choices?.[0]?.message?.content === "string", JSON.stringify(j?.choices?.[0]?.message?.content ?? j).slice(0, 80));
  }

  // 4) Gateway chat geo-blocked provider
  console.log("\n[4] gateway chat via Token Harbor — deepseek-v4.1-flash:free");
  {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-v4.1-flash:free",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const j = await r.json();
    check("HTTP 502", r.status === 502, `got ${r.status}`);
    check("type=geo_blocked", j?.error?.type === "geo_blocked", j?.error?.type);
    check("real reason inside error.message", /يحجب منطقة خروج السيرفر/.test(j?.error?.message ?? ""));
    check("attempts array present", Array.isArray(j?.error?.attempts) && j.error.attempts.length >= 2);
    console.log(`        message: ${String(j?.error?.message).slice(0, 160)}`);
  }

  // 5) keys still active after geo failures
  console.log("\n[5] key statuses after tests");
  {
    const th = await client.execute({
      sql: "SELECT status, COUNT(*) AS n FROM api_keys WHERE provider_id = ? GROUP BY status",
      args: [byName.get("Token Harbor")!],
    });
    const allActive = th.rows.length === 1 && String(th.rows[0].status) === "active";
    check("Token Harbor keys still active (not disabled)", allActive, th.rows.map((r) => `${String(r.status)}=${String(r.n)}`).join(","));
  }

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e);
  process.exit(1);
});
