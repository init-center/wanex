import type {
  ExecuteApprovedPlanReceipt,
  JsonValue,
  PlanProposalOperationRecord,
  PlanProposalRecord
} from "@wanex/protocol"

import {
  expectArray,
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import { fromRpcSubmitSessionTurnReceipt } from "./codec-session-input-records.js"
import {
  expectPlanProposalOperationKind,
  expectPlanProposalState,
  optionalPlanContent,
  optionalPlanExecution,
  planGenerationFromJson,
  planReferenceFromJson,
  planSourceFromJson,
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
      revision: expectNumber(value.revision, "plan_proposal.revision"),
      source: planSourceFromJson(
        expectJsonField(value, "source", "plan_proposal.source")
      ),
      generation: planGenerationFromJson(
        expectJsonField(value, "generation", "plan_proposal.generation")
      ),
      title: expectString(value.title, "plan_proposal.title"),
      summary: expectString(value.summary, "plan_proposal.summary"),
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
      execution: optionalPlanExecution(
        value.execution,
        "plan_proposal.execution"
      ),
      decidedAt: optionalNumber(value.decided_at, "plan_proposal.decided_at")
    }
  )
}

export function fromRpcPlanProposalOperationRecord(
  value: JsonValue
): PlanProposalOperationRecord {
  if (!isRecord(value)) {
    throw new Error("plan proposal operation must be an object")
  }
  const actorKind = expectString(
    value.actor_kind,
    "plan_proposal_operation.actor_kind"
  )
  if (actorKind !== "human") {
    throw new Error(`invalid plan proposal actor kind: ${actorKind}`)
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
      actor: {
        kind: actorKind,
        id: expectString(value.actor_id, "plan_proposal_operation.actor_id")
      },
      fromState: expectPlanProposalState(
        value.from_state,
        "plan_proposal_operation.from_state"
      ),
      toState: expectPlanProposalState(
        value.to_state,
        "plan_proposal_operation.to_state"
      ),
      fromRevision: expectNumber(
        value.from_revision,
        "plan_proposal_operation.from_revision"
      ),
      toRevision: expectNumber(
        value.to_revision,
        "plan_proposal_operation.to_revision"
      ),
      createdAt: expectNumber(
        value.created_at,
        "plan_proposal_operation.created_at"
      )
    },
    {
      content: optionalPlanContent(
        value.content,
        "plan_proposal_operation.content"
      ),
      reason: optionalString(value.reason, "plan_proposal_operation.reason")
    }
  )
}

export function fromRpcExecuteApprovedPlanReceipt(
  value: JsonValue
): ExecuteApprovedPlanReceipt {
  if (!isRecord(value)) {
    throw new Error("execute approved plan receipt must be an object")
  }
  return {
    proposal: fromRpcPlanProposalRecord(
      expectJsonField(value, "proposal", "execute approved plan proposal")
    ),
    submission: fromRpcSubmitSessionTurnReceipt(
      expectJsonField(value, "submission", "execute approved plan submission")
    )
  }
}
