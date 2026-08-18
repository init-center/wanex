import { dispatchAction } from "./actions/dispatch.js"
import { operationStatusAfterAction } from "./actions/status.js"
import {
  nextCommandExecutionAfterAction,
  nextCommandPreviewAfterAction,
  nextConversationAfterAction,
  nextExecutionActivityAfterAction,
  nextPlanAfterAction,
  nextSideQueryAfterAction,
  nextWorkbenchAfterAction
} from "./actions/transition.js"
import type {
  CreateSurfaceOptions,
  Action,
  ActionDispatchOptions,
  CommandPreviewViewModel,
  CommandExecutionViewModel,
  ConversationViewModel,
  ExecutionActivityViewModel,
  OperationStatusViewModel,
  PlanViewModel,
  SideQueryViewModel,
  WorkbenchViewModel
} from "./model.js"
import type { SurfaceEnvelopeLike } from "./actions/model.js"

export type { SurfaceEnvelopeLike } from "./actions/model.js"
export {
  failedOperationStatus,
  isFailedActionResult,
  withActionDiagnostic
} from "./actions/status.js"

export interface SurfaceActionTransition {
  readonly actionResult: SurfaceEnvelopeLike
  readonly operationStatus: OperationStatusViewModel
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly conversation: ConversationViewModel
  readonly sideQuery: SideQueryViewModel
  readonly plan: PlanViewModel
  readonly workbench: WorkbenchViewModel
}

export function idleOperationStatus(): OperationStatusViewModel {
  return {
    kind: "web.operation-status",
    state: "idle",
    message: "No operation yet"
  }
}

export async function runSurfaceAction(request: {
  readonly options: CreateSurfaceOptions
  readonly action: Action
  readonly actionOptions?: ActionDispatchOptions
  readonly now: () => number
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly conversation: ConversationViewModel
  readonly sideQuery: SideQueryViewModel
  readonly plan: PlanViewModel
  readonly workbench: WorkbenchViewModel
}): Promise<SurfaceActionTransition> {
  const actionResult = await dispatchAction(
    request.options,
    request.action,
    request.actionOptions
  )
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
    sideQuery: nextSideQueryAfterAction({
      previous: request.sideQuery,
      action: request.action,
      actionResult
    }),
    plan: nextPlanAfterAction({
      previous: request.plan,
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
