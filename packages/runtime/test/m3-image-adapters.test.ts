import { describe, expect, it } from "vitest"
import type { MediaGenerationModelEndpoint } from "@wanex/protocol"
import {
  GeminiImageAdapter,
  OpenRouterImagesAdapter,
  VolcengineSeedreamAdapter,
  prepareMediaGenerationOperationBinding,
  imageGenerationOptionCatalog,
  type MediaGenerationSubmitRequest
} from "../src/media-generation/index.js"
import { modelEndpointExecutionBinding } from "../src/provider/index.js"
import {
  InMemoryResolvedSecret,
  type SecretResolverPort
} from "../src/secrets/index.js"

describe("M3 image adapters", () => {
  it("uses Gemini Interactions for text and inline reference images", async () => {
    const requests: Array<{ input: string; body: Record<string, unknown> }> = []
    const adapter = new GeminiImageAdapter({
      secretResolver: resolver(),
      fetch: async (input, init) => {
        requests.push({ input, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
        return json({ output_image: { type: "image", data: b64("gemini"), mime_type: "image/png" } })
      }
    })
    const modelEndpoint = makeEndpoint("gemini-image", "gemini-nano-banana-2.1", "https://generativelanguage.googleapis.com/v1beta", ["text", "image"])
    await expect(adapter.submit(request(modelEndpoint, [], { aspect_ratio: "16:9", output_mime_type: "image/jpeg" }))).resolves.toMatchObject({ status: "completed" })
    await expect(adapter.submit(request(modelEndpoint, [imageInput()]))).resolves.toMatchObject({ status: "completed" })
    expect(requests[0]?.input).toBe("https://generativelanguage.googleapis.com/v1beta/interactions")
    expect(requests[0]?.body).toMatchObject({ model: "gemini-nano-banana-2.1", response_format: { type: "image", aspect_ratio: "16:9", mime_type: "image/jpeg" } })
    expect(requests[0]?.body.response_format).not.toHaveProperty("output_mime_type")
    expect(requests[1]?.body.input).toEqual([
      { type: "text", text: "draw a blue square" },
      { type: "image", data: b64("source"), mime_type: "image/png" }
    ])
  })

  it("uses the Seedream generation endpoint and data-url references", async () => {
    let body: Record<string, unknown> | undefined
    const adapter = new VolcengineSeedreamAdapter({
      secretResolver: resolver(),
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return json({ data: [{ url: "https://images.example.test/generated.png" }] })
      }
    })
    const modelEndpoint = makeEndpoint("volcengine-seedream", "doubao-seedream-4-5-251128", "https://ark.cn-beijing.volces.com/api/v3", ["text", "image"])
    const result = await adapter.submit(request(modelEndpoint, [imageInput()], { size: "2K", watermark: false }))
    expect(result).toMatchObject({ status: "completed", outputs: [{ kindOfOutput: "remote_url", url: "https://images.example.test/generated.png" }] })
    expect(body).toEqual({
      model: "doubao-seedream-4-5-251128",
      prompt: "draw a blue square",
      size: "2K",
      watermark: false,
      image: `data:image/png;base64,${b64("source")}`
    })
  })

  it("uses OpenRouter's dedicated image endpoint and supports base64 output", async () => {
    let input = ""
    let body: Record<string, unknown> | undefined
    const adapter = new OpenRouterImagesAdapter({
      secretResolver: resolver(),
      fetch: async (url, init) => {
        input = url
        body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return json({ data: [{ b64_json: b64("router") }] })
      }
    })
    const modelEndpoint = makeEndpoint("openrouter-images", "google/gemini-3.1-flash-image", "https://openrouter.ai/api/v1", ["text", "image"])
    const result = await adapter.submit(request(modelEndpoint, [imageInput()]))
    expect(result).toMatchObject({ status: "completed", outputs: [{ kindOfOutput: "base64", data: b64("router"), kind: "image" }] })
    expect(input).toBe("https://openrouter.ai/api/v1/images")
    expect(body).toEqual({
      model: "google/gemini-3.1-flash-image",
      prompt: "draw a blue square",
      input_references: [`data:image/png;base64,${b64("source")}`]
    })
  })

  it("rejects unsupported options before resolving credentials or dispatching", async () => {
    let fetchCount = 0
    const adapter = new OpenRouterImagesAdapter({
      secretResolver: resolver(),
      fetch: async () => {
        fetchCount += 1
        return json({ data: [] })
      }
    })
    const modelEndpoint = makeEndpoint("openrouter-images", "google/gemini-3.1-flash-image", "https://openrouter.ai/api/v1")
    const valid = request(modelEndpoint, [])
    await expect(adapter.submit({ ...valid, binding: { ...valid.binding, request: { ...valid.binding.request, options: { unknown: true } } } })).resolves.toMatchObject({
      status: "rejected",
      error: { type: "invalid_request", message: expect.stringContaining("unsupported") }
    })
    expect(fetchCount).toBe(0)
  })

  it.each([
    [GeminiImageAdapter, "gemini-image", "gemini-nano-banana-2.1", "https://generativelanguage.googleapis.com/v1beta", { image_size: "8K" }],
    [VolcengineSeedreamAdapter, "volcengine-seedream", "doubao-seedream-4-5-251128", "https://ark.cn-beijing.volces.com/api/v3", { watermark: "true" }],
    [OpenRouterImagesAdapter, "openrouter-images", "private/model", "https://openrouter.ai/api/v1", { n: 1 }]
  ] as const)("validates frozen options before any secret access: %s", async (Adapter, protocol, modelId, baseUrl, options) => {
    let secretCount = 0
    let fetchCount = 0
    const adapter = new Adapter({
      secretResolver: { async resolve() { secretCount += 1; throw new Error("must not resolve") } },
      fetch: async () => { fetchCount += 1; throw new Error("must not fetch") }
    })
    const valid = request(makeEndpoint(protocol, modelId, baseUrl), [])
    const result = await adapter.submit({ ...valid, binding: { ...valid.binding, request: { ...valid.binding.request, options } } })
    expect(result).toMatchObject({ status: "rejected", error: { type: "invalid_request" } })
    expect(secretCount).toBe(0)
    expect(fetchCount).toBe(0)
  })

  it.each([
    [VolcengineSeedreamAdapter, "volcengine-seedream", "https://ark.cn-beijing.volces.com/api/v3", "sequential_image_generation_options"],
    [OpenRouterImagesAdapter, "openrouter-images", "https://openrouter.ai/api/v1", "provider"]
  ] as const)("rejects structured wire fields even if custom metadata declares a scalar: %s", async (Adapter, protocol, baseUrl, name) => {
    let secretCount = 0
    const endpoint = makeEndpoint(protocol, "private/model", baseUrl)
    const declared = { ...endpoint, model: { ...endpoint.model, generationOptions: [{ name, description: "Invalid wire override", type: "boolean" as const }] } }
    const adapter = new Adapter({ secretResolver: { async resolve() { secretCount += 1; throw new Error("must not resolve") } } })
    await expect(adapter.submit(request(declared, [], { [name]: true }))).resolves.toMatchObject({ status: "rejected", error: { type: "invalid_request" } })
    expect(secretCount).toBe(0)
  })
})

function request(
  endpoint: MediaGenerationModelEndpoint,
  inputs: ReadonlyArray<MediaGenerationSubmitRequest["inputs"][number]>,
  options: Record<string, unknown> = {}
): MediaGenerationSubmitRequest {
  const resources = inputs.map((input) => input.resource)
  return {
    operationId: "m3-test",
    binding: prepareMediaGenerationOperationBinding({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(endpoint),
      prompt: "draw a blue square",
      outputModality: "image",
      inputResources: resources,
      options: options as never
    }),
    signal: new AbortController().signal,
    inputs
  }
}

function makeEndpoint(
  protocolId: string,
  modelId: string,
  baseUrl: string,
  inputModalities: readonly ("text" | "image")[] = ["text"]
): MediaGenerationModelEndpoint {
  return {
    id: `${protocolId}-endpoint`,
    connection: {
      id: `${protocolId}-connection`,
      providerId: protocolId,
      baseUrl,
      secretRef: `memory://${protocolId}-secret`
    },
    protocol: { id: protocolId },
    model: {
      id: modelId,
      generationOptions: imageGenerationOptionCatalog(protocolId, modelId),
      operations: ["image.generate"],
      inputModalities,
      outputModalities: ["image"],
      features: [],
      catalog: { source: "custom", catalogId: `test.${protocolId}`, revision: "1" }
    }
  }
}

function imageInput() {
  return {
    resource: {
      resourceId: "source-image",
      sha256: "a".repeat(64),
      sizeBytes: 6,
      kind: "image" as const,
      mediaType: "image/png"
    },
    bytes: Buffer.from("source")
  }
}

function resolver(): SecretResolverPort {
  return {
    async resolve() {
      return new InMemoryResolvedSecret({
        ref: "m3-secret",
        provider: "test",
        value: "m3-test-key"
      })
    }
  }
}

function b64(value: string): string {
  return Buffer.from(value).toString("base64")
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}
