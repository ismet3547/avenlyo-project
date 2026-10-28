import Database from "better-sqlite3";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

async function requireFile(filePath: string) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Kaynak dosya değil: ${filePath}`);
}

export async function snapshotLegacySource(sourceDir: string, snapshotRoot: string) {
  const jsonSource = path.join(sourceDir, "avenlyo.json");
  const sqliteSource = path.join(sourceDir, "knowledge.db");
  const uploadsSource = path.join(sourceDir, "uploads");

  await requireFile(jsonSource);
  await requireFile(sqliteSource);

  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });

  const jsonTarget = path.join(snapshotRoot, "avenlyo.json");
  const sqliteTarget = path.join(snapshotRoot, "knowledge.db");
  const uploadsTarget = path.join(snapshotRoot, "uploads");

  await cp(jsonSource, jsonTarget, { force: false });

  const db = new Database(sqliteSource, { readonly: true, fileMustExist: true });
  try {
    await db.backup(sqliteTarget);
  } finally {
    db.close();
  }

  try {
    await cp(uploadsSource, uploadsTarget, { recursive: true, force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(uploadsTarget, { recursive: true });
  }

  return {
    avenlyoJson: jsonTarget,
    sqlite: sqliteTarget,
    uploads: uploadsTarget,
  };
}
