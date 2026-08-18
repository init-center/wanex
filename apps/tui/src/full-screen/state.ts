import type {
  ConversationAttachmentsReadModel,
  ConversationHistoryReadModel,
  ConversationOperationReadModel,
  HomeReadModel,
  TeamConversationPageReadModel
} from "@wanex/product"
import type { TuiComposerMode } from "../application/conversation-actions.js"
import type { TuiFullScreenState } from "./types.js"

export interface TuiFullScreenMutableState {
  started: boolean
  stopped: boolean
  busy: boolean
  mode: TuiComposerMode
  draft: string
  attachments: ConversationAttachmentsReadModel | undefined
  home: HomeReadModel | undefined
  transcript: ConversationHistoryReadModel | undefined
  operation: ConversationOperationReadModel | undefined
  team: TeamConversationPageReadModel | undefined
  transientAssistantText: string | undefined
  statusMessage: string | undefined
  errorMessage: string | undefined
  lastEventSequence: number | undefined
}

export function createTuiFullScreenState(): TuiFullScreenMutableState {
  return {
    started: false,
    stopped: false,
    busy: false,
    mode: "submit",
    draft: "",
    attachments: undefined,
    home: undefined,
    transcript: undefined,
    operation: undefined,
    team: undefined,
    transientAssistantText: undefined,
    statusMessage: undefined,
    errorMessage: undefined,
    lastEventSequence: undefined
  }
}

export function snapshotTuiFullScreenState(
  state: TuiFullScreenMutableState
): TuiFullScreenState {
  return {
    started: state.started,
    stopped: state.stopped,
    busy: state.busy,
    mode: state.mode,
    draft: state.draft,
    ...(state.attachments === undefined
      ? {}
      : { attachments: state.attachments }),
    ...(state.home?.state.selection === undefined
      ? {}
      : { selection: { ...state.home.state.selection } }),
    ...(state.transcript === undefined ? {} : { transcript: state.transcript }),
    ...(state.operation === undefined ? {} : { operation: state.operation }),
    ...(state.team === undefined ? {} : { team: state.team }),
    ...(state.transientAssistantText === undefined
      ? {}
      : { transientAssistantText: state.transientAssistantText }),
    ...(state.statusMessage === undefined
      ? {}
      : { statusMessage: state.statusMessage }),
    ...(state.errorMessage === undefined
      ? {}
      : { errorMessage: state.errorMessage }),
    ...(state.lastEventSequence === undefined
      ? {}
      : { lastEventSequence: state.lastEventSequence })
  }
}
