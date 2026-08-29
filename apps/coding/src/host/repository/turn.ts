import type {
  ApplicationScopeBinding,
  ExecutionEnvironmentBinding,
  JsonValue,
  SessionTurnPageCursor,
  SessionTurnRecord,
  ToolExecutionRecord,
  ToolExecutionAttemptRecord,
  WorkspaceTaskRunSnapshot
} from "@wanex/protocol"
import { assertExecutionEnvironmentBindingEqual } from "@wanex/runtime/execution"
import type { CoreStore } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import {
  readCodingApplicationScope,
  type CodingApplicationScopeBinding
} from "../execution/scope.js"
import { sessionBelongsToCodingRepository } from "../session-scope.js"
import type {
  CodingTurnApprovalItem,
  CodingTurnApprovalPresentationDetail,
  CodingTurnApprovalReview,
  CodingTurnRecoveryItem,
  CodingTurnRecoveryReview,
  CodingTurnPage,
  CodingTurnSnapshot
} from "../types.js"

const MAX_APPROVAL_ITEMS = 16
const MAX_APPROVAL_SUMMARY_CHARS = 512
const MAX_APPROVAL_DETAILS = 16
const MAX_APPROVAL_DETAIL_LABEL_CHARS = 128
const MAX_APPROVAL_DETAIL_VALUE_CHARS = 1_024
const MAX_TOOL_NAME_CHARS = 128
const MAX_TOOL_TITLE_CHARS = 200
const MAX_RECOVERY_ITEMS = 16
const MAX_RECOVERY_MESSAGE_CHARS = 1_024
const MAX_RECOVERY_REF_CHARS = 512
const MAX_RECOVERY_ATTEMPTS = 16

type CodingStore = CoreStore & WorkspaceStore

export async function readCodingTurnSnapshot(request: {
  readonly storage: CodingStore
  readonly repositoryId: string
  readonly workspaceId: string
  readonly turnId: string
}): Promise<CodingTurnSnapshot | null> {
  const turn = await request.storage.getSessionTurn(request.turnId)
  if (turn === null) return null
  const session = await request.storage.getSession(turn.sessionId)
  if (session === null) {
    throw new Error("Coding Turn references a missing Session")
  }
  if (!sessionBelongsToCodingRepository(session, request.repositoryId)) return null
  const scope = requireCodingScope(turn.executionBinding.applicationScope)
  const executionEnvironment = requireExecutionEnvironment(
    turn.executionBinding.executionEnvironment
  )
  assertApplicationScope(scope, request)
  const task = await request.storage.getWorkspaceTaskRun({
    runId: scope.id
  })
  if (task === null) {
    throw new Error("Coding Turn references a missing Workspace task")
  }
  return await projectTurn(
    request.storage,
    request,
    turn,
    scope,
    executionEnvironment,
    task
  )
}

export async function readCodingTurnPage(request: {
  readonly storage: CodingStore
  readonly repositoryId: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly before?: SessionTurnPageCursor
  readonly limit: number
}): Promise<CodingTurnPage> {
  const session = await request.storage.getSession(request.sessionId)
  if (session === null ||
      !sessionBelongsToCodingRepository(session, request.repositoryId)) {
    return { items: [] }
  }
  const turns = await request.storage.listSessionTurns({
    sessionId: request.sessionId,
    ...(request.before === undefined ? {} : { before: request.before }),
    limit: request.limit
  })
  const candidates = turns.map((turn) => {
    const scope = requireCodingScope(turn.executionBinding.applicationScope)
    const executionEnvironment = requireExecutionEnvironment(
      turn.executionBinding.executionEnvironment
    )
    assertApplicationScope(scope, request)
    return { turn, scope, executionEnvironment }
  })
  const runIds = candidates.map(({ scope }) => scope.id)
  if (new Set(runIds).size !== runIds.length) {
    throw new Error("multiple Coding Turns reference the same Workspace task")
  }
  const tasks = runIds.length === 0
    ? []
    : await request.storage.listWorkspaceTaskRuns({
        runIds,
        repositoryId: request.repositoryId,
        workspaceId: request.workspaceId
      })
  const tasksById = new Map(tasks.map((task) => [task.run.id, task]))
  const items = await Promise.all(candidates.map(async ({
    turn,
    scope,
    executionEnvironment
  }) => {
    const task = tasksById.get(scope.id)
    if (task === undefined) {
      throw new Error("Coding Turn references a missing or foreign Workspace task")
    }
    return await projectTurn(
      request.storage,
      request,
      turn,
      scope,
      executionEnvironment,
      task
    )
  }))
  return {
    items,
    ...(turns.length < request.limit
      ? {}
      : {
          continuation: {
            createdAt: turns[0]!.createdAt,
            turnId: turns[0]!.id
          }
        })
  }
}

async function projectTurn(
  storage: CodingStore,
  request: { readonly repositoryId: string; readonly workspaceId: string },
  turn: SessionTurnRecord,
  scope: CodingApplicationScopeBinding,
  executionEnvironment: ExecutionEnvironmentBinding,
  task: WorkspaceTaskRunSnapshot
): Promise<CodingTurnSnapshot> {
  if (
    task.run.id !== scope.id ||
    task.run.repositoryId !== request.repositoryId ||
    task.run.workspaceId !== request.workspaceId ||
    task.run.access !== scope.metadata.access ||
    task.run.jobId !== turn.jobId
  ) {
    throw new Error("Coding Turn and Workspace task bindings are inconsistent")
  }
  assertExecutionEnvironmentBindingEqual(
    executionEnvironment,
    task.run.executionEnvironment,
    "Coding Turn and Workspace task execution environment"
  )

  const approvalExecutions = turn.state === "waiting"
    ? await storage.listToolExecutions({
        turnId: turn.id,
        state: "approval_required",
        limit: MAX_APPROVAL_ITEMS + 1
      })
    : []
  const recoveryExecutions = turn.state === "recovery_required"
    ? await storage.listToolExecutions({
        turnId: turn.id,
        state: "recovery_required",
        limit: MAX_RECOVERY_ITEMS + 1
      })
    : []
  return {
    reference: {
      repositoryId: request.repositoryId,
      taskId: scope.id,
      sessionId: turn.sessionId,
      inputId: turn.primaryInputId,
      turnId: turn.id,
      jobId: turn.jobId
    },
    state: turn.state,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    ...(turn.finishedAt === undefined ? {} : { finishedAt: turn.finishedAt }),
    ...(task.run.outcome === undefined ? {} : { taskOutcome: task.run.outcome }),
    ...(task.run.proposalId === undefined ? {} : { proposalId: task.run.proposalId }),
    approvals: projectApprovals(approvalExecutions),
    recovery: await projectRecovery(
      storage,
      turn,
      recoveryExecutions
    )
  }
}

async function projectRecovery(
  storage: CodingStore,
  turn: SessionTurnRecord,
  executions: readonly ToolExecutionRecord[]
): Promise<CodingTurnRecoveryReview> {
  const items = await Promise.all(
    executions.slice(0, MAX_RECOVERY_ITEMS).map(async (execution) => {
      if (execution.state !== "recovery_required" || execution.recovery === undefined) {
        throw new Error("Coding recovery projection requires recoverable Tool evidence")
      }
      const attempts = await storage.listToolExecutionAttempts({
        executionId: execution.id
      })
      return projectRecoveryItem(execution, attempts, turn)
    })
  )
  return {
    totalCount: executions.length,
    returnedCount: items.length,
    omittedCount: Math.max(0, executions.length - items.length),
    items
  }
}

function projectRecoveryItem(
  execution: ToolExecutionRecord,
  attempts: readonly ToolExecutionAttemptRecord[],
  turn: SessionTurnRecord
): CodingTurnRecoveryItem {
  const evidence = execution.recovery
  if (evidence === undefined || evidence.type !== "ambiguous_tool_outcome") {
    throw new Error("Coding recovery evidence is missing or invalid")
  }
  const message = truncate(evidence.message, MAX_RECOVERY_MESSAGE_CHARS)
  const reconciliationRef = evidence.reconciliationRef
  if (
    reconciliationRef !== undefined &&
    (reconciliationRef.length === 0 || reconciliationRef.length > MAX_RECOVERY_REF_CHARS)
  ) {
    throw new Error("Coding recovery reconciliation reference is invalid")
  }
  const tool = projectRecoveryTool(execution)
  const visibleAttempts = attempts.slice(-MAX_RECOVERY_ATTEMPTS).map(projectRecoveryAttempt)
  return {
    executionId: execution.id,
    recoveryRevision: execution.recoveryRevision,
    tool,
    evidence: {
      message: message.value,
      messageTruncated: message.truncated,
      ...(reconciliationRef === undefined ? {} : { reconciliationRef })
    },
    attemptCount: execution.attemptCount,
    attempts: visibleAttempts,
    attemptsTruncated: attempts.length > visibleAttempts.length,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    availableDecisions: availableRecoveryDecisions(
      execution,
      tool,
      turn.executionBinding.recovery.idempotentToolMaxAttempts
    )
  }
}

function projectRecoveryTool(
  execution: ToolExecutionRecord
): CodingTurnRecoveryItem["tool"] {
  const descriptor = jsonRecord(execution.descriptor)
  const annotations = jsonRecordOrEmpty(descriptor.annotations)
  const name = boundedString(descriptor.name, execution.toolName, MAX_TOOL_NAME_CHARS)
  const risk = descriptor.risk
  const resultMode = descriptor.resultMode
  if (
    (risk !== "read_only" && risk !== "mutating" && risk !== "external") ||
    (resultMode !== "immediate" && resultMode !== "deferred")
  ) {
    throw new Error("Coding recovery Tool descriptor is invalid")
  }
  return {
    name,
    title: boundedString(annotations.title, name, MAX_TOOL_TITLE_CHARS),
    risk,
    idempotent: descriptor.idempotent === true,
    resultMode
  }
}

function projectRecoveryAttempt(
  attempt: ToolExecutionAttemptRecord
): CodingTurnRecoveryItem["attempts"][number] {
  return {
    attemptNumber: attempt.attemptNumber,
    state: attempt.state,
    startedAt: attempt.startedAt,
    updatedAt: attempt.updatedAt,
    ...(attempt.finishedAt === undefined ? {} : { finishedAt: attempt.finishedAt })
  }
}

function availableRecoveryDecisions(
  execution: ToolExecutionRecord,
  tool: CodingTurnRecoveryItem["tool"],
  maxAttempts: number
): CodingTurnRecoveryItem["availableDecisions"] {
  const decisions: import("@wanex/protocol").ToolExecutionRecoveryDecision[] = [
    "confirm_succeeded",
    "confirm_failed",
    "abandon_turn"
  ]
  if (
    tool.resultMode === "immediate" &&
    tool.idempotent &&
    execution.attemptCount < maxAttempts
  ) {
    decisions.splice(2, 0, "retry")
  }
  return decisions
}

function assertApplicationScope(
  scope: CodingApplicationScopeBinding,
  expected: { readonly repositoryId: string; readonly workspaceId: string }
): void {
  if (
    scope.metadata.repositoryId !== expected.repositoryId ||
    scope.metadata.workspaceId !== expected.workspaceId
  ) {
    throw new Error("Coding Turn application scope contradicts its scoped Session")
  }
}

function requireCodingScope(
  value: ApplicationScopeBinding | undefined
): CodingApplicationScopeBinding {
  const scope = readCodingApplicationScope(value)
  if (scope === undefined) {
    throw new Error("Coding Turn application scope is missing or foreign")
  }
  return scope
}

function requireExecutionEnvironment(
  value: ExecutionEnvironmentBinding | undefined
): ExecutionEnvironmentBinding {
  if (value === undefined) {
    throw new Error("Coding Turn execution environment is missing")
  }
  return value
}

function projectApprovals(
  executions: readonly ToolExecutionRecord[]
): CodingTurnApprovalReview {
  const items = executions.slice(0, MAX_APPROVAL_ITEMS)
  return {
    totalCount: executions.length,
    returnedCount: items.length,
    omittedCount: Math.max(0, executions.length - items.length),
    items: items.map(projectApproval)
  }
}

function projectApproval(execution: ToolExecutionRecord): CodingTurnApprovalItem {
  if (execution.state !== "approval_required") {
    throw new Error("Coding approval projection requires a pending Tool execution")
  }
  const permission = jsonRecord(execution.permission)
  const presentation = jsonRecord(permission.presentation)
  if (permission.status !== "approval_required") {
    throw new Error("pending Coding Tool execution has inconsistent permission evidence")
  }
  const summary = truncate(
    requiredString(presentation.summary, "Coding approval summary"),
    MAX_APPROVAL_SUMMARY_CHARS
  )
  const detailValues = presentation.details
  if (detailValues !== undefined && !Array.isArray(detailValues)) {
    throw new Error("Coding approval details are invalid")
  }
  const details = detailValues ?? []
  const boundedDetails = details.slice(0, MAX_APPROVAL_DETAILS)
  return {
    executionId: execution.id,
    approvalRevision: execution.approvalRevision,
    tool: projectTool(execution),
    presentation: {
      summary: summary.value,
      summaryTruncated: summary.truncated,
      details: boundedDetails.map(projectDetail),
      detailsTruncated: details.length > boundedDetails.length
    },
    attemptCount: execution.attemptCount,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    availableDecisions: ["approve_once", "deny"]
  }
}

function projectTool(execution: ToolExecutionRecord): CodingTurnApprovalItem["tool"] {
  const descriptor = jsonRecordOrEmpty(execution.descriptor)
  const annotations = jsonRecordOrEmpty(descriptor.annotations)
  const name = boundedString(descriptor.name, execution.toolName, MAX_TOOL_NAME_CHARS)
  const risk = descriptor.risk
  return {
    name,
    title: boundedString(annotations.title, name, MAX_TOOL_TITLE_CHARS),
    risk: risk === "mutating" || risk === "external" ? risk : "read_only",
    idempotent: descriptor.idempotent === true
  }
}

function projectDetail(value: JsonValue): CodingTurnApprovalPresentationDetail {
  const row = jsonRecord(value)
  const label = truncate(
    requiredString(row.label, "Coding approval detail label"),
    MAX_APPROVAL_DETAIL_LABEL_CHARS
  )
  const detailValue = truncate(
    requiredString(row.value, "Coding approval detail value"),
    MAX_APPROVAL_DETAIL_VALUE_CHARS
  )
  return {
    label: label.value,
    labelTruncated: label.truncated,
    value: detailValue.value,
    valueTruncated: detailValue.truncated
  }
}

function jsonRecord(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Coding approval evidence is not an object")
  }
  return value as Readonly<Record<string, JsonValue>>
}

function jsonRecordOrEmpty(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
    : {}
}

function requiredString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function boundedString(value: JsonValue | undefined, fallback: string, limit: number): string {
  const selected = typeof value === "string" && value.length > 0 ? value : fallback
  return truncate(selected, limit).value
}

function truncate(value: string, limit: number): {
  readonly value: string
  readonly truncated: boolean
} {
  if (value.length <= limit) return { value, truncated: false }
  return { value: value.slice(0, limit), truncated: true }
}
