import { formatZodIssues } from "./schemas";
import type {
  ToolDefinition,
  ToolFeatureFlags,
  ToolPolicyDecision,
  ToolRiskLevel,
} from "./types";

function isWriteRisk(risk: ToolRiskLevel) {
  return (
    risk === "write" ||
    risk === "destructive" ||
    risk === "external_share"
  );
}

export function evaluateToolPolicy(input: {
  definition: ToolDefinition;
  rawArguments: unknown;
  agentAllowed: boolean;
  toolEnabled?: boolean;
  flags: ToolFeatureFlags;
}): ToolPolicyDecision {
  const { definition, rawArguments, agentAllowed, flags } = input;
  const toolEnabled = input.toolEnabled ?? true;

  if (!flags.toolsEnabled) {
    return {
      status: "deny",
      code: "TOOLS_DISABLED",
      reason: "Araç kullanımı sistem genelinde kapalı.",
    };
  }

  if (!toolEnabled) {
    return {
      status: "deny",
      code: "TOOL_DISABLED",
      reason: "Bu araç devre dışı.",
    };
  }

  if (!agentAllowed) {
    return {
      status: "deny",
      code: "AGENT_TOOL_FORBIDDEN",
      reason: "Bu ajan aracı kullanma iznine sahip değil.",
    };
  }

  if (
    (definition.riskLevel === "read" ||
      definition.riskLevel === "sensitive_read") &&
    !flags.readsEnabled
  ) {
    return {
      status: "deny",
      code: "READS_DISABLED",
      reason: "Okuma araçları sistem genelinde kapalı.",
    };
  }

  if (isWriteRisk(definition.riskLevel) && !flags.writesEnabled) {
    return {
      status: "deny",
      code: "WRITES_DISABLED",
      reason: "Yazma işlemleri sistem genelinde kapalı.",
    };
  }

  if (
    definition.riskLevel === "destructive" &&
    !flags.destructiveEnabled
  ) {
    return {
      status: "deny",
      code: "DESTRUCTIVE_DISABLED",
      reason: "Yıkıcı işlemler sistem genelinde kapalı.",
    };
  }

  const parsed = definition.inputSchema.safeParse(rawArguments);
  if (!parsed.success) {
    return {
      status: "deny",
      code: "INVALID_ARGUMENTS",
      reason: "Araç argümanları şemaya uymuyor.",
      issues: formatZodIssues(parsed.error),
    };
  }

  const requiresApproval =
    definition.approvalPolicy === "always" ||
    (definition.approvalPolicy === "writes" &&
      isWriteRisk(definition.riskLevel)) ||
    definition.riskLevel === "destructive" ||
    definition.riskLevel === "external_share";

  if (requiresApproval) {
    return {
      status: "approval_required",
      arguments: parsed.data,
      requiresApproval: true,
    };
  }

  return {
    status: "allow",
    arguments: parsed.data,
    requiresApproval: false,
  };
}
