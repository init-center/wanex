import type {
  CodingTurnOperation,
  CodingTurnReference,
  CodingTurnSnapshot
} from "../host/types.js"
import type {
  CodingTurnReadModel,
  CodingTurnResultKind
} from "./model.js"

export interface ActiveCodingTurn {
  readonly projectId: string
  readonly operation: CodingTurnOperation
  readonly createdAt: number
  updatedAt: number
  terminal: boolean
  error?: unknown
}

export function projectStartingTurn(active: ActiveCodingTurn): CodingTurnReadModel {
  return {
    projectId: active.projectId,
    sessionId: active.operation.reference.sessionId,
    turnId: active.operation.reference.turnId,
    state: active.error === undefined ? "starting" : "failed",
    createdAt: active.createdAt,
    updatedAt: active.updatedAt,
    ...(active.error === undefined ? {} : { finishedAt: active.updatedAt }),
    canCancel: !active.terminal,
    approvals: emptyApprovals(),
    recovery: emptyRecovery(),
    ...(active.error === undefined
      ? {}
      : {
          result: "failed",
          error: {
            code: "turn_execution_failed",
            message: "The coding task failed before durable execution was available."
          }
        })
  }
}

export function projectTurnSnapshot(
  projectId: string,
  snapshot: CodingTurnSnapshot
): CodingTurnReadModel {
  const result = resultKind(snapshot)
  return {
    projectId,
    sessionId: snapshot.reference.sessionId,
    turnId: snapshot.reference.turnId,
    state: snapshot.state,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    ...(snapshot.finishedAt === undefined ? {} : { finishedAt: snapshot.finishedAt }),
    canCancel: canCancel(snapshot.state),
    ...(result === undefined ? {} : { result }),
    ...(snapshot.proposalId === undefined ? {} : { proposalId: snapshot.proposalId }),
    approvals: {
      totalCount: snapshot.approvals.totalCount,
      returnedCount: snapshot.approvals.returnedCount,
      omittedCount: snapshot.approvals.omittedCount,
      items: snapshot.approvals.items.map((approval) => ({
        executionId: approval.executionId,
        approvalRevision: approval.approvalRevision,
        tool: { ...approval.tool },
        presentation: {
          ...approval.presentation,
          details: approval.presentation.details.map((detail) => ({ ...detail }))
        },
        attemptCount: approval.attemptCount,
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt,
        availableDecisions: ["approve_once", "deny"]
      }))
    },
    recovery: {
      totalCount: snapshot.recovery.totalCount,
      returnedCount: snapshot.recovery.returnedCount,
      omittedCount: snapshot.recovery.omittedCount,
      items: snapshot.recovery.items.map((item) => ({
        executionId: item.executionId,
        recoveryRevision: item.recoveryRevision,
        tool: { ...item.tool },
        evidence: { ...item.evidence },
        attemptCount: item.attemptCount,
        attempts: item.attempts.map((attempt) => ({ ...attempt })),
        attemptsTruncated: item.attemptsTruncated,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        availableDecisions: [...item.availableDecisions],
      })),
    },
    ...(snapshot.state === "failed"
      ? {
          error: {
            code: "turn_execution_failed" as const,
            message: "The coding task did not complete."
          }
        }
      : {})
  }
}

export function sameTurnReference(
  left: CodingTurnReference,
  right: Pick<CodingTurnReference, "sessionId" | "inputId" | "turnId" | "jobId">
): boolean {
  return left.sessionId === right.sessionId &&
    left.inputId === right.inputId &&
    left.turnId === right.turnId &&
    left.jobId === right.jobId
}

function resultKind(snapshot: CodingTurnSnapshot): CodingTurnResultKind | undefined {
  if (snapshot.proposalId !== undefined) return "proposal_available"
  if (snapshot.state === "cancelled") return "cancelled"
  if (snapshot.state === "failed" || snapshot.state === "interrupted") return "failed"
  if (snapshot.state === "recovery_required") return "attention"
  switch (snapshot.taskOutcome) {
    case "no_changes":
    case "read_only_completed":
      return "no_changes"
    case "execution_failed":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "proposed":
      return "attention"
    default:
      return undefined
  }
}

function canCancel(state: CodingTurnSnapshot["state"]): boolean {
  return state === "queued" || state === "running" || state === "waiting"
}

function emptyApprovals(): CodingTurnReadModel["approvals"] {
  return { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] }
}

function emptyRecovery(): CodingTurnReadModel["recovery"] {
  return { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] }
}
