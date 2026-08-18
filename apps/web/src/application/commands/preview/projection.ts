import type {
  CommandInvocationPreview
} from "@wanex/product/surface"
import type {
  CommandPreviewViewModel
} from "../../model.js"

export function idleCommandPreview(): CommandPreviewViewModel {
  return {
    kind: "web.command-preview",
    state: "empty",
    message: "No command preview yet",
    inputAccepted: false
  }
}

export function projectCommandPreviewFromResult(request: {
  readonly preview: CommandInvocationPreview
  readonly updatedAt: number
}): CommandPreviewViewModel {
  const { preview, updatedAt } = request
  const command = preview.command
  const base = {
    kind: "web.command-preview" as const,
    state: preview.kind,
    commandId: preview.commandId,
    ...(command === undefined ? {} : { commandName: command.name }),
    ...(command === undefined ? {} : { commandTitle: command.title }),
    ...(preview.handlerRef === undefined ? {} : { handlerRef: preview.handlerRef }),
    inputAccepted: preview.kind === "runnable",
    updatedAt
  }

  if (preview.kind === "runnable") {
    return {
      ...base,
      message: "Command is runnable"
    }
  }

  return {
    ...base,
    reason: preview.reason,
    message: preview.message,
    ...(
      !("inputValidation" in preview) || preview.inputValidation === undefined
      ? {}
      : {
          inputValidation: {
            source: preview.inputValidation.source,
            issues: preview.inputValidation.issues.map((issue) => ({ ...issue }))
          }
        }),
    ...(preview.reason === "provider_not_ready"
      ? {
          provider: {
            status: preview.providerReadiness.status,
            reason: preview.providerReadiness.reason,
            ...(preview.providerReadiness.activeEndpointId === undefined
              ? {}
              : {
                  activeEndpointId:
                    preview.providerReadiness.activeEndpointId
                }),
            canRun: preview.providerReadiness.canRun,
            attentionRequired: preview.providerReadiness.attentionRequired
          }
        }
      : {})
  }
}
