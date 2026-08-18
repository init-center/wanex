import {
  Editor,
  ProcessTerminal,
  TUI,
  matchesKey
} from "@earendil-works/pi-tui"
import type {
  ConversationOperationReadModel
} from "@wanex/product"
import type { SurfaceEvent } from "@wanex/product/surface"
import {
  stopTuiConversation,
  submitTuiConversationText,
  type TuiComposerMode
} from "../application/conversation-actions.js"
import { TuiFullScreenFrame } from "./components.js"
import { switchTuiComposerMode } from "./composer-mode.js"
import {
  createTuiConversationControlManager,
  type TuiConversationControlManager
} from "./conversation-control.js"
import { readTuiFullScreenCanonical } from "./canonical.js"
import {
  createTuiCommandPalette,
  type TuiCommandPalette
} from "./command-palette.js"
import {
  createTuiAttachmentManager,
  type TuiAttachmentManager
} from "./attachments.js"
import {
  createTuiNavigation,
  type TuiNavigation
} from "./team/navigation.js"
import {
  createTuiTeamCreation,
  type TuiTeamCreation
} from "./team/creation.js"
import {
  createTuiTeamDetails,
  type TuiTeamDetails
} from "./team/details.js"
import {
  submitTuiTeamText,
  teamComposerAvailability
} from "./team/composer.js"
import {
  createTuiPlan,
  type TuiPlan
} from "./plan.js"
import {
  createTuiGoal,
  type TuiGoal
} from "./goal.js"
import {
  createTuiSideQuery,
  type TuiSideQuery
} from "./side-query.js"
import { projectTuiFullScreen } from "./projection.js"
import {
  createTuiFullScreenState,
  snapshotTuiFullScreenState
} from "./state.js"
import { createTuiStartupEventBuffer } from "./surface-event-buffer.js"
import { terminalBracketedPasteInput } from "./terminal-text.js"
import { safeErrorMessage } from "./error.js"
import { drainFullScreenWork } from "./lifecycle.js"
import {
  sessionIdFromSelection,
  teamConversationIdFromSelection
} from "../selection.js"
import {
  tuiEditorTheme as editorTheme,
  tuiSelectListTheme as selectListTheme
} from "./theme.js"
import type {
  TuiFullScreenExitReason,
  TuiFullScreenHandle,
  TuiFullScreenOptions
} from "./types.js"

export function createTuiFullScreen(
  options: TuiFullScreenOptions
): TuiFullScreenHandle {
  const terminal = options.terminal ?? new ProcessTerminal()
  const tui = new TUI(terminal)
  const editor = new Editor(tui, editorTheme, { paddingX: 1 })
  const frame = new TuiFullScreenFrame(editor, () => terminal.rows)
  const state = createTuiFullScreenState()
  let unsubscribe: (() => void) | undefined
  let inputUnsubscribe: (() => void) | undefined
  let refreshTail = Promise.resolve()
  let canonicalRefreshQueued = false
  let actionTail = Promise.resolve()
  let stopTask: Promise<void> | undefined
  let canonicalReady = false
  const startupEvents = createTuiStartupEventBuffer()
  let stopReason: TuiFullScreenExitReason = "quit"
  let resolveStopped!: (reason: TuiFullScreenExitReason) => void
  const stopped = new Promise<TuiFullScreenExitReason>((resolve) => {
    resolveStopped = resolve
  })
  let commandPalette: TuiCommandPalette | undefined
  let attachmentManager: TuiAttachmentManager | undefined
  let plan: TuiPlan | undefined
  let goal: TuiGoal | undefined
  let sideQuery: TuiSideQuery | undefined
  let conversationControl: TuiConversationControlManager | undefined
  let navigation: TuiNavigation
  let teamCreation: TuiTeamCreation | undefined
  let teamDetails: TuiTeamDetails | undefined
  teamCreation = createTuiTeamCreation({
    tui,
    selectTheme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      teamDetails?.isOpen() !== true &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    perform,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
      render()
    },
    rejected(message) {
      state.errorMessage = message
      render()
    }
  })
  teamDetails = createTuiTeamDetails({
    tui,
    theme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      currentSelection()?.kind === "team" &&
      teamCreation?.isOpen() !== true &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    home: () => state.home,
    page: () => state.team,
    conversationId: () => teamConversationIdFromSelection(currentSelection()),
    perform,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
      render()
    },
    rejected(message) {
      state.errorMessage = message
      render()
    }
  })
  navigation = createTuiNavigation({
    tui,
    theme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      conversationControl?.isOpen() !== true &&
      teamCreation?.isOpen() !== true &&
      teamDetails?.isOpen() !== true &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    home: () => state.home,
    perform,
    refreshCanonical,
    openNewGroup: () => teamCreation?.open(),
    accepted(message, clearTransient) {
      state.statusMessage = message
      if (clearTransient) state.transientAssistantText = undefined
    },
    rejected(message) {
      state.errorMessage = message
      render()
    }
  })
  commandPalette = createTuiCommandPalette({
    tui,
    theme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    perform,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
    },
    rejected(message) {
      state.errorMessage = message
    }
  })
  attachmentManager = createTuiAttachmentManager({
    tui,
    theme: selectListTheme,
    client: options.client,
    ...(options.attachmentHost === undefined
      ? {}
      : { host: options.attachmentHost }),
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      currentSelection()?.kind !== "team" &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      commandPalette?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    sessionId: currentSessionId,
    attachments: () => state.attachments,
    perform,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
    },
    rejected(message) {
      state.errorMessage = message
    }
  })
  plan = createTuiPlan({
    tui,
    terminalRows: () => terminal.rows,
    editorTheme,
    theme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      currentSelection()?.kind !== "team" &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      goal?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    sessionId: currentSessionId,
    perform,
    refreshCanonical,
    adoptOperation(result) {
      if (result?.kind === "product.conversation-operation.found") {
        adoptOperation(result.operation)
      }
    },
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
    },
    rejected(message) {
      state.errorMessage = message
    }
  })
  goal = createTuiGoal({
    tui,
    terminalRows: () => terminal.rows,
    editorTheme,
    selectTheme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      currentSelection()?.kind !== "team" &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      sideQuery?.isOpen() !== true,
    sessionId: currentSessionId,
    perform,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
    },
    rejected(message) {
      state.errorMessage = message
      render()
    }
  })
  sideQuery = createTuiSideQuery({
    tui,
    terminalRows: () => terminal.rows,
    editorTheme,
    selectTheme: selectListTheme,
    client: options.client,
    canOpen: () =>
      !state.stopped &&
      !state.busy &&
      currentSelection()?.kind !== "team" &&
      conversationControl?.isOpen() !== true &&
      !navigation.isOpen() &&
      commandPalette?.isOpen() !== true &&
      attachmentManager?.isOpen() !== true &&
      plan?.isOpen() !== true &&
      goal?.isOpen() !== true,
    sessionId: currentSessionId,
    perform,
    accepted(message) {
      state.statusMessage = message
      state.errorMessage = undefined
    },
    rejected(message) {
      state.errorMessage = message
      render()
    }
  })
  conversationControl = createTuiConversationControlManager({
    tui,
    editor,
    terminalRows: () => terminal.rows,
    editorTheme,
    selectTheme: selectListTheme,
    client: options.client,
    stopped: () => state.stopped,
    preempt() {
      navigation.close()
      commandPalette?.close()
      attachmentManager?.close()
      plan?.close()
      goal?.close()
      sideQuery?.close()
    },
    perform,
    adoptOperation,
    refreshCanonical,
    accepted(message) {
      state.statusMessage = message
    },
    rejected(message) {
      state.errorMessage = message
    }
  })

  editor.onChange = (draft) => {
    state.draft = draft
  }
  editor.onSubmit = (text) => {
    const draft = text.trim()
    const hasAttachments = (state.attachments?.attachments.length ?? 0) > 0
    if (draft.length === 0 && !hasAttachments) return
    if (currentSelection()?.kind === "team") {
      if (draft.length === 0) {
        state.errorMessage = "Group messages require text"
        render()
        return
      }
      if (hasAttachments) {
        state.errorMessage = "Attachments are available in conversations, not groups"
        render()
        return
      }
      const availability = teamComposerAvailability({
        page: state.team,
        providerCanRun: state.home?.providerReadiness.canRun === true
      })
      if (!availability.canSubmit || state.team === undefined) {
        state.errorMessage = availability.message
        render()
        return
      }
      state.draft = draft
      void perform(async () => {
        const result = await submitTuiTeamText({
          client: options.client,
          page: state.team!,
          text: draft
        })
        if (!result.accepted) {
          editor.setText(draft)
          state.draft = draft
          state.errorMessage = result.message
        } else {
          editor.addToHistory(draft)
          state.draft = ""
          state.errorMessage = undefined
          state.statusMessage = "Group message accepted"
        }
        await refreshCanonical()
      })
      return
    }
    const sessionId = currentSessionId()
    state.draft = draft
    void perform(async () => {
      const result = await submitTuiConversationText(
        {
          client: options.client,
          ...(sessionId === undefined
            ? {}
            : { sessionId }),
          ...(state.operation === undefined
            ? {}
            : { operation: state.operation }),
          hasAttachments
        },
        state.mode,
        draft
      )
      if (!result.accepted) {
        editor.setText(draft)
        state.draft = draft
        state.errorMessage = result.message ?? "Product rejected the message"
      } else {
        if (draft.length > 0) editor.addToHistory(draft)
        state.draft = ""
        state.errorMessage = undefined
        state.statusMessage =
          state.mode === "queue"
            ? "Follow-up queued"
            : state.mode === "guide"
              ? "Guidance accepted"
              : "Message accepted"
        state.mode = "submit"
        adoptOperation(result.operation)
      }
      await refreshCanonical()
    })
  }

  const handle: TuiFullScreenHandle = {
    terminal,
    state: () => snapshotTuiFullScreenState(state),
    async start() {
      if (state.started && !state.stopped) return
      if (state.stopped) {
        throw new Error("A stopped full-screen TUI handle cannot restart")
      }
      state.started = true
      tui.addChild(frame)
      tui.setFocus(editor)
      inputUnsubscribe = tui.addInputListener(handleGlobalInput)
      unsubscribe = options.client.subscribeSurfaceEvents(handleSurfaceEvent)
      terminal.setTitle("Wanex")
      tui.start()
      try {
        await refreshCanonical()
        canonicalReady = true
        const buffered = startupEvents.drain()
        if (buffered.gap) {
          await refreshCanonical()
        } else {
          for (const event of buffered.events) {
            handleSurfaceEvent(event)
          }
          await refreshTail
        }
        render()
      } catch (error) {
        await handle.stop()
        throw error
      }
    },
    async stop(reason = "quit") {
      if (stopTask === undefined) {
        stopReason = reason
        stopTask = (async () => {
          state.stopped = true
          unsubscribe?.()
          unsubscribe = undefined
          inputUnsubscribe?.()
          inputUnsubscribe = undefined
          navigation.close()
          teamCreation?.close()
          teamDetails?.close()
          commandPalette?.close()
          attachmentManager?.close()
          plan?.close()
          goal?.close()
          sideQuery?.close()
          conversationControl?.close()
          try {
            await terminal.drainInput(250, 25)
          } finally {
            try {
              tui.stop()
            } finally {
              await drainFullScreenWork([actionTail, refreshTail])
              resolveStopped(stopReason)
            }
          }
        })()
      }
      await stopTask
    },
    waitUntilStopped: () => stopped,
    async refresh() {
      await refreshCanonical()
    }
  }
  return handle

  function handleGlobalInput(
    data: string
  ): { consume?: boolean; data?: string } | undefined {
    const safeInput = terminalBracketedPasteInput(data)
    if (safeInput !== data) return { data: safeInput }
    if (matchesKey(data, "ctrl+q")) {
      void handle.stop()
      return { consume: true }
    }
    if (
      conversationControl?.isOpen() === true ||
      navigation.isOpen() ||
      teamCreation?.isOpen() === true ||
      teamDetails?.isOpen() === true ||
      commandPalette?.isOpen() === true ||
      attachmentManager?.isOpen() === true ||
      plan?.isOpen() === true ||
      goal?.isOpen() === true ||
      sideQuery?.isOpen() === true
    ) {
      return undefined
    }
    if (matchesKey(data, "ctrl+x")) {
      void perform(async () => {
        if (currentSelection()?.kind === "team") {
          state.statusMessage = "Team operation controls are not available yet"
          return
        }
        const sessionId = currentSessionId()
        const result = await stopTuiConversation({
          client: options.client,
          ...(sessionId === undefined
            ? {}
            : { sessionId }),
          ...(state.operation === undefined
            ? {}
            : { operation: state.operation })
        })
        state.statusMessage = result.accepted
          ? "Stop requested"
          : result.message ?? "Stop is unavailable"
        adoptOperation(result.operation)
        await refreshCanonical()
      })
      return { consume: true }
    }
    if (matchesKey(data, "ctrl+o")) {
      navigation.openSessionPicker()
      return { consume: true }
    }
    if (matchesKey(data, "ctrl+p")) {
      commandPalette?.open()
      return { consume: true }
    }
    if (matchesKey(data, "f2")) {
      void navigation.openModelPicker()
      return { consume: true }
    }
    if (matchesKey(data, "f3")) {
      if (currentSelection()?.kind === "team") teamDetails?.open()
      else attachmentManager?.open()
      return { consume: true }
    }
    if (matchesKey(data, "f4")) {
      plan?.open()
      return { consume: true }
    }
    if (matchesKey(data, "f5")) {
      goal?.open()
      return { consume: true }
    }
    if (matchesKey(data, "f6")) {
      sideQuery?.open()
      return { consume: true }
    }
    if (matchesKey(data, "f7")) {
      if (currentSelection()?.kind === "team") teamDetails?.open()
      else conversationControl?.openContextual()
      return { consume: true }
    }
    if (matchesKey(data, "f8")) {
      void handle.stop("provider-management")
      return { consume: true }
    }
    if (matchesKey(data, "ctrl+n")) {
      if (currentSelection()?.kind !== "team") switchMode("queue")
      return { consume: true }
    }
    if (matchesKey(data, "ctrl+g")) {
      if (currentSelection()?.kind !== "team") switchMode("guide")
      return { consume: true }
    }
    return undefined
  }

  function switchMode(mode: Exclude<TuiComposerMode, "submit">): void {
    const result = switchTuiComposerMode({
      current: state.mode,
      requested: mode,
      ...(state.operation === undefined ? {} : { operation: state.operation })
    })
    state.mode = result.mode
    state.errorMessage = result.errorMessage
    render()
  }

  function handleSurfaceEvent(event: SurfaceEvent): void {
    if (state.stopped) return
    if (!canonicalReady) {
      startupEvents.push(event)
      return
    }
    if (
      state.lastEventSequence !== undefined &&
      event.sequence <= state.lastEventSequence
    ) {
      return
    }
    if (
      state.lastEventSequence !== undefined &&
      event.sequence > state.lastEventSequence + 1
    ) {
      state.lastEventSequence = event.sequence
      state.transientAssistantText = undefined
      scheduleCanonicalRefresh()
      void plan?.reconcileActive().catch((error) => {
        state.errorMessage = safeErrorMessage(error)
        render()
      })
      void goal?.reconcileActive().catch((error) => {
        state.errorMessage = safeErrorMessage(error)
        render()
      })
      void sideQuery?.reconcileActive().catch((error) => {
        state.errorMessage = safeErrorMessage(error)
        render()
      })
      return
    }
    state.lastEventSequence = event.sequence
    if (event.type === "product.surface.command-catalog.invalidated") {
      commandPalette?.invalidate()
      scheduleCanonicalRefresh()
      return
    }
    plan?.handleInvalidation(event)
    goal?.handleInvalidation(event)
    sideQuery?.handleInvalidation(event)
    if (event.type === "product.surface.side-query.invalidated") {
      return
    }
    if (event.type === "product.surface.team.invalidated") {
      const selectedConversationId = teamConversationIdFromSelection(
        currentSelection()
      )
      if (
        selectedConversationId === undefined ||
        (event.team?.conversationId !== undefined &&
          event.team.conversationId !== selectedConversationId)
      ) {
        return
      }
      scheduleCanonicalRefresh()
      return
    }
    if (
      event.type ===
        "product.surface.conversation.assistant-text-delta" &&
      event.conversation?.kind ===
        "product.conversation.assistant-text-delta" &&
      event.conversation.sessionId === currentSessionId() &&
      event.conversation.operationId === state.operation?.operationId
    ) {
      state.transientAssistantText = `${state.transientAssistantText ?? ""}${event.conversation.text}`
      render()
      return
    }
    scheduleCanonicalRefresh()
  }

  function scheduleCanonicalRefresh(): void {
    if (canonicalRefreshQueued) return
    canonicalRefreshQueued = true
    refreshTail = refreshTail
      .then(async () => {
        canonicalRefreshQueued = false
        await refreshCanonical()
      })
      .catch((error) => {
        canonicalRefreshQueued = false
        state.errorMessage = safeErrorMessage(error)
        render()
      })
  }

  async function refreshCanonical(): Promise<void> {
    const canonical = await readTuiFullScreenCanonical({
      client: options.client
    })
    state.home = canonical.home
    teamDetails?.resetSelection(teamConversationIdFromSelection(canonical.home.state.selection))
    const sessionId = currentSessionId()
    plan?.resetSession(sessionId)
    goal?.resetSession(sessionId)
    sideQuery?.resetSession(sessionId)
    state.operation = canonical.operation
    if (state.operation?.capabilities.terminal !== false) {
      state.transientAssistantText = undefined
      state.mode = "submit"
    }
    state.transcript = canonical.transcript
    state.attachments = canonical.attachments
    state.team = canonical.team
    render()
  }

  function adoptOperation(
    operation: ConversationOperationReadModel | undefined
  ): void {
    if (operation === undefined) return
    state.operation = operation
  }

  function perform(action: () => Promise<void>): Promise<void> {
    if (state.busy || state.stopped) return Promise.resolve()
    const current = (async () => {
      state.busy = true
      state.errorMessage = undefined
      render()
      try {
        await action()
      } catch (error) {
        state.errorMessage = safeErrorMessage(error)
        if (state.draft.length > 0 && editor.getText().length === 0) {
          editor.setText(state.draft)
        }
      } finally {
        state.busy = false
        render()
      }
    })()
    actionTail = current
    return current
  }

  function render(): void {
    if (state.stopped) return
    const projection = projectTuiFullScreen({
      ...state,
      selection: currentSelection()
    })
    frame.update(projection)
    editor.disableSubmit =
      state.busy ||
      (currentSelection()?.kind === "team" &&
        !teamComposerAvailability({
          page: state.team,
          providerCanRun: state.home?.providerReadiness.canRun === true
        }).canSubmit)
    conversationControl?.synchronize(projection.approval, state.operation)
    tui.requestRender()
  }

  function currentSelection() {
    return state.home?.state.selection
  }

  function currentSessionId(): string | undefined {
    return sessionIdFromSelection(currentSelection())
  }
}
