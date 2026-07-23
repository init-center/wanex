import type { PreparedAgentContext } from "@wanex/runtime/context"

export function preparedWanexAppAgentContextFingerprint(
  prepared: PreparedAgentContext
): string {
  return JSON.stringify({
    instructions:
      prepared.instructionSnapshot?.sources.map((source) => ({
        scope: source.scope,
        path: source.path,
        target: source.target,
        hash: source.hash,
        byteLength: source.byteLength
      })) ?? [],
    instructionDiagnostics:
      prepared.instructionSnapshot?.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path ?? null,
        scope: diagnostic.scope ?? null
      })) ?? [],
    skills:
      prepared.skillSnapshot?.sources.map((source) => ({
        scope: source.scope,
        name: source.name,
        directory: source.directory,
        path: source.path,
        hash: source.hash,
        bodyHash: source.bodyHash,
        byteLength: source.byteLength
      })) ?? [],
    skillDiagnostics:
      prepared.skillSnapshot?.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path ?? null,
        scope: diagnostic.scope ?? null,
        skillName: diagnostic.skillName ?? null
      })) ?? [],
    activationToolRegistered: prepared.tools !== undefined
  })
}
