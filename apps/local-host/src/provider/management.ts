import type {
  WanexAppProviderMutationCoordinator
} from "@wanex/app/provider-mutation"
import type {
  ConversationModelResolver,
  ModelEndpointReadModel,
  Shell
} from "@wanex/product"
import {
  inferProviderPresetId,
  resolveCredentialEndpoints
} from "@wanex/product"
import type {
  LocalConfiguredProviderListReadModel,
  LocalConfiguredProviderReadModel,
  LocalProviderCommands
} from "../model.js"
import { normalizeLocalModelEndpoint } from "./endpoints.js"

export function createLocalProviderCommands(options: {
  readonly shell: Shell
  readonly modelResolver: ConversationModelResolver
  readonly mutationCoordinator: WanexAppProviderMutationCoordinator
}): LocalProviderCommands {
  const listProviders = async () => await readConfiguredProviders(options.shell)
  return {
    listProviders,
    async saveProvider(request) {
      const resolved = resolveCredentialEndpoints(
        request,
        options.modelResolver
      )
      const configured = await listProviders()
      const existing = configured.providers.find(
        (provider) => provider.connectionId === resolved.connectionId
      )
      if (request.connectionId === undefined) {
        if (existing !== undefined) {
          throw new Error("provider connection is already configured")
        }
      } else {
        const connectionId = normalizeConnectionId(request.connectionId)
        if (connectionId !== resolved.connectionId) {
          throw new Error("provider connection identity cannot be changed")
        }
        if (existing === undefined) {
          throw new Error("provider connection is not configured")
        }
      }

      const conversationEndpoint = normalizeLocalModelEndpoint(
        resolved.conversationEndpoint
      )
      const imageEndpoint = resolved.imageGenerationEndpoint === undefined
        ? undefined
        : normalizeLocalModelEndpoint(
            resolved.imageGenerationEndpoint
          )
      const committed = await options.mutationCoordinator.replace({
        connectionId: resolved.connectionId,
        modelEndpoints: [
          conversationEndpoint,
          ...(imageEndpoint === undefined ? [] : [imageEndpoint])
        ],
        ...(request.credential === undefined
          ? {}
          : { credential: request.credential }),
        ...(request.makeConversationActive === false
          ? { activateByDefault: false }
          : request.makeConversationActive === true
            ? { makeActiveEndpointId: conversationEndpoint.id }
            : { activateByDefault: true })
      })
      const providers = await listProviders()
      const provider = providers.providers.find(
        (candidate) => candidate.connectionId === resolved.connectionId
      )
      if (provider === undefined) {
        throw new Error("saved provider connection is missing")
      }
      return {
        kind: "local-host.provider.saved",
        provider,
        readiness: (await options.shell.readHome()).providerReadiness,
        credentialCleanupPending: committed.credentialCleanupPending
      }
    },
    async removeProvider(request) {
      const connectionId = normalizeConnectionId(request.connectionId)
      const removed = await options.mutationCoordinator.remove({ connectionId })
      return {
        kind: "local-host.provider.removed",
        connectionId,
        removedEndpointIds: removed.removedEndpointIds,
        readiness: (await options.shell.readHome()).providerReadiness,
        credentialCleanupPending: removed.credentialCleanupPending
      }
    }
  }
}

export async function readConfiguredProviders(
  shell: Shell
): Promise<LocalConfiguredProviderListReadModel> {
  const listed = await shell.modelEndpoints.listModelEndpoints()
  const groups = new Map<string, ModelEndpointReadModel[]>()
  for (const endpoint of listed.endpoints) {
    const group = groups.get(endpoint.connection.id) ?? []
    group.push(endpoint)
    groups.set(endpoint.connection.id, group)
  }
  return {
    kind: "local-host.configured-provider-list",
    providers: [...groups.entries()]
      .map(([connectionId, endpoints]) => projectConfiguredProvider(
        connectionId,
        endpoints
      ))
      .sort((left, right) => left.connectionId.localeCompare(right.connectionId))
  }
}

function projectConfiguredProvider(
  connectionId: string,
  endpoints: readonly ModelEndpointReadModel[]
): LocalConfiguredProviderReadModel {
  const first = endpoints[0]
  if (first === undefined) {
    throw new Error("configured provider must contain an endpoint")
  }
  if (endpoints.some(
    (endpoint) =>
      endpoint.connection.id !== connectionId ||
      endpoint.connection.providerId !== first.connection.providerId ||
      endpoint.connection.baseUrl !== first.connection.baseUrl
  )) {
    throw new Error("configured provider connection metadata is inconsistent")
  }
  const presetId = inferProviderPresetId(first.connection)
  return {
    connectionId,
    providerId: first.connection.providerId,
    ...(presetId === undefined ? {} : { presetId }),
    ...(first.connection.baseUrl === undefined
      ? {}
      : { baseUrl: first.connection.baseUrl }),
    credentialConfigured: endpoints.every(
      (endpoint) => endpoint.credentialConfigured
    ),
    active: endpoints.some((endpoint) => endpoint.active),
    endpoints: endpoints
      .map((endpoint) => ({
        id: endpoint.id,
        protocol: endpoint.protocol,
        model: endpoint.model,
        active: endpoint.active
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }
}

function normalizeConnectionId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 256) {
    throw new Error("provider connection ID must contain 1 to 256 bytes")
  }
  return normalized
}
