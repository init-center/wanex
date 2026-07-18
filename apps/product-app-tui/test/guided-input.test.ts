import { describe, expect, it } from "vitest"
import { collectProductAppTuiCommandInput } from "../src/guided-input.js"

describe("Product App TUI guided command input", () => {
  it("collects required and optional typed values without injecting defaults", async () => {
    const output: string[] = []
    const result = await collect({
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 2 },
          count: { type: "integer", minimum: 1, maximum: 3 },
          enabled: { type: "boolean", default: true }
        },
        required: ["text", "count"],
        additionalProperties: false
      },
      lines: ["hello", "2", "n"]
    }, output)

    expect(result).toEqual({
      kind: "completed",
      input: { text: "hello", count: 2 }
    })
    expect(output.join("\n")).toContain("default: true")
  })

  it("reprompts invalid scalar values and preserves string whitespace", async () => {
    const output: string[] = []
    const result = await collect({
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["safe", "fast"] },
          count: { type: "integer", minimum: 1 }
        },
        required: ["mode", "count"],
        additionalProperties: false
      },
      lines: ["unsafe", "fast", "0", "3"]
    }, output)

    expect(result).toEqual({
      kind: "completed",
      input: { mode: "fast", count: 3 }
    })
    expect(output.filter((line) => line.startsWith("Invalid"))).toHaveLength(2)
  })

  it("accepts nested object and array values as complete JSON fields", async () => {
    const output: string[] = []
    const result = await collect({
      inputSchema: {
        type: "object",
        properties: {
          metadata: {
            type: "object",
            properties: { source: { type: "string" } },
            additionalProperties: false
          },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["metadata", "tags"],
        additionalProperties: false
      },
      lines: ['{"source":"tui"}', '["one","two"]']
    }, output)

    expect(result).toEqual({
      kind: "completed",
      input: { metadata: { source: "tui" }, tags: ["one", "two"] }
    })
  })

  it("supports open root objects through explicit JSON", async () => {
    const output: string[] = []
    const result = await collect({
      inputSchema: {
        type: "object",
        properties: { known: { type: "string" } }
      },
      lines: ["not-json", '{"known":"value","dynamic":true}']
    }, output)

    expect(result).toEqual({
      kind: "completed",
      input: { known: "value", dynamic: true }
    })
    expect(output.join("\n")).toContain("must be valid JSON")
  })

  it("does not prompt when a closed schema has no required input", async () => {
    const output: string[] = []
    const result = await collect({
      inputSchema: {
        type: "object",
        properties: {
          optional: { type: "string", default: "hint-only" }
        },
        additionalProperties: false
      },
      lines: []
    }, output)

    expect(result).toEqual({ kind: "completed", input: {} })
    expect(output).toEqual([])
  })

  it("cancels before dispatch and distinguishes quit", async () => {
    const output: string[] = []
    await expect(
      collect({
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false
        },
        lines: ["cancel"]
      }, output)
    ).resolves.toEqual({ kind: "cancelled", quit: false })

    await expect(
      collect({
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false
        },
        lines: ["quit"]
      }, output)
    ).resolves.toEqual({ kind: "cancelled", quit: true })
  })
})

async function collect(
  command: {
    readonly inputSchema: Parameters<typeof collectProductAppTuiCommandInput>[0]["command"]["inputSchema"]
    readonly lines: readonly string[]
  },
  output: string[]
): Promise<unknown> {
  let index = 0
  return await collectProductAppTuiCommandInput({
    command: {
      id: "test.command",
      name: "test.command",
      title: "Test Command",
      handlerRef: "test.handler",
      sourceKind: "plugin",
      sourceScope: "user",
      sourceId: "test",
      trust: "user_enabled",
      ...(command.inputSchema === undefined
        ? {}
        : { inputSchema: command.inputSchema })
    },
    readLine: async () => command.lines[index++],
    write: async (text) => {
      output.push(text)
    }
  })
}
