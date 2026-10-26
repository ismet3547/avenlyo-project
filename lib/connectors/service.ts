import { appendToolAuditEvent } from "@/lib/tools/audit";
import { getToolLimits } from "@/lib/tools/config";
import {
  getConfiguredConnector,
  getConnectorDefinition,
  listPublicConnectors,
} from "./registry";
import { connectorErrorMessage } from "./security";
import { requestConnectorJson } from "./http-client";
import type { ConnectorTestResult } from "./types";

export function getConnectorCatalog() {
  return listPublicConnectors();
}

export async function testConnector(id: string): Promise<ConnectorTestResult> {
  const configured = getConfiguredConnector(id);

  if (!configured) {
    return {
      connectorId: id,
      ok: false,
      statusCode: null,
      durationMs: 0,
      hostname: null,
      message: "Connector bulunamadı.",
    };
  }

  const { definition, url, bearerToken, error } = configured;
  if (error || !url) {
    return {
      connectorId: id,
      ok: false,
      statusCode: null,
      durationMs: 0,
      hostname: null,
      message: error || "Connector yapılandırılmamış.",
    };
  }

  if (!definition.testable || definition.kind !== "http_json") {
    return {
      connectorId: id,
      ok: false,
      statusCode: null,
      durationMs: 0,
      hostname: url.hostname,
      message: "Bu connector için otomatik test çağrısı desteklenmiyor.",
    };
  }

  const startedAt = performance.now();

  try {
    const response = await requestConnectorJson({
      baseUrl: url,
      path:
        (definition.healthPathEnv
          ? process.env[definition.healthPathEnv]?.trim()
          : null) ||
        definition.healthPath ||
        "/health",
      method: "GET",
      bearerToken,
      timeoutMs: getToolLimits().httpTimeoutMs,
    });

    const ok = response.statusCode >= 200 && response.statusCode < 300;
    const result: ConnectorTestResult = {
      connectorId: id,
      ok,
      statusCode: response.statusCode,
      durationMs: response.durationMs,
      hostname: response.hostname,
      message: ok
        ? "Connector erişilebilir ve JSON yanıt verdi."
        : `Connector HTTP ${response.statusCode} döndürdü.`,
    };

    appendToolAuditEvent({
      eventType: ok ? "connector.test_succeeded" : "connector.test_failed",
      metadata: {
        connectorId: id,
        hostname: response.hostname,
        statusCode: response.statusCode,
        durationMs: response.durationMs,
      },
    });

    return result;
  } catch (requestError) {
    const result: ConnectorTestResult = {
      connectorId: id,
      ok: false,
      statusCode: null,
      durationMs: Math.round(performance.now() - startedAt),
      hostname: url.hostname,
      message: connectorErrorMessage(requestError),
    };

    appendToolAuditEvent({
      eventType: "connector.test_failed",
      metadata: {
        connectorId: id,
        hostname: url.hostname,
        durationMs: result.durationMs,
        errorCode:
          requestError instanceof Error ? requestError.message : "UNKNOWN",
      },
    });

    return result;
  }
}

export function connectorSetupMetadata(id: string) {
  const definition = getConnectorDefinition(id);
  if (!definition) return null;

  return {
    id: definition.id,
    baseUrlEnv: definition.baseUrlEnv,
    secretEnv:
      definition.auth.type === "bearer_env"
        ? definition.auth.secretEnv
        : null,
  };
}
