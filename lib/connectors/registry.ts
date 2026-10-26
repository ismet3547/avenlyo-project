import type {
  ConnectorDefinition,
  ConnectorPublicItem,
} from "./types";

const definitions: ConnectorDefinition[] = [
  {
    id: "primary-http-api",
    displayName: "Harici HTTP API",
    description:
      "Sabit HTTPS origin üzerinden JSON API çağrıları için güvenli connector profili.",
    kind: "http_json",
    baseUrlEnv: "AVENLYO_CONNECTOR_HTTP_BASE_URL",
    auth: {
      type: "bearer_env",
      secretEnv: "AVENLYO_CONNECTOR_HTTP_BEARER_TOKEN",
      required: false,
    },
    healthPath: "/health",
    healthPathEnv: "AVENLYO_CONNECTOR_HTTP_HEALTH_PATH",
    testable: true,
    outboundMode: "read",
  },
  {
    id: "primary-webhook",
    displayName: "Outbound Webhook",
    description:
      "Gelecekte onaylı write aksiyonlarının sabit bir HTTPS webhook hedefine gönderilmesi için profil.",
    kind: "webhook",
    baseUrlEnv: "AVENLYO_CONNECTOR_WEBHOOK_URL",
    auth: {
      type: "bearer_env",
      secretEnv: "AVENLYO_CONNECTOR_WEBHOOK_BEARER_TOKEN",
      required: false,
    },
    testable: false,
    outboundMode: "write",
  },
];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export function listConnectorDefinitions() {
  return [...definitions];
}

export function getConnectorDefinition(id: string) {
  return byId.get(id) ?? null;
}

function safeConfiguredUrl(definition: ConnectorDefinition) {
  const raw = process.env[definition.baseUrlEnv]?.trim();
  if (!raw) {
    return {
      url: null,
      error: null,
    };
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return {
        url: null,
        error: "Connector yalnız HTTPS kullanabilir.",
      };
    }
    if (url.username || url.password) {
      return {
        url: null,
        error: "Connector URL içinde kullanıcı bilgisi bulunamaz.",
      };
    }
    if (url.hash) {
      return {
        url: null,
        error: "Connector URL fragment içeremez.",
      };
    }

    return { url, error: null };
  } catch {
    return {
      url: null,
      error: "Connector URL geçersiz.",
    };
  }
}

export function toConnectorPublicItem(
  definition: ConnectorDefinition,
): ConnectorPublicItem {
  const configured = safeConfiguredUrl(definition);
  const secretConfigured =
    definition.auth.type === "none"
      ? true
      : Boolean(process.env[definition.auth.secretEnv]?.trim());
  const missingRequiredSecret =
    definition.auth.type === "bearer_env" &&
    definition.auth.required &&
    !secretConfigured;

  return {
    id: definition.id,
    displayName: definition.displayName,
    description: definition.description,
    kind: definition.kind,
    configured:
      Boolean(configured.url) &&
      !configured.error &&
      !missingRequiredSecret,
    configurationError:
      configured.error ??
      (missingRequiredSecret ? "Gerekli connector secret tanımlı değil." : null),
    origin: configured.url?.origin ?? null,
    hostname: configured.url?.hostname ?? null,
    authType: definition.auth.type,
    secretConfigured,
    testable: definition.testable,
    outboundMode: definition.outboundMode,
    env: {
      baseUrl: definition.baseUrlEnv,
      secret:
        definition.auth.type === "bearer_env"
          ? definition.auth.secretEnv
          : null,
      healthPath: definition.healthPathEnv ?? null,
    },
  };
}

export function listPublicConnectors() {
  return definitions.map(toConnectorPublicItem);
}

export function getConfiguredConnector(id: string) {
  const definition = getConnectorDefinition(id);
  if (!definition) return null;

  const raw = process.env[definition.baseUrlEnv]?.trim();
  if (!raw) {
    return {
      definition,
      url: null,
      bearerToken: null,
      error: "Connector URL tanımlı değil.",
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      definition,
      url: null,
      bearerToken: null,
      error: "Connector URL geçersiz.",
    };
  }

  const bearerToken =
    definition.auth.type === "bearer_env"
      ? process.env[definition.auth.secretEnv]?.trim() || null
      : null;

  if (
    definition.auth.type === "bearer_env" &&
    definition.auth.required &&
    !bearerToken
  ) {
    return {
      definition,
      url: null,
      bearerToken: null,
      error: "Gerekli connector secret tanımlı değil.",
    };
  }

  return {
    definition,
    url,
    bearerToken,
    error: null,
  };
}
