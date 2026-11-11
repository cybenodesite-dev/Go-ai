import { createClient } from "@libsql/client";
import "dotenv/config";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// Remove test artifacts so the user starts clean
await client.execute("DELETE FROM api_keys");
await client.execute("DELETE FROM models");
await client.execute("DELETE FROM providers");
await client.execute("DELETE FROM usage_logs");
await client.execute("UPDATE gateway_keys SET usage_count = 0, last_used_at = NULL");

const c1 = await client.execute("SELECT COUNT(*) AS c FROM providers");
const c2 = await client.execute("SELECT COUNT(*) AS c FROM api_keys");
const c3 = await client.execute("SELECT COUNT(*) AS c FROM models");
const c4 = await client.execute("SELECT COUNT(*) AS c FROM gateway_keys");
const c5 = await client.execute("SELECT COUNT(*) AS c FROM usage_logs");
console.log(
  "clean:",
  Number(c1.rows[0].c),
  Number(c2.rows[0].c),
  Number(c3.rows[0].c),
  Number(c4.rows[0].c),
  Number(c5.rows[0].c)
);
