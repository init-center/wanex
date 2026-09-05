import type { CoreStore } from "@wanex/storage"
import type { SecretStorePort } from "@wanex/runtime/secrets"
import type { WanexLocalCredentialPolicy } from "@wanex/local-credential-store"
import {
  decodeLocalMcpServerEntry,
} from "../codec.js"
import { localMcpServerKey } from "../identity.js"
import type { LocalMcpManagementPort } from "../management.js"
import type {
  LocalMcpNamedValue,
  LocalMcpServerDefinition,
  LocalMcpTransportDefinition,
} from "../model.js"
import {
  createLocalMcpCredentialCoordinator,
  type LocalMcpCredentialCoordinator,
} from "./credentials.js"
import type {
  LocalMcpSettingsNamedValueInput,
  LocalMcpSettingsPort,
  LocalMcpSettingsSaveServerRequest,
  LocalMcpSettingsTransportInput,
} from "./model.js"

export function createLocalMcpSettings(options: {
  readonly storage: Pick<
    CoreStore,
    | "applyConfigMutations"
    | "compareAndApplyConfigMutations"
    | "getConfig"
    | "getConfigEntry"
    | "listConfigEntries"
  >
  readonly management: LocalMcpManagementPort
  readonly credentialStore: SecretStorePort
  readonly credentialPolicy: WanexLocalCredentialPolicy
  readonly createSetupId?: () => string
  readonly createRevisionId?: () => string
  readonly now?: () => number
}): LocalMcpSettingsPort {
  const credentials = createLocalMcpCredentialCoordinator(options)
  let tail: Promise<unknown> = Promise.resolve()
  const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return await result
  }

  return {
    readServers: async () => await options.management.readServers(),
    stageCredential: async (request) => await serialize(
      async () => await credentials.stageCredential(request)
    ),
    saveServer: async (request) => await serialize(async () => {
      await credentials.reconcile()
      const prepared = await prepareDefinition(
        request,
        credentials,
        options.createRevisionId
      )
      const current = await options.storage.getConfigEntry(
        localMcpServerKey(prepared.definition.serverId)
      )
      const retiredSecretRefs = current === null
        ? []
        : credentialRefsFromEntry(current, options.credentialPolicy)
      await credentials.beginMutation({
        serverId: prepared.definition.serverId,
        setupIds: prepared.setups.map((setup) => setup.setupId),
        stagedSecretRefs: prepared.setups.map((setup) => setup.secretRef),
        retiredSecretRefs,
      })
      let result
      try {
        result = await options.management.saveServer({
          definition: prepared.definition,
          expectedRevision: request.expectedRevision,
        })
      } catch (error) {
        const cleanup = await credentials.reconcile().catch(() => ({
          credentialCleanupPending: true,
        }))
        if (cleanup.credentialCleanupPending) {
          throw new AggregateError(
            [error],
            "MCP server save failed and credential cleanup is pending"
          )
        }
        throw error
      }
      const cleanup = await credentials.reconcile().catch(() => ({
        credentialCleanupPending: true,
      }))
      return { ...result, ...cleanup }
    }),
    updateServer: async (request) => await serialize(async () => {
      const cleanup = await credentials.reconcile()
      const key = localMcpServerKey(request.serverId)
      const current = await options.storage.getConfigEntry(key)
      if (current === null) {
        throw new Error(`MCP server is not configured: ${request.serverId}`)
      }
      const definition = decodeLocalMcpServerEntry(current)
      const result = await options.management.saveServer({
        definition: { ...definition, label: request.label },
        expectedRevision: request.expectedRevision,
      })
      return { ...result, ...cleanup }
    }),
    setServerEnabled: async (request) => await serialize(async () => {
      await credentials.reconcile()
      return await options.management.setServerEnabled(request)
    }),
    removeServer: async (request) => await serialize(async () => {
      await credentials.reconcile()
      const current = await options.storage.getConfigEntry(
        localMcpServerKey(request.serverId)
      )
      const retiredSecretRefs = current === null
        ? []
        : credentialRefsFromEntry(current, options.credentialPolicy)
      await credentials.beginMutation({
        serverId: request.serverId,
        setupIds: [],
        stagedSecretRefs: [],
        retiredSecretRefs,
      })
      let result
      try {
        result = await options.management.removeServer(request)
      } catch (error) {
        const cleanup = await credentials.reconcile().catch(() => ({
          credentialCleanupPending: true,
        }))
        if (cleanup.credentialCleanupPending) {
          throw new AggregateError(
            [error],
            "MCP server removal failed and credential cleanup is pending"
          )
        }
        throw error
      }
      const cleanup = await credentials.reconcile().catch(() => ({
        credentialCleanupPending: true,
      }))
      return { ...result, ...cleanup }
    }),
    reloadServers: async (request) => await serialize(async () => {
      await credentials.reconcile()
      return await options.management.reloadServers(request)
    }),
    reconcileCredentials: async () => await serialize(
      async () => await credentials.reconcile()
    ),
  }
}

async function prepareDefinition(
  request: LocalMcpSettingsSaveServerRequest,
  credentials: LocalMcpCredentialCoordinator,
  createRevisionId: (() => string) | undefined
): Promise<{
  readonly definition: LocalMcpServerDefinition
  readonly setups: readonly { readonly setupId: string; readonly secretRef: string }[]
}> {
  const setups: { readonly setupId: string; readonly secretRef: string }[] = []
  const transport = await prepareTransport(
    request.serverId,
    request.transport,
    credentials,
    setups
  )
  const revision = (createRevisionId ?? (() => globalThis.crypto.randomUUID()))()
  const definition: LocalMcpServerDefinition = {
    kind: "assistant-host.mcp-server",
    serverId: request.serverId,
    label: request.label,
    enabled: request.enabled,
    capabilityRevision: `settings-${revision}`,
    connectTimeoutMs: request.connectTimeoutMs,
    requestTimeoutMs: request.requestTimeoutMs,
    transport,
  }
  return { definition, setups: Object.freeze(setups) }
}

async function prepareTransport(
  serverId: string,
  transport: LocalMcpSettingsTransportInput,
  credentials: LocalMcpCredentialCoordinator,
  setups: { setupId: string; secretRef: string }[]
): Promise<LocalMcpTransportDefinition> {
  if (transport.kind === "stdio") {
    return {
      kind: "stdio",
      command: transport.command,
      args: transport.args,
      cwd: transport.cwd,
      environment: await prepareNamedValues(
        serverId,
        transport.kind,
        transport.environment,
        credentials,
        setups
      ),
      ...(transport.maxBufferBytes === undefined
        ? {}
        : { maxBufferBytes: transport.maxBufferBytes }),
    }
  }
  return {
    kind: "streamable_http",
    url: transport.url,
    headers: await prepareNamedValues(
      serverId,
      transport.kind,
      transport.headers,
      credentials,
      setups
    ),
  }
}

async function prepareNamedValues(
  serverId: string,
  transport: "stdio" | "streamable_http",
  values: readonly LocalMcpSettingsNamedValueInput[],
  credentials: LocalMcpCredentialCoordinator,
  setups: { setupId: string; secretRef: string }[]
): Promise<LocalMcpNamedValue[]> {
  return await Promise.all(values.map(async (value) => {
    const setup = await credentials.resolveSetup({
      setupId: value.source.setupId,
      serverId,
      transport,
      name: value.name,
    })
    if (setups.some((candidate) => candidate.setupId === setup.setupId)) {
      throw new Error("MCP credential setup cannot be used more than once")
    }
    setups.push(setup)
    return {
      name: value.name,
      source: { kind: "credential", ref: setup.secretRef },
    }
  }))
}

function credentialRefsFromEntry(
  entry: Parameters<typeof decodeLocalMcpServerEntry>[0],
  policy: WanexLocalCredentialPolicy
): readonly string[] {
  let definition: LocalMcpServerDefinition
  try {
    definition = decodeLocalMcpServerEntry(entry)
  } catch {
    return []
  }
  const values = definition.transport.kind === "stdio"
    ? definition.transport.environment
    : definition.transport.headers
  return [...new Set(values.flatMap((value) =>
    value.source.kind === "credential" && policy.ownsRef(value.source.ref)
      ? [value.source.ref]
      : []
  ))].sort()
}
