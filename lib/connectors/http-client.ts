import https from "node:https";
import type { LookupFunction } from "node:net";
import {
  connectorErrorMessage,
  resolveConnectorUrl,
  resolvePinnedPublicIpv4,
  validateConnectorBaseUrl,
} from "./security";

export type SafeConnectorRequest = {
  baseUrl: URL;
  path: string;
  method?: "GET" | "POST";
  bearerToken?: string | null;
  body?: Record<string, unknown> | null;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type SafeConnectorResponse = {
  statusCode: number;
  data: unknown;
  durationMs: number;
  hostname: string;
};

export async function requestConnectorJson(
  input: SafeConnectorRequest,
): Promise<SafeConnectorResponse> {
  const startedAt = performance.now();
  const base = validateConnectorBaseUrl(input.baseUrl);
  const target = resolveConnectorUrl(input.baseUrl, input.path);
  const pinnedAddress = await resolvePinnedPublicIpv4(base.hostname);
  const method = input.method ?? "GET";
  const timeoutMs = input.timeoutMs ?? 8_000;
  const maxResponseBytes = input.maxResponseBytes ?? 256 * 1024;
  const body =
    method === "POST" && input.body
      ? Buffer.from(JSON.stringify(input.body), "utf8")
      : null;

  const headers: Record<string, string | number> = {
    Accept: "application/json",
    "User-Agent": "Avenlyo-Connector/1.0",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = body.byteLength;
  }

  if (input.bearerToken) {
    headers.Authorization = `Bearer ${input.bearerToken}`;
  }

  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (typeof options === "object" && options?.all) {
      callback(null, [{ address: pinnedAddress, family: 4 }]);
      return;
    }
    callback(null, pinnedAddress, 4);
  };

  return await new Promise<SafeConnectorResponse>((resolve, reject) => {
    const request = https.request(
      target,
      {
        method,
        headers,
        agent: false,
        lookup,
        servername: base.hostname,
        timeout: timeoutMs,
        maxRedirects: 0,
      } as https.RequestOptions & { maxRedirects?: number },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400) {
          response.resume();
          request.destroy(new Error("CONNECTOR_REDIRECT_BLOCKED"));
          return;
        }

        const contentType = String(response.headers["content-type"] || "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        if (
          contentType !== "application/json" &&
          !contentType.endsWith("+json")
        ) {
          response.resume();
          request.destroy(new Error("CONNECTOR_CONTENT_TYPE_INVALID"));
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;

          if (bytes > maxResponseBytes) {
            request.destroy(new Error("CONNECTOR_RESPONSE_TOO_LARGE"));
            return;
          }

          chunks.push(buffer);
        });

        response.on("end", () => {
          if (request.destroyed && bytes > maxResponseBytes) return;

          let data: unknown;
          try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            reject(new Error("CONNECTOR_RESPONSE_INVALID_JSON"));
            return;
          }

          resolve({
            statusCode,
            data,
            durationMs: Math.round(performance.now() - startedAt),
            hostname: base.hostname,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("CONNECTOR_TIMEOUT"));
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (body) request.write(body);
    request.end();
  });
}

export { connectorErrorMessage };
