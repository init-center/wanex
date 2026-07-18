import type { ProductAppExecuteCommandResult } from "@wanex/product-app/surface-client"
import type { ProductAppWebCommandExecutionViewModel } from "./types.js"

export function idleProductAppWebCommandExecution(): ProductAppWebCommandExecutionViewModel {
  return {
    kind: "product-app-web.command-execution",
    state: "empty",
    message: "No command execution yet",
    references: []
  }
}

export function productAppWebCommandExecutionFromResult(
  result: ProductAppExecuteCommandResult,
  updatedAt: number
): ProductAppWebCommandExecutionViewModel {
  if (result.kind === "completed") {
    return {
      kind: "product-app-web.command-execution",
      state: "completed",
      commandId: result.commandId,
      handlerRef: result.handlerRef,
      message: result.summary.message,
      valueKind: result.summary.valueKind,
      references: result.summary.references,
      updatedAt
    }
  }
  return {
    kind: "product-app-web.command-execution",
    state: "rejected",
    commandId: result.commandId,
    message: result.message,
    reason: result.reason,
    ...(result.handlerRef === undefined ? {} : { handlerRef: result.handlerRef }),
    ...(result.inputValidation === undefined
      ? {}
      : {
          inputValidation: {
            source: result.inputValidation.source,
            issues: result.inputValidation.issues.map((issue) => ({ ...issue }))
          }
        }),
    references: [],
    ...(result.providerReadiness === undefined
      ? {}
      : {
          provider: {
            status: result.providerReadiness.status,
            reason: result.providerReadiness.reason,
            activeProfileId: result.providerReadiness.activeProfileId,
            canRun: result.providerReadiness.canRun,
            attentionRequired: result.providerReadiness.attentionRequired
          }
        }),
    updatedAt
  }
}
