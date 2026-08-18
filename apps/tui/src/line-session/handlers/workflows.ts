import { renderTuiConversationOperation } from "../../presentation/conversation.js"
import { renderTuiGoal } from "../../presentation/goal.js"
import {
  renderTuiPlanGeneration,
  renderTuiPlanProposal
} from "../../presentation/plan.js"
import { renderTuiSideQuery } from "../../presentation/side-query.js"
import { writeLine } from "../output.js"
import type { TuiLineSessionState } from "../state.js"
import type { TuiLineSessionOptions } from "../../model.js"
import { expectSurfaceValue } from "./result.js"

export async function runSideQueryCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly question: string
}): Promise<void> {
  const started = expectSurfaceValue(
    await options.sessionOptions.surface.client.startSideQuery({
      question: options.question
    }),
    "startSideQuery"
  )
  options.state.sideQueryCommandCount += 1
  await presentSideQuery(options, started, true)

  const current = expectSurfaceValue(
    await options.sessionOptions.surface.client.readSideQuery({
      queryId: started.queryId
    }),
    "readSideQuery"
  )
  if (current.kind === "product.side-query.missing") {
    options.state.sideQueryId = undefined
    options.state.sideQueryState = undefined
    throw new Error(`side query disappeared after start: ${started.queryId}`)
  }
  await presentSideQuery(options, current.query, false)
}

export async function runCancelSideQueryCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const queryId = requireSideQueryId(options.state)
  const cancelled = expectSurfaceValue(
    await options.sessionOptions.surface.client.cancelSideQuery({ queryId }),
    "cancelSideQuery"
  )
  options.state.sideQueryCommandCount += 1
  await presentSideQuery(options, cancelled, true)
}

export async function runDismissSideQueryCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const queryId = requireSideQueryId(options.state)
  const dismissed = expectSurfaceValue(
    await options.sessionOptions.surface.client.dismissSideQuery({ queryId }),
    "dismissSideQuery"
  )
  options.state.sideQueryCommandCount += 1
  options.state.sideQueryId = undefined
  options.state.sideQueryState = undefined
  await writeLine(
    options.sessionOptions,
    `side-query:dismissed:${dismissed.queryId}`
  )
}

export async function reconcileTuiSideQueryInvalidation(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly queryId: string
}): Promise<void> {
  if (options.state.sideQueryId !== options.queryId) return
  const current = expectSurfaceValue(
    await options.sessionOptions.surface.client.readSideQuery({
      queryId: options.queryId
    }),
    "readSideQuery"
  )
  if (current.kind === "product.side-query.missing") {
    options.state.sideQueryId = undefined
    options.state.sideQueryState = undefined
    return
  }
  await presentSideQuery(options, current.query, false)
}

async function presentSideQuery(
  options: {
    readonly sessionOptions: TuiLineSessionOptions
    readonly state: TuiLineSessionState
  },
  query: Parameters<typeof renderTuiSideQuery>[0],
  force: boolean
): Promise<void> {
  const unchanged =
    options.state.sideQueryId === query.queryId &&
    options.state.sideQueryState === query.state
  options.state.sideQueryId = query.queryId
  options.state.sideQueryState = query.state
  if (!force && unchanged) return
  await writeLine(
    options.sessionOptions,
    renderTuiSideQuery(query).text
  )
}

function requireSideQueryId(state: TuiLineSessionState): string {
  if (state.sideQueryId === undefined) {
    throw new Error("no side query is retained in this TUI session")
  }
  return state.sideQueryId
}

export async function runPlanGenerationCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly text: string
}): Promise<void> {
  const generation = expectSurfaceValue(
    await options.sessionOptions.surface.client.startPlanGeneration({
      text: options.text,
      ...(options.state.activeSessionId === undefined
        ? {}
        : { sessionId: options.state.activeSessionId })
    }),
    "startPlanGeneration"
  )
  rememberPlanGeneration(options.state, generation)
  await writeLine(
    options.sessionOptions,
    renderTuiPlanGeneration(generation)
  )
}

export async function runShowPlanCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.readPlanProposal(
      options.state.planProposalId === undefined
        ? undefined
        : { proposalId: options.state.planProposalId }
    ),
    "readPlanProposal"
  )
  rememberPlanProposal(options.state, result)
  await writeLine(
    options.sessionOptions,
    renderTuiPlanProposal(result)
  )
}

export async function runCancelPlanGenerationCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const operationId = requirePlanGenerationId(options.state)
  const generation = expectSurfaceValue(
    await options.sessionOptions.surface.client.cancelPlanGeneration({
      operationId
    }),
    "cancelPlanGeneration"
  )
  rememberPlanGeneration(options.state, generation)
  await writeLine(
    options.sessionOptions,
    renderTuiPlanGeneration(generation)
  )
}

export async function runDismissPlanGenerationCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const operationId = requirePlanGenerationId(options.state)
  const dismissed = expectSurfaceValue(
    await options.sessionOptions.surface.client.dismissPlanGeneration({
      operationId
    }),
    "dismissPlanGeneration"
  )
  options.state.planGenerationId = undefined
  options.state.planGenerationState = undefined
  await writeLine(
    options.sessionOptions,
    `plan-generation:dismissed:${dismissed.operationId}`
  )
}

export async function runPlanDecisionCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly decision: "approve" | "reject" | "withdraw"
  readonly reason?: string
}): Promise<void> {
  const identity = requirePlanProposalIdentity(options.state)
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.decidePlanProposal({
      ...identity,
      decision: options.decision,
      ...(options.reason === undefined ? {} : { reason: options.reason })
    }),
    "decidePlanProposal"
  )
  rememberPlanProposal(options.state, result)
  await writeLine(
    options.sessionOptions,
    renderTuiPlanProposal(result)
  )
}

export async function runExecutePlanCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const identity = requirePlanProposalIdentity(options.state)
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.executePlanProposal(identity),
    "executePlanProposal"
  )
  options.state.planProposalId = result.proposal.proposalId
  options.state.planProposalRevision = result.proposal.revision
  options.state.activeSessionId = result.proposal.source.sessionId
  await writeLine(
    options.sessionOptions,
    renderTuiPlanProposal({
      kind: "product.plan-proposal.found",
      proposal: result.proposal
    })
  )
  await writeLine(
    options.sessionOptions,
    renderTuiConversationOperation(result.operation).text
  )
}

export async function reconcileTuiPlanInvalidation(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly operationId?: string
  readonly proposalId?: string
}): Promise<void> {
  if (
    options.operationId !== undefined &&
    options.state.planGenerationId === options.operationId
  ) {
    const result = expectSurfaceValue(
      await options.sessionOptions.surface.client.readPlanGeneration({
        operationId: options.operationId
      }),
      "readPlanGeneration"
    )
    if (result.kind === "product.plan-generation.found") {
      const changed =
        options.state.planGenerationState !== result.generation.state
      rememberPlanGeneration(options.state, result.generation)
      if (changed) {
        await writeLine(
          options.sessionOptions,
          renderTuiPlanGeneration(result.generation)
        )
      }
    }
  }
  const proposalId = options.proposalId ?? options.state.planProposalId
  if (proposalId === undefined) return
  const proposal = expectSurfaceValue(
    await options.sessionOptions.surface.client.readPlanProposal({ proposalId }),
    "readPlanProposal"
  )
  rememberPlanProposal(options.state, proposal)
  await writeLine(
    options.sessionOptions,
    renderTuiPlanProposal(proposal)
  )
}

function rememberPlanGeneration(
  state: TuiLineSessionState,
  generation: Parameters<typeof renderTuiPlanGeneration>[0]
): void {
  state.planGenerationId = generation.operationId
  state.planGenerationState = generation.state
  if (generation.proposalId !== undefined) {
    state.planProposalId = generation.proposalId
  }
}

function rememberPlanProposal(
  state: TuiLineSessionState,
  proposal: Parameters<typeof renderTuiPlanProposal>[0]
): void {
  if (proposal.kind !== "product.plan-proposal.found") return
  state.planProposalId = proposal.proposal.proposalId
  state.planProposalRevision = proposal.proposal.revision
}

function requirePlanGenerationId(state: TuiLineSessionState): string {
  if (state.planGenerationId === undefined) {
    throw new Error("no Plan generation is retained in this TUI session")
  }
  return state.planGenerationId
}

function requirePlanProposalIdentity(
  state: TuiLineSessionState
): { readonly proposalId: string; readonly expectedRevision: number } {
  if (
    state.planProposalId === undefined ||
    state.planProposalRevision === undefined
  ) {
    throw new Error("no Plan proposal is retained in this TUI session")
  }
  return {
    proposalId: state.planProposalId,
    expectedRevision: state.planProposalRevision
  }
}

export async function runReadGoalCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
}): Promise<void> {
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.readGoal(
      options.state.goalId !== undefined
        ? { goalId: options.state.goalId }
        : options.state.activeSessionId === undefined
          ? undefined
          : { sessionId: options.state.activeSessionId }
    ),
    "readGoal"
  )
  options.state.goalCommandCount += 1
  rememberGoal(options.state, result)
  await writeLine(options.sessionOptions, renderTuiGoal(result))
}

export async function runStartGoalCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly input: Parameters<
    TuiLineSessionOptions["surface"]["client"]["startGoal"]
  >[0]
}): Promise<void> {
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.startGoal({
      ...options.input,
      ...(options.input.sessionId !== undefined
        ? {}
        : options.state.activeSessionId === undefined
          ? {}
          : { sessionId: options.state.activeSessionId })
    }),
    "startGoal"
  )
  options.state.goalCommandCount += 1
  options.state.activeSessionId = result.sessionId
  rememberGoal(options.state, result)
  await writeLine(options.sessionOptions, renderTuiGoal(result))
}

export async function runChangeGoalStateCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly command: "goal-pause" | "goal-resume"
  readonly reason?: string
}): Promise<void> {
  const identity = requireGoalIdentity(options.state)
  const request = {
    ...identity,
    ...(options.reason === undefined ? {} : { reason: options.reason })
  }
  const result = expectSurfaceValue(
    options.command === "goal-pause"
      ? await options.sessionOptions.surface.client.pauseGoal(request)
      : await options.sessionOptions.surface.client.resumeGoal(request),
    options.command === "goal-pause" ? "pauseGoal" : "resumeGoal"
  )
  options.state.goalCommandCount += 1
  rememberGoal(options.state, result)
  await writeLine(options.sessionOptions, renderTuiGoal(result))
}

export async function runCancelGoalCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly reason: string
}): Promise<void> {
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.cancelGoal({
      ...requireGoalIdentity(options.state),
      reason: options.reason
    }),
    "cancelGoal"
  )
  options.state.goalCommandCount += 1
  rememberGoal(options.state, result)
  await writeLine(options.sessionOptions, renderTuiGoal(result))
}

export async function reconcileTuiGoalInvalidation(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly goalId: string
  readonly sessionId: string
}): Promise<void> {
  if (options.state.activeSessionId !== options.sessionId) return
  const result = expectSurfaceValue(
    await options.sessionOptions.surface.client.readGoal({
      goalId: options.goalId,
      sessionId: options.sessionId
    }),
    "readGoal"
  )
  const previousRevision = options.state.goalRevision
  const previousState = options.state.goalState
  rememberGoal(options.state, result)
  if (
    result.kind === "product.goal.found" &&
    (result.goal.revision !== previousRevision || result.goal.state !== previousState)
  ) {
    await writeLine(options.sessionOptions, renderTuiGoal(result))
  }
}

function rememberGoal(
  state: TuiLineSessionState,
  result: Parameters<typeof renderTuiGoal>[0]
): void {
  if (result.kind === "product.goal.found") {
    state.goalId = result.goal.goalId
    state.goalRevision = result.goal.revision
    state.goalState = result.goal.state
    return
  }
  if (result.kind === "product.goal") {
    state.goalId = result.goalId
    state.goalRevision = result.revision
    state.goalState = result.state
    return
  }
  state.goalId = undefined
  state.goalRevision = undefined
  state.goalState = undefined
}

function requireGoalIdentity(
  state: TuiLineSessionState
): { readonly goalId: string; readonly expectedRevision: number } {
  if (state.goalId === undefined || state.goalRevision === undefined) {
    throw new Error("no Goal is retained in this TUI session")
  }
  return { goalId: state.goalId, expectedRevision: state.goalRevision }
}
