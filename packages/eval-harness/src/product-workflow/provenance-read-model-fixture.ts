import type {
  RunControlPolicy,
  SessionInputIntent,
  SessionInputOriginKind,
  SessionInputRecord
} from "@wanex/protocol"

export interface EvalProvenanceReadModel {
  readonly rows: readonly EvalProvenanceRow[]
  readonly hasProductClientField: boolean
}

export interface EvalProvenanceRow {
  readonly inputId: string
  readonly sessionId: string
  readonly kind: SessionInputOriginKind
  readonly label: string
  readonly sourceRef?: string
  readonly parentRef?: string
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedRunId?: string
  readonly metadataKeys: readonly string[]
}

const evalProvenanceLabels: Record<SessionInputOriginKind, string> = {
  interactive: "Interactive",
  scheduler: "Scheduled",
  connector: "Channel",
  agent: "Agent",
  system: "System",
  objective: "Objective",
  plan: "Plan"
}

export function projectEvalProvenanceReadModel(
  inputs: readonly SessionInputRecord[]
): EvalProvenanceReadModel {
  return {
    rows: inputs.map(projectEvalProvenanceRow),
    hasProductClientField: JSON.stringify(inputs).includes("\"client\"")
  }
}

function projectEvalProvenanceRow(
  input: SessionInputRecord
): EvalProvenanceRow {
  const origin = input.origin
  const kind = origin?.kind ?? "interactive"
  return {
    inputId: input.id,
    sessionId: input.sessionId,
    kind,
    label: evalProvenanceLabels[kind],
    ...(origin?.sourceRef === undefined ? {} : { sourceRef: origin.sourceRef }),
    ...(origin?.parentRef === undefined ? {} : { parentRef: origin.parentRef }),
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    ...(input.runControlPolicy === undefined
      ? {}
      : { runControlPolicy: input.runControlPolicy }),
    ...(input.expectedRunId === undefined
      ? {}
      : { expectedRunId: input.expectedRunId }),
    metadataKeys: Object.keys(origin?.metadata ?? {}).sort()
  }
}
