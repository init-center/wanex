import { accessSync, constants } from "node:fs"
import { realpath } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import type {
  ExecutionCapabilitySnapshot,
  ExecutionEnvironmentBinding,
  ExecutionEnvironmentDescriptor,
  ExecutionPolicySnapshot
} from "@wanex/protocol"
import {
  ExecutionEnvironmentClosedError,
  UnsupportedExecutionCapabilityError
} from "../errors.js"
import {
  createExecutionEnvironmentBinding
} from "../environment-binding.js"
import { normalizeExecutionPolicy } from "../policy.js"
import type {
  BindExecutionScopeRequest,
  ExecutionEnvironment,
  ExecutionScope,
  NativeExecutionEnvironmentOptions
} from "../types.js"
import type { ChildSupervisor } from "../supervisor-types.js"
import {
  MacosSeatbeltChildSupervisor
} from "./supervisor.js"

const PROVIDER_ID = "wanex.execution.macos-seatbelt"
const PROVIDER_REVISION = "1"
const SEATBELT_EXECUTABLE = "/usr/bin/sandbox-exec"

export interface MacosSeatbeltExecutionEnvironmentOptions {
  readonly environmentId: string
  readonly providerRevision?: string
  readonly childSupervisor: ChildSupervisor
  readonly nativeEnvironmentFactory: (
    options: NativeExecutionEnvironmentOptions,
  ) => ExecutionEnvironment
  readonly launchEnvironmentOverrides?: Readonly<Record<string, string>>
  readonly defaultOutputLimitBytes?: number
  readonly maxOutputLimitBytes?: number
  readonly maxStdinBytes?: number
  readonly terminationGraceMs?: number
  readonly cleanupTimeoutMs?: number
}

export class MacosSeatbeltExecutionEnvironment implements ExecutionEnvironment {
  readonly descriptor: ExecutionEnvironmentDescriptor
  readonly capabilities: ExecutionCapabilitySnapshot
  readonly #options: MacosSeatbeltExecutionEnvironmentOptions
  readonly #scopes = new Set<MacosSeatbeltExecutionScope>()
  readonly #scopeIds = new Set<string>()
  readonly #pendingBinds = new Set<Promise<ExecutionScope>>()
  #closed = false
  #closePromise: Promise<void> | undefined

  constructor(options: MacosSeatbeltExecutionEnvironmentOptions) {
    requireOpaqueId(options.environmentId, "environmentId")
    if (process.platform !== "darwin") {
      throw new UnsupportedExecutionCapabilityError("macos.seatbelt")
    }
    if (options.childSupervisor.startManaged === undefined) {
      throw new UnsupportedExecutionCapabilityError("process.managed")
    }
    this.#assertAvailable()
    this.#options = options
    this.descriptor = Object.freeze({
      revision: 1,
      environmentId: options.environmentId,
      providerId: PROVIDER_ID,
      providerRevision: options.providerRevision ?? PROVIDER_REVISION,
      kind: "macos-seatbelt",
    })
    this.capabilities = Object.freeze({
      revision: 1,
      isolation: { enforcement: "os" },
      filesystem: {
        enforcement: "os",
        effects: ["create", "read", "remove", "write"],
      },
      process: {
        oneShot: true,
        managed: true,
        cleanup: "durable_supervisor",
      },
      pty: { supported: options.childSupervisor.startTerminal !== undefined },
      network: { enforcement: "os" },
      secretProjection: { supported: false },
      artifactExport: { supported: true },
    } satisfies ExecutionCapabilitySnapshot)
  }

  resolveBinding(request: {
    readonly policy: ExecutionPolicySnapshot
  }): ExecutionEnvironmentBinding {
    if (this.#closed) throw new ExecutionEnvironmentClosedError()
    return createExecutionEnvironmentBinding({
      descriptor: this.descriptor,
      capabilities: this.capabilities,
      policy: normalizeExecutionPolicy(request.policy),
    })
  }

  bind(request: BindExecutionScopeRequest): Promise<ExecutionScope> {
    if (this.#closed) {
      return Promise.reject(new ExecutionEnvironmentClosedError())
    }
    requireOpaqueId(request.scopeId, "scopeId")
    if (this.#scopeIds.has(request.scopeId)) {
      return Promise.reject(new Error("execution scopeId is already active"))
    }
    const policy = normalizeExecutionPolicy(request.policy)
    const binding = this.resolveBinding({ policy })
    this.#scopeIds.add(request.scopeId)
    const operation = this.#bindScope(request, policy, binding)
    this.#pendingBinds.add(operation)
    void operation
      .finally(() => this.#pendingBinds.delete(operation))
      .catch(() => {})
    return operation
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise
    this.#closed = true
    this.#closePromise = (async () => {
      await Promise.allSettled([...this.#pendingBinds])
      const results = await Promise.allSettled(
        [...this.#scopes].map(async (scope) => await scope.close()),
      )
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      )
      if (failure !== undefined) throw failure.reason
    })()
    return this.#closePromise
  }

  async #bindScope(
    request: BindExecutionScopeRequest,
    policy: ExecutionPolicySnapshot,
    binding: ExecutionEnvironmentBinding,
  ): Promise<ExecutionScope> {
    try {
      const roots = await canonicalRoots(request.fileSystemRoots)
      const delegate = this.#options.nativeEnvironmentFactory({
        environmentId: `${request.scopeId}.native`,
        providerRevision: "1",
        strategy: {
          kind: "supervised",
          childSupervisor: new MacosSeatbeltChildSupervisor({
            delegate: this.#options.childSupervisor,
            policy,
            roots,
          }),
        },
        ...(this.#options.launchEnvironmentOverrides === undefined
          ? {}
          : { launchEnvironmentOverrides: this.#options.launchEnvironmentOverrides }),
        managedProcess: true,
        ...nativeProcessOptions(this.#options),
      })
      const scope = await delegate.bind({
        ...request,
        policy: internalNativePolicy(policy),
        fileSystemRoots: roots,
      })
      let wrapped!: MacosSeatbeltExecutionScope
      wrapped = new MacosSeatbeltExecutionScope({
        binding,
        delegate,
        scope,
        onClose: () => {
          this.#scopes.delete(wrapped)
          this.#scopeIds.delete(request.scopeId)
        },
      })
      if (this.#closed) {
        await wrapped.close()
        throw new ExecutionEnvironmentClosedError()
      }
      this.#scopes.add(wrapped)
      return wrapped
    } catch (error) {
      this.#scopeIds.delete(request.scopeId)
      throw error
    }
  }

  #assertAvailable(): void {
    try {
      accessSync(SEATBELT_EXECUTABLE, constants.X_OK)
    } catch {
      throw new UnsupportedExecutionCapabilityError("macos.seatbelt")
    }
  }
}

class MacosSeatbeltExecutionScope implements ExecutionScope {
  readonly binding: ExecutionEnvironmentBinding
  readonly fileSystem: ExecutionScope["fileSystem"]
  readonly process: ExecutionScope["process"]
  readonly terminal?: NonNullable<ExecutionScope["terminal"]>
  readonly #delegate: ExecutionEnvironment
  readonly #scope: ExecutionScope
  readonly #onClose: () => void
  #closePromise: Promise<void> | undefined

  constructor(options: {
    readonly binding: ExecutionEnvironmentBinding
    readonly delegate: ExecutionEnvironment
    readonly scope: ExecutionScope
    readonly onClose: () => void
  }) {
    this.binding = options.binding
    this.fileSystem = options.scope.fileSystem
    this.process = options.scope.process
    if (options.scope.terminal !== undefined) {
      this.terminal = options.scope.terminal
    }
    this.#delegate = options.delegate
    this.#scope = options.scope
    this.#onClose = options.onClose
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise
    this.#closePromise = (async () => {
      try {
        await this.#scope.close()
        await this.#delegate.close()
      } finally {
        this.#onClose()
      }
    })()
    return this.#closePromise
  }
}

function internalNativePolicy(
  policy: ExecutionPolicySnapshot,
): ExecutionPolicySnapshot {
  return normalizeExecutionPolicy({
    ...policy,
    isolation: "none",
    network: "unrestricted",
    pty: policy.pty,
  })
}

async function canonicalRoots(
  roots: BindExecutionScopeRequest["fileSystemRoots"],
): Promise<readonly { readonly id: string; readonly path: string }[]> {
  return await Promise.all(
    roots.map(async (root) => {
      if (!isAbsolute(root.path) || root.path.includes("\0")) {
        throw new Error(`execution filesystem root must be absolute: ${root.id}`)
      }
      return { id: root.id, path: await realpath(resolve(root.path)) }
    }),
  )
}

function requireOpaqueId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error(`execution ${label} is invalid`)
  }
}

function nativeProcessOptions(
  options: MacosSeatbeltExecutionEnvironmentOptions,
): Pick<NativeExecutionEnvironmentOptions, "defaultOutputLimitBytes" | "maxOutputLimitBytes" | "maxStdinBytes" | "terminationGraceMs" | "cleanupTimeoutMs"> {
  return {
    ...(options.defaultOutputLimitBytes === undefined
      ? {}
      : { defaultOutputLimitBytes: options.defaultOutputLimitBytes }),
    ...(options.maxOutputLimitBytes === undefined
      ? {}
      : { maxOutputLimitBytes: options.maxOutputLimitBytes }),
    ...(options.maxStdinBytes === undefined
      ? {}
      : { maxStdinBytes: options.maxStdinBytes }),
    ...(options.terminationGraceMs === undefined
      ? {}
      : { terminationGraceMs: options.terminationGraceMs }),
    ...(options.cleanupTimeoutMs === undefined
      ? {}
      : { cleanupTimeoutMs: options.cleanupTimeoutMs }),
  }
}
