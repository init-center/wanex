import type { SessionInputOrigin } from "@wanex/protocol"
import { assert } from "../scenario-utils.js"

export type EvalWorkflowEnvelope =
  | EvalInteractiveEnvelope
  | EvalScheduledEnvelope
  | EvalChannelEnvelope
  | EvalGuidedEnvelope

export interface EvalClassifierHint {
  readonly classifierId: string
  readonly label: string
  readonly confidence: number
}

interface EvalWorkflowEnvelopeBase {
  readonly text: string
  readonly sessionId: string
  readonly classifier?: EvalClassifierHint
}

interface EvalInteractiveEnvelope extends EvalWorkflowEnvelopeBase {
  readonly kind: "interactive"
  readonly sourceRef?: string
}

interface EvalScheduledEnvelope extends EvalWorkflowEnvelopeBase {
  readonly kind: "scheduled"
  readonly scheduleId: string
  readonly tickId: string
  readonly nonOverlap?: boolean
}

interface EvalChannelEnvelope extends EvalWorkflowEnvelopeBase {
  readonly kind: "channel"
  readonly connectorId: string
  readonly eventId: string
  readonly threadRef?: string
}

interface EvalGuidedEnvelope extends EvalWorkflowEnvelopeBase {
  readonly kind: "guided_follow_up"
  readonly activeRunId: string
  readonly sourceRef?: string
}

export type NormalizedEvalWorkflowEnvelope =
  | {
      readonly route: "command"
      readonly text: string
      readonly sessionId: string
    }
  | NormalizedEvalAgentEnvelope

export interface NormalizedEvalAgentEnvelope {
  readonly route: "agent"
  readonly text: string
  readonly sessionId: string
  readonly agent: {
    readonly origin: SessionInputOrigin
    readonly intent: "normal" | "follow_up"
    readonly runControlPolicy?: "queue_after_current"
    readonly expectedRunId?: string
  }
}

export function normalizeEvalWorkflowEnvelope(
  envelope: EvalWorkflowEnvelope
): NormalizedEvalWorkflowEnvelope {
  const text = envelope.text.trim()
  assert(text.length > 0, "eval workflow envelope text must not be empty")
  switch (envelope.kind) {
    case "interactive":
      if (text.startsWith("/")) {
        return {
          route: "command",
          text,
          sessionId: envelope.sessionId
        }
      }
      return agentEnvelope(envelope, {
        kind: "interactive",
        ...(envelope.sourceRef === undefined
          ? {}
          : { sourceRef: envelope.sourceRef }),
        ...metadataField(classifierMetadata(envelope.classifier))
      })
    case "scheduled":
      return agentEnvelope(envelope, {
        kind: "scheduler",
        sourceRef: envelope.scheduleId,
        ...metadataField({
          scheduleId: envelope.scheduleId,
          tickId: envelope.tickId,
          ...(envelope.nonOverlap === undefined
            ? {}
            : { nonOverlap: envelope.nonOverlap }),
          ...classifierMetadata(envelope.classifier)
        })
      })
    case "channel":
      return agentEnvelope(envelope, {
        kind: "connector",
        sourceRef: envelope.eventId,
        ...(envelope.threadRef === undefined
          ? {}
          : { parentRef: envelope.threadRef }),
        ...metadataField({
          connectorId: envelope.connectorId,
          eventId: envelope.eventId,
          ...classifierMetadata(envelope.classifier)
        })
      })
    case "guided_follow_up":
      return {
        route: "agent",
        text: envelope.text,
        sessionId: envelope.sessionId,
        agent: {
          origin: {
            kind: "interactive",
            sourceRef: envelope.sourceRef ?? "guided-follow-up",
            parentRef: envelope.activeRunId,
            metadata: {
              productPolicy: "queue_after_current",
              ...classifierMetadata(envelope.classifier)
            }
          },
          intent: "follow_up",
          runControlPolicy: "queue_after_current",
          expectedRunId: envelope.activeRunId
        }
      }
  }
}

function agentEnvelope(
  envelope: EvalWorkflowEnvelope,
  origin: SessionInputOrigin
): NormalizedEvalAgentEnvelope {
  return {
    route: "agent",
    text: envelope.text,
    sessionId: envelope.sessionId,
    agent: {
      origin,
      intent: "normal"
    }
  }
}

function classifierMetadata(
  classifier: EvalWorkflowEnvelope["classifier"]
): Record<string, string | number> {
  if (classifier === undefined) {
    return {}
  }
  assert(
    classifier.confidence >= 0 && classifier.confidence <= 1,
    "classifier confidence must be between 0 and 1"
  )
  return {
    classifierId: classifier.classifierId,
    classifierLabel: classifier.label,
    classifierConfidence: classifier.confidence
  }
}

function metadataField(
  metadata: Record<string, string | number | boolean>
): { readonly metadata?: Record<string, string | number | boolean> } {
  return Object.keys(metadata).length === 0 ? {} : { metadata }
}
