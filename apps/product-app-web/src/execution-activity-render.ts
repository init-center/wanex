import { escapeHtml } from "./escape-html.js"
import type { ProductAppWebExecutionActivityViewModel } from "./types.js"

export function renderProductAppWebExecutionActivity(
  activity: ProductAppWebExecutionActivityViewModel
): string {
  if (activity.state === "empty") {
    return `<section data-panel="execution-activity" data-execution-activity-state="empty"><h2>Execution Activity</h2><p>${escapeHtml(activity.message)}</p></section>`
  }
  const reference = activity.reference
  const refreshForm =
    reference === undefined
      ? ""
      : [
          `<form data-action="refresh-execution">`,
          `<input type="hidden" name="action" value="refresh-execution">`,
          `<input type="hidden" name="kind" value="${escapeHtml(reference.kind)}">`,
          `<input type="hidden" name="id" value="${escapeHtml(reference.id)}">`,
          `<button type="submit">Refresh execution</button>`,
          `</form>`
        ].join("")
  return [
    `<section data-panel="execution-activity" data-execution-activity-state="${escapeHtml(activity.state)}">`,
    `<h2>Execution Activity</h2>`,
    `<p data-execution-activity-message>${escapeHtml(activity.message)}</p>`,
    `<dl>`,
    `<dt>Reference</dt><dd>${escapeHtml(reference === undefined ? "none" : `${reference.kind}:${reference.id}`)}</dd>`,
    `<dt>Job kind</dt><dd>${escapeHtml(activity.jobKind ?? "unknown")}</dd>`,
    `<dt>Scheduler state</dt><dd>${escapeHtml(activity.schedulerState ?? "unknown")}</dd>`,
    `<dt>Attempt</dt><dd>${escapeHtml(activity.attempt === undefined ? "unknown" : `${activity.attempt}/${activity.maxAttempts ?? "?"}`)}</dd>`,
    `<dt>Failure category</dt><dd>${escapeHtml(activity.failureCategory ?? "none")}</dd>`,
    `</dl>`,
    refreshForm,
    `</section>`
  ].join("")
}
