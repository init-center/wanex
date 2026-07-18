import type { WanexAppShellCommands } from "./types-app.js"
import type {
  WanexAppShellRouteWorkflowEnvelopeErrorResult,
  WanexAppShellRouteWorkflowEnvelopeResult,
  WanexAppShellWorkflowEnvelope
} from "./types-workflow-envelope.js"
import { normalizeWanexAppShellWorkflowEnvelope } from "./workflow-envelope-normalization.js"

export { normalizeWanexAppShellWorkflowEnvelope } from "./workflow-envelope-normalization.js"

export async function routeWanexAppShellWorkflowEnvelope(
  commands: WanexAppShellCommands,
  request: WanexAppShellWorkflowEnvelope
): Promise<WanexAppShellRouteWorkflowEnvelopeResult> {
  const normalized = normalizeWanexAppShellWorkflowEnvelope(request)
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
    command: "runAgentTurn",
    result: await commands.runAgentTurn({
      text: envelope.text,
      ...(envelope.sessionId === undefined
        ? {}
        : { sessionId: envelope.sessionId }),
      origin: agent.origin,
      ...(agent.intent === undefined ? {} : { intent: agent.intent }),
      ...(agent.runControlPolicy === undefined
        ? {}
        : { runControlPolicy: agent.runControlPolicy }),
      ...(agent.expectedRunId === undefined
        ? {}
        : { expectedRunId: agent.expectedRunId })
    })
  }
}

function invalidEnvelopeRoute(
  message: string
): WanexAppShellRouteWorkflowEnvelopeErrorResult {
  return {
    kind: "error",
    command: "routeWorkflowEnvelope",
    code: "invalid_arguments",
    message
  }
}
