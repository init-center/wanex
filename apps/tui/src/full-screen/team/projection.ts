import type {
  TeamConversationPageReadModel,
  TeamDeliveryReadModel,
  TeamMessageReadModel,
  TeamParticipantReadModel,
  TeamRoundReadModel,
} from "@wanex/product"
import { terminalSingleLineText } from "../terminal-text.js"

export function projectTuiTeamTimeline(
  page: TeamConversationPageReadModel | undefined,
): string {
  if (page === undefined) return "Group conversation unavailable"
  if (page.messages.length === 0) {
    return page.conversation.mode === "coordinated"
      ? "Start the group conversation\nThe coordinator will return one public response."
      : "Start the group conversation\nActive agents may respond to the group."
  }

  const participants = new Map(
    page.participants.map((participant) => [participant.participantId, participant]),
  )
  const rounds = new Map(
    page.rounds.map((round) => [round.sourceMessageId, round]),
  )
  const deliveries = new Map<string, TeamDeliveryReadModel[]>()
  for (const delivery of page.deliveries) {
    const current = deliveries.get(delivery.roundId) ?? []
    current.push(delivery)
    deliveries.set(delivery.roundId, current)
  }

  return page.messages
    .map((message) => {
      const participant = participants.get(message.authorParticipantId)
      const round = message.roundId === undefined
        ? rounds.get(message.messageId)
        : page.rounds.find((candidate) => candidate.roundId === message.roundId)
      const lines = [
        `${participant?.displayName ?? "Participant"} | ${messageStatus(message)}`,
        ...message.content.map((part) => {
          if (part.type === "text") return part.text
          return `Resource | ${part.kind}${part.mediaType === undefined ? "" : ` | ${part.mediaType}`}`
        }),
      ]
      if (round !== undefined) {
        lines.push(roundSummary(round, page.conversation.mode))
        for (const delivery of deliveries.get(round.roundId) ?? []) {
          const deliveryParticipant = participants.get(delivery.participantId)
          lines.push(
            `  ${deliveryParticipant?.displayName ?? "Agent"} | ${deliveryStatus(delivery)}`,
          )
        }
      }
      return lines.join("\n")
    })
    .join("\n\n")
}

function messageStatus(message: TeamMessageReadModel): string {
  if (message.status === "sent") return "Sent"
  if (message.status === "queued") return "Queued"
  if (message.status === "failed") return "Failed"
  return "Superseded"
}

function roundSummary(
  round: TeamRoundReadModel,
  mode: TeamConversationPageReadModel["conversation"]["mode"],
): string {
  if (mode === "coordinated") {
    if (round.status === "running") return "Coordinator is responding"
    if (round.status === "completed") {
      return round.replied > 0 ? "Coordinator replied" : "Coordinator passed"
    }
    if (round.status === "partial") return "Coordinator did not finish"
    if (round.status === "failed") return "Coordinator response failed"
    return "Coordinator response cancelled"
  }
  if (round.status === "running") {
    return `${round.replied + round.passed} of ${round.expected} agents finished`
  }
  if (round.status === "completed") {
    return `${round.replied} replied${round.passed === 0 ? "" : `, ${round.passed} passed`}`
  }
  if (round.status === "partial") {
    return `${round.replied} replied, ${round.failed + round.cancelled} did not finish`
  }
  return round.status === "failed" ? "Round failed" : "Round cancelled"
}

function deliveryStatus(delivery: TeamDeliveryReadModel): string {
  if (delivery.status === "responding") return "Responding"
  if (delivery.status === "replied") return "Replied"
  if (delivery.status === "passed") return "Passed"
  if (delivery.status === "failed") return "Failed"
  if (delivery.status === "cancelled") return "Cancelled"
  return "Waiting"
}

export function projectTuiTeamParticipant(
  participant: TeamParticipantReadModel,
): string {
  const role = participant.role === undefined ? "" : ` | ${terminalSingleLineText(participant.role, { maxWidth: 80, fallback: "" })}`
  return `${terminalSingleLineText(participant.displayName, { maxWidth: 80, fallback: "Participant" })} | ${participantState(participant.state)}${role}`
}

function participantState(state: TeamParticipantReadModel["state"]): string {
  if (state === "active") return "Active"
  if (state === "muted") return "Muted"
  return "Left"
}
