import type {
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import {
  BACKEND_HANDLER_REFS,
  isBackendHandlerRefSupported
} from "./handlers.js"
import {
  validateBackendCommandInput
} from "./validation.js"
import {
  assertNoInput,
  parseDiagnosticsDetailInput,
  parseDiagnosticsInput,
  parseMonitorInput,
  parseOverviewInput,
  parseRecentSessionsInput,
  parseSubmitConversationOperationInput,
  parseSessionInputProvenanceInput,
  parseSessionTranscriptInput,
  parseSupportBundleInput,
  parseWorkbenchInput
} from "./input.js"
import type {
  CreateBackendCommandRegistryOptions
} from "./runtime.js"
import type {
  BackendExecuteCommandRequest,
  BackendExecuteCommandResult,
  BackendCommandInputValidationDetails
} from "../model/index.js"
import { validateBackendCommandSchemaInput } from "./schema.js"

export async function executeBackendCommand(
  options: CreateBackendCommandRegistryOptions,
  snapshot: AppExtensionResolvedSnapshot,
  request: BackendExecuteCommandRequest
): Promise<BackendExecuteCommandResult> {
  const command = snapshot.byDomain.command.byId.get(request.commandId)
  if (command === undefined) {
    return rejectCommand({
      request,
      reason: "command_not_found",
      message: `product command not found: ${request.commandId}`
    })
  }

  const handlerRef = command.value.handlerRef
  const schemaIssues = command.value.inputSchema === undefined
    ? []
    : validateBackendCommandSchemaInput(
        command.value.inputSchema,
        request.input
      )
  if (schemaIssues.length > 0) {
    return rejectCommand({
      request,
      handlerRef,
      reason: "invalid_input",
      message: schemaIssues[0]?.message ?? "command input does not match schema",
      inputValidation: { source: "schema", issues: schemaIssues }
    })
  }
  if (!isBackendHandlerRefSupported(handlerRef)) {
    if (options.extensionCommandExecutor?.supports(handlerRef)) {
      const extensionRequest = {
        commandId: request.commandId,
        handlerRef,
        ...(request.input === undefined ? {} : { input: request.input })
      }
      const preview = options.extensionCommandExecutor.preview(extensionRequest)
      if (!preview.ok) {
        return rejectCommand({
          request,
          handlerRef,
          reason: "invalid_input",
          message: preview.message
        })
      }
      try {
        const execution =
          await options.extensionCommandExecutor.execute(extensionRequest)
        return execution.kind === "submitted"
          ? submitCommand(request, handlerRef, execution.value)
          : completeCommand(request, handlerRef, execution.value)
      } catch (error) {
        return rejectCommand({
          request,
          handlerRef,
          reason: "execution_failed",
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return rejectCommand({
      request,
      handlerRef,
      reason: "unsupported_handler_ref",
      message: `product command handler is not allowed: ${handlerRef}`
    })
  }

  try {
    validateBackendCommandInput(request, handlerRef)
    switch (handlerRef) {
      case BACKEND_HANDLER_REFS.submitConversationOperation:
        return submitCommand(
          request,
          handlerRef,
          await options.commands.submitConversationOperation(
            parseSubmitConversationOperationInput(request)
          )
        )
      case BACKEND_HANDLER_REFS.status:
        assertNoInput(request)
        return completeCommand(request, handlerRef, options.status())
      case BACKEND_HANDLER_REFS.readProductOverview:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductOverview(parseOverviewInput(request))
        )
      case BACKEND_HANDLER_REFS.readDiagnostics:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readDiagnostics(parseDiagnosticsInput(request))
        )
      case BACKEND_HANDLER_REFS.readProductDiagnosticsDetail:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductDiagnosticsDetail(
            parseDiagnosticsDetailInput(request)
          )
        )
      case BACKEND_HANDLER_REFS.buildSupportBundle:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.buildSupportBundle(parseSupportBundleInput(request))
        )
      case BACKEND_HANDLER_REFS.readRecentSessions:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readRecentSessions(parseRecentSessionsInput(request))
        )
      case BACKEND_HANDLER_REFS.readProductWorkbench:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductWorkbench(parseWorkbenchInput(request))
        )
      case BACKEND_HANDLER_REFS.readSessionInputProvenance:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readSessionInputProvenance(
            parseSessionInputProvenanceInput(request)
          )
        )
      case BACKEND_HANDLER_REFS.readSessionTranscript:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readSessionTranscript(
            parseSessionTranscriptInput(request)
          )
        )
      case BACKEND_HANDLER_REFS.refreshAgentContextProfile:
        assertNoInput(request)
        return completeCommand(
          request,
          handlerRef,
          await options.commands.refreshAgentContextProfile()
        )
      case BACKEND_HANDLER_REFS.startAgentContextMonitor:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.startAgentContextMonitor(parseMonitorInput(request))
        )
      case BACKEND_HANDLER_REFS.stopAgentContextMonitor:
        assertNoInput(request)
        return completeCommand(
          request,
          handlerRef,
          await options.commands.stopAgentContextMonitor()
        )
      case BACKEND_HANDLER_REFS.shutdown:
        assertNoInput(request)
        return completeCommand(
          request,
          handlerRef,
          await options.commands.shutdown()
        )
    }
  } catch (error) {
    return rejectCommand({
      request,
      handlerRef,
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
    })
  }
}

function completeCommand(
  request: BackendExecuteCommandRequest,
  handlerRef: string,
  value: unknown
): BackendExecuteCommandResult {
  return {
    kind: "completed",
    commandId: request.commandId,
    handlerRef,
    value
  }
}

function submitCommand(
  request: BackendExecuteCommandRequest,
  handlerRef: string,
  value: unknown
): BackendExecuteCommandResult {
  return {
    kind: "submitted",
    commandId: request.commandId,
    handlerRef,
    value
  }
}

function rejectCommand(options: {
  readonly request: BackendExecuteCommandRequest
  readonly reason: "command_not_found" | "unsupported_handler_ref" | "invalid_input"
    | "execution_failed"
  readonly message: string
  readonly handlerRef?: string
  readonly inputValidation?: BackendCommandInputValidationDetails
}): BackendExecuteCommandResult {
  return {
    kind: "rejected",
    commandId: options.request.commandId,
    reason: options.reason,
    message: options.message,
    ...(options.handlerRef === undefined ? {} : { handlerRef: options.handlerRef }),
    ...(options.inputValidation === undefined
      ? {}
      : { inputValidation: options.inputValidation })
  }
}
