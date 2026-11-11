import { createClient } from "@libsql/client";
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in .env");
  process.exit(1);
}

const client = createClient({ url, authToken: token });

try {
  const res = await client.execute("SELECT 1 AS ok");
  console.log("CONNECTED:", JSON.stringify(res.rows));
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  console.log(
    "TABLES:",
    tables.rows.map((r) => r.name).join(", ")
  );
} catch (e) {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
