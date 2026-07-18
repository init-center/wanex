import type {
  ProductAppTuiAgentTurnBlockedOutcome,
  ProductAppTuiAgentTurnSummary
} from "./line-session-product-result.js"
import { singleLine } from "./line-session-text.js"

export function renderProductAppTuiAgentTurn(
  summary: ProductAppTuiAgentTurnSummary
): string {
  return [
    "Wanex Product App Agent Turn",
    `session:${summary.sessionId}`,
    `messages:${summary.messageCount}`,
    `jobs:${summary.jobStatuses.length === 0 ? "none" : summary.jobStatuses.join(",")}`,
    "",
    `assistant:${singleLine(summary.assistantText)}`
  ].join("\n")
}

export function renderProductAppTuiBlockedAgentTurn(
  outcome: ProductAppTuiAgentTurnBlockedOutcome
): string {
  return [
    "Wanex Product App Agent Turn",
    `status:blocked`,
    `command:${outcome.command}`,
    `code:${outcome.code}`,
    `category:${outcome.category}`,
    "",
    `message:${singleLine(outcome.message)}`
  ].join("\n")
}
