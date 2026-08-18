import type { WanexAppCommands } from "./types-app.js"
import type {
  WanexAppRouteWorkflowEnvelopeErrorResult,
  WanexAppRouteWorkflowEnvelopeResult,
  WanexAppWorkflowEnvelope
} from "./types-workflow-envelope.js"
import { normalizeWanexAppWorkflowEnvelope } from "./workflow-envelope-normalization.js"

export { normalizeWanexAppWorkflowEnvelope } from "./workflow-envelope-normalization.js"

export async function routeWanexAppWorkflowEnvelope(
  commands: WanexAppCommands,
  request: WanexAppWorkflowEnvelope
): Promise<WanexAppRouteWorkflowEnvelopeResult> {
  const normalized = normalizeWanexAppWorkflowEnvelope(request)
  if (normalized.kind === "error") {
    return normalized
  }
  const envelope = normalized.envelope
  if (envelope.sideQuery !== undefined) {
    return {
      kind: "side_query",
      command: "askSideQuery",
      result: await commands.askSideQuery(envelope.sideQuery)
    }
  }
  if (envelope.scheduledTick !== undefined) {
    return {
      kind: "scheduled",
      command: "submitScheduledTick",
      result: await commands.submitScheduledTick(envelope.scheduledTick)
    }
  }
  if (envelope.guidedFollowUp !== undefined) {
    return {
      kind: "guided_follow_up",
      command: "queueGuidedFollowUp",
      result: await commands.queueGuidedFollowUp(envelope.guidedFollowUp)
    }
  }
  const agent = envelope.agent
  if (agent === undefined) {
    return invalidEnvelopeRoute("workflow envelope did not normalize to a route")
  }
  return {
    kind: "agent",
    command: "submitConversationOperation",
    result: await commands.submitConversationOperation({
      content: [{ type: "text", text: envelope.text }],
      ...(envelope.sessionId === undefined
        ? {}
        : { sessionId: envelope.sessionId }),
      origin: agent.origin,
      ...(agent.intent === undefined ? {} : { intent: agent.intent })
    })
  }
}

function invalidEnvelopeRoute(
  message: string
): WanexAppRouteWorkflowEnvelopeErrorResult {
  return {
    kind: "error",
    command: "routeWorkflowEnvelope",
    code: "invalid_arguments",
    message
  }
}
