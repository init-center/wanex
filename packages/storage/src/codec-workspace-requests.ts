import {
  type BeginWorkspaceChangeTransactionCommitRequest,
  type BeginWorkspaceChangeTransactionRequest,
  type ClaimWorkspaceChangeProposalApplyRequest,
  type ClaimWorkspaceChangeTransactionRecoveryRequest,
  type FinalizeWorkspaceChangeTransactionRequest,
  type GetWorkspaceChangeProposalRequest,
  type GetWorkspaceChangeSetRequest,
  type JsonValue,
  type ListWorkspaceChangeOperationsRequest,
  type ListWorkspaceChangeProposalApplyAttemptsRequest,
  type ListWorkspaceChangeProposalOperationsRequest,
  type ListWorkspaceChangeProposalsRequest,
  type ListWorkspaceChangeSetsRequest,
  type MarkWorkspaceChangeProposalRecoveryRequiredRequest,
  type MarkWorkspaceChangeTransactionPreparedRequest,
  type PutWorkspaceChangeProposalRequest,
  type PutWorkspaceChangeSetRequest,
  type RecordWorkspaceChangeOperationRequest,
  type RecordWorkspaceChangeProposalOperationRequest,
  type RecordWorkspaceChangeTransactionFileCommittedRequest,
  type RecordWorkspaceChangeTransactionPlanRequest,
  type ReconcileWorkspaceChangeTransactionFilesRequest,
  type RenewWorkspaceChangeProposalApplyRequest,
  type RenewWorkspaceChangeTransactionRequest,
  type SettleWorkspaceChangeProposalApplyRequest,
} from "@wanex/protocol";

import {
  workspaceChangeReceiptToJson,
  workspaceChangeSetToJson,
} from "./codec-workspace-values.js";
import { toRpcJsonValue } from "./codec-common.js";
import type {
  BeginWorkspaceChangeTransactionWire,
  ClaimWorkspaceChangeProposalApplyWire,
  ClaimWorkspaceChangeTransactionRecoveryWire,
  FinalizeWorkspaceChangeTransactionWire,
  ListWorkspaceChangeOperationsWire,
  ListWorkspaceChangeProposalApplyAttemptsWire,
  ListWorkspaceChangeProposalOperationsWire,
  ListWorkspaceChangeProposalsWire,
  ListWorkspaceChangeSetsWire,
  MarkWorkspaceChangeProposalRecoveryRequiredWire,
  PutWorkspaceChangeProposalWire,
  PutWorkspaceChangeSetWire,
  RecordWorkspaceChangeOperationWire,
  RecordWorkspaceChangeProposalOperationWire,
  RecordWorkspaceChangeTransactionFileCommittedWire,
  RecordWorkspaceChangeTransactionPlanWire,
  ReconcileWorkspaceChangeTransactionFilesWire,
  RenewWorkspaceChangeProposalApplyWire,
  RenewWorkspaceChangeTransactionWire,
  WorkspaceChangeTransactionIdentityWire,
  SettleWorkspaceChangeProposalApplyWire,
} from "./generated/storage-rpc.js";

export function toRpcPutWorkspaceChangeSetRequest(
  request: PutWorkspaceChangeSetRequest,
): PutWorkspaceChangeSetWire {
  return {
    workspace_id: request.workspaceId,
    principal_id: request.principalId,
    changeset: toRpcJsonValue(workspaceChangeSetToJson(request.changeSet)),
  };
}

export function toRpcGetWorkspaceChangeSetRequest(
  request: GetWorkspaceChangeSetRequest,
): JsonValue {
  return {
    change_set_id: request.changeSetId,
  };
}

export function toRpcListWorkspaceChangeSetsRequest(
  request: ListWorkspaceChangeSetsRequest,
): ListWorkspaceChangeSetsWire {
  return {
    workspace_id: request.workspaceId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null,
  };
}

export function toRpcRecordWorkspaceChangeOperationRequest(
  request: RecordWorkspaceChangeOperationRequest,
): RecordWorkspaceChangeOperationWire {
  return {
    id: request.id ?? null,
    changeset_id: request.changeSetId,
    operation: request.operation,
    receipt: toRpcJsonValue(workspaceChangeReceiptToJson(request.receipt)),
  };
}

export function toRpcListWorkspaceChangeOperationsRequest(
  request: ListWorkspaceChangeOperationsRequest,
): ListWorkspaceChangeOperationsWire {
  return {
    changeset_id: request.changeSetId,
  };
}

export function toRpcPutWorkspaceChangeProposalRequest(
  request: PutWorkspaceChangeProposalRequest,
): PutWorkspaceChangeProposalWire {
  return {
    id: request.id ?? null,
    workspace_id: request.workspaceId,
    changeset_id: request.changeSetId,
    principal_id: request.principalId,
    title: request.title ?? null,
    summary: request.summary ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null,
  };
}

export function toRpcGetWorkspaceChangeProposalRequest(
  request: GetWorkspaceChangeProposalRequest,
): JsonValue {
  return {
    proposal_id: request.proposalId,
  };
}

export function toRpcListWorkspaceChangeProposalsRequest(
  request: ListWorkspaceChangeProposalsRequest,
): ListWorkspaceChangeProposalsWire {
  return {
    workspace_id: request.workspaceId ?? null,
    state: request.state ?? null,
    changeset_id: request.changeSetId ?? null,
    limit: request.limit ?? null,
  };
}

export function toRpcRecordWorkspaceChangeProposalOperationRequest(
  request: RecordWorkspaceChangeProposalOperationRequest,
): RecordWorkspaceChangeProposalOperationWire {
  return {
    id: request.id ?? null,
    proposal_id: request.proposalId,
    operation: request.operation,
    actor_id: request.actorId,
    reason: request.reason ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
  };
}

export function toRpcListWorkspaceChangeProposalOperationsRequest(
  request: ListWorkspaceChangeProposalOperationsRequest,
): ListWorkspaceChangeProposalOperationsWire {
  return {
    proposal_id: request.proposalId,
  };
}

export function toRpcClaimWorkspaceChangeProposalApplyRequest(
  request: ClaimWorkspaceChangeProposalApplyRequest,
): ClaimWorkspaceChangeProposalApplyWire {
  return {
    proposal_id: request.proposalId,
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
    metadata: toRpcJsonValue(request.metadata ?? null),
  };
}

export function toRpcRenewWorkspaceChangeProposalApplyRequest(
  request: RenewWorkspaceChangeProposalApplyRequest,
): RenewWorkspaceChangeProposalApplyWire {
  return {
    proposal_id: request.proposalId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcSettleWorkspaceChangeProposalApplyRequest(
  request: SettleWorkspaceChangeProposalApplyRequest,
): SettleWorkspaceChangeProposalApplyWire {
  return {
    proposal_id: request.proposalId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    outcome: request.outcome,
    workspace_operation_id: request.workspaceOperationId ?? null,
    failure: toRpcJsonValue(request.failure ?? null),
  };
}

export function toRpcMarkWorkspaceChangeProposalRecoveryRequiredRequest(
  request: MarkWorkspaceChangeProposalRecoveryRequiredRequest,
): MarkWorkspaceChangeProposalRecoveryRequiredWire {
  return { proposal_id: request.proposalId };
}

export function toRpcListWorkspaceChangeProposalApplyAttemptsRequest(
  request: ListWorkspaceChangeProposalApplyAttemptsRequest,
): ListWorkspaceChangeProposalApplyAttemptsWire {
  return {
    proposal_id: request.proposalId,
    limit: request.limit ?? null,
  };
}

export function toRpcBeginWorkspaceChangeTransactionRequest(
  request: BeginWorkspaceChangeTransactionRequest,
): BeginWorkspaceChangeTransactionWire {
  return {
    id: request.id,
    workspace_id: request.workspaceId,
    changeset_id: request.changeSetId,
    operation: request.operation,
    undo_source_operation_id: request.undoSourceOperationId ?? null,
    source_kind: request.sourceKind,
    source_id: request.sourceId,
    idempotency_key: request.idempotencyKey,
    root_identity_sha256: request.rootIdentitySha256,
    proposal:
      request.proposal === undefined
        ? null
        : {
            proposal_id: request.proposal.proposalId,
            proposal_attempt_id: request.proposal.proposalAttemptId,
            proposal_claim_token: request.proposal.proposalClaimToken,
          },
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcClaimWorkspaceChangeTransactionRecoveryRequest(
  request: ClaimWorkspaceChangeTransactionRecoveryRequest,
): ClaimWorkspaceChangeTransactionRecoveryWire {
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcRenewWorkspaceChangeTransactionRequest(
  request: RenewWorkspaceChangeTransactionRequest,
): RenewWorkspaceChangeTransactionWire {
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

function toRpcWorkspaceChangeTransactionIdentity(
  request:
    | MarkWorkspaceChangeTransactionPreparedRequest
    | BeginWorkspaceChangeTransactionCommitRequest,
): WorkspaceChangeTransactionIdentityWire {
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
  };
}

export const toRpcMarkWorkspaceChangeTransactionPreparedRequest =
  toRpcWorkspaceChangeTransactionIdentity;

export const toRpcBeginWorkspaceChangeTransactionCommitRequest =
  toRpcWorkspaceChangeTransactionIdentity;

export function toRpcRecordWorkspaceChangeTransactionPlanRequest(
  request: RecordWorkspaceChangeTransactionPlanRequest,
): RecordWorkspaceChangeTransactionPlanWire {
  const [first, ...rest] = request.files.map((file) => ({
    ordinal: file.ordinal,
    path: file.path,
    before_text: file.beforeText ?? null,
    before_sha256: file.beforeSha256 ?? null,
    after_text: file.afterText ?? null,
    after_sha256: file.afterSha256 ?? null,
  }));
  if (first === undefined) {
    throw new Error("workspace transaction plan requires at least one file");
  }
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    files: [first, ...rest],
  };
}

export function toRpcRecordWorkspaceChangeTransactionFileCommittedRequest(
  request: RecordWorkspaceChangeTransactionFileCommittedRequest,
): RecordWorkspaceChangeTransactionFileCommittedWire {
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    ordinal: request.ordinal,
  };
}

export function toRpcReconcileWorkspaceChangeTransactionFilesRequest(
  request: ReconcileWorkspaceChangeTransactionFilesRequest,
): ReconcileWorkspaceChangeTransactionFilesWire {
  const [first, ...rest] = request.observations.map((observation) => ({
    ordinal: observation.ordinal,
    current: observation.current,
  }));
  if (first === undefined) {
    throw new Error(
      "workspace transaction reconciliation requires observations",
    );
  }
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    observations: [first, ...rest],
  };
}

export function toRpcFinalizeWorkspaceChangeTransactionRequest(
  request: FinalizeWorkspaceChangeTransactionRequest,
): FinalizeWorkspaceChangeTransactionWire {
  return {
    transaction_id: request.transactionId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    outcome: request.outcome,
    operation_id: request.operationId ?? null,
    receipt:
      request.receipt === undefined
        ? null
        : toRpcJsonValue(workspaceChangeReceiptToJson(request.receipt)),
    failure: toRpcJsonValue(request.failure ?? null),
  };
}
