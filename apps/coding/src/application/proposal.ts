import type {
  CodingProposalActionReceipt,
  CodingProposalApplyReceipt,
  CodingProposalMutationOperation,
  CodingProposalSnapshot,
  CodingProposalUndoReceipt
} from "../host/types.js"
import type {
  CodingProposalActionResult,
  CodingProposalApplyResult,
  CodingProposalMutationReadModel,
  CodingProposalReadModel,
  CodingProposalUndoResult
} from "./model.js"

export function projectCodingProposal(
  projectId: string,
  proposal: CodingProposalSnapshot
): CodingProposalReadModel {
  return {
    projectId,
    proposalId: proposal.proposalId,
    state: proposal.state,
    changeState: proposal.changeSetState,
    ...(proposal.title === undefined ? {} : { title: proposal.title }),
    ...(proposal.summary === undefined ? {} : { summary: proposal.summary }),
    incomplete: proposal.incomplete,
    ...(proposal.executionOutcome === undefined
      ? {}
      : { executionOutcome: proposal.executionOutcome }),
    totalFileCount: proposal.totalFileCount,
    returnedFileCount: proposal.returnedFileCount,
    omittedFileCount: proposal.omittedFileCount,
    files: proposal.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      ...(file.before === undefined ? {} : { before: { ...file.before } }),
      ...(file.after === undefined ? {} : { after: { ...file.after } })
    })),
    totalOperationCount: proposal.totalOperationCount,
    returnedOperationCount: proposal.returnedOperationCount,
    omittedOperationCount: proposal.omittedOperationCount,
    operations: proposal.operations.map((operation) => ({
      action: operation.action,
      fromState: operation.fromState,
      toState: operation.toState,
      ...(operation.reason === undefined ? {} : { reason: operation.reason }),
      createdAt: operation.createdAt
    }))
  }
}

export function projectCodingProposalAction(
  projectId: string,
  receipt: CodingProposalActionReceipt
): CodingProposalActionResult {
  return {
    action: receipt.action,
    proposal: projectCodingProposal(projectId, receipt.proposal)
  }
}

export function projectCodingProposalApply(
  projectId: string,
  receipt: CodingProposalApplyReceipt
): CodingProposalApplyResult {
  return {
    status: receipt.status,
    proposal: projectCodingProposal(projectId, receipt.proposal),
    ...(receipt.operation === undefined
      ? {}
      : { mutation: projectMutation(receipt.operation) })
  }
}

export function projectCodingProposalUndo(
  projectId: string,
  receipt: CodingProposalUndoReceipt
): CodingProposalUndoResult {
  return {
    status: receipt.status,
    replayed: receipt.replayed,
    proposal: projectCodingProposal(projectId, receipt.proposal),
    mutation: projectMutation(receipt.operation)
  }
}

function projectMutation(
  operation: CodingProposalMutationOperation
): CodingProposalMutationReadModel {
  return {
    kind: operation.kind,
    status: operation.status,
    totalFileCount: operation.totalFileCount,
    returnedFileCount: operation.returnedFileCount,
    omittedFileCount: operation.omittedFileCount,
    files: operation.files.map((file) => ({ ...file })),
    totalConflictCount: operation.totalConflictCount,
    returnedConflictCount: operation.returnedConflictCount,
    omittedConflictCount: operation.omittedConflictCount,
    conflicts: operation.conflicts.map((conflict) => ({ ...conflict }))
  }
}
