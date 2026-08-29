import type {
  AppCommandInputSchema,
  AppCommandInputValueSchema
} from "@wanex/extension"
import type {
  CommandCatalogReadModel,
  CommandInvocationPreview,
  ExecuteCommandResult
} from "@wanex/assistant/surface"
import type {
  OverlayHandle,
  SelectItem,
  SelectListTheme,
  TUI
} from "@earendil-works/pi-tui"
import {
  parseTuiCommandInputValue,
  tuiCommandInputAnnotation,
  tuiCommandInputLabel
} from "../input/value.js"
import {
  TuiConfirmationOverlay,
  TuiFilterableSelectOverlay,
  TuiInputOverlay,
  TuiSelectOverlay
} from "./components.js"
import type { TuiFullScreenClient } from "./types.js"

type AssistantCommand = CommandCatalogReadModel["commands"][number]

export interface TuiCommandPalette {
  open(): void
  close(): void
  invalidate(): void
  isOpen(): boolean
}

export function createTuiCommandPalette(options: {
  readonly tui: Pick<TUI, "showOverlay">
  readonly theme: SelectListTheme
  readonly client: Pick<
    TuiFullScreenClient,
    | "readAssistantCommands"
    | "previewAssistantCommandInvocation"
    | "executeAssistantCommand"
  >
  readonly canOpen: () => boolean
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiCommandPalette {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0

  return {
    open() {
      if (!options.canOpen() || active) return
      active = true
      const token = ++workflow
      void options.perform(async () => {
        try {
          const envelope = await options.client.readAssistantCommands()
          if (!isCurrent(token)) return
          if (!envelope.ok) {
            rejectAndClose(
              token,
              `readAssistantCommands failed: ${envelope.error.message}`
            )
            return
          }
          const commands = envelope.value.commands.filter(
            (command) => command.paletteVisibility === "visible"
          )
          if (commands.length === 0) {
            rejectAndClose(token, "No Assistant commands are available")
            return
          }
          showCommandPicker(commands, token)
        } catch (error) {
          rejectAndClose(token, safeErrorMessage(error))
        }
      })
    },
    close,
    invalidate() {
      if (!active) return
      close()
      options.rejected("Assistant commands changed; reopen the command palette")
    },
    isOpen: () => active
  }

  function showCommandPicker(
    commands: readonly AssistantCommand[],
    token: number
  ): void {
    const byId = new Map(commands.map((command) => [command.id, command]))
    const items: SelectItem[] = commands.map((command) => ({
      value: command.id,
      label: command.title,
      description: commandDescription(command)
    }))
    showOverlay(
      new TuiFilterableSelectOverlay("Assistant commands", items, {
        theme: options.theme,
        onCancel: close,
        onSelect(item) {
          const command = byId.get(item.value)
          if (command === undefined || !isCurrent(token)) return
          collectCommandInput(command, token)
        }
      }),
      token
    )
  }

  function collectCommandInput(command: AssistantCommand, token: number): void {
    const schema = command.inputSchema
    if (schema === undefined) {
      void preview(command, undefined, token)
      return
    }
    if (schema.additionalProperties !== false) {
      showOpenObjectInput(command, schema, token)
      return
    }
    collectClosedObjectInput(command, schema, token)
  }

  function showOpenObjectInput(
    command: AssistantCommand,
    schema: AppCommandInputSchema,
    token: number
  ): void {
    showOverlay(
      new TuiInputOverlay({
        title: `${command.title} input`,
        description: "Enter one JSON object. Assistant validates its full schema before execution.",
        onCancel: close,
        onSubmit(raw) {
          const parsed = parseTuiCommandInputValue(schema, raw)
          if (!parsed.ok) return parsed.message
          void preview(command, parsed.value, token)
          return undefined
        }
      }),
      token
    )
  }

  function collectClosedObjectInput(
    command: AssistantCommand,
    schema: AppCommandInputSchema,
    token: number
  ): void {
    const properties = Object.entries(schema.properties ?? {})
    const input: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >

    collectProperty(0)

    function collectProperty(index: number): void {
      if (!isCurrent(token)) return
      const property = properties[index]
      if (property === undefined) {
        void preview(command, input, token)
        return
      }
      const [name, valueSchema] = property
      const required = schema.required?.includes(name) === true
      if (!required) {
        showOptionalDecision(command, name, valueSchema, token, (included) => {
          if (!included) {
            collectProperty(index + 1)
            return
          }
          collectValue(command, name, valueSchema, token, (value) => {
            setInputProperty(input, name, value)
            collectProperty(index + 1)
          })
        })
        return
      }
      collectValue(command, name, valueSchema, token, (value) => {
        setInputProperty(input, name, value)
        collectProperty(index + 1)
      })
    }
  }

  function showOptionalDecision(
    command: AssistantCommand,
    name: string,
    schema: AppCommandInputValueSchema,
    token: number,
    complete: (included: boolean) => void
  ): void {
    const label = schema.title ?? tuiCommandInputLabel(name)
    showSelection(
      `${command.title} | Include ${label}?`,
      [
        { value: "no", label: "No", description: "Leave this field absent" },
        {
          value: "yes",
          label: "Yes",
          description:
            tuiCommandInputAnnotation(schema).trim() ||
            "Provide a value"
        }
      ],
      token,
      (item) => complete(item.value === "yes")
    )
  }

  function collectValue(
    command: AssistantCommand,
    name: string,
    schema: AppCommandInputValueSchema,
    token: number,
    complete: (value: unknown) => void
  ): void {
    const label = schema.title ?? tuiCommandInputLabel(name)
    const choices = scalarChoices(schema)
    if (choices !== undefined) {
      const values = new Map<string, unknown>(
        choices.map((value, index) => [`choice:${index}`, value] as const)
      )
      showSelection(
        `${command.title} | ${label}`,
        choices.map((value, index) => ({
          value: `choice:${index}`,
          label: JSON.stringify(value)
        })),
        token,
        (item) => {
          if (!values.has(item.value)) return
          complete(values.get(item.value))
        }
      )
      return
    }

    const annotation = tuiCommandInputAnnotation(schema)
    const jsonHint =
      schema.type === "object" || schema.type === "array"
        ? `Enter a JSON ${schema.type}. Assistant validates nested constraints.`
        : undefined
    showOverlay(
      new TuiInputOverlay({
        title: `${command.title} | ${label}`,
        description: [jsonHint, annotation.trim()]
          .filter((value): value is string => Boolean(value))
          .join(" "),
        onCancel: close,
        onSubmit(raw) {
          const parsed = parseTuiCommandInputValue(schema, raw)
          if (!parsed.ok) return parsed.message
          complete(parsed.value)
          return undefined
        }
      }),
      token
    )
  }

  function showSelection(
    title: string,
    items: readonly SelectItem[],
    token: number,
    onSelect: (item: SelectItem) => void
  ): void {
    showOverlay(
      new TuiSelectOverlay(title, items, {
        selectedIndex: 0,
        theme: options.theme,
        onCancel: close,
        onSelect
      }),
      token
    )
  }

  async function preview(
    command: AssistantCommand,
    input: unknown,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const envelope = await options.client.previewAssistantCommandInvocation({
          commandId: command.id,
          ...(input === undefined ? {} : { input })
        })
        if (!isCurrent(token)) return
        if (!envelope.ok) {
          rejectAndClose(
            token,
            `previewAssistantCommandInvocation failed: ${envelope.error.message}`
          )
          return
        }
        if (envelope.value.kind !== "runnable") {
          rejectPreview(token, envelope.value)
          return
        }
        showConfirmation(command, input, envelope.value, token)
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  function showConfirmation(
    command: AssistantCommand,
    input: unknown,
    previewResult: Extract<
      CommandInvocationPreview,
      { readonly kind: "runnable" }
    >,
    token: number
  ): void {
    showOverlay(
      new TuiConfirmationOverlay({
        title: `Execute ${command.title}?`,
        details: [
          `Command: ${previewResult.commandId}`,
          `Source: ${sourceLabel(command)}`,
          ...(input === undefined
            ? []
            : [`Input: ${summarizeCommandInput(input)}`])
        ],
        theme: options.theme,
        confirmLabel: "Execute command",
        onCancel: close,
        onConfirm() {
          void execute(command, input, token)
        }
      }),
      token
    )
  }

  async function execute(
    command: AssistantCommand,
    input: unknown,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const envelope = await options.client.executeAssistantCommand({
          commandId: command.id,
          ...(input === undefined ? {} : { input })
        })
        if (!isCurrent(token)) return
        if (!envelope.ok) {
          rejectAndClose(
            token,
            `executeAssistantCommand failed: ${envelope.error.message}`
          )
          return
        }
        if (envelope.value.kind === "rejected") {
          rejectExecution(token, envelope.value)
          return
        }
        finish(token)
        options.accepted(`Command completed: ${command.title}`)
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  function rejectPreview(
    token: number,
    previewResult: Extract<
      CommandInvocationPreview,
      { readonly kind: "rejected" }
    >
  ): void {
    const details =
      "inputValidation" in previewResult
        ? previewResult.inputValidation?.issues[0]
        : undefined
    rejectAndClose(
      token,
      details === undefined
        ? previewResult.message
        : `${previewResult.message}: ${details.path} ${details.message}`
    )
  }

  function rejectExecution(
    token: number,
    result: Extract<ExecuteCommandResult, { readonly kind: "rejected" }>
  ): void {
    const details = result.inputValidation?.issues[0]
    rejectAndClose(
      token,
      details === undefined
        ? result.message
        : `${result.message}: ${details.path} ${details.message}`
    )
  }

  function showOverlay(
    component: Parameters<TUI["showOverlay"]>[0],
    token: number
  ): void {
    if (!isCurrent(token)) return
    hideOverlay()
    overlay = options.tui.showOverlay(component, {
      width: "80%",
      minWidth: 36,
      maxHeight: "80%",
      margin: 1
    })
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }

  function rejectAndClose(token: number, message: string): void {
    if (!isCurrent(token)) return
    finish(token)
    options.rejected(message)
  }

  function finish(token: number): void {
    if (!isCurrent(token)) return
    hideOverlay()
    active = false
    workflow += 1
  }

  function close(): void {
    hideOverlay()
    active = false
    workflow += 1
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token
  }
}

function scalarChoices(
  schema: AppCommandInputValueSchema
): readonly (string | number | boolean)[] | undefined {
  if (
    schema.type === "string" ||
    schema.type === "number" ||
    schema.type === "integer" ||
    schema.type === "boolean"
  ) {
    if (schema.enum !== undefined) return schema.enum
    if (schema.type === "boolean") return [true, false]
  }
  return undefined
}

function commandDescription(command: AssistantCommand): string {
  return [command.category ?? "other", sourceLabel(command), command.id].join(
    " | "
  )
}

function sourceLabel(command: AssistantCommand): string {
  return `${command.sourceKind}/${command.sourceScope}/${command.trust}`
}

function setInputProperty(
  input: Record<string, unknown>,
  name: string,
  value: unknown
): void {
  Object.defineProperty(input, name, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  })
}

function summarizeCommandInput(input: unknown): string {
  const serialized = JSON.stringify(input)
  if (serialized === undefined) return "undefined"
  return serialized.length <= 240 ? serialized : `${serialized.slice(0, 237)}...`
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
