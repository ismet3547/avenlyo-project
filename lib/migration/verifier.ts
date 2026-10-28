import path from "node:path";
import { Pool } from "pg";
import { sha256File } from "./hash";
import {
  readMigrationManifest,
  resolveManifestPath,
  setMigrationPhase,
} from "./manifest";
import type { MigrationManifest, VerificationReport } from "./types";
import { inspectLegacySqlite } from "./source-sqlite";
import { readLegacyAppData } from "./source-json";
import { inventoryUploadFiles } from "./source-files";

function pushError(report: VerificationReport, condition: boolean, message: string) {
  if (!condition) report.errors.push(message);
}

export async function verifyLegacySource(manifestPath: string) {
  const manifest = await readMigrationManifest(manifestPath);
  const jsonPath = resolveManifestPath(manifestPath, manifest.source.avenlyoJson.path);
  const sqlitePath = resolveManifestPath(manifestPath, manifest.source.sqlite.path);
  const uploadsRoot = resolveManifestPath(manifestPath, manifest.source.uploads.root);
  const app = await readLegacyAppData(jsonPath);
  const sqlite = inspectLegacySqlite(sqlitePath, app.agents);
  const uploadFiles = await inventoryUploadFiles(uploadsRoot);

  const report: VerificationReport = { ok: false, errors: [], checks: {} };
  pushError(
    report,
    (await sha256File(jsonPath)) === manifest.source.avenlyoJson.sha256,
    "avenlyo.json SHA-256 değişmiş.",
  );
  pushError(
    report,
    (await sha256File(sqlitePath)) === manifest.source.sqlite.sha256,
    "knowledge.db SHA-256 değişmiş.",
  );
  pushError(
    report,
    JSON.stringify(sqlite.counts) === JSON.stringify(manifest.inventory.counts),
    "SQLite satır sayıları manifest ile eşleşmiyor.",
  );
  pushError(
    report,
    sqlite.invalidEmbeddingCount === 0,
    `Geçersiz embedding sayısı: ${sqlite.invalidEmbeddingCount}`,
  );
  pushError(
    report,
    sqlite.toolArgumentHashMismatch === 0,
    `Tool arguments hash uyuşmazlığı: ${sqlite.toolArgumentHashMismatch}`,
  );
  for (const [name, count] of Object.entries(sqlite.orphanCounts)) {
    pushError(report, count === 0, `Orphan ${name}: ${count}`);
  }
  pushError(
    report,
    JSON.stringify(uploadFiles) === JSON.stringify(manifest.inventory.uploadFiles),
    "Upload inventory manifest ile eşleşmiyor.",
  );
  report.ok = report.errors.length === 0;
  return report;
}

async function targetCount(pool: Pool, table: string, workspaceId: string) {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM app."${table}" WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function verifyLegacyTarget(manifestPath: string) {
  const manifest = await readMigrationManifest(manifestPath);
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL tanımlı değil.");
  const pool = new Pool({ connectionString: url });
  const report: VerificationReport = { ok: false, errors: [], checks: {} };

  try {
    const expected = manifest.inventory.counts;
    const mappings: Array<[keyof typeof expected, string]> = [
      ["agents","agents"],
      ["documents","documents"],
      ["chunks","chunks"],
      ["agentDocuments","agent_documents"],
      ["conversations","conversations"],
      ["chatMessages","chat_messages"],
      ["workspaceTools","workspace_tools"],
      ["agentTools","agent_tools"],
      ["toolRuns","tool_runs"],
      ["toolApprovals","tool_approvals"],
      ["toolRunAttempts","tool_run_attempts"],
      ["toolAuditEvents","tool_audit_events"],
      ["crmContacts","crm_contacts"],
    ];
    for (const [key, table] of mappings) {
      const actual = await targetCount(pool, table, manifest.target.workspaceId);
      report.checks[`count.${String(key)}`] = actual;
      pushError(report, actual === expected[key], `${String(key)} count: ${actual} != ${expected[key]}`);
    }

    const rls = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='app' AND c.relkind='r'`,
    );
    const tenantTables = new Set([
      "workspaces","business_profiles","workspace_memberships","agents","documents","chunks",
      "agent_documents","conversations","chat_messages","workspace_tools","agent_tools",
      "crm_contacts","tool_runs","tool_approvals","tool_run_attempts","tool_audit_events",
    ]);
    for (const row of rls.rows.filter((row) => tenantTables.has(row.relname))) {
      pushError(report, row.relrowsecurity, `RLS kapalı: ${row.relname}`);
      pushError(report, row.relforcerowsecurity, `FORCE RLS kapalı: ${row.relname}`);
    }

    const policies = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_policies WHERE schemaname='app'",
    );
    const policyTables = new Set(policies.rows.map((row) => row.tablename));
    for (const table of tenantTables) {
      pushError(report, policyTables.has(table), `RLS policy eksik: ${table}`);
    }

    const finalDir = path.resolve(
      process.cwd(),
      manifest.target.storageRoot,
      manifest.target.workspaceId,
      "uploads",
    );
    for (const file of manifest.inventory.uploadFiles) {
      const digest = await sha256File(path.join(finalDir, ...file.path.split("/")));
      pushError(report, digest === file.sha256, `Target upload SHA-256 uyuşmazlığı: ${file.path}`);
    }
  } finally {
    await pool.end();
  }

  report.ok = report.errors.length === 0;
  return report;
}

export async function verifyAndCheckpoint(manifestPath: string) {
  await setMigrationPhase(manifestPath, "verify", "running");
  try {
    const source = await verifyLegacySource(manifestPath);
    const target = await verifyLegacyTarget(manifestPath);
    const report: VerificationReport = {
      ok: source.ok && target.ok,
      errors: [...source.errors, ...target.errors],
      checks: { ...source.checks, ...target.checks },
    };
    if (!report.ok) throw new Error(report.errors.join("\n"));
    await setMigrationPhase(manifestPath, "verify", "completed");
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setMigrationPhase(manifestPath, "verify", "failed", message);
    throw error;
  }
}
