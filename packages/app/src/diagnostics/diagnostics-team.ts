import type {
  AppDiagnosticEntry,
  BaseTeamRoundResult
} from "./diagnostics-types.js"

export function teamRoundDiagnostic(
  teamRound: BaseTeamRoundResult,
  generatedAt: number
): AppDiagnosticEntry {
  return {
    id: `team-round:${teamRound.conversation.id}:${teamRound.stopReason}`,
    source: "team",
    severity: teamRound.stopReason === "max_turns" ? "info" : "warning",
    code: `team.round.${teamRound.stopReason}`,
    message: `Team round stopped: ${teamRound.stopReason}`,
    at: generatedAt,
    detail: {
      conversationId: teamRound.conversation.id,
      stopReason: teamRound.stopReason,
      turnCount: teamRound.turns.length
    }
  }
}
