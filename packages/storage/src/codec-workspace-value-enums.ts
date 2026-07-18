import {
  type WorkspaceChangeOperationRecord,
  type WorkspaceChangeProposalOperationRecord,
  type WorkspaceChangeProposalRecord,
  type WorkspaceChangeSetRecord,
  type WorkspaceChangeSetReceipt
} from "@wanex/protocol"

import { expectString } from "./codec-common.js"

export function expectWorkspaceChangeSetState(
  value: unknown,
  name: string
): WorkspaceChangeSetRecord["currentState"] {
  const state = expectString(value, name)
  if (
    state !== "submitted" &&
    state !== "applied" &&
    state !== "already_applied" &&
    state !== "conflicted" &&
    state !== "undone" &&
    state !== "undo_conflicted"
  ) {
    throw new Error(`invalid workspace changeset state: ${state}`)
  }
  return state
}

export function expectWorkspaceChangeOperationKind(
  value: unknown,
  name: string
): WorkspaceChangeOperationRecord["operation"] {
  const operation = expectString(value, name)
  if (operation !== "apply" && operation !== "undo") {
    throw new Error(`invalid workspace change operation: ${operation}`)
  }
  return operation
}

export function expectWorkspaceChangeProposalState(
  value: unknown,
  name: string
): WorkspaceChangeProposalRecord["state"] {
  const state = expectString(value, name)
  if (
    state !== "open" &&
    state !== "approved" &&
    state !== "rejected" &&
    state !== "withdrawn" &&
    state !== "apply_requested" &&
    state !== "applied" &&
    state !== "apply_failed"
  ) {
    throw new Error(`invalid workspace change proposal state: ${state}`)
  }
  return state
}

export function expectWorkspaceChangeProposalOperationKind(
  value: unknown,
  name: string
): WorkspaceChangeProposalOperationRecord["operation"] {
  const operation = expectString(value, name)
  if (
    operation !== "approve" &&
    operation !== "reject" &&
    operation !== "withdraw" &&
    operation !== "request_apply" &&
    operation !== "mark_applied" &&
    operation !== "mark_apply_failed"
  ) {
    throw new Error(`invalid workspace change proposal operation: ${operation}`)
  }
  return operation
}

export function expectWorkspaceChangeApplyStatus(
  value: unknown,
  name: string
): WorkspaceChangeSetReceipt["status"] {
  const status = expectString(value, name)
  if (
    status !== "applied" &&
    status !== "already_applied" &&
    status !== "conflicted"
  ) {
    throw new Error(`invalid workspace change status: ${status}`)
  }
  return status
}
