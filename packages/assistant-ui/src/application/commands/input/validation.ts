import type { CommandInputControl } from "./model.js"

export interface CommandInputDraftIssue {
  readonly path: string
  readonly message: string
}

export function validateCommandInputDraft(
  control: CommandInputControl,
  value: unknown
): readonly CommandInputDraftIssue[] {
  const issues: CommandInputDraftIssue[] = []
  validateControl(control, value, issues)
  return issues
}

function validateControl(
  control: CommandInputControl,
  value: unknown,
  issues: CommandInputDraftIssue[]
): void {
  switch (control.kind) {
    case "object": {
      if (!isRecord(value)) {
        issues.push(issue(control, "must be an object"))
        return
      }
      const names = Object.keys(value)
      if (names.length < control.minProperties) {
        issues.push(issue(control, `requires at least ${control.minProperties} fields`))
      }
      if (names.length > control.maxProperties) {
        issues.push(issue(control, `accepts at most ${control.maxProperties} fields`))
      }
      const known = new Set(control.properties.map(controlName))
      for (const name of names) {
        if (!known.has(name)) {
          issues.push({ path: joinPointer(control.path, name), message: "is not accepted" })
        }
      }
      for (const property of control.properties) {
        const name = controlName(property)
        if (!Object.hasOwn(value, name)) {
          if (property.required) issues.push(issue(property, "is required"))
          continue
        }
        validateControl(property, value[name], issues)
      }
      return
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push(issue(control, "must be a list"))
        return
      }
      if (value.length < control.minItems) {
        issues.push(issue(control, `requires at least ${control.minItems} items`))
      }
      if (value.length > control.maxItems) {
        issues.push(issue(control, `accepts at most ${control.maxItems} items`))
      }
      if (
        control.uniqueItems &&
        new Set(value.map(canonicalJson)).size !== value.length
      ) {
        issues.push(issue(control, "must contain unique items"))
      }
      value.forEach((item, index) => {
        validateControl(
          { ...control.item, path: replaceArrayIndex(control.item.path, index) },
          item,
          issues
        )
      })
      return
    }
    case "string": {
      if (typeof value !== "string") {
        issues.push(issue(control, "must be text"))
        return
      }
      const length = [...value].length
      if (control.minLength !== undefined && length < control.minLength) {
        issues.push(issue(control, `must contain at least ${control.minLength} characters`))
      }
      if (control.maxLength !== undefined && length > control.maxLength) {
        issues.push(issue(control, `must contain at most ${control.maxLength} characters`))
      }
      if (control.options !== undefined && !control.options.includes(value)) {
        issues.push(issue(control, "must be an allowed value"))
      }
      return
    }
    case "number":
    case "integer": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (control.kind === "integer" && !Number.isInteger(value))
      ) {
        issues.push(issue(control, `must be a ${control.kind}`))
        return
      }
      if (control.minimum !== undefined && value < control.minimum) {
        issues.push(issue(control, `must be at least ${control.minimum}`))
      }
      if (control.maximum !== undefined && value > control.maximum) {
        issues.push(issue(control, `must be at most ${control.maximum}`))
      }
      if (control.exclusiveMinimum !== undefined && value <= control.exclusiveMinimum) {
        issues.push(issue(control, `must be greater than ${control.exclusiveMinimum}`))
      }
      if (control.exclusiveMaximum !== undefined && value >= control.exclusiveMaximum) {
        issues.push(issue(control, `must be less than ${control.exclusiveMaximum}`))
      }
      if (control.options !== undefined && !control.options.includes(value)) {
        issues.push(issue(control, "must be an allowed value"))
      }
      return
    }
    case "boolean":
      if (typeof value !== "boolean") {
        issues.push(issue(control, "must be true or false"))
      } else if (control.options !== undefined && !control.options.includes(value)) {
        issues.push(issue(control, "must be an allowed value"))
      }
  }
}

function issue(
  control: CommandInputControl,
  message: string
): CommandInputDraftIssue {
  return { path: control.path, message: `${control.label} ${message}` }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function controlName(control: CommandInputControl): string {
  const segment = control.path.split("/").at(-1) ?? ""
  return segment.replaceAll("~1", "/").replaceAll("~0", "~")
}

function joinPointer(path: string, segment: string): string {
  const escaped = segment.replaceAll("~", "~0").replaceAll("/", "~1")
  return path === "/" ? `/${escaped}` : `${path}/${escaped}`
}

function replaceArrayIndex(path: string, index: number): string {
  return path.replace(/\/0(?=\/|$)/, `/${index}`)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "undefined"
}
