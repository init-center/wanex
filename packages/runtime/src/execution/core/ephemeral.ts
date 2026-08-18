import { createHash } from "node:crypto"
import type { ContextCompiler } from "../../context/memory/index.js"
import {
  consumeProviderStream,
  type ProviderAdapter
} from "../../provider/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult,
  ModelEndpoint,
  RuntimeAbortSignal
} from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import { runCancellable, throwIfAborted } from "./cancellable.js"
import { isToolCall } from "./replay.js"
import { buildSessionReplayMessages } from "./session-replay.js"
import { prepareProviderReplayResources } from "../../resources/index.js"
import { modelEndpointDigest } from "../../provider/index.js"

export interface EphemeralSideQueryRuntimeOptions {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly modelEndpoint: ModelEndpoint
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

  assertProviderMatchesEndpoint(options.provider, options.modelEndpoint)

  const sourceMessages =
    request.sessionId === undefined
      ? []
      : await options.session.listMessages({ sessionId: request.sessionId })
  const replayMessages =
    request.sessionId === undefined
      ? []
      : await buildSessionReplayMessages({
          session: options.session,
          sessionId: request.sessionId,
          messages: sourceMessages,
          ...(options.contextCompiler === undefined
            ? {}
            : { contextCompiler: options.contextCompiler })
        })

  const preparedMessages = await prepareProviderReplayResources(
    options.session,
    {
      protocol: options.provider.protocol,
      inputModalities: options.provider.model.inputModalities
    },
    [
      ...replayMessages,
      {
        role: "user",
        content: request.question
      }
    ]
  )

  const providerRequest = {
    messages: preparedMessages,
    ...(request.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: request.maxOutputTokens })
  }
  const response = await runCancellable(
    (signal) =>
      consumeProviderStream({
        provider: options.provider,
        request: {
          ...providerRequest,
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
    evidence: {
      ...(request.sessionId === undefined
        ? {}
        : {
            source: sourceEvidence(request.sessionId, sourceMessages)
          }),
      provider: {
        endpointId: options.modelEndpoint.id,
        endpointDigest: modelEndpointDigest(options.modelEndpoint),
        protocolId: options.modelEndpoint.protocol.id,
        providerId: options.modelEndpoint.connection.providerId,
        modelId: options.modelEndpoint.model.id
      },
      inputDigest: digestJson(providerRequest),
      outputDigest: digestJson(response.parts),
      completedAt: Date.now()
    },
    telemetry: {
      providerId: options.provider.providerId,
      modelId: options.provider.model.id,
      replayMessageCount: replayMessages.length,
      outputPartCount: response.parts.length
    }
  }
}

function sourceEvidence(
  sessionId: string,
  messages: Awaited<ReturnType<WanexSessionCore["listMessages"]>>
): NonNullable<EphemeralQueryResult["evidence"]["source"]> {
  const head = messages.reduce<(typeof messages)[number] | undefined>(
    (current, candidate) =>
      current === undefined || candidate.sequence > current.sequence
        ? candidate
        : current,
    undefined
  )
  return {
    sessionId,
    headSequence: head?.sequence ?? 0,
    ...(head === undefined
      ? {}
      : { headMessageId: head.id, headTurnId: head.turnId })
  }
}

function assertProviderMatchesEndpoint(
  provider: ProviderAdapter,
  endpoint: ModelEndpoint
): void {
  if (
    provider.protocol.id !== endpoint.protocol.id ||
    provider.providerId !== endpoint.connection.providerId ||
    provider.model.id !== endpoint.model.id
  ) {
    throw new Error("ephemeral query provider does not match its model endpoint")
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    )
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
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
