import type {
  ProductAppWebSnapshot
} from "./types.js"
import {
  escapeHtml
} from "./escape-html.js"

export function renderProductAppWebOperationStatus(
  snapshot: ProductAppWebSnapshot
): string {
  const operation = snapshot.view.operationStatus
  return [
    `<section data-panel="operation-status" data-operation-state="${escapeHtml(operation.state)}">`,
    `<h2>Operation</h2>`,
    `<dl>`,
    `<dt>State</dt><dd>${escapeHtml(operation.state)}</dd>`,
    `<dt>Action</dt><dd>${escapeHtml(operation.action ?? "none")}</dd>`,
    `<dt>Message</dt><dd data-operation-message>${escapeHtml(operation.message)}</dd>`,
    `<dt>Updated</dt><dd>${operation.updatedAt === undefined ? "never" : operation.updatedAt}</dd>`,
    `</dl>`,
    `</section>`
  ].join("")
}
