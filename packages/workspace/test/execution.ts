import {
  NativeExecutionEnvironment,
  type ChildSupervisor,
  type ExecutionEnvironment,
  type ExecutionProcess,
  type ExecutionScope
} from "@wanex/runtime/execution"

const environments = new Set<ExecutionEnvironment>()
let sequence = 0

export async function createWorkspaceTestExecution(options: {
  readonly rootDir: string
  readonly additionalRootDirs?: readonly string[]
  readonly childSupervisor?: ChildSupervisor
  readonly managedProcess?: boolean
}): Promise<{
  readonly environment: ExecutionEnvironment
  readonly scope: ExecutionScope
  readonly process: ExecutionProcess
}> {
  sequence += 1
  const environment = new NativeExecutionEnvironment({
    environmentId: `native_workspace_test_${sequence}`,
    managedProcess: options.managedProcess === true,
    strategy: options.childSupervisor === undefined
      ? { kind: "direct" }
      : { kind: "supervised", childSupervisor: options.childSupervisor }
  })
  environments.add(environment)
  try {
    const rootDirs = [options.rootDir, ...(options.additionalRootDirs ?? [])]
    const roots = rootDirs.map((_, index) => ({
      id: `workspace_${index}`,
      effects: ["read", "write", "create", "remove"] as const
    }))
    const scope = await environment.bind({
      scopeId: `workspace_test_${sequence}`,
      policy: {
        revision: 1,
        filesystem: {
          roots,
          maxReadBytes: 50 * 1024 * 1024,
          maxDirectoryEntries: 100_000
        },
        process: {
          oneShot: true,
          managed: options.managedProcess === true,
          cleanup: options.childSupervisor === undefined
            ? "runtime_process_tree"
            : "durable_supervisor",
          environmentVariables: []
        },
        network: "unrestricted",
        isolation: "none",
        pty: false
      },
      fileSystemRoots: rootDirs.map((path, index) => ({
        id: `workspace_${index}`,
        path
      }))
    })
    return { environment, scope, process: scope.process }
  } catch (error) {
    environments.delete(environment)
    await environment.close().catch(() => {})
    throw error
  }
}

export async function disposeWorkspaceTestExecution(): Promise<void> {
  const current = [...environments]
  environments.clear()
  const results = await Promise.allSettled(
    current.map(async (environment) => await environment.close())
  )
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )
  if (failure !== undefined) throw failure.reason
}
