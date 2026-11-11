import { db } from "@/lib/turso";
import { json } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// GET /api/logs?limit=100&status=success|error
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 60) || 60, 200);
    const status = url.searchParams.get("status");

    const client = await db();
    const res = await client.execute({
      sql: `SELECT * FROM usage_logs
            ${status === "success" || status === "error" ? "WHERE status = ?" : ""}
            ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      args: status === "success" || status === "error" ? [status, limit] : [limit],
    });

    const logs = res.rows.map((r) => ({
      id: String(r.id),
      gateway_key_name: r.gateway_key_name ? String(r.gateway_key_name) : "",
      provider_name: r.provider_name ? String(r.provider_name) : "",
      api_key_label: r.api_key_label ? String(r.api_key_label) : "",
      model: r.model ? String(r.model) : "",
      status: String(r.status),
      status_code: r.status_code === null ? null : Number(r.status_code),
      attempts: Number(r.attempts),
      latency_ms: r.latency_ms === null ? null : Number(r.latency_ms),
      stream: Number(r.stream),
      error_message: r.error_message ? String(r.error_message) : null,
      created_at: String(r.created_at),
    }));
    return json({ logs });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "خطأ غير معروف" }, 500);
  }
}
