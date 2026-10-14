import type { JsonValue, ModelDescriptor } from "@wanex/protocol"
import { ProviderStreamError, protocolProviderError, providerErrorEvent } from "../errors.js"
import { globalProviderFetch, type ProviderFetch } from "../http.js"
import { decodeImageOutput, IMAGE_OUTPUT_LIMITS, validateImageOutput } from "../image-output.js"
import { assertConversationModelSupported } from "../model-descriptor.js"
import { requirePreparedProviderResource } from "../replay.js"
import { parseServerSentEvents } from "../sse.js"
import type { PreparedProviderReplayMessage, ProviderAdapter, ProviderEvent, ProviderRequest, ProviderUsage } from "../types.js"
import { expectRecord, expectString } from "../utils.js"

export interface GeminiAdapterOptions {
  readonly providerId: string
  readonly model: ModelDescriptor
  readonly baseUrl: string
  readonly apiKey: string
  readonly fetch?: ProviderFetch
}

export class GeminiAdapter implements ProviderAdapter {
  readonly protocol = { id: "gemini-generate-content" } as const
  readonly outputModalities = ["text", "image"] as const
  readonly providerId: string
  readonly model: ModelDescriptor
  private readonly fetchImpl: ProviderFetch

  constructor(private readonly options: GeminiAdapterOptions) {
    this.providerId = options.providerId
    this.model = assertConversationModelSupported(this.protocol.id, options.model)
    if (this.model.features.some((feature) => feature !== "reasoning")) {
      throw new Error("Gemini conversation adapter does not implement tool calling")
    }
    this.fetchImpl = options.fetch ?? globalProviderFetch
  }

  buildReplayMessages(messages: readonly PreparedProviderReplayMessage[]): JsonValue[] {
    return messages.filter((message) => message.role !== "system").map((message) => {
      if (message.role === "tool") throw new Error("Gemini conversation adapter does not implement tool replay")
      const parts = message.content.map((part): JsonValue => {
        let value: Record<string, JsonValue>
        if (part.type === "text" || part.type === "reasoning") {
          if (part.text === undefined) throw new Error("Gemini replay reasoning has no text")
          value = { text: part.text, ...(part.type === "reasoning" ? { thought: true } : {}) }
        } else if (part.type === "resource") {
          if (!this.model.inputModalities.includes("image")) throw new Error("Gemini model does not accept images")
          const prepared = requirePreparedProviderResource(part)
          validateImageOutput({ type: "image_output", partId: part.id, mimeType: part.mediaType ?? "", bytes: prepared.bytes })
          value = { inlineData: { mimeType: part.mediaType!, data: Buffer.from(prepared.bytes).toString("base64") } }
        } else {
          throw new Error("unsupported Gemini replay part")
        }
        if (message.role === "assistant") {
          const states = message.providerState?.filter((state) => state.providerId === this.providerId && state.modelId === this.model.id) ?? []
          for (const state of states) {
            if (typeof state.payload !== "object" || state.payload === null || Array.isArray(state.payload)) continue
            const payload = expectRecord(state.payload, "Gemini replay state")
            if (payload.protocol === this.protocol.id && payload.partId === part.id && payload.signature !== undefined) {
              value.thoughtSignature = expectString(payload.signature, "Gemini thought signature")
            }
          }
        }
        return value
      })
      return { role: message.role === "assistant" ? "model" : "user", parts }
    })
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (request.tools?.length || request.toolChoice !== undefined || request.parallelToolCalls !== undefined) {
      throw new Error("Gemini conversation adapter does not implement tool requests")
    }
    const contents = this.buildReplayMessages(request.messages)
    const system = request.messages.filter((message) => message.role === "system").flatMap((message) =>
      message.content.map((part) => {
        if (part.type !== "text") throw new Error("Gemini system input requires text")
        return { text: part.text }
      }))
    let response
    try {
      response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(this.model.id)}:streamGenerateContent?alt=sse`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.options.apiKey },
        body: JSON.stringify({ contents, ...(system.length ? { systemInstruction: { parts: system } } : {}),
          generationConfig: { responseModalities: (request.outputModalities ?? ["text"]).map((value) => value.toUpperCase()),
            ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }) } }),
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
    } catch (error) {
      yield providerErrorEvent({ providerId: this.providerId, modelId: this.model.id,
        error: new Error("Gemini request could not be completed"), phase: "request",
        ...(request.signal === undefined ? {} : { signalAborted: request.signal.aborted }) })
      return
    }
    if (!response.ok) {
      // Error bodies can echo inline data or credentials. Close without exposing them.
      if (response.body !== null) await response.body[Symbol.asyncIterator]().return?.()
      const status = response.status
      yield { type: "error", error: { providerId: this.providerId, modelId: this.model.id,
        phase: "request", statusCode: status, message: `Gemini request failed (${status})`,
        category: status === 401 ? "authentication" : status === 403 ? "authorization" : status === 429 ? "rate_limit" : status >= 500 ? "server" : "invalid_request",
        retryable: status === 408 || status === 429 || status >= 500 } }
      return
    }
    let observed = false
    let index = 0
    let lastPartId: string | undefined
    let textPart: { id: string; thought: boolean } | undefined
    let finishReason: string | undefined
    try {
      if (response.body === null) throw new Error("missing body")
      for await (const data of parseServerSentEvents(response.body, IMAGE_OUTPUT_LIMITS)) {
        const chunk = expectRecord(JSON.parse(data), "Gemini chunk")
        if (chunk.error !== undefined) throw new Error("stream error")
        if (chunk.usageMetadata !== undefined) yield { type: "usage", usage: geminiUsage(chunk.usageMetadata) }
        if (chunk.promptFeedback !== undefined) {
          const feedback = expectRecord(chunk.promptFeedback, "Gemini prompt feedback")
          if (feedback.blockReason !== undefined) throw new Error("prompt blocked")
        }
        if (chunk.candidates === undefined) continue
        if (!Array.isArray(chunk.candidates) || chunk.candidates.length !== 1) throw new Error("expected one candidate")
        const candidate = expectRecord(chunk.candidates[0], "Gemini candidate")
        if (candidate.index !== undefined && candidate.index !== 0) throw new Error("unexpected candidate")
        if (candidate.content !== undefined) {
          if (finishReason !== undefined) throw new Error("content after finish")
          const content = expectRecord(candidate.content, "Gemini content")
          if (content.role !== undefined && content.role !== "model") throw new Error("invalid output role")
          if (!Array.isArray(content.parts)) throw new Error("missing output parts")
          for (const raw of content.parts) {
            observed = true
            const part = expectRecord(raw, "Gemini part")
            if (Object.keys(part).some((key) => !["text", "inlineData", "thought", "thoughtSignature"].includes(key))) throw new Error("unsupported output part")
            if (part.thought !== undefined && typeof part.thought !== "boolean") throw new Error("invalid thought flag")
            if (part.text !== undefined && part.inlineData !== undefined) throw new Error("ambiguous output part")
            let partId: string
            if (part.text !== undefined) {
              const thought = part.thought === true
              // Streaming text is incremental; images and signed parts remain boundaries.
              partId = part.thoughtSignature === undefined && textPart?.thought === thought
                ? textPart.id : `gemini_${index++}`
              textPart = { id: partId, thought }
              yield part.thought === true
                ? { type: "reasoning_delta", partId, delta: expectString(part.text, "Gemini thought"), visibility: "provider_replay_only" }
                : { type: "text_delta", partId, delta: expectString(part.text, "Gemini text") }
            } else if (part.inlineData !== undefined) {
              textPart = undefined
              if (part.thought === true) throw new Error("thought image output is not supported")
              partId = `gemini_${index++}`
              const inline = expectRecord(part.inlineData, "Gemini inline image")
              const event = { type: "image_output" as const, partId,
                mimeType: expectString(inline.mimeType, "Gemini image MIME"),
                bytes: decodeImageOutput(expectString(inline.data, "Gemini image data")) }
              validateImageOutput(event)
              yield event
            } else {
              if (lastPartId === undefined || part.thoughtSignature === undefined) throw new Error("unbound output signature")
              partId = lastPartId
            }
            lastPartId = partId
            if (part.inlineData !== undefined || part.thoughtSignature !== undefined) {
              textPart = undefined
              const signature = part.thoughtSignature === undefined ? undefined : expectString(part.thoughtSignature, "Gemini signature")
              if (signature !== undefined && (signature.length === 0 || signature.length > 1024 * 1024)) throw new Error("invalid signature size")
              yield { type: "provider_state", state: { providerId: this.providerId, modelId: this.model.id,
                stateKind: "opaque", replayPolicy: "required",
                payload: { protocol: this.protocol.id, partId, ...(signature === undefined ? {} : { signature }) } } }
            }
          }
        }
        if (candidate.finishReason !== undefined) {
          if (finishReason !== undefined) throw new Error("duplicate finish")
          finishReason = expectString(candidate.finishReason, "Gemini finish")
        }
      }
      if (finishReason === undefined) throw new Error("missing finish")
      yield { type: "finish", reason: finishReason === "STOP" ? "stop" : finishReason === "MAX_TOKENS" ? "length" :
        ["SAFETY", "IMAGE_SAFETY", "RECITATION", "PROHIBITED_CONTENT"].includes(finishReason) ? "content_filter" : "other" }
    } catch {
      throw new ProviderStreamError({ ...protocolProviderError({ providerId: this.providerId, modelId: this.model.id,
        message: "Gemini stream is incomplete or contains unsupported output" }), phase: "stream", retryable: false }, observed)
    }
  }
}

function geminiUsage(value: unknown): ProviderUsage {
  const record = expectRecord(value, "Gemini usage")
  const usage: Record<string, number> = {}
  for (const [wire, key] of [["promptTokenCount", "inputTokens"], ["candidatesTokenCount", "outputTokens"],
    ["thoughtsTokenCount", "reasoningTokens"], ["cachedContentTokenCount", "cacheReadTokens"]]) {
    const count = record[wire!]
    if (count === undefined) continue
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("invalid usage")
    usage[key!] = count
  }
  return usage
}
