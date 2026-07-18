import {
  type JsonValue,
  type PlanProposalOperationRecord,
  type PlanProposalRecord,
  type PlanProposalReference,
  type PlanProposalStep
} from "@wanex/protocol"

import {
  expectString,
  isRecord,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"

export function planStepToJson(step: PlanProposalStep): JsonValue {
  return {
    ...(step.id === undefined ? {} : { id: step.id }),
    title: step.title,
    ...(step.detail === undefined ? {} : { detail: step.detail }),
    ...(step.status === undefined ? {} : { status: step.status }),
    ...(step.metadata === undefined ? {} : { metadata: step.metadata })
  }
}

export function planReferenceToJson(reference: PlanProposalReference): JsonValue {
  return {
    kind: reference.kind,
    reference_id: reference.id,
    ...(reference.role === undefined ? {} : { role: reference.role }),
    ...(reference.metadata === undefined
      ? {}
      : { metadata: reference.metadata })
  }
}

export function planStepFromJson(value: JsonValue): PlanProposalStep {
  if (!isRecord(value)) {
    throw new Error("plan proposal step must be an object")
  }
  return withOptionalFields(
    {
      title: expectString(value.title, "plan_proposal_step.title")
    },
    {
      id: optionalString(value.id, "plan_proposal_step.id"),
      detail: optionalString(value.detail, "plan_proposal_step.detail"),
      status:
        value.status === null || value.status === undefined
          ? undefined
          : expectPlanStepStatus(value.status, "plan_proposal_step.status"),
      metadata: value.metadata ?? undefined
    }
  )
}

export function planReferenceFromJson(
  value: JsonValue
): PlanProposalReference {
  if (!isRecord(value)) {
    throw new Error("plan proposal reference must be an object")
  }
  return withOptionalFields(
    {
      kind: expectPlanReferenceKind(value.kind, "plan_proposal_reference.kind"),
      id: expectString(
        value.reference_id,
        "plan_proposal_reference.reference_id"
      )
    },
    {
      role: optionalString(value.role, "plan_proposal_reference.role"),
      metadata: value.metadata ?? undefined
    }
  )
}

export function expectPlanProposalState(
  value: unknown,
  name: string
): PlanProposalRecord["state"] {
  const state = expectString(value, name)
  if (
    state !== "open" &&
    state !== "approved" &&
    state !== "rejected" &&
    state !== "withdrawn" &&
    state !== "execution_requested" &&
    state !== "executed" &&
    state !== "execution_failed"
  ) {
    throw new Error(`invalid plan proposal state: ${state}`)
  }
  return state
}

export function expectPlanProposalOperationKind(
  value: unknown,
  name: string
): PlanProposalOperationRecord["operation"] {
  const operation = expectString(value, name)
  if (
    operation !== "approve" &&
    operation !== "reject" &&
    operation !== "withdraw" &&
    operation !== "request_execution" &&
    operation !== "mark_executed" &&
    operation !== "mark_execution_failed"
  ) {
    throw new Error(`invalid plan proposal operation: ${operation}`)
  }
  return operation
}

function expectPlanStepStatus(
  value: unknown,
  name: string
): PlanProposalStep["status"] {
  const status = expectString(value, name)
  if (
    status !== "pending" &&
    status !== "in_progress" &&
    status !== "completed" &&
    status !== "blocked"
  ) {
    throw new Error(`invalid plan proposal step status: ${status}`)
  }
  return status
}

function expectPlanReferenceKind(
  value: unknown,
  name: string
): PlanProposalReference["kind"] {
  const kind = expectString(value, name)
  if (
    kind !== "session" &&
    kind !== "session_input" &&
    kind !== "session_run" &&
    kind !== "scheduler_job" &&
    kind !== "workspace_change_proposal" &&
    kind !== "delegation_graph" &&
    kind !== "delegation_graph_node" &&
    kind !== "team_conversation" &&
    kind !== "resource" &&
    kind !== "context_epoch"
  ) {
    throw new Error(`invalid plan proposal reference kind: ${kind}`)
  }
  return kind
}
