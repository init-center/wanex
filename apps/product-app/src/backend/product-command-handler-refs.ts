export const PRODUCT_APP_BACKEND_HANDLER_REFS = {
  submitConversationOperation:
    "wanex.product-app.backend.submitConversationOperation",
  status: "wanex.product-app.backend.status",
  readProductOverview: "wanex.product-app.backend.readProductOverview",
  readDiagnostics: "wanex.product-app.backend.readDiagnostics",
  readProductDiagnosticsDetail:
    "wanex.product-app.backend.readProductDiagnosticsDetail",
  buildSupportBundle: "wanex.product-app.backend.buildSupportBundle",
  readRecentSessions: "wanex.product-app.backend.readRecentSessions",
  readProductWorkbench: "wanex.product-app.backend.readProductWorkbench",
  readSessionInputProvenance:
    "wanex.product-app.backend.readSessionInputProvenance",
  readSessionTranscript: "wanex.product-app.backend.readSessionTranscript",
  refreshAgentContextProfile:
    "wanex.product-app.backend.refreshAgentContextProfile",
  startAgentContextMonitor: "wanex.product-app.backend.startAgentContextMonitor",
  stopAgentContextMonitor: "wanex.product-app.backend.stopAgentContextMonitor",
  shutdown: "wanex.product-app.backend.shutdown"
} as const

export type ProductAppBackendHandlerRef =
  (typeof PRODUCT_APP_BACKEND_HANDLER_REFS)[keyof typeof PRODUCT_APP_BACKEND_HANDLER_REFS]

const productAppBackendHandlerRefs = new Set<string>(
  Object.values(PRODUCT_APP_BACKEND_HANDLER_REFS)
)

export function isProductAppBackendHandlerRefSupported(
  handlerRef: string
): handlerRef is ProductAppBackendHandlerRef {
  return productAppBackendHandlerRefs.has(handlerRef)
}
