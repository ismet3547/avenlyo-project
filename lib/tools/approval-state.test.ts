import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getKnowledgeDb } from "../rag/db";
import { hashToolArguments } from "./arguments";
import {
  claimApprovedToolRun,
  createToolApproval,
  createToolRun,
  decideToolApproval,
  getToolApprovalByRunId,
  getToolRun,
} from "./db";

const cleanupRunIds: string[] = [];

afterEach(() => {
  const db = getKnowledgeDb();
  for (const id of cleanupRunIds.splice(0)) {
    db.prepare("DELETE FROM tool_runs WHERE id = ?").run(id);
  }
});

function pendingRun() {
  const args = {
    name: "Approval User",
    phone: null,
    email: "approval@example.com",
    notes: null,
  };
  const run = createToolRun({
    conversationId: `conv-${randomUUID()}`,
    messageId: `msg-${randomUUID()}`,
    agentId: `agent-${randomUUID()}`,
    toolId: "builtin.create_crm_contact",
    callId: `call-${randomUUID()}`,
    status: "approval_required",
    riskLevel: "write",
    arguments: args,
    requiresApproval: true,
  });
  cleanupRunIds.push(run.id);

  const approval = createToolApproval({
    toolRunId: run.id,
    argumentsHash: hashToolArguments(args),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    resumeItems: [
      {
        type: "function_call",
        call_id: run.callId,
        name: "create_crm_contact",
        arguments: JSON.stringify(args),
      },
    ],
  });

  return { run, approval, args };
}

describe("write approval state machine", () => {
  it("allows only one execution claim after approval", () => {
    const { run } = pendingRun();

    const decided = decideToolApproval(run.id, "approved");
    expect(decided?.decision).toBe("approved");

    const first = claimApprovedToolRun(run.id);
    const second = claimApprovedToolRun(run.id);

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(getToolRun(run.id)?.status).toBe("running");
  });

  it("rejects a pending run without making it executable", () => {
    const { run } = pendingRun();

    const decided = decideToolApproval(run.id, "rejected");

    expect(decided?.decision).toBe("rejected");
    expect(getToolRun(run.id)?.status).toBe("rejected");
    expect(claimApprovedToolRun(run.id).claimed).toBe(false);
  });

  it("stores the approved argument hash and resume items server-side", () => {
    const { run, approval, args } = pendingRun();
    const stored = getToolApprovalByRunId(run.id);

    expect(stored?.argumentsHash).toBe(hashToolArguments(args));
    expect(stored?.argumentsHash).toBe(approval.argumentsHash);
    expect(stored?.resumeItemsJson).toContain("create_crm_contact");
  });
});
