/**
 * Mock upstream OpenAI-compatible provider for testing the gateway failover.
 * - POST /v1/chat/completions
 *     Bearer sk-bad-1  -> 429 (rate limit / exhausted)
 *     Bearer sk-bad-2  -> 401 (invalid key)
 *     Bearer sk-good   -> 200 (JSON or SSE when stream=true)
 * - GET  /v1/models -> 200 list with mock-model & mock-vision
 */
const PORT = 4100;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();

    if (url.pathname === "/v1/models") {
      if (!token) return Response.json({ error: { message: "no key" } }, { status: 401 });
      return Response.json({
        object: "list",
        data: [{ id: "mock-model" }, { id: "mock-vision" }],
      });
    }

    if (url.pathname === "/v1/chat/completions") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      if (token === "sk-bad-1") {
        return Response.json({ error: { message: "rate limit exceeded" } }, { status: 429 });
      }
      if (token === "sk-bad-2") {
        return Response.json({ error: { message: "invalid api key" } }, { status: 401 });
      }
      if (token === "sk-good") {
        if (body.stream === true) {
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                enc.encode('data: {"id":"mock1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"مرحبا "}}]}\n\n')
              );
              setTimeout(() => {
                controller.enqueue(
                  enc.encode('data: {"id":"mock1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"من الجيت واي!"}}]}\n\n')
                );
                controller.enqueue(enc.encode("data: [DONE]\n\n"));
                controller.close();
              }, 120);
            },
          });
          return new Response(stream, {
            headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
          });
        }
        return Response.json({
          id: "mock1",
          object: "chat.completion",
          model: String(body.model ?? "mock-model"),
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "أهلاً! الرد جاي من المزود الوهمي بعد تدوير ناجح." },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 9, total_tokens: 14 },
        });
      }
      return Response.json({ error: { message: "unknown key" } }, { status: 401 });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
});

console.log(`mock upstream ready on http://127.0.0.1:${PORT}`);
