import type { JsonValue, MessagePart } from "@wanex/protocol"
import type {
  InstructionSnapshot,
  InstructionSource,
  InstructionSourceProvenance,
  RenderInstructionSnapshotOptions
} from "./types.js"

export function renderInstructionSnapshot(
  options: RenderInstructionSnapshotOptions
): string {
  const sources = [...options.snapshot.sources].sort(
    (left, right) => left.order - right.order || left.path.localeCompare(right.path)
  )
  if (sources.length === 0) {
    return ""
  }

  return [
    "Wanex ambient instructions are loaded from trusted instruction sources.",
    "Follow these instructions when they apply to the current workspace and task.",
    "",
    ...sources.flatMap((source) => [
      `Instructions from ${source.scope} source ${source.order + 1} (${source.target}):`,
      source.content.trimEnd()
    ])
  ].join("\n")
}

export function instructionSnapshotToSystemPart(
  snapshot: InstructionSnapshot
): MessagePart | null {
  const rendered = renderInstructionSnapshot({ snapshot })
  if (rendered.length === 0) {
    return null
  }
  return {
    type: "text",
    id: `instruction_context_${combinedHash(snapshot)}`,
    text: rendered,
    visibility: "provider_replay_only",
    providerMetadata: {
      wanexInstructionContext: true,
      sourceCount: snapshot.sources.length,
      sources: sortedSources(snapshot).map(sourceProvenance)
    }
  }
}

function combinedHash(snapshot: InstructionSnapshot): string {
  return snapshot.sources.map((source) => source.hash).join("_") || "empty"
}

function sortedSources(snapshot: InstructionSnapshot): readonly InstructionSource[] {
  return [...snapshot.sources].sort(
    (left, right) => left.order - right.order || left.path.localeCompare(right.path)
  )
}

function sourceProvenance(
  source: InstructionSource
): JsonValue {
  const provenance: InstructionSourceProvenance = {
    scope: source.scope,
    target: source.target,
    order: source.order,
    byteLength: source.byteLength,
    hash: source.hash,
  }
  return provenanceToJson(provenance)
}

function provenanceToJson(provenance: InstructionSourceProvenance): JsonValue {
  return {
    scope: provenance.scope,
    target: provenance.target,
    order: provenance.order,
    byteLength: provenance.byteLength,
    hash: provenance.hash,
  }
}
