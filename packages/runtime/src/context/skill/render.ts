import type { JsonValue, MessagePart } from "@wanex/protocol"
import type {
  RenderSkillSnapshotOptions,
  SkillSnapshot,
  SkillSource,
  SkillSourceProvenance
} from "./types.js"

export function renderSkillSnapshot(options: RenderSkillSnapshotOptions): string {
  if (!options.snapshot.complete) {
    return ""
  }
  const sources = sortedSources(options.snapshot)
  if (sources.length === 0) {
    return ""
  }

  return [
    "Wanex skills are lazy, trusted skill catalogs.",
    "Only the skill metadata below is loaded into context. Skill instructions and supporting resources are not loaded until an app-provided skill activation tool reads the selected skill.",
    "When a task clearly matches a skill description and a skill activation tool is available, activate that skill before proceeding. If no activation tool is available, do not invent the missing skill instructions.",
    "",
    "<available_skills>",
    ...sources.flatMap((source) => [
      "  <skill>",
      `    <name>${escapeXml(source.name)}</name>`,
      `    <description>${escapeXml(source.description)}</description>`,
      `    <scope>${source.scope}</scope>`,
      `    <location>${escapeXml(source.path)}</location>`,
      `    <body_hash>${escapeXml(source.bodyHash)}</body_hash>`,
      "  </skill>"
    ]),
    "</available_skills>"
  ].join("\n")
}

export function skillSnapshotToSystemPart(
  snapshot: SkillSnapshot
): MessagePart | null {
  const rendered = renderSkillSnapshot({ snapshot })
  if (rendered.length === 0) {
    return null
  }
  return {
    type: "text",
    id: `skill_catalog_${combinedHash(snapshot)}`,
    text: rendered,
    visibility: "provider_replay_only",
    providerMetadata: {
      wanexSkillCatalog: true,
      sourceCount: snapshot.sources.length,
      sources: sortedSources(snapshot).map(sourceProvenance)
    }
  }
}

function combinedHash(snapshot: SkillSnapshot): string {
  return snapshot.sources.map((source) => source.hash).join("_") || "empty"
}

function sortedSources(snapshot: SkillSnapshot): readonly SkillSource[] {
  return [...snapshot.sources].sort(
    (left, right) => left.order - right.order || left.name.localeCompare(right.name)
  )
}

function sourceProvenance(source: SkillSource): JsonValue {
  const provenance: SkillSourceProvenance = {
    id: source.id,
    scope: source.scope,
    name: source.name,
    directory: source.directory,
    path: source.path,
    order: source.order,
    byteLength: source.byteLength,
    hash: source.hash,
    bodyHash: source.bodyHash,
    ...(source.allowedTools === undefined
      ? {}
      : { allowedTools: [...source.allowedTools] }),
    ...(source.metadata === undefined ? {} : { metadata: { ...source.metadata } }),
    ...(source.mtimeMs === undefined ? {} : { mtimeMs: source.mtimeMs })
  }
  return provenanceToJson(provenance)
}

function provenanceToJson(provenance: SkillSourceProvenance): JsonValue {
  return {
    id: provenance.id,
    scope: provenance.scope,
    name: provenance.name,
    directory: provenance.directory,
    path: provenance.path,
    order: provenance.order,
    byteLength: provenance.byteLength,
    hash: provenance.hash,
    bodyHash: provenance.bodyHash,
    ...(provenance.allowedTools === undefined
      ? {}
      : { allowedTools: [...provenance.allowedTools] }),
    ...(provenance.metadata === undefined
      ? {}
      : { metadata: { ...provenance.metadata } }),
    ...(provenance.mtimeMs === undefined ? {} : { mtimeMs: provenance.mtimeMs })
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;")
}
