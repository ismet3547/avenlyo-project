import { randomUUID } from "node:crypto";
import { getKnowledgeDb } from "../rag/db";

const SECRET_KEY =
  /(authorization|cookie|token|secret|api[_-]?key|password|credential)/i;

function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";

  if (Array.isArray(value)) return value.map((item) => redact(item));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redact(child, childKey),
      ]),
    );
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }

  return value;
}

export function redactToolAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return redact(metadata) as Record<string, unknown>;
}

export function appendToolAuditEvent(input: {
  toolRunId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = redactToolAuditMetadata(input.metadata ?? {});

  getKnowledgeDb()
    .prepare(
      `INSERT INTO tool_audit_events
       (id, tool_run_id, event_type, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.toolRunId ?? null,
      input.eventType,
      JSON.stringify(metadata),
      new Date().toISOString(),
    );
}
