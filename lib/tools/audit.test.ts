import { describe, expect, it } from "vitest";
import { redactToolAuditMetadata } from "./audit";

describe("tool audit redaction", () => {
  it("redacts secrets recursively", () => {
    const redacted = redactToolAuditMetadata({
      tool: "create_crm_contact",
      authorization: "Bearer secret",
      nested: {
        access_token: "token-value",
        refreshToken: "refresh-value",
        apiKey: "api-key-value",
        contactId: "CRM-1",
      },
    });

    expect(redacted).toEqual({
      tool: "create_crm_contact",
      authorization: "[REDACTED]",
      nested: {
        access_token: "[REDACTED]",
        refreshToken: "[REDACTED]",
        apiKey: "[REDACTED]",
        contactId: "CRM-1",
      },
    });
  });

  it("truncates oversized free-form strings", () => {
    const redacted = redactToolAuditMetadata({
      message: "x".repeat(700),
    });

    expect(String(redacted.message).length).toBeLessThan(520);
  });
});
