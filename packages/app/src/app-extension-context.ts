import { createHash } from "node:crypto"
import type {
  AppExtensionContribution,
  AppExtensionResolvedSnapshot,
  AppInstructionContribution,
  AppSkillContribution
} from "@wanex/extension"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import { InstructionContextCompiler } from "@wanex/runtime/context"
import type {
  InstructionScope,
  InstructionSnapshot,
  InstructionSource
} from "@wanex/runtime/context"
import { SkillContextCompiler } from "@wanex/runtime/context"
import type {
  SkillScope,
  SkillSnapshot,
  SkillSource
} from "@wanex/runtime/context"

export async function prepareWanexAppExtensionAgentContext(options: {
  readonly base?: PreparedAgentContext
  readonly snapshot?: AppExtensionResolvedSnapshot
}): Promise<PreparedAgentContext | undefined> {
  if (options.snapshot === undefined) {
    return options.base
  }

  const extensionInstructionSnapshot = instructionSnapshotFromContributions(
    options.snapshot.byDomain.instruction.all
  )
  const extensionSkillSnapshot = skillSnapshotFromContributions(
    options.snapshot.byDomain.skill.all
  )
  const instructionSnapshot = mergeInstructionSnapshots(
    options.base?.instructionSnapshot,
    extensionInstructionSnapshot
  )
  const skillSnapshot = mergeSkillSnapshots(
    options.base?.skillSnapshot,
    extensionSkillSnapshot
  )
  let compiler = options.base?.contextCompiler

  if (extensionInstructionSnapshot.sources.length > 0) {
    compiler = new InstructionContextCompiler({
      snapshot: extensionInstructionSnapshot,
      ...(compiler === undefined ? {} : { downstream: compiler })
    })
  }
  if (extensionSkillSnapshot.sources.length > 0) {
    compiler = new SkillContextCompiler({
      snapshot: extensionSkillSnapshot,
      ...(compiler === undefined ? {} : { downstream: compiler })
    })
  }

  if (
    compiler === undefined &&
    instructionSnapshot === undefined &&
    skillSnapshot === undefined &&
    options.base?.tools === undefined &&
    options.base?.toolPermissionPolicy === undefined
  ) {
    return undefined
  }

  return {
    ...(compiler === undefined ? {} : { contextCompiler: compiler }),
    ...(instructionSnapshot === undefined ? {} : { instructionSnapshot }),
    ...(skillSnapshot === undefined ? {} : { skillSnapshot }),
    ...(options.base?.tools === undefined ? {} : { tools: options.base.tools }),
    ...(options.base?.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.base.toolPermissionPolicy })
  }
}

function instructionSnapshotFromContributions(
  contributions: readonly AppInstructionContribution[]
): InstructionSnapshot {
  return {
    status: "available",
    sources: contributions.map((contribution, index) =>
      instructionSourceFromContribution(contribution, index)
    ),
    diagnostics: []
  }
}

function instructionSourceFromContribution(
  contribution: AppInstructionContribution,
  index: number
): InstructionSource {
  const path = contributionPath(contribution)
  const content = contribution.value.text
  return {
    id: contribution.id,
    scope: instructionScope(contribution),
    path,
    target: contribution.value.target ?? "app-extension",
    content,
    order: contribution.order ?? index,
    byteLength: Buffer.byteLength(content),
    hash: contribution.value.hash ?? stableHash("instruction", contribution.id, content),
    ...(contribution.provenance.loadedAt === undefined
      ? {}
      : { mtimeMs: contribution.provenance.loadedAt })
  }
}

function skillSnapshotFromContributions(
  contributions: readonly AppSkillContribution[]
): SkillSnapshot {
  return {
    complete: true,
    sources: contributions.map((contribution, index) =>
      skillSourceFromContribution(contribution, index)
    ),
    diagnostics: []
  }
}

function skillSourceFromContribution(
  contribution: AppSkillContribution,
  index: number
): SkillSource {
  const source = contribution.value.source
  const body =
    source.kind === "embedded"
      ? source.body
      : source.kind === "remote"
        ? source.digest ?? source.url
        : source.entryPath
  const directory =
    source.kind === "directory"
      ? source.directory
      : `wanex-extension://${contribution.provenance.source.kind}/${contribution.provenance.source.id}/${contribution.id}`
  const path =
    source.kind === "directory"
      ? source.entryPath
      : source.kind === "remote"
        ? source.url
        : `${directory}/SKILL.md`
  return {
    id: contribution.id,
    scope: skillScope(contribution),
    name: contribution.value.name,
    description: contribution.value.description,
    directory,
    path,
    order: contribution.order ?? index,
    byteLength: contribution.value.byteLength ?? Buffer.byteLength(body),
    hash: contribution.value.sourceHash ?? stableHash("skill", contribution.id, body),
    bodyHash:
      contribution.value.bodyHash ??
      stableHash("skill-body", contribution.id, body),
    ...(contribution.value.allowedTools === undefined
      ? {}
      : { allowedTools: contribution.value.allowedTools }),
    ...(contribution.value.metadata === undefined
      ? {}
      : { metadata: contribution.value.metadata }),
    ...(contribution.provenance.loadedAt === undefined
      ? {}
      : { mtimeMs: contribution.provenance.loadedAt })
  }
}

function mergeInstructionSnapshots(
  base: InstructionSnapshot | undefined,
  extension: InstructionSnapshot
): InstructionSnapshot | undefined {
  if (base === undefined && extension.sources.length === 0) {
    return undefined
  }
  return {
    status:
      base?.status === "unavailable" || extension.status === "unavailable"
        ? "unavailable"
        : "available",
    sources: [...(base?.sources ?? []), ...extension.sources],
    diagnostics: [...(base?.diagnostics ?? []), ...extension.diagnostics]
  }
}

function mergeSkillSnapshots(
  base: SkillSnapshot | undefined,
  extension: SkillSnapshot
): SkillSnapshot | undefined {
  if (base === undefined && extension.sources.length === 0) {
    return undefined
  }
  return {
    complete: (base?.complete ?? true) && extension.complete,
    sources: [...(base?.sources ?? []), ...extension.sources],
    diagnostics: [...(base?.diagnostics ?? []), ...extension.diagnostics]
  }
}

function contributionPath(contribution: AppExtensionContribution): string {
  return (
    contribution.provenance.source.path ??
    `wanex-extension://${contribution.provenance.source.kind}/${contribution.provenance.source.id}/${contribution.id}`
  )
}

function instructionScope(
  contribution: AppInstructionContribution
): InstructionScope {
  return contribution.value.scope === "global" ||
    contribution.provenance.source.scope === "global"
    ? "global"
    : "project"
}

function skillScope(contribution: AppSkillContribution): SkillScope {
  return contribution.provenance.source.scope === "global" ? "global" : "project"
}

function stableHash(...parts: readonly string[]): string {
  const hash = createHash("sha256")
  for (const part of parts) {
    hash.update(part)
    hash.update("\0")
  }
  return hash.digest("hex")
}
