import {
  type WorkspaceChangeOperationRecord,
  type WorkspaceChangeProposalOperationRecord,
  type WorkspaceChangeProposalRecord,
  type WorkspaceChangeSetRecord,
  type WorkspaceChangeSetReceipt,
  type WorkspaceChangeTransactionAttemptRecord,
  type WorkspaceChangeTransactionFileRecord,
  type WorkspaceChangeTransactionRecord,
  type WorkspaceChangeTransactionRecoveryDecision,
  type WorkspaceTaskAttemptRecord,
  type WorkspaceTaskRunRecord,
} from "@wanex/protocol";

import { expectString } from "./codec-common.js";

export function expectWorkspaceChangeSetState(
  value: unknown,
  name: string,
): WorkspaceChangeSetRecord["currentState"] {
  const state = expectString(value, name);
  if (
    state !== "submitted" &&
    state !== "applied" &&
    state !== "already_applied" &&
    state !== "conflicted" &&
    state !== "undone" &&
    state !== "undo_conflicted"
  ) {
    throw new Error(`invalid workspace changeset state: ${state}`);
  }
  return state;
}

export function expectWorkspaceTaskRunState(
  value: unknown,
  name: string,
): WorkspaceTaskRunRecord["state"] {
  const state = expectString(value, name);
  if (
    state !== "preparing" &&
    state !== "active" &&
    state !== "collecting" &&
    state !== "proposed" &&
    state !== "releasing" &&
    state !== "released" &&
    state !== "attention"
  ) {
    throw new Error(`invalid workspace task run state: ${state}`);
  }
  return state;
}

export function expectWorkspaceTaskAttemptState(
  value: unknown,
  name: string,
): WorkspaceTaskAttemptRecord["state"] {
  const state = expectString(value, name);
  if (
    state !== "active" &&
    state !== "completed" &&
    state !== "failed" &&
    state !== "expired"
  ) {
    throw new Error(`invalid workspace task attempt state: ${state}`);
  }
  return state;
}

export function expectWorkspaceChangeOperationKind(
  value: unknown,
  name: string,
): WorkspaceChangeOperationRecord["operation"] {
  const operation = expectString(value, name);
  if (operation !== "apply" && operation !== "undo") {
    throw new Error(`invalid workspace change operation: ${operation}`);
  }
  return operation;
}

export function expectWorkspaceChangeProposalState(
  value: unknown,
  name: string,
): WorkspaceChangeProposalRecord["state"] {
  const state = expectString(value, name);
  if (
    state !== "open" &&
    state !== "approved" &&
    state !== "rejected" &&
    state !== "withdrawn" &&
    state !== "apply_requested" &&
    state !== "applying" &&
    state !== "applied" &&
    state !== "apply_failed" &&
    state !== "recovery_required"
  ) {
    throw new Error(`invalid workspace change proposal state: ${state}`);
  }
  return state;
}

export function expectWorkspaceChangeProposalOperationKind(
  value: unknown,
  name: string,
): WorkspaceChangeProposalOperationRecord["operation"] {
  const operation = expectString(value, name);
  if (
    operation !== "approve" &&
    operation !== "reject" &&
    operation !== "withdraw" &&
    operation !== "request_apply"
  ) {
    throw new Error(
      `invalid workspace change proposal operation: ${operation}`,
    );
  }
  return operation;
}

export function expectWorkspaceChangeApplyStatus(
  value: unknown,
  name: string,
): WorkspaceChangeSetReceipt["status"] {
  const status = expectString(value, name);
  if (
    status !== "applied" &&
    status !== "already_applied" &&
    status !== "conflicted"
  ) {
    throw new Error(`invalid workspace change status: ${status}`);
  }
  return status;
}

export function expectWorkspaceChangeTransactionState(
  value: unknown,
  name: string,
): WorkspaceChangeTransactionRecord["state"] {
  const state = expectString(value, name);
  if (
    state !== "planning" &&
    state !== "prepared" &&
    state !== "committing" &&
    state !== "applied" &&
    state !== "rolled_back" &&
    state !== "recovery_required"
  ) {
    throw new Error(`invalid workspace transaction state: ${state}`);
  }
  return state;
}

export function expectWorkspaceChangeTransactionFileState(
  value: unknown,
  name: string,
): WorkspaceChangeTransactionFileRecord["state"] {
  const state = expectString(value, name);
  if (state !== "pending" && state !== "prepared" && state !== "committed") {
    throw new Error(`invalid workspace transaction file state: ${state}`);
  }
  return state;
}

export function expectWorkspaceChangeTransactionAttemptState(
  value: unknown,
  name: string,
): WorkspaceChangeTransactionAttemptRecord["state"] {
  const state = expectString(value, name);
  if (state !== "active" && state !== "completed" && state !== "failed") {
    throw new Error(`invalid workspace transaction attempt state: ${state}`);
  }
  return state;
}

export function expectWorkspaceChangeTransactionRecoveryDecision(
  value: unknown,
  name: string,
): WorkspaceChangeTransactionRecoveryDecision {
  const decision = expectString(value, name);
  if (
    decision !== "rollback_noop" &&
    decision !== "finish_forward" &&
    decision !== "finalize" &&
    decision !== "attention"
  ) {
    throw new Error(
      `invalid workspace transaction recovery decision: ${decision}`,
    );
  }
  return decision;
}
