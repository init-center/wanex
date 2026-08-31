import { describe, expect, it } from "vitest";
import type {
  LocalConfigurationCondition,
  LocalConfigurationEntry,
  LocalConfigurationMutationResult,
  LocalConfigurationPort,
  LocalConfigurationPut,
} from "@wanex/assistant-host";
import type { SecretStorePort } from "@wanex/runtime/secrets";
import {
  createRemoteConnectionProfileCatalog,
  RemoteConnectionProfileConflictError,
} from "../src/remote/profiles.js";
import {
  remoteConnectionProfileKey,
  parseStoredRemoteConnectionProfile,
} from "../src/remote/profile.js";

describe("Desktop remote connection profiles", () => {
  it("stores metadata in Configuration and the credential in the secret store", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    const saved = await catalog.save({
      profileId: "office",
      name: "Office machine",
      endpoint: "https://coding.example.test/v1/agent-host/message",
      credential: "remote-secret",
    });

    expect(saved).toMatchObject({
      profileId: "office",
      name: "Office machine",
      endpoint: "https://coding.example.test/v1/agent-host/message",
      credentialConfigured: true,
    });
    const raw = configuration.entries.get(remoteConnectionProfileKey("office"));
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
      endpoint: "https://studio.example.test/agent-host",
      credential: "first-secret",
    });
    const firstRef = [...credentials.values.keys()][0];
    if (firstRef === undefined) throw new Error("first credential is missing");

    await catalog.save({
      profileId: "studio",
      name: "Studio desk",
      endpoint: "https://studio.example.test/agent-host",
      credential: "second-secret",
    });

    expect(credentials.values.size).toBe(1);
    expect(credentials.values.has(firstRef)).toBe(false);
    expect(await catalog.read("studio")).toMatchObject({
      name: "Studio desk",
      credentialConfigured: true,
    });
  });

  it("cleans a newly written credential when the metadata revision conflicts", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "shared",
      name: "Shared host",
      endpoint: "https://shared.example.test/agent-host",
      credential: "stable-secret",
    });
    const before = await catalog.read("shared");
    configuration.conflictNextWrite = true;

    await expect(catalog.save({
      profileId: "shared",
      name: "Conflicting update",
      endpoint: "https://shared.example.test/agent-host",
      credential: "temporary-secret",
    })).rejects.toBeInstanceOf(RemoteConnectionProfileConflictError);

    expect(await catalog.read("shared")).toEqual(before);
    expect(credentials.values.size).toBe(1);
    expect([...credentials.values.values()]).toEqual(["stable-secret"]);
  });

  it("removes the profile before deleting its credential", async () => {
    const configuration = new MemoryConfiguration();
    const credentials = new MemoryCredentials();
    const catalog = createCatalog(configuration, credentials);

    await catalog.save({
      profileId: "temporary",
      name: "Temporary",
      endpoint: "https://temporary.example.test/agent-host",
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

    await expect(catalog.save({
      profileId: "insecure",
      name: "Insecure",
      endpoint: "http://localhost:8080/agent-host",
    })).rejects.toThrow("HTTPS");
    expect(() => parseStoredRemoteConnectionProfile({
      kind: "wanex.desktop.remote-connection",
      profileId: "bad",
      name: "Bad",
      endpoint: "https://bad.example.test",
      createdAt: 1,
      updatedAt: 1,
      unexpected: true,
    })).toThrow("invalid");
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
        endpoint: `https://${profileId}.example.test/agent-host`,
      });
    }

    const profiles = await catalog.list();
    expect(profiles).toHaveLength(101);
    expect(profiles[0]?.profileId).toBe("machine-000");
    expect(profiles.at(-1)?.profileId).toBe("machine-100");
    expect(configuration.listRequests).toHaveLength(2);
    expect(configuration.listRequests[1]?.afterKey).toBe(
      remoteConnectionProfileKey("machine-099"),
    );
  });

  it("rejects non-canonical persisted profile values", () => {
    expect(() => parseStoredRemoteConnectionProfile({
      kind: "wanex.desktop.remote-connection",
      profileId: "canonical",
      name: " Canonical",
      endpoint: "https://canonical.example.test",
      createdAt: 1,
      updatedAt: 1,
    })).toThrow("canonical");
  });
});

function createCatalog(
  configuration: MemoryConfiguration,
  credentials: MemoryCredentials,
) {
  let revision = 0;
  return createRemoteConnectionProfileCatalog({
    configuration,
    credentialStore: credentials,
    createCredentialRef: ({ profileId, revisionId }) =>
      `wanex-keychain://test/${profileId}.${revisionId}`,
    createRevisionId: () => `revision-${++revision}`,
    now: () => revision,
  });
}

class MemoryConfiguration implements LocalConfigurationPort {
  readonly entries = new Map<string, LocalConfigurationEntry>();
  readonly listRequests: { readonly prefix: string; readonly afterKey?: string; readonly limit?: number }[] = [];
  conflictNextWrite = false;

  async getConfig(key: string): Promise<LocalConfigurationEntry["value"] | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async getConfigEntry(key: string): Promise<LocalConfigurationEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async listConfigEntries(request: { readonly prefix: string; readonly afterKey?: string; readonly limit?: number }): Promise<LocalConfigurationEntry[]> {
    this.listRequests.push(request);
    const entries = [...this.entries.values()]
      .filter((entry) => entry.key.startsWith(request.prefix))
      .sort((left, right) => left.key.localeCompare(right.key));
    const afterKey = request.afterKey;
    const start = afterKey === undefined
      ? 0
      : entries.findIndex((entry) => entry.key > afterKey);
    const offset = start < 0 ? entries.length : start;
    return entries.slice(offset, request.limit === undefined ? undefined : offset + request.limit);
  }

  async compareAndApplyConfigMutations(request: {
    readonly conditions: readonly LocalConfigurationCondition[];
    readonly puts: readonly LocalConfigurationPut[];
    readonly deletes: readonly string[];
  }): Promise<LocalConfigurationMutationResult> {
    if (this.conflictNextWrite) {
      this.conflictNextWrite = false;
      return {
        kind: "conflict",
        conflicts: request.conditions.map((condition) => ({
          key: condition.key,
          expectedRevision: condition.expectedRevision,
          current: this.entries.get(condition.key) ?? null,
        })),
      };
    }
    const conflicts = request.conditions.filter((condition) =>
      (this.entries.get(condition.key)?.revision ?? null) !== condition.expectedRevision,
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

class MemoryCredentials implements Pick<SecretStorePort, "put" | "delete"> {
  readonly values = new Map<string, string>();

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.values.set(request.ref, request.value);
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref);
  }
}
