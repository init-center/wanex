import {
  productAppWebCommandPreviewFromResult
} from "./command-preview-view.js"
import { productAppWebCommandExecutionFromResult } from "./command-execution-view.js"
import {
  firstJobReference,
  productAppWebExecutionActivityFromResult
} from "./execution-activity-view.js"
import {
  idleProductAppWebWorkbench,
  productAppWebWorkbenchFromResult
} from "./workbench-view.js"
import {
  idleProductAppWebConversation,
  productAppWebConversationFromResult
} from "./conversation-view.js"
import type {
  CreateProductAppWebSurfaceOptions,
  ProductAppWebAction,
  ProductAppWebCommandPreviewViewModel,
  ProductAppWebCommandExecutionViewModel,
  ProductAppWebConversationSourceResult,
  ProductAppWebConversationViewModel,
  ProductAppWebExecutionActivityViewModel,
  ProductAppWebOperationStatusViewModel,
  ProductAppWebSnapshot,
  ProductAppWebWorkbenchSourceResult,
  ProductAppWebWorkbenchViewModel
} from "./types.js"

export interface ProductAppWebSurfaceActionTransition {
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
  readonly operationStatus: ProductAppWebOperationStatusViewModel
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly conversation: ProductAppWebConversationViewModel
  readonly workbench: ProductAppWebWorkbenchViewModel
}

export function idleProductAppWebOperationStatus(): ProductAppWebOperationStatusViewModel {
  return {
    kind: "product-app-web.operation-status",
    state: "idle",
    message: "No operation yet"
  }
}

export async function runProductAppWebSurfaceAction(request: {
  readonly options: CreateProductAppWebSurfaceOptions
  readonly action: ProductAppWebAction
  readonly now: () => number
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly conversation: ProductAppWebConversationViewModel
  readonly workbench: ProductAppWebWorkbenchViewModel
}): Promise<ProductAppWebSurfaceActionTransition> {
  const actionResult = await dispatchAction(request.options, request.action)
  const operationStatus = operationStatusAfterAction({
    action: request.action,
    actionResult,
    now: request.now
  })
  const executionActivity = await nextExecutionActivityAfterAction({
    client: request.options.client,
    previous: request.executionActivity,
    action: request.action,
    actionResult,
    updatedAt: operationStatus.updatedAt ?? request.now()
  })
  return {
    actionResult,
    operationStatus,
    conversation: nextConversationAfterAction({
      previous: request.conversation,
      action: request.action,
      actionResult
    }),
    workbench: nextWorkbenchAfterAction({
      previous: request.workbench,
      action: request.action,
      actionResult
    }),
    commandPreview: nextCommandPreviewAfterAction({
      previous: request.commandPreview,
      action: request.action,
      actionResult,
      updatedAt: operationStatus.updatedAt ?? request.now()
    }),
    commandExecution: nextCommandExecutionAfterAction({
      previous: request.commandExecution,
      action: request.action,
      actionResult,
      updatedAt: operationStatus.updatedAt ?? request.now()
    }),
    executionActivity
  }
}

export function failedProductAppWebOperationStatus(request: {
  readonly action: ProductAppWebAction["type"]
  readonly message: string
  readonly updatedAt: number
}): ProductAppWebOperationStatusViewModel {
  return {
    kind: "product-app-web.operation-status",
    state: "failed",
    action: request.action,
    message: request.message,
    updatedAt: request.updatedAt
  }
}

export function isFailedProductAppWebActionResult(
  value: ProductAppWebSurfaceEnvelopeLike
): value is ProductAppWebSurfaceEnvelopeLike & {
  readonly ok: false
  readonly error: {
    readonly message: string
  }
} {
  return value.ok === false && value.error !== undefined
}

export function withProductAppWebActionDiagnostic(
  snapshot: ProductAppWebSnapshot,
  message: string
): ProductAppWebSnapshot {
  const diagnostics = [
    ...snapshot.diagnostics,
    {
      code: "product-app-web.action_failed" as const,
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

export interface ProductAppWebSurfaceEnvelopeLike {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: {
    readonly message: string
  }
}

function operationStatusAfterAction(request: {
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
  readonly now: () => number
}): ProductAppWebOperationStatusViewModel {
  const updatedAt = request.now()
  if (isFailedProductAppWebActionResult(request.actionResult)) {
    return failedProductAppWebOperationStatus({
      action: request.action.type,
      message: request.actionResult.error.message,
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
    if (result.kind === "product-app.conversation-operation.rejected") {
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

function commandPreviewOperationStatus(request: {
  readonly action: ProductAppWebAction["type"]
  readonly preview: ProductAppCommandPreviewLike
  readonly updatedAt: number
}): ProductAppWebOperationStatusViewModel {
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
  readonly action: ProductAppWebAction["type"]
  readonly result: ProductAppWebWorkbenchSourceResult
  readonly updatedAt: number
}): ProductAppWebOperationStatusViewModel {
  switch (request.result.kind) {
    case "product-app.workbench.no-session":
      return blockedOperationStatus({
        action: request.action,
        message: request.result.message,
        updatedAt: request.updatedAt
      })
    case "product-app.workbench.failed":
      if (request.result.error.category === "validation") {
        return blockedOperationStatus({
          action: request.action,
          message: request.result.error.message,
          updatedAt: request.updatedAt
        })
      }
      return failedProductAppWebOperationStatus({
        action: request.action,
        message: request.result.error.message,
        updatedAt: request.updatedAt
      })
    default:
      return succeededOperationStatus(request.action, request.updatedAt)
  }
}

function succeededOperationStatus(
  action: ProductAppWebAction["type"],
  updatedAt: number
): ProductAppWebOperationStatusViewModel {
  return {
    kind: "product-app-web.operation-status",
    state: "succeeded",
    action,
    message: `${action} completed`,
    updatedAt
  }
}

function blockedOperationStatus(request: {
  readonly action: ProductAppWebAction["type"]
  readonly message: string
  readonly updatedAt: number
}): ProductAppWebOperationStatusViewModel {
  return {
    kind: "product-app-web.operation-status",
    state: "blocked",
    action: request.action,
    message: request.message,
    updatedAt: request.updatedAt
  }
}

async function dispatchAction(
  options: CreateProductAppWebSurfaceOptions,
  action: ProductAppWebAction
): Promise<ProductAppWebSurfaceEnvelopeLike> {
  switch (action.type) {
    case "refresh":
      return await options.client.status()
    case "select-session":
      return await options.client.selectSession({ sessionId: action.sessionId })
    case "set-layout":
      return await options.client.setLayout(action.input)
    case "set-mode":
      return await options.client.setMode(action.input)
    case "update-preferences":
      return await options.client.updatePreferences(action.input)
    case "set-active-provider-profile":
      return await options.client.setActiveProviderProfile(action.input)
    case "preview-command":
      return await options.client.previewProductCommandInvocation(action.input)
    case "execute-command":
      return await options.client.executeProductCommand(action.input)
    case "refresh-execution":
      return await options.client.readExecutionReference(action.input)
    case "open-workbench":
      return await options.client.openWorkbench(action.input)
    case "submit-conversation":
      return await options.client.submitConversationOperation(action.input)
    case "remove-conversation-attachment":
      return await options.client.removeConversationAttachment(action.input)
    case "refresh-conversation":
      return await options.client.readTrackedConversationOperation(action.input)
    case "cancel-conversation":
      return await options.client.cancelTrackedConversationOperation(action.input)
    case "regenerate-conversation":
      return await options.client.regenerateTrackedConversationOperation(
        action.input
      )
  }
}

async function nextExecutionActivityAfterAction(request: {
  readonly client: CreateProductAppWebSurfaceOptions["client"]
  readonly previous: ProductAppWebExecutionActivityViewModel
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
  readonly updatedAt: number
}): Promise<ProductAppWebExecutionActivityViewModel> {
  if (
    request.action.type === "refresh-execution" &&
    request.actionResult.ok &&
    isExecutionReferenceResult(request.actionResult.value)
  ) {
    return productAppWebExecutionActivityFromResult(
      request.actionResult.value,
      request.updatedAt
    )
  }
  if (
    request.action.type !== "execute-command" ||
    !isSuccessfulCommandExecutionEnvelope(request.actionResult) ||
    request.actionResult.value.kind !== "completed"
  ) {
    return request.previous
  }
  const reference = firstJobReference(
    request.actionResult.value.summary.references
  )
  if (reference === undefined) {
    return request.previous
  }
  const response = await request.client.readExecutionReference(reference)
  if (!response.ok) {
    return {
      kind: "product-app-web.execution-activity",
      state: "unavailable",
      message: response.error.message,
      reference,
      refreshedAt: request.updatedAt
    }
  }
  return productAppWebExecutionActivityFromResult(
    response.value,
    request.updatedAt
  )
}

function isExecutionReferenceResult(
  value: unknown
): value is Parameters<typeof productAppWebExecutionActivityFromResult>[0] {
  return (
    isRecord(value) &&
    (value.kind === "found" ||
      value.kind === "missing" ||
      value.kind === "unsupported") &&
    isRecord(value.reference) &&
    typeof value.reference.kind === "string" &&
    typeof value.reference.id === "string"
  )
}

function nextCommandExecutionAfterAction(request: {
  readonly previous: ProductAppWebCommandExecutionViewModel
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
  readonly updatedAt: number
}): ProductAppWebCommandExecutionViewModel {
  if (
    request.action.type === "execute-command" &&
    isSuccessfulCommandExecutionEnvelope(request.actionResult)
  ) {
    return productAppWebCommandExecutionFromResult(
      request.actionResult.value,
      request.updatedAt
    )
  }
  return request.previous
}

function nextWorkbenchAfterAction(request: {
  readonly previous: ProductAppWebWorkbenchViewModel
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
}): ProductAppWebWorkbenchViewModel {
  if (isSuccessfulWorkbenchEnvelope(request.actionResult)) {
    return productAppWebWorkbenchFromResult(request.actionResult.value)
  }
  if (request.action.type === "select-session" && request.actionResult.ok) {
    return idleProductAppWebWorkbench(request.action.sessionId)
  }
  return request.previous
}

function nextConversationAfterAction(request: {
  readonly previous: ProductAppWebConversationViewModel
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
}): ProductAppWebConversationViewModel {
  if (isSuccessfulConversationEnvelope(request.actionResult)) {
    return productAppWebConversationFromResult(
      request.actionResult.value,
      request.previous
    )
  }
  if (request.action.type === "select-session" && request.actionResult.ok) {
    return idleProductAppWebConversation(request.action.sessionId)
  }
  return request.previous
}

function nextCommandPreviewAfterAction(request: {
  readonly previous: ProductAppWebCommandPreviewViewModel
  readonly action: ProductAppWebAction
  readonly actionResult: ProductAppWebSurfaceEnvelopeLike
  readonly updatedAt: number
}): ProductAppWebCommandPreviewViewModel {
  if (
    request.action.type === "preview-command" &&
    isSuccessfulCommandPreviewEnvelope(request.actionResult)
  ) {
    return productAppWebCommandPreviewFromResult({
      preview: request.actionResult.value,
      updatedAt: request.updatedAt
    })
  }
  return request.previous
}

function isSuccessfulWorkbenchEnvelope(
  value: ProductAppWebSurfaceEnvelopeLike
): value is ProductAppWebSurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: ProductAppWebWorkbenchSourceResult
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    value.value.kind === "product-app.workbench.opened" ||
    value.value.kind === "product-app.workbench.no-session" ||
    value.value.kind === "product-app.workbench.failed"
  )
}

function isSuccessfulConversationEnvelope(
  value: ProductAppWebSurfaceEnvelopeLike
): value is ProductAppWebSurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: ProductAppWebConversationSourceResult
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    value.value.kind === "product-app.conversation-operation.found" ||
    value.value.kind === "product-app.conversation-operation.untracked" ||
    value.value.kind === "product-app.conversation-operation.missing" ||
    value.value.kind === "product-app.conversation-operation.rejected" ||
    value.value.kind === "product-app.conversation-operation.cancel"
  )
}

function conversationResult(
  result: ProductAppWebConversationSourceResult
): Exclude<ProductAppWebConversationSourceResult, { readonly kind: "product-app.conversation-operation.cancel" }> {
  return result.kind === "product-app.conversation-operation.cancel"
    ? result.operation
    : result
}

function isSuccessfulCommandPreviewEnvelope(
  value: ProductAppWebSurfaceEnvelopeLike
): value is ProductAppWebSurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: Parameters<typeof productAppWebCommandPreviewFromResult>[0]["preview"]
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    (value.value.kind === "runnable" || value.value.kind === "rejected") &&
    typeof value.value.commandId === "string"
  )
}

function isSuccessfulCommandExecutionEnvelope(
  value: ProductAppWebSurfaceEnvelopeLike
): value is ProductAppWebSurfaceEnvelopeLike & {
  readonly ok: true
  readonly value: Parameters<typeof productAppWebCommandExecutionFromResult>[0]
} {
  if (!value.ok || !isRecord(value.value)) {
    return false
  }
  return (
    (value.value.kind === "completed" || value.value.kind === "rejected") &&
    typeof value.value.commandId === "string"
  )
}

type ProductAppCommandPreviewLike =
  | {
      readonly kind: "runnable"
      readonly commandId: string
    }
  | {
      readonly kind: "rejected"
      readonly commandId: string
      readonly message: string
    }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
