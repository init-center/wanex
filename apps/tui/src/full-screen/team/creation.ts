import type {
  OverlayHandle,
  SelectListTheme,
  TUI,
} from "@earendil-works/pi-tui"
import type { TuiFullScreenClient } from "../types.js"
import { TuiInputOverlay, TuiSelectOverlay } from "../components.js"
import {
  createTeamIdempotencyKey,
  type TuiTeamDraft,
} from "./model.js"

export interface TuiTeamCreation {
  open(): void
  close(): void
  isOpen(): boolean
}

export function createTuiTeamCreation(options: {
  readonly tui: Pick<TUI, "showOverlay">
  readonly selectTheme: SelectListTheme
  readonly client: Pick<TuiFullScreenClient, "createTeamConversation">
  readonly canOpen: () => boolean
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiTeamCreation {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let title = ""

  return {
    open() {
      if (!options.canOpen() || active) return
      active = true
      const token = ++workflow
      showTitle(token)
    },
    close,
    isOpen: () => active,
  }

  function showTitle(token: number): void {
    showOverlay(
      new TuiInputOverlay({
        title: "New group",
        description: "Give this group a short title.",
        onCancel: close,
        onSubmit(value) {
          const normalized = value.trim()
          if (normalized.length === 0) return "Title is required"
          if (normalized.length > 200) return "Title must be 200 characters or fewer"
          title = normalized
          showMode(token)
          return undefined
        },
      }),
      token,
    )
  }

  function showMode(token: number): void {
    showOverlay(
      new TuiSelectOverlay("Group mode", [
        {
          value: "coordinated",
          label: "Coordinated",
          description: "One coordinator returns the public response",
        },
        {
          value: "discussion",
          label: "Discussion",
          description: "Active agents may respond to the group",
        },
      ], {
        selectedIndex: 0,
        theme: options.selectTheme,
        onCancel: () => showTitle(token),
        onSelect: (item) => {
          void create({
            title,
            mode: item.value as TuiTeamDraft["mode"],
          }, token)
        },
      }),
      token,
    )
  }

  async function create(draft: TuiTeamDraft, token: number): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.createTeamConversation({
          title: draft.title,
          mode: draft.mode,
          idempotencyKey: createTeamIdempotencyKey("conversation"),
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(result.error.message)
          showMode(token)
          return
        }
        finish(token)
        options.accepted("Group created")
        await options.refreshCanonical()
      } catch (error) {
        if (!isCurrent(token)) return
        options.rejected(errorMessage(error))
        showMode(token)
      }
    })
  }

  function showOverlay(component: Parameters<TUI["showOverlay"]>[0], token: number): void {
    if (!isCurrent(token)) return
    hideOverlay()
    overlay = options.tui.showOverlay(component, {
      width: "80%",
      minWidth: 36,
      maxHeight: "70%",
      margin: 1,
    })
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }

  function finish(token: number): void {
    if (!isCurrent(token)) return
    hideOverlay()
    active = false
    workflow += 1
  }

  function close(): void {
    hideOverlay()
    active = false
    workflow += 1
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
