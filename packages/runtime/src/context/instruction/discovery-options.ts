import { nodeInstructionFileSystem } from "./fs.js"
import {
  isInsideOrSame,
  normalizeAbsolutePath
} from "./paths.js"
import type {
  InstructionDiagnostic,
  InstructionDiscoveryOptions,
  InstructionFileSystem,
  InstructionTrustPolicy
} from "./types.js"

const DEFAULT_TARGETS = ["AGENTS.md"] as const

const DEFAULT_TRUST: InstructionTrustPolicy = {
  projectInstructions: "untrusted"
}

export interface ResolvedInstructionDiscoveryOptions {
  readonly fs: InstructionFileSystem
  readonly targets: readonly string[]
  readonly trust: InstructionTrustPolicy
  readonly cwd: string
  readonly projectRoot: string
  readonly globalConfigDir?: string
}

export function resolveInstructionDiscoveryOptions(
  options: InstructionDiscoveryOptions
):
  | {
      readonly status: "available"
      readonly options: ResolvedInstructionDiscoveryOptions
    }
  | {
      readonly status: "unavailable"
      readonly diagnostic: InstructionDiagnostic
    } {
  const targets = options.targets ?? DEFAULT_TARGETS
  if (targets.length === 0 || targets.some((target) => !isSafeTarget(target))) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "instruction.invalid_options",
        severity: "error",
        message:
          "Instruction targets must be non-empty relative file names without path separators."
      }
    }
  }

  const cwd = normalizeAbsolutePath(options.cwd)
  const projectRoot = normalizeAbsolutePath(options.projectRoot ?? cwd)
  if (!isInsideOrSame(projectRoot, cwd)) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "instruction.invalid_options",
        severity: "error",
        message: "Instruction cwd must be inside projectRoot."
      }
    }
  }

  return {
    status: "available",
    options: {
      fs: options.fs ?? nodeInstructionFileSystem,
      targets,
      trust: {
        ...DEFAULT_TRUST,
        ...options.trust
      },
      cwd,
      projectRoot,
      ...(options.globalConfigDir === undefined
        ? {}
        : { globalConfigDir: normalizeAbsolutePath(options.globalConfigDir) })
    }
  }
}

function isSafeTarget(target: string): boolean {
  return (
    target.length > 0 &&
    !target.includes("/") &&
    !target.includes("\\") &&
    !target.includes("\0") &&
    target !== "." &&
    target !== ".."
  )
}
