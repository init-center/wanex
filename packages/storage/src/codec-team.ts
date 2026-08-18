import {
  type AdmitTeamMessageRequest,
  type FailTeamDeliveryMaterializationReceipt,
  type FailTeamDeliveryMaterializationRequest,
  type JsonValue,
  type ListTeamConversationsRequest,
  type ListTeamDeliveriesRequest,
  type ListTeamMessagesRequest,
  type ListTeamParticipantsRequest,
  type ListTeamRoutingDecisionsRequest,
  type MaterializeTeamDeliveryReceipt,
  type MaterializeTeamDeliveryRequest,
  type ProjectTeamDeliveryOutcomeReceipt,
  type ProjectTeamDeliveryOutcomeRequest,
  type PutTeamConversationRequest,
  type PutTeamParticipantRequest,
  type RouteTeamMessageReceipt,
  type RouteTeamMessageRequest,
  type SetTeamConversationLeadRequest,
  type TeamConversationRecord,
  type TeamDeliveryRecord,
  type TeamDeliveryMaterializationContext,
  type TeamMessageRecord,
  type TeamParticipantRecord,
  type TeamRoutingDecisionRecord,
  type TeamTarget,
  type UpdateTeamConversationStateRequest,
  type UpdateTeamParticipantStateRequest
} from "@wanex/protocol"

import {
  assertArray,
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  messagePartsFromJson,
  messagePartsToJson,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectTeamConversationMode,
  expectTeamConversationState,
  expectTeamDeliveryRole,
  expectTeamDeliveryState,
  expectTeamDeliveryTrigger,
  expectTeamMessageKind,
  expectTeamMessageState,
  expectTeamParticipantKind,
  expectTeamParticipantState,
  expectTeamRoutingOutcome
} from "./codec-team-enums.js"
import { toRpcJsonValue, toRpcJsonValueFromUnknown } from "./codec-common.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import { expectSessionInputOrigin } from "./codec-session-values.js"
import { fromRpcSubmitSessionTurnReceipt } from "./codec-session-input-records.js"
import { fromRpcSessionMessageRecord } from "./codec-session-message-records.js"
import { fromRpcSessionTurnRecord } from "./codec-session-turn-records.js"
import type {
  AdmitTeamMessageWire,
  FailTeamDeliveryMaterializationWire,
  ListTeamConversationsWire,
  ListTeamDeliveriesWire,
  ListTeamMessagesWire,
  ListTeamParticipantsWire,
  ListTeamRoutingDecisionsWire,
  MaterializeTeamDeliveryWire,
  ProjectTeamDeliveryOutcomeWire,
  PutTeamConversationWire,
  PutTeamParticipantWire,
  RouteTeamMessageWire,
  SetTeamConversationLeadWire,
  TeamTargetWire,
  UpdateTeamConversationStateWire,
  UpdateTeamParticipantStateWire
} from "./generated/storage-rpc.js"
import { fromRpcTeamDiscussionRoundRecord } from "./codec-team-round.js"

export function toRpcPutTeamConversationRequest(
  request: PutTeamConversationRequest
): PutTeamConversationWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    title: request.title ?? null,
    mode: request.mode ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListTeamConversationsRequest(
  request: ListTeamConversationsRequest
): ListTeamConversationsWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    mode: request.mode ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcUpdateTeamConversationStateRequest(
  request: UpdateTeamConversationStateRequest
): UpdateTeamConversationStateWire {
  return {
    conversation_id: request.conversationId,
    state: request.state
  }
}

export function toRpcSetTeamConversationLeadRequest(
  request: SetTeamConversationLeadRequest
): SetTeamConversationLeadWire {
  return {
    conversation_id: request.conversationId,
    expected_lead_participant_id: request.expectedLeadParticipantId ?? null,
    lead_participant_id: request.leadParticipantId ?? null
  }
}

export function toRpcPutTeamParticipantRequest(
  request: PutTeamParticipantRequest
): PutTeamParticipantWire {
  return {
    id: request.id ?? null,
    conversation_id: request.conversationId,
    principal_id: request.principalId,
    kind: request.kind,
    display_name: request.displayName ?? null,
    role: request.role ?? null,
    agent_session_id: request.agentSessionId ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListTeamParticipantsRequest(
  request: ListTeamParticipantsRequest
): ListTeamParticipantsWire {
  return {
    conversation_id: request.conversationId,
    state: request.state ?? null
  }
}

export function toRpcUpdateTeamParticipantStateRequest(
  request: UpdateTeamParticipantStateRequest
): UpdateTeamParticipantStateWire {
  return {
    participant_id: request.participantId,
    state: request.state
  }
}

export function toRpcAdmitTeamMessageRequest(
  request: AdmitTeamMessageRequest
): AdmitTeamMessageWire {
  return {
    id: request.id ?? null,
    conversation_id: request.conversationId,
    author_participant_id: request.authorParticipantId,
    parent_message_id: request.parentMessageId ?? null,
    kind: request.kind ?? null,
    targets: request.targets.map(toRpcTeamTarget),
    content: messagePartsToJson(request.content),
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcListTeamMessagesRequest(
  request: ListTeamMessagesRequest
): ListTeamMessagesWire {
  return {
    conversation_id: request.conversationId,
    state: request.state ?? null,
    after_created_at: request.afterCreatedAt ?? null,
    after_message_id: request.afterMessageId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRouteTeamMessageRequest(
  request: RouteTeamMessageRequest
): RouteTeamMessageWire {
  return {
    id: request.id ?? null,
    message_id: request.messageId,
    expected_revision: request.expectedRevision,
    expected_lead_participant_id: request.expectedLeadParticipantId ?? null,
    mode: request.mode,
    outcome: request.outcome,
    actor_principal_id: request.actorPrincipalId,
    reason: request.reason,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey,
    deliveries: request.deliveries.map((delivery) => ({
      id: delivery.id ?? null,
      target_participant_id: delivery.targetParticipantId,
      role: delivery.role,
      trigger: delivery.trigger,
      budget_grant_id: delivery.budgetGrantId ?? null
    }))
  }
}

export function toRpcListTeamRoutingDecisionsRequest(
  request: ListTeamRoutingDecisionsRequest
): ListTeamRoutingDecisionsWire {
  return {
    conversation_id: request.conversationId ?? null,
    message_id: request.messageId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcListTeamDeliveriesRequest(
  request: ListTeamDeliveriesRequest
): ListTeamDeliveriesWire {
  return {
    conversation_id: request.conversationId ?? null,
    message_id: request.messageId ?? null,
    routing_decision_id: request.routingDecisionId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcMaterializeTeamDeliveryRequest(
  request: MaterializeTeamDeliveryRequest
): MaterializeTeamDeliveryWire {
  return {
    delivery_id: request.deliveryId,
    dispatch_job_id: request.dispatchJobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    execution_binding: toRpcJsonValueFromUnknown(request.executionBinding),
    max_steps: request.maxSteps ?? null,
    child_priority: request.childPriority ?? null
  }
}

export function toRpcFailTeamDeliveryMaterializationRequest(
  request: FailTeamDeliveryMaterializationRequest
): FailTeamDeliveryMaterializationWire {
  return {
    delivery_id: request.deliveryId,
    dispatch_job_id: request.dispatchJobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    error: toRpcJsonValue(request.error)
  }
}

export function toRpcProjectTeamDeliveryOutcomeRequest(
  request: ProjectTeamDeliveryOutcomeRequest
): ProjectTeamDeliveryOutcomeWire {
  return {
    delivery_id: request.deliveryId,
    outcome_job_id: request.outcomeJobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken
  }
}

export function fromRpcTeamConversationRecord(
  value: JsonValue
): TeamConversationRecord {
  if (!isRecord(value)) throw new Error("team conversation must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "team_conversation.id"),
      principalId: expectString(value.principal_id, "team_conversation.principal_id"),
      mode: expectTeamConversationMode(value.mode),
      state: expectTeamConversationState(value.state),
      createdAt: expectNumber(value.created_at, "team_conversation.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_conversation.updated_at")
    },
    {
      title: optionalString(value.title, "team_conversation.title"),
      leadParticipantId: optionalString(
        value.lead_participant_id,
        "team_conversation.lead_participant_id"
      ),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(value.closed_at, "team_conversation.closed_at")
    }
  )
}

export function fromRpcTeamParticipantRecord(
  value: JsonValue
): TeamParticipantRecord {
  if (!isRecord(value)) throw new Error("team participant must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "team_participant.id"),
      conversationId: expectString(value.conversation_id, "team_participant.conversation_id"),
      principalId: expectString(value.principal_id, "team_participant.principal_id"),
      kind: expectTeamParticipantKind(value.kind),
      state: expectTeamParticipantState(value.state),
      createdAt: expectNumber(value.created_at, "team_participant.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_participant.updated_at")
    },
    {
      displayName: optionalString(value.display_name, "team_participant.display_name"),
      role: optionalString(value.role, "team_participant.role"),
      agentSessionId: optionalString(
        value.agent_session_id,
        "team_participant.agent_session_id"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}

export function fromRpcTeamMessageRecord(value: JsonValue): TeamMessageRecord {
  if (!isRecord(value)) throw new Error("team message must be an object")
  assertArray(value.targets, "team message targets")
  return withOptionalFields(
    {
      id: expectString(value.id, "team_message.id"),
      conversationId: expectString(value.conversation_id, "team_message.conversation_id"),
      authorParticipantId: expectString(
        value.author_participant_id,
        "team_message.author_participant_id"
      ),
      kind: expectTeamMessageKind(value.kind),
      state: expectTeamMessageState(value.state),
      targets: value.targets.map(fromRpcTeamTarget),
      content: messagePartsFromJson(value.content),
      idempotencyKey: expectString(value.idempotency_key, "team_message.idempotency_key"),
      revision: expectNumber(value.revision, "team_message.revision"),
      createdAt: expectNumber(value.created_at, "team_message.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_message.updated_at")
    },
    {
      parentMessageId: optionalString(value.parent_message_id, "team_message.parent_message_id"),
      discussionRoundId: optionalString(
        value.discussion_round_id,
        "team_message.discussion_round_id"
      ),
      metadata: value.metadata ?? undefined,
      visibleAt: optionalNumber(value.visible_at, "team_message.visible_at")
    }
  )
}

export function fromRpcTeamRoutingDecisionRecord(
  value: JsonValue
): TeamRoutingDecisionRecord {
  if (!isRecord(value)) throw new Error("team routing decision must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "team_routing_decision.id"),
      conversationId: expectString(
        value.conversation_id,
        "team_routing_decision.conversation_id"
      ),
      messageId: expectString(value.message_id, "team_routing_decision.message_id"),
      mode: expectTeamConversationMode(value.mode),
      outcome: expectTeamRoutingOutcome(value.outcome),
      actorPrincipalId: expectString(
        value.actor_principal_id,
        "team_routing_decision.actor_principal_id"
      ),
      reason: expectString(value.reason, "team_routing_decision.reason"),
      idempotencyKey: expectString(
        value.idempotency_key,
        "team_routing_decision.idempotency_key"
      ),
      createdAt: expectNumber(value.created_at, "team_routing_decision.created_at")
    },
    {
      leadParticipantId: optionalString(
        value.lead_participant_id,
        "team_routing_decision.lead_participant_id"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}

export function fromRpcTeamDeliveryRecord(value: JsonValue): TeamDeliveryRecord {
  if (!isRecord(value)) throw new Error("team delivery must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "team_delivery.id"),
      conversationId: expectString(value.conversation_id, "team_delivery.conversation_id"),
      messageId: expectString(value.message_id, "team_delivery.message_id"),
      routingDecisionId: expectString(
        value.routing_decision_id,
        "team_delivery.routing_decision_id"
      ),
      discussionRoundId: expectString(
        value.discussion_round_id,
        "team_delivery.discussion_round_id"
      ),
      targetParticipantId: expectString(
        value.target_participant_id,
        "team_delivery.target_participant_id"
      ),
      role: expectTeamDeliveryRole(value.role),
      trigger: expectTeamDeliveryTrigger(value.trigger),
      state: expectTeamDeliveryState(value.state),
      targetSessionId: expectString(value.target_session_id, "team_delivery.target_session_id"),
      dispatchJobId: expectString(value.dispatch_job_id, "team_delivery.dispatch_job_id"),
      idempotencyKey: expectString(value.idempotency_key, "team_delivery.idempotency_key"),
      createdAt: expectNumber(value.created_at, "team_delivery.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_delivery.updated_at")
    },
    {
      childInputId: optionalString(value.child_input_id, "team_delivery.child_input_id"),
      childTurnId: optionalString(value.child_turn_id, "team_delivery.child_turn_id"),
      childTurnJobId: optionalString(
        value.child_turn_job_id,
        "team_delivery.child_turn_job_id"
      ),
      outcomeJobId: optionalString(value.outcome_job_id, "team_delivery.outcome_job_id"),
      replyMessageId: optionalString(
        value.reply_message_id,
        "team_delivery.reply_message_id"
      ),
      participationToolExecutionId: optionalString(
        value.participation_tool_execution_id,
        "team_delivery.participation_tool_execution_id"
      ),
      budgetGrantId: optionalString(value.budget_grant_id, "team_delivery.budget_grant_id"),
      lastError: value.last_error ?? undefined,
      materializedAt: optionalNumber(value.materialized_at, "team_delivery.materialized_at"),
      finishedAt: optionalNumber(value.finished_at, "team_delivery.finished_at")
    }
  )
}

export function fromRpcRouteTeamMessageReceipt(
  value: JsonValue
): RouteTeamMessageReceipt {
  if (!isRecord(value)) throw new Error("team route receipt must be an object")
  assertArray(value.deliveries, "team route deliveries")
  assertArray(value.dispatch_jobs, "team route dispatch jobs")
  return withOptionalFields(
    {
      message: fromRpcTeamMessageRecord(value.message ?? null),
      decision: fromRpcTeamRoutingDecisionRecord(value.decision ?? null),
      deliveries: value.deliveries.map(fromRpcTeamDeliveryRecord),
      dispatchJobs: value.dispatch_jobs.map(fromRpcSchedulerJobRecord),
      created: expectBoolean(value.created, "team route created")
    },
    {
      round: value.round === null
        ? undefined
        : fromRpcTeamDiscussionRoundRecord(value.round ?? null)
    }
  )
}

export function fromRpcTeamDeliveryMaterializationContext(
  value: JsonValue
): TeamDeliveryMaterializationContext {
  if (!isRecord(value)) throw new Error("team delivery context must be an object")
  return {
    conversation: fromRpcTeamConversationRecord(value.conversation ?? null),
    participant: fromRpcTeamParticipantRecord(value.participant ?? null),
    message: fromRpcTeamMessageRecord(value.message ?? null),
    delivery: fromRpcTeamDeliveryRecord(value.delivery ?? null),
    dispatchJob: fromRpcSchedulerJobRecord(value.dispatch_job ?? null),
    childPlan: fromRpcTeamDeliveryChildTurnPlan(value.child_plan)
  }
}

function fromRpcTeamDeliveryChildTurnPlan(
  value: JsonValue | undefined
): TeamDeliveryMaterializationContext["childPlan"] {
  if (!isRecord(value)) throw new Error("team delivery child plan must be an object")
  const inputType = expectString(value.input_type, "team_delivery_child_plan.input_type")
  if (inputType !== "user" && inputType !== "system") {
    throw new Error("team delivery child plan input_type is invalid")
  }
  const intent = expectString(value.intent, "team_delivery_child_plan.intent")
  if (intent !== "normal") throw new Error("team delivery child plan intent is invalid")
  return {
    sessionId: expectString(value.session_id, "team_delivery_child_plan.session_id"),
    inputId: expectString(value.input_id, "team_delivery_child_plan.input_id"),
    turnId: expectString(value.turn_id, "team_delivery_child_plan.turn_id"),
    jobId: expectString(value.job_id, "team_delivery_child_plan.job_id"),
    principalId: expectString(value.principal_id, "team_delivery_child_plan.principal_id"),
    inputType,
    content: messagePartsFromJson(value.content),
    origin: expectSessionInputOrigin(value.origin),
    intent,
    inputIdempotencyKey: expectString(
      value.input_idempotency_key,
      "team_delivery_child_plan.input_idempotency_key"
    ),
    jobIdempotencyKey: expectString(
      value.job_idempotency_key,
      "team_delivery_child_plan.job_idempotency_key"
    )
  }
}

export function fromRpcMaterializeTeamDeliveryReceipt(
  value: JsonValue
): MaterializeTeamDeliveryReceipt {
  if (!isRecord(value)) throw new Error("team materialization receipt must be an object")
  return {
    delivery: fromRpcTeamDeliveryRecord(value.delivery ?? null),
    dispatchJob: fromRpcSchedulerJobRecord(value.dispatch_job ?? null),
    submission: fromRpcSubmitSessionTurnReceipt(value.submission ?? null),
    created: expectBoolean(value.created, "team materialization created")
  }
}

export function fromRpcFailTeamDeliveryMaterializationReceipt(
  value: JsonValue
): FailTeamDeliveryMaterializationReceipt {
  if (!isRecord(value)) throw new Error("team materialization failure receipt must be an object")
  return {
    delivery: fromRpcTeamDeliveryRecord(value.delivery ?? null),
    dispatchJob: fromRpcSchedulerJobRecord(value.dispatch_job ?? null)
  }
}

export function fromRpcProjectTeamDeliveryOutcomeReceipt(
  value: JsonValue
): ProjectTeamDeliveryOutcomeReceipt {
  if (!isRecord(value)) throw new Error("team outcome projection receipt must be an object")
  return withOptionalFields(
    {
      delivery: fromRpcTeamDeliveryRecord(value.delivery ?? null),
      outcomeJob: fromRpcSchedulerJobRecord(value.outcome_job ?? null),
      childTurn: fromRpcSessionTurnRecord(value.child_turn ?? null),
      created: expectBoolean(value.created, "team outcome projection created")
    },
    {
      childAssistantMessage: value.child_assistant_message === null
        ? undefined
        : fromRpcSessionMessageRecord(value.child_assistant_message ?? null),
      replyMessage: value.reply_message === null
        ? undefined
        : fromRpcTeamMessageRecord(value.reply_message ?? null)
    }
  )
}

function toRpcTeamTarget(target: TeamTarget): TeamTargetWire {
  return {
    kind: target.kind,
    participant_id: target.kind === "participant" ? target.participantId : null
  }
}

function fromRpcTeamTarget(value: JsonValue): TeamTarget {
  if (!isRecord(value)) throw new Error("team target must be an object")
  const kind = expectString(value.kind, "team_target.kind")
  const participantId = optionalString(value.participant_id, "team_target.participant_id")
  if (kind === "participant" && participantId !== undefined) {
    return { kind, participantId }
  }
  if ((kind === "lead" || kind === "all") && participantId === undefined) {
    return { kind }
  }
  throw new Error(`invalid team target: ${kind}`)
}
