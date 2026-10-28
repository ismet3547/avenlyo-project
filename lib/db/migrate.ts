import path from "node:path";
import { promises as fs } from "node:fs";
import { FileMigrationProvider, Migrator } from "kysely";
import { getAdminPostgresDb } from "./pool";

export async function migrateToLatest() {
  const db = getAdminPostgresDb();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), "db", "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results ?? [];
}
