import type {
  OverlayHandle,
  SelectItem,
  SelectListTheme,
  TUI,
} from "@earendil-works/pi-tui"
import type {
  HomeReadModel,
  TeamConversationPageReadModel,
  TeamParticipantReadModel,
} from "@wanex/product"
import type { TuiFullScreenClient } from "../types.js"
import {
  TuiConfirmationOverlay,
  TuiSelectOverlay,
} from "../components.js"
import {
  createTeamIdempotencyKey,
  participantCanChangeState,
  participantIsCurrentCoordinator,
} from "./model.js"
import { projectTuiTeamParticipant } from "./projection.js"

export interface TuiTeamDetails {
  open(): void
  close(): void
  isOpen(): boolean
  resetSelection(conversationId: string | undefined): void
}

export function createTuiTeamDetails(options: {
  readonly tui: Pick<TUI, "showOverlay">
  readonly theme: SelectListTheme
  readonly client: Pick<
    TuiFullScreenClient,
    | "addTeamParticipant"
    | "updateTeamParticipant"
    | "setTeamCoordinator"
    | "closeTeamConversation"
  >
  readonly canOpen: () => boolean
  readonly home: () => HomeReadModel | undefined
  readonly page: () => TeamConversationPageReadModel | undefined
  readonly conversationId: () => string | undefined
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiTeamDetails {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let conversationAtOpen: string | undefined

  return {
    open() {
      if (!options.canOpen() || active) return
      const conversationId = options.conversationId()
      if (conversationId === undefined || options.page() === undefined) {
        options.rejected("Choose an open group first")
        return
      }
      active = true
      conversationAtOpen = conversationId
      showMenu(++workflow)
    },
    close,
    isOpen: () => active,
    resetSelection(conversationId) {
      if (active && conversationAtOpen !== conversationId) close()
    },
  }

  function showMenu(token: number): void {
    const page = currentPage(token)
    if (page === undefined) return
    const items: SelectItem[] = [
      {
        value: "add-agent",
        label: "Add agent",
        description: "Add an existing agent conversation",
      },
      ...page.participants.map((participant) => ({
        value: `participant:${participant.participantId}`,
        label: participant.displayName,
        description: participantDescription(page, participant),
      })),
      {
        value: "close-group",
        label: "Close group",
        description: "Stop accepting new rounds",
      },
    ]
    show(
      new TuiSelectOverlay("Group details", items, {
        selectedIndex: 0,
        theme: options.theme,
        onCancel: close,
        onSelect: (item) => {
          if (item.value === "add-agent") {
            showAddAgent(token)
          } else if (item.value === "close-group") {
            showCloseConfirmation(page, token)
          } else if (item.value.startsWith("participant:")) {
            const participant = page.participants.find(
              (candidate) => candidate.participantId === item.value.slice("participant:".length),
            )
            if (participant !== undefined) showParticipantActions(page, participant, token)
          }
        },
      }),
      token,
    )
  }

  function showAddAgent(token: number): void {
    const page = currentPage(token)
    const sessions = (options.home()?.product.sessions.recent ?? [])
      .filter((session) => session.kind === "agent")
    if (page === undefined || sessions.length === 0) {
      options.rejected("No agent conversations are available")
      showMenu(token)
      return
    }
    show(
      new TuiSelectOverlay("Add agent", sessions.map((session) => ({
        value: session.sessionId,
        label: session.title ?? "Untitled agent",
        description: `${session.status} · existing agent conversation`,
      })), {
        selectedIndex: 0,
        theme: options.theme,
        onCancel: () => showMenu(token),
        onSelect: (item) => void addAgent(item.value, token),
      }),
      token,
    )
  }

  async function addAgent(agentSessionId: string, token: number): Promise<void> {
    const conversationId = conversationAtOpen
    if (!isCurrent(token) || conversationId === undefined) return
    hide()
    await options.perform(async () => {
      const result = await options.client.addTeamParticipant({
        conversationId,
        agentSessionId,
        idempotencyKey: createTeamIdempotencyKey("participant"),
      })
      if (!isCurrent(token)) return
      if (!result.ok) {
        options.rejected(result.error.message)
        await options.refreshCanonical()
        showMenu(token)
        return
      }
      options.accepted("Agent added")
      await options.refreshCanonical()
      showMenu(token)
    })
  }

  function showParticipantActions(
    page: TeamConversationPageReadModel,
    participant: TeamParticipantReadModel,
    token: number,
  ): void {
    const currentCoordinator = participantIsCurrentCoordinator(page, participant)
    const canChangeState = participantCanChangeState(participant) && !currentCoordinator
    const items: SelectItem[] = []
    if (participant.kind === "agent" && participant.state === "active" && canChangeState) {
      items.push({
        value: "mute",
        label: "Mute agent",
        description: "Pause this agent in the group",
      })
    }
    if (participant.kind === "agent" && participant.state === "muted") {
      items.push({ value: "reactivate", label: "Reactivate agent", description: "Allow this agent to respond again" })
    }
    if (participant.kind === "agent" && participant.state !== "left") {
      items.push({
        value: currentCoordinator ? "clear-coordinator" : "set-coordinator",
        label: currentCoordinator ? "Clear coordinator" : "Set as coordinator",
        description: currentCoordinator ? "Return coordinator selection to none" : "Use this agent for coordinated rounds",
      })
      if (canChangeState) items.push({ value: "remove", label: "Remove agent", description: "Leave this agent out of future rounds" })
    }
    if (items.length === 0) {
      options.rejected(`${participant.displayName} has no available group actions`)
      showMenu(token)
      return
    }
    items.push({ value: "back", label: "Back" })
    show(
      new TuiSelectOverlay(participant.displayName, items, {
        selectedIndex: 0,
        theme: options.theme,
        onCancel: () => showMenu(token),
        onSelect: (item) => {
          if (item.value === "back") {
            showMenu(token)
          } else if (item.value === "set-coordinator" || item.value === "clear-coordinator") {
            showCoordinatorConfirmation(page, participant, item.value === "set-coordinator", token)
          } else if (item.value === "remove") {
            showRemoveConfirmation(participant, token)
          } else if (item.value === "mute" || item.value === "reactivate") {
            void updateParticipant(participant, item.value, token)
          }
        },
      }),
      token,
    )
  }

  function showCoordinatorConfirmation(
    page: TeamConversationPageReadModel,
    participant: TeamParticipantReadModel,
    assign: boolean,
    token: number,
  ): void {
    show(
      new TuiConfirmationOverlay({
        title: assign ? "Set coordinator?" : "Clear coordinator?",
        details: [
          participant.displayName,
          "The current group authority is checked again when this action is submitted.",
        ],
        theme: options.theme,
        confirmLabel: assign ? "Set coordinator" : "Clear coordinator",
        onCancel: () => showMenu(token),
        onConfirm: () => void setCoordinator(page, participant, assign, token),
      }),
      token,
    )
  }

  function showRemoveConfirmation(
    participant: TeamParticipantReadModel,
    token: number,
  ): void {
    show(
      new TuiConfirmationOverlay({
        title: "Remove agent?",
        details: [
          participant.displayName,
          "This agent will no longer participate in future rounds.",
        ],
        theme: options.theme,
        confirmLabel: "Remove agent",
        onCancel: () => showMenu(token),
        onConfirm: () => void updateParticipant(participant, "remove", token),
      }),
      token,
    )
  }

  async function setCoordinator(
    page: TeamConversationPageReadModel,
    participant: TeamParticipantReadModel,
    assign: boolean,
    token: number,
  ): Promise<void> {
    const conversationId = conversationAtOpen
    if (!isCurrent(token) || conversationId === undefined) return
    hide()
    await options.perform(async () => {
      const result = await options.client.setTeamCoordinator({
        conversationId,
        expectedCoordinatorParticipantId: page.conversation.coordinatorParticipantId ?? null,
        coordinatorParticipantId: assign ? participant.participantId : null,
      })
      if (!isCurrent(token)) return
      if (!result.ok) {
        options.rejected(result.error.message)
        await options.refreshCanonical()
        showMenu(token)
        return
      }
      options.accepted(assign ? "Coordinator updated" : "Coordinator cleared")
      await options.refreshCanonical()
      showMenu(token)
    })
  }

  async function updateParticipant(
    participant: TeamParticipantReadModel,
    action: "mute" | "reactivate" | "remove",
    token: number,
  ): Promise<void> {
    const conversationId = conversationAtOpen
    if (!isCurrent(token) || conversationId === undefined) return
    hide()
    await options.perform(async () => {
      const state = action === "mute" ? "muted" : action === "reactivate" ? "active" : "left"
      const result = await options.client.updateTeamParticipant({
        conversationId,
        participantId: participant.participantId,
        state,
      })
      if (!isCurrent(token)) return
      if (!result.ok) {
        options.rejected(result.error.message)
        await options.refreshCanonical()
        showMenu(token)
        return
      }
      options.accepted(action === "remove" ? "Agent removed" : action === "mute" ? "Agent muted" : "Agent reactivated")
      await options.refreshCanonical()
      showMenu(token)
    })
  }

  function showCloseConfirmation(page: TeamConversationPageReadModel, token: number): void {
    show(
      new TuiConfirmationOverlay({
        title: "Close group?",
        details: [page.conversation.title, "Closed groups cannot receive new rounds."],
        theme: options.theme,
        confirmLabel: "Close group",
        onCancel: () => showMenu(token),
        onConfirm: () => void closeGroup(token),
      }),
      token,
    )
  }

  async function closeGroup(token: number): Promise<void> {
    const conversationId = conversationAtOpen
    if (!isCurrent(token) || conversationId === undefined) return
    hide()
    await options.perform(async () => {
      const result = await options.client.closeTeamConversation({ conversationId })
      if (!isCurrent(token)) return
      if (!result.ok) {
        options.rejected(result.error.message)
        await options.refreshCanonical()
        showMenu(token)
        return
      }
      finish(token)
      options.accepted("Group closed")
      await options.refreshCanonical()
    })
  }

  function participantDescription(
    page: TeamConversationPageReadModel,
    participant: TeamParticipantReadModel,
  ): string {
    const coordinator = participantIsCurrentCoordinator(page, participant) ? " · coordinator" : ""
    return `${projectTuiTeamParticipant(participant)}${coordinator}`
  }

  function currentPage(token: number): TeamConversationPageReadModel | undefined {
    if (!isCurrent(token)) return undefined
    if (options.conversationId() !== conversationAtOpen) {
      close()
      return undefined
    }
    return options.page()
  }

  function show(component: Parameters<TUI["showOverlay"]>[0], token: number): void {
    if (!isCurrent(token)) return
    hide()
    overlay = options.tui.showOverlay(component, {
      width: "80%",
      minWidth: 36,
      maxHeight: "70%",
      margin: 1,
    })
  }

  function hide(): void {
    overlay?.hide()
    overlay = undefined
  }

  function finish(token: number): void {
    if (!isCurrent(token)) return
    hide()
    active = false
    workflow += 1
  }

  function close(): void {
    hide()
    active = false
    workflow += 1
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token
  }
}
