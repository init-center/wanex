import type {
  ChildManagedProcess,
  ChildInteractiveTerminalProcess,
  ChildProcessRun,
  ChildSupervisor,
  ChildSupervisorStartRequest
} from "../supervisor-types.js"
import {
  MACOS_SEATBELT_EXECUTABLE,
  pathDirectoriesFromEnvironment,
  projectMacosSeatbeltProfile,
  type MacosSeatbeltProfileRoot
} from "./profile.js"
import type { ExecutionPolicySnapshot } from "@wanex/protocol"

export interface MacosSeatbeltChildSupervisorOptions {
  readonly delegate: ChildSupervisor
  readonly policy: ExecutionPolicySnapshot
  readonly roots: readonly MacosSeatbeltProfileRoot[]
}

/**
 * Decorates the existing supervised child protocol with a per-request
 * Seatbelt launcher. The delegate still owns the helper process, streams, and
 * cleanup evidence; this class only changes the command being supervised.
 */
export class MacosSeatbeltChildSupervisor implements ChildSupervisor {
  readonly #delegate: ChildSupervisor
  readonly #startManaged: NonNullable<ChildSupervisor["startManaged"]>
  readonly #policy: ExecutionPolicySnapshot
  readonly #roots: readonly MacosSeatbeltProfileRoot[]

  constructor(options: MacosSeatbeltChildSupervisorOptions) {
    if (options.delegate.startManaged === undefined) {
      throw new Error("macOS Seatbelt requires a managed child supervisor")
    }
    this.#delegate = options.delegate
    this.#startManaged = options.delegate.startManaged.bind(options.delegate)
    this.#policy = options.policy
    this.#roots = Object.freeze(options.roots.map((root) => Object.freeze({ ...root })))
  }

  async start(request: ChildSupervisorStartRequest): Promise<ChildProcessRun> {
    return await this.#delegate.start(this.#wrap(request))
  }

  async startManaged(
    request: ChildSupervisorStartRequest,
  ): Promise<ChildManagedProcess> {
    return await this.#startManaged(this.#wrap(request))
  }

  async startTerminal(
    request: ChildSupervisorStartRequest,
  ): Promise<ChildInteractiveTerminalProcess> {
    const startTerminal = this.#delegate.startTerminal
    if (startTerminal === undefined) {
      throw new Error("macOS Seatbelt terminal supervisor is unavailable")
    }
    return await startTerminal.call(this.#delegate, this.#wrap(request))
  }

  #wrap(request: ChildSupervisorStartRequest): ChildSupervisorStartRequest {
    const projection = projectMacosSeatbeltProfile({
      policy: this.#policy,
      roots: this.#roots,
      cwd: request.cwd,
      program: request.program,
      args: request.args,
      pathDirectories: pathDirectoriesFromEnvironment(
        request.environment.PATH,
        request.cwd,
      ),
    })
    return {
      ...request,
      environment: {
        ...request.environment,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      program: MACOS_SEATBELT_EXECUTABLE,
      args: projection.command,
    }
  }
}
