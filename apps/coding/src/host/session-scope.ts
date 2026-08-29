import type { SessionRecord, SessionScope } from "@wanex/protocol"

const CODING_SESSION_SCOPE_KIND = "coding.repository"

export function codingSessionScope(repositoryId: string): SessionScope {
  return {
    kind: CODING_SESSION_SCOPE_KIND,
    id: repositoryId
  }
}

export function sessionBelongsToCodingRepository(
  session: SessionRecord,
  repositoryId: string
): boolean {
  const expected = codingSessionScope(repositoryId)
  return session.scope?.kind === expected.kind && session.scope.id === expected.id
}
