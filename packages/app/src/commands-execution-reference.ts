import {
  normalizeWanexAppShellExecutionReference,
  projectWanexAppShellJobExecutionReference
} from "./execution-reference.js"
import type { WanexAppShellCommandContext } from "./command-context.js"
import type { WanexAppShellExecutionReferenceCommands } from "./types-execution-reference.js"

export function createWanexAppShellExecutionReferenceCommands(
  context: WanexAppShellCommandContext
): WanexAppShellExecutionReferenceCommands {
  return {
    async readExecutionReference(request) {
      context.assertActive()
      const reference = normalizeWanexAppShellExecutionReference(request)
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
      return projectWanexAppShellJobExecutionReference(job)
    }
  }
}
