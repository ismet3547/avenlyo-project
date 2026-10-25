import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getKnowledgeDb } from "@/lib/rag/db";
import { executeRegisteredTool } from "./executor";
import { getRegisteredTool } from "./registry";

const cleanupKeys: string[] = [];

afterEach(() => {
  const db = getKnowledgeDb();
  for (const key of cleanupKeys.splice(0)) {
    db.prepare("DELETE FROM crm_contacts WHERE idempotency_key = ?").run(key);
  }
});

describe("create_crm_contact executor", () => {
  it("does not create a row in dry-run mode", async () => {
    const definition = getRegisteredTool("create_crm_contact")!;
    const key = `test-dry-${randomUUID()}`;

    const before = (
      getKnowledgeDb()
        .prepare("SELECT COUNT(*) AS count FROM crm_contacts")
        .get() as { count: number }
    ).count;

    const result = await executeRegisteredTool({
      definition,
      arguments: {
        name: "Dry Run User",
        phone: null,
        email: "dry@example.com",
        notes: null,
      },
      idempotencyKey: key,
      dryRun: true,
    });

    const after = (
      getKnowledgeDb()
        .prepare("SELECT COUNT(*) AS count FROM crm_contacts")
        .get() as { count: number }
    ).count;

    expect(result.ok).toBe(true);
    expect(after).toBe(before);
    if (result.ok) {
      expect(result.result).toEqual({
        contact_id: "DRY-RUN",
        name: "Dry Run User",
        created: false,
      });
    }
  });

  it("uses one CRM row for repeated execution with the same idempotency key", async () => {
    const definition = getRegisteredTool("create_crm_contact")!;
    const key = `test-idem-${randomUUID()}`;
    cleanupKeys.push(key);

    const args = {
      name: "İdempotent User",
      phone: "+905551112233",
      email: "idem@example.com",
      notes: "Test",
    };

    const first = await executeRegisteredTool({
      definition,
      arguments: args,
      idempotencyKey: key,
      dryRun: false,
    });
    const second = await executeRegisteredTool({
      definition,
      arguments: args,
      idempotencyKey: key,
      dryRun: false,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.result.created).toBe(true);
    expect(second.result.created).toBe(false);
    expect(second.result.contact_id).toBe(first.result.contact_id);

    const count = (
      getKnowledgeDb()
        .prepare(
          "SELECT COUNT(*) AS count FROM crm_contacts WHERE idempotency_key = ?",
        )
        .get(key) as { count: number }
    ).count;
    expect(count).toBe(1);
  });
});
