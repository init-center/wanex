import type {
  ExecutionReferenceReadResult,
  ReadExecutionReferenceRequest,
  SurfaceClient
} from "@wanex/product/surface"
import type { ExecutionActivityViewModel } from "./model.js"

export function idleExecutionActivity(): ExecutionActivityViewModel {
  return {
    kind: "web.execution-activity",
    state: "empty",
    message: "No durable execution tracked"
  }
}

export function projectExecutionActivityFromResult(
  result: ExecutionReferenceReadResult,
  refreshedAt: number
): ExecutionActivityViewModel {
  if (result.kind === "missing" || result.kind === "unsupported") {
    return {
      kind: "web.execution-activity",
      state: result.kind,
      message:
        result.kind === "missing"
          ? "Execution reference was not found"
          : "Execution reference is not supported",
      reference: result.reference,
      refreshedAt
    }
  }
  const activity = result.activity
  const state = presentationState(activity.state)
  return {
    kind: "web.execution-activity",
    state,
    message: `Execution ${state}`,
    reference: result.reference,
    jobKind: activity.jobKind,
    schedulerState: activity.state,
    attempt: activity.attempt,
    maxAttempts: activity.maxAttempts,
    scheduledAt: activity.scheduledAt,
    ...(activity.notBefore === undefined
      ? {}
      : { notBefore: activity.notBefore }),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    ...(activity.finishedAt === undefined
      ? {}
      : { finishedAt: activity.finishedAt }),
    ...(activity.failureCategory === undefined
      ? {}
      : { failureCategory: activity.failureCategory }),
    refreshedAt
  }
}

export async function refreshExecutionActivity(request: {
  readonly client: SurfaceClient
  readonly previous: ExecutionActivityViewModel
  readonly now: () => number
}): Promise<ExecutionActivityViewModel> {
  if (
    request.previous.reference === undefined ||
    isTerminalPresentationState(request.previous.state)
  ) {
    return request.previous
  }
  const response = await request.client.readExecutionReference(
    request.previous.reference
  )
  if (!response.ok) {
    return {
      ...request.previous,
      state: "unavailable",
      message: response.error.message,
      refreshedAt: request.now()
    }
  }
  return projectExecutionActivityFromResult(
    response.value,
    request.now()
  )
}

function isTerminalPresentationState(
  state: ExecutionActivityViewModel["state"]
): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "missing" ||
    state === "unsupported"
  )
}

export function firstJobReference(
  references: readonly { readonly kind: string; readonly id: string }[]
): ReadExecutionReferenceRequest | undefined {
  const reference = references.find((item) => item.kind === "job")
  return reference === undefined
    ? undefined
    : { kind: "job", id: reference.id }
}

function presentationState(
  state: Extract<ExecutionReferenceReadResult, { readonly kind: "found" }>[
    "activity"
  ]["state"]
): ExecutionActivityViewModel["state"] {
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
