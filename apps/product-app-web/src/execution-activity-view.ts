import type {
  ProductAppExecutionReferenceReadResult,
  ProductAppReadExecutionReferenceRequest,
  ProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import type { ProductAppWebExecutionActivityViewModel } from "./types.js"

export function idleProductAppWebExecutionActivity(): ProductAppWebExecutionActivityViewModel {
  return {
    kind: "product-app-web.execution-activity",
    state: "empty",
    message: "No durable execution tracked"
  }
}

export function productAppWebExecutionActivityFromResult(
  result: ProductAppExecutionReferenceReadResult,
  refreshedAt: number
): ProductAppWebExecutionActivityViewModel {
  if (result.kind === "missing" || result.kind === "unsupported") {
    return {
      kind: "product-app-web.execution-activity",
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
    kind: "product-app-web.execution-activity",
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

export async function refreshProductAppWebExecutionActivity(request: {
  readonly client: ProductAppSurfaceClient
  readonly previous: ProductAppWebExecutionActivityViewModel
  readonly now: () => number
}): Promise<ProductAppWebExecutionActivityViewModel> {
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
  return productAppWebExecutionActivityFromResult(
    response.value,
    request.now()
  )
}

function isTerminalPresentationState(
  state: ProductAppWebExecutionActivityViewModel["state"]
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
): ProductAppReadExecutionReferenceRequest | undefined {
  const reference = references.find((item) => item.kind === "job")
  return reference === undefined
    ? undefined
    : { kind: "job", id: reference.id }
}

function presentationState(
  state: Extract<ProductAppExecutionReferenceReadResult, { readonly kind: "found" }>[
    "activity"
  ]["state"]
): ProductAppWebExecutionActivityViewModel["state"] {
  switch (state) {
    case "pending":
    case "ready":
      return "submitted"
    case "running":
      return "running"
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
