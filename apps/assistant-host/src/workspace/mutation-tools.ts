import { WorkspaceApplyChangeSetTool } from "@wanex/workspace/tools/apply"
import { WorkspaceRuntime } from "@wanex/workspace"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  type ToolDefinition,
  type ToolInvocation
} from "@wanex/runtime/tools"
import type { JsonValue } from "@wanex/protocol"
import type { WorkspaceGeneration } from "./model.js"
import { writablePolicy, type RootIdentity } from "./model.js"
import { requiredWorkspaceString, workspaceInput } from "./input.js"
import type { WorkspaceAccessStore } from "./access.js"
import type { WorkspaceAccessCoordinator } from "./access-coordinator.js"

export interface WorkspaceMutationToolOptions {
  readonly generation: WorkspaceGeneration
  readonly generationKey: string
  readonly environment: ExecutionEnvironment
  readonly serviceBin: string
  readonly workspaceStore: WorkspaceStore
  readonly accessStore: WorkspaceAccessStore
  readonly accessCoordinator: WorkspaceAccessCoordinator
  readonly assertAuthority: () => Promise<void>
}

export function createWorkspaceMutationTools(
  options: WorkspaceMutationToolOptions
): readonly ToolDefinition[] {
  const tools = [createApplyTool(options)]
  if (options.generation.roots.some(({ root }) => root.effects.some((effect) => effect !== "read"))) {
    tools.push(
      createHistoryMutationTool({ ...options, name: "workspace_undo_changeset", operation: "undo" }),
      createHistoryMutationTool({ ...options, name: "workspace_reapply_changeset", operation: "reapply" })
    )
  }
  return tools
}

function createHistoryMutationTool(options: WorkspaceMutationToolOptions & {
  readonly name: "workspace_undo_changeset" | "workspace_reapply_changeset"
  readonly operation: "undo" | "reapply"
}): ToolDefinition {
  return {
    name: options.name,
    description: options.operation === "undo"
      ? "Undo a durable applied text changeset after checking its current file baselines."
      : "Reapply a durable text changeset after undo, subject to the same conflict checks.",
    inputSchema: {
      type: "object",
      properties: { rootId: { type: "string", minLength: 1, maxLength: 128 }, grantId: { type: "string", minLength: 1, maxLength: 128 }, changeSetId: { type: "string", minLength: 1, maxLength: 256 } },
      required: ["changeSetId"], additionalProperties: false
    },
    runtimeBinding: createToolRuntimeBinding({ implementationId: `wanex.assistant.workspace.${options.operation}-changeset`, implementationRevision: "1", configuration: { generationKey: options.generationKey } }),
    risk: "mutating",
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate",
    annotations: { destructiveHint: true, openWorldHint: false },
    async invoke(invocation) {
      await options.assertAuthority()
      const input = workspaceInput(invocation.input)
      const rootId = input.rootId === undefined ? undefined : requiredWorkspaceString(input, "rootId")
      const grantId = input.grantId === undefined ? undefined : requiredWorkspaceString(input, "grantId")
      if ((rootId === undefined) === (grantId === undefined)) throw new Error("workspace mutation requires exactly one of rootId or grantId")
      const root = rootId === undefined
        ? undefined
        : options.generation.roots.find(({ root: candidate }) => candidate.id === rootId)
      const changeSetId = requiredWorkspaceString(input, "changeSetId")
      const changeSet = await options.workspaceStore.getWorkspaceChangeSet({ changeSetId })
      if (changeSet === null) throw new Error("workspace changeset does not exist")
      const changeSetRootId = changeSet.workspaceId.slice(changeSet.workspaceId.lastIndexOf(":") + 1)
      if (rootId !== undefined && (root === undefined || changeSet.workspaceId !== `${options.generationKey}:${rootId}`)) throw new Error("workspace changeset does not exist for this root")
      const grantedRoot = grantId === undefined ? undefined : await options.accessCoordinator.requireGrant(invocation, grantId, ["read"])
      const selectedRoot = root?.root ?? grantedRoot
      if (selectedRoot === undefined || selectedRoot.id !== changeSetRootId) throw new Error("workspace changeset does not exist for this root")
      for (const change of changeSet.changeSet.changes) {
        const requiredEffect = options.operation === "undo"
          ? change.kind === "update" ? "write" : change.kind === "create" ? "remove" : "create"
          : change.kind === "update" ? "write" : change.kind === "create" ? "create" : "remove"
        if (!selectedRoot.effects.includes(requiredEffect)) throw new Error(`workspace root does not allow ${options.operation} for ${change.kind}: ${selectedRoot.id}`)
      }
      const scope = await options.environment.bind({
        scopeId: `${options.generationKey.replace(/[^A-Za-z0-9_.:-]/gu, "_")}:${options.operation}:${rootId}:${invocation.idempotencyKey}`,
        policy: writablePolicy([selectedRoot]),
        fileSystemRoots: [{ id: selectedRoot.id, path: selectedRoot.path }]
      })
      try {
        const runtime = new WorkspaceRuntime({ storage: options.workspaceStore, workspaceId: changeSet.workspaceId, principalId: invocation.principalId, rootDir: selectedRoot.path, serviceBin: options.serviceBin, executionScope: scope })
        const result = options.operation === "undo"
          ? await runtime.undoChangeSet({ changeSetId, mutation: mutationFor(invocation, options.operation) })
          : await runtime.reapplyChangeSet({ changeSetId, mutation: mutationFor(invocation, options.operation) })
        await options.assertAuthority()
        return { outcome: "succeeded", toolCallId: invocation.toolCallId, content: jsonToolResultContent(JSON.parse(JSON.stringify(result)) as JsonValue) }
      } finally {
        await scope.close()
      }
    }
  }
}

function mutationFor(invocation: ToolInvocation, operation: string) {
  return {
    sourceKind: "tool" as const,
    sourceId: `${invocation.sessionId}:${invocation.turnId}:${invocation.attemptId}:${invocation.toolCallId}:${operation}`,
    idempotencyKey: `${invocation.idempotencyKey}:${operation}`,
    ownerId: invocation.principalId
  }
}

function createApplyTool(options: WorkspaceMutationToolOptions): ToolDefinition {
  const writableRoots = options.generation.roots.filter(({ root }) => root.effects.some((effect) => effect !== "read"))
  return {
    name: "workspace_apply_changeset",
    description: "Apply bounded text changes to explicitly writable authorized roots. Each root is committed independently.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 512 },
        changes: {
          type: "array", minItems: 1,
          items: {
            type: "object",
            properties: {
              rootId: { type: "string", minLength: 1, maxLength: 128 }, grantId: { type: "string", minLength: 1, maxLength: 128 }, path: { type: "string", minLength: 1, maxLength: 4096 },
              kind: { type: "string", enum: ["create", "update", "delete"] }, baseText: { type: "string" },
              baseSha256: { type: "string", minLength: 64, maxLength: 64 }, targetText: { type: "string" }
            },
            required: ["path", "kind"], additionalProperties: false
          }
        }
      },
      required: ["changes"], additionalProperties: false
    },
    runtimeBinding: createToolRuntimeBinding({ implementationId: "wanex.assistant.workspace.apply-changeset", implementationRevision: "1", configuration: { generationKey: options.generationKey, rootIds: writableRoots.map(({ root }) => root.id) } }),
    risk: "mutating", idempotent: false, concurrency: "exclusive", resultMode: "immediate",
    annotations: { destructiveHint: true, openWorldHint: false },
    async invoke(invocation) {
      await options.assertAuthority()
      const input = workspaceInput(invocation.input)
      const raw = input.changes
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) throw new Error("workspace changes must contain 1 to 32 files")
      const title = typeof input.title === "string" ? input.title : undefined
      const grouped = new Map<string, { readonly root: RootIdentity; readonly changes: Record<string, JsonValue>[] }>()
      for (const value of raw) {
        const change = workspaceInput(value)
        const rootId = change.rootId === undefined ? undefined : requiredWorkspaceString(change, "rootId")
        const grantId = change.grantId === undefined ? undefined : requiredWorkspaceString(change, "grantId")
        if ((rootId === undefined) === (grantId === undefined)) throw new Error("workspace change requires exactly one of rootId or grantId")
        const kind = requiredWorkspaceString(change, "kind")
        if (kind !== "create" && kind !== "update" && kind !== "delete") throw new Error(`invalid workspace change kind: ${kind}`)
        const requiredEffect = kind === "create" ? "create" : kind === "delete" ? "remove" : "write"
        const root = grantId === undefined
          ? writableRoots.find(({ root: candidate }) => candidate.id === rootId)?.root
          : await options.accessCoordinator.requireGrant(invocation, grantId, [requiredEffect])
        if (root === undefined) throw new Error(`workspace root is not writable: ${rootId}`)
        if (!root.effects.includes(requiredEffect)) throw new Error(`workspace root does not allow ${kind}: ${root.id}`)
        const key = root.id
        const existing = grouped.get(key) ?? { root, changes: [] }
        existing.changes.push(change)
        grouped.set(key, existing)
      }
      const results: JsonValue[] = []
      for (const [rootId, group] of grouped) {
        await options.assertAuthority()
        const root = group.root
        const scope = await options.environment.bind({
          scopeId: `${options.generationKey.replace(/[^A-Za-z0-9_.:-]/gu, "_")}:write:${rootId}:${invocation.idempotencyKey}`,
          policy: writablePolicy([root]), fileSystemRoots: [{ id: root.id, path: root.path }]
        })
        try {
          const runtime = new WorkspaceRuntime({ storage: options.workspaceStore, workspaceId: `${options.generationKey}:${rootId}`, principalId: invocation.principalId, rootDir: root.path, serviceBin: options.serviceBin, executionScope: scope })
          const delegated = new WorkspaceApplyChangeSetTool({ scopeId: `${options.generationKey}:${rootId}`, runtime })
          const result = await delegated.invoke({
            ...invocation,
            input: { ...(title === undefined ? {} : { title }), changes: group.changes.map(({ rootId: _rootId, grantId: _grantId, ...change }) => change) as unknown as JsonValue },
            idempotencyKey: `${invocation.idempotencyKey}:${rootId}`, toolCallId: `${invocation.toolCallId}:${rootId}`
          })
          if (result.outcome === "succeeded" || result.outcome === "failed") results.push({ rootId, outcome: result.outcome, content: JSON.parse(JSON.stringify(result.content)) as JsonValue })
          else if (result.outcome === "ambiguous") results.push({ rootId, outcome: result.outcome, message: result.message })
          else results.push({ rootId, outcome: result.outcome })
        } finally {
          await scope.close()
        }
      }
      await options.assertAuthority()
      return { outcome: "succeeded", toolCallId: invocation.toolCallId, content: jsonToolResultContent({ roots: results }) }
    }
  }
}
