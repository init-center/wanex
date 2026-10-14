import type {
  ProviderState,
  ReasoningMessagePart,
  TextMessagePart,
  ToolCallMessagePart
} from "@wanex/protocol"
import { ProviderStreamError, protocolProviderError } from "./errors.js"
import { IMAGE_OUTPUT_LIMITS, validateImageOutput } from "./image-output.js"
import type {
  ProviderAdapter,
  ProviderError,
  ProviderEvent,
  ProviderObservedEvent,
  ProviderImageCandidate,
  ProviderResponseCandidate,
  ProviderRequest,
  ProviderOutputMessagePart,
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

interface ConsumeOptions {
  readonly provider: ProviderAdapter
  readonly request: ProviderRequest
  readonly observe?: (event: ProviderObservedEvent) => void
  readonly checkpoint?: (event: ProviderEvent) => Promise<void>
}

/** Text-only callers cannot accidentally persist or silently discard inline images. */
export async function consumeTextProviderStream(options: ConsumeOptions): Promise<Omit<ProviderTurnResult, "parts"> & {
  readonly parts: readonly Exclude<ProviderOutputMessagePart, { readonly type: "resource" }>[]
}> {
  if (options.request.outputModalities?.some((modality) => modality !== "text")) {
    throw new ProviderStreamError(protocolProviderError({
      providerId: options.provider.providerId, modelId: options.provider.model.id,
      message: "text-only consumer cannot request image output"
    }), false)
  }
  const response = await consumeProviderStream({
    ...options,
    request: { ...options.request, outputModalities: ["text"] }
  })
  const parts: Exclude<ProviderOutputMessagePart, { readonly type: "resource" }>[] = []
  for (const part of response.parts) {
    if (part.type === "image_candidate") {
      throw new Error("text-only provider response contains an image candidate")
    }
    parts.push(part)
  }
  return { ...response, parts }
}

export async function consumeProviderStream(options: ConsumeOptions): Promise<ProviderResponseCandidate> {
  const output = options.request.outputModalities ?? ["text"]
  const assembler = new ProviderTurnAssembler(
    options.provider.providerId,
    options.provider.model.id,
    output.includes("image"),
    output.includes("text")
  )
  if (output.length === 0 || new Set(output).size !== output.length ||
      output.some((modality) => !options.provider.model.outputModalities.includes(modality)) ||
      output.some((modality) => !options.provider.outputModalities.includes(modality)) ||
      output.some((modality) => modality !== "text" && modality !== "image")) {
    assembler.fail("requested output modalities are not supported by the selected model and adapter")
  }
  let terminal: ProviderEvent | undefined

  try {
    for await (const event of options.provider.stream(options.request)) {
      assembler.observeOutput(event)
      if (terminal !== undefined) {
        assembler.fail("provider emitted an event after its terminal event")
      }
      // Observe even malformed media before validation so a rejected paid output is not retried.
      await options.checkpoint?.(event)
      assembler.accept(event)
      try {
        if (event.type === "image_output") {
          options.observe?.({ type: "image_output", partId: event.partId,
            mimeType: event.mimeType, sizeBytes: event.bytes.byteLength })
        } else if (event.type !== "provider_state") {
          options.observe?.(event)
        }
      } catch {
        // Observation is auxiliary; a UI or diagnostic subscriber cannot fail a run.
      }
      if (event.type === "finish" || event.type === "error") {
        terminal = event
      }
    }
  } catch (error) {
    if (error instanceof ProviderStreamError) {
      if (!assembler.outputObserved || error.detail.outputObserved) throw error
      throw new ProviderStreamError(error.detail, true)
    }
    throw new ProviderStreamError(
      protocolProviderError({
        providerId: options.provider.providerId,
        modelId: options.provider.model.id,
        message: output.includes("image")
          ? "provider image stream failed before a complete response"
          : `provider stream threw instead of emitting an error event: ${errorMessage(error)}`
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
  private readonly images = new Map<string, ProviderImageCandidate>()
  private readonly partKinds = new Map<string, string>()
  private imageBytes = 0
  private readonly states: ProviderState[] = []
  private readonly stateByPart = new Map<string, ProviderState>()
  private usage: ProviderUsage | undefined
  private finish: ProviderTurnResult["finish"] | undefined
  private error: ProviderError | undefined
  outputObserved = false

  constructor(
    providerId: string,
    modelId: string,
    private readonly allowImages: boolean,
    private readonly allowText: boolean
  ) {
    this.providerId = providerId
    this.modelId = modelId
  }

  observeOutput(event: ProviderEvent): void {
    if (event.type === "text_delta" || event.type === "reasoning_delta" ||
        event.type === "tool_call_start" || event.type === "image_output") {
      this.outputObserved = true
    }
  }

  accept(event: ProviderEvent): void {
    switch (event.type) {
      case "image_output": {
        if (!this.allowImages) this.fail("this provider request does not accept image output")
        try { validateImageOutput(event) } catch (error) {
          this.fail(errorMessage(error))
        }
        if (this.images.has(event.partId)) this.fail("provider emitted a duplicate image part")
        this.imageBytes += event.bytes.byteLength
        if (this.images.size >= IMAGE_OUTPUT_LIMITS.count ||
            this.imageBytes > IMAGE_OUTPUT_LIMITS.totalBytes) {
          this.fail("provider image output exceeds the response limit")
        }
        this.addPart(event.partId, "image")
        this.images.set(event.partId, { type: "image_candidate", id: event.partId,
          mimeType: event.mimeType, bytes: Uint8Array.from(event.bytes) })
        return
      }
      case "text_delta":
        if (!this.allowText) this.fail("this provider request does not accept text output")
        this.requireNonEmpty(event.delta, "text delta")
        this.addPart(event.partId, "text")
        this.text.set(event.partId, (this.text.get(event.partId) ?? "") + event.delta)
        this.outputObserved = true
        return
      case "reasoning_delta": {
        this.requireNonEmpty(event.delta, "reasoning delta")
        this.addPart(event.partId, "reasoning")
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
        this.addPart(`tool_call_${event.index}`, "tool")
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

  complete(): ProviderResponseCandidate {
    if (this.error !== undefined) {
      throw new ProviderStreamError(this.error, this.outputObserved)
    }
    if (this.finish === undefined) {
      this.fail("provider stream ended without a terminal event")
    }

    if (this.images.size > 0 && this.finish.reason !== "stop" && this.finish.reason !== "tool_calls") {
      this.fail("incomplete image response cannot be published")
    }
    const parts = this.partOrder.map((partId): ProviderResponseCandidate["parts"][number] => {
      const image = this.images.get(partId)
      if (image !== undefined) return image
      if (this.partKinds.get(partId) === "tool") {
        const tool = [...this.tools.values()].find((item) => `tool_call_${item.index}` === partId)
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

    const hasToolCalls = parts.some((part) => part.type === "tool_call")
    if ((this.finish.reason === "tool_calls") !== hasToolCalls) {
      this.fail(
        this.finish.reason === "tool_calls"
          ? "provider finished with tool_calls but emitted no tool call"
          : `provider emitted a tool call but finished with ${this.finish.reason}`
      )
    }

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

  private addPart(partId: string, kind: string): void {
    if (partId.length === 0) this.fail("provider emitted an empty part identity")
    const prior = this.partKinds.get(partId)
    if (prior !== undefined && prior !== kind) {
      this.fail("provider reused a part identity across output kinds")
    }
    if (prior !== undefined && this.images.size > 0 && this.partOrder.at(-1) !== partId) {
      this.fail("provider resumed a closed part across image output")
    }
    if (prior === undefined) {
      this.partKinds.set(partId, kind)
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
