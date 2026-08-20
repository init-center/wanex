import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { JsonValue } from "@wanex/protocol"
import { NodeExecutionHost } from "@wanex/runtime/execution"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import {
  AllowAllToolsPolicy,
  RiskBoundToolPolicy,
  ToolRegistry,
  type ToolExecutionRequest,
  type ToolPermissionPolicy
} from "@wanex/runtime/tools"
import { WorkspaceRuntime } from "@wanex/workspace"
import {
  ExactWorkspaceProgramPolicy,
  registerWorkspaceCodingTools
} from "@wanex/workspace/tools"
import { settleEvalTurn, startEvalTurn } from "../durable-turn-fixture.js"
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
    const turn = await startEvalTurn({
      session,
      sessionId: created.id,
      principalId,
      inputId: "inp_eval_controlled_tools",
      turnId: "turn_eval_controlled_tools",
      jobId: "job_eval_controlled_tools",
      workerId: "worker_eval_controlled_tools",
      idempotencyKey: "eval-controlled-tools:admit",
      content: [{
        type: "text",
        id: "part_eval_controlled_tools",
        text: "Exercise controlled workspace tools"
      }]
    })
    const workspace = new WorkspaceRuntime({
      storage: context.storage,
      rootDir: context.workspaceRootDir,
      serviceBin: context.serviceBin,
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
    const targetRelativePath = "phase753-controlled.txt"
    const targetPath = join(context.workspaceRootDir, targetRelativePath)
    const approvedInput = {
      program: "node",
      args: ["-e", "process.stdout.write('wanex-controlled')"]
    } as const
    const applyInput = {
      id: "cs_eval_controlled_tools",
      title: "Controlled tool edit",
      changes: [{
        path: targetRelativePath,
        kind: "update",
        baseText: "before\n",
        targetText: "after\n"
      }]
    } as const
    const permissionDeniedInput = {
      program: "node",
      args: ["--version"]
    } as const
    const programDeniedInput = {
      program: "sh",
      args: ["-c", "echo unsafe"]
    } as const
    const pathEscapeInput = { path: "../outside.txt" } as const
    const cancelInput = {
      program: "node",
      args: [
        "-e",
        "const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync('phase753-grandchild.pid',String(c.pid));setInterval(()=>{},1000)"
      ]
    } as const
    await writeFile(targetPath, "before\n", "utf8")
    const sourceMessage = await session.appendMessage({
      ...turn.identity,
      idempotencyKey: "eval-controlled-tools:assistant-source",
      role: "assistant",
      content: [
        toolCallPart("call_eval_controlled_exec", "workspace_exec", approvedInput),
        toolCallPart(
          "call_eval_controlled_apply",
          "workspace_apply_changeset",
          applyInput
        ),
        toolCallPart(
          "call_eval_controlled_permission_denied",
          "workspace_exec",
          permissionDeniedInput
        ),
        toolCallPart(
          "call_eval_controlled_program_denied",
          "workspace_exec",
          programDeniedInput
        ),
        toolCallPart(
          "call_eval_controlled_path_escape",
          "workspace_read_text",
          pathEscapeInput
        ),
        toolCallPart(
          "call_eval_controlled_cancel",
          "workspace_exec",
          cancelInput
        )
      ]
    })
    assert(
      sourceMessage !== null,
      "controlled workspace tool source message should be persisted"
    )
    const identity = {
      principalId,
      ...turn.identity,
      sourceMessageId: sourceMessage.id
    }

    const approved = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_exec",
      toolName: "workspace_exec",
      input: approvedInput,
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(approved.invoked, "approved command should invoke the execution host")
    assert(!completedToolResult(approved).isError, "approved command should succeed")
    const approvedStdout = jsonString(
      jsonRecord(completedToolJson(approved).stdout).text
    )
    assert(
      approvedStdout === "wanex-controlled",
      "approved command should retain stdout"
    )

    const applied = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_apply",
      toolName: "workspace_apply_changeset",
      input: applyInput,
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(!completedToolResult(applied).isError, "changeset tool should apply")
    assert(
      await readFile(targetPath, "utf8") === "after\n",
      "changeset tool should update the file"
    )
    await workspace.undoChangeSet({
      changeSetId: "cs_eval_controlled_tools",
      mutation: {
        sourceKind: "host",
        sourceId: "eval:controlled-tools:undo",
        idempotencyKey: "eval:controlled-tools:undo",
        ownerId: identity.principalId
      }
    })
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
      input: permissionDeniedInput,
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
      input: programDeniedInput,
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(
      completedToolResult(programDenied).isError,
      "unapproved program should fail closed"
    )
    assert(
      completedToolJson(programDenied).error ===
        "program_not_allowed",
      "program allowlist should own executable selection"
    )

    const escaped = await executeTool({
      registry,
      storage: context.storage,
      identity,
      toolCallId: "call_eval_controlled_path_escape",
      toolName: "workspace_read_text",
      input: pathEscapeInput,
      permissionPolicy: new AllowAllToolsPolicy()
    })
    assert(completedToolResult(escaped).isError, "path escape should fail closed")

    const cancellationChecked = process.platform !== "win32"
      ? await cancelProcessTree({
          registry,
          storage: context.storage,
          identity,
          workspaceRootDir: context.workspaceRootDir,
          input: cancelInput
        })
      : false

    const executions = (await context.storage.listToolExecutions({}))
      .filter((execution) => execution.turnId === turn.identity.turnId)
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
    await settleEvalTurn(session, turn, [{
        type: "text",
        id: "assistant_eval_controlled_tools_complete",
        text: "Controlled workspace tool checks completed."
      }])

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
  readonly input: JsonValue
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
    input: options.input,
    permissionPolicy: new AllowAllToolsPolicy(),
    signal: controller.signal
  })
  const grandchildPid = Number(await waitForTextFile(pidFile, 2_000))
  assert(Number.isInteger(grandchildPid), "grandchild pid should be recorded")
  controller.abort()
  const cancelled = await execution
  assert(cancelled.invoked, "parent cancellation should stop an invoked tool call")
  assert(
    completedToolResult(cancelled).isError,
    "parent cancellation should return a tool error"
  )
  const cancellationResult = completedToolJson(cancelled)
  assert(
    cancellationResult.termination === "cancelled" &&
      cancellationResult.cleanup === "completed",
    "parent cancellation should return completed process-tree cleanup evidence"
  )
  await assertProcessGone(grandchildPid)
  return true
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

async function executeTool(options: {
  readonly registry: ToolRegistry
  readonly storage: ToolExecutionRequest["storage"]
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

function completedToolResult(
  outcome: Awaited<ReturnType<typeof executeTool>>
): Extract<Awaited<ReturnType<typeof executeTool>>, { readonly state: "completed" }>["result"] {
  assert(
    outcome.state === "completed",
    "controlled workspace fixture must not continue after tool recovery is required"
  )
  return outcome.result
}

function completedToolJson(
  outcome: Awaited<ReturnType<typeof executeTool>>
): Record<string, JsonValue> {
  const content = completedToolResult(outcome).content
  assert(
    content.length === 1 && content[0]?.type === "json",
    "controlled workspace Tool should return one JSON content part"
  )
  return jsonRecord(content[0].value)
}

function toolCallPart(
  toolCallId: string,
  toolName: string,
  input: JsonValue
): import("@wanex/protocol").ToolCallMessagePart {
  return {
    type: "tool_call",
    id: "part_" + toolCallId,
    toolCallId,
    toolName,
    input
  }
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
