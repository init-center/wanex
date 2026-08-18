import type {
  SurfaceClientEventsResult
} from "@wanex/product/surface"
import type {
  TuiRenderedEvents
} from "../model.js"

export function renderTuiEvents(options: {
  readonly result: SurfaceClientEventsResult
  readonly limit?: number
}): TuiRenderedEvents {
  if (!options.result.ok) {
    const lines = [
      "Events",
      "status:error",
      `error:${options.result.error.message}`
    ]
    return {
      kind: "tui.events",
      ok: false,
      eventCount: 0,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      lines,
      text: lines.join("\n")
    }
  }
  const lines = [
    "Events",
    `events:${options.result.events.length}`,
    ...options.result.events.map(
      (event) =>
        `  ${event.sequence}. ${event.type} command:${event.command}`
    )
  ]
  return {
    kind: "tui.events",
    ok: true,
    eventCount: options.result.events.length,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    lines,
    text: lines.join("\n")
  }
}
