import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  buildTuiShellReadModel,
  type TuiShellReadModel
} from "./tui/shell-core/index.js"
import {
  resolveTuiContributions,
  type TuiCommandPaletteContribution,
  type TuiContribution,
  type TuiKeybindingContribution,
  type TuiNotificationContribution,
  type TuiPromptDecorationContribution,
  type TuiStatusItemContribution,
  type TuiThemeContribution
} from "./tui/surface/index.js"
import {
  PRODUCT_APP_TUI_COMMANDS,
  productAppTuiCommandRows
} from "./commands.js"
import type {
  ProductAppTuiCommandRow,
  ProductAppTuiSurfaceSnapshot
} from "./types.js"

export const PRODUCT_APP_TUI_PROVENANCE = {
  source: {
    kind: "builtin",
    scope: "builtin",
    id: "product-app-tui",
    label: "Product App TUI"
  },
  trust: "trusted"
} as const

export function buildProductAppTuiReadModel(
  snapshot: Omit<ProductAppTuiSurfaceSnapshot, "readModel" | "contributions">
): {
  readonly readModel: TuiShellReadModel
  readonly contributions: readonly TuiContribution[]
} {
  const app = resolveAppExtensionContributions(
    productAppTuiCommandRows.map(productAppTuiCommandRowToAppContribution)
  )
  const contributions = productAppTuiContributions(snapshot)
  const tui = resolveTuiContributions(contributions)
  return {
    contributions,
    readModel: buildTuiShellReadModel({
      app,
      tui,
      includeSourceDiagnostics: true
    })
  }
}

export function productAppTuiCommandRowToAppContribution(
  command: ProductAppTuiCommandRow
): AppCommandContribution {
  return {
    id: command.id,
    domain: "command",
    value: {
      name: command.id,
      title: command.title,
      handlerRef: command.handlerRef,
      category: command.category,
      aliases: []
    },
    provenance: PRODUCT_APP_TUI_PROVENANCE
  }
}

export function productAppTuiContributions(
  snapshot: Omit<ProductAppTuiSurfaceSnapshot, "readModel" | "contributions">
): readonly TuiContribution[] {
  return [
    ...productAppTuiCommandPaletteContributions(),
    ...productAppTuiKeybindingContributions(),
    ...productAppTuiStatusItemContributions(snapshot),
    ...productAppTuiPromptDecorationContributions(snapshot),
    ...productAppTuiNotificationContributions(snapshot),
    productAppTuiThemeContribution()
  ]
}

function productAppTuiCommandPaletteContributions(): TuiCommandPaletteContribution[] {
  return productAppTuiCommandRows.map((command, index) => ({
    id: `product-app-tui.palette.${paletteId(command.id)}`,
    domain: "command_palette",
    value: {
      commandId: command.id,
      title: command.title,
      category: command.category
    },
    provenance: PRODUCT_APP_TUI_PROVENANCE,
    order: index * 10
  }))
}

function productAppTuiKeybindingContributions(): TuiKeybindingContribution[] {
  return [
    keybinding("product-app-tui.key.refresh", "ctrl+r", PRODUCT_APP_TUI_COMMANDS.refresh),
    keybinding("product-app-tui.key.home", "ctrl+o", PRODUCT_APP_TUI_COMMANDS.readHome),
    keybinding(
      "product-app-tui.key.workbench",
      "ctrl+w",
      PRODUCT_APP_TUI_COMMANDS.openWorkbench
    )
  ]
}

function productAppTuiStatusItemContributions(
  snapshot: Omit<ProductAppTuiSurfaceSnapshot, "readModel" | "contributions">
): TuiStatusItemContribution[] {
  const state = snapshot.status.ok ? snapshot.status.value.state : undefined
  const settings = snapshot.settings.ok ? snapshot.settings.value : undefined
  const providerReadiness = snapshot.home.ok
    ? snapshot.home.value.providerReadiness.status
    : "unknown"
  return [
    statusItem(
      "product-app-tui.status.ready",
      "product-app-tui.ready",
      snapshot.home.ok ? "ready" : "not-ready",
      "left",
      10,
      PRODUCT_APP_TUI_COMMANDS.refresh
    ),
    statusItem(
      "product-app-tui.status.mode",
      "product-app-tui.mode",
      `mode:${settings?.renderer.mode ?? state?.mode ?? "unknown"}`,
      "right",
      20,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.layout",
      "product-app-tui.layout",
      `layout:${settings?.renderer.layout ?? state?.layout ?? "unknown"}`,
      "right",
      30,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.profile",
      "product-app-tui.profile",
      `profile:${settings?.profile.activeProviderProfileId ?? "unknown"}`,
      "right",
      40,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.provider-readiness",
      "product-app-tui.provider-readiness",
      `provider:${providerReadiness}`,
      "right",
      45,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.theme",
      "product-app-tui.theme",
      `theme:${settings?.renderer.preferences.theme ?? state?.preferences.theme ?? "system"}`,
      "right",
      50,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.density",
      "product-app-tui.density",
      `density:${settings?.renderer.preferences.density ?? state?.preferences.density ?? "comfortable"}`,
      "right",
      60,
      PRODUCT_APP_TUI_COMMANDS.status
    ),
    statusItem(
      "product-app-tui.status.session",
      "product-app-tui.session",
      `session:${state?.selectedSessionId ?? "none"}`,
      "right",
      70,
      PRODUCT_APP_TUI_COMMANDS.openWorkbench
    )
  ]
}

function productAppTuiPromptDecorationContributions(
  _snapshot: Omit<ProductAppTuiSurfaceSnapshot, "readModel" | "contributions">
): TuiPromptDecorationContribution[] {
  return [
    {
      id: "product-app-tui.prompt.ask",
      domain: "prompt_decoration",
      value: {
        decorationId: "product-app-tui.ask",
        placement: "placeholder",
        text: "Submit a message",
        commandId: PRODUCT_APP_TUI_COMMANDS.submitConversation
      },
      provenance: PRODUCT_APP_TUI_PROVENANCE
    }
  ]
}

function productAppTuiNotificationContributions(
  snapshot: Omit<ProductAppTuiSurfaceSnapshot, "readModel" | "contributions">
): TuiNotificationContribution[] {
  if (snapshot.diagnostics.length === 0) {
    return []
  }
  const errorCount = snapshot.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length
  return [
    {
      id: "product-app-tui.notification.diagnostics",
      domain: "notification",
      value: {
        notificationId: "product-app-tui.diagnostics",
        level: errorCount > 0 ? "error" : "warning",
        title: "Product App TUI diagnostics",
        message: `diagnostics:${snapshot.diagnostics.length}`,
        commandId: PRODUCT_APP_TUI_COMMANDS.refresh
      },
      provenance: PRODUCT_APP_TUI_PROVENANCE
    }
  ]
}

function productAppTuiThemeContribution(): TuiThemeContribution {
  return {
    id: "product-app-tui.theme.default",
    domain: "theme",
    value: {
      themeId: "product-app.default",
      displayName: "Product App Default",
      colors: {
        foreground: "#f6f7f8",
        background: "#101214",
        accent: "#5fc8d8",
        warning: "#f3c969",
        error: "#ff6f7d"
      }
    },
    provenance: PRODUCT_APP_TUI_PROVENANCE
  }
}

function keybinding(
  id: string,
  key: string,
  commandId: string
): TuiKeybindingContribution {
  return {
    id,
    domain: "keybinding",
    value: {
      key,
      commandId,
      platform: "all"
    },
    provenance: PRODUCT_APP_TUI_PROVENANCE
  }
}

function statusItem(
  id: string,
  itemId: string,
  label: string,
  alignment: "left" | "right",
  priority: number,
  commandId: string
): TuiStatusItemContribution {
  return {
    id,
    domain: "status_item",
    value: {
      itemId,
      label,
      alignment,
      priority,
      commandId
    },
    provenance: PRODUCT_APP_TUI_PROVENANCE
  }
}

function paletteId(commandId: string): string {
  return commandId.replace(/^product-app\./, "").replace(/\./g, "-")
}
