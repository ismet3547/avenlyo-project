import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types";

let runtimeDb: Kysely<Database> | null = null;
let adminDb: Kysely<Database> | null = null;

function createDb(connectionString: string) {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: Number(process.env.AVENLYO_DB_POOL_MAX || 10),
        idleTimeoutMillis: 30_000,
      }),
    }),
  });
}

export function getPostgresDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL tanımlı değil.");
  }
  runtimeDb ??= createDb(connectionString);
  return runtimeDb;
}

export function getAdminPostgresDb() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL tanımlı değil.");
  }
  adminDb ??= createDb(connectionString);
  return adminDb;
}

export async function destroyPostgresPools() {
  await Promise.all([runtimeDb?.destroy(), adminDb?.destroy()]);
  runtimeDb = null;
  adminDb = null;
}
