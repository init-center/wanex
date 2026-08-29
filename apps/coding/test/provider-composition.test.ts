import { afterEach, describe, expect, it } from "vitest"
import {
  MacosSeatbeltExecutionEnvironment,
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ExecutionEnvironment,
  type ExecutionEnvironmentBinding,
  type ExecutionScope
} from "@wanex/runtime/execution"
import { createCodingHost } from "../src/host/start.js"
import { CodingHostTestScope, serviceBin } from "./support.js"

let testScope: CodingHostTestScope

afterEach(async () => {
  await testScope.dispose()
})

describe("Coding execution provider composition", () => {
  it("creates and owns the provider selected by the trusted factory", async () => {
    testScope = new CodingHostTestScope()
    const environment = await testScope.createEnvironment()
    let selectedId: string | undefined
    let selectedServiceBin: string | undefined
    let selected: NativeExecutionEnvironment | undefined

    const host = await createCodingHost({
      dataDir: environment.dataDir,
      storage: {
        kind: "injected",
        handle: environment.storageHandle
      },
      artifacts: { explicitPath: serviceBin },
      executionEnvironmentFactory: ({ environmentId, serviceBin: resolved }) => {
        selectedId = environmentId
        selectedServiceBin = resolved
        selected = new NativeExecutionEnvironment({
          environmentId,
          managedProcess: true,
          strategy: {
            kind: "supervised",
            childSupervisor: new NativeChildSupervisor({ serviceBin: resolved })
          }
        })
        return selected
      }
    })

    expect(selectedId).toMatch(/^native_coding_[A-Za-z0-9]+$/u)
    expect(selectedServiceBin).toBe(serviceBin)
    if (selected === undefined) throw new Error("provider factory did not select an environment")
    await host.close()
    expect(() => selected!.resolveBinding({ policy: policy() })).toThrow(
      "execution environment is closed"
    )
  })

  it.runIf(process.platform === "darwin")(
    "aligns Coding admission policies with the selected OS provider",
    async () => {
      testScope = new CodingHostTestScope()
      const environment = await testScope.createEnvironment()
      const repositoryRoot = await testScope.createRepository()
      const selected = new MacosSeatbeltExecutionEnvironment({
        environmentId: "coding_seatbelt_policy",
        childSupervisor: new NativeChildSupervisor({ serviceBin }),
        nativeEnvironmentFactory: (options) => new NativeExecutionEnvironment(options)
      })
      const policies: Array<import("@wanex/runtime/execution").ExecutionPolicySnapshot> = []
      const observed = new RecordingEnvironment(selected, policies)

      const host = await createCodingHost({
        dataDir: environment.dataDir,
        storage: {
          kind: "injected",
          handle: environment.storageHandle
        },
        artifacts: { explicitPath: serviceBin },
        executionEnvironmentFactory: () => observed
      })
      try {
        await host.openRepository({ repositoryPath: repositoryRoot })
        expect(policies.length).toBe(2)
        expect(policies.every((policy) => policy.isolation === "os")).toBe(true)
      } finally {
        await host.close()
      }
    },
  )
})

class RecordingEnvironment implements ExecutionEnvironment {
  readonly descriptor
  readonly capabilities

  constructor(
    private readonly delegate: ExecutionEnvironment,
    private readonly policies: Array<import("@wanex/runtime/execution").ExecutionPolicySnapshot>,
  ) {
    this.descriptor = delegate.descriptor
    this.capabilities = delegate.capabilities
  }

  resolveBinding(request: {
    readonly policy: import("@wanex/runtime/execution").ExecutionPolicySnapshot
  }): ExecutionEnvironmentBinding {
    this.policies.push(request.policy)
    return this.delegate.resolveBinding(request)
  }

  async bind(request: Parameters<ExecutionEnvironment["bind"]>[0]): Promise<ExecutionScope> {
    this.policies.push(request.policy)
    return await this.delegate.bind(request)
  }

  async close(): Promise<void> {
    await this.delegate.close()
  }
}

function policy(): import("@wanex/runtime/execution").ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 100
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree",
      environmentVariables: []
    },
    network: "unrestricted",
    isolation: "none",
    pty: false
  }
}
