import {
  normalizeWanexAppExecutionReference,
  projectWanexAppJobExecutionReference
} from "./execution-reference.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppExecutionReferenceCommands } from "./types-execution-reference.js"

export function createWanexAppExecutionReferenceCommands(
  context: WanexAppCommandContext
): WanexAppExecutionReferenceCommands {
  return {
    async readExecutionReference(request) {
      context.assertActive()
      const reference = normalizeWanexAppExecutionReference(request)
      if (reference.kind !== "job") {
        return {
          kind: "unsupported",
          reference
        }
      }
      const job = await context.runtime.storage.getJob({ jobId: reference.id })
      if (job === null) {
        return {
          kind: "missing",
          reference
        }
      }
      return projectWanexAppJobExecutionReference(job)
    }
  }
}
