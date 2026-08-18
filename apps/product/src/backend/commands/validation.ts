import {
  BACKEND_HANDLER_REFS,
  type BackendHandlerRef
} from "./handlers.js"
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
  BackendExecuteCommandRequest
} from "../model/index.js"

export function validateBackendCommandInput(
  request: BackendExecuteCommandRequest,
  handlerRef: BackendHandlerRef
): void {
  switch (handlerRef) {
    case BACKEND_HANDLER_REFS.submitConversationOperation:
      parseSubmitConversationOperationInput(request)
      return
    case BACKEND_HANDLER_REFS.status:
      assertNoInput(request)
      return
    case BACKEND_HANDLER_REFS.readProductOverview:
      parseOverviewInput(request)
      return
    case BACKEND_HANDLER_REFS.readDiagnostics:
      parseDiagnosticsInput(request)
      return
    case BACKEND_HANDLER_REFS.readProductDiagnosticsDetail:
      parseDiagnosticsDetailInput(request)
      return
    case BACKEND_HANDLER_REFS.buildSupportBundle:
      parseSupportBundleInput(request)
      return
    case BACKEND_HANDLER_REFS.readRecentSessions:
      parseRecentSessionsInput(request)
      return
    case BACKEND_HANDLER_REFS.readProductWorkbench:
      parseWorkbenchInput(request)
      return
    case BACKEND_HANDLER_REFS.readSessionInputProvenance:
      parseSessionInputProvenanceInput(request)
      return
    case BACKEND_HANDLER_REFS.readSessionTranscript:
      parseSessionTranscriptInput(request)
      return
    case BACKEND_HANDLER_REFS.refreshAgentContextProfile:
    case BACKEND_HANDLER_REFS.stopAgentContextMonitor:
    case BACKEND_HANDLER_REFS.shutdown:
      assertNoInput(request)
      return
    case BACKEND_HANDLER_REFS.startAgentContextMonitor:
      parseMonitorInput(request)
      return
  }
}
