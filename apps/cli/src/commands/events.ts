import type { CoreStore } from "@wanex/storage"

export async function eventsValue(
  storage: CoreStore,
  request: {
    readonly sessionId?: string
    readonly limit?: number
  }
): Promise<unknown> {
  const events = await storage.queryEvents({
    ...(request.sessionId === undefined
      ? {}
      : { scope: { sessionId: request.sessionId } }),
    ...(request.limit === undefined ? {} : { limit: request.limit })
  })
  return {
    command: "events",
    events
  }
}
