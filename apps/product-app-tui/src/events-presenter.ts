import type {
  ProductAppSurfaceClientEventsResult
} from "@wanex/product-app/surface-client"
import type {
  ProductAppTuiRenderedEvents
} from "./types.js"

export function renderProductAppTuiEvents(options: {
  readonly result: ProductAppSurfaceClientEventsResult
  readonly limit?: number
}): ProductAppTuiRenderedEvents {
  if (!options.result.ok) {
    const lines = [
      "Wanex Product App Surface Events",
      "status:error",
      `error:${options.result.error.message}`
    ]
    return {
      kind: "product-app-tui.events",
      ok: false,
      eventCount: 0,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      lines,
      text: lines.join("\n")
    }
  }
  const lines = [
    "Wanex Product App Surface Events",
    `events:${options.result.events.length}`,
    ...options.result.events.map(
      (event) =>
        `  ${event.sequence}. ${event.type} command:${event.command}`
    )
  ]
  return {
    kind: "product-app-tui.events",
    ok: true,
    eventCount: options.result.events.length,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    lines,
    text: lines.join("\n")
  }
}
