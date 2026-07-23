import type {
  ProductAppBackendCommandEnvelope
} from "./types.js"

export const PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS = {
  status: "status",
  readProductOverview: "readProductOverview",
  readProductDiagnosticsDetail: "readProductDiagnosticsDetail",
  readRecentSessions: "readRecentSessions",
  readProductWorkbench: "readProductWorkbench",
  readProductCapabilities: "readProductCapabilities",
  readProductCommands: "readProductCommands",
  explainProductCommandContribution: "explainProductCommandContribution",
  previewProductCommandInvocation: "previewProductCommandInvocation",
  executeProductCommand: "executeProductCommand",
  routeInput: "routeInput",
  routeWorkflowEnvelope: "routeWorkflowEnvelope",
  submitConversationOperation: "submitConversationOperation",
  readConversationOperation: "readConversationOperation",
  cancelConversationOperation: "cancelConversationOperation",
  readDiagnostics: "readDiagnostics",
  buildSupportBundle: "buildSupportBundle",
  readSessionInputProvenance: "readSessionInputProvenance",
  readSessionTranscript: "readSessionTranscript",
  refreshAgentContextProfile: "refreshAgentContextProfile",
  startAgentContextMonitor: "startAgentContextMonitor",
  stopAgentContextMonitor: "stopAgentContextMonitor",
  shutdown: "shutdown"
} as const

export type ProductAppBackendCommandPortCommand =
  (typeof PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS)[keyof typeof PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS]

export type ProductAppBackendCommandPortEnvelope =
  ProductAppBackendCommandEnvelope<unknown>

export interface ProductAppBackendCommandPort {
  dispatch(
    request: unknown
  ): Promise<ProductAppBackendCommandPortEnvelope>
}
