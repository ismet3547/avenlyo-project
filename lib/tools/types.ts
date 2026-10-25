import type * as z from "zod";

export const TOOL_KINDS = ["local", "http", "webhook", "oauth_http"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_RISK_LEVELS = [
  "read",
  "sensitive_read",
  "write",
  "destructive",
  "external_share",
] as const;
export type ToolRiskLevel = (typeof TOOL_RISK_LEVELS)[number];

export const TOOL_APPROVAL_POLICIES = ["never", "always", "writes"] as const;
export type ToolApprovalPolicy = (typeof TOOL_APPROVAL_POLICIES)[number];

export type ToolDefinition<TSchema extends z.ZodType = z.ZodType> = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  kind: ToolKind;
  riskLevel: ToolRiskLevel;
  approvalPolicy: ToolApprovalPolicy;
  inputSchema: TSchema;
  outputSchema?: z.ZodType;
  config: {
    executor: "planned" | "local" | "http" | "webhook" | "oauth_http";
    resultAllowlist?: string[];
    timeoutMs?: number;
  };
};

export type ToolCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  kind: ToolKind;
  riskLevel: ToolRiskLevel;
  approvalPolicy: ToolApprovalPolicy;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  enabled: boolean;
  builtin: boolean;
  executionReady: boolean;
};

export type ToolFeatureFlags = {
  toolsEnabled: boolean;
  readsEnabled: boolean;
  writesEnabled: boolean;
  destructiveEnabled: boolean;
  dryRun: boolean;
};

export type ToolPolicyDecision =
  | {
      status: "allow";
      arguments: unknown;
      requiresApproval: false;
    }
  | {
      status: "approval_required";
      arguments: unknown;
      requiresApproval: true;
    }
  | {
      status: "deny";
      code:
        | "TOOLS_DISABLED"
        | "TOOL_DISABLED"
        | "AGENT_TOOL_FORBIDDEN"
        | "READS_DISABLED"
        | "WRITES_DISABLED"
        | "DESTRUCTIVE_DISABLED"
        | "INVALID_ARGUMENTS";
      reason: string;
      issues?: Array<{ path: string; message: string }>;
    };

export type ToolRunStatus =
  | "proposed"
  | "approval_required"
  | "approved"
  | "rejected"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type ToolRunRecord = {
  id: string;
  traceId: string;
  conversationId: string | null;
  messageId: string | null;
  agentId: string;
  toolId: string;
  callId: string | null;
  status: ToolRunStatus;
  riskLevel: ToolRiskLevel;
  argumentsJson: string;
  argumentsHash: string;
  resultJson: string | null;
  errorCode: string | null;
  idempotencyKey: string;
  requiresApproval: boolean;
  approvalId: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};
