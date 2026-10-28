import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<Record<string, never>>) {
  const ddl = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await sql.raw(ddl).execute(db);
}

export async function down(db: Kysely<Record<string, never>>) {
  await sql.raw("DROP SCHEMA IF EXISTS app CASCADE").execute(db);
}
