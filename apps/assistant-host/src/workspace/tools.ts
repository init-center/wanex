import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import { WorkspaceReadTextTool } from "@wanex/workspace/tools/read"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { SkillActivationTool, renderInstructionSnapshot } from "@wanex/runtime/context"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import { ToolRegistry, createToolRuntimeBinding, jsonToolResultContent, type ToolDefinition, type ToolInvocation } from "@wanex/runtime/tools"
import type { JsonValue } from "@wanex/protocol"
import { discoveryFileSystem, discoverRoot, withFileSystem } from "./context.js"
import { contains, json } from "./store.js"
import type { RootContext, WorkspaceGeneration } from "./model.js"
import { requiredWorkspaceString, workspaceInput } from "./input.js"
import {
  WORKSPACE_ACCESS_IMPLEMENTATION,
  WORKSPACE_ACCESS_TOOL,
  WorkspaceAccessCoordinator,
  parseWorkspaceAccessRequestInput,
  workspaceAccessRequestId
} from "./access-coordinator.js"
import type { WorkspaceAccessStore } from "./access.js"

export const WORKSPACE_READ_IMPLEMENTATION = "wanex.assistant.workspace.read"
export const WORKSPACE_LIST_FOLDERS_TOOL = "workspace_list_folders"

export function workspaceTools(options: {
  readonly generation: WorkspaceGeneration
  readonly generationKey: string
  readonly environment: ExecutionEnvironment
  readonly serviceBin: string
  readonly workspaceStore: WorkspaceStore
  readonly accessStore: WorkspaceAccessStore
  readonly accessCoordinator: WorkspaceAccessCoordinator
  readonly assertAuthority: () => Promise<void>
  readonly capabilityTools?: readonly ToolDefinition[]
  readonly mutationTools?: readonly ToolDefinition[]
}): ToolRegistry {
  const { generation, generationKey, environment, assertAuthority } = options
  const registry = new ToolRegistry()
  const common = {
    risk: "read_only", idempotent: true, concurrency: "parallel_safe", resultMode: "immediate"
  } as const
  async function run(invocation: ToolInvocation, action: (fs: import("@wanex/runtime/execution").ExecutionFileSystem) => Promise<import("@wanex/runtime/tools").ToolExecutionResult>, extraRoots: readonly import("./model.js").RootIdentity[] = []) {
    if (invocation.signal?.aborted) throw new Error("workspace operation cancelled")
    await assertAuthority()
    const roots = [...generation.roots.map((entry) => entry.root), ...extraRoots]
    const result = await withFileSystem(environment, roots, action)
    await assertAuthority()
    if (invocation.signal?.aborted) throw new Error("workspace operation cancelled")
    return result
  }
  registry.register({
    risk: "mutating",
    idempotent: true,
    concurrency: "exclusive",
    resultMode: "immediate",
    name: WORKSPACE_ACCESS_TOOL,
    description: "Request explicit, scoped access to a workspace directory before reading or modifying it.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        effects: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: ["read", "write", "create", "remove"] } },
        scope: { type: "string", enum: ["turn", "session"] },
        reason: { type: "string", minLength: 1, maxLength: 4096 }
      },
      required: ["path", "effects"],
      additionalProperties: false
    },
    runtimeBinding: createToolRuntimeBinding({
      implementationId: WORKSPACE_ACCESS_IMPLEMENTATION,
      implementationRevision: "1",
      configuration: { hostId: options.accessCoordinator.hostId }
    }),
    async invoke(invocation) {
      const input = parseWorkspaceAccessRequestInput(invocation.input)
      const requestId = workspaceAccessRequestId({
        hostId: generation.hostId,
        sessionId: invocation.sessionId,
        turnId: invocation.turnId,
        inputId: invocation.inputId,
        toolCallId: invocation.toolCallId,
        input
      })
      const request = await options.accessStore.getRequest(requestId)
      if (request === null) throw new Error("workspace access request is missing")
      if (request.state !== "approved" || request.grantId === undefined) {
        throw new Error(`workspace access request is ${request.state}`)
      }
      const root = await options.accessCoordinator.requireGrant(invocation, request.grantId, input.effects)
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          grantId: request.grantId,
          rootId: root.id,
          effects: root.effects,
          scope: request.scope
        })
      }
    }
  } satisfies ToolDefinition)
  registry.register({
    ...common,
    name: WORKSPACE_LIST_FOLDERS_TOOL,
    description: "List folders the user added to this conversation. Each folder has a grantId; pass it with a relative path to the read and change tools. Call this when the user refers to a folder they added.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.assistant.workspace.folders",
      implementationRevision: "1",
      configuration: { hostId: options.accessCoordinator.hostId }
    }),
    async invoke(invocation) {
      const grants = await options.accessStore.listGrants({ sessionId: invocation.sessionId, state: "active" })
      const folders = grants
        .filter((grant) => grant.scope === "session")
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((grant) => ({
          grantId: grant.id,
          name: basename(grant.root.path) || grant.root.path,
          access: grant.effects.some((effect) => effect !== "read") ? "read_write" : "read"
        }))
      return { outcome: "succeeded", toolCallId: invocation.toolCallId, content: jsonToolResultContent({ folders }) }
    }
  } satisfies ToolDefinition)
  registry.register({
    ...common,
    name: "workspace_read_text",
    description: "Read UTF-8 text within existing Host authority. Absolute paths need no project registration. For relative paths supply rootId, a grantId from workspace_list_folders, or use the selected cwd. Results include applicable scoped project instructions and skills; apply them only within that root. Available root IDs: " + generation.roots.map(({ root }) => root.id).join(", "),
    inputSchema: {
      type: "object", properties: { path: { type: "string", minLength: 1, maxLength: 4096 }, rootId: { type: "string", minLength: 1, maxLength: 128 }, grantId: { type: "string", minLength: 1, maxLength: 128 } }, required: ["path"], additionalProperties: false
    },
    runtimeBinding: createToolRuntimeBinding({ implementationId: WORKSPACE_READ_IMPLEMENTATION, implementationRevision: "1", configuration: { generationKey } }),
    async invoke(invocation) {
      const rawInput = workspaceInput(invocation.input)
      const grantId = rawInput.grantId === undefined ? undefined : requiredWorkspaceString(rawInput, "grantId")
      const dynamicRoot = grantId === undefined
        ? undefined
        : await options.accessCoordinator.requireGrant(invocation, grantId, ["read"])
      return await run(invocation, async (fs) => {
        const input = workspaceInput(invocation.input)
        const path = requiredWorkspaceString(input, "path")
        const rootId = input.rootId === undefined ? undefined : requiredWorkspaceString(input, "rootId")
        if (rootId !== undefined && grantId !== undefined) throw new Error("workspace path accepts rootId or grantId, not both")
        const explicit = rootId === undefined ? undefined : generation.roots.find((entry) => entry.root.id === rootId)
        if (rootId !== undefined && explicit === undefined) throw new Error("workspace root is not authorized")
        const selected = dynamicRoot === undefined ? explicit?.root : dynamicRoot
        const cwd = selected?.path ?? generation.selection.cwd
        if (!isAbsolute(path) && cwd === undefined) throw new Error("workspace relative path is ambiguous; provide an absolute path or rootId")
        const target = resolve(cwd ?? path, path)
        const canonical = await fs.canonicalize(target)
        const selectedEntry = selected === undefined
          ? generation.roots.find(({ root }) => contains(root.path, canonical))
          : undefined
        const entry = selectedEntry?.root ?? selected
        if (entry === undefined || !contains(entry.path, canonical)) throw new Error("workspace path is not authorized")
        const tool = new WorkspaceReadTextTool({
          scopeId: generationKey.replace(/[^A-Za-z0-9_.:-]/gu, "_"),
          rootDir: entry.path, fileSystem: fs,
          maxFileBytes: 262_144, maxOutputBytes: 65_536
        })
        const result = await tool.invoke({ ...invocation, input: { path: relative(entry.path, canonical) } })
        if (result.outcome !== "succeeded") return result
        if (dynamicRoot !== undefined) return result
        const contextual = await contextForPath(
          selectedEntry ?? { root: entry, instructions: generation.instructions, skills: generation.skills },
          dirname(canonical),
          fs
        )
        const context = {
          rootId: entry.id,
          instructions: renderInstructionSnapshot({ snapshot: contextual.instructions }),
          instructionEvidence: json(contextual.instructions.sources.map(({ path, hash }) => ({ path: relative(entry.path, path), hash }))),
          skills: json(contextual.skills.sources.map(({ name, description, hash, bodyHash }) => ({ name, description, hash, bodyHash })))
        }
        if (Buffer.byteLength(JSON.stringify(context)) > 65_536) throw new Error("workspace scoped context exceeds 64 KiB; narrow the selected context")
        return {
          ...result,
          content: [...result.content, ...jsonToolResultContent(context)]
        }
      }, dynamicRoot === undefined ? [] : [dynamicRoot])
    }
  } satisfies ToolDefinition)
  for (const tool of options.capabilityTools ?? []) registry.register(tool)
  for (const tool of options.mutationTools ?? []) registry.register(tool)
  registry.register(createReviewTool({ generation, generationKey, workspaceStore: options.workspaceStore }))
  registry.register({
    ...common,
    name: "workspace_activate_skill",
    description: "Activate a frozen project skill. Pass its rootId and unqualified skill name from workspace_read_text or the scoped catalog.",
    inputSchema: { type: "object", properties: { rootId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 } }, required: ["rootId", "name"], additionalProperties: false },
    runtimeBinding: createToolRuntimeBinding({ implementationId: "wanex.assistant.workspace.skill", implementationRevision: "1", configuration: { generationKey } }),
    async invoke(invocation) {
      return await run(invocation, async (fs) => {
        const input = workspaceInput(invocation.input)
        const root = generation.roots.find((entry) => entry.root.id === requiredWorkspaceString(input, "rootId"))
        if (root === undefined) throw new Error("workspace skill root is not authorized")
        const tool = new SkillActivationTool({ snapshot: root.skills, fs: discoveryFileSystem(fs), maxIndexedFiles: 64 })
        return await tool.invoke({ ...invocation, input: { name: requiredWorkspaceString(input, "name") } })
      })
    }
  } satisfies ToolDefinition)
  return registry
}

function createReviewTool(options: {
  readonly generation: WorkspaceGeneration
  readonly generationKey: string
  readonly workspaceStore: WorkspaceStore
}): ToolDefinition {
  return {
    name: "workspace_review_changeset",
    description: "Review the durable text changeset and its apply/undo history without changing files.",
    inputSchema: {
      type: "object",
      properties: { rootId: { type: "string", minLength: 1, maxLength: 128 }, changeSetId: { type: "string", minLength: 1, maxLength: 256 } },
      required: ["rootId", "changeSetId"], additionalProperties: false
    },
    runtimeBinding: createToolRuntimeBinding({ implementationId: "wanex.assistant.workspace.review-changeset", implementationRevision: "1", configuration: { generationKey: options.generationKey } }),
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    async invoke(invocation) {
      const input = workspaceInput(invocation.input)
      const rootId = requiredWorkspaceString(input, "rootId")
      if (!options.generation.roots.some(({ root }) => root.id === rootId)) throw new Error("workspace root is not authorized")
      const changeSetId = requiredWorkspaceString(input, "changeSetId")
      const changeSet = await options.workspaceStore.getWorkspaceChangeSet({ changeSetId })
      if (changeSet === null || changeSet.workspaceId !== `${options.generationKey}:${rootId}`) throw new Error("workspace changeset does not exist for this root")
      const operations = await options.workspaceStore.listWorkspaceChangeOperations({ changeSetId })
      return { outcome: "succeeded", toolCallId: invocation.toolCallId, content: jsonToolResultContent(JSON.parse(JSON.stringify({ changeSet, operations })) as JsonValue) }
    }
  }
}

async function contextForPath(entry: RootContext, cwd: string, fs: import("@wanex/runtime/execution").ExecutionFileSystem): Promise<RootContext> {
  const discovered = await discoverRoot(entry.root, fs, cwd)
  const frozenPaths = new Set(entry.instructions.sources.map((source) => source.path))
  return {
    root: entry.root,
    instructions: {
      ...discovered.instructions,
      sources: [...entry.instructions.sources.filter((source) => contains(dirname(source.path), cwd)), ...discovered.instructions.sources.filter((source) => !frozenPaths.has(source.path))]
        .sort((a, b) => a.path.length - b.path.length || a.order - b.order)
        .map((source, order) => ({ ...source, order, target: relative(entry.root.path, source.path) }))
    },
    skills: entry.skills
  }
}
