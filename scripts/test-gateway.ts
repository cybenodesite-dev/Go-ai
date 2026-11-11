/**
 * End-to-end test of the AI gateway: provider -> keys -> fetch models ->
 * select -> /v1/models -> /v1/chat/completions with key failover + streaming.
 */
const BASE = "http://127.0.0.1:3000";

async function j(url: string, init?: RequestInit) {
  const res = await fetch(BASE + url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

function step(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) process.exitCode = 1;
}

// 0) gateway keys (auto-creates default)
const gk = (await j("/api/gateway-keys")) as unknown as {
  status: number;
  body: { keys: Array<{ id: string; key_value: string; enabled: number }> };
};
const gwKey = gk.body.keys.find((k) => k.enabled === 1)?.key_value;
step("gateway key exists", Boolean(gwKey), gwKey?.slice(0, 12) + "…");

// 1) create provider
const prov = (await j("/api/providers", {
  method: "POST",
  body: JSON.stringify({ name: "Mock Test", base_url: "http://127.0.0.1:4100/v1" }),
})) as unknown as { status: number; body: { id: string } };
step("provider created", prov.status === 201, prov.body.id?.slice(0, 8));
const pid = prov.body.id;

// 2) add 3 keys (multi-line)
const keysRes = (await j(`/api/providers/${pid}/keys`, {
  method: "POST",
  body: JSON.stringify({ label: "مفتاح اختبار", key_value: "sk-bad-1\nsk-bad-2\nsk-good" }),
})) as unknown as { status: number; body: { added: number } };
step("3 keys added", keysRes.status === 201 && keysRes.body.added === 3, `added=${keysRes.body.added}`);

// 3) fetch models from upstream
const fm = (await j(`/api/providers/${pid}/fetch-models`, { method: "POST" })) as unknown as {
  status: number;
  body: { fetched: number; added: number; models: Array<{ id: string; model_id: string; selected: number }> };
};
step(
  "fetch models returns 2 upstream models",
  fm.status === 200 && fm.body.fetched === 2 && fm.body.added === 2,
  `fetched=${fm.body.fetched} added=${fm.body.added}`
);

// 4) select all models as available
const modelIds = fm.body.models.map((m) => m.id);
const bulk = (await j("/api/models/bulk", {
  method: "PATCH",
  body: JSON.stringify({ ids: modelIds, selected: true }),
})) as unknown as { status: number; body: { updated: number } };
step("bulk select models", bulk.status === 200 && bulk.body.updated === 2, `updated=${bulk.body.updated}`);

// 5) gateway /v1/models shows ONLY selected models
const gModels = (await fetch(`${BASE}/v1/models`, {
  headers: { Authorization: `Bearer ${gwKey}` },
})) as Response;
const gModelsBody = (await gModels.json()) as { data: Array<{ id: string }> };
step(
  "/v1/models lists selected models only",
  gModels.status === 200 &&
    gModelsBody.data.some((m) => m.id === "mock-model") &&
    gModelsBody.data.some((m) => m.id === "mock-vision"),
  gModelsBody.data.map((m) => m.id).join(", ")
);

// 5b) wrong gateway key -> 401
const bad = (await fetch(`${BASE}/v1/models`, { headers: { Authorization: "Bearer gw-wrong" } })) as Response;
step("wrong gateway key rejected", bad.status === 401, `status=${bad.status}`);

// 5c) unknown model -> 404
const notAvail = (await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "no-such-model", messages: [{ role: "user", content: "hi" }] }),
})) as Response;
step("unknown model -> 404", notAvail.status === 404, `status=${notAvail.status}`);

// 6) chat completion WITH failover: bad-1 (429) -> bad-2 (401) -> good (200)
const chat = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "مرحبا" }], stream: false }),
});
const chatBody = (await chat.json()) as { choices?: Array<{ message: { content: string } }> };
const failoverHeader = chat.headers.get("x-gateway-failover-attempts");
step(
  "chat completion succeeds after key failover",
  chat.status === 200 && Boolean(chatBody.choices?.[0]?.message?.content),
  `status=${chat.status} failoverAttempts=${failoverHeader} content="${chatBody.choices?.[0]?.message?.content?.slice(0, 20)}…"`
);
step("failover tried 2 bad keys", failoverHeader === "2", `header=${failoverHeader}`);

// 7) key states after failover: bad-1 exhausted, bad-2 disabled, good active with usage
const detail = (await j(`/api/providers/${pid}`)) as unknown as {
  body: { keys: Array<{ key_value: string; status: string; usage_count: number; error_count: number }> };
};
const k1 = detail.body.keys.find((k) => k.key_value === "sk-bad-1");
const k2 = detail.body.keys.find((k) => k.key_value === "sk-bad-2");
const k3 = detail.body.keys.find((k) => k.key_value === "sk-good");
step("sk-bad-1 marked exhausted", k1?.status === "exhausted" && k1.error_count >= 1, `status=${k1?.status}`);
step("sk-bad-2 marked disabled", k2?.status === "disabled", `status=${k2?.status}`);
step("sk-good active + counted", k3?.status === "active" && k3.usage_count === 1, `usage=${k3?.usage_count}`);

// 8) streaming pass-through (second call goes straight to sk-good)
const streamRes = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "مرحبا" }], stream: true }),
});
const streamText = await streamRes.text();
step(
  "streaming relays SSE chunks",
  streamRes.status === 200 &&
    streamText.includes("chat.completion.chunk") &&
    streamText.includes("[DONE]"),
  `${streamText.length} bytes`
);

// 9) subsequent non-stream call skips dead keys (failoverAttempts should be 0)
const chat2 = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${gwKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "تاني" }] }),
});
step(
  "second call goes directly to healthy key",
  chat2.status === 200 && chat2.headers.get("x-gateway-failover-attempts") === "0",
  `attempts=${chat2.headers.get("x-gateway-failover-attempts")}`
);

// 10) stats + logs reflect everything
const stats = (await j("/api/stats")) as unknown as {
  body: { stats: { failover_saves: number; total_requests: number; success_requests: number } };
};
step(
  "stats recorded failover save",
  stats.body.stats.failover_saves >= 1 && stats.body.stats.total_requests >= 3,
  `requests=${stats.body.stats.total_requests} success=${stats.body.stats.success_requests} saves=${stats.body.stats.failover_saves}`
);
const logs = (await j("/api/logs?limit=10")) as unknown as { body: { logs: Array<{ status: string; attempts: number }> } };
step(
  "logs show failover row",
  logs.body.logs.some((l) => l.status === "success" && l.attempts === 3),
  `${logs.body.logs.length} log rows`
);

console.log("\n--- DONE ---");
