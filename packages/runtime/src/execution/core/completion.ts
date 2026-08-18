import {
  consumeProviderStream,
  ProviderStreamError,
  protocolProviderError,
  type ProviderAdapter,
  type ProviderEvent,
  type PreparedProviderReplayMessage,
  type ProviderToolChoice,
  type ProviderToolDefinition,
  type ProviderTurnResult
} from "../../provider/index.js"
import type { RuntimeAbortSignal } from "@wanex/protocol"
import { runCancellable } from "./cancellable.js"

export async function runProviderCompletion(
  provider: ProviderAdapter,
  request: {
    readonly messages: readonly PreparedProviderReplayMessage[]
    readonly signal: RuntimeAbortSignal | undefined
    readonly timeoutMs: number | undefined
    readonly maxOutputTokens: number
    readonly observe?: (event: ProviderEvent) => void
    readonly checkpoint?: (event: ProviderEvent) => Promise<void>
    readonly tools?: readonly ProviderToolDefinition[]
    readonly toolChoice?: ProviderToolChoice
    readonly parallelToolCalls?: boolean
  }
): Promise<ProviderTurnResult> {
  let outputObserved = false
  try {
    return await runCancellable(
      (signal) =>
        consumeProviderStream({
          provider,
          request: {
            messages: request.messages,
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
          observe: (event) => {
            if (
              event.type === "text_delta" ||
              event.type === "reasoning_delta" ||
              event.type === "tool_call_start"
            ) {
              outputObserved = true
            }
            request.observe?.(event)
          },
          ...(request.checkpoint === undefined
            ? {}
            : { checkpoint: request.checkpoint })
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
