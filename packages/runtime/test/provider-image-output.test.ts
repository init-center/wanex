import { describe, expect, it } from "vitest"
import {
  consumeProviderStream, consumeTextProviderStream,
  ProviderStreamError,
  type ProviderAdapter, type ProviderEvent, type ProviderObservedEvent
} from "../src/provider/index.js"
import { decodeImageOutput, IMAGE_OUTPUT_LIMITS, validateImageOutput } from "../src/provider/image-output.js"
import { parseServerSentEvents } from "../src/provider/sse.js"
import { testConversationModel } from "./model-endpoint-fixture.js"
import type { ProviderState } from "@wanex/protocol"
import { runProviderCompletion } from "../src/execution/core/completion.js"

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of source) values.push(value)
  return values
}

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const image = (partId = "image"): ProviderEvent => ({
  type: "image_output", partId, mimeType: "image/png", bytes: png
})
const finish: ProviderEvent = { type: "finish", reason: "stop" }
function provider(events: readonly ProviderEvent[]): ProviderAdapter {
  return {
    protocol: { id: "fixture-image" }, providerId: "fixture",
    outputModalities: ["text", "image"],
    model: { ...testConversationModel("fixture"), outputModalities: ["text", "image"] },
    async *stream() { yield* events }, buildReplayMessages() { return [] }
  }
}
function consume(events: readonly ProviderEvent[]) {
  return consumeProviderStream({ provider: provider(events),
    request: { messages: [], outputModalities: ["text", "image"] } })
}

describe("bounded conversation image candidates", () => {
  it("preserves mixed wire order without putting candidates in durable message parts", async () => {
    const result = await consume([
      { type: "text_delta", partId: "before", delta: "Before" }, image("one"),
      { type: "text_delta", partId: "after", delta: "After" }, image("two"), finish
    ])
    expect(result.parts.map(({ type, id }) => [type, id])).toEqual([
      ["text", "before"], ["image_candidate", "one"], ["text", "after"], ["image_candidate", "two"]
    ])
    expect(result.parts[1]).toEqual({ type: "image_candidate", id: "one", mimeType: "image/png", bytes: png })
  })

  it("sanitizes image observations and never exposes provider state", async () => {
    const observed: ProviderObservedEvent[] = []
    const checkpoints: ProviderEvent[] = []
    const state: ProviderState = { providerId: "fixture", modelId: "fixture", stateKind: "opaque",
      replayPolicy: "required", payload: { protocol: "fixture-image", signature: "secret" } }
    await consumeProviderStream({ provider: provider([
      image(), { type: "provider_state", state }, finish
    ]), request: { messages: [], outputModalities: ["text", "image"] },
    observe: (event) => { observed.push(event) },
    checkpoint: async (event) => { checkpoints.push(event) } })
    expect(observed).toEqual([
      { type: "image_output", partId: "image", mimeType: "image/png", sizeBytes: 8 }, finish
    ])
    expect(checkpoints).toHaveLength(3)
    expect(JSON.stringify(observed)).not.toMatch(/bytes|opaque|secret|provider_state/)
  })

  it.each([
    [image(), image(), finish],
    [{ type: "text_delta", partId: "image", delta: "text" }, image(), finish],
    [image(), { type: "reasoning_delta", partId: "image", delta: "reason" }, finish],
    [{ type: "text_delta", partId: "t", delta: "before" }, image(),
      { type: "text_delta", partId: "t", delta: "after" }, finish],
    [image("tool_call_0"), { type: "tool_call_start", index: 0, toolCallId: "call" }, finish],
    [image(""), finish], [image("x".repeat(129)), finish]
  ] as ProviderEvent[][])("rejects duplicate, conflicting or out-of-order identities %#", async (...events) => {
    await expect(consume(events)).rejects.toMatchObject({ detail: { category: "protocol", outputObserved: true } })
  })

  it.each(["length", "content_filter", "other"] as const)("does not publish %s images", async (reason) => {
    await expect(consume([image(), { type: "finish", reason }])).rejects.toMatchObject({
      detail: { category: "protocol", outputObserved: true }
    })
  })

  it("checks count and immutable byte ownership", async () => {
    const images = Array.from({ length: IMAGE_OUTPUT_LIMITS.count }, (_, i) => image(`i${i}`))
    const result = await consume([...images, finish])
    expect(result.parts).toHaveLength(16)
    expect(result.parts[0]?.type === "image_candidate" && result.parts[0].bytes).not.toBe(png)
    await expect(consume([...images, image("overflow"), finish])).rejects.toMatchObject({ detail: { outputObserved: true } })
    const mutable = Buffer.from(png)
    const copied = await consume([{ type: "image_output", partId: "buffer", mimeType: "image/png", bytes: mutable }, finish])
    mutable.fill(0)
    expect(copied.parts[0]).toMatchObject({ bytes: png })
  })

  it("enforces decoded single-image and aggregate byte ceilings", async () => {
    const excessive = new Uint8Array(IMAGE_OUTPUT_LIMITS.imageBytes + 1)
    excessive.set(png)
    await expect(consume([{ type: "image_output", partId: "large", mimeType: "image/png", bytes: excessive }, finish]))
      .rejects.toMatchObject({ detail: { outputObserved: true, message: "image output exceeds the allowed byte size" } })
    const chunk = new Uint8Array(6 * 1024 * 1024)
    chunk.set(png)
    const images: ProviderEvent[] = Array.from({ length: 9 }, (_, index) => ({
      type: "image_output", partId: `aggregate${index}`, mimeType: "image/png", bytes: chunk
    }))
    await expect(consume([...images, finish])).rejects.toMatchObject({
      detail: { outputObserved: true, message: "provider image output exceeds the response limit" }
    })
  })

  it("rejects wrong MIME and records observed output before rejecting it", async () => {
    const checkpoints: string[] = []
    await expect(consumeProviderStream({ provider: provider([
      { type: "image_output", partId: "image", mimeType: "image/svg+xml", bytes: png }, finish
    ]), request: { messages: [], outputModalities: ["image"] },
    checkpoint: async (event) => { checkpoints.push(event.type) } })).rejects.toMatchObject({ detail: { outputObserved: true } })
    expect(checkpoints).toEqual(["image_output"])
    expect(() => validateImageOutput({ type: "image_output", partId: "image", mimeType: "image/jpeg", bytes: png })).toThrow(/MIME/)
  })

  it("rejects unsupported requests before dispatch and unexpected text-only images after output", async () => {
    let dispatched = false
    const adapter = provider([])
    const text = { ...adapter, model: testConversationModel("text"),
      async *stream() { dispatched = true; yield finish } }
    await expect(consumeProviderStream({ provider: text,
      request: { messages: [], outputModalities: ["image"] } })).rejects.toMatchObject({ detail: { outputObserved: false } })
    expect(dispatched).toBe(false)
    await expect(consumeProviderStream({ provider: { ...adapter, outputModalities: ["text"] },
      request: { messages: [], outputModalities: ["image"] } })).rejects.toMatchObject({ detail: { outputObserved: false } })
    await expect(consumeTextProviderStream({ provider: provider([image(), finish]),
      request: { messages: [] } })).rejects.toMatchObject({ detail: { outputObserved: true } })
    await expect(consumeTextProviderStream({ provider: text,
      request: { messages: [], outputModalities: ["image"] } })).rejects.toMatchObject({ detail: { outputObserved: false } })
    expect(dispatched).toBe(false)
  })

  it("never downgrades observed output when an adapter throws a stale before-output classification", async () => {
    const adapter: ProviderAdapter = { ...provider([]), async *stream() {
      yield image()
      throw new ProviderStreamError({ category: "network", message: "connection closed", retryable: true,
        providerId: "fixture", modelId: "fixture", phase: "stream" }, false)
    } }
    await expect(consumeProviderStream({ provider: adapter, request: { messages: [], outputModalities: ["image"] } }))
      .rejects.toMatchObject({ detail: { outputObserved: true } })
  })

  it("does not reflect a malformed image protocol payload from a thrown parser error", async () => {
    const adapter: ProviderAdapter = { ...provider([]), async *stream() {
      yield image()
      throw new Error("sensitive-base64-and-signature")
    } }
    await expect(consumeProviderStream({ provider: adapter, request: { messages: [], outputModalities: ["image"] } }))
      .rejects.toMatchObject({ detail: { outputObserved: true, message: "provider image stream failed before a complete response" } })
  })

  it("keeps observed evidence when cancelled while journaling an unexpected image", async () => {
    const controller = new AbortController()
    let releaseWrite!: () => void
    let enteredWrite!: () => void
    const writing = new Promise<void>((resolve) => { enteredWrite = resolve })
    const write = new Promise<void>((resolve) => { releaseWrite = resolve })
    const completion = expect(runProviderCompletion(provider([image(), finish]), {
      outputModalities: ["text", "image"],
      messages: [], signal: controller.signal, timeoutMs: undefined, maxOutputTokens: 32,
      checkpoint: async () => {
        controller.abort()
        enteredWrite()
        await write
      }
    })).rejects.toMatchObject({ detail: { category: "aborted", outputObserved: true } })
    await writing
    releaseWrite()
    await completion
  })

  it("strictly decodes canonical base64 without reflecting payloads in errors", () => {
    expect(decodeImageOutput(Buffer.from(png).toString("base64"))).toEqual(Buffer.from(png))
    for (const value of ["", "a", "a===", "Zm9=", "Zm9v\n", "!!!!", "data:image/png;base64,AAAA"]) {
      expect(() => decodeImageOutput(value)).toThrow("invalid inline image encoding or size")
    }
  })

  it("requires complete tools even when images are valid", async () => {
    await expect(consume([image(), { type: "tool_call_start", index: 0, toolCallId: "call" },
      { type: "finish", reason: "tool_calls" }])).rejects.toMatchObject({ detail: { outputObserved: true } })
    const result = await consume([image(),
      { type: "tool_call_start", index: 0, toolCallId: "call" },
      { type: "tool_call_delta", toolCallId: "call", toolNameDelta: "lookup", inputJsonDelta: "{}" },
      { type: "tool_call_end", toolCallId: "call" }, { type: "finish", reason: "tool_calls" }])
    expect(result.parts.map((part) => part.type)).toEqual(["image_candidate", "tool_call"])
  })
})

describe("bounded SSE decoding", () => {
  async function parse(chunks: readonly (Uint8Array | string)[], eventBytes = 16, responseBytes = 64) {
    async function* body() { yield* chunks }
    return collect(parseServerSentEvents(body(), { eventBytes, responseBytes }))
  }
  it("accepts several bounded events in a single large transport chunk", async () => {
    expect(await parse(["data: one\n\ndata: two\n\ndata: three\n\n"])).toEqual(["one", "two", "three"])
  })
  it("checks an unterminated line and multiline data before joining/JSON parsing", async () => {
    await expect(parse(["data: ", "x".repeat(11)])).rejects.toThrow(/event exceeds/)
    await expect(parse(["data: one\ndata: two\n\n"])).rejects.toThrow(/event exceeds/)
    await expect(parse([":heartbeat".repeat(2)])).rejects.toThrow(/event exceeds/)
  })
  it("bounds the full response even when each event is small", async () => {
    await expect(parse(["data: a\n\n".repeat(8)])).rejects.toThrow(/response exceeds/)
  })
  it("counts UTF-8 bytes across fragmented byte chunks and final lines", async () => {
    const bytes = Buffer.from("data: 好\n\n")
    expect(await parse([...bytes].map((byte) => Uint8Array.of(byte)), 11)).toEqual(["好"])
    await expect(parse([...bytes].map((byte) => Uint8Array.of(byte)), 10)).rejects.toThrow(/event exceeds/)
    expect(await parse(["data: last"])).toEqual(["last"])
    expect(await parse(["data: a\r\n\r\n"])).toEqual(["a"])
    await expect(parse([Uint8Array.of(255)])).rejects.toThrow()
    await expect(parse([Uint8Array.of(226, 130)])).rejects.toThrow()
  })
  it("closes the source iterator on limit rejection", async () => {
    let closed = false
    async function* source() { try { yield "data: oversized"; yield "never" } finally { closed = true } }
    await expect(collect(parseServerSentEvents(source(), { eventBytes: 8, responseBytes: 32 }))).rejects.toThrow(/event exceeds/)
    expect(closed).toBe(true)
  })
})
