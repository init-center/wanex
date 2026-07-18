import type {
  ProductAppBackendExtensionCommandExecutor
} from "./product-command-runtime.js"
import type {
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import {
  isProductAppBackendHandlerRefSupported
} from "./product-command-handler-refs.js"
import {
  validateProductAppBackendCommandInput
} from "./product-command-validation.js"
import {
  projectProductAppBackendCommandRow
} from "./product-command-read-model.js"
import { validateProductAppBackendCommandSchemaInput } from "./product-command-schema-validator.js"
import type {
  ProductAppBackendCommandInvocationPreview,
  ProductAppBackendPreviewCommandInvocationRequest
} from "./types.js"

export function previewProductAppBackendCommandInvocation(
  snapshot: AppExtensionResolvedSnapshot,
  request: ProductAppBackendPreviewCommandInvocationRequest,
  extensionExecutor?: ProductAppBackendExtensionCommandExecutor
): ProductAppBackendCommandInvocationPreview {
  const command = snapshot.byDomain.command.byId.get(request.commandId)
  if (command === undefined) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      reason: "command_not_found",
      message: `product command not found: ${request.commandId}`
    }
  }

  const handlerRef = command.value.handlerRef
  const commandRow = projectProductAppBackendCommandRow(command)
  const schemaIssues = command.value.inputSchema === undefined
    ? []
    : validateProductAppBackendCommandSchemaInput(
        command.value.inputSchema,
        request.input
      )
  if (schemaIssues.length > 0) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      handlerRef,
      command: commandRow,
      reason: "invalid_input",
      message: schemaIssues[0]?.message ?? "command input does not match schema",
      inputValidation: { source: "schema", issues: schemaIssues }
    }
  }
  if (
    !isProductAppBackendHandlerRefSupported(handlerRef) &&
    !extensionExecutor?.supports(handlerRef)
  ) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      handlerRef,
      command: commandRow,
      reason: "unsupported_handler_ref",
      message: `product command handler is not allowed: ${handlerRef}`
    }
  }

  try {
    if (isProductAppBackendHandlerRefSupported(handlerRef)) {
      validateProductAppBackendCommandInput(request, handlerRef)
    } else {
      const result = extensionExecutor?.preview({
        commandId: request.commandId,
        handlerRef,
        ...(request.input === undefined ? {} : { input: request.input })
      })
      if (result === undefined || !result.ok) {
        throw new Error(result?.message ?? `unsupported command handler: ${handlerRef}`)
      }
    }
  } catch (error) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      handlerRef,
      command: commandRow,
      reason: "invalid_input",
      message: error instanceof Error ? error.message : String(error),
      inputValidation: {
        source: "handler",
        issues: [{
          path: "/",
          keyword: "handler",
          message: error instanceof Error ? error.message : String(error)
        }]
      }
    }
  }

  return {
    kind: "runnable",
    commandId: request.commandId,
    handlerRef,
    command: commandRow,
    inputAccepted: true
  }
}
