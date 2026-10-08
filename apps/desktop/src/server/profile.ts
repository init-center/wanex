import type { JsonValue } from "@wanex/protocol";

export const DESKTOP_SERVER_PROFILE_KIND =
  "wanex.desktop.server-profile" as const;
export const DESKTOP_SERVER_PROFILE_CONFIG_PREFIX =
  "wanex.desktop.server-profile." as const;

const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const MAX_NAME_BYTES = 128;
const MAX_SERVER_URL_BYTES = 2_048;
const MAX_CREDENTIAL_REF_BYTES = 2_048;
const MAX_CREDENTIAL_BYTES = 64 * 1024;

export interface DesktopServerProfile {
  readonly profileId: string;
  readonly name: string;
  readonly serverUrl: string;
  readonly credentialConfigured: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SaveDesktopServerProfileInput {
  readonly profileId: string;
  readonly name: string;
  readonly serverUrl: string;
  /** Omit to retain an existing credential, or pass null to remove it. */
  readonly credential?: string | null;
}

export interface StoredDesktopServerProfile {
  readonly kind: typeof DESKTOP_SERVER_PROFILE_KIND;
  readonly profileId: string;
  readonly name: string;
  readonly serverUrl: string;
  readonly credentialRef?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function desktopServerProfileKey(profileId: string): string {
  return `${DESKTOP_SERVER_PROFILE_CONFIG_PREFIX}${normalizeServerProfileId(profileId)}`;
}

export function normalizeServerProfileId(value: string): string {
  if (!PROFILE_ID_PATTERN.test(value)) {
    throw new Error(
      "server profile id must start with an ASCII letter or digit and contain only ASCII letters, digits, '_' or '-'",
    );
  }
  return value;
}

export function isDesktopServerProfileId(value: unknown): value is string {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value);
}

export function isDesktopServerProfile(
  value: unknown,
): value is DesktopServerProfile {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "profileId",
          "name",
          "serverUrl",
          "credentialConfigured",
          "createdAt",
          "updatedAt",
        ].includes(key),
    ) ||
    typeof value.profileId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.serverUrl !== "string" ||
    typeof value.credentialConfigured !== "boolean" ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < value.createdAt
  ) {
    return false;
  }
  try {
    return (
      normalizeServerProfileId(value.profileId) === value.profileId &&
      normalizeServerProfileName(value.name) === value.name &&
      normalizeServerUrl(value.serverUrl) === value.serverUrl
    );
  } catch {
    return false;
  }
}

export function normalizeServerProfileName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || Buffer.byteLength(name, "utf8") > MAX_NAME_BYTES) {
    throw new Error("server profile name is invalid");
  }
  return name;
}

export function normalizeServerUrl(value: string): string {
  const serverUrl = value.trim();
  if (
    serverUrl.length === 0 ||
    Buffer.byteLength(serverUrl, "utf8") > MAX_SERVER_URL_BYTES
  ) {
    throw new Error("server URL is invalid");
  }
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new Error("server URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      "server URL must be an HTTPS origin without credentials, path, query, or fragment",
    );
  }
  return url.toString();
}

export function normalizeServerCredential(value: string): string {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_CREDENTIAL_BYTES
  ) {
    throw new Error("server credential is invalid");
  }
  return value;
}

export function parseStoredDesktopServerProfile(
  value: unknown,
): StoredDesktopServerProfile {
  if (!isRecord(value)) throw new Error("server profile is invalid");
  const keys = [
    "kind",
    "profileId",
    "name",
    "serverUrl",
    "credentialRef",
    "createdAt",
    "updatedAt",
  ] as const;
  if (
    Object.keys(value).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    )
  ) {
    throw new Error("server profile is invalid");
  }
  if (
    value.kind !== DESKTOP_SERVER_PROFILE_KIND ||
    typeof value.profileId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.serverUrl !== "string" ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < value.createdAt
  ) {
    throw new Error("server profile is invalid");
  }
  const profileId = normalizeServerProfileId(value.profileId);
  const name = normalizeServerProfileName(value.name);
  const serverUrl = normalizeServerUrl(value.serverUrl);
  if (
    profileId !== value.profileId ||
    name !== value.name ||
    serverUrl !== value.serverUrl
  ) {
    throw new Error("server profile is not canonical");
  }
  if (
    value.credentialRef !== undefined &&
    (typeof value.credentialRef !== "string" ||
      value.credentialRef.length === 0 ||
      Buffer.byteLength(value.credentialRef, "utf8") > MAX_CREDENTIAL_REF_BYTES)
  ) {
    throw new Error(
      "server profile credential reference is invalid",
    );
  }
  return {
    kind: value.kind,
    profileId,
    name,
    serverUrl,
    ...(value.credentialRef === undefined
      ? {}
      : { credentialRef: value.credentialRef }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function projectDesktopServerProfile(
  value: StoredDesktopServerProfile,
): DesktopServerProfile {
  return {
    profileId: value.profileId,
    name: value.name,
    serverUrl: value.serverUrl,
    credentialConfigured: value.credentialRef !== undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function toStoredDesktopServerProfileJson(
  value: StoredDesktopServerProfile,
): JsonValue {
  return {
    kind: value.kind,
    profileId: value.profileId,
    name: value.name,
    serverUrl: value.serverUrl,
    ...(value.credentialRef === undefined
      ? {}
      : { credentialRef: value.credentialRef }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
