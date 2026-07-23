import {
  PRODUCT_APP_BACKEND_HANDLER_REFS,
  type ProductAppBackendHandlerRef
} from "./product-command-handler-refs.js"
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
  ProductAppBackendExecuteCommandRequest
} from "./types.js"

export function validateProductAppBackendCommandInput(
  request: ProductAppBackendExecuteCommandRequest,
  handlerRef: ProductAppBackendHandlerRef
): void {
  switch (handlerRef) {
    case PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation:
      parseSubmitConversationOperationInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.status:
      assertNoInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductOverview:
      parseOverviewInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readDiagnostics:
      parseDiagnosticsInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail:
      parseDiagnosticsDetailInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.buildSupportBundle:
      parseSupportBundleInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readRecentSessions:
      parseRecentSessionsInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readProductWorkbench:
      parseWorkbenchInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionInputProvenance:
      parseSessionInputProvenanceInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionTranscript:
      parseSessionTranscriptInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.refreshAgentContextProfile:
    case PRODUCT_APP_BACKEND_HANDLER_REFS.stopAgentContextMonitor:
    case PRODUCT_APP_BACKEND_HANDLER_REFS.shutdown:
      assertNoInput(request)
      return
    case PRODUCT_APP_BACKEND_HANDLER_REFS.startAgentContextMonitor:
      parseMonitorInput(request)
      return
  }
}
