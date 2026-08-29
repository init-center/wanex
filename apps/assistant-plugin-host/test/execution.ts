import {
  NativeExecutionEnvironment,
  type ExecutionEnvironment
} from "@wanex/runtime/execution"
import { createTrustedSubprocessPluginActionHostFromInstall } from "@wanex/plugin"
import type { PluginActionHostFactory } from "../src/index.js"

const environments = new Set<ExecutionEnvironment>()
let sequence = 0

export function createPluginTestEnvironment(): ExecutionEnvironment {
  sequence += 1
  const environment = new NativeExecutionEnvironment({
    environmentId: `native_assistant_plugin_test_${sequence}`,
    strategy: { kind: "direct" }
  })
  environments.add(environment)
  return environment
}

export async function disposePluginTestEnvironments(): Promise<void> {
  const current = [...environments]
  environments.clear()
  await Promise.allSettled(
    current.map(async (environment) => await environment.close())
  )
}

export function trustedTestSubprocessHost(
  request: Parameters<PluginActionHostFactory>[0]
) {
  return createTrustedSubprocessPluginActionHostFromInstall({
    manifest: request.manifest,
    install: request.install,
    executionEnvironment: request.executionEnvironment
  })
}
