import type {
  WorkspaceChangeDecisionRequest,
  WorkspaceChangeMutationRequest,
  WorkspaceChangeReference
} from "../../workspace-review.js"
import { record, requiredString } from "./common.js"

export function parseWorkspaceChangeReference(value: unknown): WorkspaceChangeReference {
  const input = record(value, "workspace change reference")
  return { sessionId: requiredString(input, "sessionId"), changeRef: requiredString(input, "changeRef") }
}

export function parseWorkspaceChangeDecision(value: unknown): WorkspaceChangeDecisionRequest {
  const input = record(value, "workspace change decision")
  const reference = parseWorkspaceChangeReference(input)
  const decision = requiredString(input, "decision")
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("workspace change decision is invalid")
  }
  return {
    ...reference,
    decision: decision as "approve" | "reject",
    idempotencyKey: requiredString(input, "idempotencyKey")
  }
}

export function parseWorkspaceChangeMutation(value: unknown): WorkspaceChangeMutationRequest {
  const input = record(value, "workspace change mutation")
  const reference = parseWorkspaceChangeReference(input)
  return { ...reference, idempotencyKey: requiredString(input, "idempotencyKey") }
}
