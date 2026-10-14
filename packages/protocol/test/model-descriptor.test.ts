import { describe, expect, it } from "vitest"
import { normalizeModelDescriptor } from "../src/index.js"

const model = {
  id: " image-model ",
  operations: ["image.generate"],
  inputModalities: ["image", "text"],
  outputModalities: ["image"],
  features: [],
  generationOptions: [{ name: "size", description: " Image size ", type: "string", enum: ["small", "large"] }],
  catalog: { source: "custom", catalogId: " images ", revision: " 1 " }
}

describe("shared model descriptor contract", () => {
  it("normalizes model and option values deterministically without mutating input", () => {
    const before = structuredClone(model)
    const result = normalizeModelDescriptor(model)
    expect(result).toMatchObject({
      id: "image-model", inputModalities: ["text", "image"],
      generationOptions: [{ name: "size", description: "Image size", enum: ["large", "small"] }],
      catalog: { source: "custom", catalogId: "images", revision: "1" }
    })
    expect(normalizeModelDescriptor(result)).toEqual(result)
    expect(model).toEqual(before)
  })

  it.each([
    { value: null }, { value: [] },
    { value: { ...model, unexpected: true } },
    { value: { ...model, catalog: { ...model.catalog, credential: "secret" } } },
    { value: { ...model, limits: { unknown: 1 } } },
    { value: { ...model, limits: { maxOutputTokens: "10" } } },
    { value: { ...model, limits: { maxOutputTokens: 0 } } },
    { value: { ...model, limits: { maxOutputTokens: Infinity } } },
    { value: { ...model, behavior: { arbitrary: true } } },
    { value: { ...model, behavior: { reasoningReplay: "required" } } },
    { value: { ...model, operations: ["conversation"] } },
    { value: { ...model, features: ["parallel_tool_calls"] } },
    { value: { ...model, inputModalities: ["text", "text"] } },
    { value: { ...model, outputModalities: [] } }
  ])("rejects malformed descriptor $value", ({ value }) => {
    expect(() => normalizeModelDescriptor(value)).toThrow()
  })
})
