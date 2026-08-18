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
import {
  createStorageTestStore,
  createTestTurnExecutionBinding,
  type StorageTestStore
} from "@wanex/storage/testing"
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
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
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

  it("binds workspace roots, limits, identities, and program policy deterministically", async () => {
    const environment = await createEnvironment()
    const host = new RecordingExecutionHost()
    const first = workspaceEvidenceRegistry({
      rootDir: environment.rootDir,
      runtime: environment.runtime,
      host,
      programs: { node: process.execPath }
    })
    const same = workspaceEvidenceRegistry({
      rootDir: environment.rootDir,
      runtime: environment.runtime,
      host,
      programs: { node: process.execPath }
    })
    expect(same.snapshot()).toEqual(first.snapshot())

    const changedRoot = workspaceEvidenceRegistry({
      rootDir: join(environment.rootDir, "other"),
      runtime: environment.runtime,
      host,
      programs: { node: process.execPath }
    })
    expect(toolBinding(changedRoot, "workspace_read_text")).not.toEqual(
      toolBinding(first, "workspace_read_text")
    )
    expect(toolBinding(changedRoot, "workspace_exec")).not.toEqual(
      toolBinding(first, "workspace_exec")
    )

    const changedProgramPolicy = workspaceEvidenceRegistry({
      rootDir: environment.rootDir,
      runtime: environment.runtime,
      host,
      programs: { nodejs: process.execPath }
    })
    expect(toolBinding(changedProgramPolicy, "workspace_exec")).not.toEqual(
      toolBinding(first, "workspace_exec")
    )

    const changedRuntime = new WorkspaceRuntime({
      storage: environment.client,
      rootDir: environment.rootDir,
      workspaceId: "workspace_tools_other"
    })
    const changedWorkspace = workspaceEvidenceRegistry({
      rootDir: environment.rootDir,
      runtime: changedRuntime,
      host,
      programs: { node: process.execPath }
    })
    expect(toolBinding(changedWorkspace, "workspace_apply_changeset")).not.toEqual(
      toolBinding(first, "workspace_apply_changeset")
    )
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
      result: {
        isError: true,
        content: [{ value: { error: "program_not_allowed" } }]
      }
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
      result: {
        isError: true,
        content: [{ value: { error: "tool_exception" } }]
      }
    })
    expect(host.calls).toBe(0)
    const escaped = (await environment.client.listToolExecutions({})).find(
      (execution) => execution.toolCallId === "call_exec_cwd_escape"
    )
    expect(escaped).toMatchObject({
      state: "failed",
      activity: {
        call: { summary: "Run node" },
        result: {
          summary: "node failed",
          details: [
            { label: "Program", value: "node" },
            { label: "Directory", value: "../outside" }
          ]
        }
      }
    })
    expect(JSON.stringify(escaped?.activity)).not.toContain("escapes workspace")
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
        content: [{ value: {
          path: "notes.txt",
          text: "abcdef",
          totalBytes: 10,
          retainedBytes: 6,
          truncated: true,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        } }]
      }
    })
    await expect(environment.client.listToolExecutions({})).resolves.toMatchObject([
      { state: "succeeded", content: [{ value: { path: "notes.txt", truncated: true } }] }
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
      result: { isError: false, content: [{ value: { status: "applied" } }] }
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
        content: [{ value: {
          program: "node",
          cwd: ".",
          exitCode: 0,
          termination: "exited",
          stdout: { text: "controlled", truncated: false }
        } }]
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
    idempotencyKey: `tool:${options.identity.sourceMessageId}:${options.toolCallId}`,
    permissionPolicy: options.permissionPolicy
  }
}

function workspaceEvidenceRegistry(options: {
  readonly rootDir: string
  readonly runtime: WorkspaceRuntime
  readonly host: ExecutionHost
  readonly programs: Readonly<Record<string, string>>
}): ToolRegistry {
  const registry = new ToolRegistry()
  registerWorkspaceCodingTools(registry, {
    rootDir: options.rootDir,
    runtime: options.runtime,
    executionHost: options.host,
    programPolicy: new ExactWorkspaceProgramPolicy(options.programs)
  })
  return registry
}

function toolBinding(registry: ToolRegistry, name: string) {
  const evidence = registry.snapshot().tools.find(
    (tool) => tool.descriptor.name === name
  )
  if (evidence === undefined) {
    throw new Error(`missing workspace tool evidence: ${name}`)
  }
  return evidence.runtimeBinding
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
  const submitted = await session.submitTurn({
    id: "inp_workspace_tools",
    turnId: "turn_workspace_tools",
    sessionId: created.id,
    principalId: "principal_workspace_tools",
    idempotencyKey: "workspace-tools:admission",
    content: [{ type: "text", id: "part_workspace_tools", text: "test tools" }],
    jobId: "job_workspace_tools",
    executionBinding: createTestTurnExecutionBinding()
  })
  const workerId = "worker_workspace_tools"
  const job = await session.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job === null || job.leaseToken === undefined) {
    throw new Error("workspace tools test turn job was not claimed")
  }
  const started = await session.startTurnAttempt({
    sessionId: created.id,
    turnId: submitted.turn.id,
    inputId: submitted.admission.inputId,
    jobId: submitted.job.id,
    workerId,
    leaseToken: job.leaseToken
  })
  const source = await session.appendMessage({
    sessionId: created.id,
    turnId: submitted.turn.id,
    attemptId: started.attempt.id,
    inputId: submitted.admission.inputId,
    jobId: submitted.job.id,
    workerId,
    leaseToken: job.leaseToken,
    idempotencyKey: "workspace-tools:source-message",
    role: "assistant",
    content: workspaceToolCalls()
  })
  if (source === null) {
    throw new Error("workspace tools source message was not appended")
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
      inputId: submitted.admission.inputId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      sourceMessageId: source.id,
      jobId: submitted.job.id,
      workerId,
      leaseToken: job.leaseToken
    }
  }
}

interface ToolIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly attemptId: string
  readonly sourceMessageId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
}

function workspaceToolCalls(): import("@wanex/protocol").ToolCallMessagePart[] {
  return [
    toolCall("call_exec_denied", "workspace_exec", {
      program: "node",
      args: ["--version"]
    }),
    toolCall("call_exec_program_denied", "workspace_exec", {
      program: "sh",
      args: ["-c", "echo unsafe"]
    }),
    toolCall("call_exec_cwd_escape", "workspace_exec", {
      program: "node",
      args: ["--version"],
      cwd: "../outside"
    }),
    toolCall("call_read", "workspace_read_text", { path: "notes.txt" }),
    toolCall("call_apply", "workspace_apply_changeset", {
      id: "cs_workspace_tool",
      changes: [{
        path: "app.ts",
        kind: "update",
        baseText: "before\n",
        targetText: "after\n"
      }]
    }),
    toolCall("call_exec_allowed", "workspace_exec", {
      program: "node",
      args: ["-e", "process.stdout.write('controlled')"]
    })
  ]
}

function toolCall(
  toolCallId: string,
  toolName: string,
  input: import("@wanex/protocol").JsonValue
): import("@wanex/protocol").ToolCallMessagePart {
  return {
    type: "tool_call",
    id: `source_${toolCallId}`,
    toolCallId,
    toolName,
    input
  }
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
