import type {
  DeferredTeamDelegationOperationReceipt,
  DeferredTeamDelegationOperationRequest,
  JsonValue,
  TeamDelegationOperationRecord,
  TeamDelegationTaskRecord
} from "@wanex/protocol"
import type { DeferredTeamDelegationOperationWire } from "./generated/storage-rpc.js"
import {
  assertArray,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import { toRpcJsonValueFromUnknown } from "./codec-common.js"
import {
  fromRpcDelegationGraphDependencyRecord,
  fromRpcDelegationGraphNodeRecord,
  fromRpcDelegationGraphRecord
} from "./codec-graph-records.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import { readExecutionBinding } from "./codec-session-turn-records.js"

export function toRpcDeferredTeamDelegationOperation(
  operation: DeferredTeamDelegationOperationRequest
): DeferredTeamDelegationOperationWire {
  return {
    kind: operation.kind,
    operation_id: operation.operationId,
    conversation_id: operation.conversationId,
    source_delivery_id: operation.sourceDeliveryId,
    lead_participant_id: operation.leadParticipantId,
    graph_id: operation.graphId,
    tasks: operation.tasks.map((task) => ({
      id: task.id,
      graph_node_id: task.graphNodeId,
      target_participant_id: task.targetParticipantId,
      target_session_id: task.targetSessionId,
      prompt: task.prompt,
      depends_on_task_ids: [...task.dependsOnTaskIds],
      child_input_id: task.childInputId,
      child_turn_id: task.childTurnId,
      child_job_id: task.childJobId,
      input_idempotency_key: task.inputIdempotencyKey,
      job_idempotency_key: task.jobIdempotencyKey,
      execution_binding: toRpcJsonValueFromUnknown(task.executionBinding),
      max_steps: task.maxSteps ?? null,
      priority: task.priority ?? null
    })) as DeferredTeamDelegationOperationWire["tasks"]
  }
}

export function fromRpcDeferredTeamDelegationOperationReceipt(
  value: Record<string, JsonValue>
): DeferredTeamDelegationOperationReceipt {
  const record = requiredRecord(value.record, "team delegation operation record")
  const graph = requiredJson(value.graph, "team delegation graph")
  const tasks = requiredArray(value.tasks, "team delegation tasks")
  const nodes = requiredArray(value.nodes, "team delegation nodes")
  const dependencies = requiredArray(
    value.dependencies,
    "team delegation dependencies"
  )
  const jobs = requiredArray(value.jobs, "team delegation jobs")
  return {
    kind: "team_delegation",
    record: fromRpcTeamDelegationOperationRecord(record),
    tasks: tasks.map(fromRpcTeamDelegationTaskRecord),
    graph: fromRpcDelegationGraphRecord(graph),
    nodes: nodes.map(fromRpcDelegationGraphNodeRecord),
    dependencies: dependencies.map(fromRpcDelegationGraphDependencyRecord),
    jobs: jobs.map(fromRpcSchedulerJobRecord)
  }
}

export function fromRpcTeamDelegationOperationRecord(
  value: JsonValue
): TeamDelegationOperationRecord {
  const record = requiredRecord(value, "team delegation operation")
  const state = expectString(record.state, "team_delegation_operation.state")
  if (!isTeamDelegationOperationState(state)) {
    throw new Error(`invalid team delegation operation state: ${state}`)
  }
  return withOptionalFields(
    {
      id: expectString(record.id, "team_delegation_operation.id"),
      conversationId: expectString(
        record.conversation_id,
        "team_delegation_operation.conversation_id"
      ),
      sourceDeliveryId: expectString(
        record.source_delivery_id,
        "team_delegation_operation.source_delivery_id"
      ),
      sourceRoutingDecisionId: expectString(
        record.source_routing_decision_id,
        "team_delegation_operation.source_routing_decision_id"
      ),
      sourceDiscussionRoundId: expectString(
        record.source_discussion_round_id,
        "team_delegation_operation.source_discussion_round_id"
      ),
      leadParticipantId: expectString(
        record.lead_participant_id,
        "team_delegation_operation.lead_participant_id"
      ),
      parentSessionId: expectString(
        record.parent_session_id,
        "team_delegation_operation.parent_session_id"
      ),
      parentInputId: expectString(
        record.parent_input_id,
        "team_delegation_operation.parent_input_id"
      ),
      parentTurnId: expectString(
        record.parent_turn_id,
        "team_delegation_operation.parent_turn_id"
      ),
      parentSessionAttemptId: expectString(
        record.parent_session_attempt_id,
        "team_delegation_operation.parent_session_attempt_id"
      ),
      parentSessionJobId: expectString(
        record.parent_session_job_id,
        "team_delegation_operation.parent_session_job_id"
      ),
      parentToolExecutionId: expectString(
        record.parent_tool_execution_id,
        "team_delegation_operation.parent_tool_execution_id"
      ),
      parentToolInvocationAttemptId: expectString(
        record.parent_tool_invocation_attempt_id,
        "team_delegation_operation.parent_tool_invocation_attempt_id"
      ),
      parentToolCallId: expectString(
        record.parent_tool_call_id,
        "team_delegation_operation.parent_tool_call_id"
      ),
      delegationGraphId: expectString(
        record.delegation_graph_id,
        "team_delegation_operation.delegation_graph_id"
      ),
      state,
      idempotencyKey: expectString(
        record.idempotency_key,
        "team_delegation_operation.idempotency_key"
      ),
      createdAt: expectNumber(
        record.created_at,
        "team_delegation_operation.created_at"
      ),
      updatedAt: expectNumber(
        record.updated_at,
        "team_delegation_operation.updated_at"
      )
    },
    {
      finishedAt: optionalNumber(
        record.finished_at,
        "team_delegation_operation.finished_at"
      )
    }
  )
}

export function fromRpcTeamDelegationTaskRecord(
  value: JsonValue
): TeamDelegationTaskRecord {
  const record = requiredRecord(value, "team delegation task")
  return withOptionalFields(
    {
      id: expectString(record.id, "team_delegation_task.id"),
      operationId: expectString(
        record.operation_id,
        "team_delegation_task.operation_id"
      ),
      graphNodeId: expectString(
        record.graph_node_id,
        "team_delegation_task.graph_node_id"
      ),
      targetParticipantId: expectString(
        record.target_participant_id,
        "team_delegation_task.target_participant_id"
      ),
      targetSessionId: expectString(
        record.target_session_id,
        "team_delegation_task.target_session_id"
      ),
      prompt: expectString(record.prompt, "team_delegation_task.prompt"),
      childInputId: expectString(
        record.child_input_id,
        "team_delegation_task.child_input_id"
      ),
      childTurnId: expectString(
        record.child_turn_id,
        "team_delegation_task.child_turn_id"
      ),
      childJobId: expectString(
        record.child_job_id,
        "team_delegation_task.child_job_id"
      ),
      inputIdempotencyKey: expectString(
        record.input_idempotency_key,
        "team_delegation_task.input_idempotency_key"
      ),
      jobIdempotencyKey: expectString(
        record.job_idempotency_key,
        "team_delegation_task.job_idempotency_key"
      ),
      executionBinding: readExecutionBinding(record.execution_binding),
      executionBindingDigest: expectString(
        record.execution_binding_digest,
        "team_delegation_task.execution_binding_digest"
      ),
      createdAt: expectNumber(record.created_at, "team_delegation_task.created_at"),
      updatedAt: expectNumber(record.updated_at, "team_delegation_task.updated_at")
    },
    {
      maxSteps: optionalNumber(record.max_steps, "team_delegation_task.max_steps"),
      priority: optionalNumber(record.priority, "team_delegation_task.priority"),
      materializedAt: optionalNumber(
        record.materialized_at,
        "team_delegation_task.materialized_at"
      )
    }
  )
}

function requiredRecord(value: JsonValue | undefined, label: string): Record<string, JsonValue> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function requiredArray(value: JsonValue | undefined, label: string): JsonValue[] {
  assertArray(value, label)
  return value
}

function requiredJson(value: JsonValue | undefined, label: string): JsonValue {
  if (value === undefined) throw new Error(`${label} must be present`)
  return value
}

function isTeamDelegationOperationState(
  value: string
): value is TeamDelegationOperationRecord["state"] {
  return (
    value === "running" ||
    value === "cancel_requested" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  )
}
