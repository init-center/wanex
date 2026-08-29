import type { SessionRecord } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { codingSessionScope, sessionBelongsToCodingRepository } from "../session-scope.js"
import type {
  CodingSessionPage,
  CodingSessionSnapshot,
  CodingTurnPage,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest
} from "../types.js"
import { readCodingTurnPage } from "./turn.js"

const MAX_HOST_PAGE_SIZE = 101

type CodingStore = CoreStore & WorkspaceStore

export async function listCodingSessions(request: {
  readonly storage: CodingStore
  readonly repositoryId: string
  readonly page: ListCodingSessionsRequest
}): Promise<CodingSessionPage> {
  assertHostPageLimit(request.page.limit)
  const records = await request.storage.listSessions({
    scope: codingSessionScope(request.repositoryId),
    ...(request.page.before === undefined ? {} : { before: request.page.before }),
    limit: request.page.limit
  })
  return {
    items: records.map(projectSession),
    ...(records.length < request.page.limit
      ? {}
      : {
          continuation: {
            updatedAt: records.at(-1)!.updatedAt,
            sessionId: records.at(-1)!.id
          }
        })
  }
}

export async function readCodingSession(request: {
  readonly storage: CodingStore
  readonly repositoryId: string
  readonly sessionId: string
}): Promise<CodingSessionSnapshot | null> {
  const session = await request.storage.getSession(request.sessionId)
  return session === null ||
      !sessionBelongsToCodingRepository(session, request.repositoryId)
    ? null
    : projectSession(session)
}

export async function listCodingTurns(request: {
  readonly storage: CodingStore
  readonly repositoryId: string
  readonly workspaceId: string
  readonly page: ListCodingTurnsRequest
}): Promise<CodingTurnPage> {
  assertHostPageLimit(request.page.limit)
  return await readCodingTurnPage({
    storage: request.storage,
    repositoryId: request.repositoryId,
    workspaceId: request.workspaceId,
    sessionId: request.page.sessionId,
    ...(request.page.before === undefined ? {} : { before: request.page.before }),
    limit: request.page.limit
  })
}

function projectSession(session: SessionRecord): CodingSessionSnapshot {
  return {
    sessionId: session.id,
    ...(session.title === undefined ? {} : { title: session.title }),
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  }
}

function assertHostPageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HOST_PAGE_SIZE) {
    throw new Error(`Coding Host page limit must be between 1 and ${MAX_HOST_PAGE_SIZE}`)
  }
}
