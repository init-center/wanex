import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"

export type SkillScope = "global" | "project"

export type SkillSnapshotStatus = "available" | "unavailable"

export type ProjectSkillTrust = "trusted" | "untrusted"

export interface SkillTrustPolicy {
  readonly projectSkills: ProjectSkillTrust
}

export interface SkillDiscoveryOptions {
  readonly cwd: string
  readonly projectRoot?: string
  readonly globalSkillDirs?: readonly string[]
  readonly projectSkillDirs?: readonly string[]
  readonly trust?: Partial<SkillTrustPolicy>
  readonly fs?: SkillFileSystem
}

export interface SkillFileSystem {
  readFile(path: string): Promise<string | undefined>
  readDir(path: string): Promise<readonly SkillDirEntry[] | undefined>
  stat(path: string): Promise<SkillFileStat | undefined>
}

export interface SkillFileStat {
  readonly isFile: boolean
  readonly isDirectory: boolean
  readonly mtimeMs?: number
}

export interface SkillDirEntry {
  readonly name: string
  readonly isDirectory: boolean
  readonly isFile: boolean
}

export interface ParsedSkillMarkdown {
  readonly name: string
  readonly description: string
  readonly body: string
  readonly allowedTools?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
}

export interface SkillSource {
  readonly id: string
  readonly scope: SkillScope
  readonly name: string
  readonly description: string
  readonly directory: string
  readonly path: string
  readonly order: number
  readonly byteLength: number
  readonly hash: string
  readonly bodyHash: string
  readonly allowedTools?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
  readonly mtimeMs?: number
}

export interface SkillSourceProvenance {
  readonly id: string
  readonly scope: SkillScope
  readonly name: string
  readonly directory: string
  readonly path: string
  readonly order: number
  readonly byteLength: number
  readonly hash: string
  readonly bodyHash: string
  readonly allowedTools?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
  readonly mtimeMs?: number
}

export type SkillDiagnosticSeverity = "info" | "warning" | "error"

export type SkillDiagnosticCode =
  | "skill.project_untrusted"
  | "skill.source_missing"
  | "skill.source_unavailable"
  | "skill.invalid_options"
  | "skill.invalid_frontmatter"
  | "skill.invalid_metadata"
  | "skill.duplicate_name"

export interface SkillDiagnostic {
  readonly code: SkillDiagnosticCode
  readonly severity: SkillDiagnosticSeverity
  readonly message: string
  readonly path?: string
  readonly scope?: SkillScope
  readonly skillName?: string
}

export interface SkillSnapshot {
  readonly status: SkillSnapshotStatus
  readonly sources: readonly SkillSource[]
  readonly diagnostics: readonly SkillDiagnostic[]
}

export interface ParseSkillMarkdownOptions {
  readonly content: string
  readonly path: string
  readonly directoryName: string
}

export interface RenderSkillSnapshotOptions {
  readonly snapshot: SkillSnapshot
}

export interface SkillContextCompilerOptions {
  readonly snapshot: SkillSnapshot
  readonly downstream?: ContextCompiler
}

export interface SkillContextCompileInput extends CompileContextInput {}

export interface SkillContextCompiledContext extends CompiledContext {}

export interface SkillActivationOptions {
  readonly snapshot: SkillSnapshot
  readonly fs?: SkillFileSystem
  readonly maxIndexedFiles?: number
  readonly supportingDirectories?: readonly string[]
}

export interface ActivateSkillInput {
  readonly name: string
}

export interface SkillSupportingFile {
  readonly path: string
  readonly relativePath: string
}

export interface SkillActivationProvenance {
  readonly scope: SkillScope
  readonly hash: string
  readonly bodyHash: string
  readonly mtimeMs?: number
}

export interface SkillActivationResult {
  readonly name: string
  readonly description: string
  readonly directory: string
  readonly path: string
  readonly content: string
  readonly provenance: SkillActivationProvenance
  readonly supportingFiles: readonly SkillSupportingFile[]
}

export type SkillActivationToolResult = Readonly<{
  name: string
  directory: string
  path: string
  output: string
  provenance: SkillActivationProvenance
  supportingFiles: readonly Readonly<{
    path: string
    relativePath: string
  }>[]
}>

export type SkillActivationToolError = Readonly<{
  error:
    | "invalid_input"
    | "skill_not_found"
    | "skill_source_missing"
    | "skill_source_invalid"
    | "skill_source_changed"
    | "skill_source_unavailable"
  message: string
  skillName?: string
}>
