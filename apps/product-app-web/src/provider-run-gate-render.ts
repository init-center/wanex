import type {
  ProductAppWebProviderRunGateViewModel
} from "./types.js"
import {
  escapeHtml
} from "./escape-html.js"

export function renderProductAppWebProviderRunGate(
  gate: ProductAppWebProviderRunGateViewModel
): string {
  return [
    `<section data-panel="provider-run-gate" data-provider-run-gate-state="${escapeHtml(gate.state)}" data-provider-can-run="${gate.canRun ? "true" : "false"}" data-provider-attention-required="${gate.attentionRequired ? "true" : "false"}">`,
    `<h2>Provider</h2>`,
    `<p role="status" data-provider-run-gate-message>${escapeHtml(gate.message)}</p>`,
    `<dl>`,
    `<dt>Status</dt><dd>${escapeHtml(gate.status)}</dd>`,
    `<dt>Reason</dt><dd>${escapeHtml(gate.reason)}</dd>`,
    `<dt>Active</dt><dd>${escapeHtml(gate.activeProfileId)}</dd>`,
    `<dt>Workbench</dt><dd>${escapeHtml(gate.canSubmitWorkbench ? "enabled" : "blocked")}</dd>`,
    `</dl>`,
    `</section>`
  ].join("")
}
