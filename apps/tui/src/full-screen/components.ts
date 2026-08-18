import {
  CURSOR_MARKER,
  Input,
  SelectList,
  type Component,
  type Focusable,
  type SelectItem,
  type SelectListTheme,
  matchesKey,
  truncateToWidth,
  visibleWidth
} from "@earendil-works/pi-tui"
import { boundedTuiLines } from "./projection.js"
import { terminalSingleLineText } from "./terminal-text.js"
import type {
  PlanGenerationReadModel,
  PlanProposalReadModel
} from "@wanex/product"

export class TuiFullScreenFrame implements Component {
  private title = "Wanex"
  private sessionLabel = "New conversation"
  private status = "Connecting"
  private timeline = ""
  private attachmentSummary: string | undefined
  private footer = ""

  constructor(
    private readonly editor: Component,
    private readonly terminalRows: () => number
  ) {}

  update(options: {
    readonly title: string
    readonly sessionLabel: string
    readonly status: string
    readonly timeline: string
    readonly attachmentSummary?: string
    readonly footer: string
  }): void {
    this.title = options.title
    this.sessionLabel = options.sessionLabel
    this.status = options.status
    this.timeline = options.timeline
    this.attachmentSummary = options.attachmentSummary
    this.footer = options.footer
  }

  invalidate(): void {
    this.editor.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width)
    const editorLines = this.editor.render(safeWidth)
    const fixedLines =
      5 + editorLines.length + (this.attachmentSummary === undefined ? 0 : 1)
    const timelineHeight = Math.max(1, this.terminalRows() - fixedLines)
    const timelineLines = boundedTuiLines(
      this.timeline,
      safeWidth,
      timelineHeight
    )
    return [
      fit(`${this.title}  ${this.sessionLabel}`, safeWidth),
      fit(this.status, safeWidth),
      "",
      ...timelineLines,
      ...Array.from({ length: timelineHeight - timelineLines.length }, () => ""),
      "",
      ...(this.attachmentSummary === undefined
        ? []
        : [fit(this.attachmentSummary, safeWidth)]),
      ...editorLines,
      fit(this.footer, safeWidth)
    ]
  }
}

export class TuiApprovalOverlay implements Component, Focusable {
  focused = false
  private selected = 0

  constructor(
    private readonly options: {
      readonly title: string
      readonly summary: string
      readonly details: readonly {
        readonly label: string
        readonly value: string
      }[]
      readonly approveAvailable: boolean
      readonly denyAvailable: boolean
      readonly decide: (decision: "approve_once" | "deny") => void
      readonly dismiss: () => void
    }
  ) {
    if (!options.approveAvailable && options.denyAvailable) this.selected = 1
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    const approve = `${this.selected === 0 ? ">" : " "} Approve once`
    const deny = `${this.selected === 1 ? ">" : " "} Deny`
    return [
      fit("Tool approval", safeWidth),
      fit(this.options.title, safeWidth),
      ...boundedTuiLines(this.options.summary, safeWidth, 4),
      ...this.options.details.slice(0, 4).map((detail) =>
        fit(`${detail.label}: ${detail.value}`, safeWidth)
      ),
      "",
      fit(
        this.options.approveAvailable
          ? approve
          : "  Approve once (unavailable)",
        safeWidth
      ),
      fit(
        this.options.denyAvailable ? deny : "  Deny (unavailable)",
        safeWidth
      ),
      fit("Left/Right choose | Enter confirm | Esc later", safeWidth),
      ...(this.focused ? [CURSOR_MARKER] : [])
    ]
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.options.dismiss()
      return
    }
    if (matchesKey(data, "left") || matchesKey(data, "up")) {
      this.selected = this.options.approveAvailable ? 0 : 1
      return
    }
    if (matchesKey(data, "right") || matchesKey(data, "down")) {
      this.selected = this.options.denyAvailable ? 1 : 0
      return
    }
    if (matchesKey(data, "enter")) {
      const decision = this.selected === 0 ? "approve_once" : "deny"
      if (
        (decision === "approve_once" && this.options.approveAvailable) ||
        (decision === "deny" && this.options.denyAvailable)
      ) {
        this.options.decide(decision)
      }
    }
  }
}

export class TuiSelectOverlay implements Component {
  private readonly list: SelectList

  constructor(
    private readonly title: string,
    items: readonly SelectItem[],
    options: {
      readonly selectedIndex: number
      readonly theme: SelectListTheme
      readonly onSelect: (item: SelectItem) => void
      readonly onCancel: () => void
    }
  ) {
    this.list = createTerminalSafeSelectList(
      items,
      8,
      options.theme,
      options.onSelect
    )
    this.list.setSelectedIndex(options.selectedIndex)
    this.list.onCancel = options.onCancel
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    return [
      fit(this.title, safeWidth),
      "",
      ...this.list.render(safeWidth),
      "",
      fit("Up/Down choose | Enter confirm | Esc cancel", safeWidth)
    ]
  }

  handleInput(data: string): void {
    this.list.handleInput(data)
  }
}

export class TuiFilterableSelectOverlay
  implements Component, Focusable
{
  private readonly input = new Input()
  private list: SelectList

  constructor(
    private readonly title: string,
    private readonly items: readonly SelectItem[],
    private readonly options: {
      readonly theme: SelectListTheme
      readonly onSelect: (item: SelectItem) => void
      readonly onCancel: () => void
    }
  ) {
    this.list = this.createList(items)
    this.input.onEscape = options.onCancel
  }

  get focused(): boolean {
    return this.input.focused
  }

  set focused(value: boolean) {
    this.input.focused = value
  }

  invalidate(): void {
    this.input.invalidate()
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    return [
      fit(this.title, safeWidth),
      fit("Search", safeWidth),
      ...this.input.render(safeWidth),
      "",
      ...this.list.render(safeWidth),
      "",
      fit("Type to filter | Up/Down choose | Enter confirm | Esc cancel", safeWidth)
    ]
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.options.onCancel()
      return
    }
    if (
      matchesKey(data, "up") ||
      matchesKey(data, "down") ||
      matchesKey(data, "enter")
    ) {
      this.list.handleInput(data)
      return
    }
    this.input.handleInput(data)
    this.list = this.createList(this.filteredItems(this.input.getValue()))
  }

  private filteredItems(query: string): readonly SelectItem[] {
    const normalized = query.trim().toLowerCase()
    if (normalized.length === 0) return this.items
    return this.items.filter((item) =>
      [item.label, item.value, item.description ?? ""].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    )
  }

  private createList(items: readonly SelectItem[]): SelectList {
    const list = createTerminalSafeSelectList(
      items,
      8,
      this.options.theme,
      this.options.onSelect
    )
    list.onCancel = this.options.onCancel
    return list
  }
}

export class TuiInputOverlay implements Component, Focusable {
  private readonly input = new Input()
  private error: string | undefined

  constructor(
    private readonly options: {
      readonly title: string
      readonly description?: string
      readonly onSubmit: (value: string) => string | undefined
      readonly onCancel: () => void
    }
  ) {
    this.input.onEscape = options.onCancel
    this.input.onSubmit = (value) => {
      this.error = options.onSubmit(value)
    }
  }

  get focused(): boolean {
    return this.input.focused
  }

  set focused(value: boolean) {
    this.input.focused = value
  }

  invalidate(): void {
    this.input.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    return [
      fit(this.options.title, safeWidth),
      ...(this.options.description === undefined
        ? []
        : boundedTuiLines(
            this.options.description,
            safeWidth,
            3
          )),
      "",
      ...this.input.render(safeWidth),
      ...(this.error === undefined
        ? []
        : ["", fit(`Invalid input: ${this.error}`, safeWidth)]),
      "",
      fit("Enter continue | Esc cancel", safeWidth)
    ]
  }

  handleInput(data: string): void {
    if (!matchesKey(data, "enter")) this.error = undefined
    this.input.handleInput(data)
  }
}

export class TuiConfirmationOverlay implements Component {
  private readonly list: SelectList

  constructor(
    private readonly options: {
      readonly title: string
      readonly details: readonly string[]
      readonly theme: SelectListTheme
      readonly confirmLabel: string
      readonly onConfirm: () => void
      readonly onCancel: () => void
    }
  ) {
    this.list = new SelectList(
      [
        { value: "confirm", label: options.confirmLabel },
        { value: "cancel", label: "Cancel" }
      ],
      2,
      options.theme
    )
    this.list.onSelect = (item) => {
      if (item.value === "confirm") options.onConfirm()
      else options.onCancel()
    }
    this.list.onCancel = options.onCancel
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    return [
      fit(this.options.title, safeWidth),
      ...this.options.details.flatMap((detail) =>
        boundedTuiLines(
          terminalSingleLineText(detail, {
            maxWidth: 4_096,
            fallback: ""
          }),
          safeWidth,
          2
        )
      ),
      "",
      ...this.list.render(safeWidth),
      "",
      fit("Up/Down choose | Enter confirm | Esc cancel", safeWidth)
    ]
  }

  handleInput(data: string): void {
    this.list.handleInput(data)
  }
}

export type TuiPlanAction =
  | "cancel-generation"
  | "dismiss-generation"
  | "start-generation"
  | "edit"
  | "approve"
  | "reject"
  | "withdraw"
  | "execute"
  | "close"

export class TuiPlanReviewOverlay implements Component {
  private readonly list: SelectList

  constructor(
    private readonly options: {
      readonly generation?: PlanGenerationReadModel
      readonly proposal?: PlanProposalReadModel
      readonly loading?: boolean
      readonly terminalRows: () => number
      readonly actions: readonly {
        readonly value: TuiPlanAction
        readonly label: string
      }[]
      readonly theme: SelectListTheme
      readonly onAction: (action: TuiPlanAction) => void
      readonly onCancel: () => void
    }
  ) {
    this.list = createTerminalSafeSelectList(
      options.actions.map((action) => ({
        value: action.value,
        label: action.label
      })),
      8,
      options.theme,
      (item) => options.onAction(item.value as TuiPlanAction)
    )
    this.list.onCancel = options.onCancel
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    const details: string[] = []
    if (this.options.loading) {
      details.push(fit("Reading current Plan state...", safeWidth))
    }
    const generation = this.options.generation
    if (generation !== undefined) {
      details.push(
        fit(`Generation: ${terminalSingleLineText(generation.state, { maxWidth: 128, fallback: "unknown" })}`, safeWidth)
      )
      if (generation.error !== undefined) {
        details.push(...boundedTuiLines(generation.error.message, safeWidth, 3))
      }
    }
    const proposal = this.options.proposal
    if (proposal !== undefined) {
      details.push(...boundedTuiLines(`Title: ${proposal.title}`, safeWidth, 2))
      details.push(...boundedTuiLines(`Revision: ${proposal.revision} | State: ${proposal.state}`, safeWidth, 1))
      details.push(...boundedTuiLines(proposal.summary, safeWidth, 4))
      details.push(fit("Steps", safeWidth))
      for (const [index, step] of proposal.steps.slice(0, 12).entries()) {
        details.push(...boundedTuiLines(`${index + 1}. ${step.title}`, safeWidth, 2))
        if (step.detail !== undefined) {
          details.push(...boundedTuiLines(`   ${step.detail}`, safeWidth, 2))
        }
      }
      if (proposal.steps.length > 12) {
        details.push(fit(`... ${proposal.steps.length - 12} more steps`, safeWidth))
      }
      if (proposal.execution !== undefined) {
        details.push(
          fit(
            `Execution: ${terminalSingleLineText(proposal.execution.jobState, { maxWidth: 128, fallback: "unknown" })}`,
            safeWidth
          )
        )
      }
    }
    const maxRows = Math.max(8, Math.floor(this.options.terminalRows() * 0.82))
    const detailBudget = Math.max(1, maxRows - this.options.actions.length - 4)
    const visibleDetails = details.slice(0, detailBudget)
    if (details.length > detailBudget) {
      visibleDetails[visibleDetails.length - 1] = fit("... Plan details truncated", safeWidth)
    }
    return [
      fit("Plan", safeWidth),
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
}

function fit(text: string, width: number): string {
  const safe = terminalSingleLineText(text, {
    maxWidth: Math.max(1, width),
    fallback: ""
  })
  return visibleWidth(safe) <= width ? safe : truncateToWidth(safe, width)
}

export function createTerminalSafeSelectList(
  items: readonly SelectItem[],
  maxVisible: number,
  theme: SelectListTheme,
  onSelect: (item: SelectItem) => void
): SelectList {
  const originals = new WeakMap<SelectItem, SelectItem>()
  const displayItems = items.map((item) => {
    const displayItem: SelectItem = {
      value: item.value,
      label: terminalSingleLineText(item.label, {
        maxWidth: 512,
        fallback: "(unnamed)"
      }),
      ...(item.description === undefined
        ? {}
        : {
            description: terminalSingleLineText(item.description, {
              maxWidth: 1_024,
              fallback: ""
            })
          })
    }
    originals.set(displayItem, item)
    return displayItem
  })
  const list = new SelectList(displayItems, maxVisible, theme)
  list.onSelect = (item) => onSelect(originals.get(item) ?? item)
  return list
}
