import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"

export type InstructionScope = "global" | "project"

export type InstructionSnapshotStatus = "available" | "unavailable"

export type ProjectInstructionTrust = "trusted" | "untrusted"

export interface InstructionTrustPolicy {
  readonly projectInstructions: ProjectInstructionTrust
}

export interface InstructionDiscoveryOptions {
  readonly cwd: string
  readonly projectRoot?: string
  readonly globalConfigDir?: string
  readonly targets?: readonly string[]
  readonly trust?: Partial<InstructionTrustPolicy>
  readonly fs?: InstructionFileSystem
}

export interface InstructionFileSystem {
  readFile(path: string): Promise<string | undefined>
  stat(path: string): Promise<InstructionFileStat | undefined>
}

export interface InstructionFileStat {
  readonly isFile: boolean
  readonly mtimeMs?: number
}

export interface InstructionSource {
  readonly id: string
  readonly scope: InstructionScope
  readonly path: string
  readonly target: string
  readonly content: string
  readonly order: number
  readonly byteLength: number
  readonly hash: string
  readonly mtimeMs?: number
}

export interface InstructionSourceProvenance {
  readonly id: string
  readonly scope: InstructionScope
  readonly path: string
  readonly target: string
  readonly order: number
  readonly byteLength: number
  readonly hash: string
  readonly mtimeMs?: number
}

export type InstructionDiagnosticSeverity = "info" | "warning" | "error"

export type InstructionDiagnosticCode =
  | "instruction.project_untrusted"
  | "instruction.source_missing"
  | "instruction.source_unavailable"
  | "instruction.invalid_options"

export interface InstructionDiagnostic {
  readonly code: InstructionDiagnosticCode
  readonly severity: InstructionDiagnosticSeverity
  readonly message: string
  readonly path?: string
  readonly scope?: InstructionScope
}

export interface InstructionSnapshot {
  readonly status: InstructionSnapshotStatus
  readonly sources: readonly InstructionSource[]
  readonly diagnostics: readonly InstructionDiagnostic[]
}

export interface RenderInstructionSnapshotOptions {
  readonly snapshot: InstructionSnapshot
}

export interface InstructionContextCompilerOptions {
  readonly snapshot: InstructionSnapshot
  readonly downstream?: ContextCompiler
}

export interface InstructionContextCompileInput extends CompileContextInput {}

export interface InstructionContextCompiledContext extends CompiledContext {}
