import type { ExecutionPolicySnapshot, SessionTurnAdmissionCondition } from "@wanex/protocol"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import type { InstructionSnapshot, SkillSnapshot } from "@wanex/runtime/context"
import type { ToolDefinition } from "@wanex/runtime/tools"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import type { WorkspaceAccessStore } from "./access.js"
import type { WorkspaceAccessCoordinator } from "./access-coordinator.js"

export interface WorkspaceRoot {
  readonly id: string
  readonly path: string
  /** Read is the default. Write effects must be explicitly granted. */
  readonly effects?: readonly WorkspaceFileEffect[]
}

export type WorkspaceFileEffect = "read" | "write" | "create" | "remove"

export interface WorkspaceHostOptions {
  readonly hostId: string
  /** Host-local persistent isolation directory; never supplied by a remote client. */
  readonly worktreeDirectory?: string
  /** Used only to initialize an absent authority record. Never reapplied on restart. */
  readonly initialRoots?: readonly WorkspaceRoot[]
  /**
   * Trusted native directory picker (Desktop main). When absent, users cannot add
   * folders themselves; the model can still request access in the conversation.
   */
  readonly selectDirectory?: () => Promise<string | undefined>
}

export interface WorkspaceControllerDependencies {
  readonly serviceBin: string
  readonly workspaceStore: WorkspaceStore
  readonly createCapabilityTools?: (options: WorkspaceToolFactoryOptions) => readonly ToolDefinition[]
  readonly createMutationTools?: (options: WorkspaceToolFactoryOptions) => readonly ToolDefinition[]
}

export interface WorkspaceToolFactoryOptions {
  readonly coreStore: CoreStore
  readonly generation: WorkspaceGeneration
  readonly generationKey: string
  readonly environment: ExecutionEnvironment
  readonly serviceBin: string
  readonly workspaceStore: WorkspaceStore
  readonly accessStore: WorkspaceAccessStore
  readonly accessCoordinator: WorkspaceAccessCoordinator
  readonly assertAuthority: () => Promise<void>
}

export interface WorkspaceContext {
  readonly rootIds: readonly string[]
  readonly cwd?: string
}

export interface WorkspaceContextEntry {
  readonly revision: number | null
  readonly context: WorkspaceContext
}

export interface WorkspaceAuthorityEntry {
  readonly revision: number
  readonly roots: readonly WorkspaceRoot[]
}

export interface WorkspaceHostPort {
  readAuthority(): Promise<WorkspaceAuthorityEntry>
  setAuthority(request: { readonly expectedRevision: number; readonly roots: readonly WorkspaceRoot[] }): Promise<WorkspaceAuthorityEntry>
  readContext(sessionId: string): Promise<WorkspaceContextEntry>
  setContext(request: { readonly sessionId: string; readonly expectedRevision: number | null; readonly context: WorkspaceContext }): Promise<WorkspaceContextEntry>
}

export interface RootIdentity extends WorkspaceRoot {
  readonly effects: readonly WorkspaceFileEffect[]
  readonly device: string
  readonly inode: string
}

export interface RootContext {
  readonly root: RootIdentity
  readonly instructions: InstructionSnapshot
  readonly skills: SkillSnapshot
}

export interface WorkspaceGeneration {
  readonly hostId: string
  readonly worktreeDirectory?: string
  readonly authority: ConfigEntryRecord
  readonly selection: WorkspaceContext
  readonly conditions: readonly SessionTurnAdmissionCondition[]
  readonly roots: readonly RootContext[]
  readonly instructions: InstructionSnapshot
  readonly skills: SkillSnapshot
}

export function readOnlyPolicy(roots: readonly WorkspaceRoot[]): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: roots.map(({ id }) => ({ id, effects: ["read"] })),
      maxReadBytes: 262_144,
      maxDirectoryEntries: 1024
    },
    process: { oneShot: false, managed: false, cleanup: "runtime_process_tree", environmentVariables: [] },
    network: "unrestricted", isolation: "none", pty: false
  }
}

export function writablePolicy(roots: readonly RootIdentity[]): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: roots.map(({ id, effects }) => ({ id, effects })),
      maxReadBytes: 1_048_576,
      maxDirectoryEntries: 1024
    },
    // The transaction helper is a supervised control-plane process. No model
    // command execution is exposed through this scope.
    process: { oneShot: false, managed: true, cleanup: "runtime_process_tree", environmentVariables: [] },
    network: "unrestricted", isolation: "none", pty: false
  }
}
