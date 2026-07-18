import type {
  BuildTuiShellReadModelRequest,
  SourceDiagnostic,
  TuiShellDiagnostic,
  TuiShellReadModel
} from "./types.js"
import { createTuiShellCommandResolvers } from "./command-resolution.js"
import {
  keybinding,
  notification,
  paletteEntry,
  panel,
  promptDecoration,
  statusItem,
  theme
} from "./read-model-projections.js"

export function buildTuiShellReadModel(
  request: BuildTuiShellReadModelRequest
): TuiShellReadModel {
  const commands = request.app.byDomain.command.byId
  const diagnostics: TuiShellDiagnostic[] = []
  if (request.includeSourceDiagnostics === true) {
    diagnostics.push(
      ...request.app.diagnostics.map((diagnostic) =>
        sourceDiagnostic("tui-shell.app_diagnostic", diagnostic)
      ),
      ...request.tui.diagnostics.map((diagnostic) =>
        sourceDiagnostic("tui-shell.tui_diagnostic", diagnostic)
      )
    )
  }

  const { resolveRequiredCommand, resolveOptionalCommand } =
    createTuiShellCommandResolvers({ commands, diagnostics })

  return {
    palette: request.tui.byDomain.command_palette.all.map((contribution) =>
      paletteEntry(contribution, resolveRequiredCommand)
    ),
    keybindings: request.tui.byDomain.keybinding.all.map((contribution) =>
      keybinding(contribution, resolveRequiredCommand)
    ),
    panels: request.tui.byDomain.panel.all.map(panel),
    statusItems: request.tui.byDomain.status_item.all
      .map((contribution) =>
        statusItem(contribution, resolveOptionalCommand)
      )
      .sort(
        (left, right) =>
          left.alignment.localeCompare(right.alignment) ||
          left.priority - right.priority ||
          left.id.localeCompare(right.id)
      ),
    promptDecorations: request.tui.byDomain.prompt_decoration.all.map(
      (contribution) =>
        promptDecoration(contribution, resolveOptionalCommand)
    ),
    themes: request.tui.byDomain.theme.all.map(theme),
    notifications: request.tui.byDomain.notification.all.map((contribution) =>
      notification(contribution, resolveOptionalCommand)
    ),
    diagnostics
  }
}

function sourceDiagnostic(
  code: "tui-shell.app_diagnostic" | "tui-shell.tui_diagnostic",
  diagnostic: SourceDiagnostic
): TuiShellDiagnostic {
  return {
    code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.contributionId === undefined
      ? {}
      : { contributionId: diagnostic.contributionId }),
    ...(diagnostic.sourceId === undefined
      ? {}
      : { sourceId: diagnostic.sourceId }),
    ...(diagnostic.metadata === undefined ? {} : { metadata: diagnostic.metadata })
  }
}
