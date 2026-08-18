import { describe, expect, it } from "vitest"
import {
  projectCommandPalette,
  projectCommandInput,
  validateCommandInputDraft
} from "../src/index.js"
import {
  projectCommandExecutionFromResult
} from "../src/application/commands/execution/projection.js"
import {
  projectCommandPreviewFromResult
} from "../src/application/commands/preview/projection.js"

describe("web application declarative command input", () => {
  it("projects bounded native controls and keeps defaults inert", () => {
    const input = projectCommandInput({
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["safe", "fast"],
          default: "safe"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          uniqueItems: true
        },
        text: {
          type: "string",
          title: "Text <unsafe>",
          description: "Describe <script>alert(1)</script>",
          default: "fallback"
        }
      },
      required: ["mode", "tags", "text"],
      additionalProperties: false
    })

    expect(input).toMatchObject({
      mode: "generated",
      root: {
        properties: expect.arrayContaining([
          expect.objectContaining({
            path: "/mode",
            options: ["safe", "fast"],
            defaultHint: '"safe"'
          }),
          expect.objectContaining({
            path: "/tags",
            maxItems: 3,
            uniqueItems: true
          }),
          expect.objectContaining({
            path: "/text",
            label: "Text <unsafe>",
            description: "Describe <script>alert(1)</script>",
            defaultHint: '"fallback"'
          })
        ])
      }
    })
    expect(projectCommandInput(undefined)).toEqual({ mode: "none" })
  })

  it("marks open schemas unsupported", () => {
    expect(projectCommandInput({
      type: "object",
      properties: { text: { type: "string" } }
    })).toMatchObject({ mode: "unsupported", reason: "open_object" })
  })

  it("projects bounded schema and handler issues", () => {
    const preview = projectCommandPreviewFromResult({
      preview: {
        kind: "rejected",
        commandId: "plugin.generated",
        reason: "invalid_input",
        message: "command input failed schema validation",
        inputValidation: {
          source: "schema",
          issues: [{
            path: "/text<&",
            keyword: 'minLength"',
            message: "must not contain <script>"
          }]
        }
      },
      updatedAt: 10
    })
    const execution = projectCommandExecutionFromResult({
      kind: "rejected",
      commandId: "plugin.generated",
      reason: "invalid_input",
      message: "handler rejected input",
      inputValidation: {
        source: "handler",
        issues: [{ path: "/text", keyword: "handler", message: "rejected" }]
      }
    }, 11)

    expect(preview.inputValidation).toMatchObject({ source: "schema" })
    expect(execution.inputValidation).toMatchObject({ source: "handler" })
    expect(preview.inputValidation?.issues).toEqual([{
      path: "/text<&",
      keyword: 'minLength"',
      message: "must not contain <script>"
    }])
  })

  it("enforces generated constraints that native controls cannot express", () => {
    const input = projectCommandInput({
      type: "object",
      properties: {
        ratio: {
          type: "number",
          exclusiveMinimum: 0,
          exclusiveMaximum: 1
        },
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          uniqueItems: true
        }
      },
      required: ["ratio", "tags"],
      additionalProperties: false,
      minProperties: 2,
      maxProperties: 2
    })
    if (input.mode !== "generated") {
      throw new Error("expected generated input")
    }

    expect(input.root).toMatchObject({ minProperties: 2, maxProperties: 2 })
    expect(validateCommandInputDraft(input.root, {
      ratio: 0,
      tags: ["same", "same"]
    })).toEqual([
      { path: "/ratio", message: "Ratio must be greater than 0" },
      { path: "/tags", message: "Tags must contain unique items" }
    ])
    expect(validateCommandInputDraft(input.root, {
      ratio: 0.5,
      tags: ["first", "second"]
    })).toEqual([])
  })

  it("projects only commands explicitly visible in an ordinary palette", () => {
    const result: Parameters<typeof projectCommandPalette>[0] = {
      ok: true,
      command: "readProductCommands",
      value: {
        commands: [
          commandRow("product.status", "visible"),
          commandRow("product.shutdown", "hidden")
        ],
        diagnostics: []
      },
      event: {
        id: "evt_command_catalog",
        sequence: 1,
        type: "product.surface.command_completed",
        command: "readProductCommands",
        at: 1
      }
    }

    expect(projectCommandPalette(result)).toMatchObject({
      state: "ready",
      message: "1 command available",
      rows: [{ id: "product.status", input: { mode: "none" } }]
    })
  })
})

function commandRow(
  id: string,
  paletteVisibility: "visible" | "hidden"
) {
  return {
    id,
    name: id.replace("product.", ""),
    title: id,
    handlerRef: `wanex.product.backend.${id}`,
    sourceKind: "builtin" as const,
    sourceScope: "builtin" as const,
    sourceId: "product.backend",
    trust: "trusted" as const,
    paletteVisibility
  }
}
