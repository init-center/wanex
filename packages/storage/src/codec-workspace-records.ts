import {
  type JsonValue,
  type WorkspaceChangeOperationRecord,
  type WorkspaceChangeProposalApplyAttemptRecord,
  type WorkspaceChangeProposalApplyClaimResult,
  type WorkspaceChangeProposalApplySettlement,
  type WorkspaceChangeProposalOperationRecord,
  type WorkspaceChangeProposalRecord,
  type WorkspaceChangeProposalRecoveryResult,
  type WorkspaceChangeSetRecord,
  type WorkspaceChangeTransactionAttemptRecord,
  type WorkspaceChangeTransactionClaimResult,
  type WorkspaceChangeTransactionFileRecord,
  type WorkspaceChangeTransactionFinalization,
  type WorkspaceChangeTransactionReconciliation,
  type WorkspaceChangeTransactionRecord,
  type WorkspaceChangeTransactionSnapshot,
} from "@wanex/protocol";

import {
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields,
} from "./codec-common.js";
import {
  expectWorkspaceChangeApplyStatus,
  expectWorkspaceChangeOperationKind,
  expectWorkspaceChangeProposalOperationKind,
  expectWorkspaceChangeProposalState,
  expectWorkspaceChangeSetState,
  expectWorkspaceChangeTransactionAttemptState,
  expectWorkspaceChangeTransactionFileState,
  expectWorkspaceChangeTransactionRecoveryDecision,
  expectWorkspaceChangeTransactionState,
  workspaceChangeReceiptFromJson,
  workspaceChangeSetFromJson,
} from "./codec-workspace-values.js";

export function fromRpcWorkspaceChangeSetRecord(
  value: JsonValue,
): WorkspaceChangeSetRecord {
  if (!isRecord(value)) {
    throw new Error("workspace changeset must be an object");
  }
  return {
    id: expectString(value.id, "workspace_changeset.id"),
    workspaceId: expectString(
      value.workspace_id,
      "workspace_changeset.workspace_id",
    ),
    principalId: expectString(
      value.principal_id,
      "workspace_changeset.principal_id",
    ),
    changeSet: workspaceChangeSetFromJson(
      expectJsonField(value, "changeset", "workspace_changeset.changeset"),
    ),
    currentState: expectWorkspaceChangeSetState(
      value.current_state,
      "workspace_changeset.current_state",
    ),
    createdAt: expectNumber(value.created_at, "workspace_changeset.created_at"),
    updatedAt: expectNumber(value.updated_at, "workspace_changeset.updated_at"),
    ...(value.title === null || value.title === undefined
      ? {}
      : { title: expectString(value.title, "workspace_changeset.title") }),
    ...(value.base_revision === null || value.base_revision === undefined
      ? {}
      : {
          baseRevision: expectString(
            value.base_revision,
            "workspace_changeset.base_revision",
          ),
        }),
  };
}

export function fromRpcWorkspaceChangeOperationRecord(
  value: JsonValue,
): WorkspaceChangeOperationRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change operation must be an object");
  }
  return {
    id: expectString(value.id, "workspace_change_operation.id"),
    changeSetId: expectString(
      value.changeset_id,
      "workspace_change_operation.changeset_id",
    ),
    operation: expectWorkspaceChangeOperationKind(
      value.operation,
      "workspace_change_operation.operation",
    ),
    status: expectWorkspaceChangeApplyStatus(
      value.status,
      "workspace_change_operation.status",
    ),
    receipt: workspaceChangeReceiptFromJson(
      expectJsonField(value, "receipt", "workspace_change_operation.receipt"),
    ),
    createdAt: expectNumber(
      value.created_at,
      "workspace_change_operation.created_at",
    ),
  };
}

export function fromRpcWorkspaceChangeProposalRecord(
  value: JsonValue,
): WorkspaceChangeProposalRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change proposal must be an object");
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_change_proposal.id"),
      workspaceId: expectString(
        value.workspace_id,
        "workspace_change_proposal.workspace_id",
      ),
      changeSetId: expectString(
        value.changeset_id,
        "workspace_change_proposal.changeset_id",
      ),
      principalId: expectString(
        value.principal_id,
        "workspace_change_proposal.principal_id",
      ),
      state: expectWorkspaceChangeProposalState(
        value.state,
        "workspace_change_proposal.state",
      ),
      createdAt: expectNumber(
        value.created_at,
        "workspace_change_proposal.created_at",
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_change_proposal.updated_at",
      ),
    },
    {
      title: optionalString(value.title, "workspace_change_proposal.title"),
      summary: optionalString(
        value.summary,
        "workspace_change_proposal.summary",
      ),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(
        value.closed_at,
        "workspace_change_proposal.closed_at",
      ),
    },
  );
}

export function fromRpcWorkspaceChangeProposalOperationRecord(
  value: JsonValue,
): WorkspaceChangeProposalOperationRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change proposal operation must be an object");
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_change_proposal_operation.id"),
      proposalId: expectString(
        value.proposal_id,
        "workspace_change_proposal_operation.proposal_id",
      ),
      operation: expectWorkspaceChangeProposalOperationKind(
        value.operation,
        "workspace_change_proposal_operation.operation",
      ),
      actorId: expectString(
        value.actor_id,
        "workspace_change_proposal_operation.actor_id",
      ),
      fromState: expectWorkspaceChangeProposalState(
        value.from_state,
        "workspace_change_proposal_operation.from_state",
      ),
      toState: expectWorkspaceChangeProposalState(
        value.to_state,
        "workspace_change_proposal_operation.to_state",
      ),
      createdAt: expectNumber(
        value.created_at,
        "workspace_change_proposal_operation.created_at",
      ),
    },
    {
      reason: optionalString(
        value.reason,
        "workspace_change_proposal_operation.reason",
      ),
      metadata: value.metadata ?? undefined,
    },
  );
}

export function fromRpcWorkspaceChangeProposalApplyAttemptRecord(
  value: JsonValue,
): WorkspaceChangeProposalApplyAttemptRecord {
  if (!isRecord(value)) {
    throw new Error(
      "workspace change proposal apply attempt must be an object",
    );
  }
  const state = expectString(
    value.state,
    "workspace_change_proposal_apply_attempt.state",
  );
  if (
    state !== "active" &&
    state !== "applied" &&
    state !== "failed" &&
    state !== "recovery_required"
  ) {
    throw new Error(`invalid workspace proposal apply attempt state: ${state}`);
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_change_proposal_apply_attempt.id"),
      proposalId: expectString(
        value.proposal_id,
        "workspace_change_proposal_apply_attempt.proposal_id",
      ),
      ownerId: expectString(
        value.owner_id,
        "workspace_change_proposal_apply_attempt.owner_id",
      ),
      state,
      leaseExpiresAt: expectNumber(
        value.lease_expires_at,
        "workspace_change_proposal_apply_attempt.lease_expires_at",
      ),
      claimedAt: expectNumber(
        value.claimed_at,
        "workspace_change_proposal_apply_attempt.claimed_at",
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_change_proposal_apply_attempt.updated_at",
      ),
    },
    {
      workspaceOperationId: optionalString(
        value.workspace_operation_id,
        "workspace_change_proposal_apply_attempt.workspace_operation_id",
      ),
      metadata: value.metadata ?? undefined,
      failure: value.failure ?? undefined,
      finishedAt: optionalNumber(
        value.finished_at,
        "workspace_change_proposal_apply_attempt.finished_at",
      ),
    },
  );
}

export function fromRpcWorkspaceChangeProposalApplyClaimResult(
  value: JsonValue,
): WorkspaceChangeProposalApplyClaimResult {
  if (!isRecord(value)) {
    throw new Error("workspace proposal apply claim result must be an object");
  }
  const status = expectString(value.status, "workspace_apply_claim.status");
  if (
    status !== "claimed" &&
    status !== "busy" &&
    status !== "recovery_required" &&
    status !== "not_ready" &&
    status !== "already_terminal"
  ) {
    throw new Error(`invalid workspace proposal apply claim status: ${status}`);
  }
  return {
    status,
    proposal: fromRpcWorkspaceChangeProposalRecord(
      expectJsonField(value, "proposal", "workspace_apply_claim.proposal"),
    ),
    ...(value.attempt === null || value.attempt === undefined
      ? {}
      : {
          attempt: fromRpcWorkspaceChangeProposalApplyAttemptRecord(
            expectJsonField(value, "attempt", "workspace_apply_claim.attempt"),
          ),
        }),
  };
}

export function fromRpcWorkspaceChangeProposalApplySettlement(
  value: JsonValue,
): WorkspaceChangeProposalApplySettlement {
  if (!isRecord(value)) {
    throw new Error("workspace proposal apply settlement must be an object");
  }
  return {
    proposal: fromRpcWorkspaceChangeProposalRecord(
      expectJsonField(value, "proposal", "workspace_apply_settlement.proposal"),
    ),
    attempt: fromRpcWorkspaceChangeProposalApplyAttemptRecord(
      expectJsonField(value, "attempt", "workspace_apply_settlement.attempt"),
    ),
  };
}

export function fromRpcWorkspaceChangeProposalRecoveryResult(
  value: JsonValue,
): WorkspaceChangeProposalRecoveryResult {
  if (!isRecord(value)) {
    throw new Error("workspace proposal recovery result must be an object");
  }
  const status = expectString(value.status, "workspace_apply_recovery.status");
  if (status !== "marked" && status !== "not_due" && status !== "unchanged") {
    throw new Error(`invalid workspace proposal recovery status: ${status}`);
  }
  return {
    status,
    proposal: fromRpcWorkspaceChangeProposalRecord(
      expectJsonField(value, "proposal", "workspace_apply_recovery.proposal"),
    ),
    ...(value.attempt === null || value.attempt === undefined
      ? {}
      : {
          attempt: fromRpcWorkspaceChangeProposalApplyAttemptRecord(
            expectJsonField(
              value,
              "attempt",
              "workspace_apply_recovery.attempt",
            ),
          ),
        }),
  };
}

export function fromRpcWorkspaceChangeTransactionRecord(
  value: JsonValue,
): WorkspaceChangeTransactionRecord {
  if (!isRecord(value)) {
    throw new Error("workspace transaction must be an object");
  }
  const operation = expectString(
    value.operation,
    "workspace_transaction.operation",
  );
  if (operation !== "apply" && operation !== "undo") {
    throw new Error(`invalid workspace transaction operation: ${operation}`);
  }
  const sourceKind = expectString(
    value.source_kind,
    "workspace_transaction.source_kind",
  );
  if (
    sourceKind !== "proposal" &&
    sourceKind !== "tool" &&
    sourceKind !== "host"
  ) {
    throw new Error(`invalid workspace transaction source kind: ${sourceKind}`);
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_transaction.id"),
      workspaceId: expectString(
        value.workspace_id,
        "workspace_transaction.workspace_id",
      ),
      changeSetId: expectString(
        value.changeset_id,
        "workspace_transaction.changeset_id",
      ),
      operation,
      sourceKind,
      sourceId: expectString(
        value.source_id,
        "workspace_transaction.source_id",
      ),
      idempotencyKey: expectString(
        value.idempotency_key,
        "workspace_transaction.idempotency_key",
      ),
      rootIdentitySha256: expectString(
        value.root_identity_sha256,
        "workspace_transaction.root_identity_sha256",
      ),
      state: expectWorkspaceChangeTransactionState(
        value.state,
        "workspace_transaction.state",
      ),
      createdAt: expectNumber(
        value.created_at,
        "workspace_transaction.created_at",
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_transaction.updated_at",
      ),
    },
    {
      undoSourceOperationId: optionalString(
        value.undo_source_operation_id,
        "workspace_transaction.undo_source_operation_id",
      ),
      proposalApplyAttemptId: optionalString(
        value.proposal_apply_attempt_id,
        "workspace_transaction.proposal_apply_attempt_id",
      ),
      planDigest: optionalString(
        value.plan_digest,
        "workspace_transaction.plan_digest",
      ),
      recoveryDecision:
        value.recovery_decision === null ||
        value.recovery_decision === undefined
          ? undefined
          : expectWorkspaceChangeTransactionRecoveryDecision(
              value.recovery_decision,
              "workspace_transaction.recovery_decision",
            ),
      workspaceOperationId: optionalString(
        value.workspace_operation_id,
        "workspace_transaction.workspace_operation_id",
      ),
      failure: value.failure ?? undefined,
      finishedAt: optionalNumber(
        value.finished_at,
        "workspace_transaction.finished_at",
      ),
    },
  );
}

export function fromRpcWorkspaceChangeTransactionFileRecord(
  value: JsonValue,
): WorkspaceChangeTransactionFileRecord {
  if (!isRecord(value)) {
    throw new Error("workspace transaction file must be an object");
  }
  return withOptionalFields(
    {
      transactionId: expectString(
        value.transaction_id,
        "workspace_transaction_file.transaction_id",
      ),
      ordinal: expectNumber(
        value.ordinal,
        "workspace_transaction_file.ordinal",
      ),
      path: expectString(value.path, "workspace_transaction_file.path"),
      state: expectWorkspaceChangeTransactionFileState(
        value.state,
        "workspace_transaction_file.state",
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_transaction_file.updated_at",
      ),
    },
    {
      beforeText: optionalString(
        value.before_text,
        "workspace_transaction_file.before_text",
      ),
      beforeSha256: optionalString(
        value.before_sha256,
        "workspace_transaction_file.before_sha256",
      ),
      afterText: optionalString(
        value.after_text,
        "workspace_transaction_file.after_text",
      ),
      afterSha256: optionalString(
        value.after_sha256,
        "workspace_transaction_file.after_sha256",
      ),
    },
  );
}

export function fromRpcWorkspaceChangeTransactionAttemptRecord(
  value: JsonValue,
): WorkspaceChangeTransactionAttemptRecord {
  if (!isRecord(value)) {
    throw new Error("workspace transaction attempt must be an object");
  }
  const kind = expectString(value.kind, "workspace_transaction_attempt.kind");
  if (kind !== "execution" && kind !== "recovery") {
    throw new Error(`invalid workspace transaction attempt kind: ${kind}`);
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_transaction_attempt.id"),
      transactionId: expectString(
        value.transaction_id,
        "workspace_transaction_attempt.transaction_id",
      ),
      ownerId: expectString(
        value.owner_id,
        "workspace_transaction_attempt.owner_id",
      ),
      kind,
      state: expectWorkspaceChangeTransactionAttemptState(
        value.state,
        "workspace_transaction_attempt.state",
      ),
      leaseExpiresAt: expectNumber(
        value.lease_expires_at,
        "workspace_transaction_attempt.lease_expires_at",
      ),
      startedAt: expectNumber(
        value.started_at,
        "workspace_transaction_attempt.started_at",
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_transaction_attempt.updated_at",
      ),
    },
    {
      failure: value.failure ?? undefined,
      finishedAt: optionalNumber(
        value.finished_at,
        "workspace_transaction_attempt.finished_at",
      ),
    },
  );
}

export function fromRpcWorkspaceChangeTransactionSnapshot(
  value: JsonValue,
): WorkspaceChangeTransactionSnapshot {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new Error("workspace transaction snapshot must contain a file array");
  }
  return {
    transaction: fromRpcWorkspaceChangeTransactionRecord(
      expectJsonField(
        value,
        "transaction",
        "workspace_transaction_snapshot.transaction",
      ),
    ),
    files: value.files.map(fromRpcWorkspaceChangeTransactionFileRecord),
    ...(value.active_attempt === null || value.active_attempt === undefined
      ? {}
      : {
          activeAttempt: fromRpcWorkspaceChangeTransactionAttemptRecord(
            expectJsonField(
              value,
              "active_attempt",
              "workspace_transaction_snapshot.active_attempt",
            ),
          ),
        }),
  };
}

export function fromRpcWorkspaceChangeTransactionClaimResult(
  value: JsonValue,
): WorkspaceChangeTransactionClaimResult {
  if (!isRecord(value)) {
    throw new Error("workspace transaction claim result must be an object");
  }
  const status = expectString(
    value.status,
    "workspace_transaction_claim.status",
  );
  if (
    status !== "claimed" &&
    status !== "busy" &&
    status !== "recovery_required" &&
    status !== "already_terminal"
  ) {
    throw new Error(`invalid workspace transaction claim status: ${status}`);
  }
  return {
    status,
    snapshot: fromRpcWorkspaceChangeTransactionSnapshot(
      expectJsonField(
        value,
        "snapshot",
        "workspace_transaction_claim.snapshot",
      ),
    ),
  };
}

export function fromRpcWorkspaceChangeTransactionReconciliation(
  value: JsonValue,
): WorkspaceChangeTransactionReconciliation {
  if (!isRecord(value)) {
    throw new Error("workspace transaction reconciliation must be an object");
  }
  return {
    decision: expectWorkspaceChangeTransactionRecoveryDecision(
      value.decision,
      "workspace_transaction_reconciliation.decision",
    ),
    snapshot: fromRpcWorkspaceChangeTransactionSnapshot(
      expectJsonField(
        value,
        "snapshot",
        "workspace_transaction_reconciliation.snapshot",
      ),
    ),
  };
}

export function fromRpcWorkspaceChangeTransactionFinalization(
  value: JsonValue,
): WorkspaceChangeTransactionFinalization {
  if (!isRecord(value)) {
    throw new Error("workspace transaction finalization must be an object");
  }
  return {
    snapshot: fromRpcWorkspaceChangeTransactionSnapshot(
      expectJsonField(
        value,
        "snapshot",
        "workspace_transaction_finalization.snapshot",
      ),
    ),
    ...(value.operation === null || value.operation === undefined
      ? {}
      : {
          operation: fromRpcWorkspaceChangeOperationRecord(
            expectJsonField(
              value,
              "operation",
              "workspace_transaction_finalization.operation",
            ),
          ),
        }),
    ...(value.proposal === null || value.proposal === undefined
      ? {}
      : {
          proposal: fromRpcWorkspaceChangeProposalRecord(
            expectJsonField(
              value,
              "proposal",
              "workspace_transaction_finalization.proposal",
            ),
          ),
        }),
    ...(value.proposal_attempt === null || value.proposal_attempt === undefined
      ? {}
      : {
          proposalAttempt: fromRpcWorkspaceChangeProposalApplyAttemptRecord(
            expectJsonField(
              value,
              "proposal_attempt",
              "workspace_transaction_finalization.proposal_attempt",
            ),
          ),
        }),
  };
}
