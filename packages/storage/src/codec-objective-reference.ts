import type { JsonValue, ObjectiveReference } from "@wanex/protocol"
import {
  expectString,
  isRecord,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"

export function objectiveReferenceToJson(
  reference: ObjectiveReference
): JsonValue {
  return {
    kind: reference.kind,
    reference_id: reference.id,
    ...(reference.role === undefined ? {} : { role: reference.role }),
    ...(reference.metadata === undefined ? {} : { metadata: reference.metadata })
  }
}

export function objectiveReferenceFromJson(
  value: JsonValue
): ObjectiveReference {
  if (!isRecord(value)) {
    throw new Error("objective reference must be an object")
  }
  return withOptionalFields(
    {
      kind: expectObjectiveReferenceKind(value.kind, "objective_reference.kind"),
      id: expectString(value.reference_id, "objective_reference.reference_id")
    },
    {
      role: optionalString(value.role, "objective_reference.role"),
      metadata: value.metadata ?? undefined
    }
  )
}

function expectObjectiveReferenceKind(
  value: unknown,
  name: string
): ObjectiveReference["kind"] {
  const kind = expectString(value, name)
  if (
    kind !== "session" &&
    kind !== "session_input" &&
    kind !== "session_turn" &&
    kind !== "scheduler_job" &&
    kind !== "plan_proposal" &&
    kind !== "workspace_change_proposal" &&
    kind !== "delegation_graph" &&
    kind !== "resource" &&
    kind !== "context_epoch"
  ) {
    throw new Error(`invalid objective reference kind: ${kind}`)
  }
  return kind
}
