import { randomUUID } from "node:crypto"
import type { JsonValue, ModelEndpoint } from "@wanex/protocol"
import {
  modelEndpointDigest,
  readModelEndpoint
} from "@wanex/runtime/provider"
import type { SecretStorePort } from "@wanex/runtime/secrets"
import type { CoreStore } from "@wanex/storage"
import type {
  WanexAppModelEndpointCommands,
  WanexAppModelEndpointReadModel
} from "./types-model-endpoint.js"

export const WANEX_APP_PROVIDER_MUTATION_INTENT_KEY =
  "wanex-app.providerMutation.intent"
export const WANEX_APP_CREDENTIAL_RETIREMENT_KEY =
  "wanex-app.providerMutation.credentialRetirement"

const CREDENTIAL_RETIREMENT_LIMIT = 256
const ENDPOINT_LIMIT = 16

interface ProviderReplaceIntent {
  readonly kind: "wanex-app.provider-mutation.replace"
  readonly connectionId: string
  readonly stagedSecretRef: string
  readonly retiredSecretRefs: readonly string[]
  readonly endpoints: readonly ProviderEndpointEvidence[]
}

interface ProviderRemoveIntent {
  readonly kind: "wanex-app.provider-mutation.remove"
  readonly connectionId: string
  readonly retiredSecretRefs: readonly string[]
  readonly endpoints: readonly ProviderEndpointEvidence[]
}

interface ProviderEndpointEvidence {
  readonly id: string
  readonly digest: string
}

type ProviderMutationIntent = ProviderReplaceIntent | ProviderRemoveIntent

type ModelEndpointReadModel = Awaited<
  ReturnType<WanexAppModelEndpointCommands["listModelEndpoints"]>
>["endpoints"][number]

export interface WanexAppProviderReplaceResult {
  readonly endpoints: readonly ModelEndpointReadModel[]
  readonly credentialCleanupPending: boolean
}

export interface WanexAppProviderRemoveResult {
  readonly connectionId: string
  readonly removedEndpointIds: readonly string[]
  readonly activeEndpointId?: string
  readonly credentialCleanupPending: boolean
}

export interface WanexAppProviderCredentialPolicy {
  readonly scheme: string
  createRef(input: {
    readonly connectionId: string
    readonly revisionId: string
  }): string
  ownsRef(ref: string): boolean
}

export interface WanexAppProviderMutationCoordinator {
  reconcilePending(): Promise<{
    readonly mutationDisposition: "none" | "committed" | "rolled-back"
    readonly credentialCleanupPending: boolean
  }>
  replace(
    request: WanexAppProviderReplaceRequest
  ): Promise<WanexAppProviderReplaceResult>
  remove(request: {
    readonly connectionId: string
  }): Promise<WanexAppProviderRemoveResult>
}

export interface WanexAppProviderReplaceRequest {
  readonly credential?: string
  readonly connectionId: string
  readonly modelEndpoints: readonly ModelEndpoint[]
  readonly makeActiveEndpointId?: string
  readonly activateByDefault?: boolean
}

export function createWanexAppProviderMutationCoordinator(options: {
  readonly storage: CoreStore
  readonly modelEndpoints: WanexAppModelEndpointCommands
  readonly credentialStore: SecretStorePort
  readonly credentialPolicy: WanexAppProviderCredentialPolicy
  readonly createRevisionId?: () => string
}): WanexAppProviderMutationCoordinator {
  let tail = Promise.resolve()
  const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
    const run = tail.then(operation, operation)
    tail = run.then(() => undefined, () => undefined)
    return await run
  }
  if (options.credentialStore.scheme !== options.credentialPolicy.scheme) {
    throw new Error("Provider credential policy scheme must match its store")
  }
  const ownsRef = (ref: string) => options.credentialPolicy.ownsRef(ref)

  const readConnectionEndpoints = async (
    connectionId: string
  ): Promise<readonly ModelEndpoint[]> => {
    const list = await options.modelEndpoints.listModelEndpoints()
    return (
      await Promise.all(list.endpoints.map((endpoint) =>
        readModelEndpoint(options.storage, endpoint.id)
      ))
    ).filter(
      (endpoint): endpoint is ModelEndpoint =>
        endpoint !== null && endpoint.connection.id === connectionId
    )
  }

  const queueRetirement = async (refs: readonly string[]): Promise<void> => {
    const existing = await readCredentialRetirement(options.storage)
    const retired = [...new Set([
      ...existing,
      ...refs.filter(ownsRef)
    ])].sort()
    if (retired.length > CREDENTIAL_RETIREMENT_LIMIT) {
      throw new Error("provider credential retirement backlog is full")
    }
    await options.storage.applyConfigMutations({
      puts: retired.length === 0
        ? []
        : [{
            key: WANEX_APP_CREDENTIAL_RETIREMENT_KEY,
            value: credentialRetirementToJson(retired)
          }],
      deletes: [WANEX_APP_PROVIDER_MUTATION_INTENT_KEY]
    })
  }

  const reconcileReplace = async (
    intent: ProviderReplaceIntent
  ): Promise<"committed" | "rolled-back"> => {
    if (!ownsRef(intent.stagedSecretRef)) {
      throw new Error("provider mutation staged credential is not Host-owned")
    }
    const current = await readConnectionEndpoints(intent.connectionId)
    const expectedIds = intent.endpoints.map((endpoint) => endpoint.id).sort()
    const currentIds = current.map((endpoint) => endpoint.id).sort()
    const committed = sameStrings(currentIds, expectedIds) && intent.endpoints.every(
      (expected) => {
        const endpoint = current.find((candidate) => candidate.id === expected.id)
        return endpoint !== undefined &&
          endpoint.connection.secretRef === intent.stagedSecretRef &&
          modelEndpointDigest(endpoint) === expected.digest
      }
    )
    if (committed) {
      await queueRetirement(intent.retiredSecretRefs)
      return "committed"
    }
    if (current.some(
      (endpoint) => endpoint.connection.secretRef === intent.stagedSecretRef
    )) {
      throw new Error("provider replacement recovery is ambiguous")
    }
    await options.credentialStore.delete(intent.stagedSecretRef)
    await options.storage.applyConfigMutations({
      puts: [],
      deletes: [WANEX_APP_PROVIDER_MUTATION_INTENT_KEY]
    })
    return "rolled-back"
  }

  const reconcileRemove = async (
    intent: ProviderRemoveIntent
  ): Promise<"committed" | "rolled-back"> => {
    const current = await readConnectionEndpoints(intent.connectionId)
    if (current.length === 0) {
      await queueRetirement(intent.retiredSecretRefs)
      return "committed"
    }
    const unchanged = intent.endpoints.length === current.length &&
      intent.endpoints.every((expected) => {
        const endpoint = current.find((candidate) => candidate.id === expected.id)
        return endpoint !== undefined &&
          modelEndpointDigest(endpoint) === expected.digest
      })
    if (!unchanged) {
      throw new Error("provider removal recovery is ambiguous")
    }
    await options.storage.applyConfigMutations({
      puts: [],
      deletes: [WANEX_APP_PROVIDER_MUTATION_INTENT_KEY]
    })
    return "rolled-back"
  }

  const reconcileMutationIntent = async () => {
    const value = await options.storage.getConfig(
      WANEX_APP_PROVIDER_MUTATION_INTENT_KEY
    )
    if (value === null) return "none" as const
    const intent = readProviderMutationIntent(value)
    return intent.kind === "wanex-app.provider-mutation.replace"
      ? await reconcileReplace(intent)
      : await reconcileRemove(intent)
  }

  const drainCredentialRetirement = async (): Promise<boolean> => {
    const refs = await readCredentialRetirement(options.storage)
    if (refs.length === 0) return false
    const retained: string[] = []
    for (const ref of refs) {
      if (!ownsRef(ref)) {
        throw new Error("provider credential retirement ref is not Host-owned")
      }
      if (await options.storage.hasLiveSecretReference(ref)) {
        retained.push(ref)
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
            key: WANEX_APP_CREDENTIAL_RETIREMENT_KEY,
            value: credentialRetirementToJson(retained)
          }],
      deletes: retained.length === 0
        ? [WANEX_APP_CREDENTIAL_RETIREMENT_KEY]
        : []
    })
    return retained.length > 0
  }

  const reconcilePending = async () => {
    const mutationDisposition = await reconcileMutationIntent()
    const credentialCleanupPending = await drainCredentialRetirement()
    return { mutationDisposition, credentialCleanupPending }
  }

  return {
    reconcilePending: () => serialize(reconcilePending),
    replace: (request) => serialize(async () => {
      await reconcileMutationIntent()
      await bestEffortDrain(drainCredentialRetirement)
      assertReplacementRequest(request)

      const previous = await readConnectionEndpoints(request.connectionId)
      const previousRefs = uniqueSecretRefs(previous)
      const suppliedCredential = normalizeCredential(request.credential)
      if (previous.length === 0 && suppliedCredential === undefined) {
        throw new Error("new provider connection requires a credential")
      }
      if (suppliedCredential === undefined && previousRefs.length !== 1) {
        throw new Error("existing provider credential is ambiguous")
      }

      if (suppliedCredential === undefined) {
        const secretRef = previousRefs[0]!
        const endpoints = withSecretRef(request.modelEndpoints, secretRef)
        const written = await replaceConnectedEndpoints(
          options.modelEndpoints,
          request,
          endpoints
        )
        return {
          endpoints: written,
          credentialCleanupPending: await bestEffortCleanupPending(
            drainCredentialRetirement
          )
        }
      }

      const stagedSecretRef = options.credentialPolicy.createRef({
        connectionId: request.connectionId,
        revisionId: (options.createRevisionId ?? randomUUID)()
      })
      const endpoints = withSecretRef(request.modelEndpoints, stagedSecretRef)
      const intent: ProviderReplaceIntent = {
        kind: "wanex-app.provider-mutation.replace",
        connectionId: request.connectionId,
        stagedSecretRef,
        retiredSecretRefs: previousRefs.filter((ref) => ref !== stagedSecretRef),
        endpoints: endpointEvidence(endpoints)
      }
      await options.storage.putConfig(
        WANEX_APP_PROVIDER_MUTATION_INTENT_KEY,
        providerMutationIntentToJson(intent)
      )

      let written: readonly ModelEndpointReadModel[]
      try {
        await options.credentialStore.put({
          ref: stagedSecretRef,
          value: suppliedCredential
        })
        written = await replaceConnectedEndpoints(
          options.modelEndpoints,
          request,
          endpoints
        )
      } catch (error) {
        let disposition: "none" | "committed" | "rolled-back"
        try {
          disposition = await reconcileMutationIntent()
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            "provider replacement failed and requires durable recovery"
          )
        }
        if (disposition !== "committed") throw error
        written = await readCommittedEndpointModels(options.modelEndpoints, endpoints)
      }

      const credentialCleanupPending = await finishMutation(
        reconcileMutationIntent,
        drainCredentialRetirement
      )
      return { endpoints: written, credentialCleanupPending }
    }),
    remove: (request) => serialize(async () => {
      await reconcileMutationIntent()
      await bestEffortDrain(drainCredentialRetirement)
      const connectionId = normalizeConnectionId(request.connectionId)
      const previous = await readConnectionEndpoints(connectionId)
      if (previous.length === 0) {
        throw new Error("provider connection is not configured")
      }
      const intent: ProviderRemoveIntent = {
        kind: "wanex-app.provider-mutation.remove",
        connectionId,
        retiredSecretRefs: uniqueSecretRefs(previous),
        endpoints: endpointEvidence(previous)
      }
      await options.storage.putConfig(
        WANEX_APP_PROVIDER_MUTATION_INTENT_KEY,
        providerMutationIntentToJson(intent)
      )

      let removed: Awaited<
        ReturnType<
          WanexAppModelEndpointCommands["removeModelEndpointConnection"]
        >
      >
      try {
        removed = await options.modelEndpoints.removeModelEndpointConnection({
          connectionId
        })
      } catch (error) {
        let disposition: "none" | "committed" | "rolled-back"
        try {
          disposition = await reconcileMutationIntent()
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            "provider removal failed and requires durable recovery"
          )
        }
        if (disposition !== "committed") throw error
        const active = await options.modelEndpoints.readActiveModelEndpoint()
        removed = {
          connectionId,
          removedEndpointIds: previous.map((endpoint) => endpoint.id).sort(),
          ...(active === null ? {} : { activeEndpointId: active.id })
        }
      }

      const credentialCleanupPending = await finishMutation(
        reconcileMutationIntent,
        drainCredentialRetirement
      )
      return { ...removed, credentialCleanupPending }
    })
  }
}

async function replaceConnectedEndpoints(
  modelEndpoints: WanexAppModelEndpointCommands,
  request: {
    readonly connectionId: string
    readonly makeActiveEndpointId?: string
    readonly activateByDefault?: boolean
  },
  endpoints: readonly ModelEndpoint[]
): Promise<readonly ModelEndpointReadModel[]> {
  return await modelEndpoints.replaceConnectedModelEndpoints({
    connection: endpoints[0]!.connection,
    endpoints: endpoints.map(({ connection: _connection, ...endpoint }) => endpoint),
    ...(request.makeActiveEndpointId === undefined
      ? {}
      : { makeActiveEndpointId: request.makeActiveEndpointId }),
    ...(request.activateByDefault === undefined
      ? {}
      : { activateByDefault: request.activateByDefault })
  })
}

async function finishMutation(
  reconcile: () => Promise<"none" | "committed" | "rolled-back">,
  drain: () => Promise<boolean>
): Promise<boolean> {
  try {
    await reconcile()
    return await drain()
  } catch {
    return true
  }
}

async function bestEffortDrain(drain: () => Promise<boolean>): Promise<void> {
  try {
    await drain()
  } catch {
    // Cleanup is independent from a subsequent serialized mutation.
  }
}

async function bestEffortCleanupPending(
  drain: () => Promise<boolean>
): Promise<boolean> {
  try {
    return await drain()
  } catch {
    return true
  }
}

function assertReplacementRequest(request: {
  readonly connectionId: string
  readonly modelEndpoints: readonly ModelEndpoint[]
}): void {
  normalizeConnectionId(request.connectionId)
  if (
    request.modelEndpoints.length === 0 ||
    request.modelEndpoints.length > ENDPOINT_LIMIT
  ) {
    throw new Error("provider replacement requires 1 to 16 model endpoints")
  }
  const endpointIds = request.modelEndpoints.map((endpoint) => endpoint.id)
  if (new Set(endpointIds).size !== endpointIds.length) {
    throw new Error("provider replacement endpoint IDs must be unique")
  }
  if (request.modelEndpoints.some(
    (endpoint) => endpoint.connection.id !== request.connectionId
  )) {
    throw new Error("provider replacement endpoints must share the connection")
  }
}

function normalizeConnectionId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 256) {
    throw new Error("provider connection ID must contain 1 to 256 bytes")
  }
  return normalized
}

function normalizeCredential(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (normalized.length === 0) return undefined
  if (Buffer.byteLength(normalized, "utf8") > 16_384) {
    throw new Error("provider credential is too long")
  }
  return normalized
}

function withSecretRef(
  endpoints: readonly ModelEndpoint[],
  secretRef: string
): readonly ModelEndpoint[] {
  return endpoints.map((endpoint) => ({
    ...endpoint,
    connection: { ...endpoint.connection, secretRef }
  }))
}

function uniqueSecretRefs(endpoints: readonly ModelEndpoint[]): readonly string[] {
  return [...new Set(endpoints.flatMap((endpoint) =>
    endpoint.connection.secretRef === undefined
      ? []
      : [endpoint.connection.secretRef]
  ))].sort()
}

function endpointEvidence(
  endpoints: readonly ModelEndpoint[]
): readonly ProviderEndpointEvidence[] {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    digest: modelEndpointDigest(endpoint)
  })).sort((left, right) => left.id.localeCompare(right.id))
}

async function readCommittedEndpointModels(
  modelEndpoints: WanexAppModelEndpointCommands,
  endpoints: readonly ModelEndpoint[]
): Promise<readonly ModelEndpointReadModel[]> {
  const current = await modelEndpoints.listModelEndpoints()
  return endpoints.map((endpoint) => {
    const model = current.endpoints.find((candidate) => candidate.id === endpoint.id)
    if (model === undefined) {
      throw new Error(`committed model endpoint not found: ${endpoint.id}`)
    }
    return model
  })
}

async function readCredentialRetirement(
  storage: CoreStore
): Promise<readonly string[]> {
  const value = await storage.getConfig(WANEX_APP_CREDENTIAL_RETIREMENT_KEY)
  if (value === null) return []
  if (
    !isJsonRecord(value) ||
    value.kind !== "wanex-app.credential-retirement" ||
    !Array.isArray(value.refs) ||
    value.refs.length > CREDENTIAL_RETIREMENT_LIMIT ||
    !value.refs.every(
      (ref) => typeof ref === "string" && ref.length > 0 && ref.length <= 2048
    )
  ) {
    throw new Error("provider credential retirement backlog is invalid")
  }
  return [...new Set(value.refs)].sort()
}

function credentialRetirementToJson(refs: readonly string[]): JsonValue {
  return {
    kind: "wanex-app.credential-retirement",
    refs: [...refs]
  }
}

function providerMutationIntentToJson(intent: ProviderMutationIntent): JsonValue {
  return {
    kind: intent.kind,
    connectionId: intent.connectionId,
    ...(intent.kind === "wanex-app.provider-mutation.replace"
      ? { stagedSecretRef: intent.stagedSecretRef }
      : {}),
    retiredSecretRefs: [...intent.retiredSecretRefs],
    endpoints: intent.endpoints.map((endpoint) => ({ ...endpoint }))
  }
}

function readProviderMutationIntent(value: JsonValue): ProviderMutationIntent {
  if (
    !isJsonRecord(value) ||
    (value.kind !== "wanex-app.provider-mutation.replace" &&
      value.kind !== "wanex-app.provider-mutation.remove") ||
    typeof value.connectionId !== "string" ||
    value.connectionId.length === 0 ||
    value.connectionId.length > 256 ||
    !Array.isArray(value.retiredSecretRefs) ||
    value.retiredSecretRefs.length > ENDPOINT_LIMIT ||
    !value.retiredSecretRefs.every(
      (ref) => typeof ref === "string" && ref.length > 0 && ref.length <= 2048
    ) ||
    !Array.isArray(value.endpoints) ||
    value.endpoints.length === 0 ||
    value.endpoints.length > ENDPOINT_LIMIT
  ) {
    throw new Error("provider mutation intent is invalid")
  }
  const endpoints = value.endpoints.map((candidate) => {
    if (
      !isJsonRecord(candidate) ||
      typeof candidate.id !== "string" ||
      candidate.id.length === 0 ||
      typeof candidate.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.digest)
    ) {
      throw new Error("provider mutation endpoint evidence is invalid")
    }
    return { id: candidate.id, digest: candidate.digest }
  })
  if (new Set(endpoints.map((endpoint) => endpoint.id)).size !== endpoints.length) {
    throw new Error("provider mutation endpoint IDs must be unique")
  }
  if (value.kind === "wanex-app.provider-mutation.replace") {
    if (
      typeof value.stagedSecretRef !== "string" ||
      value.stagedSecretRef.length === 0 ||
      value.stagedSecretRef.length > 2048
    ) {
      throw new Error("provider replacement staged credential is invalid")
    }
    return {
      kind: value.kind,
      connectionId: value.connectionId,
      stagedSecretRef: value.stagedSecretRef,
      retiredSecretRefs: value.retiredSecretRefs,
      endpoints
    }
  }
  return {
    kind: value.kind,
    connectionId: value.connectionId,
    retiredSecretRefs: value.retiredSecretRefs,
    endpoints
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index])
}

function isJsonRecord(
  value: JsonValue
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
