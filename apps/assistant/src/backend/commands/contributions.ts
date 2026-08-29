import type {
  AppCommandContribution
} from "@wanex/extension"
import {
  BACKEND_HANDLER_REFS,
  type BackendHandlerRef
} from "./handlers.js"
import { BACKEND_COMMAND_INPUT_SCHEMAS } from "./schemas.js"

export function backendBuiltinCommandContributions():
  readonly AppCommandContribution[] {
  return [
    commandContribution({
      id: "assistant.agent.submit",
      name: "agent.submit",
      title: "Submit Agent Turn",
      category: "agent",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
      order: 10
    }),
    commandContribution({
      id: "assistant.status",
      name: "status",
      title: "Status",
      category: "system",
      paletteVisibility: "visible",
      handlerRef: BACKEND_HANDLER_REFS.status,
      order: 20
    }),
    commandContribution({
      id: "assistant.overview.read",
      name: "overview.read",
      title: "Read Assistant Overview",
      category: "read_model",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readAssistantOverview,
      order: 25
    }),
    commandContribution({
      id: "assistant.diagnostics.read",
      name: "diagnostics.read",
      title: "Read Diagnostics",
      category: "diagnostics",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readDiagnostics,
      order: 30
    }),
    commandContribution({
      id: "assistant.diagnostics.detail.read",
      name: "diagnostics.detail.read",
      title: "Read Diagnostics Detail",
      category: "diagnostics",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readAssistantDiagnosticsDetail,
      order: 35
    }),
    commandContribution({
      id: "assistant.support.build",
      name: "support.build",
      title: "Build Support Bundle",
      category: "diagnostics",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.buildSupportBundle,
      order: 40
    }),
    commandContribution({
      id: "assistant.provenance.read",
      name: "provenance.read",
      title: "Read Session Provenance",
      category: "read_model",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readSessionInputProvenance,
      order: 50
    }),
    commandContribution({
      id: "assistant.sessions.recent.read",
      name: "sessions.recent.read",
      title: "Read Recent Sessions",
      category: "read_model",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readRecentSessions,
      order: 52
    }),
    commandContribution({
      id: "assistant.workbench.read",
      name: "workbench.read",
      title: "Read Workbench",
      category: "workbench",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readAssistantWorkbench,
      order: 54
    }),
    commandContribution({
      id: "assistant.transcript.read",
      name: "transcript.read",
      title: "Read Session Transcript",
      category: "read_model",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.readSessionTranscript,
      order: 58
    }),
    commandContribution({
      id: "assistant.context.refresh",
      name: "context.refresh",
      title: "Refresh Context",
      category: "context",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.refreshAgentContextProfile,
      order: 60
    }),
    commandContribution({
      id: "assistant.context.monitor.start",
      name: "context.monitor.start",
      title: "Start Context Monitor",
      category: "context",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.startAgentContextMonitor,
      order: 70
    }),
    commandContribution({
      id: "assistant.context.monitor.stop",
      name: "context.monitor.stop",
      title: "Stop Context Monitor",
      category: "context",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.stopAgentContextMonitor,
      order: 80
    }),
    commandContribution({
      id: "assistant.shutdown",
      name: "shutdown",
      title: "Shutdown",
      category: "lifecycle",
      paletteVisibility: "hidden",
      handlerRef: BACKEND_HANDLER_REFS.shutdown,
      order: 90
    })
  ]
}

function commandContribution(options: {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly category: string
  readonly paletteVisibility: "visible" | "hidden"
  readonly handlerRef: BackendHandlerRef
  readonly order: number
}): AppCommandContribution {
  const inputSchema = BACKEND_COMMAND_INPUT_SCHEMAS[options.handlerRef]
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.name,
      title: options.title,
      category: options.category,
      paletteVisibility: options.paletteVisibility,
      handlerRef: options.handlerRef,
      ...(inputSchema === undefined
        ? {}
        : { inputSchema })
    },
    order: options.order,
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "assistant.backend"
      },
      trust: "trusted"
    }
  }
}
