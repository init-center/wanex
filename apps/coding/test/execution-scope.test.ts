import { afterEach, describe, expect, it } from "vitest"
import type { SessionTurnExecutionBinding } from "@wanex/protocol"
import {
  createApplicationScopeBinding,
  NativeExecutionEnvironment
} from "@wanex/runtime/execution"
import { AllowAllToolsPolicy, ToolRegistry } from "@wanex/runtime/tools"
import {
  CodingTurnScopeRegistry,
  codingApplicationScope,
  codingTurnOrigin,
  readCodingApplicationScope
} from "../src/host/execution/scope.js"

const environments = new Set<NativeExecutionEnvironment>()

afterEach(async () => {
  const current = [...environments]
  environments.clear()
  await Promise.all(current.map(async (environment) => await environment.close()))
})

describe("Coding Turn execution scope", () => {
  it("requires the exact execution environment and application scope at dispatch", () => {
    const environment = nativeEnvironment("coding_scope_exact")
    const executionEnvironment = environment.resolveBinding({
      policy: executionPolicy()
    })
    const applicationScope = codingApplicationScope({
      repositoryId: "repo_scope_exact",
      workspaceId: "workspace_scope_exact",
      taskId: "wtsk_scope_exact"
    })
    const registry = new CodingTurnScopeRegistry()
    const reference = {
      sessionId: "ses_scope_exact",
      inputId: "inp_scope_exact",
      turnId: "turn_scope_exact"
    }
    const release = registry.register({
      ...reference,
      executionEnvironment,
      applicationScope,
      tools: new ToolRegistry(),
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })
    const base = {
      ...reference,
      origin: codingTurnOrigin(applicationScope, "0".repeat(64)),
      signal: new AbortController().signal
    }

    expect(registry.resolve(base)).toBeDefined()
    expect(registry.resolve({
      ...base,
      executionBinding: binding(executionEnvironment, applicationScope)
    })).toBeDefined()
    expect(() => registry.resolve({
      ...base,
      executionBinding: binding(undefined, applicationScope)
    })).toThrow("coding Turn execution environment binding is missing")
    expect(() => registry.resolve({
      ...base,
      executionBinding: binding(
        { ...executionEnvironment, providerRevision: "changed" },
        applicationScope
      )
    })).toThrow("coding Turn execution environment changed after admission")
    expect(() => registry.resolve({
      ...base,
      executionBinding: binding(
        executionEnvironment,
        codingApplicationScope({
          repositoryId: "repo_scope_exact",
          workspaceId: "workspace_scope_exact",
          taskId: "wtsk_scope_other"
        })
      )
    })).toThrow("coding Turn application scope binding changed after admission")
    expect(() => registry.resolve({
      ...base,
      executionBinding: binding(
        executionEnvironment,
        createApplicationScopeBinding({
          kind: "assistant.conversation",
          id: "wtsk_scope_exact",
          metadata: {}
        })
      )
    })).toThrow("coding Turn application scope binding is missing or foreign")

    release()
    expect(registry.size).toBe(0)
  })

  it("rejects malformed Coding metadata instead of inferring task identity", () => {
    const malformed = createApplicationScopeBinding({
      kind: "coding.workspace-task",
      id: "wtsk_scope_malformed",
      metadata: {
        repositoryId: "repo_scope_malformed",
        workspaceId: "workspace_scope_malformed",
        access: "writable",
        rootDir: "/must/not/be/durable"
      }
    })

    expect(() => readCodingApplicationScope(malformed)).toThrow(
      "coding application scope metadata is invalid"
    )
  })
})

function nativeEnvironment(environmentId: string): NativeExecutionEnvironment {
  const environment = new NativeExecutionEnvironment({
    environmentId,
    strategy: { kind: "direct" }
  })
  environments.add(environment)
  return environment
}

function executionPolicy(): import("@wanex/runtime/execution").ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 1_024
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

function binding(
  executionEnvironment: import("@wanex/protocol").ExecutionEnvironmentBinding | undefined,
  applicationScope: import("@wanex/protocol").ApplicationScopeBinding | undefined
): SessionTurnExecutionBinding {
  return {
    ...(executionEnvironment === undefined ? {} : { executionEnvironment }),
    ...(applicationScope === undefined ? {} : { applicationScope })
  } as SessionTurnExecutionBinding
}
