import {
  type JsonValue,
  type WorkspaceChangeOperationRecord,
  type WorkspaceChangeProposalOperationRecord,
  type WorkspaceChangeProposalRecord,
  type WorkspaceChangeSetRecord
} from "@wanex/protocol"

import {
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-common.js"
import {
  expectWorkspaceChangeApplyStatus,
  expectWorkspaceChangeOperationKind,
  expectWorkspaceChangeProposalOperationKind,
  expectWorkspaceChangeProposalState,
  expectWorkspaceChangeSetState,
  workspaceChangeReceiptFromJson,
  workspaceChangeSetFromJson
} from "./codec-workspace-values.js"

export function fromRpcWorkspaceChangeSetRecord(
  value: JsonValue
): WorkspaceChangeSetRecord {
  if (!isRecord(value)) {
    throw new Error("workspace changeset must be an object")
  }
  return {
    id: expectString(value.id, "workspace_changeset.id"),
    workspaceId: expectString(
      value.workspace_id,
      "workspace_changeset.workspace_id"
    ),
    principalId: expectString(
      value.principal_id,
      "workspace_changeset.principal_id"
    ),
    changeSet: workspaceChangeSetFromJson(
      expectJsonField(value, "changeset", "workspace_changeset.changeset")
    ),
    currentState: expectWorkspaceChangeSetState(
      value.current_state,
      "workspace_changeset.current_state"
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
            "workspace_changeset.base_revision"
          )
        })
  }
}

export function fromRpcWorkspaceChangeOperationRecord(
  value: JsonValue
): WorkspaceChangeOperationRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change operation must be an object")
  }
  return {
    id: expectString(value.id, "workspace_change_operation.id"),
    changeSetId: expectString(
      value.changeset_id,
      "workspace_change_operation.changeset_id"
    ),
    operation: expectWorkspaceChangeOperationKind(
      value.operation,
      "workspace_change_operation.operation"
    ),
    status: expectWorkspaceChangeApplyStatus(
      value.status,
      "workspace_change_operation.status"
    ),
    receipt: workspaceChangeReceiptFromJson(
      expectJsonField(value, "receipt", "workspace_change_operation.receipt")
    ),
    createdAt: expectNumber(
      value.created_at,
      "workspace_change_operation.created_at"
    )
  }
}

export function fromRpcWorkspaceChangeProposalRecord(
  value: JsonValue
): WorkspaceChangeProposalRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change proposal must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_change_proposal.id"),
      workspaceId: expectString(
        value.workspace_id,
        "workspace_change_proposal.workspace_id"
      ),
      changeSetId: expectString(
        value.changeset_id,
        "workspace_change_proposal.changeset_id"
      ),
      principalId: expectString(
        value.principal_id,
        "workspace_change_proposal.principal_id"
      ),
      state: expectWorkspaceChangeProposalState(
        value.state,
        "workspace_change_proposal.state"
      ),
      createdAt: expectNumber(
        value.created_at,
        "workspace_change_proposal.created_at"
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "workspace_change_proposal.updated_at"
      )
    },
    {
      title: optionalString(value.title, "workspace_change_proposal.title"),
      summary: optionalString(
        value.summary,
        "workspace_change_proposal.summary"
      ),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(
        value.closed_at,
        "workspace_change_proposal.closed_at"
      )
    }
  )
}

export function fromRpcWorkspaceChangeProposalOperationRecord(
  value: JsonValue
): WorkspaceChangeProposalOperationRecord {
  if (!isRecord(value)) {
    throw new Error("workspace change proposal operation must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_change_proposal_operation.id"),
      proposalId: expectString(
        value.proposal_id,
        "workspace_change_proposal_operation.proposal_id"
      ),
      operation: expectWorkspaceChangeProposalOperationKind(
        value.operation,
        "workspace_change_proposal_operation.operation"
      ),
      actorId: expectString(
        value.actor_id,
        "workspace_change_proposal_operation.actor_id"
      ),
      fromState: expectWorkspaceChangeProposalState(
        value.from_state,
        "workspace_change_proposal_operation.from_state"
      ),
      toState: expectWorkspaceChangeProposalState(
        value.to_state,
        "workspace_change_proposal_operation.to_state"
      ),
      createdAt: expectNumber(
        value.created_at,
        "workspace_change_proposal_operation.created_at"
      )
    },
    {
      reason: optionalString(
        value.reason,
        "workspace_change_proposal_operation.reason"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}
