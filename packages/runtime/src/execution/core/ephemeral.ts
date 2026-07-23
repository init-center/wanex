import type { ContextCompiler } from "../../context/memory/index.js"
import {
  consumeProviderStream,
  type ProviderAdapter
} from "../../provider/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult,
  RuntimeAbortSignal
} from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import { runCancellable, throwIfAborted } from "./cancellable.js"
import { isToolCall } from "./replay.js"
import { buildSessionReplayMessages } from "./session-replay.js"
import { prepareProviderReplayResources } from "../../resources/index.js"

export interface EphemeralSideQueryRuntimeOptions {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly contextCompiler?: ContextCompiler
  readonly timeoutMs?: number
}

export interface RunEphemeralSideQueryRequest extends EphemeralQueryRequest {
  readonly signal?: RuntimeAbortSignal
}

export async function runEphemeralSideQuery(
  options: EphemeralSideQueryRuntimeOptions,
  request: RunEphemeralSideQueryRequest
): Promise<EphemeralQueryResult> {
  validateEphemeralQueryRequest(request)
  throwIfAborted(request.signal, "ephemeral query")

  const replayMessages =
    request.sessionId === undefined
      ? []
      : await buildSessionReplayMessages({
          session: options.session,
          sessionId: request.sessionId,
          ...(options.contextCompiler === undefined
            ? {}
            : { contextCompiler: options.contextCompiler })
        })

  const preparedMessages = await prepareProviderReplayResources(
    options.session,
    options.provider.capabilities,
    [
      ...replayMessages,
      {
        role: "user",
        content: request.question
      }
    ]
  )

  const response = await runCancellable(
    (signal) =>
      consumeProviderStream({
        provider: options.provider,
        request: {
          messages: preparedMessages,
          ...(request.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: request.maxOutputTokens }),
          ...(signal === undefined ? {} : { signal })
        }
      }),
    {
      signal: request.signal,
      timeoutMs: options.timeoutMs,
      label: "ephemeral query provider completion"
    }
  )

  const toolCall = response.parts.find(isToolCall)
  if (toolCall !== undefined) {
    throw new Error(
      `ephemeral query toolPolicy none rejected provider tool call: ${toolCall.toolName}`
    )
  }

  return {
    output: response.parts,
    telemetry: {
      providerId: options.provider.providerId,
      modelId: options.provider.modelId,
      replayMessageCount: replayMessages.length,
      outputPartCount: response.parts.length
    }
  }
}

function validateEphemeralQueryRequest(
  request: RunEphemeralSideQueryRequest
): void {
  if (request.question.length === 0) {
    throw new Error("ephemeral query question must not be empty")
  }
  if (request.toolPolicy !== undefined && request.toolPolicy !== "none") {
    throw new Error("ephemeral query toolPolicy must be none")
  }
  if (request.memoryPolicy !== undefined && request.memoryPolicy !== "exclude") {
    throw new Error("ephemeral query memoryPolicy must be exclude")
  }
  if (request.persistence !== undefined && request.persistence !== "none") {
    throw new Error("ephemeral query persistence must be none")
  }
  if (request.maxOutputTokens !== undefined && request.maxOutputTokens <= 0) {
    throw new Error("ephemeral query maxOutputTokens must be positive")
  }
  if (request.contextSnapshotId !== undefined) {
    if (request.contextSnapshotId.length === 0) {
      throw new Error("ephemeral query contextSnapshotId must not be empty")
    }
    throw new Error(
      "ephemeral query contextSnapshotId is not supported until a context snapshot runtime exists"
    )
  }
}
