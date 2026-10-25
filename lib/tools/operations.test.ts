import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getKnowledgeDb } from "../rag/db";
import { appendToolAuditEvent } from "./audit";
import {
  completeToolRun,
  createToolRun,
  markToolRunRunning,
  recordToolRunAttempt,
} from "./db";
import { createCrmContact } from "./executors/create-crm-contact";
import {
  getToolOperationsSummary,
  getToolRunDetail,
  listCrmContacts,
  listToolRuns,
} from "./operations";

const runIds: string[] = [];
const crmKeys: string[] = [];

afterEach(() => {
  const db = getKnowledgeDb();
  for (const id of runIds.splice(0)) {
    db.prepare("DELETE FROM tool_runs WHERE id = ?").run(id);
  }
  for (const key of crmKeys.splice(0)) {
    db.prepare("DELETE FROM crm_contacts WHERE idempotency_key = ?").run(key);
  }
});

describe("tool operations read models", () => {
  it("returns run summaries and detail with attempts/audit", () => {
    const run = createToolRun({
      agentId: "ops-test-agent",
      toolId: "builtin.lookup_order",
      callId: "ops-call",
      status: "proposed",
      riskLevel: "read",
      arguments: { order_id: "ORD-4582" },
      requiresApproval: false,
    });
    runIds.push(run.id);

    markToolRunRunning(run.id);
    recordToolRunAttempt({
      toolRunId: run.id,
      attemptNumber: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 7,
      outcome: "success",
      errorCode: null,
    });
    completeToolRun(run.id, {
      order_id: "ORD-4582",
      status: "Kargoya verildi",
      tracking_status: "Transfer merkezinde",
    });
    appendToolAuditEvent({
      toolRunId: run.id,
      eventType: "tool.completed",
      metadata: { durationMs: 7, authorization: "secret" },
    });

    const summary = listToolRuns(20).find((item) => item.id === run.id);
    expect(summary).toMatchObject({
      toolName: "lookup_order",
      status: "success",
      durationMs: 7,
    });

    const detail = getToolRunDetail(run.id);
    expect(detail?.arguments).toEqual({ order_id: "ORD-4582" });
    expect(detail?.result?.status).toBe("Kargoya verildi");
    expect(detail?.attempts).toHaveLength(1);
    expect(detail?.auditEvents).toHaveLength(1);
    expect(detail?.auditEvents[0].metadata.authorization).toBe("[REDACTED]");
  });

  it("returns CRM contacts without exposing idempotency metadata", () => {
    const key = `ops-crm-${randomUUID()}`;
    crmKeys.push(key);

    const created = createCrmContact(
      {
        name: "Operasyon Müşterisi",
        phone: "+905550000000",
        email: "ops@example.com",
        notes: "Audit test",
      },
      key,
    );

    const contact = listCrmContacts(50).find(
      (item) => item.id === created.contact_id,
    );

    expect(contact).toEqual({
      id: created.contact_id,
      name: "Operasyon Müşterisi",
      phone: "+905550000000",
      email: "ops@example.com",
      notes: "Audit test",
      createdAt: expect.any(String),
    });
    expect(Object.keys(contact || {})).not.toContain("idempotencyKey");

    const summary = getToolOperationsSummary();
    expect(summary.crmContacts).toBeGreaterThanOrEqual(1);
  });
});
