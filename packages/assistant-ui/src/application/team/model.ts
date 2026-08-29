import type {
  TeamAvailability,
  TeamConversationPageReadModel,
  TeamConversationSummary
} from "@wanex/assistant/surface"

export type TeamViewState =
  | "unavailable"
  | "no-selection"
  | "missing"
  | "ready"
  | "failed"

export interface TeamViewModel {
  readonly kind: "web.team"
  readonly state: TeamViewState
  readonly conversations: readonly TeamConversationSummary[]
  readonly availability?: TeamAvailability
  readonly conversationId?: string
  readonly page?: TeamConversationPageReadModel
  readonly message?: string
}
