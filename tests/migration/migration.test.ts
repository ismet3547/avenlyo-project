import { access, rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyLegacyMigration,
  dryRunLegacyMigration,
  rollbackLegacyMigration,
} from "../../lib/migration/importer";
import { planLegacyMigration } from "../../lib/migration/planner";
import { readMigrationManifest } from "../../lib/migration/manifest";
import {
  verifyAndCheckpoint,
  verifyLegacySource,
} from "../../lib/migration/verifier";
import { createLegacyFixture } from "./fixture";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const cleanup: string[] = [];

describeDb("legacy PostgreSQL migration harness", () => {
  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("plans a deterministic snapshot with counts, vectors and hashes", async () => {
    const fixture = await createLegacyFixture();
    cleanup.push(fixture.root);
    const manifest = await planLegacyMigration({
      sourceDir: fixture.source,
      manifestPath: fixture.manifestPath,
      migrationId: fixture.migrationId,
      workspaceId: fixture.workspaceId,
      createdAt: fixture.now,
      storageRoot: path.join(fixture.root, "target-storage"),
    });

    expect(manifest.source.sqlite.userVersion).toBe(4);
    expect(manifest.inventory.counts.agents).toBe(1);
    expect(manifest.inventory.counts.documents).toBe(1);
    expect(manifest.inventory.counts.chunks).toBe(1);
    expect(manifest.inventory.embeddingDimensions).toEqual({ "3": 1 });
    expect(manifest.inventory.invalidEmbeddingCount).toBe(0);
    expect(manifest.inventory.uploadFiles).toHaveLength(1);
    expect(Object.values(manifest.inventory.orphanCounts).every((count) => count === 0)).toBe(true);

    const sourceReport = await verifyLegacySource(fixture.manifestPath);
    expect(sourceReport.ok, sourceReport.errors.join("\n")).toBe(true);
  });

  it("dry-runs without persistence, applies idempotently, verifies and rolls back", async () => {
    const fixture = await createLegacyFixture();
    cleanup.push(fixture.root);
    await planLegacyMigration({
      sourceDir: fixture.source,
      manifestPath: fixture.manifestPath,
      migrationId: fixture.migrationId,
      workspaceId: fixture.workspaceId,
      createdAt: fixture.now,
      storageRoot: path.join(fixture.root, "target-storage"),
    });

    await dryRunLegacyMigration(fixture.manifestPath);

    const pool = new Pool({ connectionString: url });
    try {
      const afterDryRun = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM app.workspaces WHERE id=$1",
        [fixture.workspaceId],
      );
      expect(Number(afterDryRun.rows[0]?.count)).toBe(0);

      await applyLegacyMigration(fixture.manifestPath);
      const report = await verifyAndCheckpoint(fixture.manifestPath);
      expect(report.ok, report.errors.join("\n")).toBe(true);

      await applyLegacyMigration(fixture.manifestPath);
      const count = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM app.documents WHERE workspace_id=$1",
        [fixture.workspaceId],
      );
      expect(Number(count.rows[0]?.count)).toBe(1);

      const manifest = await readMigrationManifest(fixture.manifestPath);
      expect(manifest.phases.every((phase) => phase.status === "completed")).toBe(true);

      const copied = path.join(
        fixture.root,
        "target-storage",
        fixture.workspaceId,
        "uploads",
        "doc-legacy-1",
        "bilgi.txt",
      );
      await expect(access(copied)).resolves.toBeUndefined();

      await expect(
        rollbackLegacyMigration(fixture.manifestPath, "wrong-migration-id"),
      ).rejects.toThrow(/confirm-migration/);

      await rollbackLegacyMigration(fixture.manifestPath, fixture.migrationId);
      const afterRollback = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM app.workspaces WHERE id=$1",
        [fixture.workspaceId],
      );
      expect(Number(afterRollback.rows[0]?.count)).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
