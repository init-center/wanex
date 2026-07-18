import type { ProductAppTuiCommandRow } from "./types.js"

export const PRODUCT_APP_TUI_HANDLER_REFS = {
  refresh: "product-app-tui.handler.refresh",
  status: "product-app-tui.handler.status",
  readHome: "product-app-tui.handler.home.read",
  selectSession: "product-app-tui.handler.session.select",
  openWorkbench: "product-app-tui.handler.workbench.open",
  startWorkbench: "product-app-tui.handler.workbench.start",
  continueWorkbench: "product-app-tui.handler.workbench.continue"
} as const

export const PRODUCT_APP_TUI_COMMANDS = {
  refresh: "product-app.refresh",
  status: "product-app.status",
  readHome: "product-app.home.read",
  selectSession: "product-app.session.select",
  openWorkbench: "product-app.workbench.open",
  startWorkbench: "product-app.workbench.start",
  continueWorkbench: "product-app.workbench.continue"
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
    id: PRODUCT_APP_TUI_COMMANDS.startWorkbench,
    title: "Start workbench",
    category: "Workbench",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.startWorkbench,
    mutatesState: true
  },
  {
    id: PRODUCT_APP_TUI_COMMANDS.continueWorkbench,
    title: "Continue workbench",
    category: "Workbench",
    handlerRef: PRODUCT_APP_TUI_HANDLER_REFS.continueWorkbench,
    mutatesState: true
  }
]

export function productAppTuiCommandRow(
  commandId: string
): ProductAppTuiCommandRow | undefined {
  return productAppTuiCommandRows.find((row) => row.id === commandId)
}
