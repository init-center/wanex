import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  NodeExecutionHost,
  type ExecutionHost,
  type ExecutionRequest,
  type ExecutionResult
} from "@wanex/runtime/execution"
import {
  AllowAllToolsPolicy,
  RiskBoundToolPolicy,
  ToolRegistry
} from "@wanex/runtime/tools"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WorkspaceRuntime } from "../src/index.js"
import {
  ExactWorkspaceProgramPolicy,
  WorkspaceApplyChangeSetTool,
  WorkspaceExecTool,
  WorkspaceReadTextTool,
  registerWorkspaceCodingTools
} from "../src/tools/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/tools", () => {
  it("registers the bounded coding tool set", async () => {
    const environment = await createEnvironment()
    const registry = new ToolRegistry()
    registerWorkspaceCodingTools(registry, {
      rootDir: environment.rootDir,
      runtime: environment.runtime,
      executionHost: new NodeExecutionHost(),
      programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath })
    })

    expect(registry.list().map((tool) => [tool.name, tool.risk])).toEqual([
      ["workspace_apply_changeset", "mutating"],
      ["workspace_exec", "external"],
      ["workspace_read_text", "read_only"]
    ])
  })

  it("records permission denial before calling the execution host", async () => {
    const environment = await createEnvironment()
    const host = new RecordingExecutionHost()
    const registry = new ToolRegistry()
    registry.register(new WorkspaceExecTool({
      rootDir: environment.rootDir,
      executionHost: host,
      programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath })
    }))

    const outcome = await registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_exec_denied",
      toolName: "workspace_exec",
      input: { program: "node", args: ["--version"] },
      permissionPolicy: new RiskBoundToolPolicy(["read_only"])
    }))

    expect(outcome).toMatchObject({ invoked: false, permission: { status: "deny" } })
    expect(host.calls).toBe(0)
    await expect(environment.client.listToolExecutions({})).resolves.toMatchObject([
      { toolName: "workspace_exec", state: "denied" }
    ])
  })

  it("rejects programs and escaped cwd before process execution", async () => {
    const environment = await createEnvironment()
    const host = new RecordingExecutionHost()
    const registry = new ToolRegistry()
    registry.register(new WorkspaceExecTool({
      rootDir: environment.rootDir,
      executionHost: host,
      programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath })
    }))

    await expect(registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_exec_program_denied",
      toolName: "workspace_exec",
      input: { program: "sh", args: ["-c", "echo unsafe"] },
      permissionPolicy: new AllowAllToolsPolicy()
    }))).resolves.toMatchObject({
      invoked: true,
      result: { isError: true, result: { error: "program_not_allowed" } }
    })
    await expect(registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_exec_cwd_escape",
      toolName: "workspace_exec",
      input: { program: "node", args: ["--version"], cwd: "../outside" },
      permissionPolicy: new AllowAllToolsPolicy()
    }))).resolves.toMatchObject({
      invoked: true,
      result: { isError: true, result: { error: "tool_exception" } }
    })
    expect(host.calls).toBe(0)
  })

  it("reads bounded text and records the durable tool result", async () => {
    const environment = await createEnvironment()
    await writeFile(join(environment.rootDir, "notes.txt"), "abcdefghij", "utf8")
    const registry = new ToolRegistry()
    registry.register(new WorkspaceReadTextTool({
      rootDir: environment.rootDir,
      maxFileBytes: 100,
      maxOutputBytes: 6
    }))

    const outcome = await registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_read",
      toolName: "workspace_read_text",
      input: { path: "notes.txt" },
      permissionPolicy: new AllowAllToolsPolicy()
    }))

    expect(outcome).toMatchObject({
      invoked: true,
      result: {
        isError: false,
        result: {
          path: "notes.txt",
          text: "abcdef",
          totalBytes: 10,
          retainedBytes: 6,
          truncated: true,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        }
      }
    })
    await expect(environment.client.listToolExecutions({})).resolves.toMatchObject([
      { state: "succeeded", result: { path: "notes.txt", truncated: true } }
    ])
  })

  it("applies through WorkspaceRuntime and remains undoable", async () => {
    const environment = await createEnvironment()
    await writeFile(join(environment.rootDir, "app.ts"), "before\n", "utf8")
    const registry = new ToolRegistry()
    registry.register(new WorkspaceApplyChangeSetTool({
      runtime: environment.runtime
    }))

    const outcome = await registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_apply",
      toolName: "workspace_apply_changeset",
      input: {
        id: "cs_workspace_tool",
        changes: [
          {
            path: "app.ts",
            kind: "update",
            baseText: "before\n",
            targetText: "after\n"
          }
        ]
      },
      permissionPolicy: new AllowAllToolsPolicy()
    }))

    expect(outcome).toMatchObject({
      result: { isError: false, result: { status: "applied" } }
    })
    expect(await readFile(join(environment.rootDir, "app.ts"), "utf8")).toBe(
      "after\n"
    )
    await environment.runtime.undoChangeSet({ changeSetId: "cs_workspace_tool" })
    expect(await readFile(join(environment.rootDir, "app.ts"), "utf8")).toBe(
      "before\n"
    )
  })

  it("runs an approved argv command with bounded JSON output", async () => {
    const environment = await createEnvironment()
    const registry = new ToolRegistry()
    registry.register(new WorkspaceExecTool({
      rootDir: environment.rootDir,
      executionHost: new NodeExecutionHost(),
      programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath }),
      outputBytes: 128
    }))

    const outcome = await registry.execute(executionRequest({
      storage: environment.client,
      identity: environment.identity,
      toolCallId: "call_exec_allowed",
      toolName: "workspace_exec",
      input: {
        program: "node",
        args: ["-e", "process.stdout.write('controlled')"]
      },
      permissionPolicy: new AllowAllToolsPolicy()
    }))

    expect(outcome).toMatchObject({
      invoked: true,
      result: {
        isError: false,
        result: {
          program: "node",
          cwd: ".",
          exitCode: 0,
          termination: "exited",
          stdout: { text: "controlled", truncated: false }
        }
      }
    })
  })
})

function executionRequest(options: {
  readonly storage: StorageTestStore
  readonly identity: ToolIdentity
  readonly toolCallId: string
  readonly toolName: string
  readonly input: import("@wanex/protocol").JsonValue
  readonly permissionPolicy: import("@wanex/runtime/tools").ToolPermissionPolicy
}) {
  return {
    ...options.identity,
    storage: options.storage,
    call: {
      type: "tool_call" as const,
      id: `part_${options.toolCallId}`,
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      input: options.input
    },
    idempotencyKey: `workspace-tools:${options.toolCallId}`,
    permissionPolicy: options.permissionPolicy
  }
}

async function createEnvironment(): Promise<{
  readonly rootDir: string
  readonly client: StorageTestStore
  readonly runtime: WorkspaceRuntime
  readonly identity: ToolIdentity
}> {
  const rootDir = await tempDir("wanex-workspace-tools-root-")
  const storeDir = await tempDir("wanex-workspace-tools-store-")
  const client = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(client)
  const session = new WanexSessionCore({ storage: client })
  const created = await session.create({
    id: "ses_workspace_tools",
    kind: "agent"
  })
  const admitted = await session.admit({
    id: "inp_workspace_tools",
    sessionId: created.id,
    principalId: "principal_workspace_tools",
    idempotencyKey: "workspace-tools:admission",
    content: [{ type: "text", id: "part_workspace_tools", text: "test tools" }]
  })
  const claim = await session.claimRunner({
    sessionId: created.id,
    runnerId: "runner_workspace_tools",
    leaseMs: 60_000
  })
  if (claim === null) {
    throw new Error("workspace tools test run was not claimed")
  }
  return {
    rootDir,
    client,
    runtime: new WorkspaceRuntime({
      storage: client,
      rootDir,
      workspaceId: "workspace_tools"
    }),
    identity: {
      principalId: "principal_workspace_tools",
      sessionId: created.id,
      inputId: admitted.inputId,
      runId: claim.runId
    }
  }
}

interface ToolIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly runId: string
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

class RecordingExecutionHost implements ExecutionHost {
  calls = 0

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.calls += 1
    return {
      program: request.program,
      args: request.args ?? [],
      cwd: request.cwd,
      pid: 1,
      exitCode: 0,
      signal: null,
      termination: "exited",
      cleanup: "not_required",
      durationMs: 1,
      stdout: output(),
      stderr: output()
    }
  }
}

function output(): ExecutionResult["stdout"] {
  return {
    bytes: new Uint8Array(),
    text: "",
    observedBytes: 0,
    retainedBytes: 0,
    truncated: false
  }
}
