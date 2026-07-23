import type {
  ProductAppInitialState,
  ProductAppStateStore,
  ProductAppStateStoreLoadResult,
  ProductAppTrustedStateSnapshot
} from "./types.js"
import { createProductAppState, trustedStateSnapshot } from "./product-state.js"

export function createMemoryProductAppStateStore(
  initial?: ProductAppInitialState | ProductAppTrustedStateSnapshot
): ProductAppStateStore & {
  snapshot(): ProductAppTrustedStateSnapshot | undefined
  saveCount(): number
} {
  let state: ProductAppTrustedStateSnapshot | undefined =
    initial === undefined
      ? undefined
      : "ui" in initial
        ? cloneTrustedState(initial)
        : trustedStateSnapshot(createProductAppState(undefined, initial))
  let saves = 0

  return {
    async load(): Promise<ProductAppStateStoreLoadResult> {
      if (state === undefined) {
        return { found: false }
      }
      return {
        found: true,
        state
      }
    },
    async save(next): Promise<void> {
      state = cloneTrustedState(next)
      saves += 1
    },
    snapshot() {
      return state
    },
    saveCount() {
      return saves
    }
  }
}

export function createNoopProductAppStateStore(): ProductAppStateStore {
  return {
    async load(): Promise<ProductAppStateStoreLoadResult> {
      return { found: false }
    },
    async save(): Promise<void> {}
  }
}

function cloneTrustedState(
  state: ProductAppTrustedStateSnapshot
): ProductAppTrustedStateSnapshot {
  return {
    ui: {
      ...(state.ui.selectedSessionId === undefined
        ? {}
        : { selectedSessionId: state.ui.selectedSessionId }),
      layout: state.ui.layout,
      mode: state.ui.mode,
      preferences: { ...state.ui.preferences }
    },
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    conversationAttachmentDrafts: Object.fromEntries(
      Object.entries(state.conversationAttachmentDrafts).map(
        ([key, attachments]) => [
          key,
          attachments.map((attachment) => ({ ...attachment }))
        ]
      )
    )
  }
}
