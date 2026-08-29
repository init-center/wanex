import type { RuntimeAbortSignal } from "@wanex/protocol";
import type {
  ExecutionCapabilitySnapshot,
  ExecutionEnvironmentBinding,
  ExecutionEnvironmentDescriptor,
  ExecutionPolicySnapshot,
  ExecutionFileEffect,
} from "@wanex/protocol";
import type {
  ChildSupervisor,
  ChildSupervisorClaim,
} from "./supervisor-types.js";

export type ExecutionTerminationReason =
  | "exited"
  | "signaled"
  | "timed_out"
  | "cancelled"
  | "pipe_eof";

export type ExecutionCleanupStatus = "not_required" | "completed" | "failed";

export interface ExecutionOutputLimit {
  readonly stdoutBytes?: number;
  readonly stderrBytes?: number;
}

export interface ExecutionRequest {
  readonly program: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly stdin?: string | Uint8Array;
  readonly signal?: RuntimeAbortSignal;
  readonly timeoutMs?: number;
  readonly output?: ExecutionOutputLimit;
}

export interface ExecutionOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly observedBytes: number;
  readonly retainedBytes: number;
  readonly truncated: boolean;
}

export interface ExecutionResult {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: ExecutionTerminationReason;
  readonly cleanup: ExecutionCleanupStatus;
  readonly cleanupError?: string;
  readonly durationMs: number;
  readonly stdout: ExecutionOutput;
  readonly stderr: ExecutionOutput;
}

export interface ExecutionProcess {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  start(request: ManagedExecutionRequest): Promise<ManagedExecutionProcess>;
}

export interface ManagedExecutionRequest {
  readonly program: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly signal?: RuntimeAbortSignal;
  readonly timeoutMs?: number;
  readonly output?: ExecutionOutputLimit;
}

export type ManagedExecutionEvent =
  | { readonly type: "stdout"; readonly bytes: Uint8Array }
  | { readonly type: "stderr"; readonly bytes: Uint8Array }
  | { readonly type: "terminal"; readonly result: ExecutionResult };

export interface ManagedExecutionProcess {
  readonly events: AsyncIterable<ManagedExecutionEvent>;
  write(input: string | Uint8Array): Promise<void>;
  closeInput(): Promise<void>;
  terminate(reason?: "cancelled" | "timed_out"): Promise<void>;
  wait(): Promise<ExecutionResult>;
}

export interface ExecutionTerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export interface ExecutionTerminalRequest {
  readonly program: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly signal?: RuntimeAbortSignal;
  readonly timeoutMs?: number;
  readonly outputBytes?: number;
  readonly size: ExecutionTerminalSize;
}

export interface ExecutionTerminalOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly observedBytes: number;
  readonly retainedBytes: number;
  readonly truncated: boolean;
}

export interface ExecutionTerminalResult {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: ExecutionTerminationReason;
  readonly cleanup: ExecutionCleanupStatus;
  readonly cleanupError?: string;
  readonly durationMs: number;
  readonly output: ExecutionTerminalOutput;
}

export type ExecutionTerminalEvent =
  | { readonly type: "data"; readonly bytes: Uint8Array }
  | { readonly type: "terminal"; readonly result: ExecutionTerminalResult };

export interface ExecutionTerminalProcess {
  readonly events: AsyncIterable<ExecutionTerminalEvent>;
  write(input: string | Uint8Array): Promise<void>;
  resize(size: ExecutionTerminalSize): Promise<void>;
  terminate(reason?: "cancelled" | "timed_out"): Promise<void>;
  wait(): Promise<ExecutionTerminalResult>;
  close(): Promise<void>;
}

export interface ExecutionTerminal {
  start(request: ExecutionTerminalRequest): Promise<ExecutionTerminalProcess>;
}

export interface BindExecutionScopeRequest {
  readonly scopeId: string;
  readonly policy: ExecutionPolicySnapshot;
  readonly fileSystemRoots: readonly {
    readonly id: string;
    readonly path: string;
  }[];
  readonly supervisorClaim?: ChildSupervisorClaim;
}

export interface ExecutionFileMetadata {
  readonly kind: "file" | "directory" | "symlink" | "other";
  readonly size: number;
  readonly modifiedAt: number;
}

export interface ExecutionDirectoryEntry {
  readonly name: string;
  readonly kind: ExecutionFileMetadata["kind"];
}

export interface ExecutionFileSystem {
  canonicalize(path: string): Promise<string>;
  metadata(path: string): Promise<ExecutionFileMetadata | null>;
  read(path: string): Promise<Uint8Array>;
  readRange(
    path: string,
    options: { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array>;
  list(path: string): Promise<readonly ExecutionDirectoryEntry[]>;
  createDirectory(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<void>;
  remove(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<void>;
}

export interface BorrowedExecutionScope {
  readonly binding: ExecutionEnvironmentBinding;
  readonly fileSystem: ExecutionFileSystem;
  readonly process: ExecutionProcess;
  readonly terminal?: ExecutionTerminal;
}

export interface ExecutionScope extends BorrowedExecutionScope {
  close(): Promise<void>;
}

export interface ExecutionEnvironment {
  readonly descriptor: ExecutionEnvironmentDescriptor;
  readonly capabilities: ExecutionCapabilitySnapshot;
  resolveBinding(request: {
    readonly policy: ExecutionPolicySnapshot;
  }): ExecutionEnvironmentBinding;
  bind(request: BindExecutionScopeRequest): Promise<ExecutionScope>;
  close(): Promise<void>;
}

export type {
  ExecutionCapabilitySnapshot,
  ExecutionEnvironmentBinding,
  ExecutionEnvironmentDescriptor,
  ExecutionFileEffect,
  ExecutionPolicySnapshot,
} from "@wanex/protocol";

export type NativeExecutionStrategy =
  | { readonly kind: "direct" }
  | { readonly kind: "supervised"; readonly childSupervisor: ChildSupervisor };

export interface NativeExecutionEnvironmentOptions {
  readonly environmentId: string;
  readonly providerRevision?: string;
  readonly strategy: NativeExecutionStrategy;
  readonly launchEnvironmentOverrides?: Readonly<Record<string, string>>;
  readonly managedProcess?: boolean;
  readonly defaultOutputLimitBytes?: number;
  readonly maxOutputLimitBytes?: number;
  readonly maxStdinBytes?: number;
  readonly terminationGraceMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly platform?: NodeJS.Platform;
  readonly windowsTreeTerminator?: WindowsTreeTerminator;
}

export interface NativeExecutionProcessOptions {
  readonly launchEnvironment: Readonly<Record<string, string>>;
  readonly strategy: NativeExecutionStrategy;
  readonly allowOneShotProcess: boolean;
  readonly allowManagedProcess: boolean;
  readonly allowedEnvironmentVariables: readonly string[];
  readonly defaultOutputLimitBytes?: number;
  readonly maxOutputLimitBytes?: number;
  readonly maxStdinBytes?: number;
  readonly terminationGraceMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly platform?: NodeJS.Platform;
  readonly windowsTreeTerminator?: WindowsTreeTerminator;
  readonly supervisorClaim?: ChildSupervisorClaim;
  readonly onManagedProcess?: (process: ManagedExecutionProcess) => void;
  readonly onManagedProcessSettled?: (process: ManagedExecutionProcess) => void;
}

export interface WindowsTreeTerminator {
  terminate(pid: number): Promise<void>;
}
