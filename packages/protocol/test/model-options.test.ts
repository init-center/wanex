import { describe, expect, it } from "vitest"
import { normalizeModelOptions, validateModelOptionValues } from "../src/index.js"

const descriptors = normalizeModelOptions([
  { name: "watermark", description: " Watermark ", type: "boolean" },
  { name: "quality", description: "Quality", type: "string", enum: ["low", "high"] },
  { name: "n", description: "Count", type: "integer", minimum: 1, maximum: 4 }
])

describe("model option descriptors", () => {
  it("normalizes bounded scalar metadata deterministically without mutating input", () => {
    expect(descriptors.map((entry) => entry.name)).toEqual(["n", "quality", "watermark"])
    expect(descriptors[1]).toMatchObject({ enum: ["high", "low"] })
    expect(descriptors[2]?.description).toBe("Watermark")
    expect(normalizeModelOptions(descriptors)).toEqual(descriptors)
    expect(validateModelOptionValues(descriptors, { n: 4, quality: "high", watermark: false })).toEqual({ n: 4, quality: "high", watermark: false })
  })

  it.each([
    null, {}, Array(33).fill(descriptors[0]),
    [{ name: "n", description: "Count", type: "integer", minimum: 2, maximum: 1 }],
    [{ name: "n", description: "Count", type: "integer", minimum: 1.1, maximum: 2 }],
    [{ name: "n", description: "Count", type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER + 1 }],
    [{ name: "q", description: "Quality", type: "string", enum: [] }],
    [{ name: "q", description: "Quality", type: "string", enum: ["high", "high"] }],
    [{ name: "q", description: "Quality", type: "string", enum: [1] }],
    [{ name: "q", description: "Quality", type: "string", enum: ["x".repeat(129)] }],
    [{ name: "flag", description: "Flag", type: "boolean", extra: true }],
    [{ name: "flag", description: " ", type: "boolean" }],
    [{ name: "__proto__", description: "Unsafe", type: "boolean" }],
    [descriptors[0], descriptors[0]]
  ].map((value) => ({ value })))("rejects malformed metadata $value", ({ value }) => {
    expect(() => normalizeModelOptions(value)).toThrow()
  })

  it.each([{ n: 0 }, { n: 5 }, { n: 1.5 }, { n: "1" }, { quality: "auto" }, { watermark: "true" }, { quality: null }, { provider: {} }, []].map((value) => ({ value })))("rejects values outside the declared surface $value", ({ value }) => {
    expect(() => validateModelOptionValues(descriptors, value)).toThrow()
  })

  it("treats missing metadata as no options and never reads inherited properties", () => {
    expect(validateModelOptionValues(undefined, null)).toEqual({})
    expect(validateModelOptionValues(undefined, {})).toEqual({})
    expect(() => validateModelOptionValues(undefined, { quality: "high" })).toThrow("unsupported")
    expect(() => validateModelOptionValues(descriptors, JSON.parse('{"__proto__":true}'))).toThrow("unsupported")
    expect(validateModelOptionValues(descriptors, Object.create({ quality: "invalid" }))).toEqual({})
  })
})
