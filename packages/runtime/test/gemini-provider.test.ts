import { describe, expect, it, vi } from "vitest"
import { GeminiAdapter, consumeProviderStream, consumeTextProviderStream, providerFromModelEndpoint } from "../src/provider/index.js"
import type { JsonValue } from "@wanex/protocol"
import type { ProviderFetch, ProviderObservedEvent } from "../src/provider/index.js"
import { testConversationModel, testModelEndpoint } from "./model-endpoint-fixture.js"

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
const image = { inlineData: { mimeType: "image/png", data: png.toString("base64") }, thoughtSignature: "private-signature" }
const model = testConversationModel("gemini-test-image", { inputModalities: ["text", "image"], outputModalities: ["text", "image"], features: ["reasoning"] })
function wire(parts: unknown[], finish = "STOP") {
  return { candidates: [{ index: 0, content: { role: "model", parts }, finishReason: finish }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5 } }
}
function adapter(chunks: unknown[]) {
  const fetch = vi.fn<ProviderFetch>(async () => ({ ok: true, status: 200, statusText: "OK", text: async () => "",
    body: (async function* () { for (const chunk of chunks) yield `data: ${JSON.stringify(chunk)}\n\n` })() }))
  return { provider: new GeminiAdapter({ providerId: "google", model, baseUrl: "https://fixture.invalid/v1beta", apiKey: "fixture-secret", fetch }), fetch }
}
const request = { messages: [], outputModalities: ["text", "image"] as const }

describe("Gemini native conversation output", () => {
  it("joins incremental text without crossing image, thought or signature boundaries", async () => {
    const chunk = (parts: unknown[]) => ({ candidates: [{ content: { parts } }] })
    const { provider } = adapter([
      chunk([{ text: "Before " }]), chunk([{ text: "the image" }]), chunk([image]),
      chunk([{ text: "After " }]), chunk([{ text: "the image" }]),
      chunk([{ text: "private ", thought: true }]), chunk([{ text: "thought", thought: true }]),
      chunk([{ thoughtSignature: "thought-signature" }]),
      chunk([{ text: "signed", thoughtSignature: "text-signature" }]), wire([{ text: "unsigned" }])
    ])
    const result = await consumeProviderStream({ provider, request })
    expect(result.parts.map((part) => "text" in part ? part.text : part.type)).toEqual([
      "Before the image", "image_candidate", "After the image", "private thought", "signed", "unsigned"
    ])
    expect(result.providerState.map((state) => state.payload)).toEqual([
      { protocol: provider.protocol.id, partId: "gemini_1", signature: "private-signature" },
      { protocol: provider.protocol.id, partId: "gemini_3", signature: "thought-signature" },
      { protocol: provider.protocol.id, partId: "gemini_4", signature: "text-signature" }
    ])
  })

  it("uses native response modalities, preserves wire ordering, and keeps opaque signatures private", async () => {
    const { provider, fetch } = adapter([wire([{ text: "before" }, image, { text: "after" }])])
    const observed: ProviderObservedEvent[] = []
    const response = await consumeProviderStream({ provider, request, observe: (event) => { observed.push(event) } })
    expect(response.parts.map((part) => part.type)).toEqual(["text", "image_candidate", "text"])
    expect(response.parts[1]).toMatchObject({ bytes: Uint8Array.from(png), id: "gemini_1" })
    expect(response.providerState).toMatchObject([{ payload: { protocol: "gemini-generate-content", partId: "gemini_1", signature: "private-signature" } }])
    expect(response.usage).toEqual({ inputTokens: 3, outputTokens: 5 })
    expect(JSON.stringify(observed)).not.toContain("private-signature")
    expect(JSON.stringify(observed)).not.toContain(png.toString("base64"))
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe("https://fixture.invalid/v1beta/models/gemini-test-image:streamGenerateContent?alt=sse")
    expect(init.headers["x-goog-api-key"]).toBe("fixture-secret")
    expect(JSON.parse(init.body).generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"])
  })

  it("replays exact assistant bytes and signatures only within their provider/model scope", () => {
    const { provider } = adapter([])
    const part = { type: "resource" as const, id: "image", resourceId: "resource", sha256: "a".repeat(64), sizeBytes: png.length,
      kind: "image" as const, mediaType: "image/png", bytes: png }
    const state = { providerId: "google", modelId: model.id, stateKind: "opaque" as const, replayPolicy: "required" as const,
      payload: { protocol: provider.protocol.id, partId: "image", signature: "exact-signature" } }
    const messages = [{ role: "assistant" as const, content: [part], providerState: [state] }]
    expect(provider.buildReplayMessages(messages)).toEqual([{ role: "model", parts: [{ inlineData: image.inlineData, thoughtSignature: "exact-signature" }] }])
    expect(JSON.stringify(provider.buildReplayMessages([{ ...messages[0]!, providerState: [{ ...state, modelId: "another" }] }]))).not.toContain("exact-signature")
  })

  it("binds a signature-only trailing part to its preceding output", async () => {
    const { provider } = adapter([
      { candidates: [{ content: { parts: [{ text: "answer" }] } }] },
      wire([{ thoughtSignature: "tail-signature" }])
    ])
    const result = await consumeProviderStream({ provider, request })
    expect(result.parts).toHaveLength(1)
    expect(result.providerState[0]?.payload).toMatchObject({ partId: "gemini_0", signature: "tail-signature" })
  })

  it.each([
    [{ inlineData: { mimeType: "image/png", data: "private-invalid" } }],
    [{ inlineData: { mimeType: "image/svg+xml", data: png.toString("base64") } }],
    [{ fileData: { fileUri: "https://private.invalid/image" } }],
    [{ text: "ambiguous", inlineData: image.inlineData }],
    [{ thoughtSignature: "private-unbound" }],
    [{ inlineData: image.inlineData, thought: true }],
    [{ functionCall: { name: "unsupported", args: {} } }]
  ])("rejects unsupported or malformed output without leaking wire data %#", async (part) => {
    const { provider } = adapter([wire([part])])
    const error = await consumeProviderStream({ provider, request }).catch((error: unknown) => error)
    expect(error).toMatchObject({ detail: { outputObserved: true, retryable: false } })
    expect(JSON.stringify(error)).not.toMatch(/private-|iVBOR/)
  })

  it.each(["MAX_TOKENS", "SAFETY", "OTHER"])("does not publish images after %s", async (finish) => {
    const { provider } = adapter([wire([image], finish)])
    await expect(consumeProviderStream({ provider, request })).rejects.toMatchObject({ detail: { outputObserved: true } })
  })

  it("requests text only for auxiliary consumers and rejects a returned image", async () => {
    const { provider, fetch } = adapter([wire([image])])
    await expect(consumeTextProviderStream({ provider, request: { messages: [] } })).rejects.toMatchObject({ detail: { outputObserved: true } })
    expect(JSON.parse(fetch.mock.calls[0]![1].body).generationConfig.responseModalities).toEqual(["TEXT"])
  })

  it("fails before resolving credentials for unsupported features or protocols", async () => {
    const resolve = vi.fn()
    const endpoint = testModelEndpoint({ endpointId: "gemini", protocolId: "gemini-generate-content", providerId: "google", modelId: model.id,
      baseUrl: "https://fixture.invalid", secretRef: "env:KEY", features: ["tool_calling"] })
    await expect(providerFromModelEndpoint(endpoint, { resolve })).rejects.toThrow(/tool calling/)
    expect(resolve).not.toHaveBeenCalled()
  })

  it("does not read or expose an HTTP error body", async () => {
    const text = vi.fn(async () => "private-echo")
    const fetch: ProviderFetch = async () => ({ ok: false, status: 400, statusText: "private-status", text, body: null })
    const provider = new GeminiAdapter({ providerId: "google", model, apiKey: "key", baseUrl: "https://fixture.invalid", fetch })
    const error = await consumeProviderStream({ provider, request }).catch((error: unknown) => error)
    expect(error).toMatchObject({ detail: { outputObserved: false, category: "invalid_request" } })
    expect(JSON.stringify(error as JsonValue)).not.toContain("private")
    expect(text).not.toHaveBeenCalled()
  })
})
