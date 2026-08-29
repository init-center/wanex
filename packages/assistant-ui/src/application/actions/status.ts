import type {
  Action,
  OperationStatusViewModel,
  Snapshot,
  WorkbenchSourceResult
} from "../model.js"
import type { SurfaceEnvelopeLike } from "./model.js"
import {
  conversationResult,
  isSuccessfulCommandExecutionEnvelope,
  isSuccessfulCommandPreviewEnvelope,
  isSuccessfulConversationEnvelope,
  isSuccessfulWorkbenchEnvelope,
  isRecord,
  type CommandPreviewLike
} from "./guards.js"

export function failedOperationStatus(request: {
  readonly action: Action["type"]
  readonly message: string
  readonly updatedAt: number
}): OperationStatusViewModel {
  return {
    kind: "web.operation-status",
    state: "failed",
    action: request.action,
    message: request.message,
    updatedAt: request.updatedAt
  }
}

export function isFailedActionResult(
  value: SurfaceEnvelopeLike
): value is SurfaceEnvelopeLike & {
  readonly ok: false
  readonly error: {
    readonly message: string
  }
} {
  return value.ok === false && value.error !== undefined
}

export function withActionDiagnostic(
  snapshot: Snapshot,
  message: string
): Snapshot {
  const diagnostics = [
    ...snapshot.diagnostics,
    {
      code: "web.action_failed" as const,
      severity: "error" as const,
      message
    }
  ]
  return {
    ...snapshot,
    diagnostics,
    view: {
      ...snapshot.view,
      diagnostics
    }
  }
}

export function operationStatusAfterAction(request: {
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
  readonly now: () => number
}): OperationStatusViewModel {
  const updatedAt = request.now()
  if (isFailedActionResult(request.actionResult)) {
    return failedOperationStatus({
      action: request.action.type,
      message: request.actionResult.error.message,
      updatedAt
    })
  }
  if (
    isPluginManagementAction(request.action.type) &&
    request.actionResult.ok &&
    isRecord(request.actionResult.value) &&
    request.actionResult.value.kind === "plugin.management.rejected" &&
    typeof request.actionResult.value.message === "string"
  ) {
    return blockedOperationStatus({
      action: request.action.type,
      message: request.actionResult.value.message,
      updatedAt
    })
  }
  if (
    isScheduleAction(request.action.type) &&
    request.actionResult.ok &&
    isRecord(request.actionResult.value) &&
    (request.actionResult.value.kind === "assistant.schedule.conflict" ||
      request.actionResult.value.kind === "assistant.schedule.rejected") &&
    typeof request.actionResult.value.message === "string"
  ) {
    return blockedOperationStatus({
      action: request.action.type,
      message: request.actionResult.value.message,
      updatedAt
    })
  }
  if (isSuccessfulWorkbenchEnvelope(request.actionResult)) {
    return workbenchOperationStatus({
      action: request.action.type,
      result: request.actionResult.value,
      updatedAt
    })
  }
  if (isSuccessfulConversationEnvelope(request.actionResult)) {
    const result = conversationResult(request.actionResult.value)
    if (result.kind === "assistant.conversation-operation.rejected") {
      return blockedOperationStatus({
        action: request.action.type,
        message: result.message,
        updatedAt
      })
    }
    return succeededOperationStatus(request.action.type, updatedAt)
  }
  if (isSuccessfulCommandPreviewEnvelope(request.actionResult)) {
    return commandPreviewOperationStatus({
      action: request.action.type,
      preview: request.actionResult.value,
      updatedAt
    })
  }
  if (isSuccessfulCommandExecutionEnvelope(request.actionResult)) {
    return request.actionResult.value.kind === "rejected"
      ? blockedOperationStatus({
          action: request.action.type,
          message: request.actionResult.value.message,
          updatedAt
        })
      : succeededOperationStatus(request.action.type, updatedAt)
  }
  return succeededOperationStatus(request.action.type, updatedAt)
}

function isPluginManagementAction(type: Action["type"]): boolean {
  return type === "read-plugin-management" ||
    type === "request-local-plugin-review" ||
    type === "approve-local-plugin-review" ||
    type === "cancel-local-plugin-review" ||
    type === "set-plugin-install-state" ||
    type === "retry-plugin-refresh"
}

function isScheduleAction(type: Action["type"]): boolean {
  return type === "read-schedule" ||
    type === "create-schedule" ||
    type === "replace-schedule" ||
    type === "set-schedule-enabled" ||
    type === "remove-schedule"
}

function commandPreviewOperationStatus(request: {
  readonly action: Action["type"]
  readonly preview: CommandPreviewLike
  readonly updatedAt: number
}): OperationStatusViewModel {
  if (request.preview.kind === "rejected") {
    return blockedOperationStatus({
      action: request.action,
      message: request.preview.message,
      updatedAt: request.updatedAt
    })
  }
  return succeededOperationStatus(request.action, request.updatedAt)
}

function workbenchOperationStatus(request: {
  readonly action: Action["type"]
  readonly result: WorkbenchSourceResult
  readonly updatedAt: number
}): OperationStatusViewModel {
  switch (request.result.kind) {
    case "assistant.workbench.no-session":
      return blockedOperationStatus({
        action: request.action,
        message: request.result.message,
        updatedAt: request.updatedAt
      })
    case "assistant.workbench.failed":
      if (request.result.error.category === "validation") {
        return blockedOperationStatus({
          action: request.action,
          message: request.result.error.message,
          updatedAt: request.updatedAt
        })
      }
      return failedOperationStatus({
        action: request.action,
        message: request.result.error.message,
        updatedAt: request.updatedAt
      })
    default:
      return succeededOperationStatus(request.action, request.updatedAt)
  }
}

function succeededOperationStatus(
  action: Action["type"],
  updatedAt: number
): OperationStatusViewModel {
  return {
    kind: "web.operation-status",
    state: "succeeded",
    action,
    message: `${action} completed`,
    updatedAt
  }
}

function blockedOperationStatus(request: {
  readonly action: Action["type"]
  readonly message: string
  readonly updatedAt: number
}): OperationStatusViewModel {
  return {
    kind: "web.operation-status",
    state: "blocked",
    action: request.action,
    message: request.message,
    updatedAt: request.updatedAt
  }
}
