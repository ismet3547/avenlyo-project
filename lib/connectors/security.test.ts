import { describe, expect, it } from "vitest";
import {
  isPublicIpv4,
  resolveConnectorUrl,
  resolvePinnedPublicIpv4,
  validateConnectorBaseUrl,
} from "./security";

describe("connector destination security", () => {
  it("allows public IPv4 and blocks local/private/special ranges", () => {
    expect(isPublicIpv4("1.1.1.1")).toBe(true);
    expect(isPublicIpv4("8.8.8.8")).toBe(true);

    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.2.10",
      "198.51.100.10",
      "203.0.113.10",
      "224.0.0.1",
    ]) {
      expect(isPublicIpv4(address)).toBe(false);
    }
  });

  it("requires a clean HTTPS base URL", () => {
    expect(() =>
      validateConnectorBaseUrl(new URL("http://api.example.com")),
    ).toThrow("CONNECTOR_HTTPS_REQUIRED");

    expect(() =>
      validateConnectorBaseUrl(new URL("https://user:pass@api.example.com")),
    ).toThrow("CONNECTOR_USERINFO_BLOCKED");

    expect(() =>
      validateConnectorBaseUrl(new URL("https://api.example.com?token=x")),
    ).toThrow("CONNECTOR_QUERY_BLOCKED");

    expect(() =>
      validateConnectorBaseUrl(new URL("https://api.example.com/#secret")),
    ).toThrow("CONNECTOR_FRAGMENT_BLOCKED");
  });

  it("keeps fixed paths on the configured origin", () => {
    const base = new URL("https://api.example.com");

    expect(resolveConnectorUrl(base, "/health").href).toBe(
      "https://api.example.com/health",
    );

    for (const path of [
      "//evil.example/health",
      "https://evil.example/health",
      "/health?next=https://evil.example",
      "/health#fragment",
      "/foo\\bar",
    ]) {
      expect(() => resolveConnectorUrl(base, path)).toThrow(
        "CONNECTOR_PATH_INVALID",
      );
    }
  });

  it("pins only public IPv4 answers and rejects mixed private DNS results", async () => {
    await expect(
      resolvePinnedPublicIpv4("api.example.com", async () => [
        { address: "1.1.1.1", family: 4 },
      ]),
    ).resolves.toBe("1.1.1.1");

    await expect(
      resolvePinnedPublicIpv4("api.example.com", async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow("CONNECTOR_PRIVATE_IP_BLOCKED");
  });
});
