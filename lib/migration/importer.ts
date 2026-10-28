import { mkdir, rename, rm, cp } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { listRegisteredTools } from "../tools/registry";
import { toStrictJsonSchema } from "../tools/schemas";
import { readLegacyAppData } from "./source-json";
import { openLegacySqlite, readLegacyTable } from "./source-sqlite";
import { uploadFileForDocument } from "./source-files";
import { sha256File } from "./hash";
import {
  readMigrationManifest,
  resolveManifestPath,
  setMigrationPhase,
} from "./manifest";
import type { MigrationManifest, MigrationPhaseName } from "./types";

type Row = Record<string, unknown>;

function ident(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Unsafe SQL identifier.");
  return '"' + value.replaceAll('"', '""') + '"';
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function insertOrVerify(
  client: PoolClient,
  table: string,
  values: Record<string, unknown>,
  keyColumns: string[],
  casts: Record<string, string> = {},
) {
  const columns = Object.keys(values);
  const placeholders = columns.map((column, index) => {
    const cast = casts[column] ? `::${casts[column]}` : "";
    return `$${index + 1}${cast}`;
  });
  const insert = await client.query(
    `INSERT INTO app.${ident(table)} (${columns.map(ident).join(",")})
     VALUES (${placeholders.join(",")})
     ON CONFLICT DO NOTHING
     RETURNING 1`,
    columns.map((column) => values[column]),
  );
  if (insert.rowCount) return "inserted";

  const where = keyColumns
    .map((column, index) => `${ident(column)} = $${index + 1}`)
    .join(" AND ");
  const existing = await client.query(
    `SELECT ${columns.map(ident).join(",")}
     FROM app.${ident(table)}
     WHERE ${where}`,
    keyColumns.map((column) => values[column]),
  );
  if (existing.rowCount !== 1) {
    throw new Error(`CONFLICT_DIVERGENCE: ${table} anahtarı başka unique constraint ile çakıştı.`);
  }

  const row = existing.rows[0] as Row;
  for (const column of columns) {
    const expected = values[column];
    const actual = row[column];
    if (!sameValue(actual, expected)) {
      throw new Error(
        `CONFLICT_DIVERGENCE: ${table}.${column} mevcut hedef değer kaynakla eşleşmiyor.`,
      );
    }
  }
  return "existing";
}

function parseJson(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;
  return JSON.parse(String(value)) as unknown;
}

async function seedToolDefinitionsClient(client: Pick<PoolClient, "query">) {
  for (const definition of listRegisteredTools()) {
    await client.query(
        `INSERT INTO app.tool_definitions
         (id,name,display_name,description,kind,risk_level,approval_policy,input_schema,output_schema,config,builtin,platform_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,true,true)
         ON CONFLICT (id) DO UPDATE SET
           name=excluded.name,
           display_name=excluded.display_name,
           description=excluded.description,
           kind=excluded.kind,
           risk_level=excluded.risk_level,
           approval_policy=excluded.approval_policy,
           input_schema=excluded.input_schema,
           output_schema=excluded.output_schema,
           config=excluded.config,
           updated_at=now()`,
        [
          definition.id,
          definition.name,
          definition.displayName,
          definition.description,
          definition.kind,
          definition.riskLevel,
          definition.approvalPolicy,
          JSON.stringify(toStrictJsonSchema(definition.inputSchema)),
          definition.outputSchema
            ? JSON.stringify(toStrictJsonSchema(definition.outputSchema))
            : null,
          JSON.stringify(definition.config),
        ],
      );
  }
}

async function seedToolDefinitions(connectionString: string) {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await seedToolDefinitionsClient(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function withImporterTransaction<T>(
  connectionString: string,
  workspaceId: string,
  operation: (client: PoolClient) => Promise<T>,
) {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE avenlyo_importer");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function sourcePaths(manifestPath: string, manifest: MigrationManifest) {
  return {
    json: resolveManifestPath(manifestPath, manifest.source.avenlyoJson.path),
    sqlite: resolveManifestPath(manifestPath, manifest.source.sqlite.path),
    uploads: resolveManifestPath(manifestPath, manifest.source.uploads.root),
  };
}

async function loadSource(manifestPath: string, manifest: MigrationManifest) {
  const paths = sourcePaths(manifestPath, manifest);
  const app = await readLegacyAppData(paths.json);
  const db = openLegacySqlite(paths.sqlite);
  try {
    return {
      paths,
      app,
      documents: readLegacyTable(db, "documents"),
      chunks: readLegacyTable(db, "chunks"),
      agentDocuments: readLegacyTable(db, "agent_documents"),
      tools: readLegacyTable(db, "tools"),
      agentTools: readLegacyTable(db, "agent_tools"),
      conversations: readLegacyTable(db, "conversations"),
      chatMessages: readLegacyTable(db, "chat_messages"),
      crmContacts: readLegacyTable(db, "crm_contacts"),
      toolRuns: readLegacyTable(db, "tool_runs"),
      toolApprovals: readLegacyTable(db, "tool_approvals"),
      toolRunAttempts: readLegacyTable(db, "tool_run_attempts"),
      toolAuditEvents: readLegacyTable(db, "tool_audit_events"),
    };
  } finally {
    db.close();
  }
}

function storageKey(manifest: MigrationManifest, relativeUploadPath: string) {
  return [
    "workspaces",
    manifest.target.workspaceId,
    "uploads",
    ...relativeUploadPath.split("/"),
  ].join("/");
}

async function importPhase(
  phase: MigrationPhaseName,
  client: PoolClient,
  manifest: MigrationManifest,
  source: Awaited<ReturnType<typeof loadSource>>,
) {
  const workspaceId = manifest.target.workspaceId;

  if (phase === "workspace") {
    await insertOrVerify(client, "workspaces", {
      id: workspaceId,
      slug: manifest.target.workspaceSlug,
      name: manifest.target.workspaceName,
      status: "active",
      created_at: manifest.createdAt,
      updated_at: manifest.createdAt,
    }, ["id"]);
    return;
  }

  if (phase === "business-and-agents") {
    const business = source.app.business;
    await insertOrVerify(client, "business_profiles", {
      workspace_id: workspaceId,
      industry: business.industry ?? "",
      description: business.description ?? "",
      audience: business.audience ?? "",
      tone: business.tone ?? "",
      offer: business.offer ?? "",
      faq: business.faq ?? "",
      knowledge: business.knowledge ?? "",
      updated_at: business.updatedAt,
    }, ["workspace_id"]);

    for (const agent of source.app.agents) {
      await insertOrVerify(client, "agents", {
        workspace_id: workspaceId,
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        role: agent.role,
        goal: agent.goal,
        instructions: agent.instructions,
        model: agent.model,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      }, ["workspace_id", "id"]);
    }
    return;
  }

  if (phase === "knowledge") {
    for (const row of source.documents) {
      const upload = uploadFileForDocument(manifest.inventory.uploadFiles, String(row.id));
      await insertOrVerify(client, "documents", {
        workspace_id: workspaceId,
        id: String(row.id),
        name: String(row.name),
        original_name: String(row.original_name),
        mime_type: String(row.mime_type),
        extension: String(row.extension),
        size_bytes: String(row.size),
        sha256: String(row.sha256),
        status: String(row.status),
        page_count: row.page_count ?? null,
        chunk_count: Number(row.chunk_count ?? 0),
        extraction_method: row.extraction_method ?? null,
        ocr_page_count: Number(row.ocr_page_count ?? 0),
        error: row.error ?? null,
        storage_key: storageKey(manifest, upload.path),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      }, ["workspace_id", "id"]);
    }

    for (const row of source.chunks) {
      const embedding = parseJson(row.embedding);
      if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== "number") || !embedding.length) {
        throw new Error(`Geçersiz embedding: chunk ${String(row.id)}`);
      }
      await insertOrVerify(client, "chunks", {
        workspace_id: workspaceId,
        id: String(row.id),
        document_id: String(row.document_id),
        chunk_index: Number(row.chunk_index),
        text: String(row.text),
        token_count: Number(row.token_count),
        page_start: row.page_start ?? null,
        page_end: row.page_end ?? null,
        embedding: JSON.stringify(embedding),
        embedding_model: "legacy-unknown",
        embedding_dimensions: embedding.length,
        extraction_method: String(row.extraction_method ?? "native"),
        ocr_confidence: row.ocr_confidence ?? null,
      }, ["workspace_id", "id"], { embedding: "vector" });
    }

    for (const row of source.agentDocuments) {
      await insertOrVerify(client, "agent_documents", {
        workspace_id: workspaceId,
        agent_id: String(row.agent_id),
        document_id: String(row.document_id),
        created_at: String(row.created_at),
      }, ["workspace_id", "agent_id", "document_id"]);
    }
    return;
  }

  if (phase === "chat") {
    for (const row of source.conversations) {
      await insertOrVerify(client, "conversations", {
        workspace_id: workspaceId,
        id: String(row.id),
        agent_id: String(row.agent_id),
        title: String(row.title),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      }, ["workspace_id", "id"]);
    }
    for (const row of source.chatMessages) {
      await insertOrVerify(client, "chat_messages", {
        workspace_id: workspaceId,
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        role: String(row.role),
        content: String(row.content),
        sources_json: parseJson(row.sources_json),
        debug_json: parseJson(row.debug_json),
        tool_activities_json: parseJson(row.tool_activities_json),
        created_at: String(row.created_at),
      }, ["workspace_id", "id"]);
    }
    return;
  }

  if (phase === "tools-and-crm") {
    const registered = new Set(listRegisteredTools().map((tool) => tool.id));
    for (const row of source.tools) {
      const toolId = String(row.id);
      if (!registered.has(toolId)) {
        throw new Error(`Legacy tool registry uyuşmazlığı: ${toolId}`);
      }
      await insertOrVerify(client, "workspace_tools", {
        workspace_id: workspaceId,
        tool_id: toolId,
        enabled: Number(row.enabled ?? 1) === 1,
        config: parseJson(row.config_json) ?? {},
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      }, ["workspace_id", "tool_id"]);
    }

    for (const row of source.agentTools) {
      await insertOrVerify(client, "agent_tools", {
        workspace_id: workspaceId,
        agent_id: String(row.agent_id),
        tool_id: String(row.tool_id),
        enabled: Number(row.enabled ?? 1) === 1,
        created_at: String(row.created_at),
      }, ["workspace_id", "agent_id", "tool_id"]);
    }

    for (const row of source.crmContacts) {
      await insertOrVerify(client, "crm_contacts", {
        workspace_id: workspaceId,
        id: String(row.id),
        name: String(row.name),
        phone: row.phone ?? null,
        email: row.email ?? null,
        notes: row.notes ?? null,
        idempotency_key: String(row.idempotency_key),
        created_at: String(row.created_at),
      }, ["workspace_id", "id"]);
    }

    for (const row of source.toolRuns) {
      await insertOrVerify(client, "tool_runs", {
        workspace_id: workspaceId,
        id: String(row.id),
        trace_id: String(row.trace_id),
        conversation_id: row.conversation_id ?? null,
        message_id: row.message_id ?? null,
        agent_id: String(row.agent_id),
        tool_id: String(row.tool_id),
        call_id: row.call_id ?? null,
        status: String(row.status),
        risk_level: String(row.risk_level),
        arguments_json: parseJson(row.arguments_json) ?? {},
        arguments_hash: String(row.arguments_hash),
        result_json: parseJson(row.result_json),
        error_code: row.error_code ?? null,
        idempotency_key: String(row.idempotency_key),
        requires_approval: Number(row.requires_approval ?? 0) === 1,
        attempt_count: Number(row.attempt_count ?? 0),
        started_at: row.started_at ?? null,
        completed_at: row.completed_at ?? null,
        created_at: String(row.created_at),
      }, ["workspace_id", "id"]);
    }

    for (const row of source.toolApprovals) {
      await insertOrVerify(client, "tool_approvals", {
        workspace_id: workspaceId,
        id: String(row.id),
        tool_run_id: String(row.tool_run_id),
        decision: String(row.decision),
        arguments_hash: String(row.arguments_hash),
        resume_items_json: parseJson(row.resume_items_json),
        approved_at: row.approved_at ?? null,
        rejected_at: row.rejected_at ?? null,
        expires_at: row.expires_at ?? null,
        created_at: String(row.created_at),
      }, ["workspace_id", "id"]);
    }

    for (const row of source.toolRunAttempts) {
      await insertOrVerify(client, "tool_run_attempts", {
        workspace_id: workspaceId,
        id: String(row.id),
        tool_run_id: String(row.tool_run_id),
        attempt_number: Number(row.attempt_number),
        started_at: String(row.started_at),
        completed_at: row.completed_at ?? null,
        duration_ms: row.duration_ms ?? null,
        http_status: row.http_status ?? null,
        outcome: String(row.outcome),
        error_code: row.error_code ?? null,
      }, ["workspace_id", "id"]);
    }

    for (const row of source.toolAuditEvents) {
      await insertOrVerify(client, "tool_audit_events", {
        workspace_id: workspaceId,
        id: String(row.id),
        tool_run_id: row.tool_run_id ?? null,
        event_type: String(row.event_type),
        metadata_json: parseJson(row.metadata_json) ?? {},
        created_at: String(row.created_at),
      }, ["workspace_id", "id"]);
    }
    return;
  }
}

async function copyWorkspaceFiles(
  manifestPath: string,
  manifest: MigrationManifest,
) {
  const uploadsSource = resolveManifestPath(manifestPath, manifest.source.uploads.root);
  const storageRoot = path.resolve(process.cwd(), manifest.target.storageRoot);
  const finalDir = path.join(storageRoot, manifest.target.workspaceId);
  const stageDir = path.join(
    storageRoot,
    `.${manifest.target.workspaceId}.${manifest.migrationId}.staging`,
  );

  let finalExists = true;
  try {
    await sha256File(path.join(finalDir, ".avenlyo-migration-marker"));
  } catch {
    finalExists = false;
  }

  if (!finalExists) {
    await rm(stageDir, { recursive: true, force: true });
    await mkdir(stageDir, { recursive: true });
    await cp(uploadsSource, path.join(stageDir, "uploads"), { recursive: true });
    await mkdir(storageRoot, { recursive: true });
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(stageDir, ".avenlyo-migration-marker"), manifest.migrationId, "utf8"),
    );
    await rename(stageDir, finalDir);
  }

  for (const file of manifest.inventory.uploadFiles) {
    const target = path.join(finalDir, "uploads", ...file.path.split("/"));
    const digest = await sha256File(target);
    if (digest !== file.sha256) {
      throw new Error(`Upload SHA-256 uyuşmazlığı: ${file.path}`);
    }
  }
}

export async function dryRunLegacyMigration(manifestPath: string) {
  const manifest = await readMigrationManifest(manifestPath);
  const source = await loadSource(manifestPath, manifest);
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const importerUrl = process.env.DATABASE_IMPORTER_URL || adminUrl;
  if (!adminUrl || !importerUrl) throw new Error("DATABASE_ADMIN_URL tanımlı değil.");

  const pool = new Pool({ connectionString: adminUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedToolDefinitionsClient(client);
    await client.query("SET LOCAL ROLE avenlyo_importer");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      manifest.target.workspaceId,
    ]);
    for (const phase of ["workspace","business-and-agents","knowledge","chat","tools-and-crm"] as MigrationPhaseName[]) {
      await importPhase(phase, client, manifest, source);
    }
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function applyLegacyMigration(
  manifestPath: string,
  options: { resume?: boolean } = {},
) {
  let manifest = await readMigrationManifest(manifestPath);
  const failed = manifest.phases.find((phase) => phase.status === "failed");
  if (failed && !options.resume) {
    throw new Error(`Phase ${failed.name} daha önce başarısız. Devam etmek için --resume kullanın.`);
  }

  const source = await loadSource(manifestPath, manifest);
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const importerUrl = process.env.DATABASE_IMPORTER_URL || adminUrl;
  if (!adminUrl || !importerUrl) throw new Error("DATABASE_ADMIN_URL tanımlı değil.");

  await seedToolDefinitions(adminUrl);

  for (const phase of ["workspace","business-and-agents","knowledge","chat","tools-and-crm"] as MigrationPhaseName[]) {
    manifest = await readMigrationManifest(manifestPath);
    const state = manifest.phases.find((item) => item.name === phase);
    if (state?.status === "completed") continue;
    await setMigrationPhase(manifestPath, phase, "running");
    try {
      await withImporterTransaction(importerUrl, manifest.target.workspaceId, (client) =>
        importPhase(phase, client, manifest, source),
      );
      await setMigrationPhase(manifestPath, phase, "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setMigrationPhase(manifestPath, phase, "failed", message);
      throw error;
    }
  }

  manifest = await readMigrationManifest(manifestPath);
  const fileState = manifest.phases.find((phase) => phase.name === "files");
  if (fileState?.status !== "completed") {
    await setMigrationPhase(manifestPath, "files", "running");
    try {
      await copyWorkspaceFiles(manifestPath, manifest);
      await setMigrationPhase(manifestPath, "files", "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setMigrationPhase(manifestPath, "files", "failed", message);
      throw error;
    }
  }
}

export async function rollbackLegacyMigration(manifestPath: string) {
  const manifest = await readMigrationManifest(manifestPath);
  const importerUrl = process.env.DATABASE_IMPORTER_URL || process.env.DATABASE_ADMIN_URL;
  if (!importerUrl) throw new Error("DATABASE_ADMIN_URL tanımlı değil.");

  await withImporterTransaction(importerUrl, manifest.target.workspaceId, async (client) => {
    await client.query("DELETE FROM app.workspaces WHERE id = $1", [
      manifest.target.workspaceId,
    ]);
  });

  await rm(
    path.resolve(process.cwd(), manifest.target.storageRoot, manifest.target.workspaceId),
    { recursive: true, force: true },
  );
}
