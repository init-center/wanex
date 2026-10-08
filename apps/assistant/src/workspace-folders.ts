import type { MutableState, StateCoordinator } from "./state/assistant.js"
import { resolveSessionId } from "./state/assistant.js"

/** Access the user chose for a folder they added to a conversation. */
export type WorkspaceFolderAccess = "read" | "read_write"

/**
 * Trusted Host port for folders the user grants to one conversation.
 * Paths never cross this boundary; the Host owns directory selection.
 */
export interface WorkspaceFolderPort {
  /** True when this Host can show a trusted directory picker. */
  readonly canPick: boolean
  /** Without a Session only recent folders are returned. */
  listFolders(request: { readonly sessionId?: string }): Promise<WorkspaceFolderListing>
  /** Returns undefined when the user dismissed the picker. */
  grantFolder(request: WorkspaceFolderGrantRequest): Promise<WorkspaceFolderReadModel | undefined>
  regrantFolder(request: WorkspaceFolderRegrantRequest): Promise<WorkspaceFolderReadModel>
  revokeFolder(request: WorkspaceFolderRevokeRequest): Promise<void>
}

export interface WorkspaceFolderGrantRequest {
  readonly sessionId: string
  readonly access: WorkspaceFolderAccess
  readonly idempotencyKey: string
}

export interface WorkspaceFolderRegrantRequest {
  readonly sessionId: string
  readonly recentRef: string
  readonly idempotencyKey: string
}

export interface WorkspaceFolderRevokeRequest {
  readonly sessionId: string
  readonly grantId: string
  readonly idempotencyKey: string
}

export interface WorkspaceFolderReadModel {
  readonly grantId: string
  readonly name: string
  readonly access: WorkspaceFolderAccess
}

export interface RecentWorkspaceFolderReadModel {
  readonly recentRef: string
  readonly name: string
  readonly access: WorkspaceFolderAccess
}

export interface WorkspaceFolderListing {
  readonly folders: readonly WorkspaceFolderReadModel[]
  readonly recent: readonly RecentWorkspaceFolderReadModel[]
}

export interface WorkspaceFoldersReadModel extends WorkspaceFolderListing {
  readonly kind: "assistant.workspace-folders"
  readonly available: boolean
  readonly canPick: boolean
  readonly sessionId?: string
}

export interface ListWorkspaceFoldersRequest {
  readonly sessionId?: string
}

export interface GrantWorkspaceFolderRequest {
  readonly sessionId?: string
  readonly access: WorkspaceFolderAccess
  readonly idempotencyKey: string
}

export interface RegrantWorkspaceFolderRequest {
  readonly sessionId?: string
  readonly recentRef: string
  readonly idempotencyKey: string
}

export interface RevokeWorkspaceFolderRequest {
  readonly sessionId?: string
  readonly grantId: string
  readonly idempotencyKey: string
}

export interface WorkspaceFolderCommands {
  listWorkspaceFolders(request?: ListWorkspaceFoldersRequest): Promise<WorkspaceFoldersReadModel>
  grantWorkspaceFolder(request: GrantWorkspaceFolderRequest): Promise<WorkspaceFoldersReadModel>
  regrantWorkspaceFolder(request: RegrantWorkspaceFolderRequest): Promise<WorkspaceFoldersReadModel>
  revokeWorkspaceFolder(request: RevokeWorkspaceFolderRequest): Promise<WorkspaceFoldersReadModel>
}

/**
 * Folders belong to a conversation. A new conversation has no Session yet, so
 * the first folder reserves the Session id that its first message will create.
 */
export function createWorkspaceFolderService(options: {
  readonly state: StateCoordinator
  readonly port?: WorkspaceFolderPort
  readonly createSessionId?: () => string
}): WorkspaceFolderCommands {
  const createSessionId = options.createSessionId ?? (() => `ses_${globalThis.crypto.randomUUID()}`)

  function conversationSessionId(state: MutableState, requested: string | undefined): string | undefined {
    return resolveSessionId(state, requested) ?? state.newConversationSessionId
  }

  async function listing(sessionId: string | undefined): Promise<WorkspaceFoldersReadModel> {
    const port = options.port
    if (port === undefined) {
      return { kind: "assistant.workspace-folders", available: false, canPick: false, folders: [], recent: [] }
    }
    const listed = await port.listFolders(sessionId === undefined ? {} : { sessionId })
    return {
      kind: "assistant.workspace-folders",
      available: true,
      canPick: port.canPick,
      ...(sessionId === undefined ? {} : { sessionId }),
      folders: listed.folders,
      recent: listed.recent
    }
  }

  async function reserved(requested: string | undefined): Promise<string> {
    return await options.state.mutate(async (state) => {
      const existing = conversationSessionId(state, requested)
      if (existing !== undefined) return { value: existing }
      const sessionId = createSessionId()
      return { value: sessionId, next: { ...state, newConversationSessionId: sessionId } }
    })
  }

  function requirePort(): WorkspaceFolderPort {
    if (options.port === undefined) throw new Error("workspace folders are unavailable")
    return options.port
  }

  return {
    async listWorkspaceFolders(request) {
      return await listing(conversationSessionId(options.state.state, request?.sessionId))
    },
    async grantWorkspaceFolder(request) {
      const port = requirePort()
      const sessionId = await reserved(request.sessionId)
      await port.grantFolder({ sessionId, access: request.access, idempotencyKey: request.idempotencyKey })
      return await listing(sessionId)
    },
    async regrantWorkspaceFolder(request) {
      const port = requirePort()
      const sessionId = await reserved(request.sessionId)
      await port.regrantFolder({ sessionId, recentRef: request.recentRef, idempotencyKey: request.idempotencyKey })
      return await listing(sessionId)
    },
    async revokeWorkspaceFolder(request) {
      const port = requirePort()
      const sessionId = conversationSessionId(options.state.state, request.sessionId)
      if (sessionId === undefined) throw new Error("this conversation has no folders")
      await port.revokeFolder({ sessionId, grantId: request.grantId, idempotencyKey: request.idempotencyKey })
      return await listing(sessionId)
    }
  }
}
