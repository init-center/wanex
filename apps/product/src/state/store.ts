import type {
  InitialState,
  StateStore,
  StateStoreLoadResult,
  TrustedStateSnapshot
} from "../model.js"
import { createState, trustedStateSnapshot } from "./product.js"

export function createMemoryStateStore(
  initial?: InitialState | TrustedStateSnapshot
): StateStore & {
  snapshot(): TrustedStateSnapshot | undefined
  saveCount(): number
} {
  let state: TrustedStateSnapshot | undefined =
    initial === undefined
      ? undefined
      : "ui" in initial
        ? cloneTrustedState(initial)
        : trustedStateSnapshot(createState(undefined, initial))
  let saves = 0

  return {
    async load(): Promise<StateStoreLoadResult> {
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

export function createNoopStateStore(): StateStore {
  return {
    async load(): Promise<StateStoreLoadResult> {
      return { found: false }
    },
    async save(): Promise<void> {}
  }
}

function cloneTrustedState(
  state: TrustedStateSnapshot
): TrustedStateSnapshot {
  return {
    ui: {
      ...(state.ui.selection === undefined
        ? {}
        : { selection: { ...state.ui.selection } }),
      ...(state.ui.selectedPlanProposalId === undefined
        ? {}
        : { selectedPlanProposalId: state.ui.selectedPlanProposalId }),
      layout: state.ui.layout,
      mode: state.ui.mode,
      preferences: { ...state.ui.preferences }
    },
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    pendingGuidedFollowUps: {
      ...state.pendingGuidedFollowUps
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
