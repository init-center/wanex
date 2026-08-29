export const BACKEND_HANDLER_REFS = {
  submitConversationOperation:
    "wanex.assistant.backend.submitConversationOperation",
  status: "wanex.assistant.backend.status",
  readAssistantOverview: "wanex.assistant.backend.readAssistantOverview",
  readDiagnostics: "wanex.assistant.backend.readDiagnostics",
  readAssistantDiagnosticsDetail:
    "wanex.assistant.backend.readAssistantDiagnosticsDetail",
  buildSupportBundle: "wanex.assistant.backend.buildSupportBundle",
  readRecentSessions: "wanex.assistant.backend.readRecentSessions",
  readAssistantWorkbench: "wanex.assistant.backend.readAssistantWorkbench",
  readSessionInputProvenance:
    "wanex.assistant.backend.readSessionInputProvenance",
  readSessionTranscript: "wanex.assistant.backend.readSessionTranscript",
  refreshAgentContextProfile:
    "wanex.assistant.backend.refreshAgentContextProfile",
  startAgentContextMonitor: "wanex.assistant.backend.startAgentContextMonitor",
  stopAgentContextMonitor: "wanex.assistant.backend.stopAgentContextMonitor",
  shutdown: "wanex.assistant.backend.shutdown"
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
