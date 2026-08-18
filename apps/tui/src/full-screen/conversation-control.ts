import type {
  EditorTheme,
  OverlayHandle,
  SelectListTheme,
  TUI
} from "@earendil-works/pi-tui"
import type {
  ConversationApprovalItem,
  ConversationOperationReadModel,
  ConversationRecoveryDecision,
  ConversationRecoveryItem,
  ReadTrackedConversationOperationResult,
  ResolveTrackedConversationRecoveryRequest
} from "@wanex/product"
import type { JsonValue } from "@wanex/protocol"
import {
  createTuiApprovalManager,
  type TuiApprovalManager
} from "./approval.js"
import { TuiConfirmationOverlay } from "./components.js"
import {
  decisionLabel,
  TuiRecoveryReviewOverlay,
  type TuiRecoveryAction
} from "./conversation-control-components.js"
import {
  TuiStructuredFormOverlay,
  type TuiStructuredFormField
} from "./structured-form.js"
import type { TuiConversationControlClient } from "./types.js"

type RecoveryFieldName = "reason" | "resultJson" | "errorJson"

export interface TuiConversationControlManager {
  synchronize(
    approval: ConversationApprovalItem | undefined,
    operation: ConversationOperationReadModel | undefined
  ): void
  openContextual(): void
  close(): void
  isOpen(): boolean
}

export function createTuiConversationControlManager(options: {
  readonly tui: TUI
  readonly editor: Parameters<TUI["setFocus"]>[0]
  readonly terminalRows: () => number
  readonly editorTheme: EditorTheme
  readonly selectTheme: SelectListTheme
  readonly client: TuiConversationControlClient
  readonly stopped: () => boolean
  readonly preempt: () => void
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly adoptOperation: (
    operation: ConversationOperationReadModel | undefined
  ) => void
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiConversationControlManager {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let operation: ConversationOperationReadModel | undefined
  let operationKey: string | undefined
  let recoveryKey: string | undefined
  let automaticallyPresentedRecoveryKey: string | undefined
  let form: TuiStructuredFormOverlay<RecoveryFieldName> | undefined

  const approval: TuiApprovalManager = createTuiApprovalManager({
    tui: options.tui,
    editor: options.editor,
    client: options.client,
    operation: () => operation,
    stopped: options.stopped,
    preempt() {
      closeContextual()
      options.preempt()
    },
    perform: options.perform,
    adoptOperation: options.adoptOperation,
    refreshCanonical: options.refreshCanonical,
    accepted: options.accepted,
    rejected: options.rejected
  })

  return {
    synchronize(nextApproval, nextOperation) {
      const nextOperationKey = operationIdentityKey(nextOperation)
      if (operationKey !== nextOperationKey && active) closeContextual()
      operation = nextOperation
      operationKey = nextOperationKey

      const nextRecoveryKey = recoveryIdentityKey(nextOperation)
      if (recoveryKey !== nextRecoveryKey) {
        if (active) closeContextual()
        recoveryKey = nextRecoveryKey
        form = undefined
      }

      if (nextApproval !== undefined) {
        approval.synchronize(nextApproval)
        return
      }
      approval.synchronize(undefined)
      if (
        nextRecoveryKey !== undefined &&
        automaticallyPresentedRecoveryKey !== nextRecoveryKey &&
        !options.stopped()
      ) {
        automaticallyPresentedRecoveryKey = nextRecoveryKey
        options.preempt()
        openRecovery()
      }
    },
    openContextual() {
      if (active || approval.isOpen() || options.stopped()) return
      if (recoveryItems(operation).length > 0) {
        openRecovery()
        return
      }
      if (operation?.capabilities.regeneratable === true) {
        openRegeneration()
      }
    },
    close() {
      approval.close()
      closeContextual()
    },
    isOpen: () => approval.isOpen() || active
  }

  function openRecovery(): void {
    const items = recoveryItems(operation)
    if (items.length === 0) return
    active = true
    const token = ++workflow
    showRecoveryReview(items, token)
  }

  function showRecoveryReview(
    items: readonly ConversationRecoveryItem[],
    token: number
  ): void {
    showOverlay(
      new TuiRecoveryReviewOverlay({
        items,
        terminalRows: options.terminalRows,
        theme: options.selectTheme,
        onAction: (action) => showRecoveryForm(action, token),
        onCancel: closeContextual
      }),
      token
    )
  }

  function showRecoveryForm(
    action: TuiRecoveryAction,
    token: number
  ): void {
    if (!isCurrent(token)) return
    form = new TuiStructuredFormOverlay({
      tui: options.tui,
      theme: options.editorTheme,
      title: `${decisionLabel(action.decision)}: ${action.item.tool.title}`,
      fields: recoveryFields(action.decision),
      terminalRows: options.terminalRows,
      onCancel: () => showRecoveryReview(recoveryItems(operation), token),
      onComplete: (values) => showRecoveryConfirmation(action, values, token)
    })
    showOverlay(form, token)
  }

  function showRecoveryConfirmation(
    action: TuiRecoveryAction,
    values: Readonly<Record<RecoveryFieldName, string>>,
    token: number
  ): void {
    if (!isCurrent(token)) return
    const request = recoveryRequest(operation, action, values)
    showOverlay(
      new TuiConfirmationOverlay({
        title: `${decisionLabel(action.decision)}?`,
        details: [
          `Tool: ${action.item.tool.title}`,
          `Decision: ${decisionLabel(action.decision)}`,
          `Reason: ${request.reason}`,
          ...(request.content === undefined ? [] : ["Observed result JSON supplied"]),
          ...(request.error === undefined ? [] : ["Observed error JSON supplied"])
        ],
        theme: options.selectTheme,
        confirmLabel: decisionLabel(action.decision),
        onConfirm: () => void submitRecovery(request, token),
        onCancel: () => {
          if (form !== undefined) showOverlay(form, token)
        }
      }),
      token
    )
  }

  async function submitRecovery(
    request: ResolveTrackedConversationRecoveryRequest,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.resolveTrackedConversationRecovery(request)
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectRecovery(token)
          return
        }
        const value = result.value
        if (value.kind === "product.conversation-operation.rejected") {
          options.adoptOperation(value.operation)
          rejectRecovery(token)
          return
        }
        options.adoptOperation(foundOperation(value.operation))
        options.accepted(`${decisionLabel(value.decision)} accepted`)
        closeContextual()
        await options.refreshCanonical()
      } catch {
        if (isCurrent(token)) rejectRecovery(token)
      }
    })
  }

  function rejectRecovery(token: number): void {
    options.rejected("Recovery decision was rejected")
    if (form !== undefined) showOverlay(form, token)
    else showRecoveryReview(recoveryItems(operation), token)
  }

  function openRegeneration(): void {
    const current = operation
    if (current === undefined || !current.capabilities.regeneratable) return
    active = true
    const token = ++workflow
    showOverlay(
      new TuiConfirmationOverlay({
        title: "Regenerate response?",
        details: [
          `Current state: ${current.state}`,
          ...(current.error?.category === "capacity"
            ? ["Use F2 before regeneration to select a different model if needed."]
            : []),
          "Wanex will start one fresh operation from the canonical user request."
        ],
        theme: options.selectTheme,
        confirmLabel: "Regenerate",
        onConfirm: () => void regenerate(current, token),
        onCancel: closeContextual
      }),
      token
    )
  }

  async function regenerate(
    current: ConversationOperationReadModel,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.regenerateTrackedConversationOperation({
          sessionId: current.sessionId
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectRegeneration(current, token)
          return
        }
        if (result.value.kind === "product.conversation-operation.rejected") {
          options.adoptOperation(result.value.operation)
          rejectRegeneration(current, token)
          return
        }
        options.adoptOperation(result.value.operation)
        options.accepted("Conversation regeneration started")
        closeContextual()
        await options.refreshCanonical()
      } catch {
        if (isCurrent(token)) rejectRegeneration(current, token)
      }
    })
  }

  function rejectRegeneration(
    current: ConversationOperationReadModel,
    token: number
  ): void {
    options.rejected("Conversation regeneration was rejected")
    if (!isCurrent(token)) return
    operation = current
    openRegenerationConfirmation(current, token)
  }

  function openRegenerationConfirmation(
    current: ConversationOperationReadModel,
    token: number
  ): void {
    showOverlay(
      new TuiConfirmationOverlay({
        title: "Regenerate response?",
        details: [
          `Current state: ${current.state}`,
          "The previous regeneration request was rejected."
        ],
        theme: options.selectTheme,
        confirmLabel: "Try regeneration again",
        onConfirm: () => void regenerate(current, token),
        onCancel: closeContextual
      }),
      token
    )
  }

  function showOverlay(
    component: Parameters<TUI["showOverlay"]>[0],
    token: number
  ): void {
    if (!isCurrent(token)) return
    hideOverlay()
    overlay = options.tui.showOverlay(component, {
      width: "88%",
      minWidth: 40,
      maxHeight: "82%",
      margin: 1
    })
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }

  function closeContextual(): void {
    hideOverlay()
    active = false
    workflow += 1
    form = undefined
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token
  }
}

function recoveryFields(
  decision: ConversationRecoveryDecision
): readonly TuiStructuredFormField<RecoveryFieldName>[] {
  const confirmation =
    decision === "confirm_succeeded" || decision === "confirm_failed"
  return [
    {
      name: "reason",
      label: "Reason",
      initialValue: "operator recovery decision",
      validate: validateReason
    },
    ...(confirmation
      ? [
          {
            name: "resultJson" as const,
            label: "Observed result JSON",
            initialValue: "{}",
            validate: validateResultJson
          }
        ]
      : []),
    ...(decision === "confirm_failed"
      ? [
          {
            name: "errorJson" as const,
            label: "Observed error JSON",
            initialValue: '{"error":"confirmed failure"}',
            validate: validateErrorJson
          }
        ]
      : [])
  ]
}

function recoveryRequest(
  operation: ConversationOperationReadModel | undefined,
  action: TuiRecoveryAction,
  values: Readonly<Record<RecoveryFieldName, string>>
): ResolveTrackedConversationRecoveryRequest {
  if (operation === undefined) throw new Error("Recovery operation is unavailable")
  const confirmation =
    action.decision === "confirm_succeeded" ||
    action.decision === "confirm_failed"
  return {
    sessionId: operation.sessionId,
    recoveryId: action.item.recoveryId,
    expectedRecoveryRevision: action.item.recoveryRevision,
    decision: action.decision,
    reason: values.reason.trim(),
    ...(confirmation
      ? { content: [{ type: "json", value: parseJson(values.resultJson) }] }
      : {}),
    ...(action.decision === "confirm_failed"
      ? { error: parseJson(values.errorJson) }
      : {})
  }
}

function validateReason(value: string): string | undefined {
  const reason = value.trim()
  if (reason.length === 0) return "reason is required"
  return utf8Length(reason) > 4_096 ? "reason must not exceed 4096 bytes" : undefined
}

function validateResultJson(value: string): string | undefined {
  return validateJsonBytes(value, (parsed) => [{ type: "json", value: parsed }])
}

function validateErrorJson(value: string): string | undefined {
  return validateJsonBytes(value, (parsed) => parsed)
}

function validateJsonBytes(
  value: string,
  canonicalValue: (parsed: JsonValue) => JsonValue | readonly unknown[]
): string | undefined {
  try {
    const parsed = parseJson(value)
    return utf8Length(JSON.stringify(canonicalValue(parsed))) > 32_768
      ? "JSON must not exceed 32768 bytes"
      : undefined
  } catch {
    return "valid JSON is required"
  }
}

function parseJson(value: string): JsonValue {
  return JSON.parse(value) as JsonValue
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function recoveryItems(
  operation: ConversationOperationReadModel | undefined
): readonly ConversationRecoveryItem[] {
  return operation?.state === "recovery_required"
    ? operation.recovery?.items ?? []
    : []
}

function recoveryIdentityKey(
  operation: ConversationOperationReadModel | undefined
): string | undefined {
  const items = recoveryItems(operation)
  if (items.length === 0) return undefined
  return items.map((item) => `${item.recoveryId}:${item.recoveryRevision}`).join("|")
}

function operationIdentityKey(
  operation: ConversationOperationReadModel | undefined
): string | undefined {
  return operation === undefined
    ? undefined
    : `${operation.sessionId}:${operation.operationId}:${operation.updatedAt}`
}

function foundOperation(
  value: ReadTrackedConversationOperationResult
): ConversationOperationReadModel | undefined {
  return value.kind === "product.conversation-operation.found"
    ? value.operation
    : undefined
}
