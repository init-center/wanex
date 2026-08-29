import type {
  PlanGenerationReadModel,
  GoalReadModel,
  SideQueryReadModel
} from "@wanex/assistant/surface"
import type {
  TuiLineSessionResult,
  TuiSurface
} from "../model.js"
import { selectedSessionId } from "../selection.js"

export interface TuiLineSessionState {
  handledLineCount: number
  commandCount: number
  askCommandCount: number
  steerCommandCount: number
  attachCommandCount: number
  selectCommandCount: number
  workbenchCommandCount: number
  operationCommandCount: number
  cancelCommandCount: number
  regenerateCommandCount: number
  approvalCommandCount: number
  catalogCommandCount: number
  previewCommandCount: number
  executeCommandCount: number
  executionCommandCount: number
  eventsCommandCount: number
  sideQueryCommandCount: number
  goalCommandCount: number
  blockedCommandCount: number
  errorCount: number
  quit: boolean
  activeSessionId: string | undefined
  sideQueryId: string | undefined
  sideQueryState: SideQueryReadModel["state"] | undefined
  planGenerationId: string | undefined
  planGenerationState: PlanGenerationReadModel["state"] | undefined
  planProposalId: string | undefined
  planProposalRevision: number | undefined
  goalId: string | undefined
  goalRevision: number | undefined
  goalState: GoalReadModel["state"] | undefined
}

export function createTuiLineSessionState(
  surface: TuiSurface
): TuiLineSessionState {
  return {
    handledLineCount: 0,
    commandCount: 0,
    askCommandCount: 0,
    steerCommandCount: 0,
    attachCommandCount: 0,
    selectCommandCount: 0,
    workbenchCommandCount: 0,
    operationCommandCount: 0,
    cancelCommandCount: 0,
    regenerateCommandCount: 0,
    approvalCommandCount: 0,
    catalogCommandCount: 0,
    previewCommandCount: 0,
    executeCommandCount: 0,
    executionCommandCount: 0,
    eventsCommandCount: 0,
    sideQueryCommandCount: 0,
    goalCommandCount: 0,
    blockedCommandCount: 0,
    errorCount: 0,
    quit: false,
    activeSessionId: selectedSessionIdFromSurface(surface),
    sideQueryId: undefined,
    sideQueryState: undefined,
    planGenerationId: undefined,
    planGenerationState: undefined,
    planProposalId: undefined,
    planProposalRevision: undefined,
    ...selectedGoal(surface)
  }
}

export function tuiLineSessionResult(
  state: TuiLineSessionState
): TuiLineSessionResult {
  return {
    kind: "tui.line-session",
    handledLineCount: state.handledLineCount,
    commandCount: state.commandCount,
    askCommandCount: state.askCommandCount,
    steerCommandCount: state.steerCommandCount,
    attachCommandCount: state.attachCommandCount,
    selectCommandCount: state.selectCommandCount,
    workbenchCommandCount: state.workbenchCommandCount,
    operationCommandCount: state.operationCommandCount,
    cancelCommandCount: state.cancelCommandCount,
    regenerateCommandCount: state.regenerateCommandCount,
    approvalCommandCount: state.approvalCommandCount,
    catalogCommandCount: state.catalogCommandCount,
    previewCommandCount: state.previewCommandCount,
    executeCommandCount: state.executeCommandCount,
    executionCommandCount: state.executionCommandCount,
    eventsCommandCount: state.eventsCommandCount,
    sideQueryCommandCount: state.sideQueryCommandCount,
    goalCommandCount: state.goalCommandCount,
    blockedCommandCount: state.blockedCommandCount,
    errorCount: state.errorCount,
    quit: state.quit,
    ...(state.activeSessionId === undefined
      ? {}
      : { activeSessionId: state.activeSessionId })
  }
}

function selectedGoal(surface: TuiSurface): {
  readonly goalId: string | undefined
  readonly goalRevision: number | undefined
  readonly goalState: GoalReadModel["state"] | undefined
} {
  const goal = surface.snapshot().goal
  if (!goal.ok || goal.value.kind !== "assistant.goal.found") {
    return { goalId: undefined, goalRevision: undefined, goalState: undefined }
  }
  return {
    goalId: goal.value.goal.goalId,
    goalRevision: goal.value.goal.revision,
    goalState: goal.value.goal.state
  }
}

function selectedSessionIdFromSurface(surface: TuiSurface): string | undefined {
  const status = surface.snapshot().status
  if (!status.ok) {
    return undefined
  }
  return selectedSessionId(status.value.state)
}
