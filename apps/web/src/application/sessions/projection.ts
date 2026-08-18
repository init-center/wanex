import type {
  RecentSessionRow,
  Snapshot
} from "../model.js"

type HomeEnvelope = Snapshot["home"]
type HomeValue = Extract<
  HomeEnvelope,
  { readonly ok: true }
>["value"]
type HomeSession =
  HomeValue["product"]["sessions"]["recent"][number]

export function projectRecentSessions(request: {
  readonly home: HomeEnvelope
  readonly selectedSessionId: string | undefined
}): readonly RecentSessionRow[] {
  if (!request.home.ok) {
    return []
  }
  return projectSessions(
    request.home.value.product.sessions.recent,
    request.selectedSessionId
  )
}

export function projectArchivedSessions(request: {
  readonly home: HomeEnvelope
}): readonly RecentSessionRow[] {
  if (!request.home.ok) {
    return []
  }
  return projectSessions(request.home.value.product.sessions.archived, undefined)
}

export function encodeSessionReference(session: {
  readonly sessionId: string
  readonly revision: number
}): string {
  return JSON.stringify([session.sessionId, session.revision])
}

function projectSessions(
  sessions: readonly HomeSession[],
  selectedSessionId: string | undefined
): readonly RecentSessionRow[] {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    label: session.title ?? session.sessionId,
    kind: session.kind,
    status: session.status,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    selected: session.sessionId === selectedSessionId,
    archived: session.archivedAt !== undefined
  }))
}

export function resolveSelectedSessionTitle(
  sessions: readonly RecentSessionRow[]
): string | undefined {
  return sessions.find((session) => session.selected)?.label
}
