import type {
  ObjectiveAttemptRecord,
  ObjectiveRunOperationKind,
  ObjectiveRunOperationRecord,
  ObjectiveRunRecord,
  ObjectiveVerificationRecord,
  PrincipalId
} from "@wanex/protocol"
import type { ObjectiveStore } from "@wanex/storage/objective"
import type {
  CreateObjectiveRequest,
  ListObjectivesRuntimeRequest,
  ObjectiveHistory,
  ObjectiveOperationRequest,
  RecordObjectiveAttemptRequest,
  RecordObjectiveVerificationRequest,
  ObjectiveWorkflowOptions
} from "./types.js"

const DEFAULT_PRINCIPAL_ID = "app-objective-workflow"

export class ObjectiveWorkflow {
  private readonly storage: ObjectiveStore
  private readonly principalId: PrincipalId

  constructor(options: ObjectiveWorkflowOptions) {
    this.storage = options.storage
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createObjective(
    request: CreateObjectiveRequest
  ): Promise<ObjectiveRunRecord> {
    return await this.storage.putObjectiveRun({
      ...(request.id === undefined ? {} : { id: request.id }),
      principalId: request.principalId ?? this.principalId,
      objective: request.objective,
      ...(request.scope === undefined ? {} : { scope: request.scope }),
      ...(request.constraints === undefined
        ? {}
        : { constraints: request.constraints }),
      ...(request.successCriteria === undefined
        ? {}
        : { successCriteria: request.successCriteria }),
      ...(request.stopPolicy === undefined
        ? {}
        : { stopPolicy: request.stopPolicy }),
      ...(request.references === undefined
        ? {}
        : { references: request.references }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async startObjective(
    request: ObjectiveOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.recordOperation(request, "start")
  }

  async recordBlocked(
    request: ObjectiveOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.recordOperation(request, "record_blocked")
  }

  async markSucceeded(
    request: ObjectiveOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.recordOperation(request, "mark_succeeded")
  }

  async markFailed(
    request: ObjectiveOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.recordOperation(request, "mark_failed")
  }

  async cancelObjective(
    request: ObjectiveOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.recordOperation(request, "cancel")
  }

  async recordAttempt(
    request: RecordObjectiveAttemptRequest
  ): Promise<ObjectiveAttemptRecord> {
    return await this.storage.putObjectiveAttempt({
      ...(request.id === undefined ? {} : { id: request.id }),
      objectiveId: request.objectiveId,
      ...(request.attemptNumber === undefined
        ? {}
        : { attemptNumber: request.attemptNumber }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      ...(request.sessionInputId === undefined
        ? {}
        : { sessionInputId: request.sessionInputId }),
      ...(request.sessionRunId === undefined
        ? {}
        : { sessionRunId: request.sessionRunId }),
      ...(request.schedulerJobId === undefined
        ? {}
        : { schedulerJobId: request.schedulerJobId }),
      ...(request.delegationGraphId === undefined
        ? {}
        : { delegationGraphId: request.delegationGraphId }),
      ...(request.planProposalId === undefined
        ? {}
        : { planProposalId: request.planProposalId }),
      ...(request.workspaceChangeProposalId === undefined
        ? {}
        : { workspaceChangeProposalId: request.workspaceChangeProposalId }),
      ...(request.summary === undefined ? {} : { summary: request.summary }),
      ...(request.result === undefined ? {} : { result: request.result }),
      ...(request.error === undefined ? {} : { error: request.error }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.startedAt === undefined ? {} : { startedAt: request.startedAt }),
      ...(request.finishedAt === undefined
        ? {}
        : { finishedAt: request.finishedAt }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async recordVerification(
    request: RecordObjectiveVerificationRequest
  ): Promise<ObjectiveVerificationRecord> {
    return await this.storage.putObjectiveVerification({
      ...(request.id === undefined ? {} : { id: request.id }),
      objectiveId: request.objectiveId,
      ...(request.attemptId === undefined ? {} : { attemptId: request.attemptId }),
      kind: request.kind,
      state: request.state,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
      ...(request.verifierRef === undefined
        ? {}
        : { verifierRef: request.verifierRef }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async getObjective(objectiveId: string): Promise<ObjectiveRunRecord | null> {
    return await this.storage.getObjectiveRun({ objectiveId })
  }

  async listObjectives(
    request: ListObjectivesRuntimeRequest = {}
  ): Promise<ObjectiveRunRecord[]> {
    return await this.storage.listObjectiveRuns({
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
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

  async getHistory(objectiveId: string): Promise<ObjectiveHistory | null> {
    const objective = await this.storage.getObjectiveRun({ objectiveId })
    if (objective === null) {
      return null
    }
    const [operations, attempts, verifications] = await Promise.all([
      this.storage.listObjectiveRunOperations({ objectiveId }),
      this.storage.listObjectiveAttempts({ objectiveId }),
      this.storage.listObjectiveVerifications({ objectiveId })
    ])
    return {
      objective,
      operations,
      attempts,
      verifications
    }
  }

  private async recordOperation(
    request: ObjectiveOperationRequest,
    operation: ObjectiveRunOperationKind
  ): Promise<ObjectiveRunOperationRecord> {
    return await this.storage.recordObjectiveRunOperation({
      ...(request.operationId === undefined ? {} : { id: request.operationId }),
      objectiveId: request.objectiveId,
      operation,
      actorId: request.actorId ?? this.principalId,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }
}
