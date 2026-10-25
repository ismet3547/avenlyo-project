import { randomUUID } from "node:crypto";
import { getKnowledgeDb } from "../rag/db";
import { hashToolArguments, canonicalJson } from "./arguments";
import {
  getRegisteredTool,
  listRegisteredTools,
  toCatalogItem,
} from "./registry";
import { toStrictJsonSchema } from "./schemas";
import type {
  ToolApprovalDecision,
  ToolApprovalRecord,
  ToolCatalogItem,
  ToolRiskLevel,
  ToolRunRecord,
  ToolRunStatus,
} from "./types";

type ToolRow = {
  id: string;
  name: string;
  display_name: string;
  description: string;
  kind: ToolCatalogItem["kind"];
  risk_level: ToolRiskLevel;
  approval_policy: ToolCatalogItem["approvalPolicy"];
  input_schema_json: string;
  output_schema_json: string | null;
  config_json: string;
  builtin: number;
  enabled: number;
};

type ToolApprovalRow = {
  id: string;
  tool_run_id: string;
  decision: ToolApprovalDecision;
  arguments_hash: string;
  resume_items_json: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function mapApproval(row: ToolApprovalRow): ToolApprovalRecord {
  return {
    id: row.id,
    toolRunId: row.tool_run_id,
    decision: row.decision,
    argumentsHash: row.arguments_hash,
    resumeItemsJson: row.resume_items_json,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

type ToolRunRow = {
  id: string;
  trace_id: string;
  conversation_id: string | null;
  message_id: string | null;
  agent_id: string;
  tool_id: string;
  call_id: string | null;
  status: ToolRunStatus;
  risk_level: ToolRiskLevel;
  arguments_json: string;
  arguments_hash: string;
  result_json: string | null;
  error_code: string | null;
  idempotency_key: string;
  requires_approval: number;
  approval_id: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

function mapRun(row: ToolRunRow): ToolRunRecord {
  return {
    id: row.id,
    traceId: row.trace_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    agentId: row.agent_id,
    toolId: row.tool_id,
    callId: row.call_id,
    status: row.status,
    riskLevel: row.risk_level,
    argumentsJson: row.arguments_json,
    argumentsHash: row.arguments_hash,
    resultJson: row.result_json,
    errorCode: row.error_code,
    idempotencyKey: row.idempotency_key,
    requiresApproval: row.requires_approval === 1,
    approvalId: row.approval_id,
    attemptCount: row.attempt_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function syncRegisteredTools() {
  const database = getKnowledgeDb();
  const upsert = database.prepare(`
    INSERT INTO tools (
      id, name, display_name, description, kind, risk_level, approval_policy,
      input_schema_json, output_schema_json, config_json, builtin, enabled,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      display_name = excluded.display_name,
      description = excluded.description,
      kind = excluded.kind,
      risk_level = excluded.risk_level,
      approval_policy = excluded.approval_policy,
      input_schema_json = excluded.input_schema_json,
      output_schema_json = excluded.output_schema_json,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `);

  const now = new Date().toISOString();
  const transaction = database.transaction(() => {
    for (const definition of listRegisteredTools()) {
      upsert.run(
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
        now,
        now,
      );
    }
  });

  transaction();
}

export function listToolCatalog(): ToolCatalogItem[] {
  syncRegisteredTools();
  const rows = getKnowledgeDb()
    .prepare("SELECT * FROM tools ORDER BY display_name ASC")
    .all() as ToolRow[];

  return rows
    .map((row) => {
      const definition = getRegisteredTool(row.id);
      if (!definition) return null;

      return toCatalogItem(definition, {
        enabled: row.enabled === 1,
        builtin: row.builtin === 1,
      });
    })
    .filter((item): item is ToolCatalogItem => item !== null);
}

export function getToolEnabled(toolId: string) {
  syncRegisteredTools();
  const row = getKnowledgeDb()
    .prepare("SELECT enabled FROM tools WHERE id = ?")
    .get(toolId) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

export function setToolEnabled(toolId: string, enabled: boolean) {
  syncRegisteredTools();
  const result = getKnowledgeDb()
    .prepare("UPDATE tools SET enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, new Date().toISOString(), toolId);
  return result.changes > 0;
}

export function getAgentToolIds(agentId: string) {
  syncRegisteredTools();
  const rows = getKnowledgeDb()
    .prepare(
      `SELECT tool_id FROM agent_tools
       WHERE agent_id = ? AND enabled = 1
       ORDER BY created_at ASC`,
    )
    .all(agentId) as Array<{ tool_id: string }>;

  return rows.map((row) => row.tool_id);
}

export function getEnabledAgentToolIds(agentId: string) {
  syncRegisteredTools();
  const rows = getKnowledgeDb()
    .prepare(
      `SELECT at.tool_id
       FROM agent_tools at
       JOIN tools t ON t.id = at.tool_id
       WHERE at.agent_id = ?
         AND at.enabled = 1
         AND t.enabled = 1
       ORDER BY at.created_at ASC`,
    )
    .all(agentId) as Array<{ tool_id: string }>;

  return rows.map((row) => row.tool_id);
}

export function setAgentToolIds(agentId: string, toolIds: string[]) {
  syncRegisteredTools();
  const database = getKnowledgeDb();
  const uniqueIds = [...new Set(toolIds)];

  const validRows = uniqueIds.length
    ? (database
        .prepare(
          `SELECT id FROM tools
           WHERE enabled = 1
             AND id IN (${uniqueIds.map(() => "?").join(",")})`,
        )
        .all(...uniqueIds) as Array<{ id: string }>)
    : [];

  const validIds = validRows.map((row) => row.id);
  const remove = database.prepare("DELETE FROM agent_tools WHERE agent_id = ?");
  const insert = database.prepare(
    "INSERT INTO agent_tools (agent_id, tool_id, enabled, created_at) VALUES (?, ?, 1, ?)",
  );

  database.transaction(() => {
    remove.run(agentId);
    const now = new Date().toISOString();
    for (const toolId of validIds) insert.run(agentId, toolId, now);
  })();

  return validIds;
}

export function deleteAgentToolAssignments(agentId: string) {
  return (
    getKnowledgeDb()
      .prepare("DELETE FROM agent_tools WHERE agent_id = ?")
      .run(agentId).changes > 0
  );
}

export function createToolRun(input: {
  traceId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  agentId: string;
  toolId: string;
  callId?: string | null;
  status?: ToolRunStatus;
  riskLevel: ToolRiskLevel;
  arguments: unknown;
  requiresApproval: boolean;
}): ToolRunRecord {
  syncRegisteredTools();
  const now = new Date().toISOString();
  const id = randomUUID();
  const traceId = input.traceId || randomUUID();
  const argumentsJson = canonicalJson(input.arguments);
  const argumentsHash = hashToolArguments(input.arguments);
  const idempotencyKey = randomUUID();

  getKnowledgeDb()
    .prepare(
      `INSERT INTO tool_runs (
        id, trace_id, conversation_id, message_id, agent_id, tool_id, call_id,
        status, risk_level, arguments_json, arguments_hash, result_json,
        error_code, idempotency_key, requires_approval, approval_id,
        attempt_count, started_at, completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, 0, NULL, NULL, ?)`,
    )
    .run(
      id,
      traceId,
      input.conversationId ?? null,
      input.messageId ?? null,
      input.agentId,
      input.toolId,
      input.callId ?? null,
      input.status ?? "proposed",
      input.riskLevel,
      argumentsJson,
      argumentsHash,
      idempotencyKey,
      input.requiresApproval ? 1 : 0,
      now,
    );

  return getToolRun(id)!;
}

export function getToolRun(id: string): ToolRunRecord | null {
  const row = getKnowledgeDb()
    .prepare("SELECT * FROM tool_runs WHERE id = ?")
    .get(id) as ToolRunRow | undefined;
  return row ? mapRun(row) : null;
}


export function markToolRunRunning(id: string) {
  const now = new Date().toISOString();
  getKnowledgeDb()
    .prepare(
      `UPDATE tool_runs
       SET status = 'running',
           attempt_count = attempt_count + 1,
           started_at = COALESCE(started_at, ?)
       WHERE id = ?`,
    )
    .run(now, id);
  return getToolRun(id);
}

export function completeToolRun(id: string, result: unknown) {
  const now = new Date().toISOString();
  getKnowledgeDb()
    .prepare(
      `UPDATE tool_runs
       SET status = 'success',
           result_json = ?,
           error_code = NULL,
           completed_at = ?
       WHERE id = ?`,
    )
    .run(canonicalJson(result), now, id);
  return getToolRun(id);
}

export function failToolRun(id: string, errorCode: string, result?: unknown) {
  const now = new Date().toISOString();
  getKnowledgeDb()
    .prepare(
      `UPDATE tool_runs
       SET status = 'failed',
           result_json = ?,
           error_code = ?,
           completed_at = ?
       WHERE id = ?`,
    )
    .run(result === undefined ? null : canonicalJson(result), errorCode, now, id);
  return getToolRun(id);
}

export function recordToolRunAttempt(input: {
  toolRunId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  outcome: "success" | "failed";
  errorCode?: string | null;
}) {
  getKnowledgeDb()
    .prepare(
      `INSERT INTO tool_run_attempts (
        id, tool_run_id, attempt_number, started_at, completed_at,
        duration_ms, http_status, outcome, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(tool_run_id, attempt_number) DO UPDATE SET
        completed_at = excluded.completed_at,
        duration_ms = excluded.duration_ms,
        outcome = excluded.outcome,
        error_code = excluded.error_code`,
    )
    .run(
      randomUUID(),
      input.toolRunId,
      input.attemptNumber,
      input.startedAt,
      input.completedAt,
      input.durationMs,
      input.outcome,
      input.errorCode ?? null,
    );
}


export function attachToolRunMessage(toolRunId: string, messageId: string) {
  getKnowledgeDb()
    .prepare("UPDATE tool_runs SET message_id = ? WHERE id = ?")
    .run(messageId, toolRunId);
  return getToolRun(toolRunId);
}

export function createToolApproval(input: {
  toolRunId: string;
  argumentsHash: string;
  expiresAt: string;
  resumeItems?: unknown[];
}): ToolApprovalRecord {
  const database = getKnowledgeDb();
  const existing = getToolApprovalByRunId(input.toolRunId);
  if (existing) return existing;

  const id = randomUUID();
  const now = new Date().toISOString();

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO tool_approvals (
          id, tool_run_id, decision, arguments_hash, resume_items_json,
          approved_at, rejected_at, expires_at, created_at
        ) VALUES (?, ?, 'pending', ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.toolRunId,
        input.argumentsHash,
        input.resumeItems ? JSON.stringify(input.resumeItems) : null,
        input.expiresAt,
        now,
      );

    database
      .prepare("UPDATE tool_runs SET approval_id = ? WHERE id = ?")
      .run(id, input.toolRunId);
  })();

  return getToolApprovalByRunId(input.toolRunId)!;
}

export function saveToolApprovalResumeItems(
  toolRunId: string,
  items: unknown[],
) {
  getKnowledgeDb()
    .prepare(
      "UPDATE tool_approvals SET resume_items_json = ? WHERE tool_run_id = ?",
    )
    .run(JSON.stringify(items), toolRunId);
  return getToolApprovalByRunId(toolRunId);
}

export function getToolApprovalByRunId(
  toolRunId: string,
): ToolApprovalRecord | null {
  const row = getKnowledgeDb()
    .prepare("SELECT * FROM tool_approvals WHERE tool_run_id = ?")
    .get(toolRunId) as ToolApprovalRow | undefined;
  return row ? mapApproval(row) : null;
}

export function decideToolApproval(
  toolRunId: string,
  decision: "approved" | "rejected",
): ToolApprovalRecord | null {
  const database = getKnowledgeDb();
  const transaction = database.transaction(() => {
    const current = getToolApprovalByRunId(toolRunId);
    if (!current) return null;
    if (current.decision !== "pending") return current;

    const now = new Date();
    if (current.expiresAt && new Date(current.expiresAt).getTime() <= now.getTime()) {
      database
        .prepare(
          "UPDATE tool_approvals SET decision = 'expired' WHERE tool_run_id = ? AND decision = 'pending'",
        )
        .run(toolRunId);
      database
        .prepare(
          "UPDATE tool_runs SET status = 'cancelled', error_code = 'APPROVAL_EXPIRED', completed_at = ? WHERE id = ? AND status = 'approval_required'",
        )
        .run(now.toISOString(), toolRunId);
      return getToolApprovalByRunId(toolRunId);
    }

    if (decision === "approved") {
      const changed = database
        .prepare(
          "UPDATE tool_approvals SET decision = 'approved', approved_at = ? WHERE tool_run_id = ? AND decision = 'pending'",
        )
        .run(now.toISOString(), toolRunId).changes;
      if (changed) {
        database
          .prepare(
            "UPDATE tool_runs SET status = 'approved' WHERE id = ? AND status = 'approval_required'",
          )
          .run(toolRunId);
      }
    } else {
      const changed = database
        .prepare(
          "UPDATE tool_approvals SET decision = 'rejected', rejected_at = ? WHERE tool_run_id = ? AND decision = 'pending'",
        )
        .run(now.toISOString(), toolRunId).changes;
      if (changed) {
        database
          .prepare(
            "UPDATE tool_runs SET status = 'rejected', error_code = 'USER_REJECTED', completed_at = ? WHERE id = ? AND status = 'approval_required'",
          )
          .run(now.toISOString(), toolRunId);
      }
    }

    return getToolApprovalByRunId(toolRunId);
  });

  return transaction();
}

export function claimApprovedToolRun(toolRunId: string) {
  const now = new Date().toISOString();
  const changed = getKnowledgeDb()
    .prepare(
      `UPDATE tool_runs
       SET status = 'running',
           attempt_count = attempt_count + 1,
           started_at = COALESCE(started_at, ?)
       WHERE id = ? AND status = 'approved'`,
    )
    .run(now, toolRunId).changes;

  return {
    claimed: changed === 1,
    run: getToolRun(toolRunId),
  };
}
