import type { JsonValue } from "@wanex/protocol";
import { REMOTE_AGENT_HOST_MESSAGE_PATH } from "@wanex/runtime/host/paths";

export const REMOTE_CONNECTION_PROFILE_KIND =
  "wanex.desktop.remote-connection" as const;
export const REMOTE_CONNECTION_CONFIG_PREFIX =
  "wanex.desktop.remote-connection." as const;

const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const MAX_NAME_BYTES = 128;
const MAX_ENDPOINT_BYTES = 2_048;
const MAX_CREDENTIAL_REF_BYTES = 2_048;
const MAX_CREDENTIAL_BYTES = 64 * 1024;

export interface RemoteConnectionProfile {
  readonly profileId: string;
  readonly name: string;
  readonly endpoint: string;
  readonly credentialConfigured: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SaveRemoteConnectionProfileInput {
  readonly profileId: string;
  readonly name: string;
  readonly endpoint: string;
  /** Omit to retain an existing credential, or pass null to remove it. */
  readonly credential?: string | null;
}

export interface StoredRemoteConnectionProfile {
  readonly kind: typeof REMOTE_CONNECTION_PROFILE_KIND;
  readonly profileId: string;
  readonly name: string;
  readonly endpoint: string;
  readonly credentialRef?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function remoteConnectionProfileKey(profileId: string): string {
  return `${REMOTE_CONNECTION_CONFIG_PREFIX}${normalizeProfileId(profileId)}`;
}

export function normalizeProfileId(value: string): string {
  if (!PROFILE_ID_PATTERN.test(value)) {
    throw new Error(
      "remote connection profile id must start with an ASCII letter or digit and contain only ASCII letters, digits, '_' or '-'",
    );
  }
  return value;
}

export function isRemoteConnectionProfileId(value: unknown): value is string {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value);
}

export function isRemoteConnectionProfile(
  value: unknown,
): value is RemoteConnectionProfile {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "profileId",
          "name",
          "endpoint",
          "credentialConfigured",
          "createdAt",
          "updatedAt",
        ].includes(key),
    ) ||
    typeof value.profileId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.endpoint !== "string" ||
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
      normalizeProfileId(value.profileId) === value.profileId &&
      normalizeProfileName(value.name) === value.name &&
      normalizeRemoteEndpoint(value.endpoint) === value.endpoint
    );
  } catch {
    return false;
  }
}

export function normalizeProfileName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || Buffer.byteLength(name, "utf8") > MAX_NAME_BYTES) {
    throw new Error("remote connection profile name is invalid");
  }
  return name;
}

export function normalizeRemoteEndpoint(value: string): string {
  const endpoint = value.trim();
  if (
    endpoint.length === 0 ||
    Buffer.byteLength(endpoint, "utf8") > MAX_ENDPOINT_BYTES
  ) {
    throw new Error("remote connection endpoint is invalid");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("remote connection endpoint is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== REMOTE_AGENT_HOST_MESSAGE_PATH ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      "remote connection endpoint must be an HTTPS URL without credentials or query data",
    );
  }
  return url.toString();
}

export function normalizeRemoteCredential(value: string): string {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_CREDENTIAL_BYTES
  ) {
    throw new Error("remote connection credential is invalid");
  }
  return value;
}

export function parseStoredRemoteConnectionProfile(
  value: unknown,
): StoredRemoteConnectionProfile {
  if (!isRecord(value)) throw new Error("remote connection profile is invalid");
  const keys = [
    "kind",
    "profileId",
    "name",
    "endpoint",
    "credentialRef",
    "createdAt",
    "updatedAt",
  ] as const;
  if (
    Object.keys(value).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    )
  ) {
    throw new Error("remote connection profile is invalid");
  }
  if (
    value.kind !== REMOTE_CONNECTION_PROFILE_KIND ||
    typeof value.profileId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.endpoint !== "string" ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < value.createdAt
  ) {
    throw new Error("remote connection profile is invalid");
  }
  const profileId = normalizeProfileId(value.profileId);
  const name = normalizeProfileName(value.name);
  const endpoint = normalizeRemoteEndpoint(value.endpoint);
  if (
    profileId !== value.profileId ||
    name !== value.name ||
    endpoint !== value.endpoint
  ) {
    throw new Error("remote connection profile is not canonical");
  }
  if (
    value.credentialRef !== undefined &&
    (typeof value.credentialRef !== "string" ||
      value.credentialRef.length === 0 ||
      Buffer.byteLength(value.credentialRef, "utf8") > MAX_CREDENTIAL_REF_BYTES)
  ) {
    throw new Error(
      "remote connection profile credential reference is invalid",
    );
  }
  return {
    kind: value.kind,
    profileId,
    name,
    endpoint,
    ...(value.credentialRef === undefined
      ? {}
      : { credentialRef: value.credentialRef }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function projectRemoteConnectionProfile(
  value: StoredRemoteConnectionProfile,
): RemoteConnectionProfile {
  return {
    profileId: value.profileId,
    name: value.name,
    endpoint: value.endpoint,
    credentialConfigured: value.credentialRef !== undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function toStoredRemoteConnectionProfileJson(
  value: StoredRemoteConnectionProfile,
): JsonValue {
  return {
    kind: value.kind,
    profileId: value.profileId,
    name: value.name,
    endpoint: value.endpoint,
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
