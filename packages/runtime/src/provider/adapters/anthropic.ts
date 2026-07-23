import type {
  JsonValue,
  MessagePart,
  ProviderCapabilities,
  ProviderState,
  ToolCallMessagePart
} from "@wanex/protocol"
import {
  ANTHROPIC_MESSAGES_PROVIDER_CAPABILITIES,
  assertProfileCapabilitiesSupported
} from "../capabilities.js"
import {
  providerErrorEvent,
  providerStreamFailureEvent
} from "../errors.js"
import {
  globalProviderFetch,
  httpProviderError,
  type ProviderFetch
} from "../http.js"
import { requirePreparedProviderResource, textContent } from "../replay.js"
import { parseServerSentEvents } from "../sse.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderFinishEvent,
  PreparedProviderResourcePart,
  ProviderReplayMessage,
  ProviderRequest,
  ProviderUsage
} from "../types.js"
import {
  expectRecord,
  expectString,
  optionalNumber,
  optionalString
} from "../utils.js"

export interface AnthropicAdapterOptions {
  readonly modelId: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly anthropicVersion?: string
  readonly fetch?: ProviderFetch
  readonly capabilities?: ProviderCapabilities
}

interface AnthropicBlock {
  readonly index: number
  readonly partId: string
  readonly type: "text" | "thinking" | "tool_use"
  readonly toolCallId?: string
  thinking: string
  signature: string
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly kind = "anthropic" as const
  readonly providerId = "anthropic"
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly version: string
  private readonly fetchImpl: ProviderFetch

  constructor(options: AnthropicAdapterOptions) {
    this.modelId = options.modelId
    this.capabilities = assertProfileCapabilitiesSupported(
      "anthropic",
      options.capabilities ?? ANTHROPIC_MESSAGES_PROVIDER_CAPABILITIES
    )
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.version = options.anthropicVersion ?? "2023-06-01"
    this.fetchImpl = options.fetch ?? globalProviderFetch
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (request.signal?.aborted === true) {
      yield providerErrorEvent({
        providerId: this.providerId,
        modelId: this.modelId,
        error: new Error("aborted"),
        phase: "request",
        signalAborted: true
      })
      return
    }
    let response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: this.buildReplayMessages(request.messages),
          ...anthropicSystemField(request.messages),
          ...anthropicToolRequestFields(request),
          max_tokens: request.maxOutputTokens ?? 4096,
          stream: true
        }),
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
    } catch (error) {
      yield providerErrorEvent({
        providerId: this.providerId,
        modelId: this.modelId,
        error,
        phase: "request",
        ...(request.signal === undefined
          ? {}
          : { signalAborted: request.signal.aborted })
      })
      return
    }
    if (!response.ok) {
      yield await httpProviderError({
        response,
        providerId: this.providerId,
        modelId: this.modelId
      })
      return
    }
    if (response.body === null) {
      yield this.protocolError("Anthropic streaming response has no body")
      return
    }
    try {
      yield* this.translateSse(response.body)
    } catch (error) {
      yield providerStreamFailureEvent({
        providerId: this.providerId,
        modelId: this.modelId,
        error,
        ...(request.signal === undefined
          ? {}
          : { signalAborted: request.signal.aborted })
      })
    }
  }

  buildReplayMessages(
    messages: readonly ProviderReplayMessage[]
  ): JsonValue[] {
    return messages.flatMap((message): JsonValue[] => {
      if (message.role === "system") {
        return []
      }
      if (message.role === "assistant") {
        return [{
          role: "assistant",
          content: anthropicAssistantContent(message.content, this.modelId)
        }]
      }
      if (message.role === "tool") {
        return [{
          role: "user",
          content: message.content
            .filter((part) => part.type === "tool_result")
            .map((part) => ({
              type: "tool_result",
              tool_use_id: part.toolCallId,
              content: JSON.stringify(part.result),
              is_error: part.isError
            }))
        }]
      }
      return [{ role: message.role, content: anthropicUserContent(message) }]
    })
  }

  private async *translateSse(
    body: AsyncIterable<Uint8Array | string>
  ): AsyncIterable<ProviderEvent> {
    const blocks = new Map<number, AnthropicBlock>()
    let usage: ProviderUsage = {}
    let finish: ProviderFinishEvent | undefined
    let stopped = false

    for await (const data of parseServerSentEvents(body)) {
      const event = expectRecord(JSON.parse(data), "Anthropic stream event")
      const type = expectString(event.type, "Anthropic event type")
      if (type === "ping") {
        continue
      }
      if (type === "error") {
        const detail = expectRecord(event.error, "Anthropic error")
        const errorType = optionalString(detail.type, "Anthropic error type")
        yield {
          type: "error",
          error: {
            category: errorType === "overloaded_error" ? "server" : "unknown",
            message: optionalString(detail.message, "Anthropic error message") ?? "Anthropic stream error",
            retryable: errorType === "overloaded_error",
            providerId: this.providerId,
            modelId: this.modelId,
            phase: "stream",
            ...(errorType === undefined ? {} : { providerCode: errorType })
          }
        }
        return
      }
      if (type === "message_start") {
        const message = expectRecord(event.message, "Anthropic message_start message")
        usage = mergeAnthropicUsage(usage, message.usage)
        yield { type: "usage", usage }
        continue
      }
      if (type === "content_block_start") {
        const index = requireIndex(event.index)
        const content = expectRecord(event.content_block, "Anthropic content block")
        const blockType = expectString(content.type, "Anthropic content block type")
        if (blocks.has(index)) {
          throw new Error("Anthropic content block started twice")
        }
        if (blockType === "text") {
          const block: AnthropicBlock = { index, partId: `text_${index}`, type: "text", thinking: "", signature: "" }
          blocks.set(index, block)
          const initial = optionalString(content.text, "Anthropic initial text")
          if (initial !== undefined && initial.length > 0) {
            yield { type: "text_delta", partId: block.partId, delta: initial }
          }
          continue
        }
        if (blockType === "thinking") {
          const block: AnthropicBlock = { index, partId: `reasoning_${index}`, type: "thinking", thinking: "", signature: "" }
          blocks.set(index, block)
          const initial = optionalString(content.thinking, "Anthropic initial thinking")
          if (initial !== undefined && initial.length > 0) {
            block.thinking += initial
            yield { type: "reasoning_delta", partId: block.partId, delta: initial, visibility: "provider_replay_only" }
          }
          continue
        }
        if (blockType === "tool_use") {
          const toolCallId = expectString(content.id, "Anthropic tool-use id")
          const toolName = expectString(content.name, "Anthropic tool-use name")
          const block: AnthropicBlock = { index, partId: `tool_call_${index}`, type: "tool_use", toolCallId, thinking: "", signature: "" }
          blocks.set(index, block)
          yield { type: "tool_call_start", index, toolCallId }
          yield { type: "tool_call_delta", toolCallId, toolNameDelta: toolName }
          const initialInput = expectRecord(content.input ?? {}, "Anthropic tool-use input")
          if (Object.keys(initialInput).length > 0) {
            yield { type: "tool_call_delta", toolCallId, inputJsonDelta: JSON.stringify(initialInput) }
          }
          continue
        }
        throw new Error(`unsupported Anthropic content block: ${blockType}`)
      }
      if (type === "content_block_delta") {
        const block = requireBlock(blocks, requireIndex(event.index))
        const delta = expectRecord(event.delta, "Anthropic content delta")
        const deltaType = expectString(delta.type, "Anthropic content delta type")
        if (deltaType === "text_delta" && block.type === "text") {
          const text = expectString(delta.text, "Anthropic text delta")
          if (text.length > 0) yield { type: "text_delta", partId: block.partId, delta: text }
        } else if (deltaType === "thinking_delta" && block.type === "thinking") {
          const thinking = expectString(delta.thinking, "Anthropic thinking delta")
          block.thinking += thinking
          if (thinking.length > 0) yield { type: "reasoning_delta", partId: block.partId, delta: thinking, visibility: "provider_replay_only" }
        } else if (deltaType === "signature_delta" && block.type === "thinking") {
          block.signature += expectString(delta.signature, "Anthropic signature delta")
        } else if (deltaType === "input_json_delta" && block.type === "tool_use") {
          yield {
            type: "tool_call_delta",
            toolCallId: block.toolCallId!,
            inputJsonDelta: expectString(delta.partial_json, "Anthropic tool input delta")
          }
        } else {
          throw new Error(`Anthropic delta ${deltaType} does not match block ${block.type}`)
        }
        continue
      }
      if (type === "content_block_stop") {
        const block = requireBlock(blocks, requireIndex(event.index))
        if (block.type === "tool_use") {
          yield { type: "tool_call_end", toolCallId: block.toolCallId! }
        } else if (block.type === "thinking") {
          const state: ProviderState = {
            providerId: this.providerId,
            modelId: this.modelId,
            stateKind: "thinking",
            replayPolicy: block.signature.length > 0 ? "required" : "optional",
            payload: {
              thinking: block.thinking,
              ...(block.signature.length === 0 ? {} : { signature: block.signature })
            }
          }
          yield { type: "provider_state", partId: block.partId, state }
        }
        continue
      }
      if (type === "message_delta") {
        const delta = expectRecord(event.delta, "Anthropic message delta")
        const stopReason = optionalString(delta.stop_reason, "Anthropic stop reason")
        if (stopReason !== undefined) {
          finish = normalizeAnthropicFinish(stopReason)
        }
        usage = mergeAnthropicUsage(usage, event.usage)
        yield { type: "usage", usage }
        continue
      }
      if (type === "message_stop") {
        stopped = true
        break
      }
      throw new Error(`unsupported Anthropic stream event: ${type}`)
    }

    if (!stopped) {
      yield this.protocolError("Anthropic stream ended without message_stop")
      return
    }
    if (finish === undefined) {
      yield this.protocolError("Anthropic stream ended without stop_reason")
      return
    }
    yield finish
  }

  private protocolError(message: string): ProviderEvent {
    return {
      type: "error",
      error: {
        category: "protocol",
        message,
        retryable: false,
        providerId: this.providerId,
        modelId: this.modelId,
        phase: "stream"
      }
    }
  }
}

function anthropicUserContent(message: ProviderReplayMessage): JsonValue {
  const resources = message.content.filter((part) => part.type === "resource")
  if (resources.length === 0) {
    return textContent(message.content)
  }
  if (message.role !== "user") {
    throw new Error("Anthropic resource input is only valid in user messages")
  }
  return message.content.map((part): JsonValue => {
    if (part.type === "text") {
      return { type: "text", text: part.text }
    }
    if (part.type !== "resource") {
      throw new Error(`Anthropic user resource message contains invalid part: ${part.type}`)
    }
    const prepared = requirePreparedProviderResource(part)
    const data = Buffer.from(prepared.bytes).toString("base64")
    if (prepared.kind === "image" && isAnthropicImageType(prepared.mediaType)) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: prepared.mediaType!,
          data
        }
      }
    }
    if (
      prepared.kind === "document" &&
      prepared.mediaType === "application/pdf"
    ) {
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data
        }
      }
    }
    throw new Error(
      `Anthropic messages adapter does not support ${prepared.kind} resource input: ${prepared.resourceId}`
    )
  })
}

function isAnthropicImageType(mediaType: string | undefined): boolean {
  return mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp"
}

function anthropicSystemField(
  messages: readonly ProviderReplayMessage[]
) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => textContent(message.content))
    .filter((text) => text.length > 0)
    .join("\n\n")
  return system.length === 0 ? {} : { system }
}

function anthropicToolRequestFields(request: ProviderRequest) {
  const tools = request.tools ?? []
  const choice = request.toolChoice ?? "auto"
  if (tools.length === 0 || choice === "none") {
    return {}
  }
  const disableParallel = request.parallelToolCalls === false
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    })),
    tool_choice:
      typeof choice === "object"
        ? {
            type: "tool",
            name: choice.name,
            disable_parallel_tool_use: disableParallel
          }
        : {
            type: choice === "required" ? "any" : "auto",
            disable_parallel_tool_use: disableParallel
          }
  }
}

function anthropicAssistantContent(parts: readonly MessagePart[], modelId: string): JsonValue[] {
  return parts.flatMap((part): JsonValue[] => {
    if (part.type === "text") {
      return [{ type: "text", text: part.text }]
    }
    if (part.type === "tool_call") {
      return [{ type: "tool_use", id: part.toolCallId, name: part.toolName, input: part.input }]
    }
    if (part.type !== "reasoning") {
      return []
    }
    const state = part.providerState
    if (state?.providerId !== "anthropic" || state.modelId !== modelId) {
      return []
    }
    const payload = expectRecord(state.payload, "Anthropic thinking state")
    return [{
      type: "thinking",
      thinking: expectString(payload.thinking, "Anthropic thinking"),
      ...(payload.signature === undefined
        ? {}
        : { signature: expectString(payload.signature, "Anthropic thinking signature") })
    }]
  })
}

function mergeAnthropicUsage(prior: ProviderUsage, value: unknown): ProviderUsage {
  if (value === undefined || value === null) return prior
  const usage = expectRecord(value, "Anthropic usage")
  return {
    ...prior,
    ...tokenField(usage.input_tokens, "inputTokens"),
    ...tokenField(usage.output_tokens, "outputTokens"),
    ...tokenField(usage.cache_read_input_tokens, "cacheReadTokens"),
    ...tokenField(usage.cache_creation_input_tokens, "cacheWriteTokens")
  }
}

function tokenField(value: unknown, key: keyof ProviderUsage) {
  const token = optionalNumber(value, `Anthropic ${String(key)}`)
  return token === undefined ? {} : { [key]: token }
}

function requireIndex(value: unknown): number {
  const index = optionalNumber(value, "Anthropic content block index")
  if (index === undefined || !Number.isSafeInteger(index) || index < 0) {
    throw new Error("Anthropic content block index must be a non-negative integer")
  }
  return index
}

function requireBlock(blocks: Map<number, AnthropicBlock>, index: number): AnthropicBlock {
  const block = blocks.get(index)
  if (block === undefined) throw new Error(`Anthropic content block ${index} was not started`)
  return block
}

function normalizeAnthropicFinish(rawReason: string): ProviderFinishEvent {
  return {
    type: "finish",
    reason:
      rawReason === "end_turn" || rawReason === "stop_sequence"
        ? "stop"
        : rawReason === "max_tokens"
          ? "length"
          : rawReason === "tool_use"
            ? "tool_calls"
            : rawReason === "refusal"
              ? "content_filter"
              : "other",
    rawReason
  }
}
