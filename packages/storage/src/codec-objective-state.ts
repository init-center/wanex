import type {
  ObjectiveAttemptRecord,
  ObjectiveRunOperationRecord,
  ObjectiveRunRecord,
  ObjectiveVerificationRecord
} from "@wanex/protocol"
import { expectString } from "./codec-helpers.js"

export function expectObjectiveRunState(
  value: unknown,
  name: string
): ObjectiveRunRecord["state"] {
  const state = expectString(value, name)
  if (
    state !== "open" &&
    state !== "running" &&
    state !== "blocked" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid objective run state: ${state}`)
  }
  return state
}

export function expectObjectiveRunOperationKind(
  value: unknown,
  name: string
): ObjectiveRunOperationRecord["operation"] {
  const operation = expectString(value, name)
  if (
    operation !== "start" &&
    operation !== "record_blocked" &&
    operation !== "mark_succeeded" &&
    operation !== "mark_failed" &&
    operation !== "cancel"
  ) {
    throw new Error(`invalid objective run operation: ${operation}`)
  }
  return operation
}

export function expectObjectiveAttemptState(
  value: unknown,
  name: string
): ObjectiveAttemptRecord["state"] {
  const state = expectString(value, name)
  if (
    state !== "planned" &&
    state !== "running" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "blocked" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid objective attempt state: ${state}`)
  }
  return state
}

export function expectObjectiveVerificationKind(
  value: unknown,
  name: string
): ObjectiveVerificationRecord["kind"] {
  const kind = expectString(value, name)
  if (
    kind !== "script" &&
    kind !== "model" &&
    kind !== "human" &&
    kind !== "runtime"
  ) {
    throw new Error(`invalid objective verification kind: ${kind}`)
  }
  return kind
}

export function expectObjectiveVerificationState(
  value: unknown,
  name: string
): ObjectiveVerificationRecord["state"] {
  const state = expectString(value, name)
  if (
    state !== "passed" &&
    state !== "failed" &&
    state !== "inconclusive" &&
    state !== "blocked"
  ) {
    throw new Error(`invalid objective verification state: ${state}`)
  }
  return state
}
