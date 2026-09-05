import type { JsonValue } from "@wanex/protocol"
import type { SecretStorePort } from "@wanex/runtime/secrets"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import type { WanexLocalCredentialPolicy } from "@wanex/local-credential-store"
import {
  decodeLocalMcpServerEntry,
} from "../codec.js"
import { MAX_LOCAL_MCP_SERVERS } from "../definition-store.js"
import { LOCAL_MCP_SERVER_PREFIX } from "../identity.js"
import type {
  LocalMcpCredentialSetupRequest,
  LocalMcpCredentialSetupResult,
  LocalMcpSettingsTransportKind,
} from "./model.js"

export const LOCAL_MCP_CREDENTIAL_SETUP_PREFIX =
  "assistant-host.mcp.credential-setup."
export const LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY =
  "assistant-host.mcp.credential-mutation-intent"
export const LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY =
  "assistant-host.mcp.credential-retirement"

const CREDENTIAL_SETUP_TTL_MS = 10 * 60 * 1_000
const MAX_CREDENTIAL_BYTES = 16 * 1_024
const MAX_CREDENTIAL_SETUPS = 128
const MAX_RETIREMENT_REFS = 256

interface CredentialSetup {
  readonly setupId: string
  readonly serverId: string
  readonly transport: LocalMcpSettingsTransportKind
  readonly name: string
  readonly secretRef: string
  readonly expiresAt: number
  readonly entry: ConfigEntryRecord
}

interface CredentialMutationIntent {
  readonly serverId: string
  readonly setupIds: readonly string[]
  readonly stagedSecretRefs: readonly string[]
  readonly retiredSecretRefs: readonly string[]
}

export interface LocalMcpCredentialCoordinator {
  stageCredential(
    request: LocalMcpCredentialSetupRequest
  ): Promise<LocalMcpCredentialSetupResult>
  resolveSetup(request: {
    readonly setupId: string
    readonly serverId: string
    readonly transport: LocalMcpSettingsTransportKind
    readonly name: string
  }): Promise<{ readonly setupId: string; readonly secretRef: string }>
  beginMutation(request: CredentialMutationIntent): Promise<void>
  reconcile(): Promise<{ readonly credentialCleanupPending: boolean }>
}

export function createLocalMcpCredentialCoordinator(options: {
  readonly storage: Pick<
    CoreStore,
    | "applyConfigMutations"
    | "compareAndApplyConfigMutations"
    | "getConfig"
    | "getConfigEntry"
    | "listConfigEntries"
  >
  readonly credentialStore: SecretStorePort
  readonly credentialPolicy: WanexLocalCredentialPolicy
  readonly createSetupId?: () => string
  readonly createRevisionId?: () => string
  readonly now?: () => number
}): LocalMcpCredentialCoordinator {
  if (options.credentialStore.scheme !== options.credentialPolicy.scheme) {
    throw new Error("MCP credential policy scheme must match its store")
  }
  const now = options.now ?? Date.now

  return {
    async stageCredential(request) {
      await reconcile()
      const serverId = normalizeServerId(request.serverId)
      const transport = normalizeTransport(request.transport)
      const name = normalizeSlotName(request.name, transport)
      const value = normalizeCredential(request.value)
      const setupId = normalizeSetupId(
        (options.createSetupId ?? cryptoRandomId)()
      )
      const revisionId = normalizeRevisionId(
        (options.createRevisionId ?? cryptoRandomId)()
      )
      const secretRef = options.credentialPolicy.createRef({
        connectionId: `mcp:${serverId}:${transport}:${name}`,
        revisionId,
      })
      const expiresAt = now() + CREDENTIAL_SETUP_TTL_MS
      const key = credentialSetupKey(setupId)
      const applied = await options.storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision: null }],
        puts: [{
          key,
          value: credentialSetupToJson({
            setupId,
            serverId,
            transport,
            name,
            secretRef,
            expiresAt,
          }),
        }],
        deletes: [],
      })
      if (applied.kind === "conflict") {
        throw new Error("MCP credential setup identity collided")
      }
      try {
        await options.credentialStore.put({ ref: secretRef, value })
      } catch {
        await options.storage.compareAndApplyConfigMutations({
          conditions: [{ key, expectedRevision: applied.entries[0]!.revision }],
          puts: [],
          deletes: [key],
        }).catch(() => undefined)
        throw new Error("MCP credential could not be stored")
      }
      return {
        kind: "assistant-host.mcp-credential-setup",
        setupId,
        expiresAt,
      }
    },

    async resolveSetup(request) {
      const setupId = normalizeSetupId(request.setupId)
      const setup = await readCredentialSetup(
        options.storage,
        credentialSetupKey(setupId)
      )
      if (
        setup.serverId !== normalizeServerId(request.serverId) ||
        setup.transport !== normalizeTransport(request.transport) ||
        setup.name !== normalizeSlotName(request.name, request.transport)
      ) {
        throw new Error("MCP credential setup does not match its target")
      }
      if (setup.expiresAt <= now()) {
        throw new Error("MCP credential setup has expired")
      }
      if (!options.credentialPolicy.ownsRef(setup.secretRef)) {
        throw new Error("MCP credential setup is not Host-owned")
      }
      try {
        const resolved = await options.credentialStore.resolve(setup.secretRef, {
          credentialId: `mcp:${setup.serverId}:${setup.name}`,
        })
        resolved.dispose()
      } catch {
        throw new Error("MCP credential setup is unavailable")
      }
      return { setupId, secretRef: setup.secretRef }
    },

    async beginMutation(request) {
      await reconcile()
      const intent = normalizeMutationIntent(request, options.credentialPolicy)
      const applied = await options.storage.compareAndApplyConfigMutations({
        conditions: [{
          key: LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY,
          expectedRevision: null,
        }],
        puts: [{
          key: LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY,
          value: credentialMutationIntentToJson(intent),
        }],
        deletes: [],
      })
      if (applied.kind === "conflict") {
        throw new Error("MCP credential mutation recovery is required")
      }
    },

    reconcile,
  }

  async function reconcile(): Promise<{
    readonly credentialCleanupPending: boolean
  }> {
    const intentValue = await options.storage.getConfig(
      LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY
    )
    const intent = intentValue === null
      ? undefined
      : readCredentialMutationIntent(intentValue, options.credentialPolicy)
    const activeRefs = await readActiveCredentialRefs(options.storage)
    const setupEntries = await options.storage.listConfigEntries({
      prefix: LOCAL_MCP_CREDENTIAL_SETUP_PREFIX,
      limit: MAX_CREDENTIAL_SETUPS + 1,
    })
    if (setupEntries.length > MAX_CREDENTIAL_SETUPS) {
      throw new Error("MCP credential setup backlog is full")
    }
    const consumed = new Set(intent?.setupIds ?? [])
    const expired: CredentialSetup[] = []
    for (const entry of setupEntries) {
      const setup = readCredentialSetupEntry(entry)
      if (consumed.has(setup.setupId) || setup.expiresAt <= now()) {
        expired.push(setup)
      }
    }
    const existingRetirement = await readRetirement(
      options.storage,
      options.credentialPolicy
    )
    const retirement = new Set(existingRetirement)
    for (const ref of intent?.retiredSecretRefs ?? []) retirement.add(ref)
    for (const ref of intent?.stagedSecretRefs ?? []) {
      if (!activeRefs.has(ref)) retirement.add(ref)
    }
    for (const setup of expired) {
      if (!activeRefs.has(setup.secretRef)) retirement.add(setup.secretRef)
    }
    if (retirement.size > MAX_RETIREMENT_REFS) {
      throw new Error("MCP credential retirement backlog is full")
    }
    const deletes = [
      ...(intent === undefined ? [] : [LOCAL_MCP_CREDENTIAL_MUTATION_INTENT_KEY]),
      ...expired.map((setup) => setup.entry.key),
    ]
    await options.storage.applyConfigMutations({
      puts: retirement.size === 0
        ? []
        : [{
            key: LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY,
            value: credentialRetirementToJson([...retirement].sort()),
          }],
      deletes: [
        ...deletes,
        ...(retirement.size === 0
          ? [LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY]
          : []),
      ],
    })
    const retained: string[] = []
    for (const ref of [...retirement].sort()) {
      if (activeRefs.has(ref)) {
        continue
      }
      try {
        await options.credentialStore.delete(ref)
      } catch {
        retained.push(ref)
      }
    }
    await options.storage.applyConfigMutations({
      puts: retained.length === 0
        ? []
        : [{
            key: LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY,
            value: credentialRetirementToJson(retained),
          }],
      deletes: retained.length === 0
        ? [LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY]
        : [],
    })
    return { credentialCleanupPending: retained.length > 0 }
  }
}

function credentialSetupKey(setupId: string): string {
  return `${LOCAL_MCP_CREDENTIAL_SETUP_PREFIX}${setupId}`
}

async function readCredentialSetup(
  storage: Pick<CoreStore, "getConfigEntry">,
  key: string
): Promise<CredentialSetup> {
  const entry = await storage.getConfigEntry(key)
  if (entry === null) throw new Error("MCP credential setup was not found")
  return readCredentialSetupEntry(entry)
}

function readCredentialSetupEntry(entry: ConfigEntryRecord): CredentialSetup {
  const value = requiredRecord(entry.value, "MCP credential setup")
  exactKeys(value, [
    "expiresAt",
    "kind",
    "name",
    "secretRef",
    "serverId",
    "setupId",
    "transport",
  ], "MCP credential setup")
  if (value.kind !== "assistant-host.mcp-credential-setup") {
    throw new Error("MCP credential setup kind is invalid")
  }
  const setupId = normalizeSetupId(value.setupId)
  if (entry.key !== credentialSetupKey(setupId)) {
    throw new Error("MCP credential setup key does not match its value")
  }
  const transport = normalizeTransport(value.transport)
  return {
    setupId,
    serverId: normalizeServerId(value.serverId),
    transport,
    name: normalizeSlotName(value.name, transport),
    secretRef: boundedString(value.secretRef, "MCP credential reference", 2_048),
    expiresAt: positiveSafeInteger(value.expiresAt, "MCP credential expiry"),
    entry,
  }
}

function credentialSetupToJson(
  setup: Omit<CredentialSetup, "entry">
): JsonValue {
  return {
    kind: "assistant-host.mcp-credential-setup",
    setupId: setup.setupId,
    serverId: setup.serverId,
    transport: setup.transport,
    name: setup.name,
    secretRef: setup.secretRef,
    expiresAt: setup.expiresAt,
  }
}

function normalizeMutationIntent(
  intent: CredentialMutationIntent,
  policy: WanexLocalCredentialPolicy
): CredentialMutationIntent {
  const setupIds = uniqueStrings(
    intent.setupIds.map(normalizeSetupId),
    MAX_CREDENTIAL_SETUPS,
    "MCP credential mutation setups"
  )
  const stagedSecretRefs = uniqueOwnedRefs(
    intent.stagedSecretRefs,
    policy,
    MAX_CREDENTIAL_SETUPS,
    "MCP staged credentials"
  )
  if (setupIds.length !== stagedSecretRefs.length) {
    throw new Error("MCP credential mutation setup evidence is incomplete")
  }
  return {
    serverId: normalizeServerId(intent.serverId),
    setupIds,
    stagedSecretRefs,
    retiredSecretRefs: uniqueOwnedRefs(
      intent.retiredSecretRefs,
      policy,
      MAX_RETIREMENT_REFS,
      "MCP retired credentials"
    ),
  }
}

function credentialMutationIntentToJson(intent: CredentialMutationIntent): JsonValue {
  return {
    kind: "assistant-host.mcp-credential-mutation",
    serverId: intent.serverId,
    setupIds: [...intent.setupIds],
    stagedSecretRefs: [...intent.stagedSecretRefs],
    retiredSecretRefs: [...intent.retiredSecretRefs],
  }
}

function readCredentialMutationIntent(
  value: JsonValue,
  policy: WanexLocalCredentialPolicy
): CredentialMutationIntent {
  const record = requiredRecord(value, "MCP credential mutation intent")
  exactKeys(record, [
    "kind",
    "retiredSecretRefs",
    "serverId",
    "setupIds",
    "stagedSecretRefs",
  ], "MCP credential mutation intent")
  if (record.kind !== "assistant-host.mcp-credential-mutation") {
    throw new Error("MCP credential mutation intent kind is invalid")
  }
  return normalizeMutationIntent({
    serverId: record.serverId as string,
    setupIds: stringArray(record.setupIds, "MCP setup IDs"),
    stagedSecretRefs: stringArray(
      record.stagedSecretRefs,
      "MCP staged credential refs"
    ),
    retiredSecretRefs: stringArray(
      record.retiredSecretRefs,
      "MCP retired credential refs"
    ),
  }, policy)
}

async function readActiveCredentialRefs(
  storage: Pick<CoreStore, "listConfigEntries">
): Promise<Set<string>> {
  const entries = await storage.listConfigEntries({
    prefix: LOCAL_MCP_SERVER_PREFIX,
    limit: MAX_LOCAL_MCP_SERVERS + 1,
  })
  if (entries.length > MAX_LOCAL_MCP_SERVERS) {
    throw new Error("MCP server configuration exceeds the supported limit")
  }
  const refs = new Set<string>()
  for (const entry of entries) {
    try {
      const definition = decodeLocalMcpServerEntry(entry)
      const values = definition.transport.kind === "stdio"
        ? definition.transport.environment
        : definition.transport.headers
      for (const value of values) {
        if (value.source.kind === "credential") refs.add(value.source.ref)
      }
    } catch {
      // An invalid definition is unusable and must be repaired with new setups.
    }
  }
  return refs
}

async function readRetirement(
  storage: Pick<CoreStore, "getConfig">,
  policy: WanexLocalCredentialPolicy
): Promise<readonly string[]> {
  const value = await storage.getConfig(LOCAL_MCP_CREDENTIAL_RETIREMENT_KEY)
  if (value === null) return []
  const record = requiredRecord(value, "MCP credential retirement")
  exactKeys(record, ["kind", "refs"], "MCP credential retirement")
  if (record.kind !== "assistant-host.mcp-credential-retirement") {
    throw new Error("MCP credential retirement kind is invalid")
  }
  return uniqueOwnedRefs(
    stringArray(record.refs, "MCP credential retirement refs"),
    policy,
    MAX_RETIREMENT_REFS,
    "MCP credential retirement refs"
  )
}

function credentialRetirementToJson(refs: readonly string[]): JsonValue {
  return {
    kind: "assistant-host.mcp-credential-retirement",
    refs: [...refs],
  }
}

function normalizeServerId(value: unknown): string {
  const normalized = boundedString(value, "MCP server ID", 64)
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(normalized)) {
    throw new Error("MCP server ID is invalid")
  }
  return normalized
}

function normalizeTransport(value: unknown): LocalMcpSettingsTransportKind {
  if (value !== "stdio" && value !== "streamable_http") {
    throw new Error("MCP credential transport is invalid")
  }
  return value
}

function normalizeSlotName(
  value: unknown,
  transport: LocalMcpSettingsTransportKind
): string {
  const name = boundedString(value, "MCP credential name", 256)
  if (transport === "stdio") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
      throw new Error("MCP environment name is invalid")
    }
    return name
  }
  const normalized = name.toLowerCase()
  if (!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/u.test(normalized)) {
    throw new Error("MCP header name is invalid")
  }
  return normalized
}

function normalizeCredential(value: unknown): string {
  const credential = boundedString(
    value,
    "MCP credential",
    MAX_CREDENTIAL_BYTES,
    false
  )
  if (credential.length === 0) throw new Error("MCP credential is empty")
  return credential
}

function normalizeSetupId(value: unknown): string {
  const setupId = boundedString(value, "MCP credential setup ID", 64)
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(setupId)) {
    throw new Error("MCP credential setup ID is invalid")
  }
  return setupId
}

function normalizeRevisionId(value: unknown): string {
  const revisionId = boundedString(value, "MCP credential revision ID", 64)
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(revisionId)) {
    throw new Error("MCP credential revision ID is invalid")
  }
  return revisionId
}

function uniqueOwnedRefs(
  values: readonly string[],
  policy: WanexLocalCredentialPolicy,
  limit: number,
  label: string
): readonly string[] {
  const refs = uniqueStrings(values, limit, label)
  if (refs.some((ref) => !policy.ownsRef(ref))) {
    throw new Error(`${label} contain a non-Host-owned reference`)
  }
  return refs
}

function uniqueStrings(
  values: readonly string[],
  limit: number,
  label: string
): readonly string[] {
  if (values.length > limit) throw new Error(`${label} exceed the limit`)
  const normalized = values.map((value) => boundedString(value, label, 2_048))
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} contain duplicates`)
  }
  return Object.freeze([...normalized].sort())
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} are invalid`)
  }
  return value
}

function requiredRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void {
  const expected = new Set(keys)
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw new Error(`${label} has unsupported fields`)
  }
}

function boundedString(
  value: unknown,
  label: string,
  maxBytes: number,
  trim = true
): string {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new Error(`${label} is invalid`)
  }
  const normalized = trim ? value.trim() : value
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} is invalid`)
  }
  return value as number
}

function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID()
}
