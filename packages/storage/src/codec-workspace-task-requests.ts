import type {
  BeginWorkspaceTaskCollectionRequest,
  BeginWorkspaceTaskReleaseRequest,
  BeginWorkspaceTaskRunRequest,
  ClaimWorkspaceTaskContinuationRequest,
  ClaimWorkspaceTaskRecoveryRequest,
  FinalizeWorkspaceTaskCollectionRequest,
  FinalizeWorkspaceTaskReleaseRequest,
  ListWorkspaceTaskAttemptsRequest,
  ListWorkspaceTaskRunsRequest,
  MarkWorkspaceTaskActiveRequest,
  MarkWorkspaceTaskAttentionRequest,
  RenewWorkspaceTaskRunRequest,
} from "@wanex/protocol";
import {
  toRpcJsonValue,
  toRpcJsonValueFromUnknown,
} from "./codec-common.js";
import { workspaceChangeSetToJson } from "./codec-workspace-values.js";
import type {
  BeginWorkspaceTaskCollectionWire,
  BeginWorkspaceTaskRunWire,
  ClaimWorkspaceTaskContinuationWire,
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
    strategy: request.strategy,
    root_identity: {
      host_id: request.rootIdentity.hostId,
      generation_key: request.rootIdentity.generationKey,
      root_id: request.rootIdentity.rootId,
      device: request.rootIdentity.device,
      inode: request.rootIdentity.inode,
    },
    isolation_identity: {
      id: request.isolationIdentity.id,
      kind: request.isolationIdentity.kind,
      repository_id: request.isolationIdentity.repositoryId ?? null,
      base_revision: request.isolationIdentity.baseRevision ?? null,
      runtime_ref: request.isolationIdentity.runtimeRef ?? null,
    },
    execution_environment: toRpcJsonValueFromUnknown(request.executionEnvironment),
    job_id: request.jobId ?? null,
    agent_id: request.agentId ?? null,
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

export function toRpcClaimWorkspaceTaskContinuationRequest(
  request: ClaimWorkspaceTaskContinuationRequest,
): ClaimWorkspaceTaskContinuationWire {
  return {
    run_id: request.runId,
    attempt_id: request.attemptId,
    owner_id: request.ownerId,
    claim_token: request.claimToken,
    lease_ms: request.leaseMs,
    execution_environment: toRpcJsonValueFromUnknown(request.executionEnvironment),
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
    prepared_isolation:
      request.preparedIsolation === undefined
        ? null
        : {
            base_revision: request.preparedIsolation.baseRevision,
            runtime_ref: request.preparedIsolation.runtimeRef,
          },
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
    root_identity: request.rootIdentity === undefined ? null : {
      host_id: request.rootIdentity.hostId,
      generation_key: request.rootIdentity.generationKey,
      root_id: request.rootIdentity.rootId,
      device: request.rootIdentity.device,
      inode: request.rootIdentity.inode,
    },
    run_ids: toRpcWorkspaceTaskRunIds(request.runIds),
    workspace_id: request.workspaceId ?? null,
    root_id: request.rootId ?? null,
    strategy: request.strategy ?? null,
    state: request.state ?? null,
    lease_expires_before: request.leaseExpiresBefore ?? null,
    limit: request.limit ?? null,
  };
}

function toRpcWorkspaceTaskRunIds(
  runIds: readonly string[] | undefined,
): [string, ...string[]] | null {
  if (runIds === undefined) return null;
  if (
    runIds.length === 0 ||
    runIds.length > 128 ||
    runIds.some((runId) => runId.length === 0) ||
    new Set(runIds).size !== runIds.length
  ) {
    throw new Error(
      "workspace task runIds must contain 1 to 128 unique non-empty ids",
    );
  }
  return [...runIds] as [string, ...string[]];
}

export function toRpcListWorkspaceTaskAttemptsRequest(
  request: ListWorkspaceTaskAttemptsRequest,
): ListWorkspaceTaskAttemptsWire {
  return {
    run_id: request.runId,
    limit: request.limit ?? null,
  };
}
