import { describe, expect, it } from "vitest";
import type {
  LocalConfigurationCondition,
  LocalConfigurationEntry,
  LocalConfigurationMutationResult,
  LocalConfigurationPort,
  LocalConfigurationPut,
} from "@wanex/assistant-host";
import type { SecretStorePort } from "@wanex/runtime/secrets";
import type { ResolvedSecret } from "@wanex/runtime/secrets";
import {
  createDesktopServerProfileCatalog,
  DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY,
  DesktopServerProfileConflictError,
} from "../src/server/profile-catalog.js";
import {
  desktopServerProfileKey,
  parseStoredDesktopServerProfile,
} from "../src/server/profile.js";

describe("Desktop remote connection profiles", () => {
  it("stores metadata in Configuration and the credential in the secret store", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    const saved = await catalog.save({
      profileId: "office",
      name: "Office machine",
      serverUrl: "https://coding.example.test/",
      credential: "remote-secret",
    });

    expect(saved).toMatchObject({
      profileId: "office",
      name: "Office machine",
      serverUrl: "https://coding.example.test/",
      credentialConfigured: true,
    });
    const raw = configuration.entries.get(desktopServerProfileKey("office"));
    expect(raw).toBeDefined();
    expect(JSON.stringify(raw?.value)).not.toContain("remote-secret");
    expect(JSON.stringify(saved)).not.toContain("credentialRef");
    expect(credentials.values.size).toBe(1);
  });

  it("rotates credentials only after a conditional metadata write succeeds", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "studio",
      name: "Studio",
      serverUrl: "https://studio.example.test/",
      credential: "first-secret",
    });
    const firstRef = [...credentials.values.keys()][0];
    if (firstRef === undefined) throw new Error("first credential is missing");

    await catalog.save({
      profileId: "studio",
      name: "Studio desk",
      serverUrl: "https://studio.example.test/",
      credential: "second-secret",
    });

    expect(credentials.values.size).toBe(1);
    expect(credentials.values.has(firstRef)).toBe(false);
    expect(await catalog.read("studio")).toMatchObject({
      name: "Studio desk",
      credentialConfigured: true,
    });
  });

  it("durably retries old credential cleanup after metadata succeeds", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "retry",
      name: "Retry",
      serverUrl: "https://retry.example.test/",
      credential: "first-secret",
    });
    const firstRef = [...credentials.values.keys()][0];
    if (firstRef === undefined) throw new Error("first credential is missing");
    credentials.failDeletes.add(firstRef);

    await catalog.save({
      profileId: "retry",
      name: "Retry updated",
      serverUrl: "https://retry.example.test/",
      credential: "second-secret",
    });

    expect(await catalog.read("retry")).toMatchObject({
      name: "Retry updated",
    });
    expect(
      configuration.entries.has(DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY),
    ).toBe(true);
    expect(credentials.values.has(firstRef)).toBe(true);

    credentials.failDeletes.delete(firstRef);
    await expect(catalog.reconcileCredentialRetirement()).resolves.toBe(false);
    expect(credentials.values.has(firstRef)).toBe(false);
    expect(
      configuration.entries.has(DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY),
    ).toBe(false);
  });

  it("keeps credential retirement durable when removing a profile fails to delete", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "remove-retry",
      name: "Remove retry",
      serverUrl: "https://remove-retry.example.test/",
      credential: "remove-secret",
    });
    const ref = [...credentials.values.keys()][0];
    if (ref === undefined) throw new Error("remove credential is missing");
    credentials.failDeletes.add(ref);

    await catalog.remove("remove-retry");

    expect(await catalog.read("remove-retry")).toBeNull();
    expect(
      configuration.entries.has(DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY),
    ).toBe(true);
    credentials.failDeletes.delete(ref);
    await catalog.reconcileCredentialRetirement();
    expect(credentials.values.has(ref)).toBe(false);
  });

  it("resolves a credential only through the stored reference", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "resolved",
      name: "Resolved",
      serverUrl: "https://resolved.example.test/",
      credential: "resolved-secret",
    });

    const secret = await catalog.resolveCredential("resolved");
    expect(secret?.reveal()).toBe("resolved-secret");
    secret?.dispose();
    expect(await catalog.resolveCredential("missing")).toBeNull();
  });

  it("cleans a newly written credential when the metadata revision conflicts", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "shared",
      name: "Shared host",
      serverUrl: "https://shared.example.test/",
      credential: "stable-secret",
    });
    const before = await catalog.read("shared");
    configuration.conflictNextKey = desktopServerProfileKey("shared");

    await expect(
      catalog.save({
        profileId: "shared",
        name: "Conflicting update",
        serverUrl: "https://shared.example.test/",
        credential: "temporary-secret",
      }),
    ).rejects.toBeInstanceOf(DesktopServerProfileConflictError);

    expect(await catalog.read("shared")).toEqual(before);
    expect(credentials.values.size).toBe(1);
    expect([...credentials.values.values()]).toEqual(["stable-secret"]);
  });

  it("retains a staged credential candidate when conflict cleanup fails", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "staged-retry",
      name: "Staged retry",
      serverUrl: "https://staged-retry.example.test/",
      credential: "stable-secret",
    });
    const stagedRef = "wanex-keychain://test/staged-retry.revision-2";
    credentials.failDeletes.add(stagedRef);
    configuration.conflictNextKey = desktopServerProfileKey("staged-retry");

    await expect(
      catalog.save({
        profileId: "staged-retry",
        name: "Conflicting staged update",
        serverUrl: "https://staged-retry.example.test/",
        credential: "temporary-secret",
      }),
    ).rejects.toBeInstanceOf(DesktopServerProfileConflictError);

    expect(credentials.values.get(stagedRef)).toBe("temporary-secret");
    expect(
      configuration.entries.has(DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY),
    ).toBe(true);

    credentials.failDeletes.delete(stagedRef);
    await catalog.reconcileCredentialRetirement();
    expect(credentials.values.has(stagedRef)).toBe(false);
    expect(
      configuration.entries.has(DESKTOP_SERVER_CREDENTIAL_RETIREMENT_KEY),
    ).toBe(false);
  });

  it("removes the profile before deleting its credential", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "temporary",
      name: "Temporary",
      serverUrl: "https://temporary.example.test/",
      credential: "temporary-secret",
    });
    await catalog.remove("temporary");

    expect(await catalog.read("temporary")).toBeNull();
    expect(credentials.values.size).toBe(0);
  });

  it("rejects non-HTTPS endpoints and malformed persisted records", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await expect(
      catalog.save({
        profileId: "insecure",
        name: "Insecure",
        serverUrl: "http://localhost:8080/agent-host",
      }),
    ).rejects.toThrow("HTTPS");
    expect(() =>
      parseStoredDesktopServerProfile({
        kind: "wanex.desktop.server-profile",
        profileId: "bad",
        name: "Bad",
        serverUrl: "https://bad.example.test",
        createdAt: 1,
        updatedAt: 1,
        unexpected: true,
      }),
    ).toThrow("invalid");
  });

  it("reads the complete profile catalog across bounded storage pages", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    for (let index = 0; index < 101; index += 1) {
      const profileId = `machine-${String(index).padStart(3, "0")}`;
      await catalog.save({
        profileId,
        name: profileId,
        serverUrl: `https://${profileId}.example.test/`,
      });
    }

    const profiles = await catalog.list();
    expect(profiles).toHaveLength(101);
    expect(profiles[0]?.profileId).toBe("machine-000");
    expect(profiles.at(-1)?.profileId).toBe("machine-100");
    expect(configuration.listRequests).toHaveLength(2);
    expect(configuration.listRequests[1]?.afterKey).toBe(
      desktopServerProfileKey("machine-099"),
    );
  });

  it("rejects non-canonical persisted profile values", () => {
    expect(() =>
      parseStoredDesktopServerProfile({
        kind: "wanex.desktop.server-profile",
        profileId: "canonical",
        name: " Canonical",
        serverUrl: "https://canonical.example.test/",
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow("canonical");
  });
});

function createCatalog(
  configuration: MemoryConfiguration,
  credentials: MemoryCredentials,
) {
  let revision = 0;
  return createDesktopServerProfileCatalog({
    configuration,
    credentialStore: credentials,
    credentialResolver: credentials,
    ownsCredentialRef: (ref) => ref.startsWith("wanex-keychain://test/"),
    createCredentialRef: ({ profileId, revisionId }) =>
      `wanex-keychain://test/${profileId}.${revisionId}`,
    createRevisionId: () => `revision-${++revision}`,
    now: () => revision,
  });
}

class MemoryConfiguration implements LocalConfigurationPort {
  readonly entries = new Map<string, LocalConfigurationEntry>();
  readonly listRequests: {
    readonly prefix: string;
    readonly afterKey?: string;
    readonly limit?: number;
  }[] = [];
  conflictNextKey: string | undefined;

  async getConfig(
    key: string,
  ): Promise<LocalConfigurationEntry["value"] | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async getConfigEntry(key: string): Promise<LocalConfigurationEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async listConfigEntries(request: {
    readonly prefix: string;
    readonly afterKey?: string;
    readonly limit?: number;
  }): Promise<LocalConfigurationEntry[]> {
    this.listRequests.push(request);
    const entries = [...this.entries.values()]
      .filter((entry) => entry.key.startsWith(request.prefix))
      .sort((left, right) => left.key.localeCompare(right.key));
    const afterKey = request.afterKey;
    const start =
      afterKey === undefined
        ? 0
        : entries.findIndex((entry) => entry.key > afterKey);
    const offset = start < 0 ? entries.length : start;
    return entries.slice(
      offset,
      request.limit === undefined ? undefined : offset + request.limit,
    );
  }

  async compareAndApplyConfigMutations(request: {
    readonly conditions: readonly LocalConfigurationCondition[];
    readonly puts: readonly LocalConfigurationPut[];
    readonly deletes: readonly string[];
  }): Promise<LocalConfigurationMutationResult> {
    if (
      this.conflictNextKey !== undefined &&
      request.puts.some((put) => put.key === this.conflictNextKey)
    ) {
      this.conflictNextKey = undefined;
      return {
        kind: "conflict",
        conflicts: request.conditions.map((condition) => ({
          key: condition.key,
          expectedRevision: condition.expectedRevision,
          current: this.entries.get(condition.key) ?? null,
        })),
      };
    }
    const conflicts = request.conditions.filter(
      (condition) =>
        (this.entries.get(condition.key)?.revision ?? null) !==
        condition.expectedRevision,
    );
    if (conflicts.length > 0) {
      return {
        kind: "conflict",
        conflicts: conflicts.map((condition) => ({
          key: condition.key,
          expectedRevision: condition.expectedRevision,
          current: this.entries.get(condition.key) ?? null,
        })),
      };
    }
    for (const key of request.deletes) this.entries.delete(key);
    const applied: LocalConfigurationEntry[] = [];
    for (const put of request.puts) {
      const entry = {
        key: put.key,
        value: put.value,
        revision: (this.entries.get(put.key)?.revision ?? 0) + 1,
        updatedAt: Date.now(),
      };
      this.entries.set(put.key, entry);
      applied.push(entry);
    }
    return { kind: "applied", entries: applied };
  }
}

class MemoryCredentials
  implements
    Pick<SecretStorePort, "put" | "delete">,
    Pick<SecretStorePort, "resolve">
{
  readonly values = new Map<string, string>();
  readonly failDeletes = new Set<string>();

  async put(request: {
    readonly ref: string;
    readonly value: string;
  }): Promise<void> {
    this.values.set(request.ref, request.value);
  }

  async delete(ref: string): Promise<void> {
    if (this.failDeletes.has(ref)) throw new Error("credential delete failed");
    this.values.delete(ref);
  }

  async resolve(ref: string): Promise<ResolvedSecret> {
    const value = this.values.get(ref);
    if (value === undefined) throw new Error("credential is missing");
    let disposed = false;
    return {
      ref,
      provider: "test",
      get disposed() {
        return disposed;
      },
      reveal() {
        if (disposed) throw new Error("credential is disposed");
        return value;
      },
      dispose() {
        disposed = true;
      },
      toJSON() {
        throw new Error("credential must not be serialized");
      },
    };
  }
}
