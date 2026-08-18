import type {
  JsonValue,
  ModelDescriptor,
  TextMessagePart,
  ToolCallMessagePart
} from "@wanex/protocol"
import { assertConversationModelSupported, fakeModelDescriptor } from "../model-descriptor.js"
import { providerErrorEvent } from "../errors.js"
import { textContent } from "../replay.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  PreparedProviderReplayMessage,
  ProviderRequest
} from "../types.js"

export interface FakeProviderAdapterOptions {
  readonly providerId?: string
  readonly model?: ModelDescriptor
  readonly responseText: string
  readonly toolName?: string
}

export class FakeProviderAdapter implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId: string
  readonly model: ModelDescriptor
  private readonly responseText: string
  private readonly toolName: string | undefined

  constructor(options: FakeProviderAdapterOptions) {
    this.providerId = options.providerId ?? "fake"
    this.model = assertConversationModelSupported(
      "fake",
      options.model ?? fakeModelDescriptor()
    )
    this.responseText = options.responseText
    this.toolName = options.toolName
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (request.signal?.aborted === true) {
      yield providerErrorEvent({
        providerId: this.providerId,
        modelId: this.model.id,
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

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages.map((message): JsonValue => ({
      role: message.role,
      content: message.content.some(
        (part) => part.type === "resource" || part.type === "tool_result"
      )
        ? message.content.map(fakeReplayPart)
        : textContent(message.content)
    }))
  }
}

function fakeReplayPart(
  part: PreparedProviderReplayMessage["content"][number]
): JsonValue {
  if (part.type === "resource") {
    return {
      type: "resource",
      resourceId: part.resourceId,
      kind: part.kind,
      mediaType: part.mediaType ?? null,
      sizeBytes: part.sizeBytes,
      sha256: part.sha256
    }
  }
  if (part.type === "tool_result") {
    return {
      type: "tool_result",
      toolCallId: part.toolCallId,
      contentDigest: part.contentDigest,
      isError: part.isError,
      content: part.content.map((item): JsonValue => {
        if (item.type === "text") return { type: "text", text: item.text }
        if (item.type === "json") return { type: "json", value: item.value }
        return {
          type: "resource",
          resourceId: item.resourceId,
          kind: item.kind,
          mediaType: item.mediaType ?? null,
          sizeBytes: item.sizeBytes,
          sha256: item.sha256
        }
      })
    }
  }
  if (part.type === "text") return { type: "text", text: part.text }
  return { type: part.type }
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
