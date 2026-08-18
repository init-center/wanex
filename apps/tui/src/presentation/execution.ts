import type { ExecutionReferenceReadResult } from "@wanex/product/surface"
import type { TuiRenderedExecutionActivity } from "../model.js"

export function renderTuiExecutionActivity(
  result: ExecutionReferenceReadResult
): TuiRenderedExecutionActivity {
  const lines = [
    "Execution activity",
    `reference:${result.reference.kind}:${result.reference.id}`,
    `status:${result.kind}`
  ]
  if (result.kind !== "found") {
    lines.push(
      `message:${result.kind === "missing" ? "Execution reference was not found" : "Execution reference is not supported"}`
    )
    return {
      kind: "tui.execution-activity",
      state: result.kind,
      referenceId: result.reference.id,
      lines,
      text: lines.join("\n")
    }
  }
  const activity = result.activity
  const state = presentationState(activity.state)
  lines.push(`state:${state}`)
  lines.push(`schedulerState:${activity.state}`)
  lines.push(`jobKind:${activity.jobKind}`)
  lines.push(`attempt:${activity.attempt}/${activity.maxAttempts}`)
  if (activity.failureCategory !== undefined) {
    lines.push(`failureCategory:${activity.failureCategory}`)
  }
  return {
    kind: "tui.execution-activity",
    state,
    referenceId: result.reference.id,
    schedulerState: activity.state,
    jobKind: activity.jobKind,
    attempt: activity.attempt,
    maxAttempts: activity.maxAttempts,
    lines,
    text: lines.join("\n")
  }
}

function presentationState(
  state: Extract<ExecutionReferenceReadResult, { readonly kind: "found" }>[
    "activity"
  ]["state"]
): TuiRenderedExecutionActivity["state"] {
  switch (state) {
    case "pending":
    case "ready":
      return "submitted"
    case "running":
      return "running"
    case "waiting":
      return "waiting"
    case "retry_scheduled":
      return "retrying"
    case "succeeded":
      return "succeeded"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
  }
}
