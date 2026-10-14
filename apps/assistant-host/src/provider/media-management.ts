import type { WanexAppProviderMutationCoordinator } from "@wanex/app/provider-mutation"
import { resolveMediaProviderEndpoint, type Shell } from "@wanex/assistant"
import type { LocalMediaProviderCommands } from "../model.js"
import { normalizeLocalModelEndpoint } from "./endpoints.js"
import { isMediaProvider, readConfiguredProviders } from "./management.js"

export function createLocalMediaProviderCommands(options: {
  readonly shell: Shell
  readonly mutationCoordinator: WanexAppProviderMutationCoordinator
}): LocalMediaProviderCommands {
  const listProviders: LocalMediaProviderCommands["listProviders"] = async () => {
    const configured = await readConfiguredProviders(options.shell)
    return { ...configured, providers: configured.providers.filter(isMediaProvider) }
  }
  return {
    listProviders,
    async saveMediaProvider(request) {
      const resolved = resolveMediaProviderEndpoint(request)
      const configured = await readConfiguredProviders(options.shell)
      const existing = configured.providers.find(
        (provider) => provider.connectionId === resolved.connectionId
      )
      if (request.connectionId === undefined && existing !== undefined) {
        throw new Error("media provider connection is already configured")
      }
      if (request.connectionId !== undefined && existing === undefined) {
        throw new Error("media provider connection is not configured")
      }
      if (existing !== undefined && !isMediaProvider(existing)) {
        throw new Error("media provider connection contains a non-media endpoint")
      }
      const committed = await options.mutationCoordinator.replace({
        connectionId: resolved.connectionId,
        modelEndpoints: [normalizeLocalModelEndpoint(resolved.endpoint)],
        ...(request.credential === undefined ? {} : { credential: request.credential }),
        activateByDefault: false
      })
      const provider = (await listProviders()).providers.find(
        (candidate) => candidate.connectionId === resolved.connectionId
      )
      if (provider === undefined) throw new Error("saved media provider connection is missing")
      return {
        kind: "assistant-host.provider.saved",
        provider,
        readiness: (await options.shell.readHome()).providerReadiness,
        credentialCleanupPending: committed.credentialCleanupPending
      }
    },
    async removeProvider(request) {
      const connectionId = request.connectionId.trim()
      if (!(await listProviders()).providers.some(
        (provider) => provider.connectionId === connectionId
      )) {
        throw new Error("media provider connection is not configured")
      }
      const removed = await options.mutationCoordinator.remove({ connectionId })
      return {
        kind: "assistant-host.provider.removed",
        connectionId,
        removedEndpointIds: removed.removedEndpointIds,
        readiness: (await options.shell.readHome()).providerReadiness,
        credentialCleanupPending: removed.credentialCleanupPending
      }
    },
    async readImageGenerationRoute() {
      return await options.shell.modelCapabilities.readModelCapabilityReadiness({
        requirement: {
          operation: "image.generate",
          inputModalities: ["text"],
          outputModalities: ["image"],
          features: []
        }
      })
    },
    async selectImageGenerationEndpoint(request) {
      const endpointId = request.modelEndpointId.trim()
      const endpoint = (await options.shell.modelEndpoints.listModelEndpoints())
        .endpoints.find((candidate) => candidate.id === endpointId)
      if (endpoint === undefined || !isMediaProtocol(endpoint.protocol.id) ||
        !endpoint.model.operations.includes("image.generate") ||
        !endpoint.model.inputModalities.includes("text") ||
        !endpoint.model.outputModalities.includes("image") ||
        !endpoint.credentialConfigured) {
        throw new Error("image generation endpoint is not available")
      }
      return await options.shell.modelCapabilities.setModelCapabilityRoute({
        operation: "image.generate",
        modelEndpointId: endpointId
      })
    }
  }
}
function isMediaProtocol(protocolId: string): boolean {
  return protocolId === "openai-images" ||
    protocolId === "gemini-image" ||
    protocolId === "volcengine-seedream" ||
    protocolId === "openrouter-images"
}
