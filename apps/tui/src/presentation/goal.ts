import type {
  GoalReadModel,
  ReadGoalResult
} from "@wanex/product/surface"
import { singleLine } from "../line-session/text.js"

export function renderTuiGoal(
  result: ReadGoalResult | GoalReadModel
): string {
  if (result.kind === "product.goal.no-session") {
    return `GOAL\nstate:no-session | ${result.message}`
  }
  if (result.kind === "product.goal.missing") {
    return `GOAL\nstate:missing${result.sessionId === undefined ? "" : ` | session:${result.sessionId}`}`
  }
  const goal = result.kind === "product.goal.found" ? result.goal : result
  const attempts = goal.attempts.flatMap((attempt) => [
    `attempt:${attempt.attemptNumber} | trigger:${attempt.trigger} | job:${attempt.jobId}`,
    ...(attempt.review === undefined
      ? []
      : [
          `  review:${attempt.review.disposition}${attempt.review.reason === undefined ? "" : ` | ${singleLine(attempt.review.reason)}`}`
        ]),
    ...attempt.verifications.map(
      (verification) =>
        `  verification:${verification.result}${verification.reason === undefined ? "" : ` | ${singleLine(verification.reason)}`}`
    )
  ])
  return [
    "GOAL",
    `state:${goal.state} | revision:${goal.revision} | session:${goal.sessionId}`,
    `goal:${goal.goalId}`,
    `objective:${singleLine(goal.objective)}`,
    `attempts:${goal.attemptCount}/${goal.stopPolicy.maxAttempts} | blocked-limit:${goal.stopPolicy.maxConsecutiveBlockedAttempts}`,
    ...goal.successCriteria.map(
      (criterion, index) =>
        `criterion:${index + 1} | ${singleLine(criterion.description)}`
    ),
    ...attempts,
    `controls:pause=${goal.canPause ? "yes" : "no"},resume=${goal.canResume ? "yes" : "no"},cancel=${goal.canCancel ? "yes" : "no"}`
  ].join("\n")
}
