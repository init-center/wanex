import { describe, expect, it } from "vitest"
import {
  decodeProductAppWebCommandInput,
  parseProductAppWebActionInput,
  productAppWebCommandArrayItemFieldName,
  productAppWebCommandEnumOptionValue,
  productAppWebCommandInputFieldName,
  productAppWebCommandPresenceFieldName,
  projectProductAppWebCommandInput,
  renderProductAppWebCommandAction,
  type ProductAppWebActionDescriptor,
  type ProductAppWebCommandCatalogViewModel,
  type ProductAppWebCommandInputViewModel
} from "../src/index.js"
import {
  productAppWebCommandPreviewFromResult
} from "../src/command-preview-view.js"
import {
  productAppWebCommandExecutionFromResult
} from "../src/command-execution-view.js"
import {
  renderProductAppWebCommandInputValidation
} from "../src/command-input-feedback-render.js"

const generatedSchema = {
  type: "object" as const,
  properties: {
    count: { type: "integer" as const },
    enabled: { type: "boolean" as const },
    mode: { type: "string" as const, enum: ["safe", "fast"] },
    nested: {
      type: "object" as const,
      properties: { note: { type: "string" as const } },
      additionalProperties: false as const
    },
    records: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {},
        additionalProperties: false as const
      }
    },
    tags: {
      type: "array" as const,
      items: { type: "string" as const },
      maxItems: 3
    },
    text: { type: "string" as const }
  },
  required: ["count", "mode", "tags", "text"],
  additionalProperties: false as const
}

describe("Product App Web generated command input", () => {
  it("projects bounded controls and keeps defaults inert", () => {
    const input = projectProductAppWebCommandInput({
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
        }
      },
      required: ["mode", "tags"],
      additionalProperties: false
    })

    expect(input).toMatchObject({
      mode: "generated",
      root: {
        kind: "object",
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
          })
        ])
      }
    })
    expect(projectProductAppWebCommandInput(undefined)).toEqual({ mode: "raw" })
  })

  it("reconstructs nested typed JSON and preserves string whitespace", () => {
    const result = parseProductAppWebActionInput(
      {
        action: "preview-command",
        fields: {
          commandId: "plugin.generated",
          [productAppWebCommandInputFieldName("/count")]: "2",
          [productAppWebCommandPresenceFieldName("/enabled")]: "true",
          [productAppWebCommandInputFieldName("/enabled")]: "true",
          [productAppWebCommandInputFieldName("/mode")]:
            productAppWebCommandEnumOptionValue("fast"),
          [productAppWebCommandPresenceFieldName("/nested")]: "true",
          [productAppWebCommandPresenceFieldName("/nested/note")]: "true",
          [productAppWebCommandInputFieldName("/nested/note")]: "",
          [productAppWebCommandPresenceFieldName("/records")]: "true",
          [productAppWebCommandArrayItemFieldName("/records/0")]: "true",
          [productAppWebCommandArrayItemFieldName("/tags/0")]: "true",
          [productAppWebCommandInputFieldName("/tags/0")]: "a",
          [productAppWebCommandArrayItemFieldName("/tags/1")]: "true",
          [productAppWebCommandInputFieldName("/tags/1")]: "b",
          [productAppWebCommandInputFieldName("/text")]: "  keep spaces  "
        }
      },
      { commandCatalog: generatedCatalog() }
    )

    expect(result).toMatchObject({
      ok: true,
      action: {
        input: {
          input: {
            count: 2,
            enabled: true,
            mode: "fast",
            nested: { note: "" },
            records: [{}],
            tags: ["a", "b"],
            text: "  keep spaces  "
          }
        }
      }
    })
  })

  it("distinguishes omitted and explicit empty optional containers", () => {
    const input = projectProductAppWebCommandInput({
      type: "object",
      properties: {
        child: {
          type: "object",
          properties: {},
          additionalProperties: false
        },
        values: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    })
    if (input.mode !== "generated") throw new Error("expected generated input")

    expect(decodeProductAppWebCommandInput(input, {})).toMatchObject({
      ok: true,
      value: {}
    })
    expect(decodeProductAppWebCommandInput(input, {
      [productAppWebCommandPresenceFieldName("/child")]: "true",
      [productAppWebCommandPresenceFieldName("/values")]: "true"
    })).toMatchObject({ ok: true, value: { child: {}, values: [] } })
  })

  it("rejects raw/schema confusion, invalid numbers, and sparse arrays", () => {
    const catalog = generatedCatalog()
    expect(parse(catalog, {
      commandId: "plugin.generated",
      inputJson: "{}"
    })).toMatchObject({ ok: false, error: { field: "inputJson" } })

    expect(parse(catalog, {
      commandId: "plugin.generated",
      [productAppWebCommandInputFieldName("/count")]: "01",
      [productAppWebCommandInputFieldName("/mode")]: '"safe"',
      [productAppWebCommandInputFieldName("/text")]: "text"
    })).toMatchObject({ ok: false, error: { field: "/count" } })

    expect(parse(catalog, {
      commandId: "plugin.generated",
      [productAppWebCommandInputFieldName("/count")]: "1",
      [productAppWebCommandInputFieldName("/mode")]: '"safe"',
      [productAppWebCommandArrayItemFieldName("/tags/1")]: "true",
      [productAppWebCommandInputFieldName("/tags/1")]: "late",
      [productAppWebCommandInputFieldName("/text")]: "text"
    })).toMatchObject({ ok: false, error: { field: "/tags" } })

    const optional = catalogWithInput(projectProductAppWebCommandInput({
      type: "object",
      properties: {
        count: { type: "number" },
        enabled: { type: "boolean" }
      },
      additionalProperties: false
    }))
    expect(parse(optional, {
      commandId: "plugin.generated",
      [productAppWebCommandPresenceFieldName("/count")]: "true",
      [productAppWebCommandPresenceFieldName("/enabled")]: "true"
    })).toMatchObject({ ok: false, error: { field: "/count" } })

    expect(parse(catalog, {
      commandId: "plugin.generated",
      [productAppWebCommandInputFieldName("/count")]: "1",
      [productAppWebCommandInputFieldName("/mode")]: '"safe"',
      [productAppWebCommandInputFieldName("/text")]: "text",
      [productAppWebCommandInputFieldName("/forged")]: "value"
    })).toMatchObject({ ok: false, error: { field: "commandId" } })

    expect(parse(catalog, {
      commandId: "plugin.generated",
      [productAppWebCommandInputFieldName("/count")]: "1",
      [productAppWebCommandInputFieldName("/mode")]: '"safe"',
      [productAppWebCommandInputFieldName("/tags/0")]: "unmarked",
      [productAppWebCommandInputFieldName("/text")]: "text"
    })).toMatchObject({ ok: false, error: { field: "/tags/0" } })

    expect(parse(optional, {
      commandId: "plugin.generated",
      [productAppWebCommandPresenceFieldName("/count")]: "false"
    })).toMatchObject({ ok: false, error: { field: "commandPresence:/count" } })
  })

  it("keeps raw JSON only for schema-less or unavailable commands", () => {
    const rawCatalog = catalogWithInput({ mode: "raw" })
    expect(parse(rawCatalog, {
      commandId: "plugin.generated",
      inputJson: '{"ok":true}'
    })).toMatchObject({ ok: true, action: { input: { input: { ok: true } } } })

    expect(parse(rawCatalog, {
      commandId: "plugin.generated",
      [productAppWebCommandInputFieldName("/text")]: "spoofed"
    })).toMatchObject({ ok: false, error: { field: "commandId" } })

    expect(parse(
      { ...rawCatalog, state: "unavailable", rows: [] },
      { commandId: "manual.command", inputJson: "[]" }
    )).toMatchObject({ ok: true, action: { input: { input: [] } } })
  })

  it("renders escaped native controls and no raw fallback", () => {
    const input = projectProductAppWebCommandInput({
      type: "object",
      properties: {
        text: {
          type: "string",
          title: "Text <unsafe>",
          description: "Describe <script>alert(1)</script>",
          default: "fallback"
        },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["text", "tags"],
      additionalProperties: false
    })
    const catalog = catalogWithInput(input)
    const action: ProductAppWebActionDescriptor = {
      id: "preview-command",
      label: "Preview command",
      mutatesState: false,
      fields: [{
        name: "commandId",
        label: "Command",
        required: true,
        kind: "select",
        options: [{ value: "plugin.generated", label: "Generated" }]
      }],
      commandInput: { catalogState: "ready", commands: catalog.rows }
    }
    const html = renderProductAppWebCommandAction(action, () =>
      '<select name="commandId"><option value="plugin.generated">Generated</option></select>'
    )

    expect(html).toContain('data-command-input-mode="generated"')
    expect(html).toContain('name="commandInput:/text"')
    expect(html).toContain('data-command-array-template')
    expect(html).toContain('Default: &quot;fallback&quot;')
    expect(html).toContain("Text &lt;unsafe&gt;")
    expect(html).not.toContain("<script>alert")
    expect(html).not.toContain('name="inputJson"')
    expect(html).not.toContain('value="fallback"')
  })

  it("marks open schemas unsupported without exposing raw JSON", () => {
    const input = projectProductAppWebCommandInput({
      type: "object",
      properties: { text: { type: "string" } }
    })
    expect(input).toMatchObject({ mode: "unsupported", reason: "open_object" })
    const catalog = catalogWithInput(input)
    const action: ProductAppWebActionDescriptor = {
      id: "preview-command",
      label: "Preview command",
      mutatesState: false,
      fields: [{
        name: "commandId",
        label: "Command",
        required: true,
        kind: "select",
        options: [{ value: "plugin.generated", label: "Generated" }]
      }],
      commandInput: { catalogState: "ready", commands: catalog.rows }
    }
    const html = renderProductAppWebCommandAction(action, () =>
      '<select name="commandId"><option value="plugin.generated">Generated</option></select>'
    )
    expect(html).toContain('data-command-input-mode="unsupported"')
    expect(html).toContain("cannot represent safely")
    expect(html).not.toContain('name="inputJson"')
    expect(parse(catalog, { commandId: "plugin.generated" })).toMatchObject({
      ok: false,
      error: { field: "commandId" }
    })
  })

  it("projects and safely renders schema and handler field issues", () => {
    const preview = productAppWebCommandPreviewFromResult({
      preview: {
        kind: "rejected",
        commandId: "plugin.generated",
        reason: "invalid_input",
        message: "command input failed schema validation",
        inputValidation: {
          source: "schema",
          issues: [{
            path: "/text<&",
            keyword: "minLength\"",
            message: "must not contain <script>"
          }]
        }
      },
      updatedAt: 10
    })
    const execution = productAppWebCommandExecutionFromResult({
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
    const html = renderProductAppWebCommandInputValidation(
      preview.inputValidation
    )
    expect(html).toContain('data-command-input-validation-source="schema"')
    expect(html).toContain('data-command-input-error-path="/text&lt;&amp;"')
    expect(html).toContain('data-command-input-error-keyword="minLength&quot;"')
    expect(html).toContain("must not contain &lt;script&gt;")
    expect(html).not.toContain("<script>")
  })
})

function parse(
  commandCatalog: ProductAppWebCommandCatalogViewModel,
  fields: Readonly<Record<string, unknown>>
) {
  return parseProductAppWebActionInput(
    { action: "execute-command", fields },
    { commandCatalog }
  )
}

function generatedCatalog(): ProductAppWebCommandCatalogViewModel {
  return catalogWithInput(projectProductAppWebCommandInput(generatedSchema))
}

function catalogWithInput(
  input: ProductAppWebCommandInputViewModel
): ProductAppWebCommandCatalogViewModel {
  return {
    kind: "product-app-web.command-catalog",
    state: "ready",
    message: "1 product command available",
    rows: [{
      id: "plugin.generated",
      name: "plugin.generated",
      title: "Generated",
      handlerRef: "wanex.plugin-action:plugin.generated/run",
      sourceKind: "plugin",
      sourceId: "plugin.generated",
      trust: "user_enabled",
      input
    }],
    diagnostics: []
  }
}
