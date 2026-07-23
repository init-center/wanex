import type {
  JsonValue,
  MessagePart,
  ProviderCapabilities,
  ProviderState,
  ToolCallMessagePart
} from "@wanex/protocol"
import {
  assertProfileCapabilitiesSupported,
  OPENAI_CHAT_PROVIDER_CAPABILITIES,
  TEXT_PROVIDER_CAPABILITIES
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
import {
  requirePreparedProviderResource,
  textContent,
  toolCallsToOpenAI
} from "../replay.js"
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
  jsonMetadata,
  optionalNumber,
  optionalString
} from "../utils.js"

export interface OpenAICompatibleAdapterOptions {
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly fetch?: ProviderFetch
  readonly reasoningReplay?: "optional" | "required"
  readonly capabilities?: ProviderCapabilities
}

interface OpenAIToolStreamState {
  readonly index: number
  id: string | undefined
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly kind = "openai-compatible" as const
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  protected readonly reasoningReplay: "optional" | "required"
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: ProviderFetch

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.providerId = options.providerId
    this.modelId = options.modelId
    this.capabilities = assertProfileCapabilitiesSupported(
      "openai-compatible",
      options.capabilities ?? OPENAI_CHAT_PROVIDER_CAPABILITIES
    )
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? globalProviderFetch
    this.reasoningReplay = options.reasoningReplay ?? "optional"
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
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: this.buildReplayMessages(request.messages),
          stream: true,
          stream_options: { include_usage: true },
          ...openAIToolRequestFields(request),
          ...(request.maxOutputTokens === undefined
            ? {}
            : { max_tokens: request.maxOutputTokens })
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
      yield this.protocolError("provider streaming response has no body")
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
    return messages.map((message) => {
      const toolCalls = message.content.filter(
        (part): part is ToolCallMessagePart => part.type === "tool_call"
      )
      const toolResults = message.content.filter(
        (part) => part.type === "tool_result"
      )
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: toolResults[0]?.toolCallId ?? "unknown",
          content: JSON.stringify(toolResults.map((part) => part.result))
        }
      }
      const reasoningContent = findReasoningContent(
        message.content,
        this.providerId,
        this.modelId
      )
      if (
        this.reasoningReplay === "required" &&
        message.role === "assistant" &&
        toolCalls.length > 0 &&
        reasoningContent === undefined
      ) {
        throw new MissingRequiredProviderStateError(
          `${this.providerId} assistant tool call requires reasoning state for same-model replay`
        )
      }
      return {
        role: message.role,
        content: openAIMessageContent(message),
        ...(reasoningContent === undefined
          ? {}
          : { reasoning_content: reasoningContent }),
        ...(toolCalls.length === 0 ? {} : { tool_calls: toolCallsToOpenAI(toolCalls) })
      }
    })
  }

  private async *translateSse(
    body: AsyncIterable<Uint8Array | string>
  ): AsyncIterable<ProviderEvent> {
    const tools = new Map<number, OpenAIToolStreamState>()
    let finish: ProviderFinishEvent | undefined
    let reasoning = ""

    for await (const data of parseServerSentEvents(body)) {
      if (data === "[DONE]") {
        break
      }
      const chunk = expectRecord(JSON.parse(data), "OpenAI stream chunk")
      const usage = normalizeOpenAIUsage(chunk.usage)
      if (usage !== undefined) {
        yield { type: "usage", usage }
      }
      const choices = Array.isArray(chunk.choices) ? chunk.choices : []
      for (const rawChoice of choices) {
        const choice = expectRecord(rawChoice, "OpenAI stream choice")
        const delta = expectRecord(choice.delta ?? {}, "OpenAI stream delta")
        const content = optionalString(delta.content, "OpenAI delta content")
        if (content !== undefined && content.length > 0) {
          yield { type: "text_delta", partId: "text_0", delta: content }
        }
        const reasoningDelta = optionalString(
          delta.reasoning_content ?? delta.reasoning,
          "OpenAI reasoning delta"
        )
        if (reasoningDelta !== undefined && reasoningDelta.length > 0) {
          reasoning += reasoningDelta
          yield {
            type: "reasoning_delta",
            partId: "reasoning_0",
            delta: reasoningDelta,
            visibility: "provider_replay_only"
          }
        }
        const toolDeltas = Array.isArray(delta.tool_calls) ? delta.tool_calls : []
        for (const rawTool of toolDeltas) {
          const tool = expectRecord(rawTool, "OpenAI tool-call delta")
          const index = optionalNumber(tool.index, "OpenAI tool-call index")
          if (index === undefined || !Number.isSafeInteger(index) || index < 0) {
            throw new Error("OpenAI tool-call index must be a non-negative integer")
          }
          let state = tools.get(index)
          const id = optionalString(tool.id, "OpenAI tool-call id")
          if (state === undefined) {
            if (id === undefined || id.length === 0) {
              throw new Error("OpenAI tool-call start requires id")
            }
            state = { index, id }
            tools.set(index, state)
            yield { type: "tool_call_start", index, toolCallId: id }
          } else if (id !== undefined && id !== state.id) {
            throw new Error("OpenAI tool-call id changed during streaming")
          }
          const fn = expectRecord(tool.function ?? {}, "OpenAI tool-call function")
          const name = optionalString(fn.name, "OpenAI tool name delta")
          const input = optionalString(fn.arguments, "OpenAI tool input delta")
          if ((name !== undefined && name.length > 0) || input !== undefined) {
            yield {
              type: "tool_call_delta",
              toolCallId: state.id!,
              ...(name === undefined || name.length === 0 ? {} : { toolNameDelta: name }),
              ...(input === undefined ? {} : { inputJsonDelta: input })
            }
          }
        }
        const rawFinish = optionalString(choice.finish_reason, "OpenAI finish reason")
        if (rawFinish !== undefined) {
          finish = normalizeFinish(rawFinish)
        }
      }
    }

    if (finish === undefined) {
      yield this.protocolError("OpenAI stream ended without finish_reason")
      return
    }
    for (const tool of [...tools.values()].sort((a, b) => a.index - b.index)) {
      yield { type: "tool_call_end", toolCallId: tool.id! }
    }
    if (reasoning.length > 0) {
      const state: ProviderState = {
        providerId: this.providerId,
        modelId: this.modelId,
        stateKind: "reasoning",
        replayPolicy: this.reasoningReplay,
        payload: { reasoning_content: reasoning }
      }
      yield { type: "provider_state", partId: "reasoning_0", state }
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

function openAIMessageContent(message: ProviderReplayMessage): JsonValue {
  const resources = message.content.filter((part) => part.type === "resource")
  if (resources.length === 0) {
    return textContent(message.content)
  }
  if (message.role !== "user") {
    throw new Error("OpenAI resource input is only valid in user messages")
  }
  return message.content.map((part): JsonValue => {
    if (part.type === "text") {
      return { type: "text", text: part.text }
    }
    if (part.type !== "resource") {
      throw new Error(`OpenAI user resource message contains invalid part: ${part.type}`)
    }
    const prepared = requirePreparedProviderResource(part)
    if (
      prepared.kind !== "image" ||
      prepared.mediaType?.startsWith("image/") !== true
    ) {
      throw new Error(
        `OpenAI chat adapter does not support ${prepared.kind} resource input: ${prepared.resourceId}`
      )
    }
    return {
      type: "image_url",
      image_url: {
        url: `data:${prepared.mediaType};base64,${Buffer.from(prepared.bytes).toString("base64")}`
      }
    }
  })
}

export class DeepSeekThinkingAdapter extends OpenAICompatibleAdapter {
  constructor(options: Omit<OpenAICompatibleAdapterOptions, "providerId" | "reasoningReplay">) {
    super({
      ...options,
      providerId: "deepseek",
      reasoningReplay: "required",
      capabilities: assertProfileCapabilitiesSupported(
        "deepseek",
        options.capabilities ?? TEXT_PROVIDER_CAPABILITIES
      )
    })
  }
}

export class MissingRequiredProviderStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MissingRequiredProviderStateError"
  }
}

function normalizeOpenAIUsage(value: unknown): ProviderUsage | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const usage = expectRecord(value, "OpenAI usage")
  const details =
    usage.output_tokens_details === undefined
      ? undefined
      : expectRecord(usage.output_tokens_details, "OpenAI output token details")
  return {
    ...optionalToken(usage.prompt_tokens, "inputTokens", "OpenAI prompt tokens"),
    ...optionalToken(usage.completion_tokens, "outputTokens", "OpenAI completion tokens"),
    ...optionalToken(details?.reasoning_tokens, "reasoningTokens", "OpenAI reasoning tokens"),
    ...optionalToken(usage.prompt_cache_hit_tokens, "cacheReadTokens", "OpenAI cache tokens"),
    ...metadataField(jsonMetadata(usage, [
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "output_tokens_details",
      "prompt_cache_hit_tokens"
    ]))
  }
}

function optionalToken(value: unknown, key: keyof ProviderUsage, label: string) {
  const token = optionalNumber(value, label)
  return token === undefined ? {} : { [key]: token }
}

function metadataField(metadata: ProviderUsage["metadata"]) {
  return metadata === undefined ? {} : { metadata }
}

function normalizeFinish(rawReason: string): ProviderFinishEvent {
  return {
    type: "finish",
    reason:
      rawReason === "stop"
        ? "stop"
        : rawReason === "length"
          ? "length"
          : rawReason === "tool_calls" || rawReason === "function_call"
            ? "tool_calls"
            : rawReason === "content_filter"
              ? "content_filter"
              : "other",
    rawReason
  }
}

function findReasoningContent(
  parts: readonly MessagePart[],
  providerId: string,
  modelId: string
): string | undefined {
  for (const part of parts) {
    if (part.type !== "reasoning") {
      continue
    }
    const state = part.providerState
    if (state?.providerId !== providerId || state.modelId !== modelId) {
      continue
    }
    const payload = expectRecord(state.payload, "provider reasoning state")
    return expectString(payload.reasoning_content, "reasoning_content")
  }
  return undefined
}

function openAIToolRequestFields(request: ProviderRequest) {
  const tools = request.tools ?? []
  if (tools.length === 0) {
    return {}
  }
  return {
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    })),
    tool_choice: openAIToolChoice(request.toolChoice ?? "auto"),
    ...(request.parallelToolCalls === undefined
      ? {}
      : { parallel_tool_calls: request.parallelToolCalls })
  }
}

function openAIToolChoice(choice: NonNullable<ProviderRequest["toolChoice"]>) {
  return typeof choice === "string"
    ? choice
    : { type: "function", function: { name: choice.name } }
}
