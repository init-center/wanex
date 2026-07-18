import type { TextMessagePart, ToolCallMessagePart } from "@wanex/protocol"
import { providerErrorEvent } from "../errors.js"
import { textContent } from "../replay.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderReplayMessage,
  ProviderRequest
} from "../types.js"

export interface FakeProviderAdapterOptions {
  readonly providerId?: string
  readonly modelId?: string
  readonly responseText: string
  readonly toolName?: string
}

export class FakeProviderAdapter implements ProviderAdapter {
  readonly providerId: string
  readonly modelId: string
  private readonly responseText: string
  private readonly toolName: string | undefined

  constructor(options: FakeProviderAdapterOptions) {
    this.providerId = options.providerId ?? "fake"
    this.modelId = options.modelId ?? "fake-model"
    this.responseText = options.responseText
    this.toolName = options.toolName
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (request.signal?.aborted === true) {
      yield providerErrorEvent({
        providerId: this.providerId,
        modelId: this.modelId,
        error: new DOMException("aborted", "AbortError"),
        phase: "request",
        signalAborted: true
      })
      return
    }
    if (
      this.toolName !== undefined &&
      !request.messages.some((message) =>
        message.content.some((part) => part.type === "tool_result")
      )
    ) {
      yield { type: "tool_call_start", index: 0, toolCallId: "call_fake_0" }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_fake_0",
        toolNameDelta: this.toolName,
        inputJsonDelta: '{"source":"fake-provider"}'
      }
      yield { type: "tool_call_end", toolCallId: "call_fake_0" }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    if (this.responseText.length > 0) {
      yield { type: "text_delta", partId: "text_0", delta: this.responseText }
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]) {
    return messages.map((message) => ({
      role: message.role,
      content: textContent(message.content)
    }))
  }
}

export function fakeTextPart(text: string): TextMessagePart {
  return { type: "text", id: "text_0", text }
}

export function fakeToolCallPart(toolName: string): ToolCallMessagePart {
  return {
    type: "tool_call",
    id: "tool_call_0",
    toolCallId: "call_fake_0",
    toolName,
    input: { source: "fake-provider" }
  }
}
