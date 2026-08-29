import {
  ExecutionEnvironmentClosedError,
  ExecutionScopeClosedError,
} from "./errors.js";
import { NativeExecutionFileSystem } from "./native-filesystem.js";
import { reviewedNativeLaunchEnvironment } from "./native-launch-environment.js";
import { createExecutionEnvironmentBinding } from "./environment-binding.js";
import { normalizeExecutionPolicy } from "./policy.js";
import { NativeExecutionProcess } from "./native-process.js";
import type {
  BindExecutionScopeRequest,
  ExecutionCapabilitySnapshot,
  ExecutionEnvironment,
  ExecutionEnvironmentBinding,
  ExecutionEnvironmentDescriptor,
  ExecutionPolicySnapshot,
  ExecutionProcess,
  ExecutionRequest,
  ExecutionResult,
  ExecutionScope,
  ExecutionTerminal,
  ExecutionTerminalProcess,
  ExecutionTerminalRequest,
  ManagedExecutionProcess,
  ManagedExecutionRequest,
  NativeExecutionEnvironmentOptions,
} from "./types.js";

const NATIVE_PROVIDER_ID = "wanex.execution.native";
const DEFAULT_PROVIDER_REVISION = "1";
export class NativeExecutionEnvironment implements ExecutionEnvironment {
  readonly descriptor: ExecutionEnvironmentDescriptor;
  readonly capabilities: ExecutionCapabilitySnapshot;
  readonly #options: NativeExecutionEnvironmentOptions;
  readonly #launchEnvironment: Readonly<Record<string, string>>;
  readonly #scopes = new Set<NativeExecutionScope>();
  readonly #scopeIds = new Set<string>();
  readonly #pendingBinds = new Set<Promise<ExecutionScope>>();
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(options: NativeExecutionEnvironmentOptions) {
    requireOpaqueId(options.environmentId, "environmentId");
    this.#options = options;
    this.#launchEnvironment = reviewedNativeLaunchEnvironment(
      process.env,
      options.launchEnvironmentOverrides,
    );
    this.descriptor = Object.freeze({
      revision: 1,
      environmentId: options.environmentId,
      providerId: NATIVE_PROVIDER_ID,
      providerRevision: options.providerRevision ?? DEFAULT_PROVIDER_REVISION,
      kind: "native",
    });
    this.capabilities = deepFreeze({
      revision: 1,
      isolation: { enforcement: "none" },
      filesystem: {
        enforcement: "library_guard",
        effects: ["create", "read", "remove", "write"],
      },
      process: {
        oneShot: true,
        managed: options.managedProcess === true,
        cleanup:
          options.strategy.kind === "supervised"
            ? "durable_supervisor"
            : "runtime_process_tree",
      },
      pty: {
        supported:
          (options.platform ?? process.platform) !== "win32" &&
          options.strategy.kind === "supervised" &&
          options.strategy.childSupervisor.startTerminal !== undefined,
      },
      network: { enforcement: "none" },
      secretProjection: { supported: false },
      artifactExport: { supported: true },
    } satisfies ExecutionCapabilitySnapshot);
  }

  bind(request: BindExecutionScopeRequest): Promise<ExecutionScope> {
    if (this.#closed)
      return Promise.reject(new ExecutionEnvironmentClosedError());
    requireOpaqueId(request.scopeId, "scopeId");
    if (this.#scopeIds.has(request.scopeId)) {
      return Promise.reject(new Error("execution scopeId is already active"));
    }
    const binding = this.resolveBinding({ policy: request.policy });
    const roots = matchFileSystemRoots(binding.policy, request.fileSystemRoots);
    this.#scopeIds.add(request.scopeId);
    const operation = this.#bindScope(request, binding, roots);
    this.#pendingBinds.add(operation);
    void operation
      .finally(() => this.#pendingBinds.delete(operation))
      .catch(() => {});
    return operation;
  }

  resolveBinding(request: {
    readonly policy: ExecutionPolicySnapshot;
  }): ExecutionEnvironmentBinding {
    if (this.#closed) throw new ExecutionEnvironmentClosedError();
    return createExecutionEnvironmentBinding({
      descriptor: this.descriptor,
      capabilities: this.capabilities,
      policy: normalizeExecutionPolicy(request.policy),
    });
  }

  async #bindScope(
    request: BindExecutionScopeRequest,
    binding: ExecutionEnvironmentBinding,
    roots: ReturnType<typeof matchFileSystemRoots>,
  ): Promise<ExecutionScope> {
    let scope!: NativeExecutionScope;
    try {
      scope = await NativeExecutionScope.create({
        binding,
        roots,
        strategy: this.#options.strategy,
        launchEnvironment: this.#launchEnvironment,
        supervisorClaim: request.supervisorClaim,
        processOptions: this.#options,
        onClose: () => {
          this.#scopes.delete(scope);
          this.#scopeIds.delete(request.scopeId);
        },
      });
    } catch (error) {
      this.#scopeIds.delete(request.scopeId);
      throw error;
    }
    if (this.#closed) {
      await scope.close();
      throw new ExecutionEnvironmentClosedError();
    }
    this.#scopes.add(scope);
    return scope;
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closed = true;
    this.#closePromise = (async () => {
      await Promise.allSettled([...this.#pendingBinds]);
      const scopes = await Promise.allSettled(
        [...this.#scopes].map(async (scope) => await scope.close()),
      );
      const failure = scopes.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure !== undefined) throw failure.reason;
    })();
    return this.#closePromise;
  }
}

class NativeExecutionScope implements ExecutionScope {
  readonly binding: ExecutionEnvironmentBinding;
  readonly fileSystem: import("./types.js").ExecutionFileSystem;
  readonly process: ExecutionProcess;
  readonly terminal?: ExecutionTerminal;
  readonly #nativeFileSystem: NativeExecutionFileSystem;
  readonly #active = new Set<AbortController>();
  readonly #operations = new Set<Promise<unknown>>();
  readonly #managed = new Set<ManagedExecutionProcess>();
  readonly #terminals = new Set<ExecutionTerminalProcess>();
  readonly #onClose: () => void;
  #closed = false;
  #closePromise: Promise<void> | undefined;

  private constructor(options: {
    readonly binding: ExecutionEnvironmentBinding;
    readonly fileSystem: NativeExecutionFileSystem;
    readonly nativeProcess: NativeExecutionProcess;
    readonly terminal?: ExecutionTerminal;
    readonly onClose: () => void;
  }) {
    this.binding = options.binding;
    this.#nativeFileSystem = options.fileSystem;
    this.fileSystem = {
      canonicalize: async (path) =>
        await this.#track(options.fileSystem.canonicalize(path)),
      metadata: async (path) =>
        await this.#track(options.fileSystem.metadata(path)),
      read: async (path) => await this.#track(options.fileSystem.read(path)),
      readRange: async (path, readOptions) =>
        await this.#track(options.fileSystem.readRange(path, readOptions)),
      list: async (path) => await this.#track(options.fileSystem.list(path)),
      createDirectory: async (path, createOptions) =>
        await this.#track(
          options.fileSystem.createDirectory(path, createOptions),
        ),
      remove: async (path, removeOptions) =>
        await this.#track(options.fileSystem.remove(path, removeOptions)),
    };
    this.#onClose = options.onClose;
    if (options.terminal !== undefined) this.terminal = options.terminal;
    this.process = {
      execute: async (request) =>
        await this.#track(this.#execute(options.nativeProcess, request)),
      start: async (request) =>
        await this.#track(this.#start(options.nativeProcess, request)),
    };
  }

  static async create(options: {
    readonly binding: ExecutionEnvironmentBinding;
    readonly roots: readonly {
      readonly id: string;
      readonly path: string;
      readonly effects: readonly import("./types.js").ExecutionFileEffect[];
    }[];
    readonly strategy: NativeExecutionEnvironmentOptions["strategy"];
    readonly launchEnvironment: Readonly<Record<string, string>>;
    readonly supervisorClaim: BindExecutionScopeRequest["supervisorClaim"];
    readonly processOptions: NativeExecutionEnvironmentOptions;
    readonly onClose: () => void;
  }): Promise<NativeExecutionScope> {
    let scope!: NativeExecutionScope;
    const nativeProcess = new NativeExecutionProcess({
      launchEnvironment: options.launchEnvironment,
      strategy: options.strategy,
      allowOneShotProcess: options.binding.policy.process.oneShot,
      allowManagedProcess: options.binding.policy.process.managed,
      allowedEnvironmentVariables:
        options.binding.policy.process.environmentVariables,
      ...(options.supervisorClaim === undefined
        ? {}
        : { supervisorClaim: options.supervisorClaim }),
      ...(options.processOptions.defaultOutputLimitBytes === undefined
        ? {}
        : {
            defaultOutputLimitBytes:
              options.processOptions.defaultOutputLimitBytes,
          }),
      ...(options.processOptions.maxOutputLimitBytes === undefined
        ? {}
        : { maxOutputLimitBytes: options.processOptions.maxOutputLimitBytes }),
      ...(options.processOptions.maxStdinBytes === undefined
        ? {}
        : { maxStdinBytes: options.processOptions.maxStdinBytes }),
      ...(options.processOptions.terminationGraceMs === undefined
        ? {}
        : { terminationGraceMs: options.processOptions.terminationGraceMs }),
      ...(options.processOptions.cleanupTimeoutMs === undefined
        ? {}
        : { cleanupTimeoutMs: options.processOptions.cleanupTimeoutMs }),
      ...(options.processOptions.platform === undefined
        ? {}
        : { platform: options.processOptions.platform }),
      ...(options.processOptions.windowsTreeTerminator === undefined
        ? {}
        : {
            windowsTreeTerminator: options.processOptions.windowsTreeTerminator,
          }),
      onManagedProcess: (process) => scope.#managed.add(process),
      onManagedProcessSettled: (process) => scope.#managed.delete(process),
    });
    const fileSystem = await NativeExecutionFileSystem.create({
      roots: options.roots,
      maxReadBytes: options.binding.policy.filesystem.maxReadBytes,
      maxDirectoryEntries:
        options.binding.policy.filesystem.maxDirectoryEntries,
      assertOpen: () => scope.#assertOpen(),
    });
    const terminalSupported =
      options.binding.policy.pty &&
      options.strategy.kind === "supervised" &&
      options.strategy.childSupervisor.startTerminal !== undefined;
    scope = new NativeExecutionScope({
      binding: options.binding,
      fileSystem,
      nativeProcess,
      ...(terminalSupported
        ? {
            terminal: {
              start: async (request) => {
                return await scope.#track(
                  scope.#startTerminal(nativeProcess, request),
                );
              },
            },
          }
        : {}),
      onClose: options.onClose,
    });
    return scope;
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closed = true;
    for (const controller of this.#active) controller.abort();
    this.#closePromise = Promise.allSettled([
      ...this.#operations,
      ...[...this.#managed].map(async (process) => {
        await process.terminate("cancelled");
        await process.wait();
      }),
      ...[...this.#terminals].map(async (terminal) => {
        await terminal.terminate("cancelled");
        await terminal.wait();
      }),
    ]).then((results) => {
      this.#active.clear();
      this.#operations.clear();
      this.#managed.clear();
      this.#terminals.clear();
      this.#onClose();
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure !== undefined) throw failure.reason;
    });
    return this.#closePromise;
  }

  async #execute(
    process: NativeExecutionProcess,
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    this.#assertOpen();
    const cwd = await this.#nativeFileSystem.resolveWorkingDirectory(
      request.cwd,
    );
    this.#assertOpen();
    const linked = linkedAbortController(request.signal);
    this.#active.add(linked.controller);
    const execution = process.execute({
      ...request,
      cwd,
      signal: linked.controller.signal,
    });
    try {
      return await execution;
    } finally {
      linked.release();
      this.#active.delete(linked.controller);
    }
  }

  async #start(
    process: NativeExecutionProcess,
    request: ManagedExecutionRequest,
  ): Promise<ManagedExecutionProcess> {
    this.#assertOpen();
    const cwd = await this.#nativeFileSystem.resolveWorkingDirectory(
      request.cwd,
    );
    this.#assertOpen();
    const linked = linkedAbortController(request.signal);
    this.#active.add(linked.controller);
    try {
      const managed = await process.start({
        ...request,
        cwd,
        signal: linked.controller.signal,
      });
      void managed
        .wait()
        .finally(() => {
          linked.release();
          this.#active.delete(linked.controller);
        })
        .catch(() => {});
      return managed;
    } catch (error) {
      linked.release();
      this.#active.delete(linked.controller);
      throw error;
    }
  }

  async #startTerminal(
    process: NativeExecutionProcess,
    request: ExecutionTerminalRequest,
  ): Promise<ExecutionTerminalProcess> {
    this.#assertOpen();
    const cwd = await this.#nativeFileSystem.resolveWorkingDirectory(
      request.cwd,
    );
    this.#assertOpen();
    const linked = linkedAbortController(request.signal);
    this.#active.add(linked.controller);
    try {
      const terminal = await process.startTerminal({
        ...request,
        cwd,
        signal: linked.controller.signal,
      });
      if (this.#closed) {
        await terminal.terminate("cancelled").catch(() => {});
        await terminal.wait();
        throw new ExecutionScopeClosedError();
      }
      this.#terminals.add(terminal);
      void terminal
        .wait()
        .finally(() => {
          linked.release();
          this.#active.delete(linked.controller);
          this.#terminals.delete(terminal);
        })
        .catch(() => {});
      return terminal;
    } catch (error) {
      linked.release();
      this.#active.delete(linked.controller);
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new ExecutionScopeClosedError();
  }

  #track<T>(operation: Promise<T>): Promise<T> {
    this.#operations.add(operation);
    void operation
      .finally(() => this.#operations.delete(operation))
      .catch(() => {});
    return operation;
  }
}

function matchFileSystemRoots(
  policy: ExecutionPolicySnapshot,
  bindings: BindExecutionScopeRequest["fileSystemRoots"],
): readonly {
  readonly id: string;
  readonly path: string;
  readonly effects: readonly import("./types.js").ExecutionFileEffect[];
}[] {
  const paths = new Map(bindings.map((binding) => [binding.id, binding.path]));
  if (
    paths.size !== bindings.length ||
    paths.size !== policy.filesystem.roots.length
  ) {
    throw new Error("execution filesystem root binding does not match policy");
  }
  return policy.filesystem.roots.map((root) => {
    const path = paths.get(root.id);
    if (path === undefined) {
      throw new Error(
        `execution filesystem root binding is missing: ${root.id}`,
      );
    }
    return { id: root.id, path, effects: root.effects };
  });
}

function linkedAbortController(
  signal: import("@wanex/protocol").RuntimeAbortSignal | undefined,
): {
  readonly controller: AbortController;
  readonly release: () => void;
} {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted === true) controller.abort();
  return {
    controller,
    release: () => signal?.removeEventListener("abort", abort),
  };
}

function requireOpaqueId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error(`execution ${label} is invalid`);
  }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`execution ${label} must be a positive integer`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}
