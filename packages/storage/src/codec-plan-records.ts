import {
  type JsonValue,
  type PlanProposalOperationRecord,
  type PlanProposalRecord
} from "@wanex/protocol"

import {
  expectArray,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectPlanProposalOperationKind,
  expectPlanProposalState,
  planReferenceFromJson,
  planStepFromJson
} from "./codec-plan-values.js"

export function fromRpcPlanProposalRecord(
  value: JsonValue
): PlanProposalRecord {
  if (!isRecord(value)) {
    throw new Error("plan proposal must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "plan_proposal.id"),
      principalId: expectString(
        value.principal_id,
        "plan_proposal.principal_id"
      ),
      steps: expectArray(value.steps, "plan_proposal.steps").map(
        planStepFromJson
      ),
      references: expectArray(
        value.references,
        "plan_proposal.references"
      ).map(planReferenceFromJson),
      state: expectPlanProposalState(value.state, "plan_proposal.state"),
      createdAt: expectNumber(value.created_at, "plan_proposal.created_at"),
      updatedAt: expectNumber(value.updated_at, "plan_proposal.updated_at")
    },
    {
      title: optionalString(value.title, "plan_proposal.title"),
      summary: optionalString(value.summary, "plan_proposal.summary"),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(value.closed_at, "plan_proposal.closed_at")
    }
  )
}

export function fromRpcPlanProposalOperationRecord(
  value: JsonValue
): PlanProposalOperationRecord {
  if (!isRecord(value)) {
    throw new Error("plan proposal operation must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "plan_proposal_operation.id"),
      proposalId: expectString(
        value.proposal_id,
        "plan_proposal_operation.proposal_id"
      ),
      operation: expectPlanProposalOperationKind(
        value.operation,
        "plan_proposal_operation.operation"
      ),
      actorId: expectString(
        value.actor_id,
        "plan_proposal_operation.actor_id"
      ),
      fromState: expectPlanProposalState(
        value.from_state,
        "plan_proposal_operation.from_state"
      ),
      toState: expectPlanProposalState(
        value.to_state,
        "plan_proposal_operation.to_state"
      ),
      createdAt: expectNumber(
        value.created_at,
        "plan_proposal_operation.created_at"
      )
    },
    {
      reason: optionalString(value.reason, "plan_proposal_operation.reason"),
      metadata: value.metadata ?? undefined
    }
  )
}
