import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type SelectList,
  type SelectListTheme
} from "@earendil-works/pi-tui"
import type {
  ConversationRecoveryDecision,
  ConversationRecoveryItem
} from "@wanex/product"
import { createTerminalSafeSelectList } from "./components.js"
import { boundedTuiLines } from "./projection.js"
import { terminalSingleLineText } from "./terminal-text.js"

export interface TuiRecoveryAction {
  readonly item: ConversationRecoveryItem
  readonly decision: ConversationRecoveryDecision
}

export class TuiRecoveryReviewOverlay implements Component {
  private readonly list: SelectList
  private readonly actionCount: number

  constructor(
    private readonly options: {
      readonly items: readonly ConversationRecoveryItem[]
      readonly terminalRows: () => number
      readonly theme: SelectListTheme
      readonly onAction: (action: TuiRecoveryAction) => void
      readonly onCancel: () => void
    }
  ) {
    const actions = recoveryActions(options.items)
    this.actionCount = actions.length
    this.list = createTerminalSafeSelectList(
      actions.map((action, index) => ({
        value: String(index),
        label: `${action.item.tool.title}: ${decisionLabel(action.decision)}`
      })),
      8,
      options.theme,
      (selected) => {
        const action = actions[Number(selected.value)]
        if (action !== undefined) options.onAction(action)
      }
    )
    this.list.onCancel = options.onCancel
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    const details = this.options.items.flatMap((item, index) => [
      fit(
        `${index + 1}. ${item.tool.title} | ${item.tool.risk} | ${item.tool.idempotent ? "idempotent" : "non-idempotent"}`,
        safeWidth
      ),
      ...boundedTuiLines(item.evidence.message, safeWidth, 3),
      fit(
        `Attempts: ${item.attemptCount}${item.attemptsTruncated ? "+" : ""}${item.attempts.length === 0 ? "" : ` | latest ${item.attempts.at(-1)?.state ?? "unknown"}`}`,
        safeWidth
      )
    ])
    const maxRows = Math.max(8, Math.floor(this.options.terminalRows() * 0.82))
    const detailBudget = Math.max(1, maxRows - this.actionCount - 5)
    const visibleDetails = details.slice(0, detailBudget)
    if (details.length > detailBudget) {
      visibleDetails[visibleDetails.length - 1] = fit(
        "... Recovery details truncated",
        safeWidth
      )
    }
    return [
      fit("Recovery required", safeWidth),
      fit("Review ambiguous Tool work. Wanex will not replay it automatically.", safeWidth),
      ...visibleDetails,
      "",
      ...this.list.render(safeWidth),
      "",
      fit("Up/Down choose | Enter continue | Esc later", safeWidth)
    ]
  }

  handleInput(data: string): void {
    this.list.handleInput(data)
  }
}

export function decisionLabel(
  decision: ConversationRecoveryDecision
): string {
  switch (decision) {
    case "confirm_succeeded":
      return "Confirm succeeded"
    case "confirm_failed":
      return "Confirm failed"
    case "retry":
      return "Retry"
    case "abandon_turn":
      return "Abandon turn"
  }
}

function recoveryActions(
  items: readonly ConversationRecoveryItem[]
): readonly TuiRecoveryAction[] {
  return items.flatMap((item) =>
    item.availableDecisions.map((decision) => ({ item, decision }))
  )
}

function fit(text: string, width: number): string {
  const safe = terminalSingleLineText(text, {
    maxWidth: Math.max(1, width),
    fallback: ""
  })
  return visibleWidth(safe) <= width ? safe : truncateToWidth(safe, width)
}
