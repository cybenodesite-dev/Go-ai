/**
 * Verifies the Gemini fix:
 * 1) upstreamUrl() unit checks for every base-URL variant
 * 2) isGeoBlock() now catches Google's 400 location error
 * 3) E2E through the live gateway: gemini model (expects geo_blocked 502 with hint)
 *    + a healthy provider model (expects 200)
 */
import { upstreamUrl, isGeoBlock } from "../src/lib/gateway";
import { createClient } from "@libsql/client";

let fails = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}\n   actual:   ${actual}\n   expected: ${expected}`);
}

console.log("=== 1) upstreamUrl — Google variants ===");
expect("bare google host + chat", upstreamUrl("https://generativelanguage.googleapis.com", "/chat/completions"), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
expect("user's URL (v1beta) + chat", upstreamUrl("https://generativelanguage.googleapis.com/v1beta", "/chat/completions"), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
expect("v1beta + trailing slash", upstreamUrl("https://generativelanguage.googleapis.com/v1beta/", "/chat/completions"), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
expect("already /openai", upstreamUrl("https://generativelanguage.googleapis.com/v1beta/openai", "/chat/completions", false), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
expect("google + /models", upstreamUrl("https://generativelanguage.googleapis.com/v1beta", "/models"), "https://generativelanguage.googleapis.com/v1beta/openai/models");
expect("no protocol google", upstreamUrl("generativelanguage.googleapis.com/v1beta", "/chat/completions"), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");

console.log("\n=== 2) upstreamUrl — non-Google regression ===");
expect("openai style v1", upstreamUrl("https://api.groq.com/openai/v1", "/chat/completions"), "https://api.groq.com/openai/v1/chat/completions");
expect("no version + auto", upstreamUrl("https://tokenharbor.ai", "/chat/completions"), "https://tokenharbor.ai/v1/chat/completions");
expect("no version + auto off (worker)", upstreamUrl("https://proxy.example.workers.dev", "/chat/completions", false), "https://proxy.example.workers.dev/chat/completions");

console.log("\n=== 3) isGeoBlock — Google 400 location error ===");
expect("google 400 location", isGeoBlock(400, '{"error":{"code":400,"message":"User location is not supported for the API use.","status":"FAILED_PRECONDITION"}}'), true);
expect("openai 403 region code", isGeoBlock(403, '{"error":{"message":"You are not allowed to run this operation.","type":"request_error","code":"unsupported_country_region_territory"}}'), true);
expect("openai 403 region message", isGeoBlock(403, '{"error":{"message":"Country, region, and/or territory not supported."}}'), true);
expect("tokenharbor 403 sanctions", isGeoBlock(403, "API access from your region is not available."), true);
expect("normal 400 NOT geo", isGeoBlock(400, '{"error":{"message":"Invalid JSON"}}'), false);
expect("normal 500 NOT geo", isGeoBlock(500, "Internal Server Error"), false);

console.log("\n=== 4) E2E via live gateway ===");
const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });

const gw = await client.execute("SELECT key_value FROM gateway_keys WHERE enabled=1 LIMIT 1");
const gwKey = String(gw.rows[0].key_value);
const base = "http://localhost:3000";

async function callGateway(model: string) {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Say OK" }], max_tokens: 10 }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  console.log(`\n[GW] model=${model} -> HTTP ${res.status}`);
  console.log("  " + text.slice(0, 400).replace(/\s+/g, " "));
  return res;
}

await callGateway("gemini-3.8-flash"); // geo-block expected from this server -> geo_blocked 502
await callGateway("allam-2-7b");       // healthy groq model -> 200

console.log(fails === 0 ? "\nALL UNIT CHECKS PASSED" : `\n${fails} UNIT CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
