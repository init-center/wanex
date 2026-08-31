import type {
  LocalConfigurationCondition,
  LocalConfigurationPort,
  LocalConfigurationPut,
} from "@wanex/assistant-host";
import type { SecretStorePort } from "@wanex/runtime/secrets";

type ConfigurationEntry = NonNullable<
  Awaited<ReturnType<LocalConfigurationPort["getConfigEntry"]>>
>;

const RETIREMENT_KIND = "wanex.desktop.remote-credential-retirement" as const;
const MAX_RETIREMENT_COUNT = 1_024;
const MAX_REFERENCE_BYTES = 2_048;

export const REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY =
  "wanex.desktop.remote-credential-retirement" as const;

export interface RemoteCredentialRetirementSnapshot {
  readonly entry: ConfigurationEntry | null;
  readonly refs: readonly string[];
}

export interface RemoteCredentialRetirement {
  read(): Promise<RemoteCredentialRetirementSnapshot>;
  addRef(
    snapshot: RemoteCredentialRetirementSnapshot,
    ref: string | undefined,
  ): readonly string[];
  apply(
    snapshot: RemoteCredentialRetirementSnapshot,
    refs: readonly string[],
  ): Promise<RemoteCredentialRetirementSnapshot>;
  condition(
    snapshot: RemoteCredentialRetirementSnapshot,
  ): readonly LocalConfigurationCondition[];
  puts(refs: readonly string[]): readonly LocalConfigurationPut[];
  deletes(refs: readonly string[]): readonly string[];
  reconcile(): Promise<boolean>;
}

export class RemoteCredentialRetirementConflictError extends Error {
  readonly code = "remote_credential_retirement_conflict" as const;

  constructor() {
    super("remote credential retirement changed while updating");
    this.name = "RemoteCredentialRetirementConflictError";
  }
}

export function createRemoteCredentialRetirement(options: {
  readonly configuration: LocalConfigurationPort;
  readonly credentialStore: Pick<SecretStorePort, "delete">;
  readonly ownsCredentialRef: (ref: string) => boolean;
  readonly readLiveCredentialRefs: () => Promise<ReadonlySet<string>>;
}): RemoteCredentialRetirement {
  const retirement: RemoteCredentialRetirement = {
    read,
    addRef,
    apply,
    condition,
    puts,
    deletes,
    reconcile,
  };
  return Object.freeze(retirement);

  async function read(): Promise<RemoteCredentialRetirementSnapshot> {
    const entry = await options.configuration.getConfigEntry(
      REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY,
    );
    return {
      entry,
      refs: entry === null ? [] : parse(entry.value).refs,
    };
  }

  function addRef(
    snapshot: RemoteCredentialRetirementSnapshot,
    ref: string | undefined,
  ): readonly string[] {
    if (ref === undefined) return snapshot.refs;
    assertOwned(ref);
    const refs = [...new Set([...snapshot.refs, ref])].sort();
    if (refs.length > MAX_RETIREMENT_COUNT) {
      throw new Error("remote credential retirement backlog is full");
    }
    return refs;
  }

  async function apply(
    snapshot: RemoteCredentialRetirementSnapshot,
    refs: readonly string[],
  ): Promise<RemoteCredentialRetirementSnapshot> {
    const result = await options.configuration.compareAndApplyConfigMutations({
      conditions: condition(snapshot),
      puts: puts(refs),
      deletes: deletes(refs),
    });
    if (result.kind === "conflict") {
      throw new RemoteCredentialRetirementConflictError();
    }
    if (refs.length === 0) {
      return { entry: null, refs: [] };
    }
    const entry = result.entries.find(
      (candidate) =>
        candidate.key === REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY,
    );
    if (entry === undefined) {
      throw new Error(
        "remote credential retirement write did not return its entry",
      );
    }
    return { entry, refs: [...refs] };
  }

  function condition(
    snapshot: RemoteCredentialRetirementSnapshot,
  ): readonly LocalConfigurationCondition[] {
    return [
      {
        key: REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY,
        expectedRevision: snapshot.entry?.revision ?? null,
      },
    ];
  }

  function puts(refs: readonly string[]): readonly LocalConfigurationPut[] {
    return refs.length === 0
      ? []
      : [
          {
            key: REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY,
            value: {
              kind: RETIREMENT_KIND,
              refs: [...refs],
            },
          },
        ];
  }

  function deletes(refs: readonly string[]): readonly string[] {
    return refs.length === 0
      ? [REMOTE_CONNECTION_CREDENTIAL_RETIREMENT_KEY]
      : [];
  }

  async function reconcile(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await read();
      if (snapshot.entry === null) return false;
      const liveRefs = await options.readLiveCredentialRefs();
      const retained: string[] = [];
      for (const ref of snapshot.refs) {
        assertOwned(ref);
        if (liveRefs.has(ref)) continue;
        try {
          await options.credentialStore.delete(ref);
        } catch {
          retained.push(ref);
        }
      }
      try {
        await apply(snapshot, retained);
        return retained.length > 0;
      } catch (error) {
        if (!(error instanceof RemoteCredentialRetirementConflictError)) {
          throw error;
        }
      }
    }
    throw new RemoteCredentialRetirementConflictError();
  }

  function assertOwned(ref: string): void {
    if (!options.ownsCredentialRef(ref)) {
      throw new Error("remote credential reference is not owned");
    }
  }
}

function parse(value: unknown): { readonly refs: readonly string[] } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("kind" in value) ||
    !("refs" in value)
  ) {
    throw new Error("remote credential retirement record is invalid");
  }
  const record = value as { readonly kind?: unknown; readonly refs?: unknown };
  if (
    record.kind !== RETIREMENT_KIND ||
    !Array.isArray(record.refs) ||
    record.refs.length === 0 ||
    record.refs.length > MAX_RETIREMENT_COUNT ||
    !record.refs.every(
      (ref) =>
        typeof ref === "string" &&
        ref.length > 0 &&
        Buffer.byteLength(ref, "utf8") <= MAX_REFERENCE_BYTES,
    )
  ) {
    throw new Error("remote credential retirement record is invalid");
  }
  const refs = record.refs as string[];
  if (
    new Set(refs).size !== refs.length ||
    [...refs].sort().some((ref, index) => ref !== refs[index])
  ) {
    throw new Error("remote credential retirement record is not canonical");
  }
  return { refs };
}
