export const CONNECTOR_KINDS = ["http_json", "webhook"] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export type ConnectorDefinition = {
  id: string;
  displayName: string;
  description: string;
  kind: ConnectorKind;
  baseUrlEnv: string;
  auth:
    | { type: "none" }
    | {
        type: "bearer_env";
        secretEnv: string;
        required: boolean;
      };
  healthPath?: string;
  healthPathEnv?: string;
  testable: boolean;
  outboundMode: "read" | "write";
};

export type ConnectorPublicItem = {
  id: string;
  displayName: string;
  description: string;
  kind: ConnectorKind;
  configured: boolean;
  configurationError: string | null;
  origin: string | null;
  hostname: string | null;
  authType: "none" | "bearer_env";
  secretConfigured: boolean;
  testable: boolean;
  outboundMode: "read" | "write";
  env: {
    baseUrl: string;
    secret: string | null;
    healthPath: string | null;
  };
};

export type ConnectorTestResult = {
  connectorId: string;
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  hostname: string | null;
  message: string;
};
