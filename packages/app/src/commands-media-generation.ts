import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppMediaGenerationCommands } from "./types-media-generation.js"

export function createWanexAppMediaGenerationCommands(
  context: WanexAppCommandContext
): WanexAppMediaGenerationCommands {
  return {
    async submitMediaGeneration(request) {
      context.assertActive()
      return await context.mediaGenerationOperations.submit(request)
    },
    async readMediaGenerationOperation(request) {
      context.assertActive()
      return await context.mediaGenerationOperations.read(request)
    },
    async cancelMediaGeneration(request) {
      context.assertActive()
      return await context.mediaGenerationOperations.cancel(request)
    }
  }
}
