import type {
  BeginWorkspaceTaskCollectionRequest,
  BeginWorkspaceTaskReleaseRequest,
  BeginWorkspaceTaskRunRequest,
  ClaimWorkspaceTaskRecoveryRequest,
  FinalizeWorkspaceTaskCollectionRequest,
  FinalizeWorkspaceTaskReleaseRequest,
  ListWorkspaceTaskAttemptsRequest,
  ListWorkspaceTaskRunsRequest,
  MarkWorkspaceTaskActiveRequest,
  MarkWorkspaceTaskAttentionRequest,
  RenewWorkspaceTaskRunRequest,
} from "@wanex/protocol";
import { toRpcJsonValue } from "./codec-common.js";
import { workspaceChangeSetToJson } from "./codec-workspace-values.js";
import type {
  BeginWorkspaceTaskCollectionWire,
  BeginWorkspaceTaskRunWire,
  ClaimWorkspaceTaskRecoveryWire,
  FinalizeWorkspaceTaskCollectionWire,
  ListWorkspaceTaskAttemptsWire,
  ListWorkspaceTaskRunsWire,
  MarkWorkspaceTaskActiveWire,
  MarkWorkspaceTaskAttentionWire,
  RenewWorkspaceTaskRunWire,
  WorkspaceTaskRunIdentityWire,
} from "./generated/storage-rpc.js";

export function toRpcBeginWorkspaceTaskRunRequest(
  request: BeginWorkspaceTaskRunRequest,
): BeginWorkspaceTaskRunWire {
  return {
    id: request.id,
    workspace_id: request.workspaceId,
    principal_id: request.principalId,
    access: request.access,
    repository_id: request.repositoryId,
    isolation_id: request.isolationId,
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcClaimWorkspaceTaskRecoveryRequest(
  request: ClaimWorkspaceTaskRecoveryRequest,
): ClaimWorkspaceTaskRecoveryWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcRenewWorkspaceTaskRunRequest(
  request: RenewWorkspaceTaskRunRequest,
): RenewWorkspaceTaskRunWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
  };
}

export function toRpcMarkWorkspaceTaskActiveRequest(
  request: MarkWorkspaceTaskActiveRequest,
): MarkWorkspaceTaskActiveWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    base_revision: request.baseRevision ?? null,
    runtime_ref: request.runtimeRef ?? null,
  };
}

export function toRpcBeginWorkspaceTaskCollectionRequest(
  request: BeginWorkspaceTaskCollectionRequest,
): BeginWorkspaceTaskCollectionWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    execution_outcome: request.executionOutcome,
    summary: request.summary ?? null,
    resource_ids: [...request.resourceIds],
    failure: toRpcJsonValue(request.failure ?? null),
  };
}

export function toRpcFinalizeWorkspaceTaskCollectionRequest(
  request: FinalizeWorkspaceTaskCollectionRequest,
): FinalizeWorkspaceTaskCollectionWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    outcome: request.outcome,
    changeset:
      request.outcome === "proposed"
        ? toRpcJsonValue(workspaceChangeSetToJson(request.changeSet))
        : null,
    proposal_id: request.outcome === "proposed" ? request.proposalId : null,
    title: request.outcome === "proposed" ? (request.title ?? null) : null,
    proposal_metadata:
      request.outcome === "proposed"
        ? toRpcJsonValue(request.proposalMetadata ?? null)
        : null,
  };
}

function toRpcWorkspaceTaskRunIdentity(
  request: BeginWorkspaceTaskReleaseRequest | FinalizeWorkspaceTaskReleaseRequest,
): WorkspaceTaskRunIdentityWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
  };
}

export const toRpcBeginWorkspaceTaskReleaseRequest =
  toRpcWorkspaceTaskRunIdentity;
export const toRpcFinalizeWorkspaceTaskReleaseRequest =
  toRpcWorkspaceTaskRunIdentity;

export function toRpcMarkWorkspaceTaskAttentionRequest(
  request: MarkWorkspaceTaskAttentionRequest,
): MarkWorkspaceTaskAttentionWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    claim_token: request.claimToken,
    failure: toRpcJsonValue(request.failure),
  };
}

export function toRpcListWorkspaceTaskRunsRequest(
  request: ListWorkspaceTaskRunsRequest,
): ListWorkspaceTaskRunsWire {
  return {
    workspace_id: request.workspaceId ?? null,
    state: request.state ?? null,
    lease_expires_before: request.leaseExpiresBefore ?? null,
    limit: request.limit ?? null,
  };
}

export function toRpcListWorkspaceTaskAttemptsRequest(
  request: ListWorkspaceTaskAttemptsRequest,
): ListWorkspaceTaskAttemptsWire {
  return {
    run_id: request.runId,
    limit: request.limit ?? null,
  };
}
