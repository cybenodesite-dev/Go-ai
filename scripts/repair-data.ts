/**
 * One-off data repair for the user's live data:
 * 1. Reactivate keys wrongly marked "disabled" by the old 403 rule (geo-blocks like Groq's bare "Forbidden").
 * 2. xkiro provider: its worker proxy adds /v1 itself -> auto_version = 0.
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: "/home/z/my-project/.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  // 1) reactivate 403-disabled keys whose error is NOT key-related
  const res = await client.execute({
    sql: `UPDATE api_keys SET status = 'active'
          WHERE status = 'disabled'
            AND last_error LIKE '%403%'
            AND (last_error NOT LIKE '%api key%' COLLATE NOCASE
                 AND last_error NOT LIKE '%invalid%' COLLATE NOCASE
                 AND last_error NOT LIKE '%unauthorized%' COLLATE NOCASE
                 AND last_error NOT LIKE '%credentials%' COLLATE NOCASE)`,
  });
  console.log(`reactivated ${res.rowsAffected} wrongly-disabled key(s)`);

  // 2) xkiro -> auto_version off
  const x = await client.execute({
    sql: "UPDATE providers SET auto_version = 0 WHERE name = ?",
    args: ["xkiro"],
  });
  console.log(`xkiro auto_version=0 applied to ${x.rowsAffected} provider(s)`);

  // verify
  const rows = await client.execute("SELECT name, base_url, auto_version FROM providers");
  for (const r of rows.rows) console.log(`provider ${String(r.name)} auto_version=${String(r.auto_version)}`);
  const keys = await client.execute("SELECT status, COUNT(*) AS n FROM api_keys GROUP BY status");
  for (const r of keys.rows) console.log(`keys ${String(r.status)}: ${String(r.n)}`);
}

main().catch((e) => {
  console.error("REPAIR FAILED:", e);
  process.exit(1);
});
