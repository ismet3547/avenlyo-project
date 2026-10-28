import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL tanımlı değil.");

const sql = await readFile(path.join(process.cwd(), "db", "roles.sql"), "utf8");
const pool = new Pool({ connectionString });
try {
  await pool.query(sql);
  console.log("PostgreSQL rolleri hazır.");
} finally {
  await pool.end();
}
