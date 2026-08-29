import type { CodingRepository } from "../host/types.js"
import {
  decodeSessionCursor,
  decodeTurnCursor,
  encodeSessionCursor,
  encodeTurnCursor
} from "./cursor.js"
import { CodingApplicationError } from "./errors.js"
import type {
  CodingSessionPage,
  CodingSessionReadModel,
  CodingTurnPage,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest,
  ReadCodingSessionRequest
} from "./model.js"
import { projectTurnSnapshot } from "./turn.js"

const DEFAULT_SESSION_PAGE_SIZE = 30
const DEFAULT_TURN_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export async function listApplicationSessions(request: {
  readonly repository: CodingRepository
  readonly input: ListCodingSessionsRequest
}): Promise<CodingSessionPage> {
  const projectId = request.repository.repositoryId
  const limit = pageLimit(request.input.limit, DEFAULT_SESSION_PAGE_SIZE)
  const page = await request.repository.listSessions({
    ...(request.input.cursor === undefined
      ? {}
      : { before: decodeSessionCursor(request.input.cursor, projectId) }),
    limit: limit + 1
  })
  const selected = page.items.slice(0, limit)
  const hasMore = page.items.length > limit
  const last = selected.at(-1)
  return {
    sessions: selected.map((session) => ({
      projectId,
      ...session
    })),
    returnedCount: selected.length,
    hasMore,
    ...(!hasMore || last === undefined
      ? {}
      : {
          nextCursor: encodeSessionCursor(projectId, {
            updatedAt: last.updatedAt,
            sessionId: last.sessionId
          })
        })
  }
}

export async function readApplicationSession(request: {
  readonly repository: CodingRepository
  readonly input: ReadCodingSessionRequest
}): Promise<CodingSessionReadModel | null> {
  const session = await request.repository.getSession(request.input.sessionId)
  return session === null
    ? null
    : { projectId: request.repository.repositoryId, ...session }
}

export async function listApplicationTurns(request: {
  readonly repository: CodingRepository
  readonly input: ListCodingTurnsRequest
}): Promise<CodingTurnPage> {
  const projectId = request.repository.repositoryId
  const sessionId = request.input.sessionId
  const limit = pageLimit(request.input.limit, DEFAULT_TURN_PAGE_SIZE)
  const page = await request.repository.listTurns({
    sessionId,
    ...(request.input.cursor === undefined
      ? {}
      : { before: decodeTurnCursor(request.input.cursor, projectId, sessionId) }),
    limit: limit + 1
  })
  const selected = page.items.length > limit
    ? page.items.slice(page.items.length - limit)
    : page.items
  const hasMore = page.items.length > limit || page.continuation !== undefined
  const continuation = page.items.length > limit
    ? selected[0] === undefined
      ? undefined
      : { createdAt: selected[0].createdAt, turnId: selected[0].reference.turnId }
    : page.continuation
  return {
    turns: selected.map((turn) => projectTurnSnapshot(projectId, turn)),
    returnedCount: selected.length,
    hasMore,
    ...(!hasMore || continuation === undefined
      ? {}
      : { nextCursor: encodeTurnCursor(projectId, sessionId, continuation) })
  }
}

function pageLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new CodingApplicationError(
      "invalid_request",
      `Coding page limit must be between 1 and ${MAX_PAGE_SIZE}`
    )
  }
  return limit
}
