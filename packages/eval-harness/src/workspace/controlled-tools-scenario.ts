import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { JsonValue } from "@wanex/protocol"
import { NodeExecutionHost } from "@wanex/runtime/execution"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import {
  AllowAllToolsPolicy,
  RiskBoundToolPolicy,
  ToolRegistry,
  type ToolPermissionPolicy
} from "@wanex/runtime/tools"
import { WorkspaceRuntime } from "@wanex/workspace"
import {
  ExactWorkspaceProgramPolicy,
  registerWorkspaceCodingTools
} from "@wanex/workspace/tools"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

const principalId = "agent_eval_controlled_tools"

export const workspaceControlledToolsScenario = createEvalScenario({
  id: "workspace.controlled-tools",
  title: "Workspace coding tools execute, audit, undo, deny, and cancel safely",
  tags: ["workspace", "coding-agent", "execution", "security"],
  async run(context) {
    const session = new WanexSessionCore({ storage: context.storage })
    const created = await session.create({
      id: "ses_eval_controlled_tools",
      kind: "agent"
    })
    const admitted = await session.admit({
      id: "inp_eval_controlled_tools",
      sessionId: created.id,
      principalId,
      idempotencyKey: "eval-controlled-tools:admit",
      content: [{
        type: "text",
        id: "part_eval_controlled_tools",
        text: "Exercise controlled workspace tools"
      }]
    })
    const claim = await session.claimRunner({
      sessionId: created.id,
      runnerId: "runner_eval_controlled_tools",
      leaseMs: 60_000
    })
    assert(claim !== null, "controlled workspace tool run should be claimed")

    const workspace = new WorkspaceRuntime({
      storage: context.storage,
      rootDir: context.workspaceRootDir,
      workspaceId: "eval_controlled_tools",
      principalId
    })
    const registry = new ToolRegistry()
    registerWorkspaceCodingTools(registry, {
      rootDir: context.workspaceRootDir,
      runtime: workspace,
      executionHost: new NodeExecutionHost(),
      programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath })
    })
    const identity = {
      principalId,
      sessionId: created.id,
      inputId: admitted.inputId,
      runId: claim.runId
    }

    const approved = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_exec",
      toolName: "workspace_exec",
      input: {
        program: "node",
        args: ["-e", "process.stdout.write('wanex-controlled')"]
      },
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(approved.invoked, "approved command should invoke the execution host")
    assert(!approved.result.isError, "approved command should succeed")
    const approvedStdout = jsonString(
      jsonRecord(jsonRecord(approved.result.result).stdout).text
    )
    assert(
      approvedStdout === "wanex-controlled",
      "approved command should retain stdout"
    )

    const targetRelativePath = "phase753-controlled.txt"
    const targetPath = join(context.workspaceRootDir, targetRelativePath)
    await writeFile(targetPath, "before\n", "utf8")
    const applied = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_apply",
      toolName: "workspace_apply_changeset",
      input: {
        id: "cs_eval_controlled_tools",
        title: "Controlled tool edit",
        changes: [{
          path: targetRelativePath,
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }]
      },
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(!applied.result.isError, "changeset tool should apply")
    assert(
      await readFile(targetPath, "utf8") === "after\n",
      "changeset tool should update the file"
    )
    await workspace.undoChangeSet({ changeSetId: "cs_eval_controlled_tools" })
    assert(
      await readFile(targetPath, "utf8") === "before\n",
      "changeset tool output should remain undoable"
    )

    const permissionDenied = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_permission_denied",
      toolName: "workspace_exec",
      input: { program: "node", args: ["--version"] },
      permissionPolicy: new RiskBoundToolPolicy(["read_only"])
    })
    assert(!permissionDenied.invoked, "permission denial should prevent invocation")
    assert(
      permissionDenied.permission.status === "deny",
      "external command should fail the read-only risk policy"
    )

    const programDenied = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_program_denied",
      toolName: "workspace_exec",
      input: { program: "sh", args: ["-c", "echo unsafe"] },
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(programDenied.result.isError, "unapproved program should fail closed")
    assert(
      jsonRecord(programDenied.result.result).error === "program_not_allowed",
      "program allowlist should own executable selection"
    )

    const escaped = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_path_escape",
      toolName: "workspace_read_text",
      input: { path: "../outside.txt" },
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(escaped.result.isError, "path escape should fail closed")

    const cancellationChecked = process.platform !== "win32"
      ? await cancelProcessTree({
          registry,
          storage: context.storage,
          identity,
          workspaceRootDir: context.workspaceRootDir
        })
      : false

    const executions = (await context.storage.listToolExecutions({}))
      .filter((execution) => execution.runId === claim.runId)
    const states = Object.fromEntries(
      executions.map((execution) => [execution.toolCallId, execution.state])
    )
    assert(executions.length === (cancellationChecked ? 6 : 5),
      "each controlled tool decision should have one durable record")
    assert(states.call_eval_controlled_exec === "succeeded",
      "approved command should be durably succeeded")
    assert(states.call_eval_controlled_apply === "succeeded",
      "changeset apply should be durably succeeded")
    assert(states.call_eval_controlled_permission_denied === "denied",
      "permission denial should be durably denied")
    assert(states.call_eval_controlled_program_denied === "failed",
      "program denial should be durably failed")
    assert(states.call_eval_controlled_path_escape === "failed",
      "path escape should be durably failed")
    if (cancellationChecked) {
      assert(states.call_eval_controlled_cancel === "cancelled",
        "cancelled process should be durably cancelled after cleanup")
    }

    return {
      approvedStdout,
      undoRestored: true,
      cancellationChecked,
      durableStates: states
    }
  }
})

async function cancelProcessTree(options: {
  readonly registry: ToolRegistry
  readonly storage: Parameters<typeof executeTool>[0]["storage"]
  readonly identity: ToolIdentity
  readonly workspaceRootDir: string
}): Promise<true> {
  const pidFileName = "phase753-grandchild.pid"
  const pidFile = join(options.workspaceRootDir, pidFileName)
  const controller = new AbortController()
  const execution = executeTool({
    registry: options.registry,
    storage: options.storage,
    identity: options.identity,
    toolCallId: "call_eval_controlled_cancel",
    toolName: "workspace_exec",
    input: {
      program: "node",
      args: [
        "-e",
        "const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync('phase753-grandchild.pid',String(c.pid));setInterval(()=>{},1000)"
      ]
    },
    permissionPolicy: new AllowAllToolsPolicy(),
    signal: controller.signal
  })
  const grandchildPid = Number(await waitForTextFile(pidFile, 2_000))
  assert(Number.isInteger(grandchildPid), "grandchild pid should be recorded")
  controller.abort()
  let cancelled = false
  try {
    await execution
  } catch (error) {
    cancelled = error instanceof Error && error.message.includes("aborted")
  }
  assert(cancelled, "parent cancellation should reject the tool call")
  await assertProcessGone(grandchildPid)
  return true
}

interface ToolIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly runId: string
}

async function executeTool(options: {
  readonly registry: ToolRegistry
  readonly storage: import("@wanex/storage").ToolExecutionStore
  readonly identity: ToolIdentity
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly permissionPolicy: ToolPermissionPolicy
  readonly signal?: AbortSignal
}) {
  return await options.registry.execute({
    ...options.identity,
    storage: options.storage,
    call: {
      type: "tool_call",
      id: `part_${options.toolCallId}`,
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      input: options.input
    },
    idempotencyKey: `eval-controlled-tools:${options.toolCallId}`,
    permissionPolicy: options.permissionPolicy,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  })
}

function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "expected JSON object"
  )
  return value as Record<string, JsonValue>
}

function jsonString(value: JsonValue | undefined): string {
  assert(typeof value === "string", "expected JSON string")
  return value
}

async function waitForTextFile(path: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await delay(20)
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function assertProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return
      throw error
    }
    await delay(20)
  }
  throw new Error(`process ${pid} is still alive after tool cancellation`)
}

async function delay(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}
