import type { JsonValue } from "@wanex/protocol"
import { createToolRuntimeBinding, jsonToolResultContent, type ToolDefinition } from "@wanex/runtime/tools"
import { WorkspaceRuntime, WorkspaceTransactionCleanupRequiredError, WorkspaceTransactionRecoveryRequiredError } from "@wanex/workspace"
import { WorkspaceTaskAttentionError } from "@wanex/workspace/tasks"
import { parseChangeSet, WORKSPACE_CHANGESET_INPUT_SCHEMA } from "@wanex/workspace/tools/apply"
import type { WorkspaceToolFactoryOptions } from "../model.js"
import { workspaceInput, requiredWorkspaceString } from "../input.js"
import { digest } from "../store.js"
import { openIsolatedTask } from "./runtime.js"

export function createIsolatedChangeTools(options: WorkspaceToolFactoryOptions): readonly ToolDefinition[] {
  if (
    options.generation.worktreeDirectory === undefined ||
    !options.generation.roots.some(({ root }) =>
      root.effects.some((effect) => effect !== "read")
    )
  ) return []
  return [{
    name: "workspace_prepare_isolated_changes",
    description: "Prepare bounded text changes in an explicitly requested Git worktree. Never edits the original directory. Returns a proposal reference for separate review and application; unavailable Git never falls back to direct editing.",
    inputSchema: {
      ...WORKSPACE_CHANGESET_INPUT_SCHEMA,
      properties: { ...WORKSPACE_CHANGESET_INPUT_SCHEMA.properties, rootId: { type: "string", minLength: 1, maxLength: 128 } },
      required: ["rootId", "changes"]
    },
    runtimeBinding: createToolRuntimeBinding({ implementationId: "wanex.assistant.workspace.prepare-isolated-changes", implementationRevision: "1", configuration: { generationKey: options.generationKey } }),
    risk: "mutating", idempotent: false, concurrency: "exclusive", resultMode: "immediate",
    annotations: { destructiveHint: false, openWorldHint: false },
    async invoke(invocation) {
      await options.assertAuthority()
      if (invocation.signal?.aborted) throw new Error("workspace operation cancelled")
      const input = workspaceInput(invocation.input)
      if (Object.keys(input).some((key) => !["rootId", "title", "changes"].includes(key))) throw new Error("unsupported isolated change field")
      const rootId = requiredWorkspaceString(input, "rootId")
      const root = options.generation.roots.find((entry) => entry.root.id === rootId)?.root
      if (root === undefined) throw new Error("workspace root is not authorized")
      const changeSet = parseChangeSet(input)
      for (const change of changeSet.changes) {
        const segments = change.path.replaceAll("\\", "/").split("/")
        if (segments.some((segment) => {
          const name = segment.split(":")[0]!.replace(/[ .]+$/gu, "").toLowerCase()
          return name === ".git" || name === "git~1"
        })) throw new Error("isolated changes cannot modify Git control paths")
        const effect = change.kind === "create" ? "create" : change.kind === "delete" ? "remove" : "write"
        if (!root.effects.includes(effect)) throw new Error(`workspace root does not allow ${change.kind}`)
      }
      const taskId = `wtsk_${digest([options.generationKey, rootId, invocation.principalId, invocation.sessionId, invocation.turnId, invocation.toolCallId, input])}`
      let task: Awaited<ReturnType<typeof openIsolatedTask>> | undefined
      try {
        task = await openIsolatedTask(options, root, invocation.principalId)
        const previous = await options.workspaceStore.getWorkspaceTaskRun({ runId: taskId })
        if (previous !== null && previous.run.state !== "attention" && previous.run.state !== "released" &&
            (previous.activeAttempt?.leaseExpiresAt ?? Infinity) <= Date.now()) {
          await task.tasks.recoverTask({ runId: taskId })
        }
        const receipt = await task.tasks.runTask({
          id: taskId, strategy: "git_worktree", access: "writable", input,
          ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
          handler: async (context) => {
            await options.assertAuthority()
            const runtime = new WorkspaceRuntime({
              storage: options.workspaceStore, rootDir: context.rootDir, serviceBin: options.serviceBin,
              executionScope: context.executionScope, workspaceId: `isolated:${digest(taskId)}`, principalId: invocation.principalId
            })
            const applied = await runtime.applyChangeSet({
              changeSet: { ...changeSet, id: `wcs_isolated_${digest(taskId)}` },
              mutation: { sourceKind: "tool", sourceId: taskId, idempotencyKey: taskId, ownerId: invocation.principalId },
              ...(context.signal === undefined ? {} : { signal: context.signal })
            }).catch((error: unknown) => {
              if (error instanceof WorkspaceTransactionCleanupRequiredError || error instanceof WorkspaceTransactionRecoveryRequiredError) {
                throw new WorkspaceTaskAttentionError({ message: "isolated transaction requires recovery", details: { transactionId: error.transactionId } })
              }
              throw error
            })
            if (applied.receipt.status === "conflicted") throw new Error("workspace text baseline conflict")
            try { await options.assertAuthority() }
            catch { throw new WorkspaceTaskAttentionError({ message: "workspace authority changed during isolated preparation" }) }
            return { ...(changeSet.title === undefined ? {} : { summary: changeSet.title }) }
          }
        })
        const snapshot = await options.workspaceStore.getWorkspaceTaskRun({ runId: taskId })
        const result: JsonValue = {
          rootId, taskId, status: receipt.status, state: snapshot?.run.state ?? "unknown",
          outcome: snapshot?.run.outcome ?? null,
          proposalId: receipt.proposal?.id ?? null,
          changeSetId: receipt.changeSet?.id ?? null,
          ...(receipt.error === undefined ? {} : { code: "isolated_change_failed" })
        }
        return { outcome: receipt.status === "succeeded" ? "succeeded" : "failed", toolCallId: invocation.toolCallId, content: jsonToolResultContent(result) }
      } catch {
        // Native diagnostics can contain Host-local paths. Keep them out of the remote tool result.
        return { outcome: "failed", toolCallId: invocation.toolCallId, content: jsonToolResultContent({ rootId, taskId, code: "isolated_change_unavailable" }) }
      } finally {
        try { await task?.close() }
        catch { throw new Error("workspace isolation scope cleanup failed") }
      }
    }
  }]
}
