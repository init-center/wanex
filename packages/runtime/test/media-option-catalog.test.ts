import { describe, expect, it } from "vitest"
import type { MediaGenerationModelEndpoint } from "@wanex/protocol"
import { validateModelOptionValues } from "@wanex/protocol"
import { imageGenerationOptionCatalog, prepareMediaGenerationOperationBinding } from "../src/media-generation/index.js"
import { modelEndpointDigest, modelEndpointToJson, modelEndpointFromJson, modelEndpointExecutionBinding, modelEndpointFromExecutionBinding } from "../src/provider/index.js"

describe("image generation option catalog", () => {
  it("is model-specific and conservative for unknown or endpoint-routed models", () => {
    const gpt = imageGenerationOptionCatalog("openai-images", "gpt-image-1")
    expect(validateModelOptionValues(gpt, { quality: "high", n: 10 })).toMatchObject({ n: 10 })
    expect(() => validateModelOptionValues(imageGenerationOptionCatalog("openai-images", "dall-e-3"), { n: 2 })).toThrow("invalid")
    expect(() => validateModelOptionValues(imageGenerationOptionCatalog("openai-images", "dall-e-3"), { quality: "high" })).toThrow("invalid")
    expect(imageGenerationOptionCatalog("openai-images", "gpt-image-future")).toEqual([])
    expect(imageGenerationOptionCatalog("gemini-image", "gemini-2.5-flash-image").map((entry) => entry.name)).toEqual(["aspect_ratio"])
    expect(imageGenerationOptionCatalog("gemini-image", "gemini-nano-banana-2.1").map((entry) => entry.name)).toEqual(["aspect_ratio", "image_size", "output_mime_type"])
    expect(() => validateModelOptionValues(imageGenerationOptionCatalog("volcengine-seedream", "doubao-seedream-4-5-251128"), { size: "1K" })).toThrow("invalid")
    expect(imageGenerationOptionCatalog("openrouter-images", "google/gemini-3.1-flash-image")).toEqual([])
  })

  it("includes normalized metadata in persistence and immutable endpoint evidence", () => {
    const endpoint = imageEndpoint()
    expect(modelEndpointFromJson(modelEndpointToJson(endpoint))).toEqual(endpoint)
    const binding = modelEndpointExecutionBinding(endpoint)
    const reordered = { ...endpoint, model: { ...endpoint.model, generationOptions: [...endpoint.model.generationOptions!].reverse() } }
    expect(modelEndpointDigest(reordered)).toBe(binding.endpointDigest)
    const changed = { ...endpoint, model: { ...endpoint.model, generationOptions: [] } }
    expect(modelEndpointDigest(changed)).not.toBe(binding.endpointDigest)
    expect(() => modelEndpointFromExecutionBinding({ ...binding, model: changed.model })).toThrow("digest")
    expect(() => prepareMediaGenerationOperationBinding({
      operation: "image.generate", modelEndpoint: modelEndpointExecutionBinding(changed), prompt: "draw", outputModality: "image", options: { quality: "high" }
    })).toThrow("unsupported")
    expect(() => modelEndpointToJson({ ...endpoint, model: { ...endpoint.model, operations: ["conversation"] } })).toThrow("image.generate")
  })
})

function imageEndpoint(): MediaGenerationModelEndpoint {
  return {
    id: "image-catalog", connection: { id: "catalog", providerId: "openai" }, protocol: { id: "openai-images" },
    model: { id: "gpt-image-1", operations: ["image.generate"], inputModalities: ["text"], outputModalities: ["image"], features: [],
      generationOptions: imageGenerationOptionCatalog("openai-images", "gpt-image-1"), catalog: { source: "builtin", catalogId: "test.options", revision: "1" } }
  }
}
