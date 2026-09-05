import { describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort,
} from "@wanex/runtime/secrets"
import type {
  ConditionalConfigMutationRequest,
  ConfigEntryRecord,
  ConfigMutationRequest,
  CoreStore,
  ListConfigEntriesRequest,
} from "@wanex/storage"
import {
  wanexLocalCredentialPolicy,
  type WanexLocalCredentialPolicy,
} from "@wanex/local-credential-store"
import {
  createLocalMcpManagement,
  createLocalMcpSettings,
  decodeLocalMcpServerEntry,
  encodeLocalMcpServerDefinition,
  localMcpServerKey,
  type LocalMcpGenerationController,
  type LocalMcpServerDefinition,
  type LocalMcpSettingsSaveServerRequest,
} from "../src/mcp/index.js"
import {
  createLocalMcpCredentialCoordinator,
  LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY,
  LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY,
  LOCAL_MCP_CREDENTIAL_SETUP_PREFIX,
} from "../src/mcp/settings/credentials.js"

const SERVER_ID = "product-tools"
const NAMESPACE = "a".repeat(64)

describe("Assistant Host MCP settings", () => {
  it("stages a write-only credential without returning its value or reference", async () => {
    const fixture = createFixture()

    const result = await fixture.settings.stageCredential({
      serverId: SERVER_ID,
      transport: "streamable_http",
      name: "Authorization",
      value: "Bearer private-token",
    })

    expect(result).toMatchObject({
      kind: "assistant-host.mcp-credential-setup",
      setupId: expect.any(String),
      expiresAt: expect.any(Number),
    })
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "kind", "setupId"])
    expect(JSON.stringify(result)).not.toContain("private-token")
    expect(JSON.stringify(result)).not.toContain(`${fixture.secrets.scheme}://`)
    expect(fixture.secrets.values()).toEqual(["Bearer private-token"])
  })

  it("binds a setup to one server, transport, and normalized slot name", async () => {
    const fixture = createFixture()
    const setup = await stageCredential(fixture)

    await expect(fixture.settings.saveServer(saveRequest(setup.setupId, {
      serverId: "other-tools",
    }))).rejects.toThrow("does not match its target")
    await expect(fixture.settings.saveServer(saveRequest(setup.setupId, {
      transport: {
        kind: "stdio",
        command: "node",
        args: [],
        cwd: "/workspace",
        environment: [{
          name: "AUTHORIZATION",
          source: { kind: "credential", setupId: setup.setupId },
        }],
      },
    }))).rejects.toThrow("does not match its target")
  })

  it("rejects expired and unavailable setups", async () => {
    let now = 1_000
    const expired = createFixture({ now: () => now })
    const expiredSetup = await stageCredential(expired)
    now = expiredSetup.expiresAt
    const coordinator = createLocalMcpCredentialCoordinator({
      storage: expired.storage,
      credentialStore: expired.secrets,
      credentialPolicy: expired.policy,
      now: () => now,
    })
    await expect(coordinator.resolveSetup({
      setupId: expiredSetup.setupId,
      serverId: SERVER_ID,
      transport: "streamable_http",
      name: "authorization",
    })).rejects.toThrow("has expired")

    const unavailable = createFixture()
    const unavailableSetup = await stageCredential(unavailable)
    await unavailable.secrets.delete(unavailable.secrets.refs()[0]!)
    await expect(unavailable.settings.saveServer(
      saveRequest(unavailableSetup.setupId)
    )).rejects.toThrow("is unavailable")
  })

  it("consumes a setup after a successful save and preserves its active secret", async () => {
    const fixture = createFixture()
    const setup = await stageCredential(fixture)

    const result = await fixture.settings.saveServer(saveRequest(setup.setupId))

    expect(result).toMatchObject({
      kind: "applied",
      credentialCleanupPending: false,
    })
    expect(fixture.storage.keys(LOCAL_MCP_CREDENTIAL_SETUP_PREFIX)).toEqual([])
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY)).toBeNull()
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toBeNull()
    const definition = fixture.storage.definition(SERVER_ID)
    expect(credentialRefs(definition)).toEqual(fixture.secrets.refs())
    expect(fixture.secrets.values()).toEqual(["Bearer private-token"])
  })

  it("cleans a staged secret after a save conflict without retiring the active secret", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })
    const setup = await stageCredential(fixture)

    const result = await fixture.settings.saveServer(saveRequest(setup.setupId, {
      expectedRevision: 2,
    }))

    expect(result).toMatchObject({
      kind: "conflict",
      currentRevision: 1,
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).toEqual([oldRef])
    expect(fixture.secrets.values()).toEqual(["old-token"])
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toBeNull()
  })

  it("retires the previous credential after replacement and after removal", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })
    const setup = await stageCredential(fixture)

    const replaced = await fixture.settings.saveServer(saveRequest(setup.setupId, {
      expectedRevision: 1,
    }))
    expect(replaced).toMatchObject({
      kind: "applied",
      credentialCleanupPending: false,
    })
    const newRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    expect(newRef).not.toBe(oldRef)
    expect(fixture.secrets.refs()).toEqual([newRef])

    const removed = await fixture.settings.removeServer({
      serverId: SERVER_ID,
      expectedRevision: 2,
    })
    expect(removed).toMatchObject({
      kind: "applied",
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).toEqual([])
  })

  it("durably retries failed secret deletion without blocking the applied config", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })
    fixture.secrets.failDelete(oldRef)
    const setup = await stageCredential(fixture)

    const result = await fixture.settings.saveServer(saveRequest(setup.setupId, {
      expectedRevision: 1,
    }))

    expect(result).toMatchObject({
      kind: "applied",
      credentialCleanupPending: true,
    })
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toEqual({
      kind: "assistant-host.mcp-credential-retirement",
      refs: [oldRef],
    })
    fixture.secrets.allowDelete(oldRef)
    await expect(fixture.settings.reconcileCredentials()).resolves.toEqual({
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).not.toContain(oldRef)
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toBeNull()
  })

  it("recovers an interrupted applied mutation from durable intent", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })
    const setup = await stageCredential(fixture)
    const setupRecord = fixture.storage.entry(
      `${LOCAL_MCP_CREDENTIAL_SETUP_PREFIX}${setup.setupId}`
    )!
    const stagedRef = (setupRecord.value as { secretRef: string }).secretRef
    await fixture.storage.applyConfigMutations({
      puts: [{
        key: LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY,
        value: mutationIntent(setup.setupId, stagedRef, oldRef),
      }, {
        key: localMcpServerKey(SERVER_ID),
        value: encodeLocalMcpServerDefinition(activeDefinition("new", stagedRef)),
      }],
      deletes: [],
    })

    const restarted = createSettings(fixture)
    await expect(restarted.reconcileCredentials()).resolves.toEqual({
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).toEqual([stagedRef])
    expect(fixture.storage.keys(LOCAL_MCP_CREDENTIAL_SETUP_PREFIX)).toEqual([])
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY)).toBeNull()
  })

  it("recovers an interrupted conflicted mutation by preserving the old active secret", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })
    const setup = await stageCredential(fixture)
    const setupRecord = fixture.storage.entry(
      `${LOCAL_MCP_CREDENTIAL_SETUP_PREFIX}${setup.setupId}`
    )!
    const stagedRef = (setupRecord.value as { secretRef: string }).secretRef
    await fixture.storage.applyConfigMutations({
      puts: [{
        key: LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY,
        value: mutationIntent(setup.setupId, stagedRef, oldRef),
      }],
      deletes: [],
    })

    const restarted = createSettings(fixture)
    await expect(restarted.reconcileCredentials()).resolves.toEqual({
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).toEqual([oldRef])
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toBeNull()
  })

  it("preserves hidden connection fields during a metadata-only update", async () => {
    const definition = activeDefinition("old")
    const fixture = createFixture({ initialDefinition: definition })

    const result = await fixture.settings.updateServer({
      serverId: SERVER_ID,
      expectedRevision: 1,
      label: "Renamed tools",
    })

    expect(result).toMatchObject({
      kind: "applied",
      credentialCleanupPending: false,
    })
    expect(fixture.storage.definition(SERVER_ID)).toEqual({
      ...definition,
      label: "Renamed tools",
    })
  })

  it("does not retire an active credential after a remove conflict", async () => {
    const fixture = createFixture({ initialDefinition: activeDefinition("old") })
    const oldRef = credentialRefs(fixture.storage.definition(SERVER_ID))[0]!
    await fixture.secrets.put({ ref: oldRef, value: "old-token" })

    const result = await fixture.settings.removeServer({
      serverId: SERVER_ID,
      expectedRevision: 2,
    })

    expect(result).toMatchObject({
      kind: "conflict",
      credentialCleanupPending: false,
    })
    expect(fixture.secrets.refs()).toEqual([oldRef])
    expect(fixture.storage.value(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)).toBeNull()
  })

  it("fails closed for malformed setup and foreign retirement records", async () => {
    const malformed = createFixture()
    await malformed.storage.applyConfigMutations({
      puts: [{
        key: `${LOCAL_MCP_CREDENTIAL_SETUP_PREFIX}valid_setup_id_1234`,
        value: {
          kind: "assistant-host.mcp-credential-setup",
          unexpected: true,
        },
      }],
      deletes: [],
    })
    await expect(malformed.settings.reconcileCredentials()).rejects.toThrow(
      "unsupported fields"
    )

    const foreign = createFixture()
    await foreign.storage.applyConfigMutations({
      puts: [{
        key: LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY,
        value: {
          kind: "assistant-host.mcp-credential-retirement",
          refs: ["other-secret://foreign/value"],
        },
      }],
      deletes: [],
    })
    await expect(foreign.settings.reconcileCredentials()).rejects.toThrow(
      "non-Host-owned reference"
    )
  })

  it("fails closed when stored server configuration exceeds the supported limit", async () => {
    const fixture = createFixture()
    await fixture.storage.applyConfigMutations({
      puts: Array.from({ length: 33 }, (_, index) => {
        const serverId = `server-${index}`
        return {
          key: localMcpServerKey(serverId),
          value: encodeLocalMcpServerDefinition({
            ...activeDefinition(`limit-${index}`),
            serverId,
            transport: {
              kind: "streamable_http" as const,
              url: "https://example.test/mcp",
              headers: [],
            },
          }),
        }
      }),
      deletes: [],
    })

    await expect(fixture.settings.reconcileCredentials()).rejects.toThrow(
      "exceeds the supported limit"
    )
  })
})

function createFixture(options: {
  readonly initialDefinition?: LocalMcpServerDefinition
  readonly now?: () => number
} = {}) {
  const storage = new MemoryConfigStorage(options.initialDefinition)
  const secrets = new MemorySecretStore()
  const policy = wanexLocalCredentialPolicy({
    namespace: NAMESPACE,
    scheme: secrets.scheme,
  })
  const controller = fakeController()
  const management = createLocalMcpManagement({ storage, controller })
  const fixture = {
    storage,
    secrets,
    policy,
    management,
    now: options.now,
    settings: undefined as unknown as ReturnType<typeof createLocalMcpSettings>,
  }
  fixture.settings = createSettings(fixture)
  return fixture
}

function createSettings(fixture: {
  readonly storage: MemoryConfigStorage
  readonly secrets: MemorySecretStore
  readonly policy: WanexLocalCredentialPolicy
  readonly management: ReturnType<typeof createLocalMcpManagement>
  readonly now: (() => number) | undefined
}) {
  return createLocalMcpSettings({
    storage: fixture.storage,
    management: fixture.management,
    credentialStore: fixture.secrets,
    credentialPolicy: fixture.policy,
    ...(fixture.now === undefined ? {} : { now: fixture.now }),
  })
}

async function stageCredential(fixture: ReturnType<typeof createFixture>) {
  return await fixture.settings.stageCredential({
    serverId: SERVER_ID,
    transport: "streamable_http",
    name: "Authorization",
    value: "Bearer private-token",
  })
}

function saveRequest(
  setupId: string,
  overrides: Partial<LocalMcpSettingsSaveServerRequest> = {}
): LocalMcpSettingsSaveServerRequest {
  return {
    serverId: SERVER_ID,
    expectedRevision: null,
    label: "Product tools",
    enabled: true,
    connectTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    transport: {
      kind: "streamable_http",
      url: "https://example.test/mcp",
      headers: [{
        name: "Authorization",
        source: { kind: "credential", setupId },
      }],
    },
    ...overrides,
  }
}

function activeDefinition(
  revision: string,
  ref = `${new MemorySecretStore().scheme}://${NAMESPACE}/mcp.${revision}`
): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId: SERVER_ID,
    label: "Product tools",
    enabled: true,
    capabilityRevision: `settings-${revision}`,
    connectTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    transport: {
      kind: "streamable_http",
      url: "https://example.test/private-mcp",
      headers: [{
        name: "authorization",
        source: { kind: "credential", ref },
      }, {
        name: "x-product-scope",
        source: { kind: "literal", value: "private" },
      }],
    },
  }
}

function credentialRefs(definition: LocalMcpServerDefinition): string[] {
  const values = definition.transport.kind === "stdio"
    ? definition.transport.environment
    : definition.transport.headers
  return values.flatMap((value) =>
    value.source.kind === "credential" ? [value.source.ref] : []
  )
}

function mutationIntent(
  setupId: string,
  stagedSecretRef: string,
  retiredSecretRef: string
): JsonValue {
  return {
    kind: "assistant-host.mcp-credential-mutation",
    serverId: SERVER_ID,
    setupIds: [setupId],
    stagedSecretRefs: [stagedSecretRef],
    retiredSecretRefs: [retiredSecretRef],
  }
}

class MemoryConfigStorage implements Pick<
  CoreStore,
  | "applyConfigMutations"
  | "compareAndApplyConfigMutations"
  | "getConfig"
  | "getConfigEntry"
  | "listConfigEntries"
> {
  private readonly entries = new Map<string, ConfigEntryRecord>()

  constructor(initialDefinition?: LocalMcpServerDefinition) {
    if (initialDefinition !== undefined) {
      this.write(localMcpServerKey(initialDefinition.serverId),
        encodeLocalMcpServerDefinition(initialDefinition))
    }
  }

  async applyConfigMutations(request: ConfigMutationRequest): Promise<void> {
    for (const put of request.puts) this.write(put.key, put.value)
    for (const key of request.deletes) this.entries.delete(key)
  }

  async compareAndApplyConfigMutations(
    request: ConditionalConfigMutationRequest
  ) {
    const conflicts = request.conditions.flatMap((condition) => {
      const current = this.entries.get(condition.key) ?? null
      return current?.revision === condition.expectedRevision ||
        current === null && condition.expectedRevision === null
        ? []
        : [{
            key: condition.key,
            expectedRevision: condition.expectedRevision,
            current,
          }]
    })
    if (conflicts.length > 0) return { kind: "conflict" as const, conflicts }
    for (const put of request.puts) this.write(put.key, put.value)
    for (const key of request.deletes) this.entries.delete(key)
    return {
      kind: "applied" as const,
      entries: request.puts.map((put) => this.entries.get(put.key)!),
    }
  }

  async getConfig(key: string): Promise<JsonValue | null> {
    return this.entries.get(key)?.value ?? null
  }

  async getConfigEntry(key: string): Promise<ConfigEntryRecord | null> {
    return this.entries.get(key) ?? null
  }

  async listConfigEntries(
    request: ListConfigEntriesRequest
  ): Promise<ConfigEntryRecord[]> {
    return [...this.entries.values()]
      .filter((entry) => entry.key.startsWith(request.prefix))
      .filter((entry) => request.afterKey === undefined || entry.key > request.afterKey)
      .sort((left, right) => left.key.localeCompare(right.key))
      .slice(0, request.limit)
  }

  definition(serverId: string): LocalMcpServerDefinition {
    const entry = this.entries.get(localMcpServerKey(serverId))
    if (entry === undefined) throw new Error("test MCP definition is missing")
    return decodeLocalMcpServerEntry(entry)
  }

  entry(key: string): ConfigEntryRecord | undefined {
    return this.entries.get(key)
  }

  keys(prefix: string): string[] {
    return [...this.entries.keys()].filter((key) => key.startsWith(prefix)).sort()
  }

  value(key: string): JsonValue | null {
    return this.entries.get(key)?.value ?? null
  }

  private write(key: string, value: JsonValue): void {
    const revision = (this.entries.get(key)?.revision ?? 0) + 1
    this.entries.set(key, {
      key,
      value,
      revision,
      updatedAt: revision,
    })
  }
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly stored = new Map<string, string>()
  private readonly rejectedDeletes = new Set<string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.stored.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    if (this.rejectedDeletes.has(ref)) throw new Error("test deletion failed")
    this.stored.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.stored.get(ref)
    if (value === undefined) throw new Error("test credential is unavailable")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }

  failDelete(ref: string): void {
    this.rejectedDeletes.add(ref)
  }

  allowDelete(ref: string): void {
    this.rejectedDeletes.delete(ref)
  }

  refs(): string[] {
    return [...this.stored.keys()].sort()
  }

  values(): string[] {
    return [...this.stored.values()].sort()
  }
}

function fakeController(): LocalMcpGenerationController {
  return {
    resolve: () => undefined,
    observeTurnLifecycle() {},
    async reload() {
      return { outcome: "published", status: [] }
    },
    status: () => [],
    async dispose() {},
  }
}
