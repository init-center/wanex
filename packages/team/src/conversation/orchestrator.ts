import {
  getSpeakerHandler,
  selectNextSpeaker,
  validateTeamRoundPolicy
} from "./policy.js"
import { listParticipants } from "./participant.js"
import { requireConversation } from "./conversation.js"
import { appendTurn, listTurns } from "./turn.js"
import type {
  OrchestrateTeamRoundRequest,
  TeamRoundResult
} from "./types.js"
import type { TeamConversationStorage } from "./storage.js"

export async function orchestrateRound(
  storage: TeamConversationStorage,
  request: OrchestrateTeamRoundRequest
): Promise<TeamRoundResult> {
  validateTeamRoundPolicy(request.policy)
  const conversation = await requireConversation(storage, request.conversationId)
  if (conversation.state !== "open") {
    return {
      conversation,
      turns: [],
      stopReason: "conversation_not_open"
    }
  }
  const participants = await listParticipants(storage, conversation.id, "active")
  const emitted = []
  let turns = await listTurns(storage, conversation.id)
  for (let index = 0; index < request.policy.maxTurns; index += 1) {
    const speaker = selectNextSpeaker({
      conversation,
      participants,
      turns,
      policy: request.policy
    })
    if (speaker === undefined) {
      return {
        conversation,
        turns: emitted,
        stopReason: "no_active_speaker"
      }
    }
    const handler = getSpeakerHandler(request.speakers, speaker.id)
    if (handler === undefined) {
      return {
        conversation,
        turns: emitted,
        stopReason: "speaker_not_registered"
      }
    }
    const response = await handler({
      conversation,
      speaker,
      participants,
      turns,
      turnIndex: index
    })
    if (response === undefined || response === null || response.content.length === 0) {
      return {
        conversation,
        turns: emitted,
        stopReason: "empty_response"
      }
    }
    const turn = await appendTurn(storage, {
      conversationId: conversation.id,
      speakerParticipantId: speaker.id,
      ...(response.audienceParticipantIds === undefined
        ? {}
        : { audienceParticipantIds: response.audienceParticipantIds }),
      ...(response.kind === undefined ? {} : { kind: response.kind }),
      content: response.content,
      ...(response.metadata === undefined ? {} : { metadata: response.metadata })
    })
    emitted.push(turn)
    turns = [...turns, turn]
  }
  return {
    conversation,
    turns: emitted,
    stopReason: "max_turns"
  }
}
