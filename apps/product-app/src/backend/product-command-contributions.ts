import type {
  AppCommandContribution
} from "@wanex/extension"
import {
  PRODUCT_APP_BACKEND_HANDLER_REFS,
  type ProductAppBackendHandlerRef
} from "./product-command-handler-refs.js"

export function productAppBackendBuiltinCommandContributions():
  readonly AppCommandContribution[] {
  return [
    commandContribution({
      id: "product.agent.submit",
      name: "agent.submit",
      title: "Submit Agent Turn",
      category: "agent",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
      order: 10
    }),
    commandContribution({
      id: "product.status",
      name: "status",
      title: "Status",
      category: "system",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.status,
      order: 20
    }),
    commandContribution({
      id: "product.overview.read",
      name: "overview.read",
      title: "Read Product Overview",
      category: "read_model",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readProductOverview,
      order: 25
    }),
    commandContribution({
      id: "product.diagnostics.read",
      name: "diagnostics.read",
      title: "Read Diagnostics",
      category: "diagnostics",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readDiagnostics,
      order: 30
    }),
    commandContribution({
      id: "product.diagnostics.detail.read",
      name: "diagnostics.detail.read",
      title: "Read Diagnostics Detail",
      category: "diagnostics",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail,
      order: 35
    }),
    commandContribution({
      id: "product.support.build",
      name: "support.build",
      title: "Build Support Bundle",
      category: "diagnostics",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.buildSupportBundle,
      order: 40
    }),
    commandContribution({
      id: "product.provenance.read",
      name: "provenance.read",
      title: "Read Session Provenance",
      category: "read_model",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionInputProvenance,
      order: 50
    }),
    commandContribution({
      id: "product.sessions.recent.read",
      name: "sessions.recent.read",
      title: "Read Recent Sessions",
      category: "read_model",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readRecentSessions,
      order: 52
    }),
    commandContribution({
      id: "product.workbench.read",
      name: "workbench.read",
      title: "Read Workbench",
      category: "workbench",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readProductWorkbench,
      order: 54
    }),
    commandContribution({
      id: "product.transcript.read",
      name: "transcript.read",
      title: "Read Session Transcript",
      category: "read_model",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionTranscript,
      order: 58
    }),
    commandContribution({
      id: "product.context.refresh",
      name: "context.refresh",
      title: "Refresh Context",
      category: "context",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.refreshAgentContextProfile,
      order: 60
    }),
    commandContribution({
      id: "product.context.monitor.start",
      name: "context.monitor.start",
      title: "Start Context Monitor",
      category: "context",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.startAgentContextMonitor,
      order: 70
    }),
    commandContribution({
      id: "product.context.monitor.stop",
      name: "context.monitor.stop",
      title: "Stop Context Monitor",
      category: "context",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.stopAgentContextMonitor,
      order: 80
    }),
    commandContribution({
      id: "product.shutdown",
      name: "shutdown",
      title: "Shutdown",
      category: "lifecycle",
      handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.shutdown,
      order: 90
    })
  ]
}

function commandContribution(options: {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly category: string
  readonly handlerRef: ProductAppBackendHandlerRef
  readonly order: number
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.name,
      title: options.title,
      category: options.category,
      handlerRef: options.handlerRef
    },
    order: options.order,
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "product-app.backend"
      },
      trust: "trusted"
    }
  }
}
