import type {
  ConversationSelection,
  InitialState,
  Layout,
  Mode,
  RendererPreferences,
  StateSnapshot,
  StateStore,
  TrustedStateSnapshot
} from "../model.js"
import type {
  TrustedConversationOperationReference
} from "../conversation/model.js"
import type { AttachmentDraft } from "../attachments/model.js"

const defaultPreferences: RendererPreferences = {
  theme: "system",
  density: "comfortable"
}

export interface MutableState {
  selection?: ConversationSelection
  selectedPlanProposalId?: string
  layout: Layout
  mode: Mode
  preferences: RendererPreferences
  trackedConversationOperations: Record<
    string,
    TrustedConversationOperationReference
  >
  pendingGuidedFollowUps: Record<
    string,
    TrustedConversationOperationReference
  >
  conversationAttachmentDrafts: Record<
    string,
    readonly AttachmentDraft[]
  >
}

export interface StateCoordinator {
  readonly state: MutableState
  commit(next: MutableState): Promise<StateSnapshot>
  mutate<T>(
    run: (state: MutableState) => Promise<{
      readonly value: T
      readonly next?: MutableState
    }>
  ): Promise<T>
}

export function createState(
  stored: TrustedStateSnapshot | undefined,
  explicit: InitialState | undefined
): MutableState {
  const base = stored?.ui
  return {
    ...optionalSelection(explicit?.selection ?? base?.selection),
    ...optionalSelectedPlanProposal(
      explicit?.selectedPlanProposalId ?? base?.selectedPlanProposalId
    ),
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
    pendingGuidedFollowUps: {
      ...(stored?.pendingGuidedFollowUps ?? {})
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      stored?.conversationAttachmentDrafts ?? {}
    )
  }
}

export function createStateCoordinator(request: {
  readonly store: StateStore
  readonly state: MutableState
}): StateCoordinator {
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
    next: MutableState
  ): Promise<StateSnapshot> {
    const trusted = trustedStateSnapshot(next)
    await request.store.save(trusted)
    replaceState(request.state, next)
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

export function stateSnapshot(
  state: MutableState
): StateSnapshot {
  return {
    ...optionalSelection(state.selection),
    ...optionalSelectedPlanProposal(state.selectedPlanProposalId),
    layout: state.layout,
    mode: state.mode,
    preferences: { ...state.preferences }
  }
}

export function trustedStateSnapshot(
  state: MutableState
): TrustedStateSnapshot {
  return {
    ui: stateSnapshot(state),
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    pendingGuidedFollowUps: {
      ...state.pendingGuidedFollowUps
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

export function withTrackedConversationOperation(
  state: MutableState,
  reference: TrustedConversationOperationReference
): MutableState {
  return {
    ...state,
    selection: { kind: "session", sessionId: reference.sessionId },
    preferences: { ...state.preferences },
    trackedConversationOperations: {
      ...state.trackedConversationOperations,
      [reference.sessionId]: reference
    },
    pendingGuidedFollowUps: {
      ...state.pendingGuidedFollowUps
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

export function resolveSessionId(
  state: MutableState,
  requestedSessionId: string | undefined
): string | undefined {
  const sessionId = requestedSessionId ?? selectedSessionId(state)
  if (sessionId === undefined || sessionId.trim().length === 0) {
    return undefined
  }
  return sessionId
}

export function withPendingGuidedFollowUp(
  state: MutableState,
  reference: TrustedConversationOperationReference
): MutableState {
  return {
    ...copyState(state),
    pendingGuidedFollowUps: {
      ...state.pendingGuidedFollowUps,
      [reference.sessionId]: reference
    }
  }
}

export function promotePendingGuidedFollowUp(
  state: MutableState,
  sessionId: string
): MutableState {
  const pending = state.pendingGuidedFollowUps[sessionId]
  if (pending === undefined) {
    return copyState(state)
  }
  const next = copyState(state)
  next.trackedConversationOperations[sessionId] = pending
  delete next.pendingGuidedFollowUps[sessionId]
  return next
}

export function withoutPendingGuidedFollowUp(
  state: MutableState,
  sessionId: string
): MutableState {
  const next = copyState(state)
  delete next.pendingGuidedFollowUps[sessionId]
  return next
}

export function copyState(
  state: MutableState
): MutableState {
  return {
    ...state,
    ...(state.selection === undefined
      ? {}
      : { selection: { ...state.selection } }),
    preferences: { ...state.preferences },
    trackedConversationOperations: {
      ...state.trackedConversationOperations
    },
    pendingGuidedFollowUps: {
      ...state.pendingGuidedFollowUps
    },
    conversationAttachmentDrafts: cloneAttachmentDrafts(
      state.conversationAttachmentDrafts
    )
  }
}

function replaceState(
  current: MutableState,
  next: MutableState
): void {
  if (next.selection === undefined) {
    delete current.selection
  } else {
    current.selection = { ...next.selection }
  }
  if (next.selectedPlanProposalId === undefined) {
    delete current.selectedPlanProposalId
  } else {
    current.selectedPlanProposalId = next.selectedPlanProposalId
  }
  current.layout = next.layout
  current.mode = next.mode
  current.preferences = { ...next.preferences }
  current.trackedConversationOperations = {
    ...next.trackedConversationOperations
  }
  current.pendingGuidedFollowUps = {
    ...next.pendingGuidedFollowUps
  }
  current.conversationAttachmentDrafts = cloneAttachmentDrafts(
    next.conversationAttachmentDrafts
  )
}

function cloneAttachmentDrafts(
  drafts: Readonly<Record<string, readonly AttachmentDraft[]>>
): Record<string, readonly AttachmentDraft[]> {
  return Object.fromEntries(
    Object.entries(drafts).map(([key, attachments]) => [
      key,
      attachments.map((attachment) => ({ ...attachment }))
    ])
  )
}

export function selectedSessionId(
  state: Pick<MutableState, "selection">
): string | undefined {
  return state.selection?.kind === "session"
    ? state.selection.sessionId
    : undefined
}

function optionalSelection(selection: ConversationSelection | undefined): {
  readonly selection?: ConversationSelection
} {
  return selection === undefined ? {} : { selection: { ...selection } }
}

function optionalSelectedPlanProposal(proposalId: string | undefined): {
  readonly selectedPlanProposalId?: string
} {
  return proposalId === undefined ? {} : { selectedPlanProposalId: proposalId }
}
