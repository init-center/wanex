import type {
  ProductAppInitialState,
  ProductAppLayout,
  ProductAppMode,
  ProductAppRendererPreferences,
  ProductAppStateSnapshot,
  ProductAppStateStore,
  ProductAppTrustedStateSnapshot
} from "./types.js"
import type {
  ProductAppTrustedConversationOperationReference
} from "./types-conversation.js"
import type { ProductAppAttachmentDraft } from "./types-attachments.js"

const defaultPreferences: ProductAppRendererPreferences = {
  theme: "system",
  density: "comfortable"
}

export interface MutableProductAppState {
  selectedSessionId?: string
  layout: ProductAppLayout
  mode: ProductAppMode
  preferences: ProductAppRendererPreferences
  trackedConversationOperations: Record<
    string,
    ProductAppTrustedConversationOperationReference
  >
  conversationAttachmentDrafts: Record<
    string,
    readonly ProductAppAttachmentDraft[]
  >
}

export interface ProductAppStateCoordinator {
  readonly state: MutableProductAppState
  commit(next: MutableProductAppState): Promise<ProductAppStateSnapshot>
  mutate<T>(
    run: (state: MutableProductAppState) => Promise<{
      readonly value: T
      readonly next?: MutableProductAppState
    }>
  ): Promise<T>
}

export function createProductAppState(
  stored: ProductAppTrustedStateSnapshot | undefined,
  explicit: ProductAppInitialState | undefined
): MutableProductAppState {
  const base = stored?.ui
  return {
    ...optionalSelectedSession(explicit?.selectedSessionId ?? base?.selectedSessionId),
    layout: explicit?.layout ?? base?.layout ?? "single",
    mode: explicit?.mode ?? base?.mode ?? "chat",
    preferences: {
      ...defaultPreferences,
      ...(base?.preferences ?? {}),
      ...(explicit?.preferences ?? {})
    },
    trackedConversationOperations: {
      ...(stored?.trackedConversationOperations ?? {})
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      stored?.conversationAttachmentDrafts ?? {}
    )
  }
}

export function createProductAppStateCoordinator(request: {
  readonly store: ProductAppStateStore
  readonly state: MutableProductAppState
}): ProductAppStateCoordinator {
  let tail: Promise<void> = Promise.resolve()

  async function serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = tail.then(run, run)
    tail = result.then(
      () => undefined,
      () => undefined
    )
    return await result
  }

  async function commit(
    next: MutableProductAppState
  ): Promise<ProductAppStateSnapshot> {
    const trusted = trustedStateSnapshot(next)
    await request.store.save(trusted)
    replaceProductAppState(request.state, next)
    return trusted.ui
  }

  return {
    state: request.state,
    async commit(next) {
      return await serialize(async () => await commit(next))
    },
    async mutate(run) {
      return await serialize(async () => {
        const outcome = await run(request.state)
        if (outcome.next !== undefined) {
          await commit(outcome.next)
        }
        return outcome.value
      })
    }
  }
}

export function productAppStateSnapshot(
  state: MutableProductAppState
): ProductAppStateSnapshot {
  return {
    ...optionalSelectedSession(state.selectedSessionId),
    layout: state.layout,
    mode: state.mode,
    preferences: { ...state.preferences }
  }
}

export function trustedStateSnapshot(
  state: MutableProductAppState
): ProductAppTrustedStateSnapshot {
  return {
    ui: productAppStateSnapshot(state),
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

export function withTrackedConversationOperation(
  state: MutableProductAppState,
  reference: ProductAppTrustedConversationOperationReference
): MutableProductAppState {
  return {
    ...state,
    selectedSessionId: reference.sessionId,
    preferences: { ...state.preferences },
    trackedConversationOperations: {
      ...state.trackedConversationOperations,
      [reference.sessionId]: reference
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

export function resolveProductAppSessionId(
  state: MutableProductAppState,
  requestedSessionId: string | undefined
): string | undefined {
  const sessionId = requestedSessionId ?? state.selectedSessionId
  if (sessionId === undefined || sessionId.trim().length === 0) {
    return undefined
  }
  return sessionId
}

export function copyProductAppState(
  state: MutableProductAppState
): MutableProductAppState {
  return {
    ...state,
    preferences: { ...state.preferences },
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

function replaceProductAppState(
  current: MutableProductAppState,
  next: MutableProductAppState
): void {
  if (next.selectedSessionId === undefined) {
    delete current.selectedSessionId
  } else {
    current.selectedSessionId = next.selectedSessionId
  }
  current.layout = next.layout
  current.mode = next.mode
  current.preferences = { ...next.preferences }
  current.trackedConversationOperations = {
    ...next.trackedConversationOperations
  }
  current.conversationAttachmentDrafts = cloneAttachmentDrafts(
    next.conversationAttachmentDrafts
  )
}

function cloneAttachmentDrafts(
  drafts: Readonly<Record<string, readonly ProductAppAttachmentDraft[]>>
): Record<string, readonly ProductAppAttachmentDraft[]> {
  return Object.fromEntries(
    Object.entries(drafts).map(([key, attachments]) => [
      key,
      attachments.map((attachment) => ({ ...attachment }))
    ])
  )
}

function optionalSelectedSession(sessionId: string | undefined): {
  readonly selectedSessionId?: string
} {
  return sessionId === undefined ? {} : { selectedSessionId: sessionId }
}
