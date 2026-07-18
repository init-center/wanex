import type {
  MessagePart,
  ProviderState,
  ReasoningMessagePart,
  TextMessagePart,
  ToolCallMessagePart
} from "@wanex/protocol"
import { ProviderStreamError, protocolProviderError } from "./errors.js"
import type {
  ProviderAdapter,
  ProviderError,
  ProviderEvent,
  ProviderRequest,
  ProviderTurnResult,
  ProviderUsage
} from "./types.js"

interface ToolAssembly {
  readonly index: number
  readonly id: string
  name: string
  inputJson: string
  ended: boolean
}

export async function consumeProviderStream(options: {
  readonly provider: ProviderAdapter
  readonly request: ProviderRequest
  readonly observe?: (event: ProviderEvent) => void
}): Promise<ProviderTurnResult> {
  const assembler = new ProviderTurnAssembler(
    options.provider.providerId,
    options.provider.modelId
  )
  let terminal: ProviderEvent | undefined

  try {
    for await (const event of options.provider.stream(options.request)) {
      if (terminal !== undefined) {
        assembler.fail("provider emitted an event after its terminal event")
      }
      try {
        options.observe?.(event)
      } catch {
        // Observation is auxiliary; a UI or diagnostic subscriber cannot fail a run.
      }
      assembler.accept(event)
      if (event.type === "finish" || event.type === "error") {
        terminal = event
      }
    }
  } catch (error) {
    if (error instanceof ProviderStreamError) {
      throw error
    }
    throw new ProviderStreamError(
      protocolProviderError({
        providerId: options.provider.providerId,
        modelId: options.provider.modelId,
        message: `provider stream threw instead of emitting an error event: ${errorMessage(error)}`
      }),
      assembler.outputObserved
    )
  }

  return assembler.complete()
}

class ProviderTurnAssembler {
  private readonly providerId: string
  private readonly modelId: string
  private readonly partOrder: string[] = []
  private readonly text = new Map<string, string>()
  private readonly reasoning = new Map<
    string,
    { text: string; visibility: NonNullable<ReasoningMessagePart["visibility"]> }
  >()
  private readonly tools = new Map<string, ToolAssembly>()
  private readonly toolIndexes = new Set<number>()
  private readonly states: ProviderState[] = []
  private readonly stateByPart = new Map<string, ProviderState>()
  private usage: ProviderUsage | undefined
  private finish: ProviderTurnResult["finish"] | undefined
  private error: ProviderError | undefined
  outputObserved = false

  constructor(providerId: string, modelId: string) {
    this.providerId = providerId
    this.modelId = modelId
  }

  accept(event: ProviderEvent): void {
    switch (event.type) {
      case "text_delta":
        this.requireNonEmpty(event.delta, "text delta")
        this.addPart(event.partId)
        this.text.set(event.partId, (this.text.get(event.partId) ?? "") + event.delta)
        this.outputObserved = true
        return
      case "reasoning_delta": {
        this.requireNonEmpty(event.delta, "reasoning delta")
        this.addPart(event.partId)
        const prior = this.reasoning.get(event.partId)
        this.reasoning.set(event.partId, {
          text: (prior?.text ?? "") + event.delta,
          visibility: event.visibility ?? prior?.visibility ?? "internal"
        })
        this.outputObserved = true
        return
      }
      case "tool_call_start":
        if (this.tools.has(event.toolCallId) || this.toolIndexes.has(event.index)) {
          this.fail("provider emitted a duplicate tool-call start")
        }
        this.toolIndexes.add(event.index)
        this.tools.set(event.toolCallId, {
          index: event.index,
          id: event.toolCallId,
          name: "",
          inputJson: "",
          ended: false
        })
        this.addPart(`tool:${event.toolCallId}`)
        this.outputObserved = true
        return
      case "tool_call_delta": {
        const tool = this.requireOpenTool(event.toolCallId)
        tool.name += event.toolNameDelta ?? ""
        tool.inputJson += event.inputJsonDelta ?? ""
        if (event.toolNameDelta === undefined && event.inputJsonDelta === undefined) {
          this.fail("tool-call delta contains no data")
        }
        return
      }
      case "tool_call_end":
        this.requireOpenTool(event.toolCallId).ended = true
        return
      case "provider_state":
        this.states.push(event.state)
        if (event.partId !== undefined) {
          if (this.stateByPart.has(event.partId)) {
            this.fail(`provider emitted duplicate state for part ${event.partId}`)
          }
          this.stateByPart.set(event.partId, event.state)
        }
        return
      case "usage":
        this.validateUsage(event.usage)
        this.usage = event.usage
        return
      case "finish":
        this.finish = event
        return
      case "error":
        this.error = event.error
        return
    }
  }

  complete(): ProviderTurnResult {
    if (this.error !== undefined) {
      throw new ProviderStreamError(this.error, this.outputObserved)
    }
    if (this.finish === undefined) {
      this.fail("provider stream ended without a terminal event")
    }

    const parts = this.partOrder.map((partId): MessagePart => {
      if (partId.startsWith("tool:")) {
        const tool = this.tools.get(partId.slice(5))
        if (tool === undefined || !tool.ended) {
          this.fail("provider stream finished with an incomplete tool call")
        }
        if (tool.name.length === 0) {
          this.fail("provider tool call has no name")
        }
        return {
          type: "tool_call",
          id: `tool_call_${tool.index}`,
          toolCallId: tool.id,
          toolName: tool.name,
          input: this.parseToolInput(tool)
        } satisfies ToolCallMessagePart
      }
      const text = this.text.get(partId)
      if (text !== undefined) {
        return { type: "text", id: partId, text } satisfies TextMessagePart
      }
      const reasoning = this.reasoning.get(partId)
      if (reasoning === undefined) {
        this.fail(`provider part ${partId} has no assembled content`)
      }
      const providerState = this.stateByPart.get(partId)
      return {
        type: "reasoning",
        id: partId,
        text: reasoning.text,
        visibility: reasoning.visibility,
        ...(providerState === undefined ? {} : { providerState })
      } satisfies ReasoningMessagePart
    })

    return {
      parts,
      providerState: this.states,
      ...(this.usage === undefined ? {} : { usage: this.usage }),
      finish: this.finish
    }
  }

  fail(message: string): never {
    throw new ProviderStreamError(
      protocolProviderError({
        providerId: this.providerId,
        modelId: this.modelId,
        message
      }),
      this.outputObserved
    )
  }

  private addPart(partId: string): void {
    if (!this.partOrder.includes(partId)) {
      this.partOrder.push(partId)
    }
  }

  private requireOpenTool(toolCallId: string): ToolAssembly {
    const tool = this.tools.get(toolCallId)
    if (tool === undefined) {
      this.fail(`provider emitted tool-call data before start: ${toolCallId}`)
    }
    if (tool.ended) {
      this.fail(`provider emitted tool-call data after end: ${toolCallId}`)
    }
    return tool
  }

  private requireNonEmpty(value: string, label: string): void {
    if (value.length === 0) {
      this.fail(`provider emitted an empty ${label}`)
    }
  }

  private validateUsage(usage: ProviderUsage): void {
    for (const [name, value] of Object.entries(usage)) {
      if (name === "metadata" || value === undefined) {
        continue
      }
      if (!Number.isSafeInteger(value) || value < 0) {
        this.fail(`provider usage ${name} must be a non-negative integer`)
      }
      const prior = this.usage?.[name as keyof ProviderUsage]
      if (typeof prior === "number" && value < prior) {
        this.fail(`provider cumulative usage ${name} must not decrease`)
      }
    }
  }

  private parseToolInput(tool: ToolAssembly) {
    if (tool.inputJson.length === 0) {
      return {}
    }
    let value: unknown
    try {
      value = JSON.parse(tool.inputJson)
    } catch {
      this.fail(`provider tool call ${tool.id} contains invalid JSON input`)
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail(`provider tool call ${tool.id} input must be a JSON object`)
    }
    return value as Record<string, never>
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
