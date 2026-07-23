import {
  type JsonValue,
  type RunControlPolicy,
  type SessionInputIntent,
  type SessionInputOrigin,
  type SessionTurnControlApplyEffect,
  type SessionTurnControlKind,
  type SessionTurnControlStatus
} from "@wanex/protocol"

import {
  expectString,
  isRecord,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  JsonObjectWire,
  NullableJsonObjectWire,
  NullableSessionInputOriginWire
} from "./generated/storage-rpc.js"

export function expectSessionInputOrigin(value: unknown): SessionInputOrigin {
  if (!isRecord(value)) {
    throw new Error("session input origin must be an object")
  }
  const kind = expectString(value.kind, "origin.kind")
  if (kind.length === 0) {
    throw new Error("origin kind must not be empty")
  }
  return withOptionalFields(
    { kind },
    {
      ...readOriginRefs(value),
      metadata:
        value.metadata === null || value.metadata === undefined
          ? undefined
          : expectMetadata(value.metadata, "origin.metadata")
    }
  ) as SessionInputOrigin
}

export function sessionInputOriginToJson(
  origin: SessionInputOrigin | undefined
): NullableSessionInputOriginWire {
  if (origin === undefined) {
    return null
  }
  const value: Exclude<NullableSessionInputOriginWire, null> = {
    kind: origin.kind
  }
  if (origin.sourceRef !== undefined) {
    value.sourceRef = origin.sourceRef
  }
  if (origin.parentRef !== undefined) {
    value.parentRef = origin.parentRef
  }
  if (origin.metadata !== undefined) {
    value.metadata = toRpcJsonObject(origin.metadata)
  }
  return value
}

export function metadataToJson(
  metadata: Readonly<Record<string, JsonValue>> | undefined
): NullableJsonObjectWire {
  return metadata === undefined ? null : toRpcJsonObject(metadata)
}

function toRpcJsonObject(
  value: Readonly<Record<string, JsonValue>>
): JsonObjectWire {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toRpcJsonValue(item)])
  )
}

export function expectSessionInputIntent(value: unknown): SessionInputIntent {
  const intent = expectString(value, "input.intent")
  if (
    intent !== "normal" &&
    intent !== "follow_up" &&
    intent !== "steer" &&
    intent !== "interrupt"
  ) {
    throw new Error(`invalid input intent: ${intent}`)
  }
  return intent
}

export function expectRunControlPolicy(value: unknown): RunControlPolicy {
  const policy = expectString(value, "input.run_control_policy")
  if (
    policy !== "queue_after_current" &&
    policy !== "abort_current_then_run" &&
    policy !== "steer_at_safe_point"
  ) {
    throw new Error(`invalid run-control policy: ${policy}`)
  }
  return policy
}

export function expectSessionTurnControlKind(
  value: unknown
): SessionTurnControlKind {
  const kind = expectString(value, "turn_control.kind")
  if (kind !== "interrupt" && kind !== "steer") {
    throw new Error(`invalid run-control kind: ${kind}`)
  }
  return kind
}

export function expectSessionTurnControlStatus(
  value: unknown
): SessionTurnControlStatus {
  const status = expectString(value, "turn_control.status")
  if (
    status !== "pending" &&
    status !== "applied" &&
    status !== "rejected" &&
    status !== "cancelled"
  ) {
    throw new Error(`invalid run-control status: ${status}`)
  }
  return status
}

export function expectSessionTurnControlApplyEffect(
  value: unknown
): SessionTurnControlApplyEffect {
  const effect = expectString(value, "turn_control.effect")
  if (
    effect !== "interrupt_requested_cancel" &&
    effect !== "steer_promoted_input" &&
    effect !== "already_resolved"
  ) {
    throw new Error(`invalid run-control apply effect: ${effect}`)
  }
  return effect
}

export function expectMetadata(
  value: unknown,
  name: string
): Readonly<Record<string, JsonValue>> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value
}

function readOriginRefs(
  value: Record<string, JsonValue>
): {
  readonly sourceRef?: string
  readonly parentRef?: string
} {
  const refs: { sourceRef?: string; parentRef?: string } = {}
  const sourceRef =
    optionalString(value.sourceRef, "origin.sourceRef") ??
    optionalString(value.source_ref, "origin.source_ref")
  const parentRef =
    optionalString(value.parentRef, "origin.parentRef") ??
    optionalString(value.parent_ref, "origin.parent_ref")
  if (sourceRef !== undefined) {
    refs.sourceRef = sourceRef
  }
  if (parentRef !== undefined) {
    refs.parentRef = parentRef
  }
  return refs
}
