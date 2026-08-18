import { randomUUID } from "node:crypto"
import type {
  ExecuteApprovedPlanReceipt,
  PlanProposalOperationKind,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  RuntimeAbortSignal,
  SubmitSessionTurnRequest
} from "@wanex/protocol"
import {
  assertPlanContent,
  parseGeneratedPlanContent,
  planExecutionText,
  planGenerationPrompt
} from "./content.js"
import type {
  DecidePlanProposalRequest,
  ExecutePlanProposalRequest,
  GeneratePlanProposalRequest,
  ListPlanProposalsRuntimeRequest,
  PlanExecutionProjection,
  PlanProposalHistory,
  PlanProposalView,
  PlanWorkflowOptions,
  RevisePlanProposalRequest
} from "./types.js"

const DEFAULT_PRINCIPAL_ID = "app-plan-workflow"
const DEFAULT_MAX_OUTPUT_TOKENS = 4096
const MAX_PLANNING_REQUEST_BYTES = 256 * 1024

export class PlanWorkflow {
  private readonly storage: PlanWorkflowOptions["storage"]
  private readonly runtime: PlanWorkflowOptions["runtime"]
  private readonly principalId: string
  private readonly activeGenerations = new Set<AbortController>()
  private disposed = false

  constructor(options: PlanWorkflowOptions) {
    this.storage = options.storage
    this.runtime = options.runtime
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async generateProposal(
    request: GeneratePlanProposalRequest
  ): Promise<PlanProposalRecord> {
    this.assertActive()
    validateGenerateRequest(request)
    await this.requireIdleSourceSession(request.sessionId)
    const controller = new AbortController()
    const unlink = linkAbortSignal(request.signal, controller)
    this.activeGenerations.add(controller)
    try {
      const result = await this.runtime.runEphemeralQuery({
        sessionId: request.sessionId,
        principalId: request.principalId ?? this.principalId,
        ...(request.modelEndpointId === undefined
          ? {}
          : { modelEndpointId: request.modelEndpointId }),
        question: [
          {
            id: `part_plan_prompt_${randomUUID()}`,
            type: "text",
            text: planGenerationPrompt(),
            visibility: "internal"
          },
          ...request.planningRequest
        ],
        toolPolicy: "none",
        memoryPolicy: "exclude",
        persistence: "none",
        maxOutputTokens:
          request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        signal: controller.signal
      })
      const source = result.evidence.source
      if (source === undefined || source.sessionId !== request.sessionId) {
        throw new Error("plan generation did not return exact Session source evidence")
      }
      const content = parseGeneratedPlanContent(
        result.output,
        request.references ?? []
      )
      return await this.storage.createPlanProposal({
        ...(request.id === undefined ? {} : { id: request.id }),
        principalId: request.principalId ?? this.principalId,
        source: {
          sessionId: source.sessionId,
          headSequence: source.headSequence,
          ...(source.headMessageId === undefined
            ? {}
            : { headMessageId: source.headMessageId }),
          ...(source.headTurnId === undefined
            ? {}
            : { headTurnId: source.headTurnId }),
          analysisInputDigest: result.evidence.inputDigest,
          planningRequest: request.planningRequest
        },
        generation: {
          ...result.evidence.provider,
          generatedAt: result.evidence.completedAt,
          outputDigest: result.evidence.outputDigest,
          output: result.output
        },
        ...content,
        idempotencyKey: request.idempotencyKey
      })
    } finally {
      unlink()
      this.activeGenerations.delete(controller)
    }
  }

  async reviseProposal(
    request: RevisePlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    this.assertActive()
    assertPlanContent(request.content)
    return await this.storage.recordPlanProposalOperation({
      ...(request.operationId === undefined ? {} : { id: request.operationId }),
      proposalId: request.proposalId,
      operation: "revise",
      expectedRevision: request.expectedRevision,
      actor: { kind: "human", id: request.actorId },
      content: request.content,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      idempotencyKey: request.idempotencyKey
    })
  }

  async approveProposal(
    request: DecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordDecision(request, "approve")
  }

  async rejectProposal(
    request: DecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordDecision(request, "reject")
  }

  async withdrawProposal(
    request: DecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordDecision(request, "withdraw")
  }

  async executeProposal(
    request: ExecutePlanProposalRequest
  ): Promise<ExecuteApprovedPlanReceipt> {
    this.assertActive()
    validateExecuteRequest(request)
    const proposal = await this.storage.getPlanProposal({
      proposalId: request.proposalId
    })
    if (proposal === null) {
      throw new Error(`plan proposal not found: ${request.proposalId}`)
    }
    if (proposal.revision !== request.expectedRevision) {
      throw new Error(
        `plan proposal revision changed: ${proposal.id} expected ${request.expectedRevision} actual ${proposal.revision}`
      )
    }
    if (proposal.state !== "approved") {
      throw new Error(`plan proposal is not approved: ${proposal.id}`)
    }
    if (proposal.execution !== undefined) {
      const projection = await this.requireExecutionProjection(proposal)
      return await this.storage.executeApprovedPlan({
        proposalId: proposal.id,
        expectedRevision: request.expectedRevision,
        idempotencyKey: request.idempotencyKey,
        turn: retryTurnFromProjection(projection)
      })
    }

    const prepared = await this.runtime.prepareUserTurn({
      sessionId: proposal.source.sessionId,
      principalId: request.principalId ?? this.principalId,
      idempotencyKey: `plan:${proposal.id}:${request.idempotencyKey}:input`,
      jobIdempotencyKey: `plan:${proposal.id}:${request.idempotencyKey}:job`,
      ...(request.modelEndpointId === undefined
        ? {}
        : { modelEndpointId: request.modelEndpointId }),
      ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
      origin: { kind: "plan", sourceRef: proposal.id },
      content: [
        {
          type: "text",
          text: planExecutionText(proposal)
        }
      ]
    })
    if (prepared.session.id !== proposal.source.sessionId) {
      throw new Error("prepared Plan execution changed the source Session")
    }
    const receipt = await this.storage.executeApprovedPlan({
      proposalId: proposal.id,
      expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey,
      turn: prepared.request
    })
    this.runtime.wake()
    return receipt
  }

  async getProposal(proposalId: string): Promise<PlanProposalView | null> {
    this.assertActive()
    const proposal = await this.storage.getPlanProposal({ proposalId })
    if (proposal === null) {
      return null
    }
    return {
      proposal,
      ...(proposal.execution === undefined
        ? {}
        : { execution: await this.requireExecutionProjection(proposal) })
    }
  }

  async listProposals(
    request: ListPlanProposalsRuntimeRequest = {}
  ): Promise<PlanProposalRecord[]> {
    this.assertActive()
    return await this.storage.listPlanProposals({
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
      ...(request.sourceSessionId === undefined
        ? {}
        : { sourceSessionId: request.sourceSessionId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.referenceKind === undefined
        ? {}
        : { referenceKind: request.referenceKind }),
      ...(request.referenceId === undefined
        ? {}
        : { referenceId: request.referenceId }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async getHistory(proposalId: string): Promise<PlanProposalHistory | null> {
    this.assertActive()
    const view = await this.getProposal(proposalId)
    if (view === null) {
      return null
    }
    const operations = await this.storage.listPlanProposalOperations({
      proposalId
    })
    return { view, operations }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const controller of this.activeGenerations) {
      controller.abort()
    }
    this.activeGenerations.clear()
  }

  private async recordDecision(
    request: DecidePlanProposalRequest,
    operation: Exclude<PlanProposalOperationKind, "revise">
  ): Promise<PlanProposalOperationRecord> {
    this.assertActive()
    return await this.storage.recordPlanProposalOperation({
      ...(request.operationId === undefined ? {} : { id: request.operationId }),
      proposalId: request.proposalId,
      operation,
      expectedRevision: request.expectedRevision,
      actor: { kind: "human", id: request.actorId },
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      idempotencyKey: request.idempotencyKey
    })
  }

  private async requireIdleSourceSession(sessionId: string): Promise<void> {
    const session = await this.storage.getSession(sessionId)
    if (session === null) {
      throw new Error(`plan source Session not found: ${sessionId}`)
    }
    if (session.status !== "active") {
      throw new Error(`plan source Session is not active: ${sessionId}`)
    }
    const [inputs, turns] = await Promise.all([
      this.storage.listSessionInputs({ sessionId }),
      this.storage.listSessionTurns({ sessionId })
    ])
    if (
      inputs.some((input) =>
        ["admitted", "control_pending", "promoted"].includes(input.status)
      ) ||
      turns.some((turn) =>
        ["queued", "running", "cancel_requested"].includes(turn.state)
      )
    ) {
      throw new Error(`plan source Session has unfinished work: ${sessionId}`)
    }
  }

  private async requireExecutionProjection(
    proposal: PlanProposalRecord
  ): Promise<PlanExecutionProjection> {
    const binding = proposal.execution
    if (binding === undefined) {
      throw new Error(`plan proposal has no execution binding: ${proposal.id}`)
    }
    const [inputs, turns, job] = await Promise.all([
      this.storage.listSessionInputs({ sessionId: proposal.source.sessionId }),
      this.storage.listSessionTurns({ sessionId: proposal.source.sessionId }),
      this.storage.getJob({ jobId: binding.jobId })
    ])
    const input = inputs.find((candidate) => candidate.id === binding.inputId)
    const turn = turns.find((candidate) => candidate.id === binding.turnId)
    if (input === undefined || turn === undefined || job === null) {
      throw new Error(`plan execution canonical records are incomplete: ${proposal.id}`)
    }
    if (
      turn.primaryInputId !== input.id ||
      turn.jobId !== job.id ||
      turn.executionBinding.digest !== binding.executionBindingDigest
    ) {
      throw new Error(`plan execution canonical binding is inconsistent: ${proposal.id}`)
    }
    return { input, turn, job }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("plan workflow is disposed")
    }
  }
}

function validateGenerateRequest(request: GeneratePlanProposalRequest): void {
  if (request.sessionId.length === 0 || request.idempotencyKey.length === 0) {
    throw new Error("plan generation requires Session and idempotency identities")
  }
  if (request.planningRequest.length === 0) {
    throw new Error("plan generation planningRequest must not be empty")
  }
  if (
    Buffer.byteLength(JSON.stringify(request.planningRequest), "utf8") >
    MAX_PLANNING_REQUEST_BYTES
  ) {
    throw new Error(
      `plan generation planningRequest exceeds ${MAX_PLANNING_REQUEST_BYTES} bytes`
    )
  }
  const maxOutputTokens =
    request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error("plan generation maxOutputTokens must be a positive integer")
  }
}

function validateExecuteRequest(request: ExecutePlanProposalRequest): void {
  if (
    request.proposalId.length === 0 ||
    request.idempotencyKey.length === 0 ||
    !Number.isSafeInteger(request.expectedRevision) ||
    request.expectedRevision <= 0
  ) {
    throw new Error(
      "plan execution requires proposal, revision, and idempotency identities"
    )
  }
  if (
    request.maxSteps !== undefined &&
    (!Number.isSafeInteger(request.maxSteps) || request.maxSteps <= 0)
  ) {
    throw new Error("plan execution maxSteps must be a positive integer")
  }
}

function retryTurnFromProjection(
  projection: PlanExecutionProjection
): SubmitSessionTurnRequest {
  return {
    id: projection.input.id,
    turnId: projection.turn.id,
    sessionId: projection.input.sessionId,
    principalId: projection.input.principalId,
    idempotencyKey: projection.input.idempotencyKey,
    content: projection.input.content,
    inputType: projection.input.inputType,
    ...(projection.input.origin === undefined
      ? {}
      : { origin: projection.input.origin }),
    ...(projection.input.intent === undefined
      ? {}
      : { intent: projection.input.intent }),
    ...(projection.input.runControlPolicy === undefined
      ? {}
      : { runControlPolicy: projection.input.runControlPolicy }),
    ...(projection.input.expectedTurnId === undefined
      ? {}
      : { expectedTurnId: projection.input.expectedTurnId }),
    jobId: projection.job.id,
    ...(projection.job.idempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: projection.job.idempotencyKey }),
    executionBinding: projection.turn.executionBinding,
    maxSteps: projection.turn.maxSteps,
    ...(projection.turn.regeneratesTurnId === undefined
      ? {}
      : { regeneratesTurnId: projection.turn.regeneratesTurnId }),
    priority: projection.job.priority,
    ...(projection.job.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: projection.job.budgetGrantId })
  }
}

function linkAbortSignal(
  signal: RuntimeAbortSignal | undefined,
  controller: AbortController
): () => void {
  if (signal === undefined) {
    return () => undefined
  }
  const abort = (): void => controller.abort()
  if (signal.aborted) {
    abort()
  } else {
    signal.addEventListener("abort", abort, { once: true })
  }
  return () => signal.removeEventListener("abort", abort)
}
