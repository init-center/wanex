import { Buffer } from "node:buffer"
import { stableInstructionHash } from "./hash.js"
import type {
  InstructionDiagnostic,
  InstructionFileStat,
  InstructionFileSystem,
  InstructionScope,
  InstructionSnapshot,
  InstructionSource
} from "./types.js"

export async function readInstructionSource(options: {
  readonly fs: InstructionFileSystem
  readonly path: string
  readonly scope: InstructionScope
  readonly target: string
  readonly order: number
}): Promise<
  | { readonly status: "available"; readonly source?: InstructionSource }
  | { readonly status: "unavailable"; readonly diagnostic: InstructionDiagnostic }
> {
  const stat = await safeStat(options.fs, options.path, options.scope)
  if (stat.status === "unavailable") {
    return stat
  }
  if (stat.stat?.isFile !== true) {
    return { status: "available" }
  }

  let content: string | undefined
  try {
    content = await options.fs.readFile(options.path)
  } catch (error) {
    return {
      status: "unavailable",
      diagnostic: unavailableDiagnostic(options.path, options.scope, error)
    }
  }
  if (content === undefined) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "instruction.source_missing",
        severity: "warning",
        message: "Instruction source disappeared before it could be read.",
        path: options.path,
        scope: options.scope
      }
    }
  }

  return {
    status: "available",
    source: {
      id: `${options.scope}:${stableInstructionHash(options.path)}`,
      scope: options.scope,
      path: options.path,
      target: options.target,
      content,
      order: options.order,
      byteLength: Buffer.byteLength(content, "utf8"),
      hash: stableInstructionHash(content),
      ...(stat.stat.mtimeMs === undefined ? {} : { mtimeMs: stat.stat.mtimeMs })
    }
  }
}

export async function safeStat(
  fs: InstructionFileSystem,
  path: string,
  scope: InstructionScope
): Promise<
  | { readonly status: "available"; readonly stat?: InstructionFileStat }
  | { readonly status: "unavailable"; readonly diagnostic: InstructionDiagnostic }
> {
  try {
    const stat = await fs.stat(path)
    return stat === undefined ? { status: "available" } : { status: "available", stat }
  } catch (error) {
    return {
      status: "unavailable",
      diagnostic: unavailableDiagnostic(path, scope, error)
    }
  }
}

export function unavailableInstructionSnapshot(
  diagnostic: InstructionDiagnostic,
  sources: readonly InstructionSource[] = [],
  diagnostics: readonly InstructionDiagnostic[] = []
): InstructionSnapshot {
  return {
    status: "unavailable",
    sources,
    diagnostics: [...diagnostics, diagnostic]
  }
}

function unavailableDiagnostic(
  path: string,
  scope: InstructionScope,
  error: unknown
): InstructionDiagnostic {
  return {
    code: "instruction.source_unavailable",
    severity: "error",
    message: `Instruction source is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    path,
    scope
  }
}
