import type { ToolFeatureFlags } from "./types";

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

export function getToolFeatureFlags(): ToolFeatureFlags {
  return {
    toolsEnabled: envBoolean("AVENLYO_TOOLS_ENABLED", false),
    readsEnabled: envBoolean("AVENLYO_TOOL_READS_ENABLED", true),
    writesEnabled: envBoolean("AVENLYO_TOOL_WRITES_ENABLED", false),
    destructiveEnabled: envBoolean("AVENLYO_TOOL_DESTRUCTIVE_ENABLED", false),
    dryRun: envBoolean("AVENLYO_TOOL_DRY_RUN", true),
  };
}

export function getToolLimits() {
  const positiveInt = (name: string, fallback: number) => {
    const parsed = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    maxCallsPerTurn: positiveInt("AVENLYO_TOOL_MAX_CALLS_PER_TURN", 3),
    maxConcurrencyPerAgent: positiveInt(
      "AVENLYO_TOOL_MAX_CONCURRENCY_PER_AGENT",
      2,
    ),
    maxConcurrencyGlobal: positiveInt(
      "AVENLYO_TOOL_MAX_CONCURRENCY_GLOBAL",
      4,
    ),
    httpTimeoutMs: positiveInt("AVENLYO_TOOL_HTTP_TIMEOUT_MS", 8_000),
    localTimeoutMs: positiveInt("AVENLYO_TOOL_LOCAL_TIMEOUT_MS", 3_000),
  };
}
