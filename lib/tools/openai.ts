import { getToolFeatureFlags } from "./config";
import { getEnabledAgentToolIds } from "./db";
import { listRegisteredTools } from "./registry";
import { toStrictJsonSchema } from "./schemas";
import type { ToolDefinition } from "./types";

function riskEnabled(
  definition: ToolDefinition,
  flags: ReturnType<typeof getToolFeatureFlags>,
) {
  if (
    (definition.riskLevel === "read" ||
      definition.riskLevel === "sensitive_read") &&
    !flags.readsEnabled
  ) {
    return false;
  }

  if (
    (definition.riskLevel === "write" ||
      definition.riskLevel === "external_share") &&
    !flags.writesEnabled
  ) {
    return false;
  }

  if (
    definition.riskLevel === "destructive" &&
    (!flags.writesEnabled || !flags.destructiveEnabled)
  ) {
    return false;
  }

  return true;
}

export function getExecutableToolsForAgent(agentId: string) {
  const flags = getToolFeatureFlags();
  if (!flags.toolsEnabled) return [];

  const allowed = new Set(getEnabledAgentToolIds(agentId));

  return listRegisteredTools().filter(
    (definition) =>
      allowed.has(definition.id) &&
      definition.config.executor !== "planned" &&
      riskEnabled(definition, flags),
  );
}

export function toOpenAiFunctionTool(definition: ToolDefinition) {
  return {
    type: "function" as const,
    name: definition.name,
    description: definition.description,
    parameters: toStrictJsonSchema(definition.inputSchema),
    strict: true,
  };
}
