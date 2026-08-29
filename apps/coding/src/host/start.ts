import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  bootstrapWanexStorage,
  resolveSystemServiceBinary,
} from "@wanex/runtime/bootstrap";
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ExecutionEnvironment,
  type ExecutionScope,
} from "@wanex/runtime/execution";
import { createWorkspaceStore } from "@wanex/storage/workspace";
import { CodingHostError } from "./errors.js";
import type { CodingHostTurnObserver } from "./events.js";
import { resolveCodingExecutionEnvironmentId } from "./execution/environment.js";
import { CodingTurnRuntime } from "./execution/runtime.js";
import { composeCodingRepository } from "./repository/composition.js";
import { normalizeCodingRepositoryContextPolicy } from "./repository/context.js";
import { codingRepositoryIdentity } from "./repository/identity.js";
import {
  areOverlappingPaths,
  assertAbsoluteRepositoryPath,
  resolveTrustedRepositoryRoot,
} from "./repository/validate.js";
import type {
  CodingHost,
  CodingHostState,
  CodingRepository,
  OpenCodingRepositoryRequest,
  CodingApplicationHostOptions,
} from "./types.js";

const DEFAULT_PRINCIPAL_ID = "coding-agent";

export async function createCodingHost(
  options: CodingApplicationHostOptions,
  observeTurn?: CodingHostTurnObserver,
): Promise<CodingHost> {
  const context = normalizeCodingRepositoryContextPolicy(options.context);
  const dataDir = await prepareDataDirectory(options.dataDir);
  const bootstrapped = await bootstrapWanexStorage({
    storage: options.storage,
    ...(options.artifacts === undefined
      ? {}
      : { artifacts: options.artifacts }),
  });
  let executionEnvironment: ExecutionEnvironment | undefined;
  try {
    const systemService =
      bootstrapped.artifacts.systemService ??
      (await resolveSystemServiceBinary(options.artifacts));
    const storage = Object.assign(
      {},
      bootstrapped.storage,
      createWorkspaceStore(bootstrapped.transport),
    );
    const environmentId =
      options.executionEnvironmentId ??
      await resolveCodingExecutionEnvironmentId(storage);
    executionEnvironment = (
      options.executionEnvironmentFactory ?? nativeExecutionEnvironmentFactory
    )({
      environmentId,
      serviceBin: systemService.path,
    });
    const execution =
      options.execution === undefined
        ? undefined
        : new CodingTurnRuntime({
            storage,
            serviceBin: systemService.path,
            execution: options.execution,
            ...(observeTurn === undefined ? {} : { observeTurn }),
          });
    return new CodingHostController({
      dataDir,
      serviceBin: systemService.path,
      storage,
      disposeStorage: () => bootstrapped.dispose(),
      executionEnvironment,
      ...(execution === undefined ? {} : { execution }),
      ...(options.execution?.baseAgentContext === undefined
        ? {}
        : { baseAgentContext: options.execution.baseAgentContext }),
      ownerId: options.ownerId ?? `coding-${randomUUID().replaceAll("-", "")}`,
      principalId: options.principalId ?? DEFAULT_PRINCIPAL_ID,
      ...(options.gitBin === undefined ? {} : { gitBin: options.gitBin }),
      ...(options.gitTimeoutMs === undefined
        ? {}
        : { gitTimeoutMs: options.gitTimeoutMs }),
      ...(options.recovery === undefined ? {} : { recovery: options.recovery }),
      ...(context === undefined ? {} : { context }),
    });
  } catch (error) {
    await executionEnvironment?.close().catch(() => {});
    await bootstrapped.dispose().catch(() => {});
    throw error;
  }
}

function nativeExecutionEnvironmentFactory(request: {
  readonly environmentId: string;
  readonly serviceBin: string;
}): ExecutionEnvironment {
  return new NativeExecutionEnvironment({
    environmentId: request.environmentId,
    managedProcess: true,
    strategy: {
      kind: "supervised",
      childSupervisor: new NativeChildSupervisor({
        serviceBin: request.serviceBin,
      }),
    },
  });
}

interface CodingHostControllerOptions {
  readonly dataDir: string;
  readonly serviceBin: string;
  readonly storage: Parameters<typeof composeCodingRepository>[0]["storage"];
  readonly disposeStorage: () => Promise<void>;
  readonly executionEnvironment: ExecutionEnvironment;
  readonly ownerId: Parameters<typeof composeCodingRepository>[0]["ownerId"];
  readonly principalId: Parameters<
    typeof composeCodingRepository
  >[0]["principalId"];
  readonly gitBin?: string;
  readonly gitTimeoutMs?: number;
  readonly recovery?: Parameters<typeof composeCodingRepository>[0]["recovery"];
  readonly context?: Parameters<typeof composeCodingRepository>[0]["context"];
  readonly baseAgentContext?: Parameters<
    typeof composeCodingRepository
  >[0]["baseAgentContext"];
  readonly execution?: CodingTurnRuntime;
}

class CodingHostController implements CodingHost {
  #currentState: CodingHostState = "open";
  readonly #repositories = new Map<string, CodingRepository>();
  #admission: Promise<void> = Promise.resolve();
  #closePromise: Promise<void> | undefined;
  readonly #options: CodingHostControllerOptions;

  constructor(options: CodingHostControllerOptions) {
    this.#options = options;
  }

  get state(): CodingHostState {
    return this.#currentState;
  }

  async openRepository(
    request: OpenCodingRepositoryRequest,
  ): Promise<CodingRepository> {
    this.assertOpen();
    return await this.exclusive(async () => {
      this.assertOpen();
      assertAbsoluteRepositoryPath(request.repositoryPath);
      const admissionScope = await this.#options.executionEnvironment.bind({
        scopeId: `coding_repository_admission_${randomUUID().replaceAll("-", "")}`,
        policy: codingRepositoryAdmissionPolicy(
          "selected",
          this.#options.executionEnvironment.capabilities.isolation.enforcement,
        ),
        fileSystemRoots: [{ id: "selected", path: request.repositoryPath }],
      });
      let repositoryRoot: string;
      try {
        repositoryRoot = await resolveTrustedRepositoryRoot({
          repositoryPath: request.repositoryPath,
          executionProcess: admissionScope.process,
          ...(this.#options.gitBin === undefined
            ? {}
            : { gitBin: this.#options.gitBin }),
          ...(this.#options.gitTimeoutMs === undefined
            ? {}
            : { gitTimeoutMs: this.#options.gitTimeoutMs }),
        });
      } finally {
        await admissionScope.close();
      }
      if (areOverlappingPaths(repositoryRoot, this.#options.dataDir)) {
        throw new CodingHostError(
          "repository_data_overlap",
          "coding host data must be outside the repository",
        );
      }
      const identity = codingRepositoryIdentity(repositoryRoot);
      const current = this.#repositories.get(identity.repositoryId);
      if (current !== undefined && current.state === "open") return current;

      let repository: CodingRepository;
      const repositoryScope = await this.#options.executionEnvironment.bind({
        scopeId: `coding_repository_${identity.directoryName}`,
        policy: codingRepositoryPolicy(
          this.#options.executionEnvironment.capabilities.isolation.enforcement,
        ),
        fileSystemRoots: [
          { id: "repository", path: repositoryRoot },
          { id: "data", path: this.#options.dataDir },
        ],
      });
      try {
        repository = await composeCodingRepository({
          identity,
          dataDir: this.#options.dataDir,
          repositoryRoot,
          worktreeParent: join(
            this.#options.dataDir,
            "repositories",
            identity.directoryName,
            "worktrees",
          ),
          serviceBin: this.#options.serviceBin,
          storage: this.#options.storage,
          executionEnvironment: this.#options.executionEnvironment,
          executionScope: repositoryScope,
          ownerId: this.#options.ownerId,
          principalId: this.#options.principalId,
          ...(this.#options.gitBin === undefined
            ? {}
            : { gitBin: this.#options.gitBin }),
          ...(this.#options.gitTimeoutMs === undefined
            ? {}
            : { gitTimeoutMs: this.#options.gitTimeoutMs }),
          ...(this.#options.recovery === undefined
            ? {}
            : { recovery: this.#options.recovery }),
          ...(this.#options.context === undefined
            ? {}
            : { context: this.#options.context }),
          ...(this.#options.baseAgentContext === undefined
            ? {}
            : { baseAgentContext: this.#options.baseAgentContext }),
          ...(this.#options.execution === undefined
            ? {}
            : { execution: this.#options.execution }),
          onClose: () => {
            if (this.#repositories.get(identity.repositoryId) === repository) {
              this.#repositories.delete(identity.repositoryId);
            }
          },
        });
      } catch (error) {
        await repositoryScope.close().catch(() => {});
        throw error;
      }
      this.#repositories.set(identity.repositoryId, repository);
      return repository;
    });
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#currentState = "closing";
    this.#closePromise = this.exclusive(async () => {
      let firstError: unknown;
      for (const repository of [...this.#repositories.values()]) {
        try {
          await repository.close();
        } catch (error) {
          firstError ??= error;
        }
      }
      this.#repositories.clear();
      try {
        await this.#options.execution?.dispose();
      } catch (error) {
        firstError ??= error;
      }
      try {
        await this.#options.executionEnvironment.close();
      } catch (error) {
        firstError ??= error;
      }
      try {
        await this.#options.disposeStorage();
      } catch (error) {
        firstError ??= error;
      } finally {
        this.#currentState = "closed";
      }
      if (firstError !== undefined) throw firstError;
    });
    return this.#closePromise;
  }

  private assertOpen(): void {
    if (this.#currentState !== "open") {
      throw new CodingHostError("host_closed", "coding host is closed");
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#admission;
    let release!: () => void;
    this.#admission = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function codingRepositoryAdmissionPolicy(
  rootId: string,
  isolation: import("@wanex/runtime/execution").ExecutionPolicySnapshot["isolation"],
): import("@wanex/runtime/execution").ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: rootId, effects: ["read"] }],
      maxReadBytes: 50 * 1024 * 1024,
      maxDirectoryEntries: 100_000,
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "durable_supervisor",
      environmentVariables: [],
    },
    network: "unrestricted",
    isolation,
    pty: false,
  };
}

function codingRepositoryPolicy(
  isolation: import("@wanex/runtime/execution").ExecutionPolicySnapshot["isolation"],
): import("@wanex/runtime/execution").ExecutionPolicySnapshot {
  const base = codingRepositoryAdmissionPolicy("repository", isolation);
  return {
    ...base,
    process: {
      ...base.process,
      managed: true,
    },
    filesystem: {
      ...base.filesystem,
      roots: [
        { id: "repository", effects: ["read", "write", "create", "remove"] },
        { id: "data", effects: ["read", "write", "create", "remove"] },
      ],
    },
  };
}

async function prepareDataDirectory(input: string): Promise<string> {
  if (!isAbsolute(input)) {
    throw new CodingHostError(
      "invalid_data_directory",
      "coding host data directory must be absolute",
    );
  }
  try {
    await mkdir(input, { recursive: true });
    return await realpath(input);
  } catch (error) {
    throw new CodingHostError(
      "invalid_data_directory",
      "coding host data directory is unavailable",
      error,
    );
  }
}
