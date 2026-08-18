import type {
  JsonValue,
  PlanProposalContent,
  PlanProposalExecutionBinding,
  PlanProposalGenerationBinding,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  PlanProposalReference,
  PlanProposalSourceBinding,
  PlanProposalStep
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
  messagePartsFromJson,
  messagePartsToJson
} from "./codec-message.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  PlanProposalContentWire,
  PlanProposalGenerationWire,
  PlanProposalReferenceWire,
  PlanProposalSourceWire,
  PlanProposalStepWire
} from "./generated/storage-rpc.js"

export function planStepToWire(step: PlanProposalStep): PlanProposalStepWire {
  return {
    id: step.id,
    title: step.title,
    detail: step.detail ?? null,
    metadata: toRpcJsonValue(step.metadata ?? null)
  }
}

export function planReferenceToWire(
  reference: PlanProposalReference
): PlanProposalReferenceWire {
  return {
    kind: reference.kind,
    reference_id: reference.id,
    role: reference.role ?? null,
    metadata: toRpcJsonValue(reference.metadata ?? null)
  }
}

export function planContentToWire(
  content: PlanProposalContent
): PlanProposalContentWire {
  const [first, ...rest] = content.steps.map(planStepToWire)
  if (first === undefined) {
    throw new Error("plan proposal content requires at least one step")
  }
  return {
    title: content.title,
    summary: content.summary,
    steps: [first, ...rest],
    references: content.references.map(planReferenceToWire)
  }
}

export function planSourceToWire(
  source: PlanProposalSourceBinding
): PlanProposalSourceWire {
  return {
    session_id: source.sessionId,
    head_sequence: source.headSequence,
    head_message_id: source.headMessageId ?? null,
    head_turn_id: source.headTurnId ?? null,
    analysis_input_digest: source.analysisInputDigest,
    planning_request: messagePartsToJson(source.planningRequest)
  }
}

export function planGenerationToWire(
  generation: PlanProposalGenerationBinding
): PlanProposalGenerationWire {
  return {
    endpoint_id: generation.endpointId,
    endpoint_digest: generation.endpointDigest,
    protocol_id: generation.protocolId,
    provider_id: generation.providerId,
    model_id: generation.modelId,
    generated_at: generation.generatedAt,
    output_digest: generation.outputDigest,
    output: messagePartsToJson(generation.output)
  }
}

export function planContentFromJson(value: JsonValue): PlanProposalContent {
  if (!isRecord(value)) {
    throw new Error("plan proposal content must be an object")
  }
  return {
    title: expectString(value.title, "plan_proposal_content.title"),
    summary: expectString(value.summary, "plan_proposal_content.summary"),
    steps: expectArray(value.steps, "plan_proposal_content.steps").map(
      planStepFromJson
    ),
    references: expectArray(
      value.references,
      "plan_proposal_content.references"
    ).map(planReferenceFromJson)
  }
}

export function planStepFromJson(value: JsonValue): PlanProposalStep {
  if (!isRecord(value)) {
    throw new Error("plan proposal step must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "plan_proposal_step.id"),
      title: expectString(value.title, "plan_proposal_step.title")
    },
    {
      detail: optionalString(value.detail, "plan_proposal_step.detail"),
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

export function planSourceFromJson(value: JsonValue): PlanProposalSourceBinding {
  if (!isRecord(value)) {
    throw new Error("plan proposal source must be an object")
  }
  return withOptionalFields(
    {
      sessionId: expectString(value.session_id, "plan_proposal_source.session_id"),
      headSequence: expectNumber(
        value.head_sequence,
        "plan_proposal_source.head_sequence"
      ),
      analysisInputDigest: expectString(
        value.analysis_input_digest,
        "plan_proposal_source.analysis_input_digest"
      ),
      planningRequest: messagePartsFromJson(value.planning_request)
    },
    {
      headMessageId: optionalString(
        value.head_message_id,
        "plan_proposal_source.head_message_id"
      ),
      headTurnId: optionalString(
        value.head_turn_id,
        "plan_proposal_source.head_turn_id"
      )
    }
  )
}

export function planGenerationFromJson(
  value: JsonValue
): PlanProposalGenerationBinding {
  if (!isRecord(value)) {
    throw new Error("plan proposal generation must be an object")
  }
  return {
    endpointId: expectString(
      value.endpoint_id,
      "plan_proposal_generation.endpoint_id"
    ),
    endpointDigest: expectString(
      value.endpoint_digest,
      "plan_proposal_generation.endpoint_digest"
    ),
    protocolId: expectString(
      value.protocol_id,
      "plan_proposal_generation.protocol_id"
    ),
    providerId: expectString(
      value.provider_id,
      "plan_proposal_generation.provider_id"
    ),
    modelId: expectString(value.model_id, "plan_proposal_generation.model_id"),
    generatedAt: expectNumber(
      value.generated_at,
      "plan_proposal_generation.generated_at"
    ),
    outputDigest: expectString(
      value.output_digest,
      "plan_proposal_generation.output_digest"
    ),
    output: messagePartsFromJson(value.output)
  }
}

export function planExecutionFromJson(
  value: JsonValue
): PlanProposalExecutionBinding {
  if (!isRecord(value)) {
    throw new Error("plan proposal execution binding must be an object")
  }
  return {
    inputId: expectString(value.input_id, "plan_proposal_execution.input_id"),
    turnId: expectString(value.turn_id, "plan_proposal_execution.turn_id"),
    jobId: expectString(value.job_id, "plan_proposal_execution.job_id"),
    executionBindingDigest: expectString(
      value.execution_binding_digest,
      "plan_proposal_execution.execution_binding_digest"
    ),
    digest: expectString(value.digest, "plan_proposal_execution.digest"),
    boundAt: expectNumber(value.bound_at, "plan_proposal_execution.bound_at")
  }
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
    state !== "withdrawn"
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
    operation !== "revise" &&
    operation !== "approve" &&
    operation !== "reject" &&
    operation !== "withdraw"
  ) {
    throw new Error(`invalid plan proposal operation: ${operation}`)
  }
  return operation
}

export function optionalPlanContent(
  value: JsonValue | undefined,
  name: string
): PlanProposalContent | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  try {
    return planContentFromJson(value)
  } catch (error) {
    throw new Error(`${name}: ${(error as Error).message}`)
  }
}

export function optionalPlanExecution(
  value: JsonValue | undefined,
  name: string
): PlanProposalExecutionBinding | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  try {
    return planExecutionFromJson(value)
  } catch (error) {
    throw new Error(`${name}: ${(error as Error).message}`)
  }
}

function expectPlanReferenceKind(
  value: unknown,
  name: string
): PlanProposalReference["kind"] {
  const kind = expectString(value, name)
  if (
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
