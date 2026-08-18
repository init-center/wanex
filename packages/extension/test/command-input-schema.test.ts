import { describe, expect, it } from "vitest"
import {
  APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12,
  DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS,
  parseAppCommandInputSchema,
  resolveAppExtensionContributions,
  type AppCommandContribution,
  type AppCommandInputSchema
} from "../src/index.js"

describe("command input schema contract", () => {
  it("normalizes a bounded Draft 2020-12 object schema deterministically", () => {
    const input = {
      $schema: APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12,
      type: "object",
      title: "Run command",
      properties: {
        zeta: {
          type: "array",
          items: { type: "integer", minimum: 1 },
          minItems: 1,
          maxItems: 3,
          default: [1]
        },
        alpha: {
          type: "string",
          enum: ["second", "first"],
          default: "second",
          minLength: 1,
          maxLength: 20
        },
        enabled: { type: "boolean", default: true }
      },
      required: ["zeta", "alpha"],
      additionalProperties: false,
      default: {
        zeta: [1],
        alpha: "second",
        enabled: true
      }
    }

    const result = parseAppCommandInputSchema(input)

    expect(result).toEqual({
      ok: true,
      value: {
        $schema: APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12,
        type: "object",
        title: "Run command",
        properties: {
          alpha: {
            type: "string",
            enum: ["second", "first"],
            minLength: 1,
            maxLength: 20,
            default: "second"
          },
          enabled: { type: "boolean", default: true },
          zeta: {
            type: "array",
            items: { type: "integer", minimum: 1 },
            minItems: 1,
            maxItems: 3,
            default: [1]
          }
        },
        required: ["alpha", "zeta"],
        additionalProperties: false,
        default: {
          alpha: "second",
          enabled: true,
          zeta: [1]
        }
      }
    })
    if (!result.ok) {
      throw new Error("expected valid command input schema")
    }
    expect(result.value).not.toBe(input)
    expect(result.value.properties).not.toBe(input.properties)
    expect(result.value.default).not.toBe(input.default)
  })

  it("clones normalized schemas before resolving contributions", () => {
    const input = {
      type: "object",
      properties: {
        text: { type: "string", title: "Original" }
      },
      required: ["text"]
    }
    const contribution = command("plugin.echo", input)

    const snapshot = resolveAppExtensionContributions([contribution])
    input.properties.text.title = "Mutated"
    input.required[0] = "changed"

    expect(
      snapshot.byDomain.command.byId.get("plugin.echo")?.value.inputSchema
    ).toEqual({
      type: "object",
      properties: {
        text: { type: "string", title: "Original" }
      },
      required: ["text"]
    })
  })

  it("returns explicit invalid and unsupported parser errors", () => {
    expect(parseAppCommandInputSchema({ type: "string" })).toMatchObject({
      ok: false,
      error: { code: "invalid", path: "/type" }
    })
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: {
          text: { $ref: "https://example.com/schema", type: "string" }
        }
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "unsupported",
        path: "/properties/text/$ref"
      }
    })
    expect(
      parseAppCommandInputSchema({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object"
      })
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported", path: "/$schema" }
    })

    const hostileKeyword = `${"x".repeat(500)}\nsecret`
    const hostile = parseAppCommandInputSchema({
      type: "object",
      [hostileKeyword]: "must-not-be-reflected"
    })
    expect(hostile).toMatchObject({
      ok: false,
      error: { code: "unsupported", message: "unsupported schema keyword" }
    })
    if (hostile.ok) {
      throw new Error("expected hostile keyword to be rejected")
    }
    expect(hostile.error.path.length).toBeLessThanOrEqual(129)
    expect(hostile.error.path).not.toContain("\n")
    expect(JSON.stringify(hostile.error)).not.toContain("must-not-be-reflected")
  })

  it("rejects inconsistent required, enum, default, and range declarations", () => {
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: { text: { type: "string" } },
        required: ["missing"]
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: {
          text: { type: "string", enum: ["a", "a"] }
        }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: {
          text: { type: "string", enum: ["a"], default: "b" }
        }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: {
          count: { type: "integer", minimum: 10, maximum: 1 }
        }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })
  })

  it("enforces configurable limits without allowing callers to loosen defaults", () => {
    expect(
      parseAppCommandInputSchema(
        {
          type: "object",
          properties: {
            first: { type: "string" },
            second: { type: "string" }
          }
        },
        { limits: { maxProperties: 1 } }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "limit_exceeded", path: "/properties" }
    })
    expect(
      parseAppCommandInputSchema(
        {
          type: "object",
          properties: {
            nested: {
              type: "object",
              properties: { value: { type: "string" } }
            }
          }
        },
        { limits: { maxSchemaDepth: 2 } }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "limit_exceeded" }
    })
    expect(
      parseAppCommandInputSchema(
        {
          type: "object",
          properties: {
            choice: { type: "string", enum: ["first", "second"] }
          }
        },
        { limits: { maxEnumValuesPerNode: 1 } }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "limit_exceeded", path: "/properties/choice/enum" }
    })
    expect(
      parseAppCommandInputSchema(
        { type: "object", description: "x".repeat(80) },
        { limits: { maxSerializedBytes: 64 } }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "limit_exceeded", path: "/" }
    })
    expect(
      parseAppCommandInputSchema(
        { type: "object", description: "😀" },
        { limits: { maxSerializedBytes: 38 } }
      )
    ).toMatchObject({ ok: true })
    expect(
      parseAppCommandInputSchema(
        { type: "object", description: "😀" },
        { limits: { maxSerializedBytes: 37 } }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "limit_exceeded", path: "/" }
    })
    expect(
      parseAppCommandInputSchema(
        { type: "object" },
        {
          limits: {
            maxProperties:
              DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxProperties + 1
          }
        }
      )
    ).toMatchObject({
      ok: false,
      error: { code: "invalid", path: "/" }
    })
  })

  it("rejects accessors, exotic objects, sparse arrays, cycles, and non-finite values", () => {
    const accessorSchema: Record<string, unknown> = { type: "object" }
    Object.defineProperty(accessorSchema, "title", {
      enumerable: true,
      get() {
        throw new Error("must not execute")
      }
    })
    expect(parseAppCommandInputSchema(accessorSchema)).toMatchObject({
      ok: false,
      error: { code: "invalid", path: "/title" }
    })

    expect(
      parseAppCommandInputSchema(Object.assign(Object.create({}), { type: "object" }))
    ).toMatchObject({ ok: false, error: { code: "invalid" } })

    const symbolic: Record<PropertyKey, unknown> = { type: "object" }
    symbolic[Symbol("hidden")] = true
    expect(parseAppCommandInputSchema(symbolic)).toMatchObject({
      ok: false,
      error: { code: "invalid" }
    })

    const sparse = new Array<string>(2)
    sparse[1] = "present"
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: { choice: { type: "string", enum: sparse } }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })

    const extendedEnum = ["first"] as string[] & { extra?: string }
    extendedEnum.extra = "not-json-array-data"
    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: { choice: { type: "string", enum: extendedEnum } }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })

    const cyclic: Record<string, unknown> = { type: "object" }
    cyclic.properties = { child: cyclic }
    expect(parseAppCommandInputSchema(cyclic)).toMatchObject({
      ok: false,
      error: { code: "invalid", message: expect.stringContaining("cycles") }
    })

    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: { count: { type: "number", minimum: Number.POSITIVE_INFINITY } }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })

    expect(
      parseAppCommandInputSchema({
        type: "object",
        properties: {
          values: {
            type: "array",
            items: { type: "string" },
            default: sparse
          }
        }
      })
    ).toMatchObject({ ok: false, error: { code: "invalid" } })
  })

  it("preserves dangerous-looking JSON property names as inert own data", () => {
    const properties = JSON.parse(
      '{"__proto__":{"type":"string"},"constructor":{"type":"boolean"}}'
    ) as Record<string, unknown>
    const defaultValue = JSON.parse(
      '{"__proto__":"safe","constructor":true}'
    ) as Record<string, unknown>

    const result = parseAppCommandInputSchema({
      type: "object",
      properties,
      default: defaultValue
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error("expected prototype-like property names to remain data")
    }
    expect(
      Object.prototype.hasOwnProperty.call(result.value.properties, "__proto__")
    ).toBe(true)
    expect(
      Object.prototype.hasOwnProperty.call(result.value.default, "__proto__")
    ).toBe(true)
    expect(Object.getPrototypeOf(result.value.properties)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(result.value.default)).toBe(Object.prototype)
  })

  it("fails closed with safe resolver diagnostics for each schema error class", () => {
    const invalid = command("schema.invalid", {
      type: "object",
      required: ["missing"]
    })
    const unsupported = command("schema.unsupported", {
      type: "object",
      oneOf: []
    })
    const limited = command("schema.limited", {
      type: "object",
      title: "x".repeat(
        DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS.maxTitleLength + 1
      )
    })

    const snapshot = resolveAppExtensionContributions([
      invalid,
      unsupported,
      limited
    ])

    expect(snapshot.contributions).toEqual([])
    expect(snapshot.diagnostics).toMatchObject([
      {
        code: "extension.command_input_schema_invalid",
        severity: "error",
        contributionId: "schema.invalid",
        metadata: { schemaError: "invalid", schemaPath: "/required" }
      },
      {
        code: "extension.command_input_schema_limit_exceeded",
        severity: "error",
        contributionId: "schema.limited",
        metadata: { schemaError: "limit_exceeded", schemaPath: "/title" }
      },
      {
        code: "extension.command_input_schema_unsupported",
        severity: "error",
        contributionId: "schema.unsupported",
        metadata: { schemaError: "unsupported", schemaPath: "/oneOf" }
      }
    ])
    expect(JSON.stringify(snapshot.diagnostics)).not.toContain("x".repeat(32))
  })
})

function command(id: string, inputSchema: unknown): AppCommandContribution {
  return {
    id,
    domain: "command",
    value: {
      name: id,
      title: id,
      paletteVisibility: "visible",
      handlerRef: `handler.${id}`,
      inputSchema: inputSchema as AppCommandInputSchema
    },
    provenance: {
      source: {
        kind: "plugin",
        scope: "user",
        id: `source.${id}`
      },
      trust: "user_enabled"
    }
  }
}
