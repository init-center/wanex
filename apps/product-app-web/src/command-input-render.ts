import {
  productAppWebCommandEnumOptionValue,
  productAppWebCommandArrayItemFieldName,
  productAppWebCommandInputFieldName,
  productAppWebCommandPresenceFieldName
} from "./command-input-codec.js"
import { escapeHtml } from "./escape-html.js"
import type {
  ProductAppWebActionDescriptor,
  ProductAppWebActionFieldDescriptor
} from "./types.js"
import type { ProductAppWebCommandInputControl } from "./command-input-types.js"

export function renderProductAppWebCommandAction(
  action: ProductAppWebActionDescriptor,
  renderField: (field: ProductAppWebActionFieldDescriptor) => string
): string {
  const descriptor = action.commandInput
  if (descriptor === undefined) {
    throw new Error("command action input descriptor is required")
  }
  const commandField = action.fields[0]
  if (commandField === undefined) {
    throw new Error("command action selector is required")
  }
  const commandInputs = descriptor.commands.length === 0
    ? renderEmptyCatalogInput(descriptor.catalogState)
    : descriptor.commands
        .map((command, index) =>
          renderCommandInputOption(command, index === 0)
        )
        .join("")
  const disabled =
    descriptor.catalogState === "ready" && descriptor.commands.length === 0
      ? " disabled"
      : ""
  return [
    `<form data-action="${escapeHtml(action.id)}" data-command-invocation-form>`,
    `<input type="hidden" name="action" value="${escapeHtml(action.id)}">`,
    renderField(commandField),
    `<div data-command-input-options>${commandInputs}</div>`,
    `<button type="submit"${disabled}>${escapeHtml(action.label)}</button>`,
    `</form>`
  ].join("")
}

function renderEmptyCatalogInput(state: "ready" | "unavailable"): string {
  if (state === "ready") {
    return `<p data-command-input-empty-state>No product commands available</p>`
  }
  return [
    `<fieldset data-command-input-mode="raw">`,
    `<label>JSON input<textarea name="inputJson"></textarea></label>`,
    `</fieldset>`
  ].join("")
}

function renderCommandInputOption(
  command: NonNullable<ProductAppWebActionDescriptor["commandInput"]>["commands"][number],
  active: boolean
): string {
  const state = active ? "" : " hidden"
  const disabled = active ? "" : " disabled"
  if (command.input.mode === "raw") {
    return [
      `<fieldset data-command-input-command="${escapeHtml(command.id)}" data-command-input-mode="raw"${state}${disabled}>`,
      `<legend>${escapeHtml(command.title)}</legend>`,
      `<label>JSON input<textarea name="inputJson"></textarea></label>`,
      `</fieldset>`
    ].join("")
  }
  if (command.input.mode === "unsupported") {
    return [
      `<fieldset data-command-input-command="${escapeHtml(command.id)}" data-command-input-mode="unsupported"${state} disabled>`,
      `<legend>${escapeHtml(command.title)}</legend>`,
      `<p data-command-input-unsupported>${escapeHtml(command.input.message)}</p>`,
      `</fieldset>`
    ].join("")
  }
  return [
    `<fieldset data-command-input-command="${escapeHtml(command.id)}" data-command-input-mode="generated"${state}${disabled}>`,
    `<legend>${escapeHtml(command.title)}</legend>`,
    command.input.root.properties
      .map((control) => renderControl(control, control.path, false))
      .join(""),
    `</fieldset>`
  ].join("")
}

function renderControl(
  control: ProductAppWebCommandInputControl,
  path: string,
  template: boolean
): string {
  switch (control.kind) {
    case "object":
      return renderObject(control, path, template)
    case "array":
      return renderArray(control, path, template)
    case "string":
      return renderString(control, path, template)
    case "number":
    case "integer":
      return renderNumber(control, path, template)
    case "boolean":
      return renderBoolean(control, path, template)
  }
}

function renderObject(
  control: Extract<ProductAppWebCommandInputControl, { kind: "object" }>,
  path: string,
  template: boolean
): string {
  const optional = !control.required
  return [
    `<div data-command-input-node="object" data-command-input-path="${escapeHtml(path)}">`,
    optional ? renderPresenceToggle(control, path, template) : "",
    `<fieldset data-command-container-content${optional ? " disabled" : ""}>`,
    `<legend>${escapeHtml(control.label)}</legend>`,
    renderAnnotation(control),
    ...control.properties.map((child) =>
      renderControl(
        child,
        replacePathPrefix(child.path, control.path, path),
        template
      )
    ),
    `</fieldset>`,
    `</div>`
  ].join("")
}

function renderArray(
  control: Extract<ProductAppWebCommandInputControl, { kind: "array" }>,
  path: string,
  template: boolean
): string {
  const optional = !control.required
  const rows = Array.from({ length: control.minItems }, (_, index) =>
    renderArrayRow(control, path, index, false)
  ).join("")
  const itemTemplate = renderArrayRow(control, path, 0, true)
  return [
    `<div data-command-input-node="array" data-command-input-array data-command-input-path="${escapeHtml(path)}" data-min-items="${control.minItems}" data-max-items="${control.maxItems}">`,
    optional ? renderPresenceToggle(control, path, template) : "",
    `<fieldset data-command-container-content${optional ? " disabled" : ""}>`,
    `<legend>${escapeHtml(control.label)}</legend>`,
    renderAnnotation(control),
    `<div data-command-array-rows>${rows}</div>`,
    `<template data-command-array-template>${itemTemplate}</template>`,
    `<button type="button" data-command-array-add>Add item</button>`,
    `</fieldset>`,
    `</div>`
  ].join("")
}

function renderArrayRow(
  control: Extract<ProductAppWebCommandInputControl, { kind: "array" }>,
  path: string,
  index: number,
  template: boolean
): string {
  const itemPath = joinPointer(path, String(index))
  return [
    `<div data-command-array-row data-array-index="${index}"${template ? " data-command-array-template-row" : ""}>`,
    `<input type="hidden" name="${escapeHtml(productAppWebCommandArrayItemFieldName(itemPath))}" value="true"${template ? " disabled" : ""}>`,
    renderControl(control.item, itemPath, template),
    `<button type="button" data-command-array-remove>Remove item</button>`,
    `</div>`
  ].join("")
}

function renderString(
  control: Extract<ProductAppWebCommandInputControl, { kind: "string" }>,
  path: string,
  template: boolean
): string {
  const attributes = scalarAttributes(control, path, template)
  const input = control.options === undefined
    ? `<input type="text"${attributes}${bound("minlength", control.minLength)}${bound("maxlength", control.maxLength)}>`
    : `<select${attributes}>${unsetOption(control.required)}${control.options
        .map((option) =>
          `<option value="${escapeHtml(productAppWebCommandEnumOptionValue(option))}">${escapeHtml(option)}</option>`
        )
        .join("")}</select>`
  return renderScalar(control, input, path)
}

function renderNumber(
  control: Extract<ProductAppWebCommandInputControl, { kind: "number" | "integer" }>,
  path: string,
  template: boolean
): string {
  const attributes = scalarAttributes(control, path, template)
  const input = control.options === undefined
    ? `<input type="number" step="${control.kind === "integer" ? "1" : "any"}"${attributes}${bound("min", control.minimum)}${bound("max", control.maximum)}>`
    : `<select${attributes}>${unsetOption(control.required)}${control.options
        .map((option) =>
          `<option value="${escapeHtml(productAppWebCommandEnumOptionValue(option))}">${escapeHtml(String(option))}</option>`
        )
        .join("")}</select>`
  return renderScalar(control, input, path)
}

function renderBoolean(
  control: Extract<ProductAppWebCommandInputControl, { kind: "boolean" }>,
  path: string,
  template: boolean
): string {
  const options = control.options ?? [true, false]
  const input = `<select${scalarAttributes(control, path, template)}>${unsetOption(control.required)}${options
    .map((option) =>
      `<option value="${option}">${option ? "Yes" : "No"}</option>`
    )
    .join("")}</select>`
  return renderScalar(control, input, path)
}

function renderScalar(
  control: ProductAppWebCommandInputControl,
  input: string,
  path: string
): string {
  const label = [
    `<label data-command-input-field-path="${escapeHtml(path)}">`,
    escapeHtml(control.label),
    input,
    renderAnnotation(control),
    `</label>`
  ].join("")
  if (control.required) return label
  return [
    `<div data-command-input-node="${escapeHtml(control.kind)}" data-command-input-path="${escapeHtml(path)}">`,
    renderPresenceToggle(control, path, false),
    `<fieldset data-command-container-content disabled>`,
    label,
    `</fieldset>`,
    `</div>`
  ].join("")
}

function renderPresenceToggle(
  control: ProductAppWebCommandInputControl,
  path: string,
  template: boolean
): string {
  return `<label data-command-container-presence><input type="checkbox" name="${escapeHtml(productAppWebCommandPresenceFieldName(path))}" value="true" data-command-container-toggle${template ? " disabled" : ""}>Include ${escapeHtml(control.label)}</label>`
}

function scalarAttributes(
  control: ProductAppWebCommandInputControl,
  path: string,
  template: boolean
): string {
  return [
    ` name="${escapeHtml(productAppWebCommandInputFieldName(path))}"`,
    control.required ? " required" : "",
    template ? " disabled" : ""
  ].join("")
}

function renderAnnotation(control: ProductAppWebCommandInputControl): string {
  return [
    control.description === undefined
      ? ""
      : `<small data-command-input-description>${escapeHtml(control.description)}</small>`,
    control.defaultHint === undefined
      ? ""
      : `<small data-command-input-default>${escapeHtml(`Default: ${control.defaultHint}`)}</small>`
  ].join("")
}

function unsetOption(required: boolean): string {
  return `<option value=""${required ? " disabled" : ""} selected></option>`
}

function bound(name: string, value: number | undefined): string {
  return value === undefined ? "" : ` ${name}="${value}"`
}

function replacePathPrefix(path: string, template: string, actual: string): string {
  return path === template ? actual : `${actual}${path.slice(template.length)}`
}

function joinPointer(path: string, segment: string): string {
  return path === "/" ? `/${segment}` : `${path}/${segment}`
}
