import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppResourceCommands } from "./types-resources.js"

export function createWanexAppResourceCommands(
  context: WanexAppCommandContext
): WanexAppResourceCommands {
  return {
    async ingestResource(request) {
      context.assertActive()
      return await context.runtime.storage.ingestResource(request)
    },
    async readResource(request) {
      context.assertActive()
      return await context.runtime.storage.getResource(request)
    },
    async readResourceContent(request) {
      context.assertActive()
      return await context.runtime.storage.readResourceContent(request)
    }
  }
}
