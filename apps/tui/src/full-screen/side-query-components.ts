import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type SelectList,
  type SelectListTheme
} from "@earendil-works/pi-tui"
import type { SideQueryReadModel } from "@wanex/assistant"
import { createTerminalSafeSelectList } from "./components.js"
import { boundedTuiLines } from "./projection.js"
import { terminalSingleLineText } from "./terminal-text.js"

export type TuiSideQueryAction =
  | "cancel"
  | "ask-another"
  | "dismiss"
  | "close"

export class TuiSideQueryReviewOverlay implements Component {
  private readonly list: SelectList

  constructor(
    private readonly options: {
      readonly query?: SideQueryReadModel
      readonly loading?: boolean
      readonly contextChanged?: boolean
      readonly terminalRows: () => number
      readonly actions: readonly {
        readonly value: TuiSideQueryAction
        readonly label: string
      }[]
      readonly theme: SelectListTheme
      readonly onAction: (action: TuiSideQueryAction) => void
      readonly onCancel: () => void
    }
  ) {
    this.list = createTerminalSafeSelectList(
      options.actions.map((action) => ({
        value: action.value,
        label: action.label
      })),
      5,
      options.theme,
      (item) => options.onAction(item.value as TuiSideQueryAction)
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
        "... Side Query answer truncated",
        safeWidth
      )
    }
    return [
      fit("Side Query", safeWidth),
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
    if (this.options.loading) return [fit("Reading Side Query state...", width)]
    const query = this.options.query
    if (query === undefined) return []
    const details = [
      fit(`State: ${query.state}`, width),
      ...(this.options.contextChanged === true
        ? [fit("Question belongs to the conversation selected when it started.", width)]
        : []),
      ...boundedTuiLines(`Question: ${query.question}`, width, 4)
    ]
    if (query.state === "running") {
      details.push(fit("Waiting for the temporary answer...", width))
    }
    if (query.answerText !== undefined) {
      details.push(fit("Answer", width))
      details.push(...boundedTuiLines(query.answerText, width, 12))
      if (query.answerTruncated === true) {
        details.push(fit("Answer was bounded by Assistant.", width))
      }
    }
    if (query.error !== undefined) {
      details.push(fit(`Error: ${query.error.message}`, width))
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
