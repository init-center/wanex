import type {
  ProductAppCommandCatalogReadModel
} from "@wanex/product-app/surface-client"
import type {
  ProductAppWebCommandInputControl,
  ProductAppWebCommandInputObjectControl,
  ProductAppWebCommandInputViewModel
} from "./command-input-types.js"

type CommandRow = ProductAppCommandCatalogReadModel["commands"][number]
type CommandInputSchema = NonNullable<CommandRow["inputSchema"]>
type CommandInputValueSchema =
  NonNullable<CommandInputSchema["properties"]>[string]

export const PRODUCT_APP_WEB_MAX_GENERATED_ARRAY_ITEMS = 256

export function projectProductAppWebCommandInput(
  schema: CommandRow["inputSchema"]
): ProductAppWebCommandInputViewModel {
  if (schema === undefined) {
    return { mode: "raw" }
  }
  const unsupported = findUnsupportedSchemaReason(schema)
  if (unsupported !== undefined) {
    return {
      mode: "unsupported",
      reason: unsupported,
      message:
        unsupported === "open_object"
          ? "This command uses open object input that the Web form cannot represent safely."
          : "This command input has constraints that the Web form cannot represent safely."
    }
  }
  return {
    mode: "generated",
    root: projectObject(schema, "/", schema.title ?? "Command input", true)
  }
}

function findUnsupportedSchemaReason(
  schema: CommandInputSchema | CommandInputValueSchema
): "open_object" | "unrepresentable_bounds" | undefined {
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) return "open_object"
    const propertyCount = Object.keys(schema.properties ?? {}).length
    if (
      schema.minProperties !== undefined &&
      schema.minProperties > propertyCount
    ) {
      return "unrepresentable_bounds"
    }
    if (
      schema.maxProperties !== undefined &&
      (schema.required?.length ?? 0) > schema.maxProperties
    ) {
      return "unrepresentable_bounds"
    }
    for (const child of Object.values(schema.properties ?? {})) {
      const reason = findUnsupportedSchemaReason(child)
      if (reason !== undefined) return reason
    }
    return undefined
  }
  if (schema.type === "array") return findUnsupportedSchemaReason(schema.items)
  return undefined
}

function projectControl(
  schema: CommandInputValueSchema,
  path: string,
  fallbackLabel: string,
  required: boolean
): ProductAppWebCommandInputControl {
  const base = {
    path,
    label: schema.title ?? fallbackLabel,
    required,
    ...(schema.description === undefined
      ? {}
      : { description: schema.description }),
    ...(schema.default === undefined
      ? {}
      : { defaultHint: JSON.stringify(schema.default) })
  }
  switch (schema.type) {
    case "object":
      return projectObject(schema, path, base.label, required)
    case "array":
      return {
        ...base,
        kind: "array",
        item: projectControl(schema.items, joinPointer(path, "0"), "Item", true),
        minItems: schema.minItems ?? 0,
        maxItems: schema.maxItems ?? PRODUCT_APP_WEB_MAX_GENERATED_ARRAY_ITEMS,
        uniqueItems: schema.uniqueItems === true
      }
    case "string":
      return {
        ...base,
        kind: "string",
        ...(schema.enum === undefined ? {} : { options: [...schema.enum] }),
        ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
        ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength })
      }
    case "number":
    case "integer":
      return {
        ...base,
        kind: schema.type,
        ...(schema.enum === undefined ? {} : { options: [...schema.enum] }),
        ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
        ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
        ...(schema.exclusiveMinimum === undefined
          ? {}
          : { exclusiveMinimum: schema.exclusiveMinimum }),
        ...(schema.exclusiveMaximum === undefined
          ? {}
          : { exclusiveMaximum: schema.exclusiveMaximum })
      }
    case "boolean":
      return {
        ...base,
        kind: "boolean",
        ...(schema.enum === undefined ? {} : { options: [...schema.enum] })
      }
  }
}

function projectObject(
  schema: CommandInputSchema | Extract<CommandInputValueSchema, { type: "object" }>,
  path: string,
  label: string,
  required: boolean
): ProductAppWebCommandInputObjectControl {
  const requiredNames = new Set(schema.required ?? [])
  const properties = schema.properties ?? {}
  return {
    kind: "object",
    path,
    label,
    required,
    ...(schema.description === undefined
      ? {}
      : { description: schema.description }),
    ...(schema.default === undefined
      ? {}
      : { defaultHint: JSON.stringify(schema.default) }),
    properties: Object.entries(properties).map(([name, child]) =>
      projectControl(
        child,
        joinPointer(path, name),
        humanizePropertyName(name),
        requiredNames.has(name)
      )
    )
  }
}

function joinPointer(path: string, segment: string): string {
  const escaped = segment.replaceAll("~", "~0").replaceAll("/", "~1")
  return path === "/" ? `/${escaped}` : `${path}/${escaped}`
}

function humanizePropertyName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .trim()
  if (words.length === 0) return "Value"
  return `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`
}
