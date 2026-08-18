import { randomUUID } from "node:crypto"

import type {
  TeamConversationPageReadModel,
  TeamParticipantReadModel,
} from "@wanex/product"

export interface TuiTeamDraft {
  readonly title: string
  readonly mode: "coordinated" | "discussion"
}

export function createTeamIdempotencyKey(scope: "conversation" | "participant" | "round"): string {
  return `tui-team-${scope}:${randomUUID()}`
}

export function participantIsCurrentCoordinator(
  page: TeamConversationPageReadModel,
  participant: TeamParticipantReadModel,
): boolean {
  return page.conversation.coordinatorParticipantId === participant.participantId
}

export function participantCanChangeState(
  participant: TeamParticipantReadModel,
): boolean {
  return participant.kind === "agent" && participant.state !== "left"
}
