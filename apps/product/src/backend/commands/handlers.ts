export const BACKEND_HANDLER_REFS = {
  submitConversationOperation:
    "wanex.product.backend.submitConversationOperation",
  status: "wanex.product.backend.status",
  readProductOverview: "wanex.product.backend.readProductOverview",
  readDiagnostics: "wanex.product.backend.readDiagnostics",
  readProductDiagnosticsDetail:
    "wanex.product.backend.readProductDiagnosticsDetail",
  buildSupportBundle: "wanex.product.backend.buildSupportBundle",
  readRecentSessions: "wanex.product.backend.readRecentSessions",
  readProductWorkbench: "wanex.product.backend.readProductWorkbench",
  readSessionInputProvenance:
    "wanex.product.backend.readSessionInputProvenance",
  readSessionTranscript: "wanex.product.backend.readSessionTranscript",
  refreshAgentContextProfile:
    "wanex.product.backend.refreshAgentContextProfile",
  startAgentContextMonitor: "wanex.product.backend.startAgentContextMonitor",
  stopAgentContextMonitor: "wanex.product.backend.stopAgentContextMonitor",
  shutdown: "wanex.product.backend.shutdown"
} as const

export type BackendHandlerRef =
  (typeof BACKEND_HANDLER_REFS)[keyof typeof BACKEND_HANDLER_REFS]

const backendHandlerRefs = new Set<string>(
  Object.values(BACKEND_HANDLER_REFS)
)

export function isBackendHandlerRefSupported(
  handlerRef: string
): handlerRef is BackendHandlerRef {
  return backendHandlerRefs.has(handlerRef)
}
