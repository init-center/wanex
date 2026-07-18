import type {
  ProductAppCommandInvocationPreview
} from "@wanex/product-app/surface-client"
import type {
  ProductAppWebCommandPreviewViewModel
} from "./types.js"

export function idleProductAppWebCommandPreview(): ProductAppWebCommandPreviewViewModel {
  return {
    kind: "product-app-web.command-preview",
    state: "empty",
    message: "No command preview yet",
    inputAccepted: false
  }
}

export function productAppWebCommandPreviewFromResult(request: {
  readonly preview: ProductAppCommandInvocationPreview
  readonly updatedAt: number
}): ProductAppWebCommandPreviewViewModel {
  const { preview, updatedAt } = request
  const command = preview.command
  const base = {
    kind: "product-app-web.command-preview" as const,
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
            activeProfileId: preview.providerReadiness.activeProfileId,
            canRun: preview.providerReadiness.canRun,
            attentionRequired: preview.providerReadiness.attentionRequired
          }
        }
      : {})
  }
}
