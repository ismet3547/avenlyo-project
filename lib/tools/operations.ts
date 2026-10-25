import { getKnowledgeDb } from "../rag/db";
import type {
  CrmContact,
  ToolApprovalDecision,
  ToolAuditEventView,
  ToolOperationsSummary,
  ToolRiskLevel,
  ToolRunAttemptView,
  ToolRunDetail,
  ToolRunStatus,
  ToolRunSummary,
} from "./types";

type RunSummaryRow = {
  id: string;
  trace_id: string;
  agent_id: string;
  tool_id: string;
  tool_name: string;
  tool_display_name: string;
  status: ToolRunStatus;
  risk_level: ToolRiskLevel;
  requires_approval: number;
  approval_decision: ToolApprovalDecision | null;
  error_code: string | null;
  attempt_count: number;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
};

type RunDetailRow = RunSummaryRow & {
  conversation_id: string | null;
  message_id: string | null;
  call_id: string | null;
  arguments_json: string;
  result_json: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
};

type AttemptRow = {
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  outcome: string;
  error_code: string | null;
};

type AuditRow = {
  id: string;
  event_type: string;
  metadata_json: string;
  created_at: string;
};

type CrmRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};

function safeObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mapSummary(row: RunSummaryRow): ToolRunSummary {
  return {
    id: row.id,
    traceId: row.trace_id,
    agentId: row.agent_id,
    toolId: row.tool_id,
    toolName: row.tool_name,
    toolDisplayName: row.tool_display_name,
    status: row.status,
    riskLevel: row.risk_level,
    requiresApproval: row.requires_approval === 1,
    approvalDecision: row.approval_decision,
    errorCode: row.error_code,
    attemptCount: row.attempt_count,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const runSelect = `
  SELECT
    tr.id,
    tr.trace_id,
    tr.agent_id,
    tr.tool_id,
    t.name AS tool_name,
    t.display_name AS tool_display_name,
    tr.status,
    tr.risk_level,
    tr.requires_approval,
    ta.decision AS approval_decision,
    tr.error_code,
    tr.attempt_count,
    (
      SELECT SUM(tra.duration_ms)
      FROM tool_run_attempts tra
      WHERE tra.tool_run_id = tr.id
    ) AS duration_ms,
    tr.created_at,
    tr.completed_at
  FROM tool_runs tr
  JOIN tools t ON t.id = tr.tool_id
  LEFT JOIN tool_approvals ta ON ta.tool_run_id = tr.id
`;

export function listToolRuns(limit = 50): ToolRunSummary[] {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = getKnowledgeDb()
    .prepare(`${runSelect} ORDER BY tr.created_at DESC LIMIT ?`)
    .all(safeLimit) as RunSummaryRow[];

  return rows.map(mapSummary);
}

export function getToolOperationsSummary(): ToolOperationsSummary {
  const database = getKnowledgeDb();

  const runCounts = database
    .prepare(`
      SELECT
        COUNT(*) AS total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_runs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
        SUM(CASE WHEN status = 'approval_required' THEN 1 ELSE 0 END) AS pending_approvals,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_runs
      FROM tool_runs
    `)
    .get() as {
      total_runs: number;
      success_runs: number | null;
      failed_runs: number | null;
      pending_approvals: number | null;
      rejected_runs: number | null;
    };

  const crmRow = database
    .prepare("SELECT COUNT(*) AS count FROM crm_contacts")
    .get() as { count: number };

  return {
    totalRuns: runCounts.total_runs,
    successRuns: runCounts.success_runs ?? 0,
    failedRuns: runCounts.failed_runs ?? 0,
    pendingApprovals: runCounts.pending_approvals ?? 0,
    rejectedRuns: runCounts.rejected_runs ?? 0,
    crmContacts: crmRow.count,
  };
}

export function getToolRunDetail(id: string): ToolRunDetail | null {
  const database = getKnowledgeDb();

  const row = database
    .prepare(`
      SELECT
        tr.id,
        tr.trace_id,
        tr.agent_id,
        tr.tool_id,
        t.name AS tool_name,
        t.display_name AS tool_display_name,
        tr.status,
        tr.risk_level,
        tr.requires_approval,
        ta.decision AS approval_decision,
        tr.error_code,
        tr.attempt_count,
        (
          SELECT SUM(tra.duration_ms)
          FROM tool_run_attempts tra
          WHERE tra.tool_run_id = tr.id
        ) AS duration_ms,
        tr.created_at,
        tr.completed_at,
        tr.conversation_id,
        tr.message_id,
        tr.call_id,
        tr.arguments_json,
        tr.result_json,
        ta.approved_at,
        ta.rejected_at,
        ta.expires_at
      FROM tool_runs tr
      JOIN tools t ON t.id = tr.tool_id
      LEFT JOIN tool_approvals ta ON ta.tool_run_id = tr.id
      WHERE tr.id = ?
    `)
    .get(id) as RunDetailRow | undefined;

  if (!row) return null;

  const attempts = database
    .prepare(`
      SELECT attempt_number, started_at, completed_at, duration_ms, outcome, error_code
      FROM tool_run_attempts
      WHERE tool_run_id = ?
      ORDER BY attempt_number ASC
    `)
    .all(id) as AttemptRow[];

  const auditRows = database
    .prepare(`
      SELECT id, event_type, metadata_json, created_at
      FROM tool_audit_events
      WHERE tool_run_id = ?
      ORDER BY created_at ASC
    `)
    .all(id) as AuditRow[];

  const auditEvents: ToolAuditEventView[] = auditRows.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    metadata: safeObject(event.metadata_json) ?? {},
    createdAt: event.created_at,
  }));

  const attemptViews: ToolRunAttemptView[] = attempts.map((attempt) => ({
    attemptNumber: attempt.attempt_number,
    startedAt: attempt.started_at,
    completedAt: attempt.completed_at,
    durationMs: attempt.duration_ms,
    outcome: attempt.outcome,
    errorCode: attempt.error_code,
  }));

  return {
    ...mapSummary(row),
    conversationId: row.conversation_id,
    messageId: row.message_id,
    callId: row.call_id,
    arguments: safeObject(row.arguments_json),
    result: safeObject(row.result_json),
    approval: row.approval_decision
      ? {
          decision: row.approval_decision,
          approvedAt: row.approved_at,
          rejectedAt: row.rejected_at,
          expiresAt: row.expires_at,
        }
      : null,
    attempts: attemptViews,
    auditEvents,
  };
}

export function listCrmContacts(limit = 100): CrmContact[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = getKnowledgeDb()
    .prepare(`
      SELECT id, name, phone, email, notes, created_at
      FROM crm_contacts
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(safeLimit) as CrmRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}
