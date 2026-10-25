import { describe, expect, it } from "vitest";
import { evaluateToolPolicy } from "./policy";
import { getRegisteredTool } from "./registry";
import type { ToolFeatureFlags } from "./types";

const baseFlags: ToolFeatureFlags = {
  toolsEnabled: true,
  readsEnabled: true,
  writesEnabled: true,
  destructiveEnabled: false,
  dryRun: true,
};

describe("tool policy engine", () => {
  it("allows an assigned read-only tool without approval", () => {
    const tool = getRegisteredTool("lookup_order")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: { order_id: "ORD-4582" },
      agentAllowed: true,
      flags: baseFlags,
    });

    expect(decision.status).toBe("allow");
  });

  it("denies tools that are not assigned to the agent", () => {
    const tool = getRegisteredTool("lookup_order")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: { order_id: "ORD-4582" },
      agentAllowed: false,
      flags: baseFlags,
    });

    expect(decision).toMatchObject({
      status: "deny",
      code: "AGENT_TOOL_FORBIDDEN",
    });
  });

  it("denies invalid arguments before execution", () => {
    const tool = getRegisteredTool("lookup_order")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: {
        order_id: "ORD-4582",
        url: "http://169.254.169.254/latest/meta-data",
      },
      agentAllowed: true,
      flags: baseFlags,
    });

    expect(decision).toMatchObject({
      status: "deny",
      code: "INVALID_ARGUMENTS",
    });
  });

  it("requires approval for the CRM write tool", () => {
    const tool = getRegisteredTool("create_crm_contact")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: {
        name: "Ayşe Yılmaz",
        phone: null,
        email: null,
        notes: null,
      },
      agentAllowed: true,
      flags: baseFlags,
    });

    expect(decision.status).toBe("approval_required");
  });

  it("blocks writes when the global write switch is off", () => {
    const tool = getRegisteredTool("create_crm_contact")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: {
        name: "Ayşe Yılmaz",
        phone: null,
        email: null,
        notes: null,
      },
      agentAllowed: true,
      flags: { ...baseFlags, writesEnabled: false },
    });

    expect(decision).toMatchObject({
      status: "deny",
      code: "WRITES_DISABLED",
    });
  });

  it("blocks all tools when the master switch is off", () => {
    const tool = getRegisteredTool("lookup_order")!;
    const decision = evaluateToolPolicy({
      definition: tool,
      rawArguments: { order_id: "ORD-4582" },
      agentAllowed: true,
      flags: { ...baseFlags, toolsEnabled: false },
    });

    expect(decision).toMatchObject({
      status: "deny",
      code: "TOOLS_DISABLED",
    });
  });
});
