import type {
  TeamConversationPageReadModel,
  TeamRoundReceipt,
} from "@wanex/assistant"
import type { TuiFullScreenClient } from "../types.js"
import { createTeamIdempotencyKey } from "./model.js"

export interface TuiTeamComposerAvailability {
  readonly canDraft: boolean
  readonly canSubmit: boolean
  readonly message: string
}

export function teamComposerAvailability(options: {
  readonly page: TeamConversationPageReadModel | undefined
  readonly providerCanRun: boolean
}): TuiTeamComposerAvailability {
  const page = options.page
  if (page === undefined) {
    return { canDraft: false, canSubmit: false, message: "Group conversation unavailable" }
  }
  if (page.conversation.state !== "open") {
    return { canDraft: false, canSubmit: false, message: "This group is closed" }
  }
  if (page.conversation.activeAgentCount === 0) {
    return { canDraft: true, canSubmit: false, message: "Add an agent before sending" }
  }
  if (
    page.conversation.mode === "coordinated" &&
    page.conversation.coordinatorParticipantId === undefined
  ) {
    return { canDraft: true, canSubmit: false, message: "Choose a coordinator before sending" }
  }
  if (page.conversation.activeRound) {
    return { canDraft: true, canSubmit: false, message: "Waiting for the current round to finish" }
  }
  if (!options.providerCanRun) {
    return { canDraft: true, canSubmit: false, message: "Connect a model in Settings to send" }
  }
  return {
    canDraft: true,
    canSubmit: true,
    message: page.conversation.mode === "coordinated"
      ? "One coordinated response"
      : "Active agents may respond",
  }
}

export async function submitTuiTeamText(options: {
  readonly client: Pick<TuiFullScreenClient, "submitTeamRound">
  readonly page: TeamConversationPageReadModel
  readonly text: string
}): Promise<
  | { readonly accepted: true; readonly receipt: TeamRoundReceipt }
  | { readonly accepted: false; readonly message: string }
> {
  const text = options.text.trim()
  if (text.length === 0) return { accepted: false, message: "Message is empty" }
  const envelope = await options.client.submitTeamRound({
    conversationId: options.page.conversation.conversationId,
    text,
    idempotencyKey: createTeamIdempotencyKey("round"),
  })
  return envelope.ok
    ? { accepted: true, receipt: envelope.value }
    : { accepted: false, message: envelope.error.message }
}
