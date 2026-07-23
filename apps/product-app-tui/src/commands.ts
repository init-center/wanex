import type { ProductAppTuiCommandRow } from "./types.js"

export const PRODUCT_APP_TUI_HANDLER_REFS = {
  refresh: "product-app-tui.handler.refresh",
  status: "product-app-tui.handler.status",
  readHome: "product-app-tui.handler.home.read",
  selectSession: "product-app-tui.handler.session.select",
  openWorkbench: "product-app-tui.handler.workbench.open",
  submitConversation: "product-app-tui.handler.conversation.submit",
  readConversationOperation: "product-app-tui.handler.conversation.read",
  cancelConversation: "product-app-tui.handler.conversation.cancel",
  regenerateConversation: "product-app-tui.handler.conversation.regenerate"
} as const

export const PRODUCT_APP_TUI_COMMANDS = {
  refresh: "product-app.refresh",
  status: "product-app.status",
  readHome: "product-app.home.read",
  selectSession: "product-app.session.select",
  openWorkbench: "product-app.workbench.open",
  submitConversation: "product-app.conversation.submit",
  readConversationOperation: "product-app.conversation.read",
  cancelConversation: "product-app.conversation.cancel",
  regenerateConversation: "product-app.conversation.regenerate"
} as const

export const productAppTuiCommandRows: readonly ProductAppTuiCommandRow[] = [
  {
    id: PRODUCT_APP_TUI_COMMANDS.refresh,
    title: "Refresh Product App",
    category: "App",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.refresh,
    mutatesState: false
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.status,
    title: "Read Product App status",
    category: "App",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.status,
    mutatesState: false
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.readHome,
    title: "Read Product App home",
    category: "App",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.readHome,
    mutatesState: false
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.selectSession,
    title: "Select session",
    category: "Workbench",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.selectSession,
    mutatesState: true
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.openWorkbench,
    title: "Open workbench",
    category: "Workbench",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.openWorkbench,
    mutatesState: true
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.submitConversation,
    title: "Submit conversation",
    category: "Conversation",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.submitConversation,
    mutatesState: true
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.readConversationOperation,
    title: "Read conversation operation",
    category: "Conversation",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.readConversationOperation,
    mutatesState: false
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.cancelConversation,
    title: "Cancel conversation",
    category: "Conversation",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.cancelConversation,
    mutatesState: true
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.regenerateConversation,
    title: "Regenerate conversation",
    category: "Conversation",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.regenerateConversation,
    mutatesState: true
  }
]

export function productAppTuiCommandRow(
  commandId: string
): ProductAppTuiCommandRow | undefined {
  return productAppTuiCommandRows.find((row) => row.id === commandId)
}
