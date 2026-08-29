import type { OverlayHandle, TUI } from "@earendil-works/pi-tui"
import type {
  ConversationApprovalItem,
  ConversationOperationReadModel
} from "@wanex/assistant"
import { resolveTuiApproval } from "../application/conversation-actions.js"
import { TuiApprovalOverlay } from "./components.js"
import type { TuiFullScreenClient } from "./types.js"

export interface TuiApprovalManager {
  synchronize(approval: ConversationApprovalItem | undefined): void
  close(): void
  isOpen(): boolean
}

export function createTuiApprovalManager(options: {
  readonly tui: Pick<TUI, "showOverlay" | "setFocus">
  readonly editor: Parameters<TUI["setFocus"]>[0]
  readonly client: Pick<
    TuiFullScreenClient,
    "resolveTrackedConversationApproval"
  >
  readonly operation: () => ConversationOperationReadModel | undefined
  readonly stopped: () => boolean
  readonly preempt: () => void
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly adoptOperation: (
    operation: ConversationOperationReadModel | undefined
  ) => void
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiApprovalManager {
  let overlay: OverlayHandle | undefined
  let approvalKey: string | undefined

  return {
    synchronize(approval) {
      if (approval !== undefined) options.preempt()
      const nextKey =
        approval === undefined
          ? undefined
          : `${approval.approvalId}:${approval.approvalRevision}`
      if (nextKey === approvalKey) return
      hideOverlay()
      approvalKey = nextKey
      const operation = options.operation()
      if (approval === undefined || operation === undefined || options.stopped()) {
        return
      }
      const component = new TuiApprovalOverlay({
        title: `${approval.tool.title} · ${approval.tool.risk}`,
        summary: approval.presentation.summary,
        details: approval.presentation.details,
        approveAvailable: approval.availableDecisions.includes("approve_once"),
        denyAvailable: approval.availableDecisions.includes("deny"),
        dismiss() {
          hideOverlay()
          approvalKey = undefined
          options.tui.setFocus(options.editor)
        },
        decide(decision) {
          void options.perform(async () => {
            const result = await resolveTuiApproval({
              client: options.client,
              operation,
              approvalId: approval.approvalId,
              expectedApprovalRevision: approval.approvalRevision,
              decision
            })
            if (!result.accepted) {
              options.rejected(
                result.message ?? "Approval decision was rejected"
              )
            } else {
              options.accepted(
                decision === "approve_once"
                  ? "Tool approved once"
                  : "Tool denied"
              )
            }
            options.adoptOperation(result.operation)
            await options.refreshCanonical()
          })
        }
      })
      overlay = options.tui.showOverlay(component, {
        width: "80%",
        minWidth: 36,
        maxHeight: "70%",
        margin: 1
      })
    },
    close() {
      hideOverlay()
      approvalKey = undefined
    },
    isOpen: () => overlay !== undefined
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }
}
