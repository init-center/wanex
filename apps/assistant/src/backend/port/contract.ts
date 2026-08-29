import type {
  BackendCommandEnvelope
} from "../model/index.js"

export const BACKEND_COMMAND_PORT_COMMANDS = {
  status: "status",
  readAssistantOverview: "readAssistantOverview",
  readAssistantDiagnosticsDetail: "readAssistantDiagnosticsDetail",
  readRecentSessions: "readRecentSessions",
  readAssistantWorkbench: "readAssistantWorkbench",
  readAssistantCapabilities: "readAssistantCapabilities",
  readAssistantCommands: "readAssistantCommands",
  explainAssistantCommandContribution: "explainAssistantCommandContribution",
  previewAssistantCommandInvocation: "previewAssistantCommandInvocation",
  executeAssistantCommand: "executeAssistantCommand",
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

export type BackendCommandPortCommand =
  (typeof BACKEND_COMMAND_PORT_COMMANDS)[keyof typeof BACKEND_COMMAND_PORT_COMMANDS]

export type BackendCommandPortEnvelope =
  BackendCommandEnvelope<unknown>

export interface BackendCommandPort {
  dispatch(
    request: unknown
  ): Promise<BackendCommandPortEnvelope>
}
