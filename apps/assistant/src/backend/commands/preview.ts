import type {
  BackendExtensionCommandExecutor
} from "./runtime.js"
import type {
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import {
  isBackendHandlerRefSupported
} from "./handlers.js"
import {
  validateBackendCommandInput
} from "./validation.js"
import {
  projectBackendCommandRow
} from "./read-model.js"
import { validateBackendCommandSchemaInput } from "./schema.js"
import type {
  BackendCommandInvocationPreview,
  BackendPreviewCommandInvocationRequest
} from "../model/index.js"

export function previewBackendCommandInvocation(
  snapshot: AppExtensionResolvedSnapshot,
  request: BackendPreviewCommandInvocationRequest,
  extensionExecutor?: BackendExtensionCommandExecutor
): BackendCommandInvocationPreview {
  const command = snapshot.byDomain.command.byId.get(request.commandId)
  if (command === undefined) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      reason: "command_not_found",
      message: `assistant command not found: ${request.commandId}`
    }
  }

  const handlerRef = command.value.handlerRef
  const commandRow = projectBackendCommandRow(command)
  const schemaIssues = command.value.inputSchema === undefined
    ? []
    : validateBackendCommandSchemaInput(
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
    !isBackendHandlerRefSupported(handlerRef) &&
    !extensionExecutor?.supports(handlerRef)
  ) {
    return {
      kind: "rejected",
      commandId: request.commandId,
      handlerRef,
      command: commandRow,
      reason: "unsupported_handler_ref",
      message: `assistant command handler is not allowed: ${handlerRef}`
    }
  }

  try {
    if (isBackendHandlerRefSupported(handlerRef)) {
      validateBackendCommandInput(request, handlerRef)
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
