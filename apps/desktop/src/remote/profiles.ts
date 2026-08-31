import type { LocalConfigurationPort } from "@wanex/assistant-host";
import type {
  ResolvedSecret,
  SecretResolverPort,
  SecretStorePort,
} from "@wanex/runtime/secrets";
import {
  createRemoteCredentialRetirement,
  RemoteCredentialRetirementConflictError,
} from "./credential-retirement.js";
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
  resolveCredential(profileId: string): Promise<ResolvedSecret | null>;
  reconcileCredentialRetirement(): Promise<boolean>;
  save(
    input: SaveRemoteConnectionProfileInput,
  ): Promise<RemoteConnectionProfile>;
  remove(profileId: string): Promise<void>;
}

export { REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY } from "./credential-retirement.js";

export interface RemoteConnectionProfileCatalogOptions {
  readonly configuration: LocalConfigurationPort;
  readonly credentialStore: Pick<SecretStorePort, "put" | "delete">;
  readonly credentialResolver: SecretResolverPort;
  readonly ownsCredentialRef: (ref: string) => boolean;
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
  let mutationTail = Promise.resolve();
  const credentialRetirement = createRemoteCredentialRetirement({
    configuration: options.configuration,
    credentialStore: options.credentialStore,
    ownsCredentialRef: options.ownsCredentialRef,
    readLiveCredentialRefs: async () =>
      new Set(
        (await readProfileEntries()).flatMap((entry) => {
          const profile = readEntry(entry);
          return profile.credentialRef === undefined
            ? []
            : [profile.credentialRef];
        }),
      ),
  });

  const catalog: RemoteConnectionProfileCatalog = {
    async list() {
      return (await readProfileEntries())
        .map((entry) => projectRemoteConnectionProfile(readEntry(entry)))
        .sort((left, right) => left.profileId.localeCompare(right.profileId));
    },
    async read(profileId) {
      const key = remoteConnectionProfileKey(profileId);
      const entry = await options.configuration.getConfigEntry(key);
      return entry === null
        ? null
        : projectRemoteConnectionProfile(readEntry(entry));
    },
    async resolveCredential(profileId) {
      const key = remoteConnectionProfileKey(profileId);
      const entry = await options.configuration.getConfigEntry(key);
      if (entry === null) return null;
      const profile = readEntry(entry);
      if (profile.credentialRef === undefined) return null;
      return await options.credentialResolver.resolve(profile.credentialRef);
    },
    async reconcileCredentialRetirement() {
      return await serializeMutation(credentialRetirement.reconcile);
    },
    async save(input) {
      return await serializeMutation(async () => {
        await credentialRetirement.reconcile();
        return await saveProfile(input);
      });
    },
    async remove(profileId) {
      await serializeMutation(async () => {
        await credentialRetirement.reconcile();
        await removeProfile(profileId);
      });
    },
  };
  return Object.freeze(catalog);

  async function saveProfile(
    input: SaveRemoteConnectionProfileInput,
  ): Promise<RemoteConnectionProfile> {
    const profileId = normalizeProfileId(input.profileId);
    const name = normalizeProfileName(input.name);
    const endpoint = normalizeRemoteEndpoint(input.endpoint);
    const key = remoteConnectionProfileKey(profileId);
    const current = await options.configuration.getConfigEntry(key);
    const previous = current === null ? undefined : readEntry(current);
    const timestamp = now();
    let nextCredentialRef = previous?.credentialRef;
    let createdCredentialRef: string | undefined;
    let createdCredentialValue: string | undefined;
    if (input.credential !== undefined) {
      if (input.credential === null) {
        nextCredentialRef = undefined;
      } else {
        normalizeRemoteCredential(input.credential);
        createdCredentialRef = options.createCredentialRef({
          profileId,
          revisionId: createRevisionId(),
        });
        createdCredentialValue = input.credential;
        nextCredentialRef = createdCredentialRef;
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
    const retiredRef =
      previous?.credentialRef !== undefined &&
      previous.credentialRef !== next.credentialRef
        ? previous.credentialRef
        : undefined;
    let retirement = await credentialRetirement.read();
    if (createdCredentialRef !== undefined) {
      retirement = await stageCredentialRef(
        retirement,
        createdCredentialRef,
        profileId,
      );
      const credentialValue = createdCredentialValue;
      if (credentialValue === undefined) {
        throw new Error("remote connection credential staging is invalid");
      }
      try {
        await options.credentialStore.put({
          ref: createdCredentialRef,
          value: credentialValue,
        });
      } catch (error) {
        await credentialRetirement.reconcile().catch(() => {});
        throw error;
      }
    }
    const nextRetirement = credentialRetirement.addRef(retirement, retiredRef);
    try {
      const result = await options.configuration.compareAndApplyConfigMutations(
        {
          conditions: [
            { key, expectedRevision: current?.revision ?? null },
            ...credentialRetirement.condition(retirement),
          ],
          puts: [
            { key, value: toStoredRemoteConnectionProfileJson(next) },
            ...credentialRetirement.puts(nextRetirement),
          ],
          deletes: credentialRetirement.deletes(nextRetirement),
        },
      );
      if (result.kind === "conflict") {
        throw new RemoteConnectionProfileConflictError(profileId);
      }
    } catch (error) {
      if (createdCredentialRef !== undefined) {
        await credentialRetirement.reconcile().catch(() => {});
      }
      throw error;
    }

    await credentialRetirement.reconcile();
    return projectRemoteConnectionProfile(next);
  }

  async function stageCredentialRef(
    retirement: Awaited<ReturnType<typeof credentialRetirement.read>>,
    ref: string,
    profileId: string,
  ): Promise<Awaited<ReturnType<typeof credentialRetirement.read>>> {
    const refs = credentialRetirement.addRef(retirement, ref);
    try {
      return await credentialRetirement.apply(retirement, refs);
    } catch (error) {
      if (error instanceof RemoteCredentialRetirementConflictError) {
        throw new RemoteConnectionProfileConflictError(profileId);
      }
      throw error;
    }
  }

  async function removeProfile(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeProfileId(profileId);
    const key = remoteConnectionProfileKey(normalizedProfileId);
    const current = await options.configuration.getConfigEntry(key);
    if (current === null) return;
    const previous = readEntry(current);
    const retirement = await credentialRetirement.read();
    const nextRetirement = credentialRetirement.addRef(
      retirement,
      previous.credentialRef,
    );
    const result = await options.configuration.compareAndApplyConfigMutations({
      conditions: [
        { key, expectedRevision: current.revision },
        ...credentialRetirement.condition(retirement),
      ],
      puts: credentialRetirement.puts(nextRetirement),
      deletes: [key, ...credentialRetirement.deletes(nextRetirement)],
    });
    if (result.kind === "conflict") {
      throw new RemoteConnectionProfileConflictError(normalizedProfileId);
    }
    await credentialRetirement.reconcile();
  }

  async function readProfileEntries(): Promise<ConfigurationEntry[]> {
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
    return entries;
  }

  function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function readEntry(entry: ConfigurationEntry): StoredRemoteConnectionProfile {
    const profile = parseStoredRemoteConnectionProfile(entry.value);
    if (remoteConnectionProfileKey(profile.profileId) !== entry.key) {
      throw new Error("remote connection profile key does not match its id");
    }
    if (
      profile.credentialRef !== undefined &&
      !options.ownsCredentialRef(profile.credentialRef)
    ) {
      throw new Error("remote connection credential reference is not owned");
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
