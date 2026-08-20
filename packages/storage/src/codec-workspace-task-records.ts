import type {
  JsonValue,
  WorkspaceTaskAttemptRecord,
  WorkspaceTaskClaimResult,
  WorkspaceTaskRunRecord,
  WorkspaceTaskRunSnapshot,
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
  expectWorkspaceTaskAttemptState,
  expectWorkspaceTaskRunState,
} from "./codec-workspace-value-enums.js";

export function fromRpcWorkspaceTaskRunRecord(
  value: JsonValue,
): WorkspaceTaskRunRecord {
  if (!isRecord(value)) {
    throw new Error("workspace task run must be an object");
  }
  const access = expectString(value.access, "workspace_task_run.access");
  if (access !== "read_only" && access !== "writable") {
    throw new Error(`invalid workspace task access: ${access}`);
  }
  const executionOutcome = optionalString(
    value.execution_outcome,
    "workspace_task_run.execution_outcome",
  );
  if (
    executionOutcome !== undefined &&
    executionOutcome !== "completed" &&
    executionOutcome !== "failed" &&
    executionOutcome !== "cancelled"
  ) {
    throw new Error(
      `invalid workspace task execution outcome: ${executionOutcome}`,
    );
  }
  const outcome = optionalString(value.outcome, "workspace_task_run.outcome");
  if (
    outcome !== undefined &&
    outcome !== "read_only_completed" &&
    outcome !== "no_changes" &&
    outcome !== "proposed" &&
    outcome !== "execution_failed" &&
    outcome !== "cancelled"
  ) {
    throw new Error(`invalid workspace task outcome: ${outcome}`);
  }
  if (!Array.isArray(value.resource_ids)) {
    throw new Error("workspace_task_run.resource_ids must be an array");
  }
  const resourceIds = value.resource_ids.map((resourceId, index) =>
    expectString(resourceId, `workspace_task_run.resource_ids[${index}]`),
  );
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_task_run.id"),
      workspaceId: expectString(value.workspace_id, "workspace_task_run.workspace_id"),
      principalId: expectString(value.principal_id, "workspace_task_run.principal_id"),
      access,
      repositoryId: expectString(value.repository_id, "workspace_task_run.repository_id"),
      isolationId: expectString(value.isolation_id, "workspace_task_run.isolation_id"),
      state: expectWorkspaceTaskRunState(value.state, "workspace_task_run.state"),
      resourceIds,
      createdAt: expectNumber(value.created_at, "workspace_task_run.created_at"),
      updatedAt: expectNumber(value.updated_at, "workspace_task_run.updated_at"),
    },
    {
      baseRevision: optionalString(value.base_revision, "workspace_task_run.base_revision"),
      runtimeRef: optionalString(value.runtime_ref, "workspace_task_run.runtime_ref"),
      executionOutcome,
      outcome,
      summary: optionalString(value.summary, "workspace_task_run.summary"),
      changeSetId: optionalString(value.changeset_id, "workspace_task_run.changeset_id"),
      proposalId: optionalString(value.proposal_id, "workspace_task_run.proposal_id"),
      failure:
        value.failure === null || value.failure === undefined
          ? undefined
          : expectJsonField(value, "failure", "workspace_task_run.failure"),
      finishedAt: optionalNumber(value.finished_at, "workspace_task_run.finished_at"),
    },
  );
}

export function fromRpcWorkspaceTaskAttemptRecord(
  value: JsonValue,
): WorkspaceTaskAttemptRecord {
  if (!isRecord(value)) {
    throw new Error("workspace task attempt must be an object");
  }
  const kind = expectString(value.kind, "workspace_task_attempt.kind");
  if (kind !== "execution" && kind !== "recovery") {
    throw new Error(`invalid workspace task attempt kind: ${kind}`);
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "workspace_task_attempt.id"),
      runId: expectString(value.run_id, "workspace_task_attempt.run_id"),
      ownerId: expectString(value.owner_id, "workspace_task_attempt.owner_id"),
      kind,
      state: expectWorkspaceTaskAttemptState(value.state, "workspace_task_attempt.state"),
      leaseExpiresAt: expectNumber(
        value.lease_expires_at,
        "workspace_task_attempt.lease_expires_at",
      ),
      startedAt: expectNumber(value.started_at, "workspace_task_attempt.started_at"),
      updatedAt: expectNumber(value.updated_at, "workspace_task_attempt.updated_at"),
    },
    {
      failure:
        value.failure === null || value.failure === undefined
          ? undefined
          : expectJsonField(value, "failure", "workspace_task_attempt.failure"),
      finishedAt: optionalNumber(
        value.finished_at,
        "workspace_task_attempt.finished_at",
      ),
    },
  );
}

export function fromRpcWorkspaceTaskRunSnapshot(
  value: JsonValue,
): WorkspaceTaskRunSnapshot {
  if (!isRecord(value)) {
    throw new Error("workspace task snapshot must be an object");
  }
  return {
    run: fromRpcWorkspaceTaskRunRecord(
      expectJsonField(value, "run", "workspace_task_snapshot.run"),
    ),
    ...(value.active_attempt === null || value.active_attempt === undefined
      ? {}
      : {
          activeAttempt: fromRpcWorkspaceTaskAttemptRecord(
            expectJsonField(
              value,
              "active_attempt",
              "workspace_task_snapshot.active_attempt",
            ),
          ),
        }),
  };
}

export function fromRpcWorkspaceTaskClaimResult(
  value: JsonValue,
): WorkspaceTaskClaimResult {
  if (!isRecord(value)) {
    throw new Error("workspace task claim result must be an object");
  }
  const status = expectString(value.status, "workspace_task_claim.status");
  if (
    status !== "claimed" &&
    status !== "busy" &&
    status !== "already_terminal"
  ) {
    throw new Error(`invalid workspace task claim status: ${status}`);
  }
  return {
    status,
    snapshot: fromRpcWorkspaceTaskRunSnapshot(
      expectJsonField(value, "snapshot", "workspace_task_claim.snapshot"),
    ),
  };
}
