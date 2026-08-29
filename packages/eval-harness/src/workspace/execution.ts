import { NativeExecutionEnvironment } from "@wanex/runtime/execution"

export async function createWorkspaceExecution(
  environmentId: string,
  rootDir: string
): Promise<{
  readonly environment: NativeExecutionEnvironment
  readonly scope: import("@wanex/runtime/execution").ExecutionScope
}> {
  const environment = new NativeExecutionEnvironment({
    environmentId,
    managedProcess: true,
    strategy: { kind: "direct" }
  })
  try {
    const scope = await environment.bind({
      scopeId: `${environmentId}_scope`,
      policy: {
        revision: 1,
        filesystem: {
          roots: [{
            id: "workspace",
            effects: ["read", "write", "create", "remove"]
          }],
          maxReadBytes: 50 * 1024 * 1024,
          maxDirectoryEntries: 100_000
        },
        process: {
          oneShot: true,
          managed: true,
          cleanup: "runtime_process_tree",
          environmentVariables: []
        },
        network: "unrestricted",
        isolation: "none",
        pty: false
      },
      fileSystemRoots: [{ id: "workspace", path: rootDir }]
    })
    return { environment, scope }
  } catch (error) {
    await environment.close().catch(() => {})
    throw error
  }
}
