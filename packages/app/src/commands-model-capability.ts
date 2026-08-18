import {
  clearWanexAppModelCapabilityRoute,
  listWanexAppModelCapabilityRoutes,
  resolveWanexAppModelCapability,
  setWanexAppModelCapabilityRoute
} from "./model-capability.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppModelCapabilityCommands } from "./types-model-capability.js"

export function createWanexAppModelCapabilityCommands(
  context: WanexAppCommandContext
): WanexAppModelCapabilityCommands {
  return {
    async listModelCapabilityRoutes() {
      context.assertActive()
      return await listWanexAppModelCapabilityRoutes(context.runtime.storage)
    },
    async setModelCapabilityRoute(request) {
      context.assertActive()
      return await setWanexAppModelCapabilityRoute({
        storage: context.runtime.storage,
        operation: request.operation,
        modelEndpointId: request.modelEndpointId,
        isModelEndpointExecutable: context.isModelEndpointExecutable
      })
    },
    async clearModelCapabilityRoute(request) {
      context.assertActive()
      return await clearWanexAppModelCapabilityRoute({
        storage: context.runtime.storage,
        operation: request.operation,
        isModelEndpointExecutable: context.isModelEndpointExecutable
      })
    },
    async readModelCapabilityReadiness(request) {
      context.assertActive()
      return (
        await resolveWanexAppModelCapability({
          storage: context.runtime.storage,
          requirement: request.requirement,
          isModelEndpointExecutable: context.isModelEndpointExecutable
        })
      ).readiness
    }
  }
}
