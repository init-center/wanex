import type {
  ProductAppTuiRenderedFrame,
  ProductAppTuiSurfaceSnapshot,
  RenderProductAppTuiFrameOptions
} from "./types.js"

const DEFAULT_MAX_PALETTE_ENTRIES = 8

export function renderProductAppTuiFrame(
  snapshot: ProductAppTuiSurfaceSnapshot,
  options: RenderProductAppTuiFrameOptions = {}
): ProductAppTuiRenderedFrame {
  const maxPaletteEntries =
    options.maxPaletteEntries ?? DEFAULT_MAX_PALETTE_ENTRIES
  const palette = snapshot.readModel.palette
  const renderedPalette = palette.slice(0, Math.max(0, maxPaletteEntries))
  const omittedPaletteCount = Math.max(0, palette.length - renderedPalette.length)
  const state = snapshot.status.ok ? snapshot.status.value.state : undefined
  const settings = snapshot.settings.ok ? snapshot.settings.value : undefined
  const eventCount = snapshot.events.ok ? snapshot.events.events.length : 0
  const productCommandCount = snapshot.commandCatalog.ok
    ? snapshot.commandCatalog.value.commands.length
    : 0
  const ready = snapshot.home.ok && snapshot.settings.ok
  const statusLabels = snapshot.readModel.statusItems.map((item) => item.label)
  const lines = [
    "Wanex Product App TUI",
    [
      `status:${ready ? "ready" : "not-ready"}`,
      `mode:${settings?.renderer.mode ?? state?.mode ?? "unknown"}`,
      `layout:${settings?.renderer.layout ?? state?.layout ?? "unknown"}`,
      `profile:${settings?.profile.activeProviderProfileId ?? "unknown"}`,
      `theme:${settings?.renderer.preferences.theme ?? state?.preferences.theme ?? "system"}`,
      `density:${settings?.renderer.preferences.density ?? state?.preferences.density ?? "comfortable"}`,
      `session:${state?.selectedSessionId ?? "none"}`,
      `product-commands:${productCommandCount}`,
      `events:${eventCount}`,
      `diagnostics:${snapshot.diagnostics.length}`
    ].join(" | "),
    "",
    "Status",
    ...statusLabels.map((label) => `  ${label}`),
    "",
    "Palette",
    ...renderedPalette.map(
      (entry, index) =>
        `  ${index + 1}. ${entry.command.commandId} - ${entry.title}`
    ),
    ...(omittedPaletteCount === 0
      ? []
      : [`  ... ${omittedPaletteCount} more`])
  ]
  return {
    kind: "product-app-tui.frame",
    generatedAt: snapshot.generatedAt,
    title: "Wanex Product App TUI",
    ready,
    mode: settings?.renderer.mode ?? state?.mode ?? "unknown",
    layout: settings?.renderer.layout ?? state?.layout ?? "unknown",
    ...(state?.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: state.selectedSessionId }),
    commandCount: snapshot.descriptor.ok
      ? snapshot.descriptor.value.commandCount
      : 0,
    productCommandCount,
    paletteCount: palette.length,
    renderedPaletteCount: renderedPalette.length,
    omittedPaletteCount,
    statusItemCount: snapshot.readModel.statusItems.length,
    diagnosticCount: snapshot.diagnostics.length,
    eventCount,
    lines,
    text: lines.join("\n")
  }
}
