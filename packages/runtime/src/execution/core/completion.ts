import {
  consumeProviderStream,
  ProviderStreamError,
  protocolProviderError,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderObservedEvent,
  type PreparedProviderReplayMessage,
  type ProviderToolChoice,
  type ProviderToolDefinition,
  type ProviderResponseCandidate
} from "../../provider/index.js"
import type { ModelOutputModality, RuntimeAbortSignal } from "@wanex/protocol"
import { runCancellable } from "./cancellable.js"

export async function runProviderCompletion(
  provider: ProviderAdapter,
  request: {
    readonly messages: readonly PreparedProviderReplayMessage[]
    readonly signal: RuntimeAbortSignal | undefined
    readonly timeoutMs: number | undefined
    readonly maxOutputTokens: number
    readonly outputModalities: readonly ModelOutputModality[]
    readonly observe?: (event: ProviderObservedEvent) => void
    readonly checkpoint?: (event: ProviderEvent) => Promise<void>
    readonly tools?: readonly ProviderToolDefinition[]
    readonly toolChoice?: ProviderToolChoice
    readonly parallelToolCalls?: boolean
  }
): Promise<ProviderResponseCandidate> {
  let outputObserved = false
  try {
    return await runCancellable(
      (signal) =>
        consumeProviderStream({
          provider,
          request: {
            messages: request.messages,
            outputModalities: request.outputModalities,
            maxOutputTokens: request.maxOutputTokens,
            ...(signal === undefined ? {} : { signal }),
            ...(request.tools === undefined ? {} : { tools: request.tools }),
            ...(request.toolChoice === undefined
              ? {}
              : { toolChoice: request.toolChoice }),
            ...(request.parallelToolCalls === undefined
              ? {}
              : { parallelToolCalls: request.parallelToolCalls })
          },
          ...(request.observe === undefined ? {} : { observe: request.observe }),
          checkpoint: async (event) => {
            if (event.type === "text_delta" || event.type === "reasoning_delta" ||
                event.type === "tool_call_start" || event.type === "image_output") {
              outputObserved = true
            }
            await request.checkpoint?.(event)
          }
        }),
      {
        signal: request.signal,
        timeoutMs: request.timeoutMs,
        label: "provider completion"
      }
    )
  } catch (error) {
    if (error instanceof ProviderStreamError) {
      throw error
    }
    const name = error instanceof Error ? error.name : ""
    if (name === "WanexTimeoutError" || name === "WanexAbortError") {
      throw new ProviderStreamError(
        {
          ...protocolProviderError({
            providerId: provider.providerId,
            modelId: provider.model.id,
            message: error instanceof Error ? error.message : String(error)
          }),
          category: name === "WanexTimeoutError" ? "timeout" : "aborted",
          phase: outputObserved ? "stream" : "request",
          retryable: name === "WanexTimeoutError"
        },
        outputObserved
      )
    }
    throw error
  }
}
