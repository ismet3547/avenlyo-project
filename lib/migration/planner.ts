import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { readLegacyAppData } from "./source-json";
import { inspectLegacySqlite } from "./source-sqlite";
import { inventoryUploadFiles } from "./source-files";
import { sha256File } from "./hash";
import { relativeToManifest, writeMigrationManifest } from "./manifest";
import { snapshotLegacySource } from "./snapshot";
import { MIGRATION_PHASES, type MigrationManifest } from "./types";

const execFileAsync = promisify(execFile);

async function gitCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function planLegacyMigration(input: {
  sourceDir: string;
  manifestPath: string;
  migrationId?: string;
  workspaceId?: string;
  createdAt?: string;
  workspaceSlug?: string;
  storageRoot?: string;
}) {
  const migrationId = input.migrationId ?? randomUUID();
  const workspaceId = input.workspaceId ?? randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const snapshotRoot = path.join(
    path.dirname(input.manifestPath),
    "snapshots",
    migrationId,
  );
  const snapshot = await snapshotLegacySource(input.sourceDir, snapshotRoot);
  const appData = await readLegacyAppData(snapshot.avenlyoJson);
  const sqlite = inspectLegacySqlite(snapshot.sqlite, appData.agents);
  const uploadFiles = await inventoryUploadFiles(snapshot.uploads);

  const manifest: MigrationManifest = {
    version: 1,
    migrationId,
    createdAt,
    source: {
      gitCommit: await gitCommit(),
      avenlyoJson: {
        path: relativeToManifest(input.manifestPath, snapshot.avenlyoJson),
        sha256: await sha256File(snapshot.avenlyoJson),
      },
      sqlite: {
        path: relativeToManifest(input.manifestPath, snapshot.sqlite),
        sha256: await sha256File(snapshot.sqlite),
        userVersion: sqlite.userVersion,
      },
      uploads: {
        root: relativeToManifest(input.manifestPath, snapshot.uploads),
        fileCount: uploadFiles.length,
        totalBytes: uploadFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
      },
    },
    target: {
      workspaceId,
      workspaceSlug: input.workspaceSlug ?? "legacy-workspace",
      workspaceName: appData.business.name.trim() || "Legacy Workspace",
      postgresMajor: 18,
      schemaVersion: 1,
      storageRoot: input.storageRoot ?? "data/workspaces",
    },
    inventory: {
      counts: sqlite.counts,
      embeddingDimensions: sqlite.embeddingDimensions,
      invalidEmbeddingCount: sqlite.invalidEmbeddingCount,
      orphanCounts: sqlite.orphanCounts,
      toolArgumentHashMismatch: sqlite.toolArgumentHashMismatch,
      uploadFiles,
    },
    phases: MIGRATION_PHASES.map((name) => ({ name, status: "pending" })),
  };

  await writeMigrationManifest(input.manifestPath, manifest);
  return manifest;
}
