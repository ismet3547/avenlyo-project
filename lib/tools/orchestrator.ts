import { appendToolAuditEvent } from "./audit";
import { getToolFeatureFlags } from "./config";
import {
  completeToolRun,
  createToolRun,
  failToolRun,
  getEnabledAgentToolIds,
  getToolEnabled,
  markToolRunRunning,
  recordToolRunAttempt,
} from "./db";
import { executeRegisteredTool } from "./executor";
import { evaluateToolPolicy } from "./policy";
import { getRegisteredTool } from "./registry";
import type { ToolActivity } from "@/lib/types";

export type ModelFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

export type ToolCallOutcome = {
  activity: ToolActivity;
  functionOutput: {
    type: "function_call_output";
    call_id: string;
    output: string;
  };
};

function output(callId: string, value: unknown) {
  return {
    type: "function_call_output" as const,
    call_id: callId,
    output: JSON.stringify(value),
  };
}

export async function handleModelFunctionCall(input: {
  agentId: string;
  conversationId: string;
  messageId?: string | null;
  call: ModelFunctionCall;
}): Promise<ToolCallOutcome> {
  const definition = getRegisteredTool(input.call.name);

  if (!definition) {
    const activity: ToolActivity = {
      id: `blocked-${input.call.callId}`,
      toolName: input.call.name,
      displayName: input.call.name,
      status: "blocked",
      summary: "Tanımsız araç çağrısı engellendi.",
      error: "TOOL_NOT_REGISTERED",
    };

    return {
      activity,
      functionOutput: output(input.call.callId, {
        ok: false,
        error: {
          code: "TOOL_NOT_REGISTERED",
          message: "Bu araç Avenlyo registry içinde tanımlı değil.",
        },
      }),
    };
  }

  let rawArguments: unknown;
  try {
    rawArguments = JSON.parse(input.call.arguments || "{}");
  } catch {
    rawArguments = { __invalid_json: true };
  }

  const agentAllowed = getEnabledAgentToolIds(input.agentId).includes(
    definition.id,
  );
  const decision = evaluateToolPolicy({
    definition,
    rawArguments,
    agentAllowed,
    toolEnabled: getToolEnabled(definition.id),
    flags: getToolFeatureFlags(),
  });

  if (decision.status === "deny") {
    appendToolAuditEvent({
      eventType: "tool.policy_denied",
      metadata: {
        tool: definition.name,
        agentId: input.agentId,
        code: decision.code,
        reason: decision.reason,
      },
    });

    return {
      activity: {
        id: `blocked-${input.call.callId}`,
        toolName: definition.name,
        displayName: definition.displayName,
        status: "blocked",
        summary: decision.reason,
        arguments:
          rawArguments && typeof rawArguments === "object"
            ? (rawArguments as Record<string, unknown>)
            : undefined,
        error: decision.code,
      },
      functionOutput: output(input.call.callId, {
        ok: false,
        error: {
          code: decision.code,
          message: decision.reason,
        },
      }),
    };
  }

  if (decision.status === "approval_required") {
    const run = createToolRun({
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      agentId: input.agentId,
      toolId: definition.id,
      callId: input.call.callId,
      status: "approval_required",
      riskLevel: definition.riskLevel,
      arguments: decision.arguments,
      requiresApproval: true,
    });

    appendToolAuditEvent({
      toolRunId: run.id,
      eventType: "tool.approval_required",
      metadata: {
        tool: definition.name,
        argumentsHash: run.argumentsHash,
      },
    });

    return {
      activity: {
        id: run.id,
        toolRunId: run.id,
        toolName: definition.name,
        displayName: definition.displayName,
        status: "blocked",
        summary: "Bu işlem kullanıcı onayı gerektiriyor.",
        arguments: decision.arguments as Record<string, unknown>,
        error: "APPROVAL_REQUIRED",
      },
      functionOutput: output(input.call.callId, {
        ok: false,
        error: {
          code: "APPROVAL_REQUIRED",
          message: "Bu araç çağrısı kullanıcı onayı gerektiriyor.",
          tool_run_id: run.id,
        },
      }),
    };
  }

  const run = createToolRun({
    conversationId: input.conversationId,
    messageId: input.messageId ?? null,
    agentId: input.agentId,
    toolId: definition.id,
    callId: input.call.callId,
    status: "proposed",
    riskLevel: definition.riskLevel,
    arguments: decision.arguments,
    requiresApproval: false,
  });

  markToolRunRunning(run.id);
  const attemptStartedAt = new Date().toISOString();

  appendToolAuditEvent({
    toolRunId: run.id,
    eventType: "tool.started",
    metadata: {
      tool: definition.name,
      argumentsHash: run.argumentsHash,
    },
  });

  const execution = await executeRegisteredTool({
    definition,
    arguments: decision.arguments,
  });

  const completedAt = new Date().toISOString();
  recordToolRunAttempt({
    toolRunId: run.id,
    attemptNumber: 1,
    startedAt: attemptStartedAt,
    completedAt,
    durationMs: execution.durationMs,
    outcome: execution.ok ? "success" : "failed",
    errorCode: execution.ok ? null : execution.errorCode,
  });

  if (!execution.ok) {
    failToolRun(run.id, execution.errorCode);

    appendToolAuditEvent({
      toolRunId: run.id,
      eventType: "tool.failed",
      metadata: {
        tool: definition.name,
        errorCode: execution.errorCode,
        durationMs: execution.durationMs,
      },
    });

    return {
      activity: {
        id: run.id,
        toolRunId: run.id,
        toolName: definition.name,
        displayName: definition.displayName,
        status: "failed",
        summary: execution.errorMessage,
        arguments: decision.arguments as Record<string, unknown>,
        error: execution.errorCode,
        durationMs: execution.durationMs,
      },
      functionOutput: output(input.call.callId, {
        ok: false,
        error: {
          code: execution.errorCode,
          message: execution.errorMessage,
        },
      }),
    };
  }

  completeToolRun(run.id, execution.result);

  appendToolAuditEvent({
    toolRunId: run.id,
    eventType: "tool.completed",
    metadata: {
      tool: definition.name,
      durationMs: execution.durationMs,
    },
  });

  return {
    activity: {
      id: run.id,
      toolRunId: run.id,
      toolName: definition.name,
      displayName: definition.displayName,
      status: "success",
      summary:
        definition.name === "lookup_order"
          ? "Sipariş bilgisi bulundu."
          : "Araç başarıyla çalıştı.",
      arguments: decision.arguments as Record<string, unknown>,
      result: execution.result,
      durationMs: execution.durationMs,
    },
    functionOutput: output(input.call.callId, {
      ok: true,
      data: execution.result,
    }),
  };
}
