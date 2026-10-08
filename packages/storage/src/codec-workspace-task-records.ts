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
import { readExecutionEnvironmentBinding } from "./codec-execution-environment.js";
import { requireExactKeys } from "./codec-model-evidence.js";

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
  const strategy = expectString(value.strategy, "workspace_task_run.strategy");
  if (strategy !== "direct" && strategy !== "git_worktree") {
    throw new Error(`invalid workspace task strategy: ${strategy}`);
  }
  const rootIdentity = expectJsonField(
    value,
    "root_identity",
    "workspace_task_run.root_identity",
  );
  const isolationIdentity = expectJsonField(
    value,
    "isolation_identity",
    "workspace_task_run.isolation_identity",
  );
  if (!isRecord(rootIdentity) || !isRecord(isolationIdentity)) {
    throw new Error("workspace task identities must be objects");
  }
  requireExactKeys(rootIdentity, ["host_id", "generation_key", "root_id", "device", "inode"], "workspace task root identity");
  requireExactKeys(isolationIdentity, ["id", "kind", "repository_id", "base_revision", "runtime_ref"], "workspace task isolation identity");
  for (const key of ["host_id", "generation_key", "root_id"] as const) {
    if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(expectString(rootIdentity[key], key))) {
      throw new Error(`workspace task root ${key} must be an opaque identifier`);
    }
  }
  for (const key of ["device", "inode"] as const) {
    if (!/^[0-9]{1,128}$/u.test(expectString(rootIdentity[key], key))) {
      throw new Error(`workspace task root ${key} must be a decimal identity`);
    }
  }
  const isolationKind = expectString(
    isolationIdentity.kind,
    "workspace_task_run.isolation_identity.kind",
  );
  if (isolationKind !== "fixed" && isolationKind !== "git_worktree") {
    throw new Error(`invalid workspace task isolation kind: ${isolationKind}`);
  }
  const repositoryId = optionalString(isolationIdentity.repository_id, "workspace task repository id");
  const baseRevision = optionalString(isolationIdentity.base_revision, "workspace task base revision");
  const runtimeRef = optionalString(isolationIdentity.runtime_ref, "workspace task runtime ref");
  const state = expectWorkspaceTaskRunState(value.state, "workspace_task_run.state");
  if ((baseRevision === undefined) !== (runtimeRef === undefined) ||
      (strategy === "direct" && (access !== "read_only" || isolationKind !== "fixed" ||
        repositoryId !== undefined || baseRevision !== undefined)) ||
      (strategy === "git_worktree" && (access !== "writable" || isolationKind !== "git_worktree" ||
        repositoryId === undefined || !/^[A-Za-z0-9_.:-]{1,256}$/u.test(repositoryId) ||
        (["active", "collecting", "proposed"].includes(state) && baseRevision === undefined)))) {
    throw new Error("workspace task strategy and isolation evidence are inconsistent");
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
      strategy,
      rootIdentity: {
        hostId: expectString(rootIdentity.host_id, "workspace_task_run.root_identity.host_id"),
        generationKey: expectString(rootIdentity.generation_key, "workspace_task_run.root_identity.generation_key"),
        rootId: expectString(rootIdentity.root_id, "workspace_task_run.root_identity.root_id"),
        device: expectString(rootIdentity.device, "workspace_task_run.root_identity.device"),
        inode: expectString(rootIdentity.inode, "workspace_task_run.root_identity.inode"),
      },
      isolationIdentity: withOptionalFields(
        {
          id: expectString(isolationIdentity.id, "workspace_task_run.isolation_identity.id"),
          kind: isolationKind,
        },
        {
          repositoryId,
          baseRevision,
          runtimeRef,
        },
      ),
      executionEnvironment: readExecutionEnvironmentBinding(
        value.execution_environment,
        "workspace_task_run.execution_environment"
      ),
      state,
      resourceIds,
      createdAt: expectNumber(value.created_at, "workspace_task_run.created_at"),
      updatedAt: expectNumber(value.updated_at, "workspace_task_run.updated_at"),
    },
    {
      jobId: optionalString(value.job_id, "workspace_task_run.job_id"),
      agentId: optionalString(value.agent_id, "workspace_task_run.agent_id"),
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
  if (kind !== "execution" && kind !== "recovery" && kind !== "continuation") {
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
