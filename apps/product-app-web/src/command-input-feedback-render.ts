import { escapeHtml } from "./escape-html.js"
import type {
  ProductAppWebCommandInputValidationViewModel
} from "./command-feedback-types.js"

export function renderProductAppWebCommandInputValidation(
  validation: ProductAppWebCommandInputValidationViewModel | undefined
): string {
  if (validation === undefined) return ""
  return [
    `<section data-command-input-validation data-command-input-validation-source="${escapeHtml(validation.source)}">`,
    `<h3>Input validation</h3>`,
    `<ul>`,
    validation.issues.map((issue) => [
      `<li data-command-input-error-path="${escapeHtml(issue.path)}" data-command-input-error-keyword="${escapeHtml(issue.keyword)}">`,
      `<code>${escapeHtml(issue.path)}</code> `,
      escapeHtml(issue.message),
      `</li>`
    ].join("")).join(""),
    `</ul>`,
    `</section>`
  ].join("")
}
