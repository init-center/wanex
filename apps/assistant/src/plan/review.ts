import { randomUUID } from "node:crypto"
import type { WanexAppPlanProposalView } from "@wanex/app"
import type {
  PlanProposalRecord,
  PlanProposalReference,
  PlanProposalStep
} from "@wanex/protocol"
import type {
  BackendShell,
  BackendPlanCommands
} from "@wanex/assistant/backend"
import { readTrackedConversationOperation } from "../conversation/operation.js"
import {
  copyState,
  stateSnapshot,
  resolveSessionId,
  selectedSessionId,
  withTrackedConversationOperation,
  type StateCoordinator
} from "../state/assistant.js"
import type {
  DecidePlanProposalRequest,
  ExecutePlanProposalRequest,
  ExecutePlanProposalResult,
  ListPlanProposalsRequest,
  PlanProposalListReadModel,
  PlanProposalReadModel,
  ReadPlanProposalRequest,
  ReadPlanProposalResult,
  RevisePlanProposalRequest,
  SelectPlanProposalRequest
} from "./model.js"
import type { StateSnapshot } from "../model.js"

const PLAN_ACTOR_ID = "assistant-user"
const DEFAULT_PLAN_LIST_LIMIT = 50
const MAX_PLAN_LIST_LIMIT = 200

type PlanBackend = BackendShell & {
  readonly commands: BackendShell["commands"] &
    BackendPlanCommands
}

export async function selectPlanProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input: SelectPlanProposalRequest
}): Promise<StateSnapshot> {
  const proposalId = normalizeIdentity(request.input.proposalId, "proposalId")
  const selectedSession = selectedSessionId(request.state.state)
  if (selectedSession === undefined) {
    throw new Error("select a Session before selecting a Plan proposal")
  }
  const view = await request.backend.commands.readPlanProposal({ proposalId })
  if (view === null) {
    throw new Error(`Plan proposal does not exist: ${proposalId}`)
  }
  if (view.proposal.source.sessionId !== selectedSession) {
    throw new Error("Plan proposal does not belong to the selected Session")
  }
  return await request.state.mutate(async (state) => {
    const next = copyState(state)
    next.selectedPlanProposalId = proposalId
    return { value: stateSnapshot(next), next }
  })
}

export async function clearPlanProposalSelection(
  state: StateCoordinator
): Promise<StateSnapshot> {
  return await state.mutate(async (current) => {
    const next = copyState(current)
    delete next.selectedPlanProposalId
    return { value: stateSnapshot(next), next }
  })
}

export async function readPlanProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input?: ReadPlanProposalRequest
}): Promise<ReadPlanProposalResult> {
  const proposalId = resolveProposalId(
    request.state.state.selectedPlanProposalId,
    request.input?.proposalId
  )
  if (proposalId === undefined) {
    return { kind: "assistant.plan-proposal.no-selection" }
  }
  const view = await request.backend.commands.readPlanProposal({ proposalId })
  if (view === null) {
    return { kind: "assistant.plan-proposal.missing", proposalId }
  }
  return {
    kind: "assistant.plan-proposal.found",
    proposal: projectPlanProposal(view)
  }
}

export async function listPlanProposals(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input?: ListPlanProposalsRequest
}): Promise<PlanProposalListReadModel> {
  const sessionId = resolveSessionId(
    request.state.state,
    request.input?.sessionId
  )
  if (sessionId === undefined) {
    throw new Error("select a Session before listing Plan proposals")
  }
  const limit = normalizeListLimit(request.input?.limit)
  const proposals = await request.backend.commands.listPlanProposals({
    sourceSessionId: sessionId,
    limit
  })
  const views = await Promise.all(
    proposals.map(async (proposal) =>
      await request.backend.commands.readPlanProposal({ proposalId: proposal.id })
    )
  )
  return {
    kind: "assistant.plan-proposal-list",
    sessionId,
    proposals: views
      .filter((view): view is NonNullable<typeof view> => view !== null)
      .map(projectPlanProposal)
  }
}

export async function revisePlanProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input: RevisePlanProposalRequest
}): Promise<ReadPlanProposalResult> {
  const proposal = await requireSelectedProposal(request)
  await request.backend.commands.revisePlanProposal({
    proposalId: proposal.id,
    expectedRevision: normalizeRevision(request.input.expectedRevision),
    actorId: PLAN_ACTOR_ID,
    content: {
      title: request.input.title,
      summary: request.input.summary,
      steps: copyPlanSteps(request.input.steps),
      references:
        request.input.references === undefined
          ? copyPlanReferences(proposal.references)
          : copyPlanReferences(request.input.references)
    },
    ...(request.input.reason === undefined
      ? {}
      : { reason: request.input.reason }),
    idempotencyKey: idempotencyKey(
      request.input.idempotencyKey,
      "revise",
      proposal.id
    )
  })
  return await readPlanProposal({
    backend: request.backend,
    state: request.state,
    input: { proposalId: proposal.id }
  })
}

export async function decidePlanProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input: DecidePlanProposalRequest
}): Promise<ReadPlanProposalResult> {
  const proposal = await requireSelectedProposal(request)
  const decision = request.input.decision
  const command =
    decision === "approve"
      ? request.backend.commands.approvePlanProposal
      : decision === "reject"
        ? request.backend.commands.rejectPlanProposal
        : request.backend.commands.withdrawPlanProposal
  await command({
    proposalId: proposal.id,
    expectedRevision: normalizeRevision(request.input.expectedRevision),
    actorId: PLAN_ACTOR_ID,
    ...(request.input.reason === undefined
      ? {}
      : { reason: request.input.reason }),
    idempotencyKey: idempotencyKey(
      request.input.idempotencyKey,
      decision,
      proposal.id
    )
  })
  return await readPlanProposal({
    backend: request.backend,
    state: request.state,
    input: { proposalId: proposal.id }
  })
}

export async function executePlanProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input: ExecutePlanProposalRequest
}): Promise<ExecutePlanProposalResult> {
  const proposal = await requireSelectedProposal(request)
  const receipt = await request.backend.commands.executePlanProposal({
    proposalId: proposal.id,
    expectedRevision: normalizeRevision(request.input.expectedRevision),
    idempotencyKey: idempotencyKey(
      request.input.idempotencyKey,
      "execute",
      proposal.id
    ),
    ...(request.input.maxSteps === undefined
      ? {}
      : { maxSteps: request.input.maxSteps })
  })
  const reference = {
    sessionId: receipt.submission.admission.sessionId,
    inputId: receipt.submission.admission.inputId,
    turnId: receipt.submission.turn.id,
    jobId: receipt.submission.job.id
  }
  await request.state.mutate(async (state) => {
    const next = withTrackedConversationOperation(state, reference)
    next.selectedPlanProposalId = proposal.id
    return { value: undefined, next }
  })
  const [canonical, operation] = await Promise.all([
    request.backend.commands.readPlanProposal({ proposalId: proposal.id }),
    readTrackedConversationOperation({
      backend: request.backend,
      state: request.state,
      input: { sessionId: reference.sessionId }
    })
  ])
  if (canonical === null) {
    throw new Error(`executed Plan proposal disappeared: ${proposal.id}`)
  }
  return {
    kind: "assistant.plan-execution.submitted",
    proposal: projectPlanProposal(canonical),
    operation
  }
}

async function requireSelectedProposal(request: {
  readonly backend: PlanBackend
  readonly state: StateCoordinator
  readonly input: { readonly proposalId?: string }
}): Promise<PlanProposalRecord> {
  const proposalId = resolveProposalId(
    request.state.state.selectedPlanProposalId,
    request.input.proposalId
  )
  if (proposalId === undefined) {
    throw new Error("select a Plan proposal first")
  }
  const view = await request.backend.commands.readPlanProposal({ proposalId })
  if (view === null) {
    throw new Error(`Plan proposal does not exist: ${proposalId}`)
  }
  const selectedSession = selectedSessionId(request.state.state)
  if (
    selectedSession === undefined ||
    view.proposal.source.sessionId !== selectedSession
  ) {
    throw new Error("Plan proposal does not belong to the selected Session")
  }
  return view.proposal
}

function projectPlanProposal(
  view: WanexAppPlanProposalView
): PlanProposalReadModel {
  const proposal = view.proposal
  return {
    kind: "assistant.plan-proposal",
    proposalId: proposal.id,
    revision: proposal.revision,
    state: proposal.state,
    title: proposal.title,
    summary: proposal.summary,
    steps: copyPlanSteps(proposal.steps),
    references: copyPlanReferences(proposal.references),
    source: {
      sessionId: proposal.source.sessionId,
      headSequence: proposal.source.headSequence
    },
    generation: {
      endpointId: proposal.generation.endpointId,
      providerId: proposal.generation.providerId,
      modelId: proposal.generation.modelId,
      generatedAt: proposal.generation.generatedAt
    },
    ...(view.execution === undefined
      ? {}
      : {
          execution: {
            inputId: view.execution.input.id,
            turnId: view.execution.turn.id,
            jobId: view.execution.job.id,
            inputState: view.execution.input.status,
            turnState: view.execution.turn.state,
            jobState: view.execution.job.state,
            boundAt: proposal.execution!.boundAt
          }
        }),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    ...(proposal.decidedAt === undefined
      ? {}
      : { decidedAt: proposal.decidedAt })
  }
}

function copyPlanSteps(
  steps: readonly PlanProposalStep[]
): readonly PlanProposalStep[] {
  return steps.map((step) => ({ ...step }))
}

function copyPlanReferences(
  references: readonly PlanProposalReference[]
): readonly PlanProposalReference[] {
  return references.map((reference) => ({ ...reference }))
}

function resolveProposalId(
  selected: string | undefined,
  requested: string | undefined
): string | undefined {
  const value = requested ?? selected
  return value === undefined ? undefined : normalizeIdentity(value, "proposalId")
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 500) {
    throw new Error(`${label} must contain 1..=500 characters`)
  }
  return normalized
}

function normalizeRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Plan expectedRevision must be a positive integer")
  }
  return value
}

function normalizeListLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PLAN_LIST_LIMIT
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_PLAN_LIST_LIMIT) {
    throw new Error(`Plan list limit must be an integer from 1 to ${MAX_PLAN_LIST_LIMIT}`)
  }
  return limit
}

function idempotencyKey(
  supplied: string | undefined,
  operation: string,
  proposalId: string
): string {
  return supplied === undefined
    ? `assistant:plan:${operation}:${proposalId}:${randomUUID()}`
    : normalizeIdentity(supplied, "idempotencyKey")
}
