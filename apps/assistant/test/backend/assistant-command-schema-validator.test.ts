import { describe, expect, it } from "vitest"
import type { AppCommandInputSchema } from "@wanex/extension"
import { validateBackendCommandSchemaInput } from "../../src/backend/commands/schema.js"

describe("assistant command schema validator", () => {
  it("validates nested supported constraints with Unicode code-point length", () => {
    const schema: AppCommandInputSchema = {
      type: "object",
      properties: {
        label: { type: "string", minLength: 1, maxLength: 1 },
        mode: { type: "string", enum: ["safe", "fast"] },
        ratio: {
          type: "number",
          exclusiveMinimum: 0,
          exclusiveMaximum: 1
        },
        nested: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
          additionalProperties: false
        }
      },
      required: ["label", "mode", "ratio", "nested"],
      additionalProperties: false
    }

    expect(
      validateBackendCommandSchemaInput(schema, {
        label: "😀",
        mode: "safe",
        ratio: 0.5,
        nested: { enabled: true }
      })
    ).toEqual([])
  })

  it("returns bounded paths and keywords for scalar and array violations", () => {
    const schema: AppCommandInputSchema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["safe"] },
        count: { type: "integer", minimum: 1, maximum: 3 },
        values: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 3,
          uniqueItems: true
        }
      },
      required: ["mode", "count", "values"]
    }

    expect(
      validateBackendCommandSchemaInput(schema, {
        mode: "unsafe",
        count: 4.5,
        values: [1, 1]
      })
    ).toEqual([
      { path: "/count", keyword: "type", message: "input must be a finite integer" },
      { path: "/mode", keyword: "enum", message: "input is not an allowed enum value" },
      { path: "/values", keyword: "uniqueItems", message: "input array items must be unique" }
    ])
  })

  it("treats defaults as annotations and never injects missing values", () => {
    const schema: AppCommandInputSchema = {
      type: "object",
      properties: {
        text: { type: "string", default: "fallback" }
      },
      required: ["text"]
    }
    const input = {}

    expect(validateBackendCommandSchemaInput(schema, input)).toEqual([
      { path: "/text", keyword: "required", message: "required input is missing" }
    ])
    expect(input).toEqual({})
  })

  it("rejects cycles, accessors, sparse arrays, non-finite values, and excess issues", () => {
    const openSchema: AppCommandInputSchema = { type: "object" }
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(validateBackendCommandSchemaInput(openSchema, cyclic)).toEqual([
      { path: "/self", keyword: "json", message: "input must not contain cycles" }
    ])

    const accessor: Record<string, unknown> = {}
    Object.defineProperty(accessor, "secret", {
      enumerable: true,
      get() {
        throw new Error("must not execute")
      }
    })
    expect(validateBackendCommandSchemaInput(openSchema, accessor)).toEqual([
      { path: "/secret", keyword: "json", message: "input properties must be plain data" }
    ])

    const sparse = new Array(2)
    sparse[1] = "value"
    expect(
      validateBackendCommandSchemaInput(
        {
          type: "object",
          properties: {
            values: { type: "array", items: { type: "string" } }
          }
        },
        { values: sparse, extra: Number.POSITIVE_INFINITY }
      )
    ).toEqual([
      { path: "/extra", keyword: "json", message: "input must be JSON-compatible" },
      { path: "/values", keyword: "json", message: "input must be a dense plain array" }
    ])

    const properties = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `field${index}`,
        { type: "string" as const }
      ])
    )
    const issues = validateBackendCommandSchemaInput(
      { type: "object", properties, required: Object.keys(properties) },
      {}
    )
    expect(issues).toHaveLength(32)
  })

  it("enforces collection limits inside open additional input values", () => {
    const oversizedArray = Array.from(
      { length: 257 },
      (_, index) => index
    )
    const oversizedObject = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`field${index}`, index])
    )

    expect(
      validateBackendCommandSchemaInput(
        { type: "object" },
        {
          nestedArray: oversizedArray,
          nestedObject: oversizedObject
        }
      )
    ).toEqual([
      {
        path: "/nestedArray",
        keyword: "limit",
        message: "input array has too many items"
      },
      {
        path: "/nestedObject",
        keyword: "limit",
        message: "input object has too many properties"
      }
    ])
  })
})
