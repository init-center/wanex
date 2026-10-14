import { describe, expect, it } from "vitest"
import { resolveMediaProviderEndpoint } from "../src/provider/media-setup.js"

describe("media provider setup", () => {
  it("projects model-specific option metadata rather than a provider-wide union", () => {
    const names = (presetId: "openai-images" | "gemini-image" | "volcengine-seedream" | "openrouter-images", modelId: string) =>
      resolveMediaProviderEndpoint({ presetId, modelId }).endpoint.model.generationOptions?.map((option) => option.name)
    expect(names("openai-images", "gpt-image-1")).toEqual(["n", "output_format", "quality", "size"])
    expect(names("gemini-image", "gemini-2.5-flash-image")).toEqual(["aspect_ratio"])
    expect(names("volcengine-seedream", "doubao-seedream-4-5-251128")).toEqual(["size", "watermark"])
    expect(names("openrouter-images", "google/gemini-3.1-flash-image")).toEqual([])
    expect(names("openai-images", "private-model")).toEqual([])
  })
  it("creates an independent Gemini media endpoint with reference-image capability", () => {
    const resolved = resolveMediaProviderEndpoint({
      presetId: "gemini-image",
      modelId: "gemini-nano-banana-2.1"
    })
    expect(resolved.endpoint).toMatchObject({
      connection: {
        providerId: "google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta"
      },
      protocol: { id: "gemini-image" },
      model: {
        operations: ["image.generate"],
        inputModalities: ["text", "image"],
        outputModalities: ["image"]
      }
    })
    expect(resolved.endpoint.id).toBe(`${resolved.connectionId}.image-generate`)
  })

  it("fails closed for unknown custom models until reference support is explicit", () => {
    const resolved = resolveMediaProviderEndpoint({
      presetId: "openrouter-images",
      modelId: "private/image-model"
    })
    expect(resolved.endpoint.model.inputModalities).toEqual(["text"])
    expect(resolveMediaProviderEndpoint({
      presetId: "openrouter-images",
      modelId: "private/image-model",
      acceptsReferenceImages: true
    }).endpoint.model.inputModalities).toEqual(["text", "image"])
  })

  it("does not turn an unrelated conversation provider into a media provider", () => {
    const resolved = resolveMediaProviderEndpoint({
      presetId: "volcengine-seedream",
      modelId: "seedream-4.5",
      connectionId: "shop-media"
    })
    expect(resolved.connectionId).toBe("shop-media")
    expect(resolved.endpoint.connection.id).toBe("shop-media")
    expect(resolved.endpoint.protocol.id).toBe("volcengine-seedream")
  })

  it("rejects non-HTTPS remote base URLs", () => {
    expect(() => resolveMediaProviderEndpoint({
      presetId: "gemini-image",
      modelId: "gemini-nano-banana-2.1",
      baseUrl: "http://example.test/api"
    })).toThrow("baseUrl is not allowed")
  })
})
