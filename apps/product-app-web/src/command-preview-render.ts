import {
  escapeHtml
} from "./escape-html.js"
import type {
  ProductAppWebCommandPreviewViewModel
} from "./types.js"
import { renderProductAppWebCommandInputValidation } from "./command-input-feedback-render.js"

export function renderProductAppWebCommandPreview(
  preview: ProductAppWebCommandPreviewViewModel
): string {
  const commandId =
    preview.commandId === undefined
      ? ""
      : ` data-command-preview-command-id="${escapeHtml(preview.commandId)}"`
  if (preview.state === "empty") {
    return [
      `<section data-panel="command-preview" data-command-preview-state="empty">`,
      `<h2>Command Preview</h2>`,
      `<p data-command-preview-empty-state>${escapeHtml(preview.message)}</p>`,
      `</section>`
    ].join("")
  }

  return [
    `<section data-panel="command-preview" data-command-preview-state="${escapeHtml(preview.state)}"${commandId}>`,
    `<h2>Command Preview</h2>`,
    `<dl>`,
    `<dt>Status</dt><dd>${escapeHtml(preview.state)}</dd>`,
    `<dt>Command</dt><dd>${escapeHtml(preview.commandId ?? "unknown")}</dd>`,
    preview.commandTitle === undefined
      ? ""
      : `<dt>Title</dt><dd>${escapeHtml(preview.commandTitle)}</dd>`,
    preview.handlerRef === undefined
      ? ""
      : `<dt>Handler</dt><dd>${escapeHtml(preview.handlerRef)}</dd>`,
    preview.reason === undefined
      ? ""
      : `<dt>Reason</dt><dd>${escapeHtml(preview.reason)}</dd>`,
    `<dt>Input</dt><dd>${escapeHtml(preview.inputAccepted ? "accepted" : "rejected")}</dd>`,
    `<dt>Message</dt><dd>${escapeHtml(preview.message)}</dd>`,
    renderProviderPreview(preview),
    `</dl>`,
    renderProductAppWebCommandInputValidation(preview.inputValidation),
    `</section>`
  ].join("")
}

function renderProviderPreview(
  preview: ProductAppWebCommandPreviewViewModel
): string {
  if (preview.provider === undefined) {
    return ""
  }
  return [
    `<dt>Provider</dt><dd>${escapeHtml(preview.provider.status)}</dd>`,
    `<dt>Provider can run</dt><dd>${escapeHtml(preview.provider.canRun ? "yes" : "no")}</dd>`
  ].join("")
}
