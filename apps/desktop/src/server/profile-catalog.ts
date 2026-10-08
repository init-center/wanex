import type { LocalConfigurationPort } from "@wanex/assistant-host";
import type {
  ResolvedSecret,
  SecretResolverPort,
  SecretStorePort,
} from "@wanex/runtime/secrets";
import {
  createDesktopServerCredentialRetirement,
  DesktopServerCredentialRetirementConflictError,
} from "./credential-retirement.js";
import {
  normalizeServerProfileId,
  normalizeServerProfileName,
  normalizeServerCredential,
  normalizeServerUrl,
  parseStoredDesktopServerProfile,
  projectDesktopServerProfile,
  DESKTOP_SERVER_PROFILE_CONFIG_PREFIX,
  desktopServerProfileKey,
  toStoredDesktopServerProfileJson,
  type DesktopServerProfile,
  type SaveDesktopServerProfileInput,
  type StoredDesktopServerProfile,
} from "./profile.js";

type ConfigurationEntry = NonNullable<
  Awaited<ReturnType<LocalConfigurationPort["getConfigEntry"]>>
>;

export interface DesktopServerProfileCatalog {
  list(): Promise<readonly DesktopServerProfile[]>;
  read(profileId: string): Promise<DesktopServerProfile | null>;
  resolveCredential(profileId: string): Promise<ResolvedSecret | null>;
  reconcileCredentialRetirement(): Promise<boolean>;
  save(
    input: SaveDesktopServerProfileInput,
  ): Promise<DesktopServerProfile>;
  remove(profileId: string): Promise<void>;
}

export { DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY } from "./credential-retirement.js";

export interface DesktopServerProfileCatalogOptions {
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
export class DesktopServerProfileConflictError extends Error {
  readonly code = "desktop_server_profile_conflict" as const;

  constructor(profileId: string) {
    super(`server profile changed while updating: ${profileId}`);
    this.name = "DesktopServerProfileConflictError";
  }
}

export function createDesktopServerProfileCatalog(
  options: DesktopServerProfileCatalogOptions,
): DesktopServerProfileCatalog {
  const now = options.now ?? Date.now;
  const createRevisionId = options.createRevisionId ?? defaultRevisionId;
  let mutationTail = Promise.resolve();
  const credentialRetirement = createDesktopServerCredentialRetirement({
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

  const catalog: DesktopServerProfileCatalog = {
    async list() {
      return (await readProfileEntries())
        .map((entry) => projectDesktopServerProfile(readEntry(entry)))
        .sort((left, right) => left.profileId.localeCompare(right.profileId));
    },
    async read(profileId) {
      const key = desktopServerProfileKey(profileId);
      const entry = await options.configuration.getConfigEntry(key);
      return entry === null
        ? null
        : projectDesktopServerProfile(readEntry(entry));
    },
    async resolveCredential(profileId) {
      const key = desktopServerProfileKey(profileId);
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
    input: SaveDesktopServerProfileInput,
  ): Promise<DesktopServerProfile> {
    const profileId = normalizeServerProfileId(input.profileId);
    const name = normalizeServerProfileName(input.name);
    const serverUrl = normalizeServerUrl(input.serverUrl);
    const key = desktopServerProfileKey(profileId);
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
        normalizeServerCredential(input.credential);
        createdCredentialRef = options.createCredentialRef({
          profileId,
          revisionId: createRevisionId(),
        });
        createdCredentialValue = input.credential;
        nextCredentialRef = createdCredentialRef;
      }
    }

    const next: StoredDesktopServerProfile = {
      kind: "wanex.desktop.server-profile",
      profileId,
      name,
      serverUrl,
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
        throw new Error("server credential staging is invalid");
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
            { key, value: toStoredDesktopServerProfileJson(next) },
            ...credentialRetirement.puts(nextRetirement),
          ],
          deletes: credentialRetirement.deletes(nextRetirement),
        },
      );
      if (result.kind === "conflict") {
        throw new DesktopServerProfileConflictError(profileId);
      }
    } catch (error) {
      if (createdCredentialRef !== undefined) {
        await credentialRetirement.reconcile().catch(() => {});
      }
      throw error;
    }

    await credentialRetirement.reconcile();
    return projectDesktopServerProfile(next);
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
      if (error instanceof DesktopServerCredentialRetirementConflictError) {
        throw new DesktopServerProfileConflictError(profileId);
      }
      throw error;
    }
  }

  async function removeProfile(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeServerProfileId(profileId);
    const key = desktopServerProfileKey(normalizedProfileId);
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
      throw new DesktopServerProfileConflictError(normalizedProfileId);
    }
    await credentialRetirement.reconcile();
  }

  async function readProfileEntries(): Promise<ConfigurationEntry[]> {
    const entries: ConfigurationEntry[] = [];
    let afterKey: string | undefined;
    for (;;) {
      const page = await options.configuration.listConfigEntries({
        prefix: DESKTOP_SERVER_PROFILE_CONFIG_PREFIX,
        limit: PROFILE_PAGE_SIZE,
        ...(afterKey === undefined ? {} : { afterKey }),
      });
      entries.push(...page);
      if (entries.length > MAX_PROFILE_COUNT) {
        throw new Error("server profile catalog is too large");
      }
      if (page.length < PROFILE_PAGE_SIZE) break;
      const nextAfterKey = page.at(-1)?.key;
      if (nextAfterKey === undefined || nextAfterKey === afterKey) {
        throw new Error("server profile listing did not advance");
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

  function readEntry(entry: ConfigurationEntry): StoredDesktopServerProfile {
    const profile = parseStoredDesktopServerProfile(entry.value);
    if (desktopServerProfileKey(profile.profileId) !== entry.key) {
      throw new Error("server profile key does not match its id");
    }
    if (
      profile.credentialRef !== undefined &&
      !options.ownsCredentialRef(profile.credentialRef)
    ) {
      throw new Error("server credential reference is not owned");
    }
    return profile;
  }
}

function defaultRevisionId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("server profile requires crypto.randomUUID");
  }
  return randomUuid.call(globalThis.crypto);
}
