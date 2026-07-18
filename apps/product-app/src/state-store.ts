import type {
  ProductAppInitialState,
  ProductAppStateSnapshot,
  ProductAppStateStore,
  ProductAppStateStoreLoadResult
} from "./types.js"

export function createMemoryProductAppStateStore(
  initial?: ProductAppInitialState
): ProductAppStateStore & {
  snapshot(): ProductAppStateSnapshot | undefined
  saveCount(): number
} {
  let state: ProductAppStateSnapshot | undefined =
    initial === undefined ? undefined : normalizeStateSnapshot(initial)
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
      state = normalizeStateSnapshot(next)
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

function normalizeStateSnapshot(
  state: ProductAppInitialState | ProductAppStateSnapshot
): ProductAppStateSnapshot {
  const preferences = {
    theme: state.preferences?.theme ?? "system",
    density: state.preferences?.density ?? "comfortable"
  }
  return {
    ...(state.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: state.selectedSessionId }),
    layout: state.layout ?? "single",
    mode: state.mode ?? "chat",
    preferences
  }
}
