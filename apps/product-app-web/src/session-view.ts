import type {
  ProductAppWebRecentSessionRow,
  ProductAppWebSnapshot
} from "./types.js"

type ProductAppHomeEnvelope = ProductAppWebSnapshot["home"]

export function projectProductAppWebRecentSessions(request: {
  readonly home: ProductAppHomeEnvelope
  readonly selectedSessionId: string | undefined
}): readonly ProductAppWebRecentSessionRow[] {
  if (!request.home.ok) {
    return []
  }
  return request.home.value.product.sessions.recent.map((session) => ({
    sessionId: session.sessionId,
    label: session.title ?? session.sessionId,
    kind: session.kind,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    selected: session.sessionId === request.selectedSessionId,
    archived: session.archivedAt !== undefined
  }))
}

export function selectedProductAppWebSessionTitle(
  sessions: readonly ProductAppWebRecentSessionRow[]
): string | undefined {
  return sessions.find((session) => session.selected)?.label
}
