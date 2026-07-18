import { escapeHtml } from "./escape-html.js"
import type { ProductAppWebCommandExecutionViewModel } from "./types.js"
import { renderProductAppWebCommandInputValidation } from "./command-input-feedback-render.js"

export function renderProductAppWebCommandExecution(
  execution: ProductAppWebCommandExecutionViewModel
): string {
  if (execution.state === "empty") {
    return `<section data-panel="command-execution" data-command-execution-state="empty"><h2>Command Execution</h2><p data-command-execution-empty-state>${escapeHtml(execution.message)}</p></section>`
  }
  const references =
    execution.references.length === 0
      ? `<li data-command-execution-reference-empty>none</li>`
      : execution.references
          .map(
            (reference) =>
              `<li data-command-execution-reference-kind="${escapeHtml(reference.kind)}">${escapeHtml(reference.kind)}:${escapeHtml(reference.id)}</li>`
          )
          .join("")
  return [
    `<section data-panel="command-execution" data-command-execution-state="${escapeHtml(execution.state)}" data-command-execution-command-id="${escapeHtml(execution.commandId ?? "")}">`,
    `<h2>Command Execution</h2>`,
    `<p data-command-execution-message>${escapeHtml(execution.message)}</p>`,
    `<dl>`,
    `<dt>Command</dt><dd>${escapeHtml(execution.commandId ?? "unknown")}</dd>`,
    `<dt>Handler</dt><dd>${escapeHtml(execution.handlerRef ?? "unknown")}</dd>`,
    `<dt>Reason</dt><dd>${escapeHtml(execution.reason ?? "none")}</dd>`,
    `<dt>Value kind</dt><dd>${escapeHtml(execution.valueKind ?? "none")}</dd>`,
    `</dl>`,
    renderProductAppWebCommandInputValidation(execution.inputValidation),
    `<ul data-command-execution-references>${references}</ul>`,
    `</section>`
  ].join("")
}
