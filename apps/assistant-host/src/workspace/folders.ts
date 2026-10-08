import { basename } from "node:path"
import type {
  RecentWorkspaceFolderReadModel,
  WorkspaceFolderAccess,
  WorkspaceFolderListing,
  WorkspaceFolderPort,
  WorkspaceFolderReadModel
} from "@wanex/assistant"
import type { WorkspaceAccessGrantRecord, WorkspaceAccessStore } from "./access.js"
import { inspectWorkspaceRoot } from "./access-coordinator.js"
import type { WorkspaceFileEffect } from "./model.js"

const USER_ACTOR = "assistant-user"
const MAX_RECENT = 8

/**
 * Folders the user grants to one conversation through a trusted Host picker.
 * Each folder is an ordinary durable Session grant; paths never leave the Host.
 */
export function createWorkspaceFolderPort(options: {
  readonly accessStore: WorkspaceAccessStore
  readonly selectDirectory?: () => Promise<string | undefined>
}): WorkspaceFolderPort {
  const { accessStore } = options

  async function activeSessionGrants(sessionId: string): Promise<readonly WorkspaceAccessGrantRecord[]> {
    return (await accessStore.listGrants({ sessionId, state: "active" }))
      .filter((grant) => grant.scope === "session")
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  async function grantRoot(sessionId: string, path: string, effects: readonly WorkspaceFileEffect[], idempotencyKey: string): Promise<WorkspaceFolderReadModel> {
    const root = await inspectWorkspaceRoot(path, effects)
    for (const existing of await activeSessionGrants(sessionId)) {
      if (existing.root.path !== root.path) continue
      if (sameEffects(existing.effects, root.effects)) return project(existing)
      // Changing access replaces the grant so each record keeps immutable authority.
      await accessStore.revokeGrant({
        grantId: existing.id, expectedRevision: existing.revision, actorId: USER_ACTOR,
        reason: "the user changed folder access", idempotencyKey: `replace:${idempotencyKey}`, now: Date.now()
      })
    }
    return project(await accessStore.createUserGrant({ sessionId, actorId: USER_ACTOR, root, idempotencyKey }))
  }

  return {
    canPick: options.selectDirectory !== undefined,
    async listFolders(request): Promise<WorkspaceFolderListing> {
      const folders = request.sessionId === undefined ? [] : await activeSessionGrants(request.sessionId)
      const inConversation = new Set(folders.map((grant) => grant.root.path))
      const seen = new Set<string>()
      const recent: RecentWorkspaceFolderReadModel[] = []
      const userGrants = (await accessStore.listGrants({}))
        .filter((grant) => grant.requestId === undefined)
        .sort((left, right) => right.createdAt - left.createdAt)
      for (const grant of userGrants) {
        if (recent.length >= MAX_RECENT) break
        if (inConversation.has(grant.root.path) || seen.has(grant.root.path)) continue
        seen.add(grant.root.path)
        recent.push({ recentRef: grant.id, name: folderName(grant), access: access(grant.effects) })
      }
      return { folders: folders.map(project), recent }
    },
    async grantFolder(request) {
      if (options.selectDirectory === undefined) throw new Error("this Host cannot open a folder picker")
      const path = await options.selectDirectory()
      if (path === undefined) return undefined
      return await grantRoot(request.sessionId, path, effectsFor(request.access), request.idempotencyKey)
    },
    async regrantFolder(request) {
      const source = await accessStore.getGrant(request.recentRef)
      if (source === null || source.requestId !== undefined) throw new Error("recent folder is unavailable")
      const current = await inspectWorkspaceRoot(source.root.path, source.effects)
      if (current.device !== source.root.device || current.inode !== source.root.inode) {
        throw new Error("the folder changed since it was last used; add it again")
      }
      return await grantRoot(request.sessionId, source.root.path, source.effects, request.idempotencyKey)
    },
    async revokeFolder(request) {
      const grant = await accessStore.getGrant(request.grantId)
      if (grant === null || grant.sessionId !== request.sessionId) throw new Error("folder is not part of this conversation")
      if (grant.state !== "active") return
      await accessStore.revokeGrant({
        grantId: grant.id, expectedRevision: grant.revision, actorId: USER_ACTOR,
        reason: "the user removed the folder", idempotencyKey: request.idempotencyKey, now: Date.now()
      })
    }
  }
}

export function effectsFor(access: WorkspaceFolderAccess): readonly WorkspaceFileEffect[] {
  return access === "read" ? ["read"] : ["read", "write", "create", "remove"]
}

function access(effects: readonly WorkspaceFileEffect[]): WorkspaceFolderAccess {
  return effects.some((effect) => effect !== "read") ? "read_write" : "read"
}

function sameEffects(left: readonly WorkspaceFileEffect[], right: readonly WorkspaceFileEffect[]): boolean {
  return left.length === right.length && left.every((effect, index) => effect === right[index])
}

function folderName(grant: WorkspaceAccessGrantRecord): string {
  return basename(grant.root.path) || grant.root.path
}

function project(grant: WorkspaceAccessGrantRecord): WorkspaceFolderReadModel {
  return { grantId: grant.id, name: folderName(grant), access: access(grant.effects) }
}
