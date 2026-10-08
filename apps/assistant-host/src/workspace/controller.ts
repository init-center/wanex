import { realpath, stat } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import type { CoreStore, ConfigEntryRecord } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { SessionTurnExecutionBinding } from "@wanex/protocol"
import { NativeChildSupervisor, NativeExecutionEnvironment, type ResolveSessionTurnAgentContextRequest, type ResolvedSessionTurnAgentContext } from "@wanex/runtime/execution"
import { SkillActivationTool, type PreparedAgentContext } from "@wanex/runtime/context"
import { ToolRegistry, type ToolPermissionPolicy } from "@wanex/runtime/tools"
import type { RuntimeHostToolApprovalContinuation } from "@wanex/runtime/host"
import { LocalToolPermissionPolicy } from "../provider/tool-permission.js"
import { condition, contains, digest, authorityRoots, json, normalizeRoots, opaque, putChecked, selectedContext } from "./store.js"
import { discoverRoot, generationCompiler, selectedSnapshots, withFileSystem } from "./context.js"
import { readOnlyPolicy, type WorkspaceControllerDependencies, type WorkspaceGeneration, type WorkspaceHostOptions, type WorkspaceHostPort } from "./model.js"
import { workspaceTools, WORKSPACE_READ_IMPLEMENTATION } from "./tools.js"
import { createWorkspaceReviewPort } from "./review.js"
import type { WorkspaceFolderPort, WorkspaceReviewPort } from "@wanex/assistant"
import { createWorkspaceFolderPort } from "./folders.js"
import { createWorkspaceAccessStore } from "./access.js"
import { WorkspaceAccessCoordinator } from "./access-coordinator.js"

const MAX_GENERATION_BYTES = 524_288

export interface WorkspaceController {
  readonly port: WorkspaceHostPort
  readonly review: WorkspaceReviewPort
  readonly folders: WorkspaceFolderPort
  readonly toolPermissionPolicy: ToolPermissionPolicy
  readonly toolApprovalContinuation: RuntimeHostToolApprovalContinuation
  resolve(request: ResolveSessionTurnAgentContextRequest, base?: PreparedAgentContext): Promise<ResolvedSessionTurnAgentContext | undefined>
  reconcile(): Promise<void>
  close(): Promise<void>
}

export async function createWorkspaceController(storage: CoreStore, options: WorkspaceHostOptions, dependencies: WorkspaceControllerDependencies): Promise<WorkspaceController> {
  const hostId = opaque(options.hostId)
  if (options.worktreeDirectory !== undefined && (!isAbsolute(options.worktreeDirectory) || options.worktreeDirectory.includes("\0"))) {
    throw new Error("workspace worktree directory must be an absolute Host path")
  }
  const prefix = `assistant.workspace.${hostId}.`
  const authorityKey = `${prefix}authority`
  const environment = new NativeExecutionEnvironment({
    environmentId: `workspace:${hostId}`,
    managedProcess: true,
    strategy: {
      kind: "supervised",
      childSupervisor: new NativeChildSupervisor({ serviceBin: dependencies.serviceBin })
    }
  })
  const accessStore = createWorkspaceAccessStore(storage, { hostId })
  const accessCoordinator = new WorkspaceAccessCoordinator({
    hostId,
    storage,
    accessStore,
    basePolicy: new LocalToolPermissionPolicy()
  })
  let closed = false
  const pending = new Set<Promise<unknown>>()
  try {
    if (await storage.getConfigEntry(authorityKey) === null) {
      const roots = await normalizeRoots(options.initialRoots ?? [])
      const initialized = await storage.compareAndApplyConfigMutations({
        conditions: [{ key: authorityKey, expectedRevision: null }],
        puts: [{ key: authorityKey, value: json({ roots }) }], deletes: []
      })
      if (initialized.kind !== "applied" && await storage.getConfigEntry(authorityKey) === null) {
        throw new Error("workspace authority initialization failed")
      }
    }
  } catch (error) { await environment.close(); throw error }

  function active(): void { if (closed) throw new Error("workspace Host is closed") }
  async function track<T>(operation: () => Promise<T>): Promise<T> {
    active()
    const result = operation()
    pending.add(result)
    try { return await result } finally { pending.delete(result) }
  }
  async function authority(): Promise<ConfigEntryRecord> {
    const entry = await storage.getConfigEntry(authorityKey)
    if (entry === null) throw new Error("workspace authority is missing")
    authorityRoots(entry)
    return entry
  }
  const contextKey = (sessionId: string) => `${prefix}session.${digest(sessionId)}`
  async function assertAuthority(generation: WorkspaceGeneration): Promise<void> {
    active()
    const current = await authority()
    if (current.revision !== generation.authority.revision || digest(current.value) !== digest(generation.authority.value)) {
      throw new Error("workspace authority changed or was revoked")
    }
    for (const { root } of generation.roots) {
      const canonical = await realpath(root.path)
      const value = await stat(canonical, { bigint: true })
      if (canonical !== root.path || !value.isDirectory() || String(value.dev) !== root.device || String(value.ino) !== root.inode) {
        throw new Error("workspace directory identity changed")
      }
    }
  }
  async function load(key: string): Promise<WorkspaceGeneration> {
    if (!key.startsWith(`${prefix}generation.`)) throw new Error("workspace generation belongs to another Host")
    const record = await storage.getConfigEntry(key)
    if (record === null || key !== `${prefix}generation.${digest(record.value)}` || Buffer.byteLength(JSON.stringify(record.value)) > MAX_GENERATION_BYTES) {
      throw new Error("workspace context generation is missing or corrupt")
    }
    const generation = record.value as unknown as WorkspaceGeneration
    if (generation.hostId !== hostId || generation.authority.key !== authorityKey) throw new Error("workspace generation Host mismatch")
    await assertAuthority(generation)
    return generation
  }
  const port: WorkspaceHostPort = {
    async readAuthority() {
      return await track(async () => {
        const entry = await authority()
        return { revision: entry.revision, roots: authorityRoots(entry).map(projectRoot) }
      })
    },
    async setAuthority(request) {
      return await track(async () => {
        const roots = await normalizeRoots(request.roots)
        const entry = await putChecked(storage, authorityKey, json({ roots }), request.expectedRevision)
        return { revision: entry.revision, roots: roots.map(projectRoot) }
      })
    },
    async readContext(sessionId) {
      return await track(async () => {
        const entry = await storage.getConfigEntry(contextKey(opaque(sessionId)))
        return { revision: entry?.revision ?? null, context: selectedContext(entry?.value ?? null) }
      })
    },
    async setContext(request) {
      return await track(async () => {
        const sessionId = opaque(request.sessionId)
        const session = await storage.getSession(sessionId)
        if (session === null || session.status !== "active") throw new Error("workspace Session is not active")
        const current = await authority()
        const roots = authorityRoots(current)
        const selection = selectedContext(json(request.context))
        if (selection.rootIds.some((id) => !roots.some((root) => root.id === id))) throw new Error("workspace selected root is not authorized")
        const cwd = selection.cwd === undefined ? undefined : await realpath(selection.cwd)
        if (cwd !== undefined && (!roots.some((root) => contains(root.path, cwd)) || !(await stat(cwd)).isDirectory())) {
          throw new Error("workspace cwd is not authorized")
        }
        const value = json({ rootIds: [...selection.rootIds].sort(), ...(cwd === undefined ? {} : { cwd }) })
        const entry = await putChecked(storage, contextKey(sessionId), value, request.expectedRevision, [{ key: authorityKey, expectedRevision: current.revision }])
        return { revision: entry.revision, context: selectedContext(entry.value) }
      })
    }
  }
  return {
    port,
    review: createWorkspaceReviewPort({
      coreStore: storage,
      workspaceStore: dependencies.workspaceStore,
      accessStore,
      requireGrant: (invocation, grantId, effects) => accessCoordinator.requireGrant(invocation, grantId, effects),
      environment,
      serviceBin: dependencies.serviceBin,
      loadGeneration: load,
      assertGeneration: assertAuthority
    }),
    folders: createWorkspaceFolderPort({
      accessStore,
      ...(options.selectDirectory === undefined ? {} : { selectDirectory: options.selectDirectory })
    }),
    toolPermissionPolicy: accessCoordinator.policy,
    toolApprovalContinuation: accessCoordinator.continuation,
    reconcile: async () => await track(() => accessCoordinator.reconcile()),
    async resolve(request, base) {
      return await track(async () => {
        const prior = request.phase === "admission" ? await storage.getSessionTurn(request.turnId) : null
        const bound = request.executionBinding ?? prior?.executionBinding
        if (bound === undefined && request.origin !== undefined && request.origin.kind !== "interactive") return undefined
        let key = bound === undefined ? undefined : generationKey(bound, prefix)
        if (bound !== undefined && key === undefined) {
          // A deployment gaining file capability cannot silently add it to old or inherited work.
          return undefined
        }
        let generation: WorkspaceGeneration
        if (key !== undefined) {
          generation = await load(key)
        } else {
          const current = await authority()
          const selectedKey = contextKey(request.sessionId)
          const selected = await storage.getConfigEntry(selectedKey)
          const selection = selectedContext(selected?.value ?? null)
          const roots = authorityRoots(current)
          if (selection.rootIds.some((id) => !roots.some((root) => root.id === id))) throw new Error("workspace selection no longer authorized")
          const discovered = await withFileSystem(environment, roots, async (fs) => {
            const entries = []
            for (const root of roots) entries.push(await discoverRoot(root, fs,
              selection.cwd !== undefined && contains(root.path, selection.cwd) ? selection.cwd : root.path))
            return entries
          })
          generation = {
            hostId, authority: current, selection,
            ...(options.worktreeDirectory === undefined ? {} : { worktreeDirectory: resolve(options.worktreeDirectory) }),
            conditions: [condition(authorityKey, current), condition(selectedKey, selected)],
            roots: discovered,
            ...selectedSnapshots(discovered, selection.rootIds, base)
          }
          const value = json(generation)
          if (Buffer.byteLength(JSON.stringify(value)) > MAX_GENERATION_BYTES) throw new Error("workspace context generation exceeds 512 KiB")
          key = `${prefix}generation.${digest(value)}`
          const saved = await storage.compareAndApplyConfigMutations({
            conditions: [{ key, expectedRevision: null }], puts: [{ key, value }], deletes: []
          })
          if (saved.kind !== "applied") await load(key)
          await assertAuthority(generation)
        }
        const generationRecord = await storage.getConfigEntry(key)
        if (generationRecord === null) throw new Error("workspace generation disappeared")
        const tools = workspaceTools({
          generation,
          generationKey: key,
          environment,
          serviceBin: dependencies.serviceBin,
          workspaceStore: dependencies.workspaceStore,
          accessStore,
          accessCoordinator,
          assertAuthority: () => assertAuthority(generation),
          ...(dependencies.createCapabilityTools === undefined
            ? {}
            : {
                capabilityTools: dependencies.createCapabilityTools({
                  coreStore: storage,
                  generation,
                  generationKey: key,
                  environment,
                  serviceBin: dependencies.serviceBin,
                  workspaceStore: dependencies.workspaceStore,
                  accessStore,
                  accessCoordinator,
                  assertAuthority: () => assertAuthority(generation)
                })
              }),
          ...(dependencies.createMutationTools === undefined
            ? {}
            : {
                mutationTools: dependencies.createMutationTools({
                  coreStore: storage,
                  generation,
                  generationKey: key,
                  environment,
                  serviceBin: dependencies.serviceBin,
                  workspaceStore: dependencies.workspaceStore,
                  accessStore,
                  accessCoordinator,
                  assertAuthority: () => assertAuthority(generation)
                })
              })
        })
        // Global skills remain available; project skills use an explicitly root-scoped tool.
        const globalSkills = { ...generation.skills, sources: generation.skills.sources.filter((source) => source.scope === "global") }
        if (globalSkills.sources.length > 0) tools.register(new SkillActivationTool({ snapshot: globalSkills }))
        for (const descriptor of base?.tools?.list() ?? []) {
          if (descriptor.name === "activate_skill") continue
          const tool = base?.tools?.get(descriptor.name)
          if (tool !== undefined) tools.register(tool)
        }
        const conditions = request.phase === "inheritance"
          ? generation.conditions.filter((item) => item.key === authorityKey)
          : bound?.admissionConditions?.filter((item) => item.key !== key) ?? generation.conditions
        return {
          context: {
            ...base, tools,
            instructionSnapshot: generation.instructions,
            skillSnapshot: generation.skills,
            contextCompiler: generationCompiler(generation, storage, () => assertAuthority(generation))
          },
          executionEnvironment: environment.resolveBinding({ policy: readOnlyPolicy(generation.roots.map((entry) => entry.root)) }),
          admissionConditions: [...conditions, condition(key, generationRecord)]
        }
      })
    },
    async close() {
      closed = true
      await Promise.allSettled([...pending])
      await environment.close()
    }
  }
}

function projectRoot(root: import("./model.js").RootIdentity): import("./model.js").WorkspaceRoot {
  return root.effects.length === 1 && root.effects[0] === "read"
    ? { id: root.id, path: root.path }
    : { id: root.id, path: root.path, effects: root.effects }
}

function generationKey(binding: SessionTurnExecutionBinding, prefix: string): string | undefined {
  const snapshot = binding.toolSnapshot as { tools?: readonly { runtimeBinding?: { implementationId?: string } }[] } | undefined
  if (!snapshot?.tools?.some((tool) => tool.runtimeBinding?.implementationId === WORKSPACE_READ_IMPLEMENTATION)) return undefined
  const references = binding.admissionConditions?.filter((item) => item.key.startsWith(`${prefix}generation.`)) ?? []
  if (references.length !== 1) throw new Error("workspace binding has no unique generation reference")
  return references[0]!.key
}
