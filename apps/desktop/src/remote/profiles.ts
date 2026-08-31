import type {
  LocalConfigurationPort,
} from "@wanex/assistant-host";
import type { SecretStorePort } from "@wanex/runtime/secrets";
import {
  normalizeProfileId,
  normalizeProfileName,
  normalizeRemoteCredential,
  normalizeRemoteEndpoint,
  parseStoredRemoteConnectionProfile,
  projectRemoteConnectionProfile,
  REMOTE_CONNECTION_CONFIG_PREFIX,
  remoteConnectionProfileKey,
  toStoredRemoteConnectionProfileJson,
  type RemoteConnectionProfile,
  type SaveRemoteConnectionProfileInput,
  type StoredRemoteConnectionProfile,
} from "./profile.js";

type ConfigurationEntry = NonNullable<
  Awaited<ReturnType<LocalConfigurationPort["getConfigEntry"]>>
>;

export interface RemoteConnectionProfileCatalog {
  list(): Promise<readonly RemoteConnectionProfile[]>;
  read(profileId: string): Promise<RemoteConnectionProfile | null>;
  save(input: SaveRemoteConnectionProfileInput): Promise<RemoteConnectionProfile>;
  remove(profileId: string): Promise<void>;
}

export interface RemoteConnectionProfileCatalogOptions {
  readonly configuration: LocalConfigurationPort;
  readonly credentialStore: Pick<SecretStorePort, "put" | "delete">;
  readonly createCredentialRef: (input: {
    readonly profileId: string;
    readonly revisionId: string;
  }) => string;
  readonly now?: () => number;
  readonly createRevisionId?: () => string;
}

const PROFILE_PAGE_SIZE = 100;
const MAX_PROFILE_COUNT = 1_024;

export class RemoteConnectionProfileConflictError extends Error {
  readonly code = "remote_connection_profile_conflict" as const;

  constructor(profileId: string) {
    super(`remote connection profile changed while updating: ${profileId}`);
    this.name = "RemoteConnectionProfileConflictError";
  }
}

export function createRemoteConnectionProfileCatalog(
  options: RemoteConnectionProfileCatalogOptions,
): RemoteConnectionProfileCatalog {
  const now = options.now ?? Date.now;
  const createRevisionId = options.createRevisionId ?? defaultRevisionId;

  const catalog: RemoteConnectionProfileCatalog = {
    async list() {
      const entries: ConfigurationEntry[] = [];
      let afterKey: string | undefined;
      for (;;) {
        const page = await options.configuration.listConfigEntries({
          prefix: REMOTE_CONNECTION_CONFIG_PREFIX,
          limit: PROFILE_PAGE_SIZE,
          ...(afterKey === undefined ? {} : { afterKey }),
        });
        entries.push(...page);
        if (entries.length > MAX_PROFILE_COUNT) {
          throw new Error("remote connection profile catalog is too large");
        }
        if (page.length < PROFILE_PAGE_SIZE) break;
        const nextAfterKey = page.at(-1)?.key;
        if (nextAfterKey === undefined || nextAfterKey === afterKey) {
          throw new Error("remote connection profile listing did not advance");
        }
        afterKey = nextAfterKey;
      }
      return entries
        .map((entry) => projectRemoteConnectionProfile(readEntry(entry)))
        .sort((left, right) => left.profileId.localeCompare(right.profileId));
    },
    async read(profileId) {
      const key = remoteConnectionProfileKey(profileId);
      const entry = await options.configuration.getConfigEntry(key);
      return entry === null ? null : projectRemoteConnectionProfile(readEntry(entry));
    },
    async save(input) {
      const profileId = normalizeProfileId(input.profileId);
      const name = normalizeProfileName(input.name);
      const endpoint = normalizeRemoteEndpoint(input.endpoint);
      const key = remoteConnectionProfileKey(profileId);
      const current = await options.configuration.getConfigEntry(key);
      const previous = current === null ? undefined : readEntry(current);
      const timestamp = now();
      let nextCredentialRef = previous?.credentialRef;
      let createdCredentialRef: string | undefined;
      if (input.credential !== undefined) {
        if (input.credential === null) {
          nextCredentialRef = undefined;
        } else {
          normalizeRemoteCredential(input.credential);
          createdCredentialRef = options.createCredentialRef({
            profileId,
            revisionId: createRevisionId(),
          });
          nextCredentialRef = createdCredentialRef;
          await options.credentialStore.put({
            ref: createdCredentialRef,
            value: input.credential,
          });
        }
      }

      const next: StoredRemoteConnectionProfile = {
        kind: "wanex.desktop.remote-connection",
        profileId,
        name,
        endpoint,
        ...(nextCredentialRef === undefined
          ? {}
          : { credentialRef: nextCredentialRef }),
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      try {
        const result = await options.configuration.compareAndApplyConfigMutations({
          conditions: [{ key, expectedRevision: current?.revision ?? null }],
          puts: [{ key, value: toStoredRemoteConnectionProfileJson(next) }],
          deletes: [],
        });
        if (result.kind === "conflict") {
          throw new RemoteConnectionProfileConflictError(profileId);
        }
      } catch (error) {
        if (createdCredentialRef !== undefined) {
          await options.credentialStore.delete(createdCredentialRef).catch(() => {});
        }
        throw error;
      }

      if (
        previous?.credentialRef !== undefined &&
        previous.credentialRef !== next.credentialRef
      ) {
        await options.credentialStore.delete(previous.credentialRef);
      }
      return projectRemoteConnectionProfile(next);
    },
    async remove(profileId) {
      const normalizedProfileId = normalizeProfileId(profileId);
      const key = remoteConnectionProfileKey(normalizedProfileId);
      const current = await options.configuration.getConfigEntry(key);
      if (current === null) return;
      const previous = readEntry(current);
      const result = await options.configuration.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision: current.revision }],
        puts: [],
        deletes: [key],
      });
      if (result.kind === "conflict") {
        throw new RemoteConnectionProfileConflictError(normalizedProfileId);
      }
      if (previous.credentialRef !== undefined) {
        await options.credentialStore.delete(previous.credentialRef);
      }
    },
  };
  return Object.freeze(catalog);

  function readEntry(entry: ConfigurationEntry): StoredRemoteConnectionProfile {
    const profile = parseStoredRemoteConnectionProfile(entry.value);
    if (remoteConnectionProfileKey(profile.profileId) !== entry.key) {
      throw new Error("remote connection profile key does not match its id");
    }
    return profile;
  }
}

function defaultRevisionId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("remote connection profile requires crypto.randomUUID");
  }
  return randomUuid.call(globalThis.crypto);
}
