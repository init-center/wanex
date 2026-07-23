import type {
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import {
  PRODUCT_APP_BACKEND_HANDLER_REFS,
  isProductAppBackendHandlerRefSupported
} from "./product-command-handler-refs.js"
import {
  validateProductAppBackendCommandInput
} from "./product-command-validation.js"
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
} from "./product-command-input.js"
import type {
  CreateProductAppBackendCommandRegistryOptions
} from "./product-command-runtime.js"
import type {
  ProductAppBackendExecuteCommandRequest,
  ProductAppBackendExecuteCommandResult,
  ProductAppBackendCommandInputValidationDetails
} from "./types.js"
import { validateProductAppBackendCommandSchemaInput } from "./product-command-schema-validator.js"

export async function executeProductAppBackendCommand(
  options: CreateProductAppBackendCommandRegistryOptions,
  snapshot: AppExtensionResolvedSnapshot,
  request: ProductAppBackendExecuteCommandRequest
): Promise<ProductAppBackendExecuteCommandResult> {
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
    : validateProductAppBackendCommandSchemaInput(
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
  if (!isProductAppBackendHandlerRefSupported(handlerRef)) {
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
        return completeCommand(
          request,
          handlerRef,
          await options.extensionCommandExecutor.execute(extensionRequest)
        )
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
    validateProductAppBackendCommandInput(request, handlerRef)
    switch (handlerRef) {
      case PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.submitConversationOperation(
            parseSubmitConversationOperationInput(request)
          )
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.status:
        assertNoInput(request)
        return completeCommand(request, handlerRef, options.status())
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductOverview:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductOverview(parseOverviewInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readDiagnostics:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readDiagnostics(parseDiagnosticsInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductDiagnosticsDetail(
            parseDiagnosticsDetailInput(request)
          )
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.buildSupportBundle:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.buildSupportBundle(parseSupportBundleInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readRecentSessions:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readRecentSessions(parseRecentSessionsInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductWorkbench:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readProductWorkbench(parseWorkbenchInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionInputProvenance:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readSessionInputProvenance(
            parseSessionInputProvenanceInput(request)
          )
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionTranscript:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.readSessionTranscript(
            parseSessionTranscriptInput(request)
          )
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.refreshAgentContextProfile:
        assertNoInput(request)
        return completeCommand(
          request,
          handlerRef,
          await options.commands.refreshAgentContextProfile()
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.startAgentContextMonitor:
        return completeCommand(
          request,
          handlerRef,
          await options.commands.startAgentContextMonitor(parseMonitorInput(request))
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.stopAgentContextMonitor:
        assertNoInput(request)
        return completeCommand(
          request,
          handlerRef,
          await options.commands.stopAgentContextMonitor()
        )
      case PRODUCT_APP_BACKEND_HANDLER_REFS.shutdown:
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
  request: ProductAppBackendExecuteCommandRequest,
  handlerRef: string,
  value: unknown
): ProductAppBackendExecuteCommandResult {
  return {
    kind: "completed",
    commandId: request.commandId,
    handlerRef,
    value
  }
}

function rejectCommand(options: {
  readonly request: ProductAppBackendExecuteCommandRequest
  readonly reason: "command_not_found" | "unsupported_handler_ref" | "invalid_input"
    | "execution_failed"
  readonly message: string
  readonly handlerRef?: string
  readonly inputValidation?: ProductAppBackendCommandInputValidationDetails
}): ProductAppBackendExecuteCommandResult {
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
