import type { ExecuteCommandResult } from "@wanex/assistant/surface"
import type { CommandExecutionViewModel } from "./model.js"

export function idleCommandExecution(): CommandExecutionViewModel {
  return {
    kind: "web.command-execution",
    state: "empty",
    message: "No command execution yet",
    references: []
  }
}

export function projectCommandExecutionFromResult(
  result: ExecuteCommandResult,
  updatedAt: number
): CommandExecutionViewModel {
  if (result.kind !== "rejected") {
    return {
      kind: "web.command-execution",
      state: result.kind,
      commandId: result.commandId,
      handlerRef: result.handlerRef,
      message: result.summary.message,
      valueKind: result.summary.valueKind,
      references: result.summary.references,
      updatedAt
    }
  }
  return {
    kind: "web.command-execution",
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
            ...(result.providerReadiness.activeEndpointId === undefined
              ? {}
              : {
                  activeEndpointId:
                    result.providerReadiness.activeEndpointId
                }),
            canRun: result.providerReadiness.canRun,
            attentionRequired: result.providerReadiness.attentionRequired
          }
        }),
    updatedAt
  }
}
