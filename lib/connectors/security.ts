import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type LookupAddress = {
  address: string;
  family: number;
};

function ipv4ToInt(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  ) >>> 0;
}

function inCidr(value: number, base: string, prefix: number) {
  const baseValue = ipv4ToInt(base);
  if (baseValue === null) return false;
  const mask =
    prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const blockedIpv4Ranges: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const value = ipv4ToInt(address);
  if (value === null) return false;
  return !blockedIpv4Ranges.some(([base, prefix]) =>
    inCidr(value, base, prefix),
  );
}

export function validateConnectorBaseUrl(url: URL) {
  if (url.protocol !== "https:") {
    throw new Error("CONNECTOR_HTTPS_REQUIRED");
  }
  if (url.username || url.password) {
    throw new Error("CONNECTOR_USERINFO_BLOCKED");
  }
  if (url.hash) {
    throw new Error("CONNECTOR_FRAGMENT_BLOCKED");
  }
  if (!url.hostname || url.hostname.length > 253) {
    throw new Error("CONNECTOR_HOST_INVALID");
  }

  return {
    hostname: url.hostname.toLowerCase(),
    port: url.port || "443",
    origin: url.origin,
  };
}

export function resolveConnectorUrl(baseUrl: URL, fixedPath: string) {
  validateConnectorBaseUrl(baseUrl);

  if (
    !fixedPath.startsWith("/") ||
    fixedPath.startsWith("//") ||
    fixedPath.includes("\\")
  ) {
    throw new Error("CONNECTOR_PATH_INVALID");
  }

  const target = new URL(fixedPath, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error("CONNECTOR_ORIGIN_MISMATCH");
  }
  if (target.username || target.password || target.hash) {
    throw new Error("CONNECTOR_TARGET_INVALID");
  }

  return target;
}

type ConnectorResolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: ConnectorResolver = async (hostname) =>
  (await dnsLookup(hostname, {
    all: true,
    family: 4,
  })) as LookupAddress[];

export async function resolvePinnedPublicIpv4(
  hostname: string,
  resolver: ConnectorResolver = defaultResolver,
) {
  const addresses = await resolver(hostname);

  if (!addresses.length) {
    throw new Error("CONNECTOR_DNS_NO_IPV4");
  }

  const invalid = addresses.find(
    (item) => item.family !== 4 || !isPublicIpv4(item.address),
  );
  if (invalid) {
    throw new Error("CONNECTOR_PRIVATE_IP_BLOCKED");
  }

  return addresses[0].address;
}

export function connectorErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    CONNECTOR_HTTPS_REQUIRED: "Connector yalnız HTTPS kullanabilir.",
    CONNECTOR_USERINFO_BLOCKED:
      "Connector URL içinde kullanıcı adı veya parola bulunamaz.",
    CONNECTOR_FRAGMENT_BLOCKED: "Connector URL fragment içeremez.",
    CONNECTOR_HOST_INVALID: "Connector hostname geçersiz.",
    CONNECTOR_PATH_INVALID: "Connector endpoint yolu geçersiz.",
    CONNECTOR_ORIGIN_MISMATCH:
      "Connector endpoint'i tanımlı origin dışına çıkamaz.",
    CONNECTOR_TARGET_INVALID: "Connector hedefi güvenlik kontrolünden geçemedi.",
    CONNECTOR_DNS_NO_IPV4:
      "Connector hostname için kullanılabilir IPv4 adresi bulunamadı.",
    CONNECTOR_PRIVATE_IP_BLOCKED:
      "Connector private, local veya özel amaçlı bir IP adresine çözümleniyor.",
    CONNECTOR_TIMEOUT: "Connector isteği zaman aşımına uğradı.",
    CONNECTOR_REDIRECT_BLOCKED: "Connector redirect yanıtı güvenlik nedeniyle engellendi.",
    CONNECTOR_RESPONSE_TOO_LARGE:
      "Connector yanıtı izin verilen maksimum boyutu aşıyor.",
    CONNECTOR_CONTENT_TYPE_INVALID:
      "Connector yalnız JSON yanıtı kabul ediyor.",
    CONNECTOR_RESPONSE_INVALID_JSON:
      "Connector geçerli JSON döndürmedi.",
  };

  return messages[code] ?? "Connector isteği başarısız oldu.";
}
