import {
  Editor,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type EditorTheme,
  type Focusable,
  type TUI
} from "@earendil-works/pi-tui"
import { boundedTuiLines } from "./projection.js"
import { terminalSingleLineText } from "./terminal-text.js"

export interface TuiStructuredFormField<Name extends string> {
  readonly name: Name
  readonly label: string
  readonly description?: string
  readonly initialValue?: string
  readonly validate?: (
    value: string,
    values: Readonly<Record<Name, string>>
  ) => string | undefined
}

export class TuiStructuredFormOverlay<Name extends string>
  implements Component, Focusable
{
  private readonly editor: Editor
  private readonly values = new Map<Name, string>()
  private fieldIndex = 0
  private error: string | undefined

  constructor(
    private readonly options: {
      readonly tui: TUI
      readonly theme: EditorTheme
      readonly title: string
      readonly fields: readonly TuiStructuredFormField<Name>[]
      readonly terminalRows: () => number
      readonly onComplete: (values: Readonly<Record<Name, string>>) => void
      readonly onCancel: () => void
    }
  ) {
    if (options.fields.length === 0) {
      throw new Error("structured form requires at least one field")
    }
    for (const field of options.fields) {
      if (this.values.has(field.name)) {
        throw new Error(`duplicate structured form field: ${field.name}`)
      }
      this.values.set(field.name, field.initialValue ?? "")
    }
    this.editor = new Editor(options.tui, options.theme, { paddingX: 1 })
    this.editor.onChange = (value) => {
      this.values.set(this.currentField().name, value)
    }
    this.editor.onSubmit = (value) => this.advance(value)
    this.editor.setText(this.currentValue())
  }

  get focused(): boolean {
    return this.editor.focused
  }

  set focused(value: boolean) {
    this.editor.focused = value
  }

  invalidate(): void {
    this.editor.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    const field = this.currentField()
    const editorLines = this.editor.render(safeWidth)
    const maxRows = Math.max(8, Math.floor(this.options.terminalRows() * 0.82))
    const fixedRows = 6 + editorLines.length + (this.error === undefined ? 0 : 2)
    const optionalBudget = Math.max(0, maxRows - fixedRows)
    const description =
      field.description === undefined
        ? []
        : boundedTuiLines(field.description, safeWidth, 2)
    const optionalContent = [...description, ...this.savedSummaries(safeWidth)]
    const optional =
      optionalBudget === 0 ? [] : optionalContent.slice(-optionalBudget)
    return [
      fit(this.options.title, safeWidth),
      fit(
        `${this.fieldIndex + 1}/${this.options.fields.length} ${field.label}`,
        safeWidth
      ),
      ...optional,
      "",
      ...editorLines,
      ...(this.error === undefined
        ? []
        : ["", fit(`Invalid input: ${this.error}`, safeWidth)]),
      "",
      fit(
        this.fieldIndex === 0
          ? "Enter next | Shift+Enter newline | Esc cancel"
          : "Enter next | Shift+Tab back | Shift+Enter newline | Esc cancel",
        safeWidth
      )
    ]
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.commitCurrent(this.editor.getExpandedText())
      this.options.onCancel()
      return
    }
    if (matchesKey(data, "shift+tab")) {
      this.commitCurrent(this.editor.getExpandedText())
      if (this.fieldIndex > 0) {
        this.fieldIndex -= 1
        this.error = undefined
        this.editor.setText(this.currentValue())
      }
      return
    }
    if (!matchesKey(data, "enter")) this.error = undefined
    this.editor.handleInput(data)
  }

  private advance(value: string): void {
    this.commitCurrent(value)
    const error = this.currentField().validate?.(value, this.snapshot())
    if (error !== undefined) {
      this.error = error
      this.editor.setText(value)
      return
    }
    this.error = undefined
    if (this.fieldIndex === this.options.fields.length - 1) {
      this.editor.setText(value)
      this.options.onComplete(this.snapshot())
      return
    }
    this.fieldIndex += 1
    this.editor.setText(this.currentValue())
  }

  private commitCurrent(value: string): void {
    this.values.set(this.currentField().name, value)
  }

  private currentField(): TuiStructuredFormField<Name> {
    const field = this.options.fields[this.fieldIndex]
    if (field === undefined) throw new Error("structured form field is missing")
    return field
  }

  private currentValue(): string {
    return this.values.get(this.currentField().name) ?? ""
  }

  private snapshot(): Readonly<Record<Name, string>> {
    return Object.fromEntries(this.values) as Record<Name, string>
  }

  private savedSummaries(width: number): string[] {
    return this.options.fields
      .slice(0, this.fieldIndex)
      .filter((field) => (this.values.get(field.name) ?? "").trim().length > 0)
      .slice(-2)
      .map((field) =>
        fit(
          `${field.label}: ${terminalSingleLineText(this.values.get(field.name) ?? "", {
            maxWidth: 1_024,
            fallback: ""
          })}`,
          width
        )
      )
  }
}

function fit(text: string, width: number): string {
  const safe = terminalSingleLineText(text, {
    maxWidth: Math.max(1, width),
    fallback: ""
  })
  return visibleWidth(safe) <= width ? safe : truncateToWidth(safe, width)
}
