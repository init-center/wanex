import { dirname } from "node:path"
import { execPath } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import {
  NativeExecutionEnvironment,
  type BindExecutionScopeRequest,
  type ExecutionEnvironment,
  type ExecutionEnvironmentBinding,
  type ExecutionPolicySnapshot,
  type ExecutionRequest,
  type ExecutionScope
} from "@wanex/runtime/execution"
import { executeSubprocessPluginAction } from "../src/subprocess-execute.js"
import {
  WANEX_PLUGIN_HOST_PROTOCOL,
  type PluginHostExecuteMessage,
  type SubprocessPluginActionDescriptor
} from "../src/types.js"

const pluginHostFixture = new URL(
  "./fixtures/plugin-host-fixture.mjs",
  import.meta.url
).pathname
const environments = new Set<TrackingExecutionEnvironment>()

afterEach(async () => {
  await Promise.allSettled(
    [...environments].map(async (environment) => await environment.close())
  )
  environments.clear()
})

describe("plugin subprocess execution policy", () => {
  it("rejects unenforceable network constraints before binding", async () => {
    const environment = trackingEnvironment()

    await expect(
      execute(environment, {
        permissions: { networks: ["api.example.test"] }
      })
    ).rejects.toThrow(/network destination constraints are not enforceable/)

    expect(environment.bindCalls).toBe(0)
    expect(environment.processCalls).toBe(0)
  })

  it("rejects unenforceable filesystem constraints before binding", async () => {
    const environment = trackingEnvironment()

    await expect(
      execute(environment, {
        permissions: { fileSystemPaths: ["/tmp/plugin-output"] }
      })
    ).rejects.toThrow(/filesystem path constraints are not enforceable/)

    expect(environment.bindCalls).toBe(0)
    expect(environment.processCalls).toBe(0)
  })

  it("narrows the host timeout with the action permission", async () => {
    const environment = trackingEnvironment()

    await expect(
      execute(
        environment,
        { permissions: { maxExecutionMs: 50 } },
        "sleep",
        1_000
      )
    ).rejects.toThrow(/timed out after 50ms/)

    expect(environment.requests).toHaveLength(1)
    expect(environment.requests[0]?.timeoutMs).toBe(50)
    expect(environment.closedScopes).toBe(1)
  })

  it("does not bypass an execution environment bind failure", async () => {
    const environment = trackingEnvironment({ failBind: true })

    await expect(execute(environment)).rejects.toThrow(/planned bind failure/)

    expect(environment.bindCalls).toBe(1)
    expect(environment.processCalls).toBe(0)
    expect(environment.closedScopes).toBe(0)
  })

  it("closes every action scope and does not project ambient credentials", async () => {
    const previous = process.env.WANEX_PLUGIN_AMBIENT_CREDENTIAL
    process.env.WANEX_PLUGIN_AMBIENT_CREDENTIAL = "must-not-reach-plugin"
    try {
      const environment = trackingEnvironment()

      const first = await execute(environment)
      const second = await execute(environment)

      expect(first).toMatchObject({
        type: "result",
        result: { ambientCredential: null }
      })
      expect(second).toMatchObject({
        type: "result",
        result: { ambientCredential: null }
      })
      expect(environment.bindCalls).toBe(2)
      expect(environment.processCalls).toBe(2)
      expect(environment.closedScopes).toBe(2)
    } finally {
      if (previous === undefined) {
        delete process.env.WANEX_PLUGIN_AMBIENT_CREDENTIAL
      } else {
        process.env.WANEX_PLUGIN_AMBIENT_CREDENTIAL = previous
      }
    }
  })
})

async function execute(
  environment: ExecutionEnvironment,
  descriptorOverrides: Partial<SubprocessPluginActionDescriptor> = {},
  mode = "success",
  timeoutMs = 1_000
) {
  const descriptor: SubprocessPluginActionDescriptor = {
    pluginId: "connector.test",
    version: "1.0.0",
    actionId: "deliver-message",
    capability: "channel.deliver",
    ...descriptorOverrides
  }
  return await executeSubprocessPluginAction(
    {
      descriptors: [descriptor],
      command: execPath,
      args: [pluginHostFixture, mode],
      cwd: dirname(execPath),
      executionEnvironment: environment,
      timeoutMs
    },
    descriptor,
    message,
    new AbortController().signal
  )
}

const message: PluginHostExecuteMessage = {
  protocol: WANEX_PLUGIN_HOST_PROTOCOL,
  type: "execute",
  request: {
    jobId: "job_plugin_execution_policy",
    pluginId: "connector.test",
    pluginVersion: "1.0.0",
    actionId: "deliver-message",
    capability: "channel.deliver",
    payload: {}
  }
}

function trackingEnvironment(
  options: { readonly failBind?: boolean } = {}
): TrackingExecutionEnvironment {
  const environment = new TrackingExecutionEnvironment(
    new NativeExecutionEnvironment({
      environmentId: `native_plugin_policy_test_${environments.size + 1}`,
      strategy: { kind: "direct" }
    }),
    options
  )
  environments.add(environment)
  return environment
}

class TrackingExecutionEnvironment implements ExecutionEnvironment {
  readonly descriptor
  readonly capabilities
  readonly requests: ExecutionRequest[] = []
  bindCalls = 0
  processCalls = 0
  closedScopes = 0

  constructor(
    private readonly delegate: ExecutionEnvironment,
    private readonly options: { readonly failBind?: boolean }
  ) {
    this.descriptor = delegate.descriptor
    this.capabilities = delegate.capabilities
  }

  resolveBinding(request: {
    readonly policy: ExecutionPolicySnapshot
  }): ExecutionEnvironmentBinding {
    return this.delegate.resolveBinding(request)
  }

  async bind(request: BindExecutionScopeRequest): Promise<ExecutionScope> {
    this.bindCalls += 1
    if (this.options.failBind === true) {
      throw new Error("planned bind failure")
    }
    const scope = await this.delegate.bind(request)
    let closed = false
    return {
      binding: scope.binding,
      fileSystem: scope.fileSystem,
      process: {
        execute: async (executionRequest) => {
          this.processCalls += 1
          this.requests.push(executionRequest)
          return await scope.process.execute(executionRequest)
        },
        start: async (executionRequest) =>
          await scope.process.start(executionRequest)
      },
      close: async () => {
        if (!closed) {
          closed = true
          this.closedScopes += 1
        }
        await scope.close()
      }
    }
  }

  async close(): Promise<void> {
    await this.delegate.close()
  }
}
