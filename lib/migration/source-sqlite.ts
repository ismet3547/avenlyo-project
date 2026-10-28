import Database from "better-sqlite3";
import { hashToolArguments } from "@/lib/tools/arguments";
import type { LegacyAgent, MigrationCounts } from "./types";

const COUNT_TABLES: Array<[keyof MigrationCounts, string]> = [
  ["documents", "documents"],
  ["chunks", "chunks"],
  ["agentDocuments", "agent_documents"],
  ["conversations", "conversations"],
  ["chatMessages", "chat_messages"],
  ["workspaceTools", "tools"],
  ["agentTools", "agent_tools"],
  ["toolRuns", "tool_runs"],
  ["toolApprovals", "tool_approvals"],
  ["toolRunAttempts", "tool_run_attempts"],
  ["toolAuditEvents", "tool_audit_events"],
  ["crmContacts", "crm_contacts"],
];

export function openLegacySqlite(dbPath: string) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function sqliteTableExists(db: Database.Database, table: string) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
  );
}

export function readLegacyTable<T extends Record<string, unknown>>(
  db: Database.Database,
  table: string,
): T[] {
  if (!sqliteTableExists(db, table)) return [];
  return db.prepare(`SELECT * FROM "${table}"`).all() as T[];
}

function ids(rows: Array<Record<string, unknown>>, key = "id") {
  return new Set(rows.map((row) => String(row[key] ?? "")));
}

export function inspectLegacySqlite(dbPath: string, agents: LegacyAgent[]) {
  const db = openLegacySqlite(dbPath);
  try {
    const counts = Object.fromEntries(
      COUNT_TABLES.map(([key, table]) => [
        key,
        sqliteTableExists(db, table)
          ? Number((db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count)
          : 0,
      ]),
    ) as MigrationCounts;
    counts.agents = agents.length;

    const documents = readLegacyTable(db, "documents");
    const chunks = readLegacyTable(db, "chunks");
    const agentDocuments = readLegacyTable(db, "agent_documents");
    const tools = readLegacyTable(db, "tools");
    const agentTools = readLegacyTable(db, "agent_tools");
    const conversations = readLegacyTable(db, "conversations");
    const messages = readLegacyTable(db, "chat_messages");
    const toolRuns = readLegacyTable(db, "tool_runs");
    const approvals = readLegacyTable(db, "tool_approvals");
    const attempts = readLegacyTable(db, "tool_run_attempts");
    const audits = readLegacyTable(db, "tool_audit_events");

    const agentIds = new Set(agents.map((agent) => agent.id));
    const documentIds = ids(documents);
    const toolIds = ids(tools);
    const conversationIds = ids(conversations);
    const messageIds = ids(messages);
    const runIds = ids(toolRuns);

    const orphanCounts = {
      agentDocuments: agentDocuments.filter(
        (row) => !agentIds.has(String(row.agent_id)) || !documentIds.has(String(row.document_id)),
      ).length,
      agentTools: agentTools.filter(
        (row) => !agentIds.has(String(row.agent_id)) || !toolIds.has(String(row.tool_id)),
      ).length,
      conversations: conversations.filter(
        (row) => !agentIds.has(String(row.agent_id)),
      ).length,
      chatMessages: messages.filter(
        (row) => !conversationIds.has(String(row.conversation_id)),
      ).length,
      toolRuns: toolRuns.filter((row) => {
        const conversationId = row.conversation_id ? String(row.conversation_id) : null;
        const messageId = row.message_id ? String(row.message_id) : null;
        return (
          !agentIds.has(String(row.agent_id)) ||
          !toolIds.has(String(row.tool_id)) ||
          (conversationId !== null && !conversationIds.has(conversationId)) ||
          (messageId !== null && !messageIds.has(messageId))
        );
      }).length,
      toolApprovals: approvals.filter(
        (row) => !runIds.has(String(row.tool_run_id)),
      ).length,
      toolRunAttempts: attempts.filter(
        (row) => !runIds.has(String(row.tool_run_id)),
      ).length,
      toolAuditEvents: audits.filter(
        (row) => row.tool_run_id && !runIds.has(String(row.tool_run_id)),
      ).length,
    };

    const embeddingDimensions: Record<string, number> = {};
    let invalidEmbeddingCount = 0;
    for (const row of chunks) {
      try {
        const embedding = JSON.parse(String(row.embedding ?? "[]")) as unknown;
        if (!Array.isArray(embedding) || !embedding.length || embedding.some((item) => typeof item !== "number")) {
          invalidEmbeddingCount += 1;
          continue;
        }
        const key = String(embedding.length);
        embeddingDimensions[key] = (embeddingDimensions[key] ?? 0) + 1;
      } catch {
        invalidEmbeddingCount += 1;
      }
    }

    let toolArgumentHashMismatch = 0;
    for (const row of toolRuns) {
      try {
        const args = JSON.parse(String(row.arguments_json ?? "{}")) as unknown;
        if (hashToolArguments(args) !== String(row.arguments_hash ?? "")) {
          toolArgumentHashMismatch += 1;
        }
      } catch {
        toolArgumentHashMismatch += 1;
      }
    }

    const userVersion = Number(db.pragma("user_version", { simple: true }) ?? 0);

    return {
      counts,
      embeddingDimensions,
      invalidEmbeddingCount,
      orphanCounts,
      toolArgumentHashMismatch,
      userVersion,
    };
  } finally {
    db.close();
  }
}
