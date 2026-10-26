import { afterEach, describe, expect, it } from "vitest";
import {
  getConnectorDefinition,
  listPublicConnectors,
  toConnectorPublicItem,
} from "./registry";
import { testConnector } from "./service";

const managedEnv = [
  "AVENLYO_CONNECTOR_HTTP_BASE_URL",
  "AVENLYO_CONNECTOR_HTTP_HEALTH_PATH",
  "AVENLYO_CONNECTOR_HTTP_BEARER_TOKEN",
  "AVENLYO_CONNECTOR_WEBHOOK_URL",
  "AVENLYO_CONNECTOR_WEBHOOK_BEARER_TOKEN",
] as const;

const original = Object.fromEntries(
  managedEnv.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of managedEnv) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("connector registry", () => {
  it("never exposes bearer secret values in the public catalog", () => {
    process.env.AVENLYO_CONNECTOR_HTTP_BASE_URL =
      "https://api.example.com";
    process.env.AVENLYO_CONNECTOR_HTTP_BEARER_TOKEN =
      "super-secret-token";

    const connector = listPublicConnectors().find(
      (item) => item.id === "primary-http-api",
    );

    expect(connector).toMatchObject({
      configured: true,
      origin: "https://api.example.com",
      hostname: "api.example.com",
      secretConfigured: true,
    });
    expect(JSON.stringify(connector)).not.toContain("super-secret-token");
    expect(connector?.env.secret).toBe(
      "AVENLYO_CONNECTOR_HTTP_BEARER_TOKEN",
    );
  });

  it("marks invalid non-HTTPS configuration as unavailable", () => {
    process.env.AVENLYO_CONNECTOR_HTTP_BASE_URL =
      "http://127.0.0.1:3000";

    const definition = getConnectorDefinition("primary-http-api")!;
    const connector = toConnectorPublicItem(definition);

    expect(connector.configured).toBe(false);
    expect(connector.configurationError).toBe(
      "Connector yalnız HTTPS kullanabilir.",
    );
  });

  it("returns a local configuration error without making a network request", async () => {
    delete process.env.AVENLYO_CONNECTOR_HTTP_BASE_URL;

    const result = await testConnector("primary-http-api");

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.message).toBe("Connector URL tanımlı değil.");
  });

  it("keeps webhook delivery non-testable in foundation stage", () => {
    process.env.AVENLYO_CONNECTOR_WEBHOOK_URL =
      "https://hooks.example.com";

    const connector = listPublicConnectors().find(
      (item) => item.id === "primary-webhook",
    );

    expect(connector).toMatchObject({
      configured: true,
      testable: false,
      outboundMode: "write",
    });
  });
});
