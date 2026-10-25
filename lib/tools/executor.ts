import { getToolLimits } from "./config";
import { lookupOrder } from "./executors/lookup-order";
import { createCrmContact } from "./executors/create-crm-contact";
import type { ToolDefinition } from "./types";

export type ToolExecutionResult =
  | {
      ok: true;
      result: Record<string, unknown>;
      durationMs: number;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      durationMs: number;
    };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("TOOL_TIMEOUT")),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function runLocalTool(
  definition: ToolDefinition,
  args: unknown,
): Promise<unknown> {
  switch (definition.name) {
    case "lookup_order":
      return lookupOrder(args as { order_id: string });
    case "create_crm_contact":
      throw new Error("TOOL_EXECUTION_CONTEXT_REQUIRED");
    default:
      throw new Error("TOOL_EXECUTOR_NOT_IMPLEMENTED");
  }
}

export async function executeRegisteredTool(input: {
  definition: ToolDefinition;
  arguments: unknown;
  idempotencyKey?: string;
  dryRun?: boolean;
}): Promise<ToolExecutionResult> {
  const startedAt = performance.now();

  try {
    if (input.definition.config.executor !== "local") {
      return {
        ok: false,
        errorCode: "TOOL_EXECUTOR_NOT_IMPLEMENTED",
        errorMessage: "Bu araç için executor henüz bağlı değil.",
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    const timeoutMs =
      input.definition.config.timeoutMs ?? getToolLimits().localTimeoutMs;

    const rawResult =
      input.definition.name === "create_crm_contact"
        ? input.dryRun
          ? {
              contact_id: "DRY-RUN",
              name: (input.arguments as { name: string }).name,
              created: false,
            }
          : await withTimeout(
              Promise.resolve(
                createCrmContact(
                  input.arguments as {
                    name: string;
                    phone: string | null;
                    email: string | null;
                    notes: string | null;
                  },
                  input.idempotencyKey || "",
                ),
              ),
              timeoutMs,
            )
        : await withTimeout(
            Promise.resolve(runLocalTool(input.definition, input.arguments)),
            timeoutMs,
          );

    const parsed = input.definition.outputSchema?.safeParse(rawResult);
    if (parsed && !parsed.success) {
      return {
        ok: false,
        errorCode: "TOOL_OUTPUT_INVALID",
        errorMessage: "Araç çıktısı beklenen şemaya uymuyor.",
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    return {
      ok: true,
      result: (parsed?.success ? parsed.data : rawResult) as Record<
        string,
        unknown
      >,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const code =
      error instanceof Error && error.message === "TOOL_TIMEOUT"
        ? "TOOL_TIMEOUT"
        : error instanceof Error &&
            error.message === "TOOL_EXECUTOR_NOT_IMPLEMENTED"
          ? "TOOL_EXECUTOR_NOT_IMPLEMENTED"
          : error instanceof Error &&
              error.message === "TOOL_IDEMPOTENCY_KEY_REQUIRED"
            ? "TOOL_IDEMPOTENCY_KEY_REQUIRED"
            : "TOOL_EXECUTION_FAILED";

    return {
      ok: false,
      errorCode: code,
      errorMessage:
        code === "TOOL_TIMEOUT"
          ? "Araç zaman aşımına uğradı."
          : code === "TOOL_EXECUTOR_NOT_IMPLEMENTED"
            ? "Bu araç için executor henüz bağlı değil."
            : code === "TOOL_IDEMPOTENCY_KEY_REQUIRED"
              ? "Yazma işlemi için idempotency anahtarı gerekli."
              : "Araç çalıştırılırken hata oluştu.",
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}
