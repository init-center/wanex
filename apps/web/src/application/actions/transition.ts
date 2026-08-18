import {
  firstJobReference,
  projectExecutionActivityFromResult
} from "../execution/projection.js"
import { projectCommandExecutionFromResult } from "../commands/execution/projection.js"
import { projectCommandPreviewFromResult } from "../commands/preview/projection.js"
import {
  idleWorkbench,
  projectWorkbenchFromResult
} from "../workflows/workbench.js"
import {
  idleConversation,
  prependConversationHistory,
  projectConversationFromResult
} from "../conversation/projection.js"
import { projectSideQueryFromResult } from "../workflows/side-query.js"
import { projectPlanFromResult } from "../workflows/plan.js"
import type {
  Action,
  CreateSurfaceOptions,
  CommandExecutionViewModel,
  CommandPreviewViewModel,
  ConversationSourceResult,
  ConversationViewModel,
  ExecutionActivityViewModel,
  PlanSourceResult,
  PlanViewModel,
  SideQueryViewModel,
  WorkbenchSourceResult,
  WorkbenchViewModel
} from "../model.js"
import type { SurfaceEnvelopeLike } from "./model.js"
import {
  isConversationSourceResult,
  isSuccessfulCommandExecutionEnvelope,
  isSuccessfulCommandPreviewEnvelope,
  isSuccessfulConversationEnvelope,
  isSuccessfulConversationHistoryEnvelope,
  isSuccessfulSideQueryEnvelope,
  isSuccessfulWorkbenchEnvelope,
  isRecord
} from "./guards.js"

export async function nextExecutionActivityAfterAction(request: {
  readonly client: CreateSurfaceOptions["client"]
  readonly previous: ExecutionActivityViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
  readonly updatedAt: number
}): Promise<ExecutionActivityViewModel> {
  if (
    request.action.type === "refresh-execution" &&
    request.actionResult.ok &&
    isExecutionReferenceResult(request.actionResult.value)
  ) {
    return projectExecutionActivityFromResult(
      request.actionResult.value,
      request.updatedAt
    )
  }
  if (
    request.action.type !== "execute-command" ||
    !isSuccessfulCommandExecutionEnvelope(request.actionResult) ||
    request.actionResult.value.kind === "rejected"
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
      kind: "web.execution-activity",
      state: "unavailable",
      message: response.error.message,
      reference,
      refreshedAt: request.updatedAt
    }
  }
  return projectExecutionActivityFromResult(
    response.value,
    request.updatedAt
  )
}

function isExecutionReferenceResult(
  value: unknown
): value is Parameters<typeof projectExecutionActivityFromResult>[0] {
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

export function nextCommandExecutionAfterAction(request: {
  readonly previous: CommandExecutionViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
  readonly updatedAt: number
}): CommandExecutionViewModel {
  if (
    request.action.type === "execute-command" &&
    isSuccessfulCommandExecutionEnvelope(request.actionResult)
  ) {
    return projectCommandExecutionFromResult(
      request.actionResult.value,
      request.updatedAt
    )
  }
  return request.previous
}

export function nextWorkbenchAfterAction(request: {
  readonly previous: WorkbenchViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
}): WorkbenchViewModel {
  if (isSuccessfulWorkbenchEnvelope(request.actionResult)) {
    return projectWorkbenchFromResult(request.actionResult.value)
  }
  if (request.action.type === "select-session" && request.actionResult.ok) {
    return idleWorkbench(request.action.sessionId)
  }
  if (
    request.action.type === "archive-session" &&
    request.actionResult.ok &&
    request.previous.sessionId === request.action.input.sessionId
  ) {
    return idleWorkbench(undefined)
  }
  if (
    request.action.type === "start-new-conversation" &&
    request.actionResult.ok
  ) {
    return idleWorkbench(undefined)
  }
  return request.previous
}

export function nextConversationAfterAction(request: {
  readonly previous: ConversationViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
}): ConversationViewModel {
  if (
    request.action.type === "load-earlier-history" &&
    isSuccessfulConversationHistoryEnvelope(request.actionResult)
  ) {
    return prependConversationHistory(
      request.previous,
      request.actionResult.value
    )
  }
  if (
    request.action.type === "execute-plan-proposal" &&
    request.actionResult.ok &&
    isRecord(request.actionResult.value) &&
    request.actionResult.value.kind === "product.plan-execution.submitted" &&
    isConversationSourceResult(request.actionResult.value.operation)
  ) {
    return projectConversationFromResult(
      request.actionResult.value.operation,
      request.previous
    )
  }
  if (isSuccessfulConversationEnvelope(request.actionResult)) {
    return projectConversationFromResult(
      request.actionResult.value,
      request.previous
    )
  }
  if (request.action.type === "select-session" && request.actionResult.ok) {
    return idleConversation(request.action.sessionId)
  }
  if (
    request.action.type === "archive-session" &&
    request.actionResult.ok &&
    request.previous.sessionId === request.action.input.sessionId
  ) {
    return idleConversation(undefined)
  }
  if (
    request.action.type === "start-new-conversation" &&
    request.actionResult.ok
  ) {
    return idleConversation(undefined)
  }
  return request.previous
}

export function nextPlanAfterAction(request: {
  readonly previous: PlanViewModel
  readonly actionResult: SurfaceEnvelopeLike
}): PlanViewModel {
  return request.actionResult.ok && isPlanSourceResult(request.actionResult.value)
    ? projectPlanFromResult(request.actionResult.value, request.previous)
    : request.previous
}

function isPlanSourceResult(value: unknown): value is PlanSourceResult {
  return (
    isRecord(value) &&
    (value.kind === "product.plan-generation" ||
      value.kind === "product.plan-generation.found" ||
      value.kind === "product.plan-generation.missing" ||
      value.kind === "product.plan-proposal.found" ||
      value.kind === "product.plan-proposal.missing" ||
      value.kind === "product.plan-proposal.no-selection" ||
      value.kind === "product.plan-execution.submitted")
  )
}

export function nextSideQueryAfterAction(request: {
  readonly previous: SideQueryViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
}): SideQueryViewModel {
  if (isSuccessfulSideQueryEnvelope(request.actionResult)) {
    return projectSideQueryFromResult(
      request.actionResult.value,
      request.previous
    )
  }
  return request.previous
}

export function nextCommandPreviewAfterAction(request: {
  readonly previous: CommandPreviewViewModel
  readonly action: Action
  readonly actionResult: SurfaceEnvelopeLike
  readonly updatedAt: number
}): CommandPreviewViewModel {
  if (
    request.action.type === "preview-command" &&
    isSuccessfulCommandPreviewEnvelope(request.actionResult)
  ) {
    return projectCommandPreviewFromResult({
      preview: request.actionResult.value,
      updatedAt: request.updatedAt
    })
  }
  return request.previous
}
