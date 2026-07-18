import type {
  ProductAppWebActionInputError
} from "./types.js"
import type {
  ProductAppWebCommandInputControl,
  ProductAppWebCommandInputViewModel
} from "./command-input-types.js"

export const PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX = "commandInput:"
export const PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX = "commandPresence:"
export const PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX = "commandArrayItem:"

type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProductAppWebActionInputError }

const OMIT = Symbol("omit-command-input")

export function productAppWebCommandInputFieldName(path: string): string {
  return `${PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX}${path}`
}

export function productAppWebCommandPresenceFieldName(path: string): string {
  return `${PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX}${path}`
}

export function productAppWebCommandArrayItemFieldName(path: string): string {
  return `${PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX}${path}`
}

export function productAppWebCommandEnumOptionValue(
  value: string | number | boolean
): string {
  return JSON.stringify(value)
}

export function hasProductAppWebGeneratedCommandFields(
  fields: Readonly<Record<string, unknown>>
): boolean {
  return Object.keys(fields).some(
    (name) =>
      name.startsWith(PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX) ||
      name.startsWith(PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX) ||
      name.startsWith(PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX)
  )
}

export function decodeProductAppWebCommandInput(
  input: ProductAppWebCommandInputViewModel,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown> {
  if (input.mode !== "generated") {
    return invalid("commandId", "command does not declare generated input")
  }
  for (const name of Object.keys(fields)) {
    if (
      isGeneratedFieldName(name) &&
      !isKnownGeneratedField(input.root, input.root.path, name)
    ) {
      return invalid("commandId", "generated command input field is not declared")
    }
    if (
      (name.startsWith(PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX) ||
        name.startsWith(PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX)) &&
      fields[name] !== "true"
    ) {
      return invalid(name, "generated command input marker is invalid")
    }
  }
  const decoded = decodeControl(input.root, input.root.path, fields)
  if (!decoded.ok) return decoded
  if (decoded.value === OMIT) {
    return invalid("/", "command input is required")
  }
  return { ok: true, value: decoded.value }
}

function decodeControl(
  control: ProductAppWebCommandInputControl,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  switch (control.kind) {
    case "object":
      return decodeObject(control, path, fields)
    case "array":
      return decodeArray(control, path, fields)
    case "string":
      return decodeString(control, path, fields)
    case "number":
    case "integer":
      return decodeNumber(control, path, fields)
    case "boolean":
      return decodeBoolean(control, path, fields)
  }
}

function decodeObject(
  control: Extract<ProductAppWebCommandInputControl, { kind: "object" }>,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  if (!control.required && !isPresent(path, fields)) {
    return { ok: true, value: OMIT }
  }
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const child of control.properties) {
    const childPath = replacePathPrefix(child.path, control.path, path)
    const decoded = decodeControl(child, childPath, fields)
    if (!decoded.ok) return decoded
    if (decoded.value !== OMIT) {
      defineDataProperty(output, lastPointerSegment(childPath), decoded.value)
    }
  }
  return { ok: true, value: output }
}

function decodeArray(
  control: Extract<ProductAppWebCommandInputControl, { kind: "array" }>,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  if (!control.required && !isPresent(path, fields)) {
    return { ok: true, value: OMIT }
  }
  const indices = arrayIndices(path, fields)
  if (indices.length > control.maxItems) {
    return invalid(path, `command input array exceeds ${control.maxItems} items`)
  }
  for (let expected = 0; expected < indices.length; expected += 1) {
    if (indices[expected] !== expected) {
      return invalid(path, "command input array indices must be dense")
    }
  }
  const output: unknown[] = []
  for (const index of indices) {
    const itemPath = joinPointer(path, String(index))
    if (fields[productAppWebCommandArrayItemFieldName(itemPath)] !== "true") {
      return invalid(itemPath, "command input array item marker is required")
    }
    const decoded = decodeControl(control.item, itemPath, fields)
    if (!decoded.ok) return decoded
    if (decoded.value === OMIT) {
      return invalid(itemPath, "command input array item is required")
    }
    output.push(decoded.value)
  }
  return { ok: true, value: output }
}

function decodeString(
  control: Extract<ProductAppWebCommandInputControl, { kind: "string" }>,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  if (!control.required && !isPresent(path, fields)) {
    return { ok: true, value: OMIT }
  }
  const value = fields[productAppWebCommandInputFieldName(path)]
  if (value === undefined) {
    return control.required || isPresent(path, fields)
      ? invalid(path, "required command input is missing")
      : { ok: true, value: OMIT }
  }
  if (typeof value !== "string") {
    return invalid(path, "command input must be text")
  }
  if (control.options !== undefined) {
    const selected = control.options.find(
      (option) => productAppWebCommandEnumOptionValue(option) === value
    )
    return selected === undefined
      ? invalid(path, "command input must be an allowed option")
      : { ok: true, value: selected }
  }
  return { ok: true, value }
}

function decodeNumber(
  control: Extract<ProductAppWebCommandInputControl, { kind: "number" | "integer" }>,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  if (!control.required && !isPresent(path, fields)) {
    return { ok: true, value: OMIT }
  }
  const value = fields[productAppWebCommandInputFieldName(path)]
  if (value === undefined || value === "") {
    return control.required || isPresent(path, fields)
      ? invalid(path, `required ${control.kind} command input is missing`)
      : { ok: true, value: OMIT }
  }
  if (typeof value !== "string" || !isJsonNumberText(value)) {
    return invalid(path, `command input must be a finite ${control.kind}`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (control.kind === "integer" && !Number.isInteger(parsed))) {
    return invalid(path, `command input must be a finite ${control.kind}`)
  }
  if (
    control.options !== undefined &&
    !control.options.some(
      (option) => productAppWebCommandEnumOptionValue(option) === value
    )
  ) {
    return invalid(path, "command input must be an allowed option")
  }
  return { ok: true, value: parsed }
}

function decodeBoolean(
  control: Extract<ProductAppWebCommandInputControl, { kind: "boolean" }>,
  path: string,
  fields: Readonly<Record<string, unknown>>
): DecodeResult<unknown | typeof OMIT> {
  if (!control.required && !isPresent(path, fields)) {
    return { ok: true, value: OMIT }
  }
  const value = fields[productAppWebCommandInputFieldName(path)]
  if (value === undefined || value === "") {
    return control.required || isPresent(path, fields)
      ? invalid(path, "required boolean command input is missing")
      : { ok: true, value: OMIT }
  }
  if (value !== "true" && value !== "false") {
    return invalid(path, "command input must be a boolean")
  }
  const parsed = value === "true"
  if (control.options !== undefined && !control.options.includes(parsed)) {
    return invalid(path, "command input must be an allowed option")
  }
  return { ok: true, value: parsed }
}

function isGeneratedFieldName(name: string): boolean {
  return (
    name.startsWith(PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX) ||
    name.startsWith(PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX) ||
    name.startsWith(PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX)
  )
}

function isKnownGeneratedField(
  control: ProductAppWebCommandInputControl,
  path: string,
  name: string
): boolean {
  if (!control.required && name === productAppWebCommandPresenceFieldName(path)) {
    return true
  }
  switch (control.kind) {
    case "object":
      return control.properties.some((child) =>
        isKnownGeneratedField(
          child,
          replacePathPrefix(child.path, control.path, path),
          name
        )
      )
    case "array": {
      const prefixes = [
        `${PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX}${path}/`,
        `${PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX}${path}/`,
        `${PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX}${path}/`
      ]
      const prefix = prefixes.find((candidate) => name.startsWith(candidate))
      if (prefix === undefined) return false
      const suffix = name.slice(prefix.length)
      const separator = suffix.indexOf("/")
      const index = separator === -1 ? suffix : suffix.slice(0, separator)
      if (!/^(0|[1-9]\d*)$/.test(index)) return false
      const itemPath = joinPointer(path, index)
      if (
        name === productAppWebCommandArrayItemFieldName(itemPath)
      ) {
        return true
      }
      return isKnownGeneratedField(control.item, itemPath, name)
    }
    case "string":
    case "number":
    case "integer":
    case "boolean":
      return name === productAppWebCommandInputFieldName(path)
  }
}

function isPresent(
  path: string,
  fields: Readonly<Record<string, unknown>>
): boolean {
  return fields[productAppWebCommandPresenceFieldName(path)] === "true"
}

function arrayIndices(
  path: string,
  fields: Readonly<Record<string, unknown>>
): number[] {
  const prefixes = [
    `${PRODUCT_APP_WEB_COMMAND_INPUT_FIELD_PREFIX}${path}/`,
    `${PRODUCT_APP_WEB_COMMAND_PRESENCE_FIELD_PREFIX}${path}/`,
    `${PRODUCT_APP_WEB_COMMAND_ARRAY_ITEM_FIELD_PREFIX}${path}/`
  ]
  const found = new Set<number>()
  for (const name of Object.keys(fields)) {
    const prefix = prefixes.find((candidate) => name.startsWith(candidate))
    if (prefix === undefined) continue
    const segment = name.slice(prefix.length).split("/", 1)[0]
    if (segment !== undefined && /^(0|[1-9]\d*)$/.test(segment)) {
      found.add(Number(segment))
    }
  }
  return [...found].sort((left, right) => left - right)
}

function replacePathPrefix(path: string, template: string, actual: string): string {
  return path === template ? actual : `${actual}${path.slice(template.length)}`
}

function joinPointer(path: string, segment: string): string {
  return path === "/" ? `/${segment}` : `${path}/${segment}`
}

function lastPointerSegment(path: string): string {
  const segment = path.slice(path.lastIndexOf("/") + 1)
  return segment.replaceAll("~1", "/").replaceAll("~0", "~")
}

function defineDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  })
}

function isJsonNumberText(value: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
}

function invalid(field: string, message: string): DecodeResult<never> {
  return {
    ok: false,
    error: {
      code: "invalid_field",
      field,
      message
    }
  }
}
