import type {
  Component,
  OverlayHandle,
  SelectItem,
  SelectListTheme,
  TUI,
} from "@earendil-works/pi-tui"
import { SelectList } from "@earendil-works/pi-tui"
import type { HomeReadModel, TeamConversationSummary } from "@wanex/assistant"
import type { TuiFullScreenClient } from "../types.js"
import { TuiSelectOverlay } from "../components.js"
import { selectedSessionId, teamConversationIdFromSelection } from "../../selection.js"

const NEW_CONVERSATION = "new-conversation"
const NEW_GROUP = "new-group"

export interface TuiNavigation {
  openSessionPicker(): void
  openModelPicker(): Promise<void>
  close(): void
  isOpen(): boolean
}

export function createTuiNavigation(options: {
  readonly tui: Pick<TUI, "showOverlay" | "requestRender">
  readonly theme: SelectListTheme
  readonly client: Pick<
    TuiFullScreenClient,
    | "selectSession"
    | "startNewConversation"
    | "listModelEndpoints"
    | "setActiveModelEndpoint"
    | "listTeamConversations"
    | "selectTeamConversation"
  >
  readonly canOpen: () => boolean
  readonly home: () => HomeReadModel | undefined
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly openNewGroup: () => void
  readonly accepted: (message: string, clearTransient: boolean) => void
  readonly rejected: (message: string) => void
}): TuiNavigation {
  let overlay: OverlayHandle | undefined
  let conversationPicker: TuiConversationPicker | undefined

  return {
    openSessionPicker() {
      if (!options.canOpen() || overlay !== undefined) return
      const picker = showConversationPicker()
      void options.client.listTeamConversations({ state: "open", limit: 100 })
        .then((teamResult) => {
          if (!isPickerOpen(picker)) return
          if (!teamResult.ok) {
            options.rejected(teamResult.error.message)
            return
          }
          picker.setTeams(teamResult.value.conversations)
          options.tui.requestRender()
        })
        .catch((error) => {
          if (isPickerOpen(picker)) options.rejected(errorMessage(error))
        })
    },
    async openModelPicker() {
      if (!options.canOpen() || overlay !== undefined) return
      await options.perform(async () => {
        const endpoints = expectSurfaceValue(
          await options.client.listModelEndpoints(),
          "listModelEndpoints",
        )
        if (endpoints.endpoints.length === 0) {
          options.rejected("No model endpoints configured")
          return
        }
        const items: SelectItem[] = endpoints.endpoints.map((endpoint) => ({
          value: endpoint.id,
          label: `${endpoint.id === endpoints.activeEndpointId ? "* " : ""}${endpoint.model.id}`,
          description: `${endpoint.connection.providerId} · ${endpoint.credentialConfigured ? "configured" : "credential required"}`,
        }))
        const selectedIndex = Math.max(
          0,
          endpoints.endpoints.findIndex(
            (endpoint) => endpoint.id === endpoints.activeEndpointId,
          ),
        )
        showPicker("Models", items, selectedIndex, (item) => {
          close()
          void options.perform(async () => {
            expectSurfaceValue(
              await options.client.setActiveModelEndpoint({ endpointId: item.value }),
              "setActiveModelEndpoint",
            )
            options.accepted("Model selected", false)
            await options.refreshCanonical()
          })
        })
      })
    },
    close,
    isOpen: () => overlay !== undefined,
  }

  function showConversationPicker(): TuiConversationPicker {
    const home = options.home()
    const selection = home?.state.selection
    const selectedSession = selectedSessionId(home?.state)
    const selectedTeam = teamConversationIdFromSelection(selection)
    const sessions = home?.assistant.sessions.recent ?? []
    const items: SelectItem[] = [
      { value: NEW_CONVERSATION, label: "New conversation", description: "Start with an empty composer" },
      ...sessions.map((session) => ({
        value: `session:${session.sessionId}`,
        label: `${session.sessionId === selectedSession ? "* " : ""}${session.title ?? "Untitled conversation"}`,
        description: `${session.status} · ${session.kind}`,
      })),
      { value: NEW_GROUP, label: "New group", description: "Coordinate or discuss with agents" },
    ]
    const sessionOffset = 1
    const currentIndex = selectedSession === undefined
      ? selectedTeam === undefined
        ? 0
        : sessionOffset + sessions.length
        : Math.max(0, sessionOffset + sessions.findIndex((session) => session.sessionId === selectedSession))
    const selectedValue = selectedSession === undefined
      ? selectedTeam === undefined ? NEW_CONVERSATION : `team:${selectedTeam}`
      : `session:${selectedSession}`
    const picker = new TuiConversationPicker(
      items,
      currentIndex,
      selectedValue,
      options.theme,
      (item) => {
        close()
        if (item.value === NEW_GROUP) {
          options.openNewGroup()
          return
        }
        void options.perform(async () => {
          if (item.value === NEW_CONVERSATION) {
            expectSurfaceValue(await options.client.startNewConversation(), "startNewConversation")
            options.accepted("New conversation ready", true)
          } else if (item.value.startsWith("team:")) {
            expectSurfaceValue(
              await options.client.selectTeamConversation({ conversationId: item.value.slice("team:".length) }),
              "selectTeamConversation",
            )
            options.accepted("Group selected", true)
          } else {
            expectSurfaceValue(
              await options.client.selectSession({ sessionId: item.value.slice("session:".length) }),
              "selectSession",
            )
            options.accepted("Conversation selected", true)
          }
          await options.refreshCanonical()
        })
      },
      close,
    )
    conversationPicker = picker
    overlay = options.tui.showOverlay(picker, {
      width: "80%",
      minWidth: 36,
      maxHeight: "70%",
      margin: 1,
    })
    return picker
  }

  function isPickerOpen(picker: TuiConversationPicker): boolean {
    return overlay !== undefined && conversationPicker === picker
  }

  function showPicker(
    title: string,
    items: readonly SelectItem[],
    selectedIndex: number,
    onSelect: (item: SelectItem) => void,
  ): void {
    overlay = options.tui.showOverlay(
      new TuiSelectOverlay(title, items, {
        selectedIndex,
        theme: options.theme,
        onSelect,
        onCancel: close,
      }),
      { width: "80%", minWidth: 36, maxHeight: "70%", margin: 1 },
    )
  }

  function close(): void {
    overlay?.hide()
    overlay = undefined
    conversationPicker = undefined
  }
}

class TuiConversationPicker implements Component {
  private list: SelectList
  private readonly baseItems: readonly SelectItem[]
  private userMoved = false

  constructor(
    items: readonly SelectItem[],
    selectedIndex: number,
    private readonly selectedValue: string,
    private readonly theme: SelectListTheme,
    private readonly onSelect: (item: SelectItem) => void,
    private readonly onCancel: () => void,
  ) {
    this.baseItems = items
    this.list = this.createList(items, selectedIndex)
  }

  setTeams(
    teams: readonly TeamConversationSummary[],
  ): void {
    const existing = this.list.getSelectedItem()?.value
    const items = [
      ...this.baseItems,
      ...teams.map((team) => ({
        value: `team:${team.conversationId}`,
        label: `${this.selectedValue === `team:${team.conversationId}` ? "* " : ""}${team.title}`,
        description: `Group · ${team.mode}${team.activeRound ? " · round in progress" : ""}`,
      })),
    ]
    const targetValue = this.userMoved ? existing : this.selectedValue
    const selectedIndex = Math.max(0, items.findIndex((item) => item.value === targetValue))
    this.list = this.createList(items, selectedIndex)
  }

  invalidate(): void {
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, width)
    return [
      "Conversations",
      "",
      ...this.list.render(safeWidth),
      "",
      "Up/Down choose | Enter confirm | Esc cancel",
    ]
  }

  handleInput(data: string): void {
    this.list.handleInput(data)
  }

  private createList(items: readonly SelectItem[], selectedIndex: number): SelectList {
    const list = new SelectList([...items], 8, this.theme)
    list.setSelectedIndex(selectedIndex)
    list.onSelect = this.onSelect
    list.onCancel = this.onCancel
    list.onSelectionChange = () => {
      this.userMoved = true
    }
    return list
  }

}

function expectSurfaceValue<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } },
  command: string,
): T {
  if (!result.ok) throw new Error(`${command} failed: ${result.error.message}`)
  return result.value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
