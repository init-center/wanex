import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type SelectList,
  type SelectListTheme
} from "@earendil-works/pi-tui"
import type { GoalReadModel } from "@wanex/assistant"
import { createTerminalSafeSelectList } from "./components.js"
import { boundedTuiLines } from "./projection.js"
import { terminalSingleLineText } from "./terminal-text.js"

export type TuiGoalAction =
  | "pause"
  | "resume"
  | "cancel"
  | "start-new"
  | "close"

export class TuiGoalReviewOverlay implements Component {
  private readonly list: SelectList

  constructor(
    private readonly options: {
      readonly goal?: GoalReadModel
      readonly loading?: boolean
      readonly terminalRows: () => number
      readonly actions: readonly {
        readonly value: TuiGoalAction
        readonly label: string
      }[]
      readonly theme: SelectListTheme
      readonly onAction: (action: TuiGoalAction) => void
      readonly onCancel: () => void
    }
  ) {
    this.list = createTerminalSafeSelectList(
      options.actions.map((action) => ({
        value: action.value,
        label: action.label
      })),
      6,
      options.theme,
      (item) => options.onAction(item.value as TuiGoalAction)
    )
    this.list.onCancel = options.onCancel
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    const details = this.details(safeWidth)
    const maxRows = Math.max(8, Math.floor(this.options.terminalRows() * 0.82))
    const detailBudget = Math.max(1, maxRows - this.options.actions.length - 4)
    const visibleDetails = details.slice(0, detailBudget)
    if (details.length > detailBudget) {
      visibleDetails[visibleDetails.length - 1] = fit(
        "... Goal details truncated",
        safeWidth
      )
    }
    return [
      fit("Goal", safeWidth),
      ...visibleDetails,
      "",
      ...this.list.render(safeWidth),
      "",
      fit("Up/Down choose | Enter confirm | Esc close", safeWidth)
    ]
  }

  handleInput(data: string): void {
    this.list.handleInput(data)
  }

  private details(width: number): string[] {
    if (this.options.loading) return [fit("Reading current Goal state...", width)]
    const goal = this.options.goal
    if (goal === undefined) return []
    const details: string[] = [
      fit(`State: ${goal.state} | Revision: ${goal.revision}`, width),
      ...boundedTuiLines(`Objective: ${goal.objective}`, width, 4),
      fit(
        `Stop policy: ${goal.stopPolicy.maxAttempts} attempts, ${goal.stopPolicy.maxConsecutiveBlockedAttempts} blocked in a row`,
        width
      )
    ]
    if (goal.stopPolicy.deadlineAt !== undefined || goal.stopPolicy.budget !== undefined) {
      details.push(fit("Additional deadline or budget limits apply", width))
    }
    details.push(fit("Success criteria", width))
    for (const [index, criterion] of goal.successCriteria.slice(0, 8).entries()) {
      details.push(
        ...boundedTuiLines(`${index + 1}. ${criterion.description}`, width, 2)
      )
    }
    if (goal.successCriteria.length > 8) {
      details.push(fit(`... ${goal.successCriteria.length - 8} more criteria`, width))
    }
    if (goal.reason.detail !== undefined) {
      details.push(...boundedTuiLines(`Status: ${goal.reason.detail}`, width, 2))
    }
    for (const attempt of goal.attempts.slice(-6)) {
      details.push(
        fit(
          `Attempt ${attempt.attemptNumber}: ${terminalSingleLineText(attempt.trigger, {
            maxWidth: 128,
            fallback: "unknown"
          })}`,
          width
        )
      )
      if (attempt.review !== undefined) {
        details.push(
          ...boundedTuiLines(
            `Review: ${attempt.review.disposition}${attempt.review.reason === undefined ? "" : ` - ${attempt.review.reason}`}`,
            width,
            2
          )
        )
      }
      for (const [index, verification] of attempt.verifications.entries()) {
        details.push(
          ...boundedTuiLines(
            `Verification ${index + 1}: ${verification.result}${verification.reason === undefined ? "" : ` - ${verification.reason}`}`,
            width,
            2
          )
        )
      }
    }
    return details
  }
}

function fit(text: string, width: number): string {
  const safe = terminalSingleLineText(text, {
    maxWidth: Math.max(1, width),
    fallback: ""
  })
  return visibleWidth(safe) <= width ? safe : truncateToWidth(safe, width)
}
